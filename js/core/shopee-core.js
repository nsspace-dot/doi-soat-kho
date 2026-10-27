/* =====================================================================
   ShopeeCore — phần tính toán của nút "Tiến hành đối soát" tab Shopee,
   tách nguyên văn từ SP.runMatch của công cụ gốc. Khác biệt duy nhất:
   tập mã Kho lấy từ kho chung trên server (thay cho file Kho + Sổ mã), và
   trả thêm danh sách mã cần xoá khỏi kho chung (toRemove).
   ===================================================================== */
(function (root, factory) {
  var req = typeof require === 'function' ? require : null;
  var api = factory(root.Common || req('./common.js'), root.Template || req('./template.js'));
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ShopeeCore = api;
})(typeof self !== 'undefined' ? self : this, function (Common, Template) {
  'use strict';
  var findCol = Common.findCol, getCellStr = Common.getCellStr,
      sanitizeTrackingId = Common.sanitizeTrackingId, isLikelyRealTrackingId = Common.isLikelyRealTrackingId;

  /* ---------- S9: đọc tiền của Shopee ----------
     Shopee ghi "135150.00", "240000.00" -> dấu chấm là THẬP PHÂN.
     Ngược hẳn TikTok ("142.000₫" = 142 nghìn). Tuyệt đối không dùng chung hàm:
     áp nhầm hàm TikTok lên Shopee sẽ cho 13.515.000, sai gấp 100 lần.          */
  function parseMoneyShopee(raw) {
    if (raw === null || raw === undefined) return 0;
    var s = String(raw).trim();
    if (!s) return 0;
    var neg = s.indexOf('-') >= 0;
    s = s.replace(/[^\d.,]/g, '').replace(/,/g, ''); // dấu phẩy chỉ là ngăn cách nghìn
    if (!s) return 0;
    var n = parseFloat(s) || 0;
    return neg ? -n : n;
  }

  /* ---------- S8: gộp nhóm thanh toán ---------- */
  function normalizePay(raw) {
    var s = String(raw || '').trim();
    if (!s) return 'Không rõ';
    var l = s.toLowerCase();
    if (l.indexOf('thanh toán khi nhận hàng') >= 0 || l.indexOf('cash on delivery') >= 0 || l === 'cod')
      return 'COD — thanh toán khi nhận hàng';
    return s;
  }

  function prefixLabel(cleanId) {
    if (!cleanId) return 'Khác';
    if (cleanId.indexOf('SPXVN') === 0) return 'SPXVN — SPX Express';
    if (/^GY[A-Z0-9]{6}$/.test(cleanId)) return 'GY… — GHN mã ngắn';
    if (/^\d{12}$/.test(cleanId)) return '12 số — J&T';
    if (cleanId.indexOf('VNGH') === 0) return 'VNGH — GHN';
    if (cleanId.indexOf('VTPVN') === 0) return 'VTPVN — Viettel Post';
    return 'Khác';
  }

  function parseShopName(fname) {
    var s = fname.replace(/\.[^.]+$/, '');
    s = s.replace(/[_\-]+/g, ' ').trim();
    s = s.replace(/\s*\d{2,4}[\s\-\/]\d{1,2}([\s\-\/]\d{1,4})?\s*$/, '').trim();
    return s || fname;
  }

  function typeLabel(rec) {
    if (rec.kind === 'don') return 'Đơn hàng (hủy / giao KTC)';
    if (rec.kind === 'khieunai') return 'Khiếu nại trả hàng';
    return rec.typeLabel || 'Đã xuất lại lệch';
  }

  /* opts:
       files: [{ wb, kind: 'don'|'khieunai', shop }]
       khoItems: [{ c: mã sạch, id: mã gốc, d: ngày đối soát }]  (kho chung)
       skipRefundOnly: bool
       today: 'dd/mm/yyyy'                                                    */
  function match(opts) {
    var skipRefundOnly = opts.skipRefundOnly !== false;
    var today = opts.today || Common.today();

    /* ---- Kho chung (thay cho file Kho + Sổ mã của bản gốc) ---- */
    var khoIds = new Set(), originalKhoIds = new Map(), existingDates = new Map();
    (opts.khoItems || []).forEach(function (it) {
      var c = it.c;
      khoIds.add(c);
      if (!originalKhoIds.has(c)) originalKhoIds.set(c, it.id || c);
      if (it.d && !existingDates.has(c)) existingDates.set(c, it.d);
    });

    /* ---- Đọc 2 loại file Shopee ---- */
    var records = [];           // giữ NGUYÊN cấp SKU để biểu đồ sản phẩm không bị hụt
    var refundOnlyCount = 0;    // S2: hoàn tiền không có hàng trả về
    var noTidCount = 0;

    (opts.files || []).forEach(function (item) {
      var kind = item.kind, shop = item.shop;
      var ws = Common.firstSheet(item.wb);
      var rg = Common.sheetRange(ws);
      var h = Common.detectHeader(ws, rg, ['mã đơn hàng', 'mã vận đơn', 'tên sản phẩm', 'mã số khiếu nại']);
      var hMap = h.hMap;

      // File mẫu đơn thiếu / file xuất "chưa về kho" nạp lại.
      if (Template.isListHeader(hMap)) {
        Template.readListRows(ws, h.headerRow, hMap, shop).forEach(function (x) {
          records.push({ shop: x.shop, kind: 'exported', typeLabel: x.typeLabel, tid: x.tid, cleanTid: x.cleanTid,
            oid: '', prod: x.prod, variant: x.variant, prov: '', pay: '', dvvc: '', amt: 0, kho: x.kho, week: x.week });
        });
        return;
      }

      var tidIdx, dvvcIdx, amtIdx, amtAltIdx, phuongAnIdx, retStatusIdx;
      if (kind === 'don') {
        // S1: file đơn hàng -> hàng quay đầu giữ nguyên mã giao
        tidIdx  = findCol(hMap, ['mã vận đơn', 'tracking'], ['kiện']);
        dvvcIdx = findCol(hMap, ['đơn vị vận chuyển']);
        amtIdx  = findCol(hMap, ['tổng giá trị đơn hàng', 'tổng giá trị']);
      } else {
        // S1: file khiếu nại -> BẮT BUỘC dùng cột mã vận đơn TRẢ HÀNG.
        tidIdx = findCol(hMap, ['mã vận đơn trả hàng', 'mã vận đơn trả', 'return tracking'], ['giao']);
        if (tidIdx === undefined) tidIdx = findCol(hMap, ['mã vận đơn'], ['giao', 'kiện']);
        // S7: ưu tiên ĐVVC chiều trả, rỗng thì mới lùi về chiều giao
        dvvcIdx = findCol(hMap, ['đơn vị vận chuyển trả hàng'], []);
        if (dvvcIdx === undefined) dvvcIdx = findCol(hMap, ['đơn vị vận chuyển']);
        amtIdx  = findCol(hMap, ['tổng số tiền hoàn trả']);
        amtAltIdx = findCol(hMap, ['tổng giá trị']);   // Shopee thường để 0 ở cột hoàn trả
        phuongAnIdx  = findCol(hMap, ['phương án']);
        retStatusIdx = findCol(hMap, ['trạng thái trả hàng']);
      }
      var dvvcGiaoIdx = findCol(hMap, ['đơn vị vận chuyển giao hàng', 'đơn vị vận chuyển'], ['trả']);
      var oidIdx  = findCol(hMap, ['mã đơn hàng']);
      var prodIdx = findCol(hMap, ['tên sản phẩm', 'product name']);
      var provIdx = findCol(hMap, ['tỉnh/thành', 'province']);   // S10
      var payIdx  = findCol(hMap, ['phương thức thanh toán', 'payment method']);
      // Chỉ dùng cho cột "Phân loại" của file xuất đơn thiếu.
      var variantIdx = findCol(hMap, ['tên phân loại', 'phân loại hàng', 'variation']);
      if (tidIdx === undefined) return;

      for (var r = h.headerRow + 1; r <= rg.e.r; r++) {
        var rawTid = getCellStr(ws, r, tidIdx);
        if (!isLikelyRealTrackingId(rawTid)) {
          if (kind === 'khieunai') {
            var pa = phuongAnIdx  !== undefined ? getCellStr(ws, r, phuongAnIdx).toLowerCase()  : '';
            var rs = retStatusIdx !== undefined ? getCellStr(ws, r, retStatusIdx).toLowerCase() : '';
            var hasRow = (oidIdx !== undefined && getCellStr(ws, r, oidIdx).trim() !== '');
            if (hasRow) {
              // S2: khách chỉ đòi hoàn tiền, không gửi hàng -> KHÔNG phải thất thoát
              if (pa.indexOf('hoàn tiền ngay') >= 0 || rs === 'không') refundOnlyCount++;
              else noTidCount++;
            }
          }
          continue;
        }
        var cleanTid = sanitizeTrackingId(rawTid);
        var dv = dvvcIdx !== undefined ? getCellStr(ws, r, dvvcIdx) : '';
        if (!dv && dvvcGiaoIdx !== undefined) dv = getCellStr(ws, r, dvvcGiaoIdx);
        var amt = amtIdx !== undefined ? parseMoneyShopee(getCellStr(ws, r, amtIdx)) : 0;   // S9
        if (!amt && amtAltIdx !== undefined) amt = parseMoneyShopee(getCellStr(ws, r, amtAltIdx));
        records.push({
          shop: shop, kind: kind, tid: rawTid, cleanTid: cleanTid,
          oid:  oidIdx  !== undefined ? getCellStr(ws, r, oidIdx)  : '',
          prod: prodIdx !== undefined ? getCellStr(ws, r, prodIdx) : '',
          variant: variantIdx !== undefined ? getCellStr(ws, r, variantIdx) : '',
          prov: provIdx !== undefined ? getCellStr(ws, r, provIdx) : '',
          pay:  payIdx  !== undefined ? getCellStr(ws, r, payIdx)  : '',
          dvvc: dv,
          amt:  amt
        });
      }
    });

    if (!skipRefundOnly) { noTidCount += refundOnlyCount; refundOnlyCount = 0; }

    /* ---- S6: gom mã DUY NHẤT để đối soát, nhưng giữ mọi dòng cho biểu đồ ---- */
    var shopeeIds = new Set(records.map(function (x) { return x.cleanTid; }));

    var seen = new Set(), missA = [];
    records.forEach(function (rec) {
      if (!khoIds.has(rec.cleanTid) && !seen.has(rec.cleanTid)) { missA.push(rec); seen.add(rec.cleanTid); }
    });

    /* ---- S4: chiều ngược — mã đã về kho nhưng Shopee chưa ghi nhận ---- */
    var missB = [];
    khoIds.forEach(function (cleanId) {
      if (!shopeeIds.has(cleanId)) {
        missB.push({
          id: originalKhoIds.get(cleanId) || cleanId,
          cleanId: cleanId,
          date: existingDates.has(cleanId) ? existingDates.get(cleanId) : today
        });
      }
    });

    var matchCount = 0;
    shopeeIds.forEach(function (id) { if (khoIds.has(id)) matchCount++; });
    var rate = shopeeIds.size ? Math.round(matchCount / shopeeIds.size * 100) : 0;

    return {
      records: records, khoIds: khoIds, shopeeIds: shopeeIds, missA: missA, missB: missB,
      matchCount: matchCount, rate: rate, refundOnlyCount: refundOnlyCount, noTidCount: noTidCount,
      // Chỉ những mã Shopee đã ghi nhận VÀ có trong kho chung.
      toRemove: Common.matchedToRemove(shopeeIds, khoIds)
    };
  }

  return { match: match, parseMoneyShopee: parseMoneyShopee, normalizePay: normalizePay,
           prefixLabel: prefixLabel, parseShopName: parseShopName, typeLabel: typeLabel };
});
