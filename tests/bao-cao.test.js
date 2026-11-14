'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const BaoCao = require('../js/core/bao-cao.js');

const NOW = new Date(2026, 10, 14);   // 14/11/2026
const H = ['Tuần đối soát', 'KHO', 'Mã vận đơn', 'Gian hàng', 'Loại tệp tin', 'Tên sản phẩm', 'Phân loại', 'Lý do'];
// Dữ liệu giả: mã chỉ đúng hình dạng.
const ROWS = [
  H,
  ['2/11 - 8/11', 'NVS', '860000000001', 'TikTok Tường Vip', 'Trả hàng hoàn tiền', 'Tranh A', '', 'Đổi ý'],
  ['02/11 - 08/11', 'nvs', '860000000002', 'TƯỜNG VIP', 'Giao không thành công', 'Tranh A', '', 'Package delivery failed'],
  ['2/11 - 8/11', 'VL', 'VTPVN00000003', 'NHÀ SÁCH', 'Trả hàng', 'Sách B | Sách C', '', 'Lỗi/hỏng'],
  ['2/11 - 8/11', 'VL', 'VTPVN00000003', 'TikTok Nhà Sách', 'Trả hàng', 'Sách B', '', 'Lỗi/hỏng'],   // trùng
  ['26/10 - 1/11', 'TSN', '530000000004', 'TikTok Nhà Sách', 'Giao KTC', 'Sách B', '', ''],
  ['5/10 - 11/10', '', 'SPXVN00000005', 'Tiktok Tranh Lịch', 'Trả hàng', 'Tranh A', '', 'Gửi sai hàng'],
  ['tuần lạ', 'VL', '860000000006', 'X', 'Trả hàng', '', '', '']
];

test('parseTsv: ô nhiều dòng trong ngoặc kép, ngoặc kép kép, CRLF, dòng trống', () => {
  const rows = BaoCao.parseTsv('A\tB\r\n"dòng 1\ndòng 2"\t"có ""nháy"""\r\n\r\nx\t\n');
  assert.deepEqual(rows, [['A', 'B'], ['dòng 1\ndòng 2', 'có "nháy"'], ['x', '']]);
});

test('parseTuan: nhiều cách ghi, không ghi năm, vắt qua năm', () => {
  const p = (s, now) => { const t = BaoCao.parseTuan(s, now || NOW); return t && [t.label, t.start.getFullYear(), t.end.getFullYear()]; };
  assert.deepEqual(p('2/11 - 9/11'), ['02/11 - 09/11', 2026, 2026]);
  assert.deepEqual(p('26/10 - 1/11'), ['26/10 - 01/11', 2026, 2026]);
  assert.deepEqual(p('Tuần 02/11-08/11'), ['02/11 - 08/11', 2026, 2026]);
  assert.deepEqual(p('02/11/2025 – 08/11/2025'), ['02/11 - 08/11', 2025, 2025]);
  assert.deepEqual(p('28/12 - 3/1', new Date(2026, 11, 30)), ['28/12 - 03/01', 2026, 2027]);
  assert.deepEqual(p('28/12 - 3/1', new Date(2027, 0, 10)), ['28/12 - 03/01', 2026, 2027]);
  assert.deepEqual(p('7/12 - 13/12', new Date(2027, 0, 10)), ['07/12 - 13/12', 2026, 2026]);
  assert.equal(p('Tuần 44/2026'), null);
  assert.equal(p(''), null);
});

test('Chuẩn hoá gian, loại, lý do', () => {
  assert.equal(BaoCao.chuanGian('TikTok Nhà Sách'), BaoCao.chuanGian('NHÀ SÁCH'));
  assert.equal(BaoCao.chuanGian('Shopee - Tường Vip'), 'TƯỜNG VIP');
  assert.equal(BaoCao.chuanLoai('Trả hàng hoàn tiền'), 'Trả hàng');
  assert.equal(BaoCao.chuanLoai('Khiếu nại'), 'Trả hàng');
  assert.equal(BaoCao.chuanLoai('Giao không thành công'), 'Giao KTC');
  assert.equal(BaoCao.chuanLoai('Đơn KTC'), 'Giao KTC');
  const n = BaoCao.nhomLyDo;
  assert.equal(n('Đổi ý', 'Trả hàng'), 'Không còn nhu cầu/đổi ý');
  assert.equal(n('Lỗi/hỏng', 'Trả hàng'), 'Hư hỏng/vỡ/trầy');
  assert.equal(n('Hàng không như mô tả', 'Trả hàng'), 'Khác mô tả');
  assert.equal(n('Gửi sai hàng', 'Trả hàng'), 'Gửi sai/thiếu hàng');
  assert.equal(n('Hàng mẫu KOC', 'Trả hàng'), 'Hàng mẫu KOC');
  assert.equal(n('Muốn đổi địa chỉ nhận', 'Giao KTC'), 'Đổi phân loại/địa chỉ');
  assert.equal(n('', 'Giao KTC'), 'Giao thất bại');
  assert.equal(n('', 'Trả hàng'), 'Khác');
});

test('docBang: nhận cột theo tên (đảo thứ tự), bỏ mã trùng, đếm dòng lỗi tuần, đoán ĐVVC khi không có cột', () => {
  const d = BaoCao.docBang(ROWS, { now: NOW });
  assert.equal(d.ok, true);
  assert.deepEqual([d.soDong, d.items.length, d.soTrung, d.soTuanLoi], [7, 5, 1, 1]);
  assert.deepEqual([d.coLyDo, d.coDvvc, d.coSp], [true, false, true]);
  assert.deepEqual(d.items.map((x) => [x.gian, x.kho, x.loai, x.dvvc]), [
    ['TƯỜNG VIP', 'NVS', 'Trả hàng', 'J&T Express'], ['TƯỜNG VIP', 'NVS', 'Giao KTC', 'J&T Express'],
    ['NHÀ SÁCH', 'VL', 'Trả hàng', 'Viettel Post'], ['NHÀ SÁCH', 'TSN', 'Giao KTC', 'J&T Cargo'],
    ['TRANH LỊCH', 'Chưa rõ', 'Trả hàng', 'SPX Express']]);
  // Đảo thứ tự cột + thêm dòng rác phía trên tiêu đề
  const idx = [2, 0, 4, 3, 1];
  const dao = [['Bảng theo dõi tháng 11']].concat(ROWS.map((r) => idx.map((i) => r[i])));
  const d2 = BaoCao.docBang(dao, { now: NOW });
  assert.equal(d2.ok, true);
  assert.equal(d2.items.length, 5);
  assert.deepEqual([d2.coLyDo, d2.coSp], [false, false]);
});

test('docBang: báo lỗi dễ hiểu', () => {
  assert.match(BaoCao.docBang([], {}).loi, /Chưa có dữ liệu/);
  assert.match(BaoCao.docBang([['a', 'b'], ['1', '2']], {}).loi, /Không thấy dòng tiêu đề/);
  assert.match(BaoCao.docBang([['Mã vận đơn', 'KHO'], ['860000000001', 'VL']], {}).loi, /thiếu cột: Tuần đối soát, Gian hàng, Loại tệp tin/);
  assert.match(BaoCao.docBang([H, ['Tuần 44/2026', 'VL', '860000000001', 'G', 'Trả hàng']], { now: NOW }).loi, /Không đọc được cột Tuần đối soát.*"Tuần 44\/2026"/);
  assert.match(BaoCao.docBang([H], {}).loi, /không có dòng nào có mã vận đơn/);
});

test('tinh + banChu: tuần mới nhất là tuần này, gian × kho, tồn, tổng, lý do, top SP, ghi chú', () => {
  const M = BaoCao.tinh(BaoCao.docBang(ROWS, { now: NOW }), { san: 'tiktok', now: NOW });
  assert.equal(M.tuanNay, '02/11 - 08/11');
  assert.deepEqual(M.khoList, ['NVS', 'TSN', 'VL', 'Chưa rõ']);
  assert.deepEqual(M.so, { nay: { tong: 3, tra: 2, giao: 1 }, ton: { tong: 2, tra: 1, giao: 1 }, tong: { tong: 5, tra: 3, giao: 2 } });
  assert.deepEqual(M.bang.gians.map((g) => [g.ten, g.tong, g.theoKho]), [['TƯỜNG VIP', 2, { NVS: 2 }], ['NHÀ SÁCH', 1, { VL: 1 }]]);
  assert.deepEqual(M.bang.tongKho, { NVS: 2, VL: 1 });
  assert.deepEqual(M.ton.map((t) => [t.label, t.quaNgay, t.tong]), [['26/10 - 01/11', 13, 1], ['05/10 - 11/10', 34, 1]]);
  assert.deepEqual(M.tongKho.map((k) => [k.kho, k.n, k.pct]), [['NVS', 2, 40], ['TSN', 1, 20], ['VL', 1, 20], ['Chưa rõ', 1, 20]]);
  assert.deepEqual(M.lyDo.map((l) => l.nhom).sort(), ['Giao thất bại', 'Gửi sai/thiếu hàng', 'Hư hỏng/vỡ/trầy', 'Không còn nhu cầu/đổi ý'].sort());
  assert.equal(M.lyDo.find((l) => l.nhom === 'Giao thất bại').n, 2);
  assert.deepEqual(M.topSp.slice(0, 2).map((p) => [p.ten, p.n, p.tra, p.giao]), [['Tranh A', 3, 2, 1], ['Sách B', 2, 1, 1]]);
  assert.deepEqual([M.ghiChu.kho, M.ghiChu.a, M.ghiChu.b, M.ghiChu.pct, M.ghiChu.cuNhat], ['NVS', 2, 5, 40, '05/10 - 11/10']);
  assert.equal(M.ghiChu.dvvc[0].ten, 'J&T Express');
  assert.equal(BaoCao.banChu(M), [
    'Báo cáo kết quả đối soát 02/11 - 08/11 tiktok',
    'TIKTOK TƯỜNG VIP THIẾU 2 ĐƠN: 2 đơn kho NVS',
    'TIKTOK NHÀ SÁCH THIẾU 1 ĐƠN: 1 đơn kho VL',
    'Tồn các tuần trước: 2 đơn',
    '- Tuần 26/10 - 01/11: 1 đơn (1 đơn kho TSN)',
    '- Tuần 05/10 - 11/10: 1 đơn (1 đơn kho Chưa rõ)',
    'Tổng còn treo: 5 đơn (2 đơn kho NVS; 1 đơn kho TSN; 1 đơn kho VL; 1 đơn kho Chưa rõ)'
  ].join('\n'));
  const S = BaoCao.tinh(BaoCao.docBang(ROWS.map((r) => r.slice(0, 5)), { now: NOW }), { san: 'shopee', now: NOW });
  assert.equal(S.lyDo, null);
  assert.equal(S.topSp, null);
  assert.match(BaoCao.banChu(S), /^Báo cáo kết quả đối soát 02\/11 - 08\/11 shopee\nSHOPEE TƯỜNG VIP THIẾU 2 ĐƠN/);
});
