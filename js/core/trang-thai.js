/* =====================================================================
   TrangThai — mô hình kho "không xoá, chỉ đổi trạng thái" phía trang web.
   Dòng kho từ server: [ma_sach, ma_goc, ngay_doi_soat, trang_thai, san,
   gian_hang, loai_file, ngay_khop]; trang_thai 'cho' | 'khop'.
   Không đụng DOM; dùng chung cho tab Kho, Shopee, TikTok, Đã đối soát.
   ===================================================================== */
(function (root, factory) {
  var api = factory(root.Common || (typeof require === 'function' ? require('./common.js') : null));
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TrangThai = api;
})(typeof self !== 'undefined' ? self : this, function (Common) {
  'use strict';

  var COL = { MA: 0, GOC: 1, NGAY: 2, TT: 3, SAN: 4, GIAN: 5, LOAI: 6, NGAY_KHOP: 7 };
  var CHO = 'cho', KHOP = 'khop';
  var LOAI_FILE = ['Giao KTC', 'Trả hàng', 'Đơn hàng', 'Khiếu nại', 'Khác'];
  var SAN_LABEL = { shopee: 'Shopee', tiktok: 'TikTok' };
  var TT_LABEL = { cho: 'Chờ đối soát', khop: 'Đã khớp' };

  function isKhop(r) { return r[COL.TT] === KHOP; }

  // Toàn bộ mã trong kho (cả 'cho' lẫn 'khop') ở dạng thuật toán đối soát dùng.
  function items(rows) {
    return (rows || []).map(function (r) { return { c: r[COL.MA], id: r[COL.GOC] || r[COL.MA], d: r[COL.NGAY] }; });
  }

  function statusMap(rows) {
    var m = new Map();
    (rows || []).forEach(function (r) { m.set(r[COL.MA], toInfo(r)); });
    return m;
  }

  function toInfo(r) {
    return { ma: r[COL.MA], maGoc: r[COL.GOC] || r[COL.MA], ngayDoiSoat: r[COL.NGAY], trangThai: isKhop(r) ? KHOP : CHO,
      san: r[COL.SAN] || '', gianHang: r[COL.GIAN] || '', loaiFile: r[COL.LOAI] || '', ngayKhop: r[COL.NGAY_KHOP] || '' };
  }

  function counts(rows) {
    var khop = (rows || []).filter(isKhop).length;
    return { tong: (rows || []).length, cho: (rows || []).length - khop, khop: khop };
  }

  // Đưa nhãn loại file tự do (vd cột "Loại tệp tin" của file mẫu) về 1 trong 5 loại.
  function chuanHoaLoai(text, fallback) {
    var s = String(text || '').trim();
    if (LOAI_FILE.indexOf(s) >= 0) return s;
    var l = s.toLowerCase();
    if (/khiếu nại|khieu nai/.test(l)) return 'Khiếu nại';
    if (/giao|ktc|failed|unsuccessful/.test(l)) return 'Giao KTC';
    if (/trả hàng|tra hang|hoàn|hoan|return|refund/.test(l)) return 'Trả hàng';
    if (/đơn|don hang|order|hủy|huy/.test(l)) return 'Đơn hàng';
    return LOAI_FILE.indexOf(fallback) >= 0 ? fallback : 'Khác';
  }

  // Nhãn loại file của một dòng kết quả: dòng từ file mẫu/xuất lại dùng cột "Loại tệp tin".
  function loaiCuaDong(rec) {
    if (rec.kind === 'exported' || rec.type === 'exported') return chuanHoaLoai(rec.typeLabel, rec.loai);
    return LOAI_FILE.indexOf(rec.loai) >= 0 ? rec.loai : 'Khác';
  }

  /* Sau khi chạy thuật toán đối soát (với khoItems = mọi mã trong kho):
     - khop: mã 'cho' có trong chứng từ của sàn đang chạy -> chuyển sang 'khop',
       kèm gian hàng + loại file lấy từ dòng chứng từ đầu tiên của mã đó;
     - daKhopTruoc: mã đã 'khop' từ trước (vẫn tính là khớp, không gửi lên);
     - missB / filtered: chỉ giữ mã còn 'cho' (mã đã khớp không phải "kho chưa có chứng từ"). */
  function sauDoiSoat(R, rows) {
    var st = statusMap(rows);
    var firstRec = new Map();
    (R.records || []).forEach(function (rec) { if (!firstRec.has(rec.cleanTid)) firstRec.set(rec.cleanTid, rec); });
    var khop = [], daKhopTruoc = [];
    (R.toRemove || []).forEach(function (ma) {
      var s = st.get(ma);
      if (!s) return;
      if (s.trangThai === KHOP) { daKhopTruoc.push(ma); return; }
      var rec = firstRec.get(ma) || {};
      khop.push({ ma: ma, maGoc: s.maGoc, gian: rec.shop || '', loai: rec.shop !== undefined ? loaiCuaDong(rec) : 'Khác' });
    });
    var isCho = function (m) { var s = st.get(m.cleanId); return !s || s.trangThai === CHO; };
    var choIds = 0;
    (R.khoIds || new Set()).forEach(function (c) { var s = st.get(c); if (s && s.trangThai === CHO) choIds++; });
    return { khop: khop, daKhopTruoc: daKhopTruoc, missB: (R.missB || []).filter(isCho),
             filtered: (R.filtered || []).filter(isCho), soCho: choIds };
  }

  // Ô "Tìm một mã": trạng thái của một mã trong kho.
  function lookup(rows, query) {
    var ma = Common.sanitizeTrackingId(query);
    if (!ma) return null;
    var hit = (rows || []).find(function (r) { return r[COL.MA] === ma; });
    if (!hit) return { ma: ma, trangThai: 'khong', nhan: 'Không có trong kho' };
    var info = toInfo(hit);
    info.nhan = TT_LABEL[info.trangThai];
    info.sanLabel = SAN_LABEL[info.san] || '';
    return info;
  }

  return { COL: COL, CHO: CHO, KHOP: KHOP, LOAI_FILE: LOAI_FILE, SAN_LABEL: SAN_LABEL, TT_LABEL: TT_LABEL,
           isKhop: isKhop, items: items, statusMap: statusMap, counts: counts, chuanHoaLoai: chuanHoaLoai,
           loaiCuaDong: loaiCuaDong, sauDoiSoat: sauDoiSoat, lookup: lookup };
});
