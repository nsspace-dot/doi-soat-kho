/* =====================================================================
   DsTab — tab "Đã đối soát": bảng mã đã khớp (không có cột người), lọc
   theo sàn / gian hàng / tuần khớp / tìm mã, phân trang, xuất Excel theo
   bộ lọc đang chọn. Dữ liệu lấy từ bản kho chung đã tải (Kho.rows()).
   ===================================================================== */
var DsTab = (function () {
  var esc = Common.escapeHtml, fmtNum = Common.fmtNum;
  var pageSize = 20, page = 1, all = [], shown = [];
  function $(id) { return document.getElementById(id); }

  function current() {
    return { san: $('ds_san').value, gian: $('ds_gian').value, tuan: $('ds_tuan').value, q: $('ds_q').value };
  }

  function fillSelect(el, first, opts) {
    var keep = el.value;
    el.innerHTML = '<option value="">' + esc(first) + '</option>' + opts.map(function (o) {
      return '<option value="' + esc(o.value) + '">' + esc(o.label) + '</option>';
    }).join('');
    el.value = opts.some(function (o) { return o.value === keep; }) ? keep : '';
  }

  function load() {
    all = DaDoiSoat.list(Kho.rows());
    var o = DaDoiSoat.options(all);
    fillSelect($('ds_gian'), 'Tất cả gian hàng', o.gian.map(function (g) { return { value: g, label: g }; }));
    fillSelect($('ds_tuan'), 'Tất cả tuần khớp', o.tuan.map(function (t) { return { value: t.key, label: t.label }; }));
    var giu = Kho.state && Kho.state.info && Kho.state.info.giuNgay;
    $('ds_giu').textContent = 'Giữ ' + (giu || 60) + ' ngày rồi tự dọn: mã Đã khớp tự xoá khỏi kho sau ' + (giu || 60) + ' ngày kể từ ngày khớp.';
    render();
  }

  function render() {
    shown = DaDoiSoat.filter(all, current());
    var ready = Kho.status === 'ok';
    $('ds_empty').hidden = !ready || all.length > 0;
    $('ds_body').hidden = ready && !all.length;
    $('ds_count').textContent = ready ? fmtNum(shown.length) + ' / ' + fmtNum(all.length) + ' mã đã khớp' : (Kho.status === 'loading' ? 'Đang tải…' : 'Chưa đọc được kho chung');
    $('ds_export').disabled = !shown.length;
    var totalPages = Math.max(1, Math.ceil(shown.length / pageSize));
    if (page > totalPages) page = totalPages;
    var start = (page - 1) * pageSize;
    $('ds_tbody').innerHTML = shown.length ? shown.slice(start, start + pageSize).map(function (x, i) {
      return '<tr><td>' + (start + i + 1) + '</td><td><code>' + esc(x.maGoc || x.ma) + '</code></td>' +
        '<td>' + esc(x.sanLabel) + '</td><td>' + esc(x.gianHang || '—') + '</td><td><span class="type-tag">' + esc(x.loaiFile || '—') + '</span></td>' +
        '<td>' + esc(x.ngayDoiSoat) + '</td><td>' + esc(x.ngayKhop) + '</td></tr>';
    }).join('') : '<tr class="empty-row"><td colspan="7">Không có mã nào khớp bộ lọc.</td></tr>';
    UI.renderPager($('ds_pager'), page, totalPages, function (p) { page = p; render(); });
  }

  function exportExcel() {
    if (!shown.length) { UI.toast('Không có mã nào để xuất'); return; }
    var t = new Date();
    UI.downloadWb(DaDoiSoat.buildExportWorkbook(shown),
      'Da_doi_soat_' + t.getFullYear() + '-' + Common.pad(t.getMonth() + 1) + '-' + Common.pad(t.getDate()) + '.xlsx');
  }

  function init() {
    ['ds_san', 'ds_gian', 'ds_tuan'].forEach(function (id) { $(id).addEventListener('change', function () { page = 1; render(); }); });
    $('ds_q').addEventListener('input', function () { page = 1; render(); });
    Kho.onChange(load);
    load();
  }

  return { init: init, exportExcel: exportExcel, render: render };
})();
