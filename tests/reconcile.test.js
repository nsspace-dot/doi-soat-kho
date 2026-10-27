'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const ShopeeCore = require('../js/core/shopee-core.js');
const TikTokCore = require('../js/core/tiktok-core.js');
const { wbFromAoa, kho } = require('./helpers.js');

// Kho chung có mã của cả hai sàn:
//  862330000001  J&T 12 số   -> Shopee đã báo
//  862330000002  J&T 12 số   -> TikTok đã báo (Shopee KHÔNG báo)
//  VNGH00000003  dùng chung  -> chưa sàn nào báo
//  SPXVN00000004 SPX Express -> Shopee đã báo
//  GYABC123      GHN ngắn    -> chưa sàn nào báo
const KHO = kho(['862330000001', '862330000002', 'VNGH00000003', 'SPXVN00000004', 'GYABC123'], '15/10/2026');

function shopeeOrders(codes) {
  return wbFromAoa([['Mã đơn hàng', 'Mã vận đơn', 'Đơn vị vận chuyển', 'Tên sản phẩm', 'Tổng giá trị đơn hàng', 'Tỉnh/Thành phố', 'Phương thức thanh toán']]
    .concat(codes.map((c, i) => ['DH' + i, c, 'SPX Express', 'Áo thun', '135150.00', 'Hà Nội', 'Thanh toán khi nhận hàng'])));
}
function shopeeClaims(rows) {
  return wbFromAoa([['Mã số khiếu nại', 'Mã đơn hàng', 'Mã vận đơn giao hàng', 'Mã vận đơn trả hàng', 'Phương án', 'Trạng thái trả hàng', 'Tổng số tiền hoàn trả', 'Tổng giá trị']]
    .concat(rows));
}
function tiktokFailed(codes) {
  return wbFromAoa([['Order ID', 'Tracking ID', 'Product Name', 'Variation', 'Shipping Provider', 'Order Amount', 'Payment Method', 'Province'],
    ["The order's tracking number.", 'mô tả cột', '', '', '', '', '', '']]
    .concat(codes.map((c, i) => ['O' + i, c, 'Lịch 2027', 'Đỏ', 'J&T Express', '50000', 'Cash on delivery', 'Hà Nội'])));
}

test('Shopee: chỉ xoá mã Shopee đã ghi nhận VÀ có trong kho', () => {
  const res = ShopeeCore.match({
    files: [{ wb: shopeeOrders(['862330000001', 'SPXVN00000004', 'SPXVN99999999']), kind: 'don', shop: 'Shop A' }],
    khoItems: KHO, skipRefundOnly: true, today: '27/10/2026'
  });
  assert.deepEqual(res.toRemove.sort(), ['862330000001', 'SPXVN00000004']);
  // Mã TikTok đang chờ (862330000002) và mã chưa sàn nào báo: KHÔNG bị xoá, giữ ngày cũ
  assert.ok(!res.toRemove.includes('862330000002'));
  assert.deepEqual(res.missB.map((m) => m.cleanId).sort(), ['862330000002', 'GYABC123', 'VNGH00000003']);
  assert.ok(res.missB.every((m) => m.date === '15/10/2026'));
  // Sàn báo nhưng kho chưa nhận
  assert.deepEqual(res.missA.map((r) => r.cleanTid), ['SPXVN99999999']);
  assert.equal(res.matchCount, 2);
  assert.equal(res.rate, 67);
});

test('Shopee: file khiếu nại dùng mã vận đơn TRẢ HÀNG, bỏ qua đơn chỉ hoàn tiền', () => {
  const res = ShopeeCore.match({
    files: [{ wb: shopeeClaims([
      ['KN1', 'DH1', '862330000002', '862330000001', 'Trả hàng/Hoàn tiền', 'Có', '0', '240000.00'],
      ['KN2', 'DH2', '862330000099', '', 'Hoàn tiền ngay', 'Không', '100000', '100000'],
      ['KN3', 'DH3', '862330000098', '', 'Trả hàng/Hoàn tiền', 'Có', '0', '0']
    ]), kind: 'khieunai', shop: 'Shop A' }],
    khoItems: KHO, skipRefundOnly: true
  });
  // Mã giao 862330000002 thuộc TikTok trong kho: KHÔNG được coi là Shopee đã ghi nhận
  assert.deepEqual(res.toRemove, ['862330000001']);
  assert.equal(res.refundOnlyCount, 1);
  assert.equal(res.noTidCount, 1);
  assert.equal(res.records[0].amt, 240000); // cột hoàn trả = 0 -> lùi về Tổng giá trị, dấu chấm thập phân
});

test('TikTok: không bao giờ xoá mã bị lọc SPXVN/GY dù có trong chứng từ', () => {
  const res = TikTokCore.match({
    files: [{ wb: tiktokFailed(['862330000002', 'SPXVN00000004', 'GYABC123', 'VNGH77777777']), shop: 'Gian 1', ftype: 'giao' }],
    khoItems: KHO, filterOther: true, today: '27/10/2026'
  });
  assert.deepEqual(res.toRemove, ['862330000002']);
  assert.ok(!res.toRemove.includes('SPXVN00000004') && !res.toRemove.includes('GYABC123'));
  // Mã bị lọc vẫn nằm lại kho (nhóm "đã lọc"), giữ ngày cũ
  assert.deepEqual(res.filtered.map((f) => f.cleanId).sort(), ['GYABC123', 'SPXVN00000004']);
  assert.ok(res.filtered.every((f) => f.date === '15/10/2026'));
  // Mã Shopee đang chờ trong kho không bị xoá khi chạy TikTok
  assert.ok(!res.toRemove.includes('862330000001'));
  assert.deepEqual(res.missB.map((m) => m.cleanId).sort(), ['862330000001', 'VNGH00000003']);
  assert.deepEqual(res.missA.map((r) => r.cleanTid), ['VNGH77777777']);
  assert.equal(res.records.length, 2); // dòng mô tả "The order's tracking number." bị loại
  assert.equal(res.rate, 50);
});

test('TikTok: tắt bộ lọc thì mã SPXVN có chứng từ TikTok mới được khớp và xoá', () => {
  const res = TikTokCore.match({
    files: [{ wb: tiktokFailed(['SPXVN00000004']), shop: 'Gian 1', ftype: 'giao' }],
    khoItems: KHO, filterOther: false
  });
  assert.deepEqual(res.toRemove, ['SPXVN00000004']);
});

test('Chạy lần lượt hai sàn trên cùng một kho: mỗi sàn chỉ xoá mã của mình', () => {
  let store = KHO.slice();
  const sp = ShopeeCore.match({ files: [{ wb: shopeeOrders(['862330000001']), kind: 'don', shop: 'S' }], khoItems: store });
  store = store.filter((it) => !sp.toRemove.includes(it.c));
  const tt = TikTokCore.match({ files: [{ wb: tiktokFailed(['862330000002', '862330000001']), shop: 'T', ftype: 'giao' }], khoItems: store, filterOther: true });
  store = store.filter((it) => !tt.toRemove.includes(it.c));
  assert.deepEqual(store.map((it) => it.c).sort(), ['GYABC123', 'SPXVN00000004', 'VNGH00000003']);
  // 862330000001 đã bị Shopee "bụp" nên TikTok báo thiếu (đúng thực tế: chỉ 1 kiện về kho)
  assert.deepEqual(tt.missA.map((r) => r.cleanTid), ['862330000001']);
});

test('Tiền TikTok và Shopee đọc theo quy tắc riêng', () => {
  assert.equal(TikTokCore.parseMoneyTikTok('142.000₫'), 142000);
  assert.equal(TikTokCore.parseMoneyTikTok('50000.00'), 50000);
  assert.equal(ShopeeCore.parseMoneyShopee('135150.00'), 135150);
  assert.equal(ShopeeCore.parseMoneyShopee('1,350,000'), 1350000);
});
