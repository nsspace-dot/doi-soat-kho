'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const KhoInput = require('../js/core/kho-input.js');
const { wbFromAoa } = require('./helpers.js');

const ZALO = [
  '[20/10/2026 09:15:02] Kho Hà Nội: Gửi mã hàng hoàn',
  '[QR]: SPXVN012345678901',
  '[C128] 862330123456',
  '[QR]: vngh-1234-5678',
  'Chú thích lung tung không phải mã',
  '[21/10/26 14:00:00] Bạn B: tiếp',
  '"Symbology","Code","Timestamp","Date"',
  '"QR","GYABC123","1729500000000","21/10/2026, 14:00"',
  '"C128","862330123456","1729500000001","21/10/2026, 14:01"',
  '""',
  '[C128]: AB'
].join('\n');

test('Zalo: tách [QR] / [C128] / CSV / tiêu đề Zalo', () => {
  const { entries, skipped } = KhoInput.parseZalo(ZALO);
  assert.deepEqual(entries.map((e) => e.code),
    ['SPXVN012345678901', '862330123456', 'VNGH12345678', 'GYABC123', '862330123456']);
  assert.equal(entries[0].symb, 'QR');
  assert.equal(entries[1].symb, 'C128');
  assert.equal(entries[0].sender, 'Kho Hà Nội');
  assert.equal(entries[0].date, '20/10/2026');
  assert.equal(entries[3].date, '21/10/2026');   // ngày từ khối CSV
  assert.equal(entries[3].sender, 'Bạn B');      // năm 2 số -> 20xx
  assert.equal(entries[2].raw, 'vngh-1234-5678');
  // Dòng tiêu đề CSV và '""' bị bỏ qua lặng lẽ; dòng rác và mã quá ngắn vào "không nhận diện".
  assert.deepEqual(skipped, ['Chú thích lung tung không phải mã', '[C128]: AB']);
});

test('Zalo: chuẩn hoá ngày d/m/yyyy giống công cụ gốc', () => {
  assert.equal(KhoInput.normalizeDate('05/09/26'), '5/9/2026');
  assert.equal(KhoInput.normalizeDate('xx'), 'xx');
});

test('Gộp trùng: giữ lần xuất hiện đầu tiên, đếm số trùng, đánh dấu mã sai', () => {
  const { entries } = KhoInput.parseZalo(ZALO + '\n[QR]: ABC');
  const res = KhoInput.combine(entries);
  assert.equal(res.dupCount, 1);
  assert.equal(res.rows.length, 5);
  assert.equal(res.rows[1].symb, 'C128'); // lần đầu là [C128], không phải dòng CSV
  const bad = res.rows.find((r) => r.code === 'ABC');
  assert.equal(bad.valid, false);       // 3 ký tự: hiện ra nhưng không được gửi
  assert.equal(res.invalidCount, 1);
  const items = KhoInput.toUploadItems(res.rows);
  assert.equal(items.length, 4);
  assert.ok(items.every((i) => i.ma && i.goc && !('ngay' in i)), 'mã từ Zalo không mang ngày quét');
});

test('Gộp trùng giữa tin nhắn Zalo và file Excel', () => {
  const z = KhoInput.parseZalo('[QR]: 862330123456').entries;
  const f = KhoInput.parseKhoSheet(
    wbFromAoa([['Mã vận đơn'], ['862330123456'], ['VTPVN99887766']]).Sheets.Sheet1, 'kho.xlsx').entries;
  const res = KhoInput.combine(z.concat(f));
  assert.deepEqual(res.rows.map((r) => r.code), ['862330123456', 'VTPVN99887766']);
  assert.equal(res.dupCount, 1);
});

test('File quét mã vạch: tiêu đề ở dòng 3, chỉ đọc cột Code, bỏ Timestamp/Date', () => {
  const wb = wbFromAoa([
    ['Báo cáo quét mã'], [],
    ['Symbology', 'Code', 'Timestamp', 'Date'],
    ['QR', '862330123456', 1729500000000, '21/10/2026'],
    ['QR', 'SPXVN0001112223', 1729500000001, '21/10/2026'],
    ['QR', 'mô tả có khoảng trắng', '', '']
  ]);
  const res = KhoInput.parseKhoSheet(wb.Sheets.Sheet1, 'scan.xlsx');
  assert.deepEqual(res.entries.map((e) => e.code), ['862330123456', 'SPXVN0001112223']);
  assert.equal(res.keepDates, false);
  assert.ok(res.entries.every((e) => !e.keepDate));
});

test('File sổ mã / kho cũ (có "Số ngày tồn"): giữ ngày đối soát để chuyển sang kho chung', () => {
  const wb = wbFromAoa([
    ['STT', 'Mã vận đơn', 'Nghi thuộc sàn', 'Ngày đối soát', 'Số ngày tồn'],
    [1, '862330123456', 'Dùng chung', '03/10/2026', 24],
    [2, 'GYABC123', 'Shopee', 46300, 5]
  ]);
  const res = KhoInput.parseKhoSheet(wb.Sheets.Sheet1, 'So_ma.xlsx');
  assert.equal(res.keepDates, true);
  assert.equal(res.entries[0].keepDate, '03/10/2026');
  assert.match(res.entries[1].keepDate, /^\d{2}\/\d{2}\/\d{4}$/); // số serial Excel -> dd/mm/yyyy
  const items = KhoInput.toUploadItems(KhoInput.combine(res.entries).rows);
  assert.equal(items[0].ngay, '03/10/2026');
});

test('Từ chối nạp file đơn thiếu của sàn vào kho', () => {
  const wb = wbFromAoa([
    ['Tuần đối soát', 'KHO', 'Mã vận đơn', 'Gian hàng Shopee', 'Loại tệp tin', 'Tên sản phẩm', 'Phân loại'],
    ['Tuần 44/2026', '', '862330123456', 'Shop A', 'x', 'y', 'z']
  ]);
  const res = KhoInput.parseKhoSheet(wb.Sheets.Sheet1, 'mau.xlsx');
  assert.ok(res.error && /tab Shopee hoặc TikTok/.test(res.error));
});

test('Mã 12 số dạng số trong Excel không bị đọc thành dạng khoa học', () => {
  const wb = wbFromAoa([['Code'], [862330123456], ['8.62330123456E+11']]);
  const res = KhoInput.parseKhoSheet(wb.Sheets.Sheet1, 'k.xlsx');
  assert.deepEqual(res.entries.map((e) => e.code), ['862330123456', '862330123456']);
});
