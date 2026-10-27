/* =====================================================================
   KHO CHUNG ĐỐI SOÁT — Google Apps Script (Web app)
   Triển khai: Deploy > New deployment > Web app
     Execute as: Me   ·   Who has access: Anyone
   Script phải GẮN với một Google Sheet riêng (Extensions > Apps Script),
   tách hoàn toàn khỏi các bảng tính khác.

   Sheet được tự tạo khi cần:
     KHO        ma_sach | ma_goc | ngay_doi_soat | nguoi_tai | thoi_gian_tai
     KHO_TRUOC  bản sao KHO trước lần ghi gần nhất (để Hoàn tác)
     THONG_TIN  khoa | gia_tri  (lần tải cuối, phiên bản, ...)
     LICH_SU    thoi_gian | nguoi | hanh_dong | chi_tiet  (giữ ~500 dòng mới nhất)

   API (không xác thực, không tin dữ liệu gửi lên):
     GET  ?               -> { ok, kho, info, lichSu, homNay }
     POST text/plain JSON -> { action: 'upload' | 'reconcile' | 'undo', ... }
   ===================================================================== */

var TZ = 'Asia/Ho_Chi_Minh';
var SHEET_KHO = 'KHO', SHEET_KHO_TRUOC = 'KHO_TRUOC', SHEET_INFO = 'THONG_TIN', SHEET_LS = 'LICH_SU';
var KHO_HEADER = ['ma_sach', 'ma_goc', 'ngay_doi_soat', 'nguoi_tai', 'thoi_gian_tai'];
var INFO_HEADER = ['khoa', 'gia_tri'];
var LS_HEADER = ['thoi_gian', 'nguoi', 'hanh_dong', 'chi_tiet'];
var LIMITS = {
  BODY_CHARS: 3000000,   // ~3 MB JSON
  ITEMS: 20000,          // số mã tối đa mỗi lần tải / mỗi lần xoá
  KHO_ROWS: 60000,       // số mã tối đa trong kho
  NAME: 40,
  LICH_SU: 500,
  LICH_SU_TRA_VE: 30,
  NGAY_CU_NHAT: 3        // năm: ngày đối soát mang theo không được cũ hơn
};
var CODE_RE = /^[A-Z0-9]{4,40}$/;
var SAN = { shopee: 'Shopee', tiktok: 'TikTok' };

/* ============================== HTTP =============================== */

function doGet(e) {
  return out_(safely_(function () {
    return withLock_(function () { return readState_(); });
  }));
}

function doPost(e) {
  return out_(safely_(function () {
    var body = parseBody_(e);
    return withLock_(function () { return dispatch_(body); });
  }));
}

function dispatch_(body) {
  switch (body.action) {
    case 'upload': return actionUpload_(body);
    case 'reconcile': return actionReconcile_(body);
    case 'undo': return actionUndo_(body);
    default: throw userError_('BAD_ACTION', 'Hành động không hợp lệ.');
  }
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function safely_(fn) {
  try {
    return fn();
  } catch (err) {
    if (err && err.userCode) return { ok: false, loi: err.userCode, thongBao: err.message };
    return { ok: false, loi: 'SERVER', thongBao: 'Lỗi máy chủ: ' + (err && err.message ? err.message : err) };
  }
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw userError_('BUSY', 'Có người khác đang ghi kho. Đợi vài giây rồi thử lại.');
  try { return fn(); } finally { lock.releaseLock(); }
}

function userError_(code, msg) {
  var e = new Error(msg);
  e.userCode = code;
  return e;
}

function parseBody_(e) {
  var raw = e && e.postData && typeof e.postData.contents === 'string' ? e.postData.contents : '';
  if (!raw) throw userError_('BAD_JSON', 'Không có dữ liệu gửi lên.');
  if (raw.length > LIMITS.BODY_CHARS) throw userError_('TOO_BIG', 'Dữ liệu gửi lên quá lớn.');
  var body;
  try { body = JSON.parse(raw); } catch (err) { throw userError_('BAD_JSON', 'Dữ liệu gửi lên không đúng định dạng.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw userError_('BAD_JSON', 'Dữ liệu gửi lên không đúng định dạng.');
  return body;
}

function now_() { return new Date(); }

/* ======================= LOGIC THUẦN (có test) ===================== */

function cleanCode_(v) {
  return String(v === null || v === undefined ? '' : v).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function validName_(v) {
  var s = String(v === null || v === undefined ? '' : v).replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim();
  if (!s) throw userError_('NO_NAME', 'Thiếu tên người thực hiện.');
  return s.slice(0, LIMITS.NAME);
}

// Mã gốc chỉ để hiển thị; nếu lạ thì dùng mã sạch.
function validGoc_(goc, ma) {
  var s = String(goc === null || goc === undefined ? '' : goc).trim();
  if (!s || s.length > 64 || /[\s<>"'&`]/.test(s) || cleanCode_(s) !== ma) return ma;
  return s;
}

function pad2_(n) { return (n < 10 ? '0' : '') + n; }

// dd/mm/yyyy hợp lệ -> số yyyymmdd, ngược lại null.
function dateKey_(s) {
  var m = String(s || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  var d = +m[1], mo = +m[2], y = +m[3];
  var t = new Date(Date.UTC(y, mo - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null;
  return y * 10000 + mo * 100 + d;
}

function fmtKey_(k) {
  return pad2_(k % 100) + '/' + pad2_(Math.floor(k / 100) % 100) + '/' + Math.floor(k / 10000);
}

function todayStr_(now) { return Utilities.formatDate(now, TZ, 'dd/MM/yyyy'); }

/* Kiểm tra danh sách mã gửi lên. Ngày mang theo (chuyển từ Sổ mã cũ) chỉ được
   nhận khi hợp lệ, không ở tương lai và không quá cũ.                       */
function sanitizeItems_(items, today) {
  if (!Array.isArray(items)) throw userError_('BAD_ITEMS', 'Danh sách mã không hợp lệ.');
  if (items.length > LIMITS.ITEMS) throw userError_('TOO_MANY', 'Mỗi lần tối đa ' + LIMITS.ITEMS + ' mã.');
  var tk = dateKey_(today), minK = tk - LIMITS.NGAY_CU_NHAT * 10000;
  var seen = {}, out = [], rejected = 0;
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var ma = cleanCode_(it && typeof it === 'object' ? it.ma : it);
    if (!CODE_RE.test(ma)) { rejected++; continue; }
    if (seen[ma]) continue;
    seen[ma] = true;
    var ngay = null;
    if (it && typeof it === 'object' && it.ngay) {
      var k = dateKey_(it.ngay);
      if (k !== null && k <= tk && k >= minK) ngay = fmtKey_(k);
    }
    out.push({ ma: ma, goc: validGoc_(it && it.goc, ma), ngay: ngay });
  }
  return { items: out, rejected: rejected };
}

function olderDate_(a, b) {
  var ka = dateKey_(a), kb = dateKey_(b);
  if (ka === null) return b;
  if (kb === null) return a;
  return kb < ka ? b : a;
}

/* Gộp / thay thế kho.
   - gop:  mã đã có giữ nguyên ngày đối soát (lấy ngày cũ hơn nếu file mang
           ngày sớm hơn), mã mới nhận ngày hôm nay (hoặc ngày mang theo).
   - thay: kho chỉ còn đúng các mã gửi lên; mã đã có vẫn giữ ngày cũ.        */
function mergeKho_(current, items, mode, nguoi, nowIso, today) {
  var byCode = {};
  current.forEach(function (r) { byCode[r[0]] = r; });
  var rows = mode === 'thay' ? [] : current.map(function (r) { return r.slice(); });
  var idx = {};
  rows.forEach(function (r, i) { idx[r[0]] = i; });
  var added = 0, existed = 0;
  items.forEach(function (it) {
    var old = byCode[it.ma];
    if (old) {
      existed++;
      var keep = old.slice();
      if (it.ngay) keep[2] = olderDate_(keep[2], it.ngay);
      if (mode === 'thay') rows.push(keep); else rows[idx[it.ma]] = keep;
    } else {
      added++;
      rows.push([it.ma, it.goc, it.ngay || today, nguoi, nowIso]);
    }
  });
  var removed = mode === 'thay' ? current.length - existed : 0;
  return { rows: rows, added: added, existed: existed, removed: removed };
}

// Chỉ xoá những mã vừa có trong kho vừa có trong danh sách gửi lên.
function removeCodes_(current, codes) {
  var del = {};
  codes.forEach(function (c) { del[c] = true; });
  var removed = [];
  var rows = current.filter(function (r) {
    if (del[r[0]]) { removed.push(r[0]); return false; }
    return true;
  });
  return { rows: rows, removed: removed };
}

/* ============================ HÀNH ĐỘNG ============================ */

function actionUpload_(body) {
  var nguoi = validName_(body.nguoi);
  var mode = body.cheDo === 'thay' ? 'thay' : (body.cheDo === 'gop' ? 'gop' : null);
  if (!mode) throw userError_('BAD_MODE', 'Chế độ lưu phải là "gop" hoặc "thay".');
  var now = now_(), today = todayStr_(now), nowIso = now.toISOString();
  var s = sanitizeItems_(body.items, today);
  if (!s.items.length) throw userError_('NO_ITEMS', 'Không có mã hợp lệ nào để lưu.');

  var info = readInfo_();
  if (mode === 'thay') checkVersion_(info, body.phienBan);
  var before = readKho_(SHEET_KHO);
  var res = mergeKho_(before, s.items, mode, nguoi, nowIso, today);
  if (res.rows.length > LIMITS.KHO_ROWS) throw userError_('KHO_FULL', 'Kho vượt quá ' + LIMITS.KHO_ROWS + ' mã.');

  info.lan_tai_cuoi = nowIso;
  info.nguoi_tai_cuoi = nguoi;
  info.so_ma_tai_cuoi = String(s.items.length);
  var detail = (mode === 'thay' ? 'Thay thế kho' : 'Gộp vào kho') + ': gửi ' + s.items.length + ' mã, thêm mới ' + res.added +
    ', đã có ' + res.existed + (mode === 'thay' ? ', bỏ ' + res.removed : '') +
    (s.rejected ? ', loại ' + s.rejected + ' mã sai' : '') + '. Kho còn ' + res.rows.length + ' mã.';
  commit_(info, before, res.rows, nguoi, mode === 'thay' ? 'Tải kho (thay thế)' : 'Tải kho (gộp)', detail, now);
  var st = readState_();
  st.ketQua = { them: res.added, daCo: res.existed, bo: res.removed, loai: s.rejected };
  return st;
}

function actionReconcile_(body) {
  var nguoi = validName_(body.nguoi);
  var san = SAN[body.san];
  if (!san) throw userError_('BAD_SAN', 'Sàn không hợp lệ.');
  if (!Array.isArray(body.xoa)) throw userError_('BAD_ITEMS', 'Danh sách mã cần xoá không hợp lệ.');
  if (body.xoa.length > LIMITS.ITEMS) throw userError_('TOO_MANY', 'Mỗi lần tối đa ' + LIMITS.ITEMS + ' mã.');
  var codes = [];
  body.xoa.forEach(function (c) { c = cleanCode_(c); if (CODE_RE.test(c)) codes.push(c); });
  var now = now_();
  var info = readInfo_();
  var before = readKho_(SHEET_KHO);
  var res = removeCodes_(before, codes);
  var detail = 'Đối soát ' + san + ': xoá ' + res.removed.length + ' mã đã khớp (gửi ' + codes.length + '), thêm 0. Kho còn ' + res.rows.length + ' mã.';
  if (res.removed.length) {
    commit_(info, before, res.rows, nguoi, 'Đối soát ' + san, detail, now);
  } else {
    // Không đổi kho -> không ghi đè bản Hoàn tác, chỉ ghi lịch sử.
    addHistory_(now, nguoi, 'Đối soát ' + san, detail);
  }
  var st = readState_();
  st.ketQua = { xoa: res.removed.length, gui: codes.length };
  return st;
}

function actionUndo_(body) {
  var nguoi = validName_(body.nguoi);
  var info = readInfo_();
  if (info.co_ban_truoc !== '1') throw userError_('NO_UNDO', 'Không có bản trước để hoàn tác.');
  checkVersion_(info, body.phienBan);
  var now = now_();
  var cur = readKho_(SHEET_KHO), prev = readKho_(SHEET_KHO_TRUOC);
  var prevInfo = {};
  try { prevInfo = JSON.parse(info.ban_truoc_thong_tin || '{}') || {}; } catch (err) { prevInfo = {}; }
  var curUpload = uploadInfo_(info);

  writeKho_(SHEET_KHO_TRUOC, cur);
  writeKho_(SHEET_KHO, prev);
  ['lan_tai_cuoi', 'nguoi_tai_cuoi', 'so_ma_tai_cuoi'].forEach(function (k) { info[k] = prevInfo[k] || ''; });
  info.ban_truoc_thong_tin = JSON.stringify(curUpload);
  bumpWrite_(info, nguoi, 'Hoàn tác', now);
  writeInfo_(info);
  addHistory_(now, nguoi, 'Hoàn tác', 'Đưa kho về bản trước lần ghi gần nhất: ' + cur.length + ' -> ' + prev.length +
    ' mã. Bấm Hoàn tác lần nữa để làm lại.');
  var st = readState_();
  st.ketQua = { truoc: cur.length, sau: prev.length };
  return st;
}

function checkVersion_(info, phienBan) {
  if (String(phienBan) !== String(info.phien_ban || '0')) {
    throw userError_('STALE', 'Kho vừa được người khác thay đổi. Bấm "Làm mới" để xem bản mới nhất rồi thử lại.');
  }
}

function uploadInfo_(info) {
  return { lan_tai_cuoi: info.lan_tai_cuoi || '', nguoi_tai_cuoi: info.nguoi_tai_cuoi || '', so_ma_tai_cuoi: info.so_ma_tai_cuoi || '' };
}

function bumpWrite_(info, nguoi, hanhDong, now) {
  info.phien_ban = String((parseInt(info.phien_ban, 10) || 0) + 1);
  info.ghi_cuoi = now.toISOString();
  info.nguoi_ghi_cuoi = nguoi;
  info.hanh_dong_cuoi = hanhDong;
}

// Lưu bản sao trước khi ghi (để Hoàn tác) rồi ghi kho mới + thông tin + lịch sử.
// info.__goc là thông tin lần tải cuối lúc vừa đọc (trước khi hành động sửa info).
function commit_(info, before, after, nguoi, hanhDong, detail, now) {
  writeKho_(SHEET_KHO_TRUOC, before);
  info.ban_truoc_thong_tin = JSON.stringify(info.__goc);
  info.co_ban_truoc = '1';
  writeKho_(SHEET_KHO, after);
  bumpWrite_(info, nguoi, hanhDong, now);
  writeInfo_(info);
  addHistory_(now, nguoi, hanhDong, detail);
}

/* ============================ SHEET I/O ============================ */

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function sheet_(name, header) {
  var ss = ss_();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, header.length).setValues([header]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function readKho_(name) {
  var sh = sheet_(name, KHO_HEADER);
  var last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, KHO_HEADER.length).getDisplayValues()
    .filter(function (r) { return r[0]; })
    .map(function (r) { return r.map(function (v) { return String(v); }); });
}

function writeKho_(name, rows) {
  var sh = sheet_(name, KHO_HEADER);
  var last = sh.getLastRow();
  if (last >= 2) sh.getRange(2, 1, last - 1, KHO_HEADER.length).clearContent();
  if (!rows.length) return;
  var rg = sh.getRange(2, 1, rows.length, KHO_HEADER.length);
  rg.setNumberFormat('@');   // giữ mã và ngày dạng chữ (không mất số 0 đầu, không đổi thành ngày)
  rg.setValues(rows);
}

function readInfo_() {
  var sh = sheet_(SHEET_INFO, INFO_HEADER);
  var last = sh.getLastRow(), info = {};
  if (last >= 2) sh.getRange(2, 1, last - 1, 2).getDisplayValues().forEach(function (r) { if (r[0]) info[r[0]] = String(r[1]); });
  info.__goc = uploadInfo_(info);
  return info;
}

function writeInfo_(info) {
  var sh = sheet_(SHEET_INFO, INFO_HEADER);
  var keys = Object.keys(info).filter(function (k) { return k.indexOf('__') !== 0; }).sort();
  var last = sh.getLastRow();
  if (last >= 2) sh.getRange(2, 1, last - 1, 2).clearContent();
  if (!keys.length) return;
  var rg = sh.getRange(2, 1, keys.length, 2);
  rg.setNumberFormat('@');
  rg.setValues(keys.map(function (k) { return [k, info[k]]; }));
}

function addHistory_(now, nguoi, hanhDong, detail) {
  var sh = sheet_(SHEET_LS, LS_HEADER);
  var last = sh.getLastRow();
  var rg = sh.getRange(last + 1, 1, 1, LS_HEADER.length);
  rg.setNumberFormat('@');
  rg.setValues([[now.toISOString(), nguoi, hanhDong, detail]]);
  var count = last;   // số dòng dữ liệu sau khi thêm = (last + 1) - 1
  if (count > LIMITS.LICH_SU) sh.deleteRows(2, count - LIMITS.LICH_SU);
}

function readHistory_(n) {
  var sh = sheet_(SHEET_LS, LS_HEADER);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var from = Math.max(2, last - n + 1);
  return sh.getRange(from, 1, last - from + 1, LS_HEADER.length).getDisplayValues().reverse()
    .map(function (r) { return { thoiGian: r[0], nguoi: r[1], hanhDong: r[2], chiTiet: r[3] }; });
}

function readState_() {
  var kho = readKho_(SHEET_KHO);
  var info = readInfo_();
  return {
    ok: true,
    homNay: todayStr_(now_()),
    kho: kho,
    info: {
      phienBan: info.phien_ban || '0',
      soMa: kho.length,
      lanTaiCuoi: info.lan_tai_cuoi ? { thoiGian: info.lan_tai_cuoi, nguoi: info.nguoi_tai_cuoi || '', soMa: +info.so_ma_tai_cuoi || 0 } : null,
      ghiCuoi: info.ghi_cuoi ? { thoiGian: info.ghi_cuoi, nguoi: info.nguoi_ghi_cuoi || '', hanhDong: info.hanh_dong_cuoi || '' } : null,
      coBanTruoc: info.co_ban_truoc === '1'
    },
    lichSu: readHistory_(LIMITS.LICH_SU_TRA_VE)
  };
}
