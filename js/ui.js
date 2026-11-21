/* =====================================================================
   UI — các mảnh giao diện dùng chung cho cả 3 tab.
   ===================================================================== */
var UI = (function () {
  var esc = Common.escapeHtml;

  /* ---------- thông báo nổi ---------- */
  var toastTimer = null;
  // kind 'ok': câu báo thành công, trang trí theo chủ đề (con vật chỉ ở "Mèo con").
  function toast(msg, ms, kind) {
    var el = document.getElementById('toast');
    if (!el) return;
    if (kind === 'ok' && typeof Theme !== 'undefined') {
      msg = Theme.successText(msg, document.documentElement.getAttribute('data-tab'));
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, ms || 5000);
  }

  /* ---------- hộp thoại nhiều lựa chọn ----------
     buttons: [{ label, value, kind: 'primary'|'danger'|'secondary', focus }]
     Trả về Promise<value|null>. Esc hoặc bấm ra ngoài = null.               */
  function choose(title, html, buttons) {
    return new Promise(function (resolve) {
      var back = document.createElement('div');
      back.className = 'modal-back';
      back.innerHTML = '<div class="modal" role="dialog" aria-modal="true"><h3>' + esc(title) + '</h3>' +
        '<div class="modal-body">' + html + '</div><div class="modal-actions"></div></div>';
      var actions = back.querySelector('.modal-actions');
      var focusBtn = null;
      buttons.forEach(function (b) {
        var btn = document.createElement('button');
        btn.className = b.kind === 'primary' ? 'btn-main' : (b.kind === 'danger' ? 'btn-danger' : 'btn-outline');
        btn.textContent = b.label;
        btn.onclick = function () { close(b.value); };
        actions.appendChild(btn);
        if (b.focus) focusBtn = btn;
      });
      function onKey(e) { if (e.key === 'Escape') close(null); }
      function close(v) {
        document.removeEventListener('keydown', onKey);
        var inp = back.querySelector('.modal-input');
        lastInput = inp ? inp.value : null;
        back.remove();
        resolve(v);
      }
      back.addEventListener('click', function (e) { if (e.target === back) close(null); });
      document.addEventListener('keydown', onKey);
      document.body.appendChild(back);
      var inp0 = back.querySelector('.modal-input');
      if (inp0) {
        inp0.addEventListener('keydown', function (e) { if (e.key === 'Enter' && focusBtn) { e.preventDefault(); focusBtn.click(); } });
        inp0.focus(); inp0.select();
      } else (focusBtn || actions.querySelector('button')).focus();
    });
  }
  // Hộp hỏi một dòng chữ (điền sẵn `value`, sửa được). Trả về Promise<string|null>; Huỷ / Esc = null.
  var lastInput = null;
  function promptBox(title, html, value, okLabel) {
    return choose(title, html + '<input type="text" class="text-input modal-input" maxlength="60" value="' + esc(value || '') + '">', [
      { label: 'Huỷ', value: false, kind: 'secondary' },
      { label: okLabel || 'Đồng ý', value: true, kind: 'primary', focus: true }
    ]).then(function (v) { return v === true ? String(lastInput || '').trim() : null; });
  }
  // Chép chữ vào bộ nhớ tạm; trình duyệt cũ / không có quyền thì dùng cách chọn-và-copy.
  function copyText(text) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(ta); ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) {}
      ta.remove();
      return ok;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return fallback(); });
    }
    return Promise.resolve(fallback());
  }
  function confirmBox(title, html, okLabel, danger) {
    return choose(title, html, [
      { label: 'Huỷ', value: false, kind: 'secondary' },
      { label: okLabel || 'Đồng ý', value: true, kind: danger ? 'danger' : 'primary', focus: true }
    ]).then(function (v) { return v === true; });
  }
  function alertBox(title, html) {
    return choose(title, html, [{ label: 'Đã hiểu', value: true, kind: 'primary', focus: true }]);
  }

  /* ---------- phân trang (giữ nguyên cách làm của bản gốc) ---------- */
  function renderPager(container, currentPage, totalPages, onPageChange) {
    if (totalPages <= 1) { container.innerHTML = ''; return; }
    var id = container.id;
    window['pager_' + id] = onPageChange;
    var go = "window['pager_" + id + "']";
    var html = '<button class="page-btn" ' + (currentPage === 1 ? 'disabled' : '') + ' onclick="' + go + '(1)">«</button>';
    html += '<button class="page-btn" ' + (currentPage === 1 ? 'disabled' : '') + ' onclick="' + go + '(' + (currentPage - 1) + ')">‹</button>';
    var s = Math.max(1, currentPage - 2), e = Math.min(totalPages, currentPage + 2);
    for (var i = s; i <= e; i++) html += '<button class="page-btn ' + (i === currentPage ? 'active' : '') + '" onclick="' + go + '(' + i + ')">' + i + '</button>';
    html += '<button class="page-btn" ' + (currentPage === totalPages ? 'disabled' : '') + ' onclick="' + go + '(' + (currentPage + 1) + ')">›</button>';
    html += '<button class="page-btn" ' + (currentPage === totalPages ? 'disabled' : '') + ' onclick="' + go + '(' + totalPages + ')">»</button>';
    container.innerHTML = html;
  }

  /* ---------- kéo thả file ---------- */
  function setupDropZone(zone, input, onFiles) {
    zone.addEventListener('click', function () { input.click(); });
    zone.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    zone.addEventListener('dragover', function (e) { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', function () { zone.classList.remove('dragover'); });
    zone.addEventListener('drop', function (e) { e.preventDefault(); zone.classList.remove('dragover'); onFiles(e.dataTransfer.files); });
    input.onchange = function (e) { onFiles(e.target.files); input.value = ''; };
  }

  /* ---------- localStorage: chỉ cho tiện ích cá nhân, bọc try/catch ---------- */
  function memSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function memGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function memDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

  /* ---------- 2 ô nhãn cho mỗi file sàn: Gian hàng + Loại file ---------- */
  function fileItemHtml(f, key, onDel) {
    var opts = TrangThai.LOAI_FILE.map(function (l) {
      return '<option' + (l === f.loai ? ' selected' : '') + '>' + esc(l) + '</option>';
    }).join('');
    return '<div class="file-item">' +
      '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' +
      '<span class="file-item-name" title="' + esc(f.name) + '">' + esc(f.name) + '</span>' +
      '<span class="file-item-type">' + Common.fmtSize(f.size) + '</span>' +
      '<button class="file-item-del" onclick="' + onDel + '" aria-label="Bỏ file ' + esc(f.name) + '">' +
        '<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>' +
      '<div class="file-fields">' +
        '<label class="file-field"><span>Gian hàng</span><input type="text" class="file-gian" data-key="' + key + '" maxlength="60" value="' + esc(f.customShopName || '') + '"></label>' +
        '<label class="file-field"><span>Loại file</span><select class="file-loai" data-key="' + key + '">' + opts + '</select></label>' +
      '</div></div>';
  }
  // Ghi giá trị người dùng sửa vào đối tượng file (không vẽ lại để không mất con trỏ khi gõ).
  function bindFileFields(listEl, getFile) {
    listEl.addEventListener('input', function (e) {
      if (e.target.classList.contains('file-gian')) getFile(e.target.getAttribute('data-key')).customShopName = e.target.value;
    });
    listEl.addEventListener('change', function (e) {
      if (e.target.classList.contains('file-loai')) getFile(e.target.getAttribute('data-key')).loai = e.target.value;
      if (e.target.classList.contains('file-gian')) {
        var f = getFile(e.target.getAttribute('data-key'));
        f.customShopName = e.target.value.trim();
      }
    });
  }

  /* ---------- 3 ô KHO · ĐVVC · Lý do của bảng "Sàn báo, kho chưa nhận" ---------- */
  function doanTag(nguon) { return nguon === NhanDien.DOAN ? ' <span class="type-tag nd-doan">đoán</span>' : ''; }
  function ndCells(r) {
    var ly = r.lyDo || '';
    return '<td>' + esc(r.kho || NhanDien.CHUA_RO) + doanTag(r.khoNguon) + '</td>' +
      '<td>' + esc(r.dvvcTen || NhanDien.CHUA_RO) + doanTag(r.dvvcNguon) + '</td>' +
      '<td class="nd-lydo" title="' + esc(ly) + '">' + esc(ly || '—') + '</td>';
  }

  function fmtIso(iso) {
    var d = new Date(iso);
    return isNaN(d.getTime()) ? String(iso || '') : Common.fmtDT(d);
  }

  function downloadWb(wb, name) { XLSX.writeFile(wb, name); }

  function guideHtml() {
    return 'Chưa cấu hình máy chủ kho chung nên chưa đọc/ghi được kho. Người quản trị làm một lần:' +
      '<ol><li>Tạo Google Sheet mới, mở <b>Tiện ích mở rộng › Apps Script</b>, dán nội dung <code>apps-script/Code.gs</code>.</li>' +
      '<li><b>Triển khai › Tùy chọn triển khai mới › Ứng dụng web</b>: Execute as <b>Me</b>, Who has access <b>Anyone</b>.</li>' +
      '<li>Dán link kết thúc bằng <code>/exec</code> vào <code>js/config.js</code> (biến <code>API_URL</code>), commit lên GitHub.</li></ol>' +
      'Chi tiết từng bước: xem <b>HUONG-DAN.md</b> trong repo.';
  }

  return {
    toast: toast, choose: choose, confirm: confirmBox, alert: alertBox, prompt: promptBox, copyText: copyText, renderPager: renderPager,
    setupDropZone: setupDropZone, memSet: memSet, memGet: memGet, memDel: memDel,
    fmtIso: fmtIso, fileItemHtml: fileItemHtml, bindFileFields: bindFileFields,
    downloadWb: downloadWb, guideHtml: guideHtml, esc: esc, ndCells: ndCells
  };
})();
