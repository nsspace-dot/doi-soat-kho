'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const DoiDvvc = require('../js/core/doi-dvvc.js');
const { XLSX, roundTrip } = require('./helpers.js');

// Dữ liệu giả.
const ITEMS = [
  { ma: '860000000001', dvvc: 'J&T Express', dvvcNguon: 'file', gian: 'G1', loai: 'Giao KTC', maDon: 'O1', sp: 'Sách A', lyDo: 'Giao thất bại', tuan: '02/11 - 08/11', kho: 'VL', khoNguon: 'đoán' },
  { ma: '860000000002', dvvc: 'J&T Express', dvvcNguon: 'đoán', gian: 'G1', loai: 'Trả hàng', maDon: '0123', sp: 'Sách B', lyDo: 'Đổi ý', tuan: '02/11 - 08/11', kho: 'VL', khoNguon: 'file' },
  { ma: '850000000003', dvvc: 'J&T Express', dvvcNguon: 'đoán', gian: 'G2', loai: 'Khiếu nại', maDon: '', sp: 'Sách C', lyDo: '', tuan: '26/10 - 01/11', kho: 'VL', khoNguon: 'file' },
  { ma: 'VTPVN00000004', dvvc: 'Viettel Post', dvvcNguon: 'đoán', gian: 'G2', loai: 'Trả hàng', sp: 'Tranh D', tuan: '02/11 - 08/11', kho: 'NVS', khoNguon: 'đoán' },
  { ma: 'SPXVN00000005', dvvc: 'SPX Express', dvvcNguon: 'file', gian: 'G3', loai: 'Đơn hàng', sp: 'Tranh E', tuan: '02/11 - 08/11', kho: '', khoNguon: '' }
];

test('Nhóm kho × ĐVVC và tin nhắn đúng mẫu', () => {
  const g = DoiDvvc.nhom(ITEMS);
  assert.deepEqual(g.map((x) => [x.kho, x.dvvc, x.items.length, x.giao, x.tra]),
    [['NVS', 'Viettel Post', 1, 0, 1], ['VL', 'J&T Express', 3, 1, 2], ['Chưa rõ', 'SPX Express', 1, 1, 0]]);
  assert.equal(DoiDvvc.tinNhan(g[1]),
    '[J&T Express] KHO VL – nhờ kiểm tra & hoàn trả 3 kiện chưa về kho (1 giao không thành công, 2 trả hàng):\n860000000001\n860000000002\n850000000003');
});

test('File Excel: Tổng hợp kho × ĐVVC + ghi chú đoán, mỗi kho 1 sheet, sheet Tin nhắn; mã dạng chữ', () => {
  const wb = roundTrip(DoiDvvc.buildWorkbook(ITEMS));
  assert.deepEqual(wb.SheetNames, ['Tổng hợp', 'Kho NVS', 'Kho VL', 'Kho Chưa rõ', 'Tin nhắn']);
  const th = XLSX.utils.sheet_to_json(wb.Sheets['Tổng hợp'], { header: 1, defval: '' });
  assert.deepEqual(th.slice(0, 5), [
    ['KHO \\ ĐVVC', 'J&T Express', 'SPX Express', 'Viettel Post', 'Tổng'],
    ['NVS', 0, 0, 1, 1], ['VL', 3, 0, 0, 3], ['Chưa rõ', 0, 1, 0, 1], ['Tổng', 3, 1, 1, 5]]);
  const note = th.slice(5).map((r) => r[0]).join('\n');
  assert.match(note, /ĐVVC đoán theo đầu mã vận đơn[^\n]*: 3\/5 kiện/);
  assert.match(note, /Kho đoán theo tên sản phẩm: 2\/5 kiện/);
  assert.match(note, /Kho chưa rõ: 1\/5 kiện/);
  const vl = wb.Sheets['Kho VL'];
  const rows = XLSX.utils.sheet_to_json(vl, { header: 1, defval: '' });
  assert.deepEqual(rows[0], ['STT', 'Mã vận đơn', 'ĐVVC', 'Gian', 'Loại', 'Mã đơn', 'Sản phẩm', 'Lý do', 'Tuần', 'Kho (thật/đoán)']);
  assert.deepEqual(rows[1], [1, '860000000001', 'J&T Express', 'G1', 'Giao KTC', 'O1', 'Sách A', 'Giao thất bại', '02/11 - 08/11', 'đoán']);
  assert.deepEqual([rows[2][5], rows[2][9], rows[3][4]], ['0123', 'thật', 'Khiếu nại']);
  assert.equal(vl.B2.t, 's');
  assert.equal(vl.B2.z, '@');
  assert.equal(XLSX.utils.sheet_to_json(wb.Sheets['Kho Chưa rõ'], { header: 1 })[1][9], 'chưa rõ');
  const tn = XLSX.utils.sheet_to_json(wb.Sheets['Tin nhắn'], { header: 1 });
  assert.equal(tn.length, 4);
  assert.deepEqual(tn[2].slice(0, 3), ['VL', 'J&T Express', 3]);
  assert.match(tn[2][3], /^\[J&T Express\] KHO VL – nhờ kiểm tra & hoàn trả 3 kiện chưa về kho \(1 giao không thành công, 2 trả hàng\):\n860000000001\n/);
});

test('Xuất theo ĐVVC: mỗi ĐVVC 1 sheet (nhiều kiện trước), trong sheet nhóm theo kho; Tổng hợp và Tin nhắn giữ nguyên', () => {
  const wb = roundTrip(DoiDvvc.buildWorkbook(ITEMS, 'dvvc'));
  assert.deepEqual(wb.SheetNames, ['Tổng hợp', 'J&T Express', 'SPX Express', 'Viettel Post', 'Tin nhắn']);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['J&T Express'], { header: 1, defval: '' });
  assert.deepEqual(rows.slice(1).map((r) => [r[0], r[1], r[2]]), [[1, '860000000001', 'J&T Express'], [2, '860000000002', 'J&T Express'], [3, '850000000003', 'J&T Express']]);
  assert.equal(wb.Sheets['J&T Express'].B2.z, '@');
  const mac = XLSX.utils.sheet_to_json(roundTrip(DoiDvvc.buildWorkbook(ITEMS)).Sheets['Tổng hợp'], { header: 1 });
  assert.deepEqual(XLSX.utils.sheet_to_json(wb.Sheets['Tổng hợp'], { header: 1 }), mac);
});
