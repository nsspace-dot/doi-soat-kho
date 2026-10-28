/* =====================================================================
   TikTokCore — phần tính toán của nút "Tiến hành đối soát" tab TikTok,
   tách nguyên văn từ TT.runMatch của công cụ gốc. Khác biệt:
   - tập mã Kho lấy từ kho chung trên server (thay cho file Kho + Sổ mã);
   - trả thêm toRemove: mã TikTok đã ghi nhận VÀ có trong kho đã đưa vào
     đối soát. Mã bị bộ lọc "không thuộc TikTok" (SPXVN, GY…) không bao giờ
     nằm trong toRemove, nên không bị xoá khỏi kho chung.
   ===================================================================== */
(function (root, factory) {
  var req = typeof require === 'function' ? require : null;
  var api = factory(root.Common || req('./common.js'), root.Template || req('./template.js'));
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TikTokCore = api;
})(typeof self !== 'undefined' ? self : this, function (Common, Template) {
  'use strict';
  var findCol = Common.findCol, getCellStr = Common.getCellStr, isOtherPlatformId = Common.isOtherPlatformId,
      sanitizeTrackingId = Common.sanitizeTrackingId, isLikelyRealTrackingId = Common.isLikelyRealTrackingId;

  function parseShopName(fname) {
    var s = fname.replace(/\.[^.]+$/, '');
    var m = s.match(/TIKTOK[_\s]+(.+)/i);
    if (m) {
      var rest = m[1].replace(/_/g, ' ').trim();
      rest = rest.replace(/\s*\d{1,2}[\s\-]\d{1,2}\s*$/, '').trim();
      return rest || m[1].replace(/_/g, ' ').trim();
    }
    var parts = s.split(/[_\-\s]+/);
    return parts.slice(-2).join(' ').trim() || s;
  }

  function parseFileType(fname) {
    var s = fname.toLowerCase();
    if (s.includes('tiktok_chua_co_trong_kho') || s.includes('chua_co_trong_kho') || s.includes('mau_don_thieu')) return 'exported';
    if (s.includes('giao') || s.includes('failed') || s.includes('unsuccessful')) return 'giao';
    return 'tra';
  }

  // ==== T3: đọc tiền của TikTok =========================================
  // File Giao KTC ghi số thuần "50000"; file Trả hàng ghi "142.000₫".
  // Quy tắc: nhóm cuối dài đúng 3 chữ số -> dấu chấm là ngăn cách nghìn;
  // dài 1-2 chữ số -> là phần thập phân. Nhờ vậy "50000.00" vẫn ra 50000.
  function parseMoneyTikTok(raw) {
    if (raw === null || raw === undefined) return 0;
    var s = String(raw).trim();
    if (!s) return 0;
    var neg = s.indexOf('-') >= 0;
    s = s.replace(/[^\d.,]/g, '');
    if (!s) return 0;
    s = s.replace(/,/g, '.');
    var parts = s.split('.').filter(function (p) { return p !== ''; });
    if (!parts.length) return 0;
    var n;
    if (parts.length === 1) {
      n = parseFloat(parts[0]) || 0;
    } else {
      var last = parts[parts.length - 1];
      if (last.length === 3) n = parseFloat(parts.join('')) || 0;
      else n = parseFloat(parts.slice(0, -1).join('') + '.' + last) || 0;
    }
    return neg ? -n : n;
  }

  // ==== T6: gộp nhóm thanh toán =========================================
  function normalizePay(raw) {
    var s = String(raw || '').trim();
    if (!s) return 'Không rõ';
    var l = s.toLowerCase();
    if (l.indexOf('cash on delivery') >= 0 || l.indexOf('thanh toán khi') >= 0 || l === 'cod')
      return 'COD — thanh toán khi nhận hàng';
    return s;
  }

  function typeLabel(rec) {
    if (rec.type === 'giao') return 'Giao không thành công';
    if (rec.type === 'exported') return rec.typeLabel || 'Đã xuất lại lệch';
    return 'Trả hàng hoàn tiền';
  }

  /* opts:
       files: [{ wb, shop, ftype: 'giao'|'tra'|'exported', loai }]   (loai: nhãn loại file, chỉ để gắn nhãn)
       khoItems: [{ c, id, d }]   (kho chung)
       filterOther: bool          (loại SPXVN / GY… khỏi đối soát)
       today: 'dd/mm/yyyy'                                                    */
  function match(opts) {
    var filterOther = opts.filterOther !== false;
    var today = opts.today || Common.today();

    var doiSoatIds = new Set();
    var originalDoiSoatIds = new Map();
    var existingDates = new Map();   // cleanId -> ngày đối soát cũ
    var filteredIds = new Set();     // T2: mã bị loại vì thuộc sàn khác
    // Mã bị lọc VẪN là hàng đã về kho thật -> giữ lại trong kho chung.
    var filteredBacklog = new Map();

    /* ---- Kho chung: giống SoMa.mergeInto của bản gốc ---- */
    (opts.khoItems || []).forEach(function (it) {
      var c = it.c, id = it.id || c, d = it.d || today;
      if (filterOther && isOtherPlatformId(c)) {
        filteredIds.add(c);
        if (!filteredBacklog.has(c)) filteredBacklog.set(c, { id: id, cleanId: c, date: d });
        return;
      }
      doiSoatIds.add(c);
      if (!originalDoiSoatIds.has(c)) originalDoiSoatIds.set(c, id);
      if (!existingDates.has(c)) existingDates.set(c, d);
    });

    // Đọc file TikTok
    var tikTokRecords = [];
    (opts.files || []).forEach(function (item) {
      var shop = item.shop;
      var ftype = item.ftype;
      var ws = Common.firstSheet(item.wb);
      var range = Common.sheetRange(ws);

      var headerRow = 0;
      var hMap = {};
      for (var hr2 = range.s.r; hr2 <= Math.min(range.s.r + 10, range.e.r); hr2++) {
        var tempMap = {};
        var foundHeaders = false;
        for (var c = range.s.c; c <= range.e.c; c++) {
          var val = getCellStr(ws, hr2, c).trim();
          if (val) {
            tempMap[val] = c;
            var lv = val.toLowerCase();
            if (lv.includes('tracking') || lv.includes('mã vận đơn') || lv.includes('product name') || lv.includes('tên sản phẩm')) foundHeaders = true;
          }
        }
        if (foundHeaders) { headerRow = hr2; hMap = tempMap; break; }
      }
      if (Object.keys(hMap).length === 0) {
        var XL = Common.xlsx();
        for (var c2 = range.s.c; c2 <= range.e.c; c2++) {
          var hcell = ws[XL.utils.encode_cell({ r: 0, c: c2 })];
          if (hcell) hMap[String(hcell.v || '').trim()] = c2;
        }
        headerRow = 0;
      }

      // File mẫu đơn thiếu / file xuất lệch nạp lại (mới và cũ).
      if (Template.isListHeader(hMap)) {
        Template.readListRows(ws, headerRow, hMap, shop || '(Xuất lại)').forEach(function (x) {
          if (filterOther && isOtherPlatformId(x.cleanTid)) { filteredIds.add(x.cleanTid); return; } // T2
          tikTokRecords.push({ shop: x.shop, type: 'exported', loai: item.loai, typeLabel: x.typeLabel, tid: x.tid, cleanTid: x.cleanTid,
            prod: x.prod, variant: x.variant, refund: 0, ship: '', pay: '', prov: '', kho: x.kho, week: x.week });
        });
        return;
      }

      var dataStart = headerRow + 1;

      // T5: File Giao KTC dùng "Tracking ID"; file Trả hàng dùng "Return Logistics
      // Tracking ID" -> với ftype 'giao' phải loại trừ mọi cột có chữ "return".
      var tidIdx;
      if (ftype === 'giao') {
        tidIdx = findCol(hMap, ['tracking id', 'tracking', 'mã vận đơn'], ['return', 'trả hàng', 'hoàn']);
      } else {
        tidIdx = findCol(hMap, ['return logistics tracking', 'return tracking', 'mã vận đơn trả', 'tracking']);
      }
      if (tidIdx === undefined) return;

      var prodIdx    = findCol(hMap, ['product name', 'tên sản phẩm']);
      var variantIdx = findCol(hMap, ['variation', 'sku name', 'tên phân loại', 'phân loại hàng', 'tên sku']);
      var shipIdx    = findCol(hMap, ['shipping provider', 'đơn vị vận chuyển']);
      var payIdx     = findCol(hMap, ['payment method', 'phương thức thanh toán']);
      var provIdx    = findCol(hMap, ['province', 'tỉnh/thành', 'tỉnh']); // T8

      // T3: file Trả hàng KHÔNG có cột "Order Refund Amount" -> lùi về "Order Amount".
      var refundIdx = findCol(hMap, ['order refund amount', 'số tiền hoàn trả']);
      if (refundIdx === undefined) refundIdx = findCol(hMap, ['order amount', 'tổng giá trị đơn']);

      for (var row2 = dataStart; row2 <= range.e.r; row2++) {
        var tid2 = getCellStr(ws, row2, tidIdx);
        if (!isLikelyRealTrackingId(tid2)) continue;
        var cleanTid2 = sanitizeTrackingId(tid2);
        if (filterOther && isOtherPlatformId(cleanTid2)) { filteredIds.add(cleanTid2); continue; } // T2
        tikTokRecords.push({
          shop: shop, type: ftype, loai: item.loai, tid: tid2, cleanTid: cleanTid2,
          prod:    prodIdx    !== undefined ? getCellStr(ws, row2, prodIdx)    : '',
          variant: variantIdx !== undefined ? getCellStr(ws, row2, variantIdx) : '',
          refund:  refundIdx  !== undefined ? parseMoneyTikTok(getCellStr(ws, row2, refundIdx)) : 0, // T3
          ship:    shipIdx    !== undefined ? getCellStr(ws, row2, shipIdx)    : '',
          pay:     payIdx     !== undefined ? getCellStr(ws, row2, payIdx)     : '',
          prov:    provIdx    !== undefined ? getCellStr(ws, row2, provIdx)    : ''
        });
      }
    });

    // ĐỐI SOÁT
    var cleanTikTokIds = new Set(tikTokRecords.map(function (r) { return r.cleanTid; }));
    var seenMiss = new Set();
    var missA = [];
    tikTokRecords.forEach(function (rec) {
      if (!doiSoatIds.has(rec.cleanTid) && !seenMiss.has(rec.cleanTid)) {
        missA.push(rec); seenMiss.add(rec.cleanTid);
      }
    });

    // MissB: Kho chưa có TikTok — giữ ngày cũ của kho chung
    var missB = [];
    doiSoatIds.forEach(function (cleanId) {
      if (!cleanTikTokIds.has(cleanId)) {
        missB.push({
          id: originalDoiSoatIds.get(cleanId) || cleanId, cleanId: cleanId,
          date: existingDates.has(cleanId) ? existingDates.get(cleanId) : today
        });
      }
    });

    // T1: mẫu số phải là TỔNG MÃ TIKTOK, không phải tổng mã Kho.
    var matchCount = 0;
    cleanTikTokIds.forEach(function (cleanId) { if (doiSoatIds.has(cleanId)) matchCount++; });
    var rate = cleanTikTokIds.size ? Math.round(matchCount / cleanTikTokIds.size * 100) : 0;

    return {
      records: tikTokRecords, khoIds: doiSoatIds, tikTokIds: cleanTikTokIds, filteredIds: filteredIds,
      filtered: Array.from(filteredBacklog.values()), missA: missA, missB: missB,
      matchCount: matchCount, rate: rate, filterOther: filterOther,
      // doiSoatIds đã loại mã bị lọc -> phép giao không bao giờ chứa SPXVN/GY khi bật bộ lọc.
      toRemove: Common.matchedToRemove(cleanTikTokIds, doiSoatIds)
    };
  }

  return { match: match, parseShopName: parseShopName, parseFileType: parseFileType,
           parseMoneyTikTok: parseMoneyTikTok, normalizePay: normalizePay, typeLabel: typeLabel };
});
