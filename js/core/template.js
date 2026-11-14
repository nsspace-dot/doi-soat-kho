/* =====================================================================
   Template — bộ cột của file mẫu "đơn thiếu" và file xuất "Sàn báo, kho
   chưa nhận" của cả hai sàn.
   File mẫu:
     Tuần đối soát | KHO | Mã vận đơn | Gian hàng <Sàn> | Loại tệp tin | Tên sản phẩm | Phân loại
     (cột 4 là "Gian hàng Shopee" ở tab Shopee, "Gian hàng TikTok" ở tab TikTok)
   File xuất / "Chép bảng" (đúng thứ tự cột của Google Sheet theo dõi):
     Tuần đối soát | KHO | Mã vận đơn | Gian hàng | Loại tệp tin | Tên sản phẩm | Phân loại |
     Thời gian trả trên hệ thống | ĐVVC | Lý do
   - Cột "Mã vận đơn" khoá định dạng Text. Nạp lại nhận cả hai bộ cột.
   ===================================================================== */
(function (root, factory) {
  var api = factory(root.Common || (typeof require === 'function' ? require('./common.js') : null));
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Template = api;
})(typeof self !== 'undefined' ? self : this, function (Common) {
  'use strict';

  var SHOP_COL = { shopee: 'Gian hàng Shopee', tiktok: 'Gian hàng TikTok' };
  var CODE_COL_IDX = 2;
  // Mã ví dụ trong file mẫu: 12 số bắt đầu bằng 0 để thấy rõ định dạng Text.
  // Dòng mang mã này bị bỏ qua khi nạp lại, lỡ người dùng quên xoá.
  var EXAMPLE_CODE = '012345678901';
  // Số dòng trống được khoá sẵn định dạng Text ở cột Mã vận đơn của file mẫu.
  var TEMPLATE_BLANK_ROWS = 300;

  function columns(platform) {
    if (!SHOP_COL[platform]) throw new Error('Sàn không hợp lệ: ' + platform);
    return ['Tuần đối soát', 'KHO', 'Mã vận đơn', SHOP_COL[platform], 'Loại tệp tin', 'Tên sản phẩm', 'Phân loại'];
  }

  var COL_WIDTHS = [{ wch: 14 }, { wch: 14 }, { wch: 26 }, { wch: 24 }, { wch: 28 }, { wch: 40 }, { wch: 24 }];

  // Bộ cột file xuất "Sàn báo, kho chưa nhận": dán thẳng vào Google Sheet theo dõi.
  var EXPORT_COLS = ['Tuần đối soát', 'KHO', 'Mã vận đơn', 'Gian hàng', 'Loại tệp tin', 'Tên sản phẩm', 'Phân loại',
    'Thời gian trả trên hệ thống', 'ĐVVC', 'Lý do'];
  var EXPORT_WIDTHS = COL_WIDTHS.concat([{ wch: 24 }, { wch: 16 }, { wch: 30 }]);

  function exampleRow(platform, date) {
    return [Common.isoWeekLabel(date), '', EXAMPLE_CODE,
      '(Ví dụ) Tên gian hàng',
      platform === 'shopee' ? 'Đơn hàng (hủy / giao KTC)' : 'Giao không thành công',
      '(Ví dụ) Xoá dòng này rồi điền đơn sàn báo nhưng kho chưa nhận', '(Ví dụ) Màu đỏ, size M'];
  }

  function sheetFromAoa(aoa, blankTextRows, widths) {
    var XL = Common.xlsx();
    var ws = XL.utils.aoa_to_sheet(aoa);
    Common.forceTextCol(ws, CODE_COL_IDX);
    if (blankTextRows) {
      // Ô trống định dạng '@' để mã người dùng gõ tay vào vẫn là chữ.
      var last = aoa.length - 1;
      for (var r = last + 1; r <= last + blankTextRows; r++) {
        ws[XL.utils.encode_cell({ r: r, c: CODE_COL_IDX })] = { t: 's', v: '', z: '@' };
      }
      var rg = XL.utils.decode_range(ws['!ref']);
      rg.e.r = last + blankTextRows;
      ws['!ref'] = XL.utils.encode_range(rg);
    }
    ws['!cols'] = widths || COL_WIDTHS;
    return ws;
  }

  function buildTemplateWorkbook(platform, date) {
    var XL = Common.xlsx();
    var ws = sheetFromAoa([columns(platform), exampleRow(platform, date || new Date())], TEMPLATE_BLANK_ROWS);
    var wb = XL.utils.book_new();
    XL.utils.book_append_sheet(wb, ws, 'Don_thieu');
    return wb;
  }

  /* records: các dòng "sàn báo, kho chưa nhận" (resultMissA) đã chuẩn hoá:
     { tid, shop, typeLabel, prod, variant, kho, time, dvvc, lyDo }
     tuan: nhãn "Tuần đối soát" người dùng xác nhận, vd "02/11 - 08/11".      */
  function exportAoa(records, tuan) {
    var aoa = [EXPORT_COLS.slice()];
    (records || []).forEach(function (r) {
      aoa.push([tuan || '', r.kho || '', String(r.tid), r.shop || '', r.typeLabel || '', r.prod || '', r.variant || '',
        r.time || '', r.dvvc || '', r.lyDo || '']);
    });
    return aoa;
  }
  function buildExportWorkbook(platform, records, tuan) {
    var XL = Common.xlsx();
    var ws = sheetFromAoa(exportAoa(records, tuan), 0, EXPORT_WIDTHS);
    var wb = XL.utils.book_new();
    XL.utils.book_append_sheet(wb, ws, platform === 'shopee' ? 'Shopee_chua_ve_kho' : 'TikTok_Lech_Kho');
    return wb;
  }
  // Bảng dạng TSV (có dòng tiêu đề) để dán thẳng vào Google Sheets / Excel.
  // Ô có tab, xuống dòng hoặc ngoặc kép được bọc trong ngoặc kép.
  function toTsv(aoa) {
    return (aoa || []).map(function (row) {
      return row.map(function (v) {
        v = String(v === null || v === undefined ? '' : v);
        return /["\t\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
      }).join('\t');
    }).join('\n');
  }

  function templateFileName(platform) {
    return 'Mau_don_thieu_' + (platform === 'shopee' ? 'Shopee' : 'TikTok') + '.xlsx';
  }

  /* Nhận diện file đơn thiếu: mẫu mới (cả hai tên cột gian hàng) hoặc file
     xuất cũ của tool gốc (có cột "Gian hàng TikTok" hoặc "Ghi chú / Lý do"). */
  function isListHeader(hMap) {
    return ('Tuần đối soát' in hMap) || ('Gian hàng TikTok' in hMap) || ('Gian hàng Shopee' in hMap) || ('Ghi chú / Lý do' in hMap);
  }

  /* Đọc các dòng đơn thiếu từ file mẫu đã điền / file xuất (mới hoặc cũ).
     Trả về [{ tid, cleanTid, shop, typeLabel, prod, variant, week, kho }].   */
  function readListRows(ws, headerRow, hMap, fallbackShop) {
    var rg = Common.sheetRange(ws);
    var maIdx = Common.findCol(hMap, ['mã vận đơn', 'tracking']);
    if (maIdx === undefined) return [];
    var shopIdx = Common.findCol(hMap, ['gian hàng shopee', 'gian hàng tiktok', 'gian hàng']);
    var typeIdx = Common.findCol(hMap, ['loại tệp']);
    var prodIdx = Common.findCol(hMap, ['tên sản phẩm']);
    var varIdx = Common.findCol(hMap, ['phân loại']);
    var weekIdx = Common.findCol(hMap, ['tuần đối soát']);
    var khoIdx = Common.findCol(hMap, ['=kho']);
    var dvvcIdx = Common.findCol(hMap, ['=đvvc', 'đvvc', 'đơn vị vận chuyển']);
    var lyDoIdx = Common.findCol(hMap, ['=lý do', '=lí do', 'lý do', 'lí do']);
    var timeIdx = Common.findCol(hMap, ['thời gian trả']);
    function cell(r, c) { return c === undefined ? '' : Common.getCellStr(ws, r, c); }
    var out = [];
    for (var r = headerRow + 1; r <= rg.e.r; r++) {
      var tid = cell(r, maIdx);
      if (!Common.isLikelyRealTrackingId(tid)) continue;
      var clean = Common.sanitizeTrackingId(tid);
      if (clean === EXAMPLE_CODE) continue;
      out.push({
        tid: tid, cleanTid: clean,
        shop: (shopIdx !== undefined ? cell(r, shopIdx) : '') || fallbackShop || '(Xuất lại)',
        typeLabel: cell(r, typeIdx), prod: cell(r, prodIdx), variant: cell(r, varIdx),
        week: cell(r, weekIdx), kho: cell(r, khoIdx),
        dvvc: cell(r, dvvcIdx), lyDo: cell(r, lyDoIdx), time: cell(r, timeIdx)
      });
    }
    return out;
  }

  return {
    columns: columns, CODE_COL_IDX: CODE_COL_IDX, EXAMPLE_CODE: EXAMPLE_CODE, EXPORT_COLS: EXPORT_COLS,
    buildTemplateWorkbook: buildTemplateWorkbook, buildExportWorkbook: buildExportWorkbook,
    exportAoa: exportAoa, toTsv: toTsv,
    templateFileName: templateFileName, isListHeader: isListHeader, readListRows: readListRows
  };
});
