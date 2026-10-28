/* =====================================================================
   KhopKho — tab con "Đã khớp kho" ở tab Shopee / TikTok: các mã trong
   chứng từ sàn của lần đối soát vừa chạy mà CÓ trong kho (cả mã đang
   "Chờ đối soát" lẫn mã đã "Đã khớp" từ trước). Mỗi mã một lần.
   Chỉ đọc kết quả đối soát; không đổi logic đối soát hay cách lưu kho.
   ===================================================================== */
(function (root, factory) {
  var req = typeof require === 'function' ? require : null;
  var api = factory(root.Common || req('./common.js'), root.TrangThai || req('./trang-thai.js'));
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KhopKho = api;
})(typeof self !== 'undefined' ? self : this, function (Common, TrangThai) {
  'use strict';

  var HEADER = ['STT', 'Gian hàng', 'Loại file', 'Mã vận đơn', 'Ngày đối soát'];
  var CODE_COL = 3;

  /* R: kết quả ShopeeCore.match / TikTokCore.match (với khoItems = mọi mã trong kho)
     rows: dòng kho chung; vuaKhop: T.khop của TrangThai.sauDoiSoat (mã sắp chuyển sang Đã khớp).
     Thứ tự theo dòng chứng từ; gian + loại file lấy từ nhãn của file sàn chứa dòng đầu tiên của mã. */
  function list(R, rows, vuaKhop) {
    var st = TrangThai.statusMap(rows);
    var moi = new Set((vuaKhop || []).map(function (x) { return x.ma; }));
    var seen = new Set(), out = [];
    (R.records || []).forEach(function (rec) {
      var ma = rec.cleanTid;
      if (seen.has(ma) || !R.khoIds.has(ma)) return;
      seen.add(ma);
      var s = st.get(ma) || {};
      out.push({
        ma: ma, tid: rec.tid, gian: rec.shop || '', loai: TrangThai.loaiCuaDong(rec),
        ngayDoiSoat: s.ngayDoiSoat || '', vuaKhop: moi.has(ma), daKhopTruoc: s.trangThai === TrangThai.KHOP
      });
    });
    return out;
  }

  // Ô "Tìm mã vận đơn…": so theo mã sạch, không phân biệt hoa thường / dấu gạch.
  function filter(items, q) {
    var s = Common.sanitizeTrackingId(q || '');
    if (!s) return items;
    return items.filter(function (x) { return x.ma.indexOf(s) >= 0; });
  }

  // Cùng bộ cột như bảng; cột Mã vận đơn khoá định dạng Text.
  function buildWorkbook(items, san) {
    var XL = Common.xlsx();
    var aoa = [HEADER].concat(items.map(function (x, i) { return [i + 1, x.gian, x.loai, String(x.tid || x.ma), x.ngayDoiSoat]; }));
    var ws = XL.utils.aoa_to_sheet(aoa);
    Common.forceTextCol(ws, CODE_COL);
    ws['!cols'] = [{ wch: 6 }, { wch: 24 }, { wch: 12 }, { wch: 26 }, { wch: 14 }];
    var wb = XL.utils.book_new();
    XL.utils.book_append_sheet(wb, ws, (san === 'tiktok' ? 'TikTok' : 'Shopee') + '_da_khop_kho');
    return wb;
  }

  return { HEADER: HEADER, list: list, filter: filter, buildWorkbook: buildWorkbook };
});
