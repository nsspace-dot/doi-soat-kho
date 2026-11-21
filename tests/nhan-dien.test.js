'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const NhanDien = require('../js/core/nhan-dien.js');
const ShopeeCore = require('../js/core/shopee-core.js');
const TikTokCore = require('../js/core/tiktok-core.js');
const { wbFromAoa } = require('./helpers.js');

// Toàn bộ mã dưới đây là mã giả, chỉ đúng hình dạng.
test('ĐVVC từ cột trong file: bỏ tiền tố dịch vụ, chuẩn hoá tên', () => {
  const f = (s) => NhanDien.dvvc(s, '').ten;
  assert.equal(f('Nhanh-SPX Express'), 'SPX Express');
  assert.equal(f('Hàng Cồng Kềnh-J&T Cargo'), 'J&T Cargo');
  assert.equal(f('Tiết kiệm-J&T Express'), 'J&T Express');
  assert.equal(f('Hỏa Tốc-Giao Hàng Nhanh'), 'GHN');
  assert.equal(f('GHN'), 'GHN');
  assert.equal(f('Viettel Post'), 'Viettel Post');
  assert.equal(f('Nhanh-Ninja Van'), 'Ninja Van', 'tên lạ giữ nguyên sau khi bỏ tiền tố');
  assert.deepEqual(NhanDien.dvvc('Nhanh-SPX Express', 'X'), { ten: 'SPX Express', nguon: 'file' });
});

test('ĐVVC đoán theo đầu mã khi không có cột', () => {
  const g = (c) => NhanDien.dvvc('', c);
  assert.deepEqual(g('VTPVN00000001'), { ten: 'Viettel Post', nguon: 'đoán' });
  assert.equal(g('SVTPVN0000001').ten, 'Viettel Post', 'chỉ cần chứa VTPVN');
  assert.equal(g('SPXVN000000001').ten, 'SPX Express');
  assert.equal(g('VNGH00000001').ten, 'GHN');
  assert.equal(g('GYABC123').ten, 'GHN');
  assert.equal(g('530000000001').ten, 'J&T Cargo');
  assert.equal(g('850000000001').ten, 'J&T Express');
  assert.equal(g('860000000001').ten, 'J&T Express');
  assert.equal(g('8600000001').ten, 'Chưa rõ', '86… nhưng không đủ 12 số');
  assert.equal(g('ABC123').ten, 'Chưa rõ');
});

test('Lý do TikTok: dịch câu quen, câu lạ giữ nguyên', () => {
  const d = NhanDien.dichLyDoTikTok;
  assert.equal(d('Change of mind'), 'Đổi ý');
  assert.equal(d("Product doesn't match description"), 'Khác mô tả');
  assert.equal(d('Product doesn’t match description'), 'Khác mô tả', 'dấu nháy cong');
  assert.equal(d('Wrong product sent'), 'Gửi sai hàng');
  assert.equal(d("Product is defective or doesn't work"), 'Lỗi/hỏng');
  assert.equal(d('Congrats on meeting your refundable sample criteria!'), 'Hàng mẫu KOC');
  assert.equal(d('Package arrived late'), 'Package arrived late');
});

test('Kho: tên kho -> mã; TikTok đoán theo SP; Shopee không đoán', () => {
  assert.equal(NhanDien.khoTuTen('Kho Nguyễn Văn Săng'), 'NVS');
  assert.equal(NhanDien.khoTuTen('Tân Sơn Nhì'), 'TSN');
  assert.equal(NhanDien.khoTuTen('kho vườn lài'), 'VL');
  assert.deepEqual(NhanDien.kho('tiktok', '', 'Tranh treo tường'), { ten: 'NVS', nguon: 'đoán' });
  assert.deepEqual(NhanDien.kho('tiktok', '', 'Bộ liễn Tết'), { ten: 'NVS', nguon: 'đoán' });
  assert.deepEqual(NhanDien.kho('tiktok', '', 'Sách thiếu nhi'), { ten: 'VL', nguon: 'đoán' });
  assert.deepEqual(NhanDien.kho('shopee', '', 'Tranh treo tường'), { ten: 'Chưa rõ', nguon: '' });
  assert.deepEqual(NhanDien.kho('shopee', 'TSN', 'Tranh'), { ten: 'TSN', nguon: 'file' });
});

test('Tuần mặc định: khoảng ngày trong file, không có thì tuần T2-CN vừa qua', () => {
  assert.equal(NhanDien.tuanMacDinh(['2026-11-04 10:00', '02/11/2026 08:00:00', '08/11/2026', 'rác']), '02/11 - 08/11');
  assert.equal(NhanDien.tuanMacDinh([], new Date(2026, 10, 14)), '02/11 - 08/11');
  assert.equal(NhanDien.tuanMacDinh([], new Date(2026, 10, 9)), '02/11 - 08/11');
});

test('Shopee giao thất bại: ĐVVC bỏ tiền tố, lý do cố định, kho từ "Tên kho hàng"; nhiều SKU gộp 1 dòng', () => {
  const wb = wbFromAoa([
    ['Mã đơn hàng', 'Mã vận đơn', 'Đơn Vị Vận Chuyển', 'Tên sản phẩm', 'Tên phân loại hàng', 'Tên kho hàng', 'Ngày đặt hàng'],
    ['DH1', 'SPXVN000000001', 'Nhanh-SPX Express', 'Tranh A', 'Đỏ', 'Kho Nguyễn Văn Săng', '2026-11-03 09:00'],
    ['DH1', 'SPXVN000000001', 'Nhanh-SPX Express', 'Khung B', 'Xanh', 'Kho Nguyễn Văn Săng', '2026-11-03 09:00'],
    ['DH2', '860000000002', 'Hàng Cồng Kềnh-J&T Cargo', 'Sách C', '', 'Tân Sơn Nhì', '2026-11-05 09:00']
  ]);
  const R = ShopeeCore.match({ files: [{ wb, kind: 'don', shop: 'S', loai: 'Giao KTC' }], khoItems: [] });
  assert.equal(R.records.length, 3, 'giữ cấp SKU cho biểu đồ');
  assert.equal(R.missA.length, 2, 'mỗi mã 1 dòng');
  const a = R.missA[0];
  assert.equal(a.prod, 'Tranh A | Khung B');
  assert.equal(a.variant, 'Đỏ | Xanh');
  assert.deepEqual([a.dvvcTen, a.dvvcNguon, a.lyDo, a.kho, a.khoNguon], ['SPX Express', 'file', 'Giao thất bại', 'NVS', 'file']);
  assert.deepEqual([R.missA[1].dvvcTen, R.missA[1].kho], ['J&T Cargo', 'TSN']);
  assert.equal(R.records[0].prod, 'Tranh A', 'dòng gốc không bị sửa');
});

test('Shopee trả hàng: dùng ĐVVC + mã CHIỀU VỀ, không dùng cột giao hàng; kho Chưa rõ', () => {
  const wb = wbFromAoa([
    ['Mã đơn hàng', 'Mã vận đơn trả hàng', 'Đơn vị vận chuyển giao hàng', 'Đơn vị vận chuyển trả hàng', 'Lí do Trả hàng/Hoàn tiền', 'Tên sản phẩm'],
    ['DH1', '850000000011', 'Nhanh', 'J&T Express', 'Thiếu hàng', 'Tranh A'],
    ['DH2', 'VNGH00000012', 'Hỏa Tốc', '', 'Hàng lỗi', 'Tranh B']
  ]);
  const R = ShopeeCore.match({ files: [{ wb, kind: 'khieunai', shop: 'S', loai: 'Khiếu nại' }], khoItems: [] });
  assert.deepEqual(R.missA.map((r) => [r.dvvcTen, r.dvvcNguon, r.lyDo, r.kho, r.khoNguon]), [
    ['J&T Express', 'file', 'Thiếu hàng', '', ''],
    ['GHN', 'đoán', 'Hàng lỗi', '', '']   // cột trả hàng trống -> đoán theo mã, KHÔNG lấy "Hỏa Tốc"
  ]);
});

test('TikTok: giao KTC lấy Shipping Provider Name + Cancel Reason; trả hàng đoán ĐVVC, dịch lý do, đoán kho theo SP', () => {
  const giao = wbFromAoa([
    ['Order ID', 'Tracking ID', 'Shipping Provider Name', 'Cancel Reason', 'Product Name'],
    ['O1', '860000000021', 'J&T Express', 'Package delivery failed', 'Sách A']
  ]);
  const tra = wbFromAoa([
    ['Order ID', 'Return Logistics Tracking ID', 'Return Reason', 'Product Name', 'Time Requested'],
    ['O2', 'VTPVN00000022', 'Change of mind', 'Tranh B', '04/11/2026 10:00:00'],
    ['O2', 'VTPVN00000022', 'Change of mind', 'Sách C', '04/11/2026 10:00:00'],
    ['O3', '530000000023', 'Câu lạ', 'Sách D', '05/11/2026 10:00:00']
  ]);
  const R = TikTokCore.match({ files: [{ wb: giao, shop: 'T', ftype: 'giao', loai: 'Giao KTC' }, { wb: tra, shop: 'T', ftype: 'tra', loai: 'Trả hàng' }], khoItems: [] });
  assert.deepEqual(R.missA.map((r) => [r.dvvcTen, r.dvvcNguon, r.lyDo, r.kho, r.khoNguon, r.prod]), [
    ['J&T Express', 'file', 'Package delivery failed', 'VL', 'đoán', 'Sách A'],
    ['Viettel Post', 'đoán', 'Đổi ý', 'NVS', 'đoán', 'Tranh B | Sách C'],
    ['J&T Cargo', 'đoán', 'Câu lạ', 'VL', 'đoán', 'Sách D']
  ]);
  assert.equal(R.missA[1].time, '04/11/2026 10:00:00');
  assert.equal(R.missA[0].oid, 'O1');
});
