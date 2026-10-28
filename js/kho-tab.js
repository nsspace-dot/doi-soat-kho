/* =====================================================================
   KhoTab — tab "Kho / Đối soát": nhập mã kho (dán tin nhắn Zalo hoặc tải
   file Excel/CSV), xem trước, xoá mã sai, gộp trùng, rồi lưu vào kho chung.
   Phần xem trước giữ cách làm của trich-ma-kho.html.
   ===================================================================== */
var KhoTab = (function () {
  var esc = Common.escapeHtml, fmtNum = Common.fmtNum;
  var DRAFT_KEY = 'doiSoat_banNhapZalo';
  var pageSize = 12;
  var files = [];
  var rows = [], skipped = [], stats = null, page = 1, search = '';
  var saving = false;

  function $(id) { return document.getElementById(id); }

  /* ---------- file ---------- */
  function addFiles(list) {
    Array.from(list).forEach(function (f) { if (!files.find(function (x) { return x.name === f.name; })) files.push(f); });
    renderFiles();
  }
  function removeFile(i, e) { e.stopPropagation(); files.splice(i, 1); renderFiles(); }
  function renderFiles() {
    $('kho_list').innerHTML = files.map(function (f, i) {
      return '<div class="file-item"><svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' +
        '<span class="file-item-name">' + esc(f.name) + '</span><span class="file-item-type">' + Common.fmtSize(f.size) + '</span>' +
        '<button class="file-item-del" onclick="KhoTab.removeFile(' + i + ',event)"><svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>';
    }).join('');
  }

  /* ---------- xử lý & xem trước ---------- */
  async function process() {
    var text = $('kho_input').value;
    if (!text.trim() && !files.length) { UI.toast('Chưa có tin nhắn hoặc file nào để xử lý'); return; }
    var z = KhoInput.parseZalo(text);
    var entries = z.entries.slice(), skip = z.skipped.slice(), errors = [];
    for (var i = 0; i < files.length; i++) {
      try {
        var wb = await Common.readWb(files[i]);
        var res = KhoInput.parseKhoSheet(Common.firstSheet(wb), files[i].name);
        if (res.error) { errors.push(res.error); continue; }
        entries = entries.concat(res.entries);
        skip = skip.concat(res.skipped.map(function (s) { return files[i].name + ': ' + s; }));
      } catch (err) {
        errors.push('Không đọc được file "' + files[i].name + '": ' + err.message);
      }
    }
    var c = KhoInput.combine(entries);
    rows = c.rows; skipped = skip; page = 1; search = ''; $('kho_search').value = '';
    stats = { total: entries.length, dup: c.dupCount };
    setIdle('kho_step2', false);
    if (errors.length) UI.alert('Có file không dùng được', errors.map(esc).join('<br><br>'));
    render();
    $('kho_step2').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function clearAll() {
    $('kho_input').value = '';
    UI.memDel(DRAFT_KEY);
    files = []; rows = []; skipped = []; stats = null;
    renderFiles();
    setIdle('kho_step2', true);
    setIdle('kho_step3', true);
  }

  // Bước chưa tới: thẻ mờ đi, chỉ hiện một dòng hướng dẫn.
  function setIdle(id, idle) { $(id).classList.toggle('is-idle', idle); }

  function filtered() {
    if (!search) return rows;
    var s = search.toUpperCase();
    return rows.filter(function (r) { return r.code.indexOf(s) >= 0; });
  }

  // Mã hợp lệ sẽ gửi lên: bỏ mã đã 'Đã khớp' trong kho (chống nạp trùng; server cũng bỏ qua).
  function sendable() {
    var st = Kho.status === 'ok' ? TrangThai.statusMap(Kho.rows()) : null;
    return rows.filter(function (r) { var s = st && st.get(r.code); return r.valid && !(s && s.trangThai === TrangThai.KHOP); });
  }

  function render() {
    if (!stats) return;
    var inKho = Kho.status === 'ok' ? Kho.codeSet() : null;
    var stMap = Kho.status === 'ok' ? TrangThai.statusMap(Kho.rows()) : new Map();
    var khopRows = rows.filter(function (r) { var s = stMap.get(r.code); return r.valid && s && s.trangThai === TrangThai.KHOP; });
    var valid = sendable();
    var newCount = inKho ? valid.filter(function (r) { return !inKho.has(r.code); }).length : null;
    var invalid = rows.filter(function (r) { return !r.valid; }).length;
    $('kho_sTotal').textContent = fmtNum(stats.total);
    $('kho_sUnique').textContent = fmtNum(valid.length);
    $('kho_sDup').textContent = fmtNum(stats.dup);
    $('kho_sSkip').textContent = fmtNum(skipped.length + invalid);
    $('kho_sNew').textContent = newCount === null ? '—' : fmtNum(newCount);
    $('kho_sNewSub').textContent = newCount === null ? 'chưa đọc được kho chung' : 'chưa có trong kho chung';

    // "N mã đã khớp trước đó (ngày …), bỏ qua"
    var kb = $('kho_daKhopBox');
    if (khopRows.length) {
      var dates = [];
      khopRows.forEach(function (r) { var d = stMap.get(r.code).ngayKhop; if (d && dates.indexOf(d) < 0) dates.push(d); });
      kb.hidden = false;
      kb.querySelector('span').textContent = fmtNum(khopRows.length) + ' mã đã khớp trước đó (ngày ' +
        (dates.slice(0, 4).join(', ') || '—') + (dates.length > 4 ? ', …' : '') + '), bỏ qua — không đưa về Chờ đối soát.';
    } else kb.hidden = true;

    var box = $('kho_skippedBox');
    if (skipped.length) {
      box.style.display = 'block';
      $('kho_skippedSummary').textContent = 'Xem ' + skipped.length + ' dòng chưa nhận diện được (không tính vào kết quả)';
      $('kho_skippedList').textContent = skipped.join('\n');
    } else box.style.display = 'none';

    var data = filtered();
    var totalPages = Math.max(1, Math.ceil(data.length / pageSize));
    if (page > totalPages) page = totalPages;
    var start = (page - 1) * pageSize;
    var khoDates = {};
    if (inKho && Kho.state) Kho.state.kho.forEach(function (r) { khoDates[r[0]] = r[2]; });
    var today = Common.today();
    $('kho_tbody').innerHTML = data.length ? data.slice(start, start + pageSize).map(function (r, i) {
      var status, date;
      var s = stMap.get(r.code);
      if (!r.valid) { status = '<span class="badge-red">Mã sai — sẽ bỏ qua</span>'; date = '—'; }
      else if (s && s.trangThai === TrangThai.KHOP) { status = '<span class="badge-new">Đã khớp trước đó (' + esc(s.ngayKhop) + ') — bỏ qua</span>'; date = esc(s.ngayDoiSoat); }
      else if (inKho && inKho.has(r.code)) { status = '<span class="badge-amber">Đã có trong kho</span>'; date = esc(khoDates[r.code] || '') + ' (giữ ngày cũ)'; }
      else { status = '<span class="badge-green">Mới</span>'; date = esc(r.keepDate || today); }
      return '<tr><td>' + (start + i + 1) + '</td>' +
        '<td><code>' + esc(r.code) + '</code></td>' +
        '<td><span class="type-tag">' + esc(r.symb) + '</span></td>' +
        '<td>' + esc(r.sender || '—') + '</td>' +
        '<td>' + date + '</td><td>' + status + '</td>' +
        '<td><button class="del-btn" data-code="' + esc(r.code) + '" title="Xoá mã này">✕</button></td></tr>';
    }).join('') : '<tr class="empty-row"><td colspan="7">Không có mã nào khớp tìm kiếm.</td></tr>';
    UI.renderPager($('kho_pager'), page, totalPages, function (p) { page = p; render(); });

    setIdle('kho_step3', !valid.length);
    $('kho_btnSave').disabled = saving || !valid.length;
    $('kho_saveHint').textContent = valid.length
      ? 'Sẽ gửi ' + fmtNum(valid.length) + ' mã hợp lệ' + (newCount !== null ? ' (' + fmtNum(newCount) + ' mã mới)' : '') + '. Mã mới nhận ngày đối soát hôm nay.'
      : (khopRows.length ? 'Mọi mã hợp lệ đều đã khớp trước đó, không có gì để lưu.' : 'Chưa có mã hợp lệ nào.');
  }

  /* ---------- lưu vào kho chung ---------- */
  async function save() {
    if (saving) return;
    if (!Api.configured()) { UI.alert('Chưa cấu hình máy chủ kho chung', UI.guideHtml()); return; }
    var nguoi = $('kho_name').value.trim();
    if (!nguoi) { UI.toast('Nhập "Tên người tải" trước khi lưu'); $('kho_name').focus(); return; }
    UI.setName(nguoi);
    var items = KhoInput.toUploadItems(sendable());
    if (!items.length) { UI.toast('Chưa có mã hợp lệ nào để lưu'); return; }

    setSaving(true, 'Đang đọc kho chung…');
    try {
      try { await Kho.refresh(); }
      catch (err) { UI.alert('Không đọc được kho chung', esc(err.message) + '<br><br>Chưa lưu gì. Danh sách mã của bạn vẫn còn trên trang.'); return; }
      var st = Kho.state, cheDo = 'gop';
      if (st.info.soCho > 0) {
        var inKho = Kho.codeSet();
        var dup = items.filter(function (it) { return inKho.has(it.ma); }).length;
        cheDo = await UI.choose('Kho chung đang có dữ liệu',
          'Kho chung đang có <b>' + fmtNum(st.info.soCho) + '</b> mã Chờ đối soát. Bạn gửi <b>' + fmtNum(items.length) + '</b> mã (' +
          fmtNum(items.length - dup) + ' mã mới, ' + fmtNum(dup) + ' mã đã có).<br><br>' +
          '<b>Gộp thêm vào kho</b>: thêm mã mới, mã đã có giữ ngày đối soát cũ.<br>' +
          '<b>Thay thế kho</b>: phần Chờ đối soát chỉ còn đúng ' + fmtNum(items.length) + ' mã bạn gửi; ' + fmtNum(Math.max(st.info.soCho - dup, 0)) + ' mã chờ khác sẽ bị bỏ. Mã Đã khớp giữ nguyên.',
          [{ label: 'Huỷ', value: null, kind: 'secondary' },
           { label: 'Thay thế kho', value: 'thay', kind: 'danger' },
           { label: 'Gộp thêm vào kho', value: 'gop', kind: 'primary', focus: true }]);
        if (!cheDo) return;
        if (cheDo === 'thay' && !(await UI.confirm('Xác nhận thay thế kho',
          'Phần Chờ đối soát sẽ chỉ còn <b>' + fmtNum(items.length) + '</b> mã. <b>' + fmtNum(Math.max(st.info.soCho - dup, 0)) + '</b> mã chờ đang có sẽ bị bỏ khỏi kho. Mã Đã khớp giữ nguyên. Có thể bấm "Hoàn tác" ngay sau đó nếu nhầm.',
          'Thay thế kho', true))) return;
      }
      setSaving(true, 'Đang lưu…');
      var res;
      try { res = await Api.upload(nguoi, cheDo, items, st.info.phienBan); }
      catch (err) { UI.alert('Chưa lưu được vào kho chung', esc(err.message) + '<br><br>Danh sách mã của bạn vẫn còn trên trang, có thể bấm lưu lại.'); return; }
      Kho.apply(res);
      var k = res.ketQua || {};
      UI.toast('Đã lưu vào kho chung: thêm ' + fmtNum(k.them || 0) + ' mã mới, ' + fmtNum(k.daCo || 0) + ' mã đã có' +
        (k.bo ? ', bỏ ' + fmtNum(k.bo) + ' mã' : '') + (k.daKhop ? ', bỏ qua ' + fmtNum(k.daKhop) + ' mã đã khớp' : '') +
        ' · kho có ' + fmtNum(res.info.soCho) + ' mã chờ đối soát', 7000, 'ok');
      clearAll();
    } finally {
      setSaving(false);
    }
  }
  function setSaving(on, label) {
    saving = on;
    var b = $('kho_btnSave');
    b.disabled = on || !sendable().length;
    b.querySelector('span').textContent = on ? label : 'Lưu vào kho chung';
  }

  /* ---------- kho chung: làm mới, sao lưu, hoàn tác, lịch sử ---------- */
  function refresh() {
    if (!Api.configured()) { UI.alert('Chưa cấu hình máy chủ kho chung', UI.guideHtml()); return; }
    Kho.refresh().then(function () { UI.toast('Đã tải lại kho chung'); }, function () {});
  }

  async function exportKho() {
    if (!Api.configured()) { UI.alert('Chưa cấu hình máy chủ kho chung', UI.guideHtml()); return; }
    try { await Kho.refresh(); } catch (err) { UI.alert('Không đọc được kho chung', esc(err.message)); return; }
    var kho = Kho.state.kho;
    if (!kho.length) { UI.toast('Kho chung đang trống'); return; }
    // Sao lưu đủ trạng thái + nhãn. Mã Chờ đối soát xếp trước, tồn lâu nhất lên đầu.
    var infos = kho.map(function (r) { return TrangThai.lookup([r], r[0]); });
    infos.sort(function (a, b) {
      if (a.trangThai !== b.trangThai) return a.trangThai === TrangThai.CHO ? -1 : 1;
      var da = Common.daysSince(a.ngayDoiSoat), db = Common.daysSince(b.ngayDoiSoat);
      return (db === null ? -1 : db) - (da === null ? -1 : da);
    });
    var data = infos.map(function (x, i) {
      var d = Common.daysSince(x.ngayDoiSoat);
      return { 'STT': i + 1, 'Mã vận đơn': x.maGoc || x.ma, 'Trạng thái': x.nhan, 'Ngày đối soát': x.ngayDoiSoat,
               'Số ngày tồn': x.trangThai === TrangThai.CHO && d !== null ? d : '', 'Sàn': x.sanLabel, 'Gian hàng': x.gianHang,
               'Loại file': x.loaiFile, 'Ngày khớp': x.ngayKhop };
    });
    var ws = XLSX.utils.json_to_sheet(data);
    Common.forceTextCol(ws, 1);
    ws['!cols'] = [{ wch: 6 }, { wch: 26 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 22 }, { wch: 12 }, { wch: 14 }];
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Kho_chung');
    var t = new Date();
    UI.downloadWb(wb, 'Kho_chung_' + t.getFullYear() + '-' + Common.pad(t.getMonth() + 1) + '-' + Common.pad(t.getDate()) + '.xlsx');
  }

  async function undo() {
    if (!Api.configured()) { UI.alert('Chưa cấu hình máy chủ kho chung', UI.guideHtml()); return; }
    try { await Kho.refresh(); } catch (err) { UI.alert('Không đọc được kho chung', esc(err.message)); return; }
    var info = Kho.state.info;
    if (!info.coBanTruoc || !info.ghiCuoi) { UI.alert('Không có gì để hoàn tác', 'Kho chung chưa có lần ghi nào trước đó.'); return; }
    var g = info.ghiCuoi;
    var ok = await UI.confirm('Hoàn tác lần ghi gần nhất',
      'Lần ghi gần nhất: <b>' + esc(g.hanhDong) + '</b> bởi <b>' + esc(g.nguoi) + '</b> lúc ' + esc(UI.fmtIso(g.thoiGian)) + '.<br>' +
      'Kho chung (đang có ' + fmtNum(info.soMa) + ' mã) sẽ quay về trạng thái ngay trước lần ghi đó. Bấm Hoàn tác lần nữa để làm lại.',
      'Hoàn tác', true);
    if (!ok) return;
    var nguoi = UI.ensureName();
    if (!nguoi) return;
    try {
      var res = await Api.undo(nguoi, info.phienBan);
      Kho.apply(res);
      UI.toast('Đã hoàn tác · kho còn ' + fmtNum(res.info.soMa) + ' mã', null, 'ok');
    } catch (err) { UI.alert('Chưa hoàn tác được', esc(err.message)); }
  }

  function renderKhoCard() {
    var st = Kho.state;
    var ok = Kho.status === 'ok' && st;
    $('kho_btnUndo').disabled = !(ok && st.info.coBanTruoc);
    var tb = $('kho_history');
    if (!ok) {
      tb.innerHTML = '<tr class="empty-row"><td colspan="4">' + (Kho.status === 'loading' ? 'Đang tải…' : 'Chưa đọc được lịch sử kho chung.') + '</td></tr>';
    } else if (!st.lichSu.length) {
      tb.innerHTML = '<tr class="empty-row"><td colspan="4">Chưa có thao tác nào.</td></tr>';
    } else {
      tb.innerHTML = st.lichSu.map(function (h) {
        return '<tr><td>' + esc(UI.fmtIso(h.thoiGian)) + '</td><td>' + esc(h.nguoi) + '</td><td><b>' + esc(h.hanhDong) + '</b></td><td>' + esc(h.chiTiet) + '</td></tr>';
      }).join('');
    }
    render();
  }

  function init() {
    $('kho_name').value = UI.getName();
    $('kho_name').addEventListener('change', function () { UI.setName($('kho_name').value); });
    var draft = UI.memGet(DRAFT_KEY);
    if (draft) $('kho_input').value = draft;
    $('kho_input').addEventListener('input', function () { UI.memSet(DRAFT_KEY, $('kho_input').value); });
    UI.setupDropZone($('kho_zone'), $('kho_inp'), addFiles);
    $('kho_search').addEventListener('input', function (e) { search = e.target.value.trim(); page = 1; render(); });
    $('kho_tbody').addEventListener('click', function (e) {
      var btn = e.target.closest('.del-btn');
      if (!btn) return;
      var code = btn.getAttribute('data-code');
      rows = rows.filter(function (r) { return r.code !== code; });
      render();
    });
    Kho.onChange(renderKhoCard);
    renderKhoCard();
  }

  return { init: init, process: process, clearAll: clearAll, save: save, refresh: refresh,
           exportKho: exportKho, undo: undo, removeFile: removeFile };
})();
