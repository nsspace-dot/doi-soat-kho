/* =====================================================================
   KHO CHUNG ĐỐI SOÁT — Google Apps Script (Web app)
   Triển khai: Deploy > New deployment > Web app
     Execute as: Me   ·   Who has access: Anyone
   Script phải GẮN với một Google Sheet riêng (Extensions > Apps Script).

   MÔ HÌNH "KHÔNG XOÁ, CHỈ ĐỔI TRẠNG THÁI":
     mỗi mã có trang_thai 'cho' (Chờ đối soát) hoặc 'khop' (Đã khớp).
     Đối soát chuyển mã 'cho' -> 'khop' và ghi sàn / gian hàng / loại file /
     ngày khớp. Mã chỉ rời kho khi bị dọn tự động (donKho) sau 60 ngày.

   Sheet (tự tạo / tự chuyển đổi khi cần):
     KHO        ma_sach | ma_goc | ngay_doi_soat | trang_thai | san | gian_hang | loai_file | ngay_khop
     KHO_TRUOC  bản sao KHO trước lần ghi gần nhất (để Hoàn tác)
     THONG_TIN  khoa | gia_tri  (lần tải cuối, phiên bản, ...)
     LICH_SU    thoi_gian | hanh_dong | chi_tiet  (giữ ~500 dòng mới nhất)
   Không đăng nhập, không ghi tên người: lịch sử chỉ có thời gian + hành động + số lượng.

   Hàm chạy tay trong trình soạn Apps Script:
     migrate()           chuyển kho cũ sang mô hình trạng thái (cũng tự chạy ở lần gọi đầu)
     donKho()            dọn mã quá 60 ngày (trigger hằng ngày gọi hàm này)
     taoTriggerDonKho()  tạo trigger chạy donKho mỗi ngày khoảng 2-3 giờ sáng (chạy MỘT lần)

   API (không xác thực, không tin dữ liệu gửi lên):
     GET  ?               -> { ok, kho, info, lichSu, homNay }
     POST text/plain JSON -> { action: 'upload' | 'reconcile' | 'undo', ... }
   ===================================================================== */

var TZ = 'Asia/Ho_Chi_Minh';
var SHEET_KHO = 'KHO', SHEET_KHO_TRUOC = 'KHO_TRUOC', SHEET_INFO = 'THONG_TIN', SHEET_LS = 'LICH_SU';
var KHO_HEADER = ['ma_sach', 'ma_goc', 'ngay_doi_soat', 'trang_thai', 'san', 'gian_hang', 'loai_file', 'ngay_khop'];
var C = { MA: 0, GOC: 1, NGAY: 2, TT: 3, SAN: 4, GIAN: 5, LOAI: 6, NGAY_KHOP: 7 };
var CHO = 'cho', KHOP = 'khop';
var INFO_HEADER = ['khoa', 'gia_tri'];
var LS_HEADER = ['thoi_gian', 'hanh_dong', 'chi_tiet'];
var INFO_BO = ['nguoi_tai_cuoi', 'nguoi_ghi_cuoi'];   // khoá cũ có tên người -> bỏ
var LIMITS = {
  BODY_CHARS: 4000000,   // ~4 MB JSON
  ITEMS: 20000,          // số mã tối đa mỗi lần tải / mỗi lần đối soát
  KHO_ROWS: 60000,       // số mã tối đa trong kho
  GIAN: 60,
  LICH_SU: 500,
  LICH_SU_TRA_VE: 30,
  NGAY_CU_NHAT: 3,       // năm: ngày đối soát mang theo không được cũ hơn
  BATCH: 2000            // số dòng mỗi lần ghi vào Sheet
};
var GIU_NGAY = 60;       // dọn mã 'cho' quá 60 ngày kể từ ngay_doi_soat, mã 'khop' quá 60 ngày kể từ ngay_khop
var CODE_RE = /^[A-Z0-9]{4,40}$/;
var SAN = { shopee: 'Shopee', tiktok: 'TikTok' };
var LOAI_FILE = ['Giao KTC', 'Trả hàng', 'Đơn hàng', 'Khiếu nại', 'Khác'];

/* ============================== HTTP =============================== */

function doGet(e) {
  return out_(safely_(function () {
    return withLock_(function () { ensureModel_(); return readState_(); });
  }));
}

function doPost(e) {
  return out_(safely_(function () {
    var body = parseBody_(e);
    return withLock_(function () { ensureModel_(); return dispatch_(body); });
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

function cleanText_(v, max) {
  return String(v === null || v === undefined ? '' : v).replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

// Mã gốc chỉ để hiển thị; nếu lạ thì dùng mã sạch.
function validGoc_(goc, ma) {
  var s = String(goc === null || goc === undefined ? '' : goc).trim();
  if (!s || s.length > 64 || /[\s<>"'&`]/.test(s) || cleanCode_(s) !== ma) return ma;
  return s;
}

function validLoai_(v) {
  var s = cleanText_(v, 20);
  return LOAI_FILE.indexOf(s) >= 0 ? s : 'Khác';
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

// Số ngày từ ngày a đến ngày b (cả hai là yyyymmdd).
function daysBetween_(a, b) {
  var ta = Date.UTC(Math.floor(a / 10000), Math.floor(a / 100) % 100 - 1, a % 100);
  var tb = Date.UTC(Math.floor(b / 10000), Math.floor(b / 100) % 100 - 1, b % 100);
  return Math.round((tb - ta) / 86400000);
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

function newRow_(ma, goc, ngay) { return [ma, goc, ngay, CHO, '', '', '', '']; }

/* Gộp / thay thế phần "Chờ đối soát" của kho.
   - Mã đã 'khop' KHÔNG BAO GIỜ bị đưa về 'cho' (chống nạp trùng): bỏ qua.
   - gop:  mã 'cho' đã có giữ nguyên ngày đối soát (lấy ngày cũ hơn nếu file
           mang ngày sớm hơn), mã mới vào 'cho' với ngày hôm nay (hoặc ngày mang theo).
   - thay: phần 'cho' chỉ còn đúng các mã gửi lên (mã đã có giữ ngày cũ);
           mọi mã 'khop' giữ nguyên.                                         */
function mergeKho_(current, items, mode, today) {
  var byCode = {};
  current.forEach(function (r) { byCode[r[C.MA]] = r; });
  var rows = (mode === 'thay' ? current.filter(function (r) { return r[C.TT] === KHOP; }) : current)
    .map(function (r) { return r.slice(); });
  var idx = {};
  rows.forEach(function (r, i) { idx[r[C.MA]] = i; });
  var added = 0, existed = 0, keptCho = {}, daKhop = [];
  items.forEach(function (it) {
    var old = byCode[it.ma];
    if (old && old[C.TT] === KHOP) { daKhop.push({ ma: it.ma, ngayKhop: old[C.NGAY_KHOP] }); return; }
    if (old) {
      existed++;
      keptCho[it.ma] = true;
      var keep = old.slice();
      if (it.ngay) keep[C.NGAY] = olderDate_(keep[C.NGAY], it.ngay);
      if (mode === 'thay') rows.push(keep); else rows[idx[it.ma]] = keep;
    } else {
      added++;
      rows.push(newRow_(it.ma, it.goc, it.ngay || today));
    }
  });
  var removed = 0;
  if (mode === 'thay') current.forEach(function (r) { if (r[C.TT] !== KHOP && !keptCho[r[C.MA]]) removed++; });
  return { rows: rows, added: added, existed: existed, removed: removed, daKhop: daKhop };
}

/* Đối soát: chuyển mã 'cho' có trong danh sách sang 'khop' và ghi nhãn.
   Mã đã 'khop' giữ nguyên (KHÔNG đổi ngay_khop, sàn, gian, loại file cũ).
   Mã không có trong kho bị bỏ qua.                                          */
function reconcileKho_(current, khop, san, today) {
  var map = {};
  khop.forEach(function (it) { if (!map[it.ma]) map[it.ma] = it; });
  var changed = [], already = 0, found = {};
  var rows = current.map(function (r) {
    var it = map[r[C.MA]];
    if (!it) return r;
    found[r[C.MA]] = true;
    if (r[C.TT] === KHOP) { already++; return r; }
    changed.push(r[C.MA]);
    return [r[C.MA], r[C.GOC], r[C.NGAY], KHOP, san, it.gian, it.loai, today];
  });
  var notInKho = Object.keys(map).filter(function (m) { return !found[m]; }).length;
  return { rows: rows, changed: changed, already: already, notInKho: notInKho };
}

/* Dọn kho: 'cho' quá GIU_NGAY ngày kể từ ngay_doi_soat, 'khop' quá GIU_NGAY
   ngày kể từ ngay_khop. "Quá 60 ngày" = đã qua hơn 60 ngày (ngày thứ 61 trở đi).
   Ngày không đọc được thì giữ lại (không xoá thứ không xác định được tuổi). */
function cleanupKho_(current, today, days) {
  var tk = dateKey_(today), cho = 0, khop = 0;
  var rows = current.filter(function (r) {
    var isKhop = r[C.TT] === KHOP;
    var k = dateKey_(isKhop ? (r[C.NGAY_KHOP] || r[C.NGAY]) : r[C.NGAY]);
    if (k === null || daysBetween_(k, tk) <= days) return true;
    if (isKhop) khop++; else cho++;
    return false;
  });
  return { rows: rows, cho: cho, khop: khop };
}

// Dòng kho kiểu cũ (5 cột, có người tải) -> dòng mới 'cho', giữ ngày đối soát.
function migrateRows_(oldRows) {
  return oldRows.filter(function (r) { return r[0]; }).map(function (r) {
    return newRow_(String(r[0]), String(r[1] || r[0]), String(r[2] || ''));
  });
}

/* ============================ HÀNH ĐỘNG ============================ */

function actionUpload_(body) {
  var mode = body.cheDo === 'thay' ? 'thay' : (body.cheDo === 'gop' ? 'gop' : null);
  if (!mode) throw userError_('BAD_MODE', 'Chế độ lưu phải là "gop" hoặc "thay".');
  var now = now_(), today = todayStr_(now), nowIso = now.toISOString();
  var s = sanitizeItems_(body.items, today);
  if (!s.items.length) throw userError_('NO_ITEMS', 'Không có mã hợp lệ nào để lưu.');

  var info = readInfo_();
  if (mode === 'thay') checkVersion_(info, body.phienBan);
  var before = readKho_(SHEET_KHO);
  var res = mergeKho_(before, s.items, mode, today);
  if (res.rows.length > LIMITS.KHO_ROWS) throw userError_('KHO_FULL', 'Kho vượt quá ' + LIMITS.KHO_ROWS + ' mã.');

  info.lan_tai_cuoi = nowIso;
  info.so_ma_tai_cuoi = String(s.items.length);
  var detail = (mode === 'thay' ? 'Thay thế phần Chờ đối soát' : 'Gộp vào kho') + ': gửi ' + s.items.length + ' mã, thêm mới ' + res.added +
    ', đã có ' + res.existed + (mode === 'thay' ? ', bỏ ' + res.removed : '') +
    (res.daKhop.length ? ', bỏ qua ' + res.daKhop.length + ' mã đã khớp trước đó' : '') +
    (s.rejected ? ', loại ' + s.rejected + ' mã sai' : '') + '. Kho còn ' + res.rows.length + ' mã.';
  commit_(info, before, res.rows, mode === 'thay' ? 'Tải kho (thay thế)' : 'Tải kho (gộp)', detail, now);
  var st = readState_();
  st.ketQua = { them: res.added, daCo: res.existed, bo: res.removed, daKhop: res.daKhop.length, loai: s.rejected };
  return st;
}

function actionReconcile_(body) {
  var sanKey = body.san;
  if (!SAN[sanKey]) throw userError_('BAD_SAN', 'Sàn không hợp lệ.');
  if (body.xoa !== undefined) throw userError_('OLD_CLIENT', 'Trang đang mở là bản cũ. Hãy tải lại trang (Ctrl+F5) rồi đối soát lại.');
  if (!Array.isArray(body.khop)) throw userError_('BAD_ITEMS', 'Danh sách mã đã khớp không hợp lệ.');
  if (body.khop.length > LIMITS.ITEMS) throw userError_('TOO_MANY', 'Mỗi lần tối đa ' + LIMITS.ITEMS + ' mã.');
  var khop = [];
  body.khop.forEach(function (it) {
    if (!it || typeof it !== 'object') return;
    var ma = cleanCode_(it.ma);
    if (CODE_RE.test(ma)) khop.push({ ma: ma, gian: cleanText_(it.gian, LIMITS.GIAN), loai: validLoai_(it.loai) });
  });
  var now = now_(), today = todayStr_(now);
  var info = readInfo_();
  var before = readKho_(SHEET_KHO);
  var res = reconcileKho_(before, khop, sanKey, today);
  var detail = 'Đối soát ' + SAN[sanKey] + ': chuyển ' + res.changed.length + ' mã sang Đã khớp (gửi ' + khop.length +
    (res.already ? ', ' + res.already + ' mã đã khớp từ trước giữ nguyên' : '') +
    (res.notInKho ? ', ' + res.notInKho + ' mã không có trong kho' : '') + ').';
  if (res.changed.length) {
    commit_(info, before, res.rows, 'Đối soát ' + SAN[sanKey], detail, now);
  } else {
    // Kho không đổi -> không ghi đè bản Hoàn tác, chỉ ghi lịch sử.
    addHistory_(now, 'Đối soát ' + SAN[sanKey], detail);
  }
  var st = readState_();
  st.ketQua = { khop: res.changed.length, daKhop: res.already, khongCo: res.notInKho, gui: khop.length, ngayKhop: today };
  return st;
}

function actionUndo_(body) {
  var info = readInfo_();
  if (info.co_ban_truoc !== '1') throw userError_('NO_UNDO', 'Không có bản trước để hoàn tác.');
  checkVersion_(info, body.phienBan);
  var now = now_();
  var cur = readKho_(SHEET_KHO), prev = readKho_(SHEET_KHO_TRUOC);
  var prevInfo = {};
  try { prevInfo = JSON.parse(info.ban_truoc_thong_tin || '{}') || {}; } catch (err) { prevInfo = {}; }
  var curUpload = uploadInfo_(info);

  // Hoán đổi cả 8 cột (gồm trạng thái, sàn, gian, loại file, ngày khớp).
  writeKho_(SHEET_KHO_TRUOC, cur);
  writeKho_(SHEET_KHO, prev);
  ['lan_tai_cuoi', 'so_ma_tai_cuoi'].forEach(function (k) { info[k] = prevInfo[k] || ''; });
  info.ban_truoc_thong_tin = JSON.stringify(curUpload);
  bumpWrite_(info, 'Hoàn tác', now);
  writeInfo_(info);
  addHistory_(now, 'Hoàn tác', 'Đưa kho về bản trước lần ghi gần nhất: ' + cur.length + ' -> ' + prev.length +
    ' mã. Bấm Hoàn tác lần nữa để làm lại.');
  var st = readState_();
  st.ketQua = { truoc: cur.length, sau: prev.length };
  return st;
}

/* ===================== HÀM CHẠY TAY / TRIGGER ===================== */

// Chuyển kho cũ sang mô hình trạng thái. Chạy lại nhiều lần vẫn an toàn.
function migrate() {
  return withLock_(function () { return ensureModel_(); });
}

// Dọn mã quá 60 ngày. Trigger hằng ngày gọi hàm này; cũng có thể chạy tay.
function donKho() {
  return withLock_(function () {
    ensureModel_();
    var now = now_(), today = todayStr_(now);
    var info = readInfo_();
    var before = readKho_(SHEET_KHO);
    var res = cleanupKho_(before, today, GIU_NGAY);
    if (res.cho + res.khop) {
      commit_(info, before, res.rows, 'Dọn kho', 'Dọn mã quá ' + GIU_NGAY + ' ngày: xoá ' + res.cho +
        ' mã Chờ đối soát, ' + res.khop + ' mã Đã khớp. Kho còn ' + res.rows.length + ' mã.', now);
    }
    return { ok: true, cho: res.cho, khop: res.khop, conLai: res.rows.length };
  });
}

// Chạy MỘT lần: tạo trigger gọi donKho mỗi ngày trong khung 2-3 giờ sáng (giờ Việt Nam).
function taoTriggerDonKho() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'donKho') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('donKho').timeBased().everyDays(1).atHour(2).inTimezone(TZ).create();
  return 'Đã tạo trigger: donKho chạy mỗi ngày khoảng 2-3 giờ sáng.';
}

/* ============================ GHI CHUNG ============================ */

function checkVersion_(info, phienBan) {
  if (String(phienBan) !== String(info.phien_ban || '0')) {
    throw userError_('STALE', 'Kho vừa được người khác thay đổi. Bấm "Làm mới" để xem bản mới nhất rồi thử lại.');
  }
}

function uploadInfo_(info) {
  return { lan_tai_cuoi: info.lan_tai_cuoi || '', so_ma_tai_cuoi: info.so_ma_tai_cuoi || '' };
}

function bumpWrite_(info, hanhDong, now) {
  info.phien_ban = String((parseInt(info.phien_ban, 10) || 0) + 1);
  info.ghi_cuoi = now.toISOString();
  info.hanh_dong_cuoi = hanhDong;
}

// Lưu bản sao trước khi ghi (để Hoàn tác) rồi ghi kho mới + thông tin + lịch sử.
// info.__goc là thông tin lần tải cuối lúc vừa đọc (trước khi hành động sửa info).
function commit_(info, before, after, hanhDong, detail, now) {
  writeKho_(SHEET_KHO_TRUOC, before);
  info.ban_truoc_thong_tin = JSON.stringify(info.__goc);
  info.co_ban_truoc = '1';
  writeKho_(SHEET_KHO, after);
  bumpWrite_(info, hanhDong, now);
  writeInfo_(info);
  addHistory_(now, hanhDong, detail);
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

/* Chuyển một sheet kho kiểu cũ (ma_sach | ma_goc | ngay_doi_soat | nguoi_tai |
   thoi_gian_tai) sang 8 cột mới. Sheet đã đúng cấu trúc thì không làm gì.  */
function migrateSheet_(name) {
  var sh = ss_().getSheetByName(name);
  if (!sh) return 0;
  var width = Math.max(sh.getLastColumn(), 1);
  var head = sh.getRange(1, 1, 1, width).getDisplayValues()[0];
  if (head[C.TT] === 'trang_thai') return 0;
  var last = sh.getLastRow();
  var old = last >= 2 ? sh.getRange(2, 1, last - 1, width).getDisplayValues() : [];
  var rows = migrateRows_(old);
  sh.getRange(1, 1, Math.max(last, 1), Math.max(width, KHO_HEADER.length)).clearContent();
  sh.getRange(1, 1, 1, KHO_HEADER.length).setValues([KHO_HEADER]);
  writeRows_(sh, rows);
  return rows.length;
}

// Gọi ở đầu mọi lần đọc/ghi (trong khoá). Chỉ tốn 1 lần đọc dòng tiêu đề khi đã đúng cấu trúc.
function ensureModel_() {
  var n = migrateSheet_(SHEET_KHO);
  migrateSheet_(SHEET_KHO_TRUOC);
  migrateHistory_();
  if (n) addHistory_(now_(), 'Chuyển đổi dữ liệu', 'Chuyển kho sang mô hình trạng thái: ' + n + ' mã -> Chờ đối soát, giữ nguyên ngày đối soát.');
  return { ok: true, daChuyen: n };
}

/* Lịch sử kiểu cũ (thoi_gian | nguoi | hanh_dong | chi_tiet) -> bỏ cột người.
   Đã đúng cấu trúc thì không làm gì.                                        */
function migrateHistory_() {
  var sh = ss_().getSheetByName(SHEET_LS);
  if (!sh) return 0;
  var head = sh.getRange(1, 1, 1, 4).getDisplayValues()[0];
  if (head[1] !== 'nguoi') return 0;
  var last = sh.getLastRow();
  var old = last >= 2 ? sh.getRange(2, 1, last - 1, 4).getDisplayValues() : [];
  sh.getRange(1, 1, Math.max(last, 1), 4).clearContent();
  sh.getRange(1, 1, 1, LS_HEADER.length).setValues([LS_HEADER]);
  if (old.length) {
    var rg = sh.getRange(2, 1, old.length, LS_HEADER.length);
    rg.setNumberFormat('@');
    rg.setValues(old.map(function (r) { return [r[0], r[2], r[3]]; }));
  }
  return old.length;
}

function readKho_(name) {
  var sh = sheet_(name, KHO_HEADER);
  var last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, KHO_HEADER.length).getDisplayValues()
    .filter(function (r) { return r[C.MA]; })
    .map(function (r) {
      var row = r.map(function (v) { return String(v); });
      if (row[C.TT] !== KHOP) row[C.TT] = CHO;
      return row;
    });
}

// Ghi theo lô LIMITS.BATCH dòng để kho chục nghìn mã vẫn nhanh và không vượt giới hạn.
function writeRows_(sh, rows) {
  for (var i = 0; i < rows.length; i += LIMITS.BATCH) {
    var chunk = rows.slice(i, i + LIMITS.BATCH);
    var rg = sh.getRange(2 + i, 1, chunk.length, KHO_HEADER.length);
    rg.setNumberFormat('@');   // giữ mã và ngày dạng chữ (không mất số 0 đầu, không đổi thành ngày)
    rg.setValues(chunk);
  }
}

function writeKho_(name, rows) {
  var sh = sheet_(name, KHO_HEADER);
  var last = sh.getLastRow();
  if (last >= 2) sh.getRange(2, 1, last - 1, KHO_HEADER.length).clearContent();
  writeRows_(sh, rows);
}

function readInfo_() {
  var sh = sheet_(SHEET_INFO, INFO_HEADER);
  var last = sh.getLastRow(), info = {};
  if (last >= 2) sh.getRange(2, 1, last - 1, 2).getDisplayValues().forEach(function (r) {
    if (r[0] && INFO_BO.indexOf(r[0]) < 0) info[r[0]] = String(r[1]);
  });
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

function addHistory_(now, hanhDong, detail) {
  var sh = sheet_(SHEET_LS, LS_HEADER);
  var last = sh.getLastRow();
  var rg = sh.getRange(last + 1, 1, 1, LS_HEADER.length);
  rg.setNumberFormat('@');
  rg.setValues([[now.toISOString(), hanhDong, detail]]);
  var count = last;   // số dòng dữ liệu sau khi thêm = (last + 1) - 1
  if (count > LIMITS.LICH_SU) sh.deleteRows(2, count - LIMITS.LICH_SU);
}

function readHistory_(n) {
  var sh = sheet_(SHEET_LS, LS_HEADER);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var from = Math.max(2, last - n + 1);
  return sh.getRange(from, 1, last - from + 1, LS_HEADER.length).getDisplayValues().reverse()
    .map(function (r) { return { thoiGian: r[0], hanhDong: r[1], chiTiet: r[2] }; });
}

function readState_() {
  var kho = readKho_(SHEET_KHO);
  var info = readInfo_();
  var soKhop = kho.filter(function (r) { return r[C.TT] === KHOP; }).length;
  return {
    ok: true,
    homNay: todayStr_(now_()),
    kho: kho,
    info: {
      phienBan: info.phien_ban || '0',
      soMa: kho.length,
      soCho: kho.length - soKhop,
      soKhop: soKhop,
      giuNgay: GIU_NGAY,
      lanTaiCuoi: info.lan_tai_cuoi ? { thoiGian: info.lan_tai_cuoi, soMa: +info.so_ma_tai_cuoi || 0 } : null,
      ghiCuoi: info.ghi_cuoi ? { thoiGian: info.ghi_cuoi, hanhDong: info.hanh_dong_cuoi || '' } : null,
      coBanTruoc: info.co_ban_truoc === '1'
    },
    lichSu: readHistory_(LIMITS.LICH_SU_TRA_VE)
  };
}
