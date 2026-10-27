/* =====================================================================
   Common — các hàm dùng chung, gộp từ hai công cụ gốc
   (Doi_soat_Shopee_TikTok.html + trich-ma-kho.html).
   Không đụng DOM, chạy được cả trong trình duyệt lẫn Node (để test).
   ===================================================================== */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Common = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  function X() {
    if (root && root.XLSX) return root.XLSX;
    if (typeof require === 'function') return require('xlsx');
    throw new Error('Chưa tải được thư viện xlsx');
  }

  /* ---------- chuẩn hóa và lọc mã ---------- */
  function sanitizeTrackingId(val) {
    if (!val) return '';
    return String(val).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  }
  // Mã vận đơn thật không chứa khoảng trắng -> chặn dòng mô tả / dòng tiêu đề phụ.
  function isLikelyRealTrackingId(raw) {
    if (!raw) return false;
    var s = String(raw).trim();
    if (s.length < 3) return false;
    if (/\s/.test(s)) return false;
    return true;
  }
  // Mã được phép lưu vào kho chung (backend kiểm tra lại cùng quy tắc này).
  var CODE_RE = /^[A-Z0-9]{4,40}$/;
  function isValidKhoCode(clean) { return CODE_RE.test(String(clean || '')); }

  // SPXVN… (SPX Express) và GY + 6 (GHN mã ngắn) chỉ xuất hiện ở đơn Shopee.
  // J&T (12 số), VNGH…, VTPVN… dùng chung cả 2 sàn -> KHÔNG lọc.
  function isOtherPlatformId(cleanId) {
    if (!cleanId) return false;
    if (cleanId.indexOf('SPXVN') === 0) return true;
    if (/^GY[A-Z0-9]{6}$/.test(cleanId)) return true;
    return false;
  }

  /* ---------- đọc ô: chống mã 12-17 số bị đọc thành 1.23E+15 ---------- */
  function cellToStr(cell) {
    if (!cell) return '';
    if (cell.t === 'n' || typeof cell.v === 'number') return String(Math.round(cell.v));
    var v = String(cell.v === undefined ? '' : cell.v).trim();
    if (/^\d[\d.]*[eE][+\-]?\d+$/.test(v)) return String(Math.round(parseFloat(v)));
    return v;
  }
  function getCellStr(ws, r, c) { return cellToStr(ws[X().utils.encode_cell({ r: r, c: c })]); }

  /* ---------- dò cột theo từ khóa ----------
     Trả về undefined (không phải 0) khi không thấy, để cột nằm ở vị trí A
     không bị coi là falsy. '=code' -> phải khớp tuyệt đối.                  */
  function findCol(hMap, kws, exclude) {
    var keys = Object.keys(hMap);
    for (var i = 0; i < kws.length; i++) {
      var kw = kws[i].toLowerCase();
      var exact = kw.charAt(0) === '=';
      if (exact) kw = kw.slice(1);
      for (var j = 0; j < keys.length; j++) {
        var k = String(keys[j]).toLowerCase();
        if (exact ? (k !== kw) : (k.indexOf(kw) < 0)) continue;
        if (exclude && exclude.some(function (x) { return k.indexOf(x) >= 0; })) continue;
        return hMap[keys[j]];
      }
    }
    return undefined;
  }

  /* ---------- dò dòng tiêu đề trong 10 dòng đầu ----------
     File quét mã vạch có tiêu đề ở dòng 3. File khiếu nại Shopee có cột TRÙNG
     TÊN -> chỉ ghi nhận lần xuất hiện ĐẦU TIÊN.                              */
  function detectHeader(ws, range, kws) {
    for (var hr = range.s.r; hr <= Math.min(range.s.r + 10, range.e.r); hr++) {
      var m = {}, found = false;
      for (var c = range.s.c; c <= range.e.c; c++) {
        var v = getCellStr(ws, hr, c).trim();
        if (!v) continue;
        if (!(v in m)) m[v] = c;
        var l = v.toLowerCase();
        for (var i = 0; i < kws.length; i++) {
          var kw = kws[i], ex = kw.charAt(0) === '=';
          if (ex) kw = kw.slice(1);
          if (ex ? (l === kw) : (l.indexOf(kw) >= 0)) { found = true; break; }
        }
      }
      if (found) return { headerRow: hr, hMap: m };
    }
    return { headerRow: range.s.r, hMap: {} };
  }

  function sheetRange(ws) { return X().utils.decode_range(ws['!ref'] || 'A1'); }
  function firstSheet(wb) { return wb.Sheets[wb.SheetNames[0]]; }

  /* ---------- đọc file: CSV đọc dạng text UTF-8, xlsx đọc nhị phân ---------- */
  function readWb(file) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      var isCsv = file.name.toLowerCase().endsWith('.csv');
      r.onload = function (e) {
        try {
          if (isCsv) res(X().read(e.target.result, { type: 'string', cellText: true }));
          else res(X().read(e.target.result, { type: 'array', cellText: true }));
        } catch (err) { rej(err); }
      };
      r.onerror = rej;
      if (isCsv) r.readAsText(file, 'UTF-8');
      else r.readAsArrayBuffer(file);
    });
  }

  /* ---------- ngày ---------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fmtD(d) { return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear(); }
  function fmtDT(d) { return fmtD(d) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function today() { return fmtD(new Date()); }

  // Đưa mọi kiểu ngày về dd/mm/yyyy (số serial Excel, yyyy-mm-dd, d/m/yyyy)
  function normDate(s) {
    if (s === null || s === undefined) return today();
    s = String(s).trim();
    if (!s) return today();
    if (/^\d+(\.\d+)?$/.test(s)) {
      var n = parseFloat(s);
      if (n > 20000 && n < 80000) {
        var u = new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000);
        return pad(u.getUTCDate()) + '/' + pad(u.getUTCMonth() + 1) + '/' + u.getUTCFullYear();
      }
      return s;
    }
    var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return pad(+m[1]) + '/' + pad(+m[2]) + '/' + m[3];
    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return pad(+m[3]) + '/' + pad(+m[2]) + '/' + m[1];
    return s;
  }

  /* Tuổi tồn: hỗ trợ dd/mm/yyyy, yyyy-mm-dd và số serial của Excel.
     Nếu ai mở file backlog bằng Excel rồi bấm lưu, cột ngày dễ bị đổi thành
     số serial (vd 46265). Không xử lý thì toàn bộ tuổi tồn reset về 0.       */
  function daysSince(dateStr, now) {
    if (dateStr === null || dateStr === undefined) return null;
    var s = String(dateStr).trim();
    if (!s) return null;
    var d = null;
    if (/^\d+(\.\d+)?$/.test(s)) {
      var serial = parseFloat(s);
      if (serial > 20000 && serial < 80000) d = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000);
    }
    if (!d && s.indexOf('/') >= 0) {
      var p = s.split('/');
      if (p.length === 3) {
        var dd = parseInt(p[0], 10), mm = parseInt(p[1], 10), yy = parseInt(p[2], 10);
        if (!isNaN(dd) && !isNaN(mm) && !isNaN(yy)) d = new Date(yy, mm - 1, dd);
      }
    }
    if (!d && s.indexOf('-') >= 0) d = new Date(s);
    if (!d || isNaN(d.getTime())) return null;
    var diff = Math.floor(((now || new Date()) - d) / 86400000);
    return isNaN(diff) ? null : diff;
  }

  // Tuần ISO 8601 (thứ Hai là đầu tuần; tuần 1 chứa ngày thứ Năm đầu tiên của năm).
  function isoWeek(date) {
    var d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    var day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    var week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    return { week: week, year: d.getUTCFullYear() };
  }
  function isoWeekLabel(date) {
    var w = isoWeek(date || new Date());
    return 'Tuần ' + w.week + '/' + w.year;
  }

  /* ---------- định dạng ---------- */
  function fmtNum(n) { return Math.round(n).toLocaleString('vi-VN'); }
  function fmtSize(b) { if (b < 1024) return b + 'B'; if (b < 1048576) return (b / 1024).toFixed(0) + 'KB'; return (b / 1048576).toFixed(1) + 'MB'; }
  function escapeHtml(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------- xuất Excel ----------
     Ép cột mã về kiểu text (định dạng '@'), nếu không Excel sẽ đổi mã vận đơn
     thành số (8.6233E+11) và làm hỏng file khi nạp ngược vào tool.           */
  function forceTextCol(ws, colIdx) {
    var XL = X();
    var ref = XL.utils.decode_range(ws['!ref']);
    for (var r = ref.s.r + 1; r <= ref.e.r; r++) {
      var a = XL.utils.encode_cell({ r: r, c: colIdx });
      if (ws[a]) { ws[a].t = 's'; ws[a].z = '@'; ws[a].v = String(ws[a].v); }
    }
  }

  // Mã sàn đã ghi nhận mà khớp mã trong kho -> danh sách cần xoá khỏi kho chung.
  // Chỉ là phép GIAO giữa mã chứng từ của sàn đang chạy và mã kho đã đưa vào
  // đối soát, nên không bao giờ chạm tới mã mà sàn này không ghi nhận.
  function matchedToRemove(platformIds, khoIds) {
    var out = [];
    platformIds.forEach(function (c) { if (khoIds.has(c)) out.push(c); });
    return out;
  }

  return {
    sanitizeTrackingId: sanitizeTrackingId, isLikelyRealTrackingId: isLikelyRealTrackingId,
    isValidKhoCode: isValidKhoCode, isOtherPlatformId: isOtherPlatformId,
    cellToStr: cellToStr, getCellStr: getCellStr, findCol: findCol, detectHeader: detectHeader,
    sheetRange: sheetRange, firstSheet: firstSheet, readWb: readWb,
    pad: pad, fmtD: fmtD, fmtDT: fmtDT, today: today, normDate: normDate, daysSince: daysSince,
    isoWeek: isoWeek, isoWeekLabel: isoWeekLabel,
    fmtNum: fmtNum, fmtSize: fmtSize, escapeHtml: escapeHtml, forceTextCol: forceTextCol,
    matchedToRemove: matchedToRemove, xlsx: X
  };
});
