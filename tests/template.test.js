'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Template = require('../js/core/template.js');
const Common = require('../js/core/common.js');
const ShopeeCore = require('../js/core/shopee-core.js');
const TikTokCore = require('../js/core/tiktok-core.js');
const { XLSX, wbFromAoa, roundTrip, writeBuffer, zipFile, kho } = require('./helpers.js');

const D = new Date(2026, 9, 27); // 27/10/2026

test('Bộ cột đúng thứ tự, cột 4 đổi tên theo sàn', () => {
  assert.deepEqual(Template.columns('shopee'),
    ['Tuần đối soát', 'KHO', 'Mã vận đơn', 'Gian hàng Shopee', 'Loại tệp tin', 'Tên sản phẩm', 'Phân loại']);
  assert.deepEqual(Template.columns('tiktok'),
    ['Tuần đối soát', 'KHO', 'Mã vận đơn', 'Gian hàng TikTok', 'Loại tệp tin', 'Tên sản phẩm', 'Phân loại']);
});

test('Tuần ISO', () => {
  assert.equal(Common.isoWeekLabel(D), 'Tuần 44/2026');
  assert.equal(Common.isoWeekLabel(new Date(2021, 0, 1)), 'Tuần 53/2020');
  assert.equal(Common.isoWeekLabel(new Date(2024, 11, 30)), 'Tuần 1/2025');
});

for (const platform of ['shopee', 'tiktok']) {
  test('File mẫu ' + platform + ': tiêu đề + đúng 1 dòng ví dụ, cột mã khoá Text', () => {
    const wb = Template.buildTemplateWorkbook(platform, D);
    const back = roundTrip(wb);
    const ws = back.Sheets[back.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' })
      .filter((r) => r.some((v) => v !== ''));
    assert.equal(rows.length, 2);
    assert.deepEqual(rows[0], Template.columns(platform));
    assert.equal(rows[1][0], 'Tuần 44/2026');
    assert.equal(rows[1][1], '');
    assert.equal(rows[1][2], '012345678901');
    assert.equal(ws.C2.t, 's');
    assert.equal(ws.C2.z, '@');
    assert.equal(ws.C50.z, '@', 'dòng trống bên dưới cũng định dạng Text để gõ tay');
  });
}

test('Mã 12 số trong file xuất: ô kiểu chữ + numFmt 49 (Text) để Excel không đổi thành 8.6233E+11', () => {
  const wb = Template.buildExportWorkbook('tiktok', [{ tid: '862330123456', shop: 'G', typeLabel: 'Giao không thành công', prod: 'P', variant: 'V' }], D);
  const buf = writeBuffer(wb);
  const sheet = zipFile(buf, 'xl/worksheets/sheet1.xml');
  const cell = sheet.match(/<c r="C2"[^>]*>.*?<\/c>/)[0];
  assert.match(cell, /t="(str|s|inlineStr)"/);
  assert.ok(!/t="n"/.test(cell));
  const s = +cell.match(/ s="(\d+)"/)[1];
  const xfs = zipFile(buf, 'xl/styles.xml').match(/<cellXfs[^>]*>(.*?)<\/cellXfs>/)[1].match(/<xf [^>]*\/?>/g);
  assert.match(xfs[s], /numFmtId="49"/);
});

for (const platform of ['shopee', 'tiktok']) {
  test('Xuất "Sàn báo, kho chưa nhận" ' + platform + ': đúng bộ cột, tuần ISO, KHO trống', () => {
    const recs = [
      { tid: '862330123456', shop: 'Gian A', typeLabel: 'Loại 1', prod: 'Lịch', variant: 'Đỏ' },
      { tid: 'SPXVN0001', shop: 'Gian B', typeLabel: 'Loại 2', prod: '', variant: '' }
    ];
    const back = roundTrip(Template.buildExportWorkbook(platform, recs, D));
    const rows = XLSX.utils.sheet_to_json(back.Sheets[back.SheetNames[0]], { header: 1, defval: '' });
    assert.deepEqual(rows[0], Template.columns(platform));
    assert.deepEqual(rows[1], ['Tuần 44/2026', '', '862330123456', 'Gian A', 'Loại 1', 'Lịch', 'Đỏ']);
    assert.equal(rows.length, 3);
    assert.ok(!rows[0].includes('Ghi chú / Lý do'));
  });
}

function filledTemplate(platform, rows) {
  return wbFromAoa([Template.columns(platform),
    ['Tuần 44/2026', '', '012345678901', '(Ví dụ) Tên gian hàng', 'x', 'y', 'z']].concat(rows));
}

test('Nạp lại file mẫu đã điền ở tab Shopee (nhận cả tên cột TikTok), KHO đọc nguyên văn', () => {
  for (const name of ['shopee', 'tiktok']) {
    const wb = filledTemplate(name, [
      ['Tuần 43/2026', 'Kho HN đã tìm thấy, chờ nhập', '862330000001', 'Gian A', 'Khiếu nại trả hàng', 'Lịch', 'Đỏ'],
      ['Tuần 43/2026', '', '862330000077', 'Gian B', 'Đơn hàng (hủy / giao KTC)', 'Áo', 'M']
    ]);
    const res = ShopeeCore.match({ files: [{ wb, kind: 'don', shop: 'tên file' }], khoItems: kho(['862330000001']) });
    assert.equal(res.records.length, 2, 'dòng ví dụ bị bỏ qua');
    assert.equal(res.records[0].kho, 'Kho HN đã tìm thấy, chờ nhập');
    assert.equal(res.records[0].shop, 'Gian A');
    assert.equal(res.records[0].kind, 'exported');
    assert.deepEqual(res.toRemove, ['862330000001']);
    assert.deepEqual(res.missA.map((r) => r.tid), ['862330000077']);
    assert.equal(ShopeeCore.typeLabel(res.missA[0]), 'Đơn hàng (hủy / giao KTC)');
  }
});

test('Nạp lại file mẫu ở tab TikTok (nhận cả tên cột Shopee), vẫn lọc SPXVN', () => {
  for (const name of ['shopee', 'tiktok']) {
    const wb = filledTemplate(name, [
      ['Tuần 43/2026', 'ghi tay', '862330000002', 'Gian T', 'Giao không thành công', 'Lịch', 'Xanh'],
      ['Tuần 43/2026', '', 'SPXVN00000004', 'Gian T', 'Giao không thành công', '', '']
    ]);
    const res = TikTokCore.match({ files: [{ wb, shop: 'x', ftype: 'tra' }],
      khoItems: kho(['862330000002', 'SPXVN00000004']), filterOther: true });
    assert.equal(res.records.length, 1);
    assert.equal(res.records[0].kho, 'ghi tay');
    assert.equal(res.records[0].variant, 'Xanh');
    assert.deepEqual(res.toRemove, ['862330000002']);
    assert.ok(res.filteredIds.has('SPXVN00000004'));
  }
});

test('Vẫn nhận file xuất CŨ của tool gốc (TikTok và Shopee)', () => {
  const oldTT = wbFromAoa([
    ['STT', 'Mã vận đơn', 'Gian hàng TikTok', 'Loại tệp tin', 'Tên sản phẩm', 'Phân loại', 'Ghi chú / Lý do'],
    [1, '862330000002', 'Gian cũ', 'Giao không thành công', 'Lịch', 'Đỏ', '']
  ]);
  const tt = TikTokCore.match({ files: [{ wb: oldTT, shop: 'f', ftype: 'exported' }], khoItems: [], filterOther: true });
  assert.deepEqual(tt.records.map((r) => [r.tid, r.shop, r.typeLabel]), [['862330000002', 'Gian cũ', 'Giao không thành công']]);

  const oldSP = wbFromAoa([
    ['STT', 'Mã vận đơn', 'Gian hàng', 'Loại tệp', 'Mã đơn hàng', 'Tên sản phẩm', 'Tỉnh/Thành', 'Tổng giá trị', 'Ghi chú / Lý do'],
    [1, '862330000001', 'Gian SP cũ', 'Khiếu nại trả hàng', 'DH1', 'Áo', 'HN', 1000, '']
  ]);
  const sp = ShopeeCore.match({ files: [{ wb: oldSP, kind: 'don', shop: 'f' }], khoItems: [] });
  assert.deepEqual(sp.records.map((r) => [r.tid, r.shop, r.typeLabel]), [['862330000001', 'Gian SP cũ', 'Khiếu nại trả hàng']]);
});

test('Xuất rồi nạp lại: mã 12 số bắt đầu bằng 0 giữ nguyên', () => {
  const wb = roundTrip(Template.buildExportWorkbook('tiktok', [{ tid: '012345678999', shop: 'G' }], D));
  const res = TikTokCore.match({ files: [{ wb, shop: 'f', ftype: 'exported' }], khoItems: [] });
  assert.equal(res.records[0].tid, '012345678999');
});
