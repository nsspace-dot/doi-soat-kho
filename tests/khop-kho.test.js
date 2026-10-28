'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const TrangThai = require('../js/core/trang-thai.js');
const KhopKho = require('../js/core/khop-kho.js');
const ShopeeCore = require('../js/core/shopee-core.js');
const TikTokCore = require('../js/core/tiktok-core.js');
const { XLSX, wbFromAoa, roundTrip, writeBuffer, zipFile } = require('./helpers.js');

const cho = (ma, ngay) => [ma, ma, ngay || '15/10/2026', 'cho', '', '', '', ''];
const khop = (ma, ngay, ngayKhop) => [ma, ma, ngay, 'khop', 'shopee', 'Gian cũ', 'Khiếu nại', ngayKhop];
const KHO = [
  cho('862330000001', '15/10/2026'),
  cho('012345678901', '16/10/2026'),
  khop('862330000003', '10/10/2026', '20/10/2026'),   // đã khớp từ trước
  cho('SPXVN00000004', '17/10/2026'),
  cho('GYABC123')
];

function shopeeOrders(rows) {
  return wbFromAoa([['Mã đơn hàng', 'Mã vận đơn', 'Tên sản phẩm', 'Tổng giá trị đơn hàng']]
    .concat(rows.map((c, i) => ['DH' + i, c, 'Áo', '100000.00'])));
}

function runShopee(files) {
  const R = ShopeeCore.match({ files, khoItems: TrangThai.items(KHO) });
  const T = TrangThai.sauDoiSoat(R, KHO);
  return { R, T, list: KhopKho.list(R, KHO, T.khop) };
}

test('Đã khớp kho: đúng số mã khớp (N = số mã khớp), có cả mã đã khớp từ trước, mỗi mã một lần', () => {
  const { R, T, list } = runShopee([
    // cùng một mã xuất hiện ở 2 dòng và ở 2 file -> chỉ hiện một lần, nhãn theo dòng đầu tiên
    { wb: shopeeOrders(['862330000001', '862330000001', '862330000003', 'SPXVN99999999']), kind: 'don', shop: 'Shop A', loai: 'Đơn hàng' },
    { wb: shopeeOrders(['862330000001', '012345678901']), kind: 'don', shop: 'Shop B', loai: 'Giao KTC' }
  ]);
  assert.equal(list.length, R.matchCount, 'N trong tên tab = số mã khớp');
  assert.equal(list.length, 3);
  assert.deepEqual(list.map((x) => x.ma), ['862330000001', '862330000003', '012345678901']);
  assert.equal(new Set(list.map((x) => x.ma)).size, list.length, 'không trùng mã');
  const truoc = list.find((x) => x.ma === '862330000003');
  assert.deepEqual([truoc.daKhopTruoc, truoc.vuaKhop, truoc.ngayDoiSoat], [true, false, '10/10/2026'], 'mã đã khớp từ trước vẫn có mặt');
  assert.deepEqual(list.filter((x) => x.vuaKhop).map((x) => x.ma).sort(), T.khop.map((x) => x.ma).sort());
  // Gian hàng + Loại file lấy từ nhãn người dùng gán cho file sàn (không lấy nhãn cũ trong kho)
  assert.deepEqual(list.map((x) => [x.gian, x.loai, x.ngayDoiSoat]),
    [['Shop A', 'Đơn hàng', '15/10/2026'], ['Shop A', 'Đơn hàng', '10/10/2026'], ['Shop B', 'Giao KTC', '16/10/2026']]);
  assert.ok(!list.some((x) => x.ma === 'SPXVN99999999'), 'mã không có trong kho không vào tab');
});

test('Đã khớp kho ở TikTok: mã bị lọc SPXVN/GY không có mặt', () => {
  const wb = wbFromAoa([['Order ID', 'Tracking ID', 'Product Name'], ['O1', '862330000001', 'L'], ['O2', 'SPXVN00000004', 'L'], ['O3', 'GYABC123', 'L']]);
  const R = TikTokCore.match({ files: [{ wb, shop: 'Gian T', ftype: 'giao', loai: 'Giao KTC' }], khoItems: TrangThai.items(KHO), filterOther: true });
  const list = KhopKho.list(R, KHO, TrangThai.sauDoiSoat(R, KHO).khop);
  assert.deepEqual(list.map((x) => [x.ma, x.gian, x.loai]), [['862330000001', 'Gian T', 'Giao KTC']]);
  assert.equal(list.length, R.matchCount);
});

test('Không có mã nào khớp -> danh sách rỗng', () => {
  const { list } = runShopee([{ wb: shopeeOrders(['ZZZZ00001']), kind: 'don', shop: 'S', loai: 'Đơn hàng' }]);
  assert.deepEqual(list, []);
});

test('Tìm mã: theo mã sạch, không phân biệt hoa thường / dấu gạch; ô trống hiện tất cả', () => {
  const { list } = runShopee([{ wb: shopeeOrders(['862330000001', '862330000003', '012345678901']), kind: 'don', shop: 'S', loai: 'Đơn hàng' }]);
  assert.deepEqual(KhopKho.filter(list, '0003').map((x) => x.ma), ['862330000003']);
  assert.deepEqual(KhopKho.filter(list, ' 8623-3000-0001 ').map((x) => x.ma), ['862330000001']);
  assert.equal(KhopKho.filter(list, '').length, 3);
  assert.equal(KhopKho.filter(list, 'khongco').length, 0);
});

test('Xuất Excel đã khớp kho: đúng bộ cột như bảng, theo ô tìm, mã 12 số khoá Text', () => {
  const { list } = runShopee([{ wb: shopeeOrders(['012345678901', '862330000003', '862330000001']), kind: 'don', shop: 'Shop A', loai: 'Đơn hàng' }]);
  const shown = KhopKho.filter(list, '0123');
  const wb = KhopKho.buildWorkbook(shown, 'shopee');
  const back = roundTrip(wb);
  const ws = back.Sheets[back.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1 });
  assert.deepEqual(aoa, [['STT', 'Gian hàng', 'Loại file', 'Mã vận đơn', 'Ngày đối soát'], [1, 'Shop A', 'Đơn hàng', '012345678901', '16/10/2026']]);
  assert.equal(ws.D2.t, 's');
  assert.equal(ws.D2.z, '@');
  const xml = zipFile(writeBuffer(wb), 'xl/worksheets/sheet1.xml');
  assert.match(xml.match(/<c r="D2"[^>]*>/)[0], /t="(str|s|inlineStr)"/);
  assert.equal(KhopKho.buildWorkbook(list, 'tiktok').SheetNames[0], 'TikTok_da_khop_kho');
});
