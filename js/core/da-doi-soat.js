/* =====================================================================
   DaDoiSoat — dữ liệu cho tab "Đã đối soát": danh sách mã trạng thái
   'khop', bộ lọc (sàn, gian hàng, tuần khớp ISO, tìm mã) và file Excel xuất
   theo đúng bộ lọc đang chọn. Không đụng DOM.
   ===================================================================== */
(function (root, factory) {
  var req = typeof require === 'function' ? require : null;
  var api = factory(root.Common || req('./common.js'), root.TrangThai || req('./trang-thai.js'));
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DaDoiSoat = api;
})(typeof self !== 'undefined' ? self : this, function (Common, TrangThai) {
  'use strict';

  function parseVn(s) {
    var m = String(s || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null;
  }
  function dayKey(s) { var d = parseVn(s); return d ? d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate() : 0; }

  // Tuần ISO của ngày khớp: { label: 'Tuần 44/2026', key: 202644 }
  function tuanKhop(ngayKhop) {
    var d = parseVn(ngayKhop);
    if (!d) return { label: '', key: 0 };
    var w = Common.isoWeek(d);
    return { label: 'Tuần ' + w.week + '/' + w.year, key: w.year * 100 + w.week };
  }

  // Mã 'khop', mới khớp lên đầu.
  function list(rows) {
    return (rows || []).filter(TrangThai.isKhop).map(function (r) {
      var x = TrangThai.lookup([r], r[TrangThai.COL.MA]);
      var t = tuanKhop(x.ngayKhop);
      x.tuan = t.label; x.tuanKey = t.key;
      return x;
    }).sort(function (a, b) { return dayKey(b.ngayKhop) - dayKey(a.ngayKhop) || (a.ma < b.ma ? -1 : a.ma > b.ma ? 1 : 0); });
  }

  // Giá trị cho các ô lọc.
  function options(items) {
    var gian = {}, tuan = {};
    items.forEach(function (x) {
      if (x.gianHang) gian[x.gianHang] = true;
      if (x.tuanKey) tuan[x.tuanKey] = x.tuan;
    });
    return {
      gian: Object.keys(gian).sort(function (a, b) { return a.localeCompare(b, 'vi'); }),
      tuan: Object.keys(tuan).map(Number).sort(function (a, b) { return b - a; }).map(function (k) { return { key: String(k), label: tuan[k] }; })
    };
  }

  // f: { san: ''|'shopee'|'tiktok', gian: ''|tên, tuan: ''|'202644', q: chuỗi tìm mã }
  function filter(items, f) {
    f = f || {};
    var q = Common.sanitizeTrackingId(f.q || '');
    return items.filter(function (x) {
      if (f.san && x.san !== f.san) return false;
      if (f.gian && x.gianHang !== f.gian) return false;
      if (f.tuan && String(x.tuanKey) !== String(f.tuan)) return false;
      if (q && x.ma.indexOf(q) < 0) return false;
      return true;
    });
  }

  var HEADER = ['STT', 'Mã vận đơn', 'Sàn', 'Gian hàng', 'Loại file', 'Ngày đối soát', 'Ngày khớp', 'Tuần khớp'];

  function buildExportWorkbook(items) {
    var XL = Common.xlsx();
    var aoa = [HEADER].concat(items.map(function (x, i) {
      return [i + 1, String(x.maGoc || x.ma), x.sanLabel, x.gianHang, x.loaiFile, x.ngayDoiSoat, x.ngayKhop, x.tuan];
    }));
    var ws = XL.utils.aoa_to_sheet(aoa);
    Common.forceTextCol(ws, 1);
    ws['!cols'] = [{ wch: 6 }, { wch: 26 }, { wch: 10 }, { wch: 24 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
    var wb = XL.utils.book_new();
    XL.utils.book_append_sheet(wb, ws, 'Da_doi_soat');
    return wb;
  }

  return { tuanKhop: tuanKhop, list: list, options: options, filter: filter, buildExportWorkbook: buildExportWorkbook, HEADER: HEADER };
});
