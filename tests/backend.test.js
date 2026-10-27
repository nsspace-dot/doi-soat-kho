'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGas } = require('./gas-mock.js');

const up = (items, extra) => Object.assign({ action: 'upload', cheDo: 'gop', nguoi: 'Lan', items }, extra);
const codesOf = (st) => st.kho.map((r) => r[0]).sort();

test('GET kho trống: tự tạo sheet, chưa có lần tải', () => {
  const g = createGas();
  const st = g.get();
  assert.equal(st.ok, true);
  assert.deepEqual(st.kho, []);
  assert.equal(st.info.lanTaiCuoi, null);
  assert.equal(st.info.soMa, 0);
  assert.ok(g.sheets.KHO && g.sheets.THONG_TIN && g.sheets.LICH_SU);
  assert.deepEqual(g.sheets.KHO.data[0], ['ma_sach', 'ma_goc', 'ngay_doi_soat', 'nguoi_tai', 'thoi_gian_tai']);
});

test('Tải kho (gộp): mã mới nhận ngày hôm nay, giữ mã có số 0 đầu dạng chữ', () => {
  const g = createGas();
  const st = g.post(up([{ ma: '012345678901', goc: '012345678901' }, { ma: 'spxvn-0001', goc: 'SPXVN-0001' }, { ma: 'AB' }]));
  assert.equal(st.ok, true, st.thongBao);
  assert.deepEqual(st.ketQua, { them: 2, daCo: 0, bo: 0, loai: 1 });
  assert.deepEqual(codesOf(st), ['012345678901', 'SPXVN0001']);
  assert.ok(st.kho.every((r) => r[2] === '27/10/2026' && r[3] === 'Lan'));
  assert.equal(st.info.lanTaiCuoi.nguoi, 'Lan');
  assert.equal(st.info.lanTaiCuoi.soMa, 2);
  assert.equal(st.lichSu[0].hanhDong, 'Tải kho (gộp)');
});

test('Gộp lần 2: mã đã có giữ ngày đối soát cũ', () => {
  const g = createGas();
  g.post(up([{ ma: '862330000001' }]));
  g.state.now = new Date('2026-11-03T03:00:00Z');
  const st = g.post(up([{ ma: '862330000001' }, { ma: '862330000002' }], { nguoi: 'Minh' }));
  const map = Object.fromEntries(st.kho.map((r) => [r[0], r]));
  assert.equal(map['862330000001'][2], '27/10/2026');
  assert.equal(map['862330000001'][3], 'Lan');
  assert.equal(map['862330000002'][2], '03/11/2026');
  assert.equal(st.info.lanTaiCuoi.nguoi, 'Minh');
});

test('Ngày mang theo (chuyển Sổ mã cũ): chỉ nhận ngày hợp lệ, không tương lai, không quá cũ', () => {
  const g = createGas();
  const st = g.post(up([
    { ma: 'AAAA1111', ngay: '03/10/2026' },
    { ma: 'AAAA2222', ngay: '31/02/2026' },
    { ma: 'AAAA3333', ngay: '01/12/2026' },
    { ma: 'AAAA4444', ngay: '01/01/2020' },
    { ma: 'AAAA5555', ngay: '<script>' }
  ]));
  const d = Object.fromEntries(st.kho.map((r) => [r[0], r[2]]));
  assert.deepEqual(d, { AAAA1111: '03/10/2026', AAAA2222: '27/10/2026', AAAA3333: '27/10/2026', AAAA4444: '27/10/2026', AAAA5555: '27/10/2026' });
  // Gộp với ngày sớm hơn -> lấy ngày cũ nhất
  const st2 = g.post(up([{ ma: 'AAAA2222', ngay: '20/10/2026' }]));
  assert.equal(st2.kho.find((r) => r[0] === 'AAAA2222')[2], '20/10/2026');
});

test('Thay thế kho: cần đúng phiên bản, mã còn lại giữ ngày cũ', () => {
  const g = createGas();
  const s1 = g.post(up([{ ma: 'AAAA1111' }, { ma: 'BBBB2222' }]));
  g.state.now = new Date('2026-11-01T03:00:00Z');
  const stale = g.post(up([{ ma: 'CCCC3333' }], { cheDo: 'thay', phienBan: '0' }));
  assert.equal(stale.ok, false);
  assert.equal(stale.loi, 'STALE');
  const st = g.post(up([{ ma: 'BBBB2222' }, { ma: 'CCCC3333' }], { cheDo: 'thay', phienBan: s1.info.phienBan }));
  assert.equal(st.ok, true, st.thongBao);
  assert.deepEqual(codesOf(st), ['BBBB2222', 'CCCC3333']);
  assert.equal(st.kho.find((r) => r[0] === 'BBBB2222')[2], '27/10/2026');
  assert.equal(st.kho.find((r) => r[0] === 'CCCC3333')[2], '01/11/2026');
  assert.deepEqual(st.ketQua, { them: 1, daCo: 1, bo: 1, loai: 0 });
});

test('Đối soát: chỉ xoá mã gửi lên có trong kho, ghi lịch sử theo sàn', () => {
  const g = createGas();
  g.post(up(['862330000001', '862330000002', 'SPXVN00000004'].map((ma) => ({ ma }))));
  const st = g.post({ action: 'reconcile', san: 'shopee', nguoi: 'Lan', xoa: ['862330000001', 'KHONGCOTRONGKHO', '!!'] });
  assert.equal(st.ok, true, st.thongBao);
  assert.deepEqual(st.ketQua, { xoa: 1, gui: 2 });
  assert.deepEqual(codesOf(st), ['862330000002', 'SPXVN00000004']);
  assert.equal(st.lichSu[0].hanhDong, 'Đối soát Shopee');
  assert.match(st.lichSu[0].chiTiet, /xoá 1 mã đã khớp/);
  assert.equal(st.info.lanTaiCuoi.nguoi, 'Lan', 'đối soát không đổi "Tải lần cuối"');
  const bad = g.post({ action: 'reconcile', san: 'lazada', nguoi: 'Lan', xoa: [] });
  assert.equal(bad.loi, 'BAD_SAN');
});

test('Đối soát không xoá được mã nào: không ghi đè bản Hoàn tác', () => {
  const g = createGas();
  g.post(up([{ ma: 'AAAA1111' }]));
  const s2 = g.post(up([{ ma: 'BBBB2222' }]));
  const st = g.post({ action: 'reconcile', san: 'tiktok', nguoi: 'Hoa', xoa: ['ZZZZ9999'] });
  assert.equal(st.info.phienBan, s2.info.phienBan);
  const u = g.post({ action: 'undo', nguoi: 'Hoa', phienBan: st.info.phienBan });
  assert.deepEqual(codesOf(u), ['AAAA1111']);
});

test('Hoàn tác: về trạng thái trước lần ghi gần nhất, bấm lần nữa để làm lại', () => {
  const g = createGas();
  g.post(up([{ ma: 'AAAA1111' }]));
  g.state.now = new Date('2026-10-28T03:00:00Z');
  const s2 = g.post(up([{ ma: 'BBBB2222' }], { nguoi: 'Minh' }));
  const s3 = g.post({ action: 'reconcile', san: 'tiktok', nguoi: 'Hoa', xoa: ['AAAA1111'] });
  assert.deepEqual(codesOf(s3), ['BBBB2222']);
  const u1 = g.post({ action: 'undo', nguoi: 'Hoa', phienBan: s3.info.phienBan });
  assert.equal(u1.ok, true, u1.thongBao);
  assert.deepEqual(codesOf(u1), ['AAAA1111', 'BBBB2222']);
  assert.equal(u1.info.lanTaiCuoi.nguoi, 'Minh');
  const u2 = g.post({ action: 'undo', nguoi: 'Hoa', phienBan: u1.info.phienBan });
  assert.deepEqual(codesOf(u2), ['BBBB2222']);
  // Hoàn tác lần tải: "Tải lần cuối" quay về người trước
  const g2 = createGas();
  g2.post(up([{ ma: 'AAAA1111' }]));
  const t2 = g2.post(up([{ ma: 'BBBB2222' }], { nguoi: 'Minh' }));
  const tu = g2.post({ action: 'undo', nguoi: 'Lan', phienBan: t2.info.phienBan });
  assert.equal(tu.info.lanTaiCuoi.nguoi, 'Lan');
  assert.deepEqual(codesOf(tu), ['AAAA1111']);
  assert.equal(g2.post({ action: 'undo', nguoi: 'Lan', phienBan: '999' }).loi, 'STALE');
  assert.equal(createGas().post({ action: 'undo', nguoi: 'Lan', phienBan: '0' }).loi, 'NO_UNDO');
});

test('Kiểm tra đầu vào: JSON hỏng, thiếu tên, quá lớn, hành động lạ, khoá bận', () => {
  const g = createGas();
  assert.equal(g.post('{không phải json').loi, 'BAD_JSON');
  assert.equal(g.post('[1,2]').loi, 'BAD_JSON');
  assert.equal(g.post(up([{ ma: 'AAAA1111' }], { nguoi: '   ' })).loi, 'NO_NAME');
  assert.equal(g.post(up([{ ma: 'AAAA1111' }], { cheDo: 'xoa_het' })).loi, 'BAD_MODE');
  assert.equal(g.post(up('AAAA1111')).loi, 'BAD_ITEMS');
  assert.equal(g.post(up([{ ma: '!!' }])).loi, 'NO_ITEMS');
  assert.equal(g.post({ action: 'drop' }).loi, 'BAD_ACTION');
  assert.equal(g.post('x'.repeat(3000001)).loi, 'TOO_BIG');
  const many = Array.from({ length: 20001 }, (_, i) => ({ ma: 'MA' + String(i).padStart(6, '0') }));
  assert.equal(g.post(up(many)).loi, 'TOO_MANY');
  g.state.lockFree = false;
  assert.equal(g.post(up([{ ma: 'AAAA1111' }])).loi, 'BUSY');
  assert.equal(g.get().loi, 'BUSY');
});

test('Làm sạch dữ liệu hiển thị: tên và mã gốc lạ không lọt vào kho', () => {
  const g = createGas();
  const st = g.post(up([{ ma: 'AAAA1111', goc: '<img/src/onerror=x>' }, { ma: 'BBBB2222', goc: 'bbbb-2222' }],
    { nguoi: '<b>Lan</b>\u0007 ' + 'x'.repeat(100) }));
  const r = Object.fromEntries(st.kho.map((x) => [x[0], x]));
  assert.equal(r.AAAA1111[1], 'AAAA1111');
  assert.equal(r.BBBB2222[1], 'bbbb-2222');
  assert.ok(!/[<>]/.test(r.AAAA1111[3]));
  assert.ok(r.AAAA1111[3].length <= 40);
});

test('Lịch sử chỉ giữ 500 dòng gần nhất, GET trả 30 dòng mới nhất trước', () => {
  const g = createGas();
  g.post(up([{ ma: 'AAAA1111' }]));
  for (let i = 0; i < 510; i++) g.post({ action: 'reconcile', san: 'tiktok', nguoi: 'N' + i, xoa: [] });
  assert.equal(g.sheets.LICH_SU.getLastRow() - 1, 500);
  const st = g.get();
  assert.equal(st.lichSu.length, 30);
  assert.equal(st.lichSu[0].nguoi, 'N509');
});

test('Ghi đồng thời qua khoá: hai lần gộp liên tiếp không đè nhau', () => {
  const g = createGas();
  g.post(up([{ ma: 'AAAA1111' }], { nguoi: 'A' }));
  g.post(up([{ ma: 'BBBB2222' }], { nguoi: 'B' }));
  assert.deepEqual(codesOf(g.get()), ['AAAA1111', 'BBBB2222']);
});
