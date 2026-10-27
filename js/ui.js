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
        back.remove();
        resolve(v);
      }
      back.addEventListener('click', function (e) { if (e.target === back) close(null); });
      document.addEventListener('keydown', onKey);
      document.body.appendChild(back);
      (focusBtn || actions.querySelector('button')).focus();
    });
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

  /* ---------- tên người thực hiện (nhớ lần trước) ---------- */
  var NAME_KEY = 'doiSoat_tenNguoiTai';
  function getName() { return (memGet(NAME_KEY) || '').trim(); }
  function setName(v) { memSet(NAME_KEY, String(v || '').trim()); }
  function ensureName() {
    var n = getName();
    if (n) return n;
    var v = window.prompt('Nhập tên của bạn (ghi vào lịch sử kho chung):', '');
    if (v === null || !v.trim()) return null;
    setName(v.trim());
    var inp = document.getElementById('kho_name');
    if (inp) inp.value = v.trim();
    return v.trim();
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
    toast: toast, choose: choose, confirm: confirmBox, alert: alertBox, renderPager: renderPager,
    setupDropZone: setupDropZone, memSet: memSet, memGet: memGet, memDel: memDel,
    getName: getName, setName: setName, ensureName: ensureName, fmtIso: fmtIso,
    downloadWb: downloadWb, guideHtml: guideHtml, esc: esc
  };
})();
