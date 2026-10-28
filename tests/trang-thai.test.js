'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const TrangThai = require('../js/core/trang-thai.js');
const DaDoiSoat = require('../js/core/da-doi-soat.js');
const ShopeeCore = require('../js/core/shopee-core.js');
const TikTokCore = require('../js/core/tiktok-core.js');
const KhoInput = require('../js/core/kho-input.js');
const Template = require('../js/core/template.js');
const { XLSX, wbFromAoa, roundTrip } = require('./helpers.js');

// Kho chung ở mô hình trạng thái: [ma, goc, ngay_doi_soat, trang_thai, san, gian, loai, ngay_khop]
const cho = (ma, ngay) => [ma, ma, ngay || '15/10/2026', 'cho', '', '', '', ''];
const khop = (ma, san, gian, loai, ngayKhop) => [ma, ma, '10/10/2026', 'khop', san, gian, loai, ngayKhop];
const KHO = [
  cho('862330000001'),                                              // Shopee sẽ báo
  cho('862330000002'),                                              // TikTok sẽ báo
  khop('862330000003', 'shopee', 'Gian cũ', 'Khiếu nại', '20/10/2026'), // đã khớp từ trước
  cho('SPXVN00000004'),                                             // mã bị lọc ở TikTok
  cho('GYABC123'),
  khop('VNGH00000005', 'tiktok', 'Gian T', 'Trả hàng', '26/10/2026')
];

function shopeeOrders(codes) {
  return wbFromAoa([['Mã đơn hàng', 'Mã vận đơn', 'Tên sản phẩm', 'Tổng giá trị đơn hàng']]
    .concat(codes.map((c, i) => ['DH' + i, c, 'Áo', '100000.00'])));
}
function tiktokFile(codes) {
  return wbFromAoa([['Order ID', 'Tracking ID', 'Product Name', 'Order Amount']]
    .concat(codes.map((c, i) => ['O' + i, c, 'Lịch', '50000'])));
}

test('Shopee: chỉ chuyển mã "cho" có trong chứng từ Shopee; mã đã khớp vẫn tính là khớp, không gửi lại', () => {
  const R = ShopeeCore.match({ files: [{ wb: shopeeOrders(['862330000001', '862330000003', 'SPXVN99999999']), kind: 'don', shop: 'Shop A', loai: 'Đơn hàng' }],
    khoItems: TrangThai.items(KHO) });
  const T = TrangThai.sauDoiSoat(R, KHO);
  assert.deepEqual(T.khop, [{ ma: '862330000001', maGoc: '862330000001', gian: 'Shop A', loai: 'Đơn hàng' }]);
  assert.deepEqual(T.daKhopTruoc, ['862330000003'], 'đối soát lại: không đổi, không báo lỗi');
  assert.equal(R.matchCount, 2, 'mã đã khớp vẫn tính trong tỷ lệ');
  assert.equal(R.rate, 67);
  // Mã TikTok đang chờ và mã đã khớp của sàn kia KHÔNG bị đụng
  assert.ok(!T.khop.some((x) => ['862330000002', 'VNGH00000005', 'GYABC123'].includes(x.ma)));
  // "Kho chưa có chứng từ" chỉ gồm mã còn Chờ đối soát
  assert.deepEqual(T.missB.map((m) => m.cleanId).sort(), ['862330000002', 'GYABC123', 'SPXVN00000004']);
  assert.equal(T.soCho, 4);
});

test('TikTok: mã bị lọc SPXVN/GY không bao giờ bị chuyển, kể cả khi có trong chứng từ', () => {
  const R = TikTokCore.match({ files: [{ wb: tiktokFile(['862330000002', 'SPXVN00000004', 'GYABC123', 'VNGH00000005']), shop: 'Gian T', ftype: 'giao', loai: 'Giao KTC' }],
    khoItems: TrangThai.items(KHO), filterOther: true });
  const T = TrangThai.sauDoiSoat(R, KHO);
  assert.deepEqual(T.khop.map((x) => [x.ma, x.gian, x.loai]), [['862330000002', 'Gian T', 'Giao KTC']]);
  assert.deepEqual(T.daKhopTruoc, ['VNGH00000005']);
  assert.deepEqual(T.filtered.map((f) => f.cleanId).sort(), ['GYABC123', 'SPXVN00000004'], 'mã bị lọc vẫn Chờ đối soát');
  assert.ok(!T.missB.some((m) => m.cleanId === '862330000003'), 'mã đã khớp không vào "kho chưa có chứng từ"');
});

test('Nhãn từ file mẫu đơn thiếu: gian hàng theo dòng, loại file chuẩn hoá về 5 loại', () => {
  const wb = wbFromAoa([Template.columns('tiktok'),
    ['Tuần 43/2026', '', '862330000002', 'Gian mẫu', 'Giao không thành công', 'Lịch', '']]);
  const R = TikTokCore.match({ files: [{ wb, shop: 'x', ftype: 'exported', loai: 'Khác' }], khoItems: TrangThai.items(KHO), filterOther: true });
  const T = TrangThai.sauDoiSoat(R, KHO);
  assert.deepEqual(T.khop.map((x) => [x.gian, x.loai]), [['Gian mẫu', 'Giao KTC']]);
});

test('Loại file: chuẩn hoá, đoán từ tên file, và ưu tiên lựa chọn của người dùng khi chọn cột', () => {
  assert.equal(TrangThai.chuanHoaLoai('Khiếu nại trả hàng'), 'Khiếu nại');
  assert.equal(TrangThai.chuanHoaLoai('Đơn hàng (hủy / giao KTC)'), 'Giao KTC');
  assert.equal(TrangThai.chuanHoaLoai('Trả hàng hoàn tiền'), 'Trả hàng');
  assert.equal(TrangThai.chuanHoaLoai('linh tinh', 'Đơn hàng'), 'Đơn hàng');
  assert.equal(TrangThai.chuanHoaLoai('linh tinh'), 'Khác');
  assert.equal(TrangThai.doanLoai('tiktok', 'TIKTOK_Gian_1_giao.xlsx'), 'Giao KTC');
  assert.equal(TrangThai.doanLoai('tiktok', 'TikTok_return_refund.xlsx'), 'Trả hàng');
  assert.equal(TrangThai.doanLoai('shopee', 'Shop_A.xlsx', 'Đơn hàng'), 'Đơn hàng');
  assert.equal(TrangThai.doanLoai('shopee', 'shop_khieu_nai.xlsx', 'Đơn hàng'), 'Khiếu nại');
  assert.equal(TrangThai.doanLoai('shopee', 'Mau_don_thieu_Shopee.xlsx', 'Đơn hàng'), 'Khác');
  assert.equal(TrangThai.shopeeKind('Khiếu nại', 'don'), 'khieunai');
  assert.equal(TrangThai.shopeeKind('Giao KTC', 'khieunai'), 'don');
  assert.equal(TrangThai.shopeeKind('Khác', 'khieunai'), 'khieunai');
  assert.equal(TrangThai.tiktokType('Trả hàng', 'giao'), 'tra');
  assert.equal(TrangThai.tiktokType('Khác', 'exported'), 'exported');
});

test('Shopee: chọn loại "Khiếu nại" cho file ở ô Đơn hàng -> đọc cột mã vận đơn trả hàng', () => {
  const wb = wbFromAoa([['Mã số khiếu nại', 'Mã đơn hàng', 'Mã vận đơn giao hàng', 'Mã vận đơn trả hàng'],
    ['KN1', 'DH1', '862330000002', '862330000001']]);
  const kind = TrangThai.shopeeKind('Khiếu nại', 'don');
  const R = ShopeeCore.match({ files: [{ wb, kind, shop: 'S', loai: 'Khiếu nại' }], khoItems: TrangThai.items(KHO) });
  assert.deepEqual(R.records.map((r) => r.cleanTid), ['862330000001']);
});

test('Tìm một mã: Chờ đối soát / Đã khớp / Không có trong kho', () => {
  assert.deepEqual(TrangThai.lookup(KHO, ' 862330000003 '), {
    ma: '862330000003', maGoc: '862330000003', ngayDoiSoat: '10/10/2026', trangThai: 'khop', san: 'shopee',
    gianHang: 'Gian cũ', loaiFile: 'Khiếu nại', ngayKhop: '20/10/2026', nhan: 'Đã khớp', sanLabel: 'Shopee' });
  const c = TrangThai.lookup(KHO, 'gyabc-123');
  assert.equal(c.nhan, 'Chờ đối soát');
  assert.equal(c.ngayDoiSoat, '15/10/2026');
  assert.deepEqual(TrangThai.lookup(KHO, 'ZZZZ9999'), { ma: 'ZZZZ9999', trangThai: 'khong', nhan: 'Không có trong kho' });
  assert.equal(TrangThai.lookup(KHO, '  '), null);
});

test('Đã đối soát: danh sách mã khớp, mới khớp trước; lọc theo sàn, gian, tuần khớp ISO, tìm mã', () => {
  const rows = KHO.concat([khop('862330000099', 'shopee', 'Shop A', 'Đơn hàng', '27/10/2026')]);
  const all = DaDoiSoat.list(rows);
  assert.deepEqual(all.map((x) => x.ma), ['862330000099', 'VNGH00000005', '862330000003']);
  assert.deepEqual(all.map((x) => x.tuan), ['Tuần 44/2026', 'Tuần 44/2026', 'Tuần 43/2026']);
  const o = DaDoiSoat.options(all);
  assert.deepEqual(o.gian, ['Gian cũ', 'Gian T', 'Shop A']);
  assert.deepEqual(o.tuan, [{ key: '202644', label: 'Tuần 44/2026' }, { key: '202643', label: 'Tuần 43/2026' }]);
  assert.deepEqual(DaDoiSoat.filter(all, { san: 'shopee' }).map((x) => x.ma), ['862330000099', '862330000003']);
  assert.deepEqual(DaDoiSoat.filter(all, { tuan: '202644', san: 'tiktok' }).map((x) => x.ma), ['VNGH00000005']);
  assert.deepEqual(DaDoiSoat.filter(all, { gian: 'Gian cũ' }).map((x) => x.ma), ['862330000003']);
  assert.deepEqual(DaDoiSoat.filter(all, { q: '0099' }).map((x) => x.ma), ['862330000099']);
  assert.equal(DaDoiSoat.filter(all, { san: 'tiktok', gian: 'Shop A' }).length, 0);
});

test('Đã đối soát: xuất Excel theo bộ lọc đang chọn, cột mã khoá Text, không có cột người', () => {
  const rows = KHO.concat([khop('012345678901', 'shopee', 'Shop A', 'Đơn hàng', '27/10/2026')]);
  const shown = DaDoiSoat.filter(DaDoiSoat.list(rows), { san: 'shopee' });
  const wb = roundTrip(DaDoiSoat.buildExportWorkbook(shown));
  const ws = wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1 });
  assert.deepEqual(aoa[0], ['STT', 'Mã vận đơn', 'Sàn', 'Gian hàng', 'Loại file', 'Ngày đối soát', 'Ngày khớp', 'Tuần khớp']);
  assert.deepEqual(aoa.slice(1).map((r) => r[1]), ['012345678901', '862330000003']);
  assert.deepEqual(aoa[1].slice(2), ['Shopee', 'Shop A', 'Đơn hàng', '10/10/2026', '27/10/2026', 'Tuần 44/2026']);
  assert.equal(ws.B2.t, 's');
  assert.equal(ws.B2.z, '@');
  assert.ok(!aoa[0].some((h) => /người/i.test(h)));
});

test('Nạp lại file "Tải kho về Excel": dòng Đã khớp bị bỏ qua, không đưa về Chờ đối soát', () => {
  const wb = wbFromAoa([
    ['STT', 'Mã vận đơn', 'Trạng thái', 'Ngày đối soát', 'Số ngày tồn', 'Sàn', 'Gian hàng', 'Loại file', 'Ngày khớp'],
    [1, '862330000001', 'Chờ đối soát', '15/10/2026', 12, '', '', '', ''],
    [2, '862330000003', 'Đã khớp', '10/10/2026', '', 'Shopee', 'Gian cũ', 'Khiếu nại', '20/10/2026']
  ]);
  const res = KhoInput.parseKhoSheet(wb.Sheets.Sheet1, 'Kho_chung.xlsx');
  assert.deepEqual(res.entries.map((e) => [e.code, e.keepDate]), [['862330000001', '15/10/2026']]);
  assert.match(res.skipped[0], /862330000003 \(Đã khớp/);
});

test('Không còn chỗ nào hiện / hỏi tên người trên trang', () => {
  const ROOT = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const js = fs.readdirSync(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js'))
    .map((f) => fs.readFileSync(path.join(ROOT, 'js', f), 'utf8')).join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');   // bỏ chú thích
  for (const bad of [/Tên người/i, /['>]Người tải/, /Người gửi/i, /<th>Người<\/th>/, /nguoi/, /ensureName|getName|setName/, /kho_name/]) {
    assert.ok(!bad.test(html), 'index.html: ' + bad);
    assert.ok(!bad.test(js), 'js/: ' + bad);
  }
});
