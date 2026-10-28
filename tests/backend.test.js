'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGas } = require('./gas-mock.js');

const up = (items, extra) => Object.assign({ action: 'upload', cheDo: 'gop', nguoi: 'Lan', items }, extra);
const rec = (san, khop, extra) => Object.assign({ action: 'reconcile', san, nguoi: 'Lan', khop }, extra);
const k = (ma, gian, loai) => ({ ma, gian: gian || 'Gian A', loai: loai || 'Giao KTC' });
const codesOf = (st) => st.kho.map((r) => r[0]).sort();
const byCode = (st) => Object.fromEntries(st.kho.map((r) => [r[0], r]));
const status = (st) => Object.fromEntries(st.kho.map((r) => [r[0], r[3]]));
const KHO_HEADER = ['ma_sach', 'ma_goc', 'ngay_doi_soat', 'trang_thai', 'san', 'gian_hang', 'loai_file', 'ngay_khop'];

test('GET kho trống: tự tạo sheet 8 cột, chưa có lần tải', () => {
  const g = createGas();
  const st = g.get();
  assert.equal(st.ok, true);
  assert.deepEqual(st.kho, []);
  assert.equal(st.info.lanTaiCuoi, null);
  assert.deepEqual([st.info.soMa, st.info.soCho, st.info.soKhop, st.info.giuNgay], [0, 0, 0, 60]);
  assert.deepEqual(g.sheets.KHO.data[0], KHO_HEADER);
});

test('Tải kho (gộp): mã mới vào "cho" với ngày hôm nay, giữ mã có số 0 đầu dạng chữ', () => {
  const g = createGas();
  const st = g.post(up([{ ma: '012345678901', goc: '012345678901' }, { ma: 'spxvn-0001', goc: 'SPXVN-0001' }, { ma: 'AB' }]));
  assert.equal(st.ok, true, st.thongBao);
  assert.deepEqual(st.ketQua, { them: 2, daCo: 0, bo: 0, daKhop: 0, loai: 1 });
  assert.deepEqual(byCode(st)['012345678901'], ['012345678901', '012345678901', '27/10/2026', 'cho', '', '', '', '']);
  assert.equal(byCode(st).SPXVN0001[1], 'SPXVN-0001');
  assert.equal(st.info.lanTaiCuoi.soMa, 2);
});

test('Gộp lần 2: mã "cho" đã có giữ ngày đối soát cũ', () => {
  const g = createGas();
  g.post(up([{ ma: '862330000001' }]));
  g.state.now = new Date('2026-11-03T03:00:00Z');
  const st = g.post(up([{ ma: '862330000001' }, { ma: '862330000002' }]));
  assert.equal(byCode(st)['862330000001'][2], '27/10/2026');
  assert.equal(byCode(st)['862330000002'][2], '03/11/2026');
});

test('Ngày mang theo (chuyển Sổ mã cũ): chỉ nhận ngày hợp lệ, không tương lai, không quá cũ', () => {
  const g = createGas();
  const st = g.post(up([
    { ma: 'AAAA1111', ngay: '03/10/2026' }, { ma: 'AAAA2222', ngay: '31/02/2026' },
    { ma: 'AAAA3333', ngay: '01/12/2026' }, { ma: 'AAAA4444', ngay: '01/01/2020' }, { ma: 'AAAA5555', ngay: '<script>' }
  ]));
  const d = Object.fromEntries(st.kho.map((r) => [r[0], r[2]]));
  assert.deepEqual(d, { AAAA1111: '03/10/2026', AAAA2222: '27/10/2026', AAAA3333: '27/10/2026', AAAA4444: '27/10/2026', AAAA5555: '27/10/2026' });
  const st2 = g.post(up([{ ma: 'AAAA2222', ngay: '20/10/2026' }]));
  assert.equal(byCode(st2).AAAA2222[2], '20/10/2026');
});

test('Đối soát: chuyển sang "khop" + ghi sàn/gian/loại/ngày khớp, KHÔNG xoá khỏi kho', () => {
  const g = createGas();
  g.post(up(['862330000001', '862330000002', 'SPXVN00000004'].map((ma) => ({ ma }))));
  g.state.now = new Date('2026-10-29T03:00:00Z');
  const st = g.post(rec('shopee', [k('862330000001', 'Shop A', 'Đơn hàng'), k('KHONGCOTRONGKHO'), { ma: '!!' }]));
  assert.equal(st.ok, true, st.thongBao);
  assert.deepEqual(st.ketQua, { khop: 1, daKhop: 0, khongCo: 1, gui: 2, ngayKhop: '29/10/2026' });
  assert.deepEqual(codesOf(st), ['862330000001', '862330000002', 'SPXVN00000004'], 'không mã nào bị xoá');
  assert.deepEqual(byCode(st)['862330000001'], ['862330000001', '862330000001', '27/10/2026', 'khop', 'shopee', 'Shop A', 'Đơn hàng', '29/10/2026']);
  assert.deepEqual(status(st), { 862330000001: 'khop', 862330000002: 'cho', SPXVN00000004: 'cho' });
  assert.deepEqual([st.info.soCho, st.info.soKhop], [2, 1]);
  assert.equal(st.lichSu[0].hanhDong, 'Đối soát Shopee');
  assert.match(st.lichSu[0].chiTiet, /chuyển 1 mã sang Đã khớp/);
  assert.equal(g.post(rec('lazada', [])).loi, 'BAD_SAN');
  assert.equal(g.post({ action: 'reconcile', san: 'shopee', nguoi: 'Lan', xoa: ['862330000002'] }).loi, 'OLD_CLIENT', 'trang cũ gửi "xoa" bị chặn');
  assert.equal(status(g.get())['862330000002'], 'cho');
});

test('Loại file lạ -> "Khác"; gian hàng được làm sạch', () => {
  const g = createGas();
  g.post(up([{ ma: 'AAAA1111' }]));
  const st = g.post(rec('tiktok', [{ ma: 'AAAA1111', gian: '<b>Gian\u0007 X</b>' + 'y'.repeat(100), loai: 'Xoá kho' }]));
  const r = byCode(st).AAAA1111;
  assert.equal(r[6], 'Khác');
  assert.ok(!/[<>\u0007]/.test(r[5]) && r[5].length <= 60);
});

test('Đối soát lại: mã đã "khop" giữ nguyên ngay_khop, sàn, gian, loại file cũ', () => {
  const g = createGas();
  g.post(up([{ ma: 'AAAA1111' }, { ma: 'BBBB2222' }]));
  g.post(rec('shopee', [k('AAAA1111', 'Gian cũ', 'Khiếu nại')]));
  g.state.now = new Date('2026-11-05T03:00:00Z');
  const st = g.post(rec('tiktok', [k('AAAA1111', 'Gian mới', 'Trả hàng'), k('BBBB2222', 'Gian T', 'Giao KTC')]));
  assert.deepEqual(st.ketQua, { khop: 1, daKhop: 1, khongCo: 0, gui: 2, ngayKhop: '05/11/2026' });
  assert.deepEqual(byCode(st).AAAA1111.slice(3), ['khop', 'shopee', 'Gian cũ', 'Khiếu nại', '27/10/2026']);
  assert.deepEqual(byCode(st).BBBB2222.slice(3), ['khop', 'tiktok', 'Gian T', 'Giao KTC', '05/11/2026']);
});

test('Chống nạp trùng: mã đã "khop" không bị đưa về "cho" khi nạp lại', () => {
  const g = createGas();
  g.post(up([{ ma: 'AAAA1111' }, { ma: 'BBBB2222' }]));
  g.post(rec('shopee', [k('AAAA1111')]));
  g.state.now = new Date('2026-11-01T03:00:00Z');
  const st = g.post(up([{ ma: 'AAAA1111' }, { ma: 'CCCC3333' }]));
  assert.deepEqual(st.ketQua, { them: 1, daCo: 0, bo: 0, daKhop: 1, loai: 0 });
  assert.equal(status(st).AAAA1111, 'khop');
  assert.equal(byCode(st).AAAA1111[7], '27/10/2026');
  assert.match(st.lichSu[0].chiTiet, /bỏ qua 1 mã đã khớp trước đó/);
});

test('Thay thế: chỉ thay phần "cho", mã "khop" giữ nguyên; cần đúng phiên bản', () => {
  const g = createGas();
  g.post(up([{ ma: 'AAAA1111' }, { ma: 'BBBB2222' }, { ma: 'KKKK0000' }]));
  const s1 = g.post(rec('shopee', [k('KKKK0000')]));
  g.state.now = new Date('2026-11-01T03:00:00Z');
  assert.equal(g.post(up([{ ma: 'CCCC3333' }], { cheDo: 'thay', phienBan: '0' })).loi, 'STALE');
  const st = g.post(up([{ ma: 'BBBB2222' }, { ma: 'CCCC3333' }, { ma: 'KKKK0000' }], { cheDo: 'thay', phienBan: s1.info.phienBan }));
  assert.equal(st.ok, true, st.thongBao);
  assert.deepEqual(codesOf(st), ['BBBB2222', 'CCCC3333', 'KKKK0000']);
  assert.deepEqual(status(st), { BBBB2222: 'cho', CCCC3333: 'cho', KKKK0000: 'khop' });
  assert.equal(byCode(st).BBBB2222[2], '27/10/2026');
  assert.deepEqual(st.ketQua, { them: 1, daCo: 1, bo: 1, daKhop: 1, loai: 0 });
});

test('Đối soát không đổi mã nào: không ghi đè bản Hoàn tác', () => {
  const g = createGas();
  g.post(up([{ ma: 'AAAA1111' }]));
  g.post(up([{ ma: 'BBBB2222' }]));
  const st = g.post(rec('tiktok', [k('ZZZZ9999')]));
  const u = g.post({ action: 'undo', nguoi: 'Hoa', phienBan: st.info.phienBan });
  assert.deepEqual(codesOf(u), ['AAAA1111']);
});

test('Hoàn tác khôi phục cả trạng thái và nhãn; bấm lần nữa để làm lại', () => {
  const g = createGas();
  g.post(up([{ ma: 'AAAA1111' }, { ma: 'BBBB2222' }]));
  const s2 = g.post(rec('tiktok', [k('AAAA1111', 'Gian T', 'Trả hàng')]));
  assert.equal(status(s2).AAAA1111, 'khop');
  const u1 = g.post({ action: 'undo', nguoi: 'Hoa', phienBan: s2.info.phienBan });
  assert.equal(u1.ok, true, u1.thongBao);
  assert.deepEqual(byCode(u1).AAAA1111.slice(3), ['cho', '', '', '', '']);
  const u2 = g.post({ action: 'undo', nguoi: 'Hoa', phienBan: u1.info.phienBan });
  assert.deepEqual(byCode(u2).AAAA1111.slice(3), ['khop', 'tiktok', 'Gian T', 'Trả hàng', '27/10/2026']);
  assert.equal(g.post({ action: 'undo', nguoi: 'Lan', phienBan: '999' }).loi, 'STALE');
  assert.equal(createGas().post({ action: 'undo', nguoi: 'Lan', phienBan: '0' }).loi, 'NO_UNDO');
});

test('Dọn kho: "cho" quá 60 ngày từ ngày đối soát, "khop" quá 60 ngày từ ngày khớp', () => {
  const g = createGas();
  g.state.now = new Date('2026-08-01T03:00:00Z');
  g.post(up([{ ma: 'CHO0000001' }, { ma: 'KHOP000001' }, { ma: 'KHOP000002' }]));   // ngày đối soát 01/08
  g.state.now = new Date('2026-09-10T03:00:00Z');
  g.post(rec('shopee', [k('KHOP000001')]));                                         // khớp 10/09
  g.state.now = new Date('2026-09-30T03:00:00Z');
  g.post(up([{ ma: 'CHO0000002' }]));                                               // ngày đối soát 30/09
  g.post(rec('tiktok', [k('KHOP000002')]));                                         // khớp 30/09 (đối soát 01/08)

  g.state.now = new Date('2026-09-30T20:00:00Z');   // 01/10 giờ VN: CHO0000001 đúng 61 ngày
  let r = g.ctx.donKho();
  assert.deepEqual([r.cho, r.khop], [1, 0]);
  assert.deepEqual(codesOf(g.get()), ['CHO0000002', 'KHOP000001', 'KHOP000002']);
  // 09/11: KHOP000001 khớp 10/09 -> 60 ngày, chưa dọn
  g.state.now = new Date('2026-11-09T03:00:00Z');
  r = g.ctx.donKho();
  assert.deepEqual([r.cho, r.khop], [0, 0]);
  // 10/11: KHOP000001 = 61 ngày -> dọn. KHOP000002 (đối soát 01/08, khớp 30/09) vẫn giữ: tính từ ngày khớp
  g.state.now = new Date('2026-11-10T03:00:00Z');
  r = g.ctx.donKho();
  assert.deepEqual([r.cho, r.khop], [0, 1]);
  const st = g.get();
  assert.deepEqual(codesOf(st), ['CHO0000002', 'KHOP000002']);
  assert.equal(st.lichSu[0].hanhDong, 'Dọn kho');
  assert.match(st.lichSu[0].chiTiet, /xoá 0 mã Chờ đối soát, 1 mã Đã khớp/);
  // Dọn xong vẫn hoàn tác được
  const u = g.post({ action: 'undo', nguoi: 'Lan', phienBan: st.info.phienBan });
  assert.deepEqual(codesOf(u), ['CHO0000002', 'KHOP000001', 'KHOP000002']);
  g.state.lockFree = false;
  assert.throws(() => g.ctx.donKho(), /đang ghi kho/);
});

test('taoTriggerDonKho: một trigger hằng ngày 2 giờ sáng giờ VN, chạy lại không nhân đôi', () => {
  const g = createGas();
  g.ctx.taoTriggerDonKho();
  g.ctx.taoTriggerDonKho();
  assert.equal(g.state.triggers.length, 1);
  assert.deepEqual([g.state.triggers[0].fn, g.state.triggers[0].everyDays, g.state.triggers[0].atHour, g.state.triggers[0].tz],
    ['donKho', 1, 2, 'Asia/Ho_Chi_Minh']);
});

test('Migrate: kho cũ 5 cột -> "cho", giữ ngày; chạy lại nhiều lần vẫn an toàn', () => {
  const g = createGas();
  const old = ['ma_sach', 'ma_goc', 'ngay_doi_soat', 'nguoi_tai', 'thoi_gian_tai'];
  for (const name of ['KHO', 'KHO_TRUOC']) {
    const sh = g.ctx.SpreadsheetApp.getActiveSpreadsheet().insertSheet(name);
    sh.getRange(1, 1, 1, 5).setValues([old]);
    sh.getRange(2, 1, 2, 5).setNumberFormat('@');
    sh.getRange(2, 1, 2, 5).setValues([['012345678901', '012345678901', '03/10/2026', 'Lan', '2026-10-03T01:00:00Z'],
      ['SPXVN0001', 'SPXVN-0001', '20/10/2026', 'Minh', '2026-10-20T01:00:00Z']]);
  }
  const m1 = g.ctx.migrate();
  assert.equal(m1.daChuyen, 2);
  const m2 = g.ctx.migrate();
  assert.equal(m2.daChuyen, 0, 'lần 2 không làm gì');
  const st = g.get();
  assert.deepEqual(g.sheets.KHO.data[0].slice(0, 8), KHO_HEADER);
  assert.deepEqual(st.kho.sort(), [['012345678901', '012345678901', '03/10/2026', 'cho', '', '', '', ''],
    ['SPXVN0001', 'SPXVN-0001', '20/10/2026', 'cho', '', '', '', '']]);
  assert.ok(!JSON.stringify(g.sheets.KHO.data).includes('Lan'), 'cột người tải cũ đã bỏ');
  assert.equal(st.lichSu.filter((h) => h.hanhDong === 'Chuyển đổi dữ liệu').length, 1);
  assert.deepEqual(g.sheets.KHO_TRUOC.data[0].slice(0, 8), KHO_HEADER);
});

test('Migrate tự chạy ở lần gọi đầu (GET), mọi mã cũ thành "cho"', () => {
  const g = createGas();
  const sh = g.ctx.SpreadsheetApp.getActiveSpreadsheet().insertSheet('KHO');
  sh.getRange(1, 1, 1, 5).setValues([['ma_sach', 'ma_goc', 'ngay_doi_soat', 'nguoi_tai', 'thoi_gian_tai']]);
  sh.getRange(2, 1, 1, 5).setNumberFormat('@');
  sh.getRange(2, 1, 1, 5).setValues([['AAAA1111', 'AAAA1111', '01/10/2026', 'Lan', 'x']]);
  const st = g.get();
  assert.deepEqual(st.kho, [['AAAA1111', 'AAAA1111', '01/10/2026', 'cho', '', '', '', '']]);
  assert.equal(st.info.soCho, 1);
});

test('Kho lớn (12.000 mã): ghi theo lô ≤ 2.000 dòng mỗi lần', () => {
  const g = createGas();
  const items = Array.from({ length: 12000 }, (_, i) => ({ ma: 'MA' + String(i).padStart(8, '0') }));
  const st = g.post(up(items));
  assert.equal(st.ok, true, st.thongBao);
  assert.equal(st.info.soMa, 12000);
  assert.ok(g.sheets.KHO.maxRowsPerWrite <= 2000);
  const r = g.post(rec('tiktok', items.slice(0, 5000).map((x) => k(x.ma))));
  assert.equal(r.ketQua.khop, 5000);
  assert.equal(r.info.soKhop, 5000);
  assert.ok(g.sheets.KHO_TRUOC.maxRowsPerWrite <= 2000);
});

test('Kiểm tra đầu vào: JSON hỏng, thiếu tên, quá lớn, hành động lạ, khoá bận', () => {
  const g = createGas();
  assert.equal(g.post('{không phải json').loi, 'BAD_JSON');
  assert.equal(g.post('[1,2]').loi, 'BAD_JSON');
  assert.equal(g.post(up([{ ma: 'AAAA1111' }], { nguoi: '   ' })).loi, 'NO_NAME');
  assert.equal(g.post(up([{ ma: 'AAAA1111' }], { cheDo: 'xoa_het' })).loi, 'BAD_MODE');
  assert.equal(g.post(up('AAAA1111')).loi, 'BAD_ITEMS');
  assert.equal(g.post(up([{ ma: '!!' }])).loi, 'NO_ITEMS');
  assert.equal(g.post(rec('shopee', 'AAAA1111')).loi, 'BAD_ITEMS');
  assert.equal(g.post({ action: 'drop' }).loi, 'BAD_ACTION');
  assert.equal(g.post('x'.repeat(4000001)).loi, 'TOO_BIG');
  const many = Array.from({ length: 20001 }, (_, i) => ({ ma: 'MA' + String(i).padStart(6, '0') }));
  assert.equal(g.post(up(many)).loi, 'TOO_MANY');
  assert.equal(g.post(rec('shopee', many)).loi, 'TOO_MANY');
  g.state.lockFree = false;
  assert.equal(g.post(up([{ ma: 'AAAA1111' }])).loi, 'BUSY');
  assert.equal(g.get().loi, 'BUSY');
});

test('Lịch sử chỉ giữ 500 dòng gần nhất, GET trả 30 dòng mới nhất trước', () => {
  const g = createGas();
  g.post(up([{ ma: 'AAAA1111' }]));
  for (let i = 0; i < 510; i++) g.post(rec('tiktok', [k('ZZZZ' + String(i).padStart(4, '0'))]));
  assert.equal(g.sheets.LICH_SU.getLastRow() - 1, 500);
  assert.equal(g.get().lichSu.length, 30);
});
