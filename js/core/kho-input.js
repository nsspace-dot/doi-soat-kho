/* =====================================================================
   KhoInput — đọc mã kho đầu vào cho tab "Kho / Đối soát".
   - parseZalo: bộ tách tin nhắn Zalo, giữ nguyên từ trich-ma-kho.html
     ([QR]/[C128], khối CSV dán nguyên, tiêu đề Zalo [dd/mm/yyyy hh:mm:ss] Tên:)
   - parseKhoSheet: đọc file Excel/CSV mã kho đúng cột, giữ nguyên cách dò
     cột của ô "Kho / Đối soát" trong công cụ đối soát gốc.
   - combine: gộp trùng mọi nguồn, đánh dấu mã sai.
   Ngày quét trong tin nhắn Zalo chỉ để xem, KHÔNG dùng làm ngày đối soát.
   ===================================================================== */
(function (root, factory) {
  var req = typeof require === 'function' ? require : null;
  var api = factory(root.Common || req('./common.js'), root.Template || req('./template.js'));
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KhoInput = api;
})(typeof self !== 'undefined' ? self : this, function (Common, Template) {
  'use strict';

  var HEADER_RE = /^\[(\d{1,2}\/\d{1,2}\/\d{2,4})\s+\d{1,2}:\d{2}:\d{2}\]\s*([^:]+):/;
  var CSV_RE = /^"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"$/;
  var BRACKET_RE = /^\[([A-Za-z0-9 \-ÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠàáâãèéêìíòóôõùúăđĩũơƯĂẠẢẤẦẨẪẬẮẰẲẴẶẸẺẼỀỀỂẾưăạảấầẩẫậắằẳẵặẹẻẽềểếỄỆỈỊỌỎỐỒỔỖỘỚỜỞỠỢỤỦỨỪễệỉịọỏốồổỗộớờởỡợụủứừỬỮỰỲỴÝỶỸửữựỳỵỷỹ]+)\]:?\s*(\S+)$/;

  function sanitize(v) {
    return String(v).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function normalizeDate(d) {
    var parts = d.split('/');
    if (parts.length !== 3) return d;
    var dd = parts[0], mm = parts[1], yy = parts[2];
    if (yy.length === 2) yy = '20' + yy;
    var ddN = parseInt(dd, 10), mmN = parseInt(mm, 10), yyN = parseInt(yy, 10);
    if (!ddN || !mmN || !yyN) return d;
    return ddN + '/' + mmN + '/' + yyN;
  }

  // Trả về { entries: [{code, raw, symb, date, sender}], skipped: [dòng] }
  function parseZalo(text) {
    var lines = String(text || '').split(/\r?\n/);
    var currentDate = '', currentSender = '';
    var entries = [];
    var skipped = [];

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      if (line === '""') continue;

      var m = line.match(HEADER_RE);
      if (m) {
        currentDate = normalizeDate(m[1]);
        currentSender = m[2].trim();
        continue;
      }

      m = line.match(CSV_RE);
      if (m) {
        var symb = m[1].trim(), code = m[2].trim(), dateStr = m[4].trim();
        if (symb.toLowerCase() === 'symbology') continue;
        if (!code) continue;
        var dPart = (dateStr.split(',')[0] || '').trim();
        entries.push({
          code: sanitize(code),
          raw: code,
          symb: symb || '—',
          date: dPart ? normalizeDate(dPart) : currentDate,
          sender: currentSender || '—'
        });
        continue;
      }

      m = line.match(BRACKET_RE);
      if (m) {
        var symb2 = m[1].trim(), code2 = m[2].trim();
        var cleanCode = sanitize(code2);
        if (cleanCode.length < 3) { skipped.push(line); continue; }
        entries.push({
          code: cleanCode,
          raw: code2,
          symb: symb2 || '—',
          date: currentDate,
          sender: currentSender || '—'
        });
        continue;
      }

      skipped.push(line);
    }
    return { entries: entries, skipped: skipped };
  }

  var KHO_KWS = ['mã vận đơn', '=code', 'tracking id', 'vận đơn'];

  /* Đọc 1 sheet mã kho. Cột "Ngày đối soát" chỉ được dùng khi file là bản xuất
     sổ mã / kho cũ (có thêm cột "Số ngày tồn") — để chuyển Sổ mã cũ sang kho
     chung mà không làm mất tuổi tồn. File quét mã vạch / file từ tin nhắn Zalo
     không có cột này nên mã mới luôn nhận ngày hôm nay.                      */
  function parseKhoSheet(ws, sourceName) {
    var rg = Common.sheetRange(ws);
    var h = Common.detectHeader(ws, rg, KHO_KWS);
    if (Template.isListHeader(h.hMap)) {
      return { error: 'File "' + sourceName + '" là danh sách đơn thiếu của sàn (mẫu Tuần đối soát / Gian hàng). Hãy nạp file này ở tab Shopee hoặc TikTok, không phải vào kho.' };
    }
    var idIdx = Common.findCol(h.hMap, KHO_KWS);
    if (idIdx === undefined) return { error: 'Không tìm thấy cột "Mã vận đơn" / "Code" / "Tracking ID" trong file "' + sourceName + '".' };
    var dateIdx = Common.findCol(h.hMap, ['ngày đối soát', 'ngay doi soat']);
    var keepDates = dateIdx !== undefined && Common.findCol(h.hMap, ['số ngày tồn', 'so ngay ton']) !== undefined;
    // File "Tải kho về Excel" có cột Trạng thái: dòng "Đã khớp" không được nạp lại thành Chờ đối soát.
    var ttIdx = Common.findCol(h.hMap, ['=trạng thái']);

    var entries = [], skipped = [];
    for (var r = h.headerRow + 1; r <= rg.e.r; r++) {
      var raw = Common.getCellStr(ws, r, idIdx);
      var clean = Common.sanitizeTrackingId(raw);
      if (!clean || clean.length <= 3 || !Common.isLikelyRealTrackingId(raw)) {
        if (String(raw).trim()) skipped.push(String(raw).trim());
        continue;
      }
      if (ttIdx !== undefined && Common.getCellStr(ws, r, ttIdx).trim() === 'Đã khớp') {
        skipped.push(String(raw).trim() + ' (Đã khớp trong file sao lưu — bỏ qua)');
        continue;
      }
      var e = { code: clean, raw: String(raw).trim(), symb: sourceName, date: '', sender: '' };
      if (keepDates) {
        var od = Common.getCellStr(ws, r, dateIdx).trim();
        if (od) e.keepDate = Common.normDate(od);
      }
      entries.push(e);
    }
    return { entries: entries, skipped: skipped, keepDates: keepDates };
  }

  /* Gộp trùng theo mã sạch, giữ lần xuất hiện đầu tiên. Mã không hợp lệ
     (ngắn hơn 4 hoặc dài hơn 40 ký tự) vẫn hiện để người dùng thấy, nhưng
     không được gửi lên kho.                                                 */
  function combine(entries) {
    var seen = new Map(), dup = 0;
    entries.forEach(function (e) {
      if (seen.has(e.code)) { dup++; return; }
      seen.set(e.code, Object.assign({}, e, { valid: Common.isValidKhoCode(e.code) }));
    });
    var rows = Array.from(seen.values());
    return { rows: rows, dupCount: dup, invalidCount: rows.filter(function (r) { return !r.valid; }).length };
  }

  // Dữ liệu gửi lên backend: chỉ mã hợp lệ.
  function toUploadItems(rows) {
    return rows.filter(function (r) { return r.valid; }).map(function (r) {
      var it = { ma: r.code, goc: r.raw || r.code };
      if (r.keepDate) it.ngay = r.keepDate;
      return it;
    });
  }

  return {
    parseZalo: parseZalo, normalizeDate: normalizeDate, sanitize: sanitize,
    parseKhoSheet: parseKhoSheet,
    combine: combine, toUploadItems: toUploadItems
  };
});
