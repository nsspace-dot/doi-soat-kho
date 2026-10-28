/* =====================================================================
   App — 3 tab, hộp chọn chủ đề (js/theme.js), 4 thẻ số liệu kho chung
   luôn hiện ở đầu trang.
   ===================================================================== */
var App = (function () {
  var esc = Common.escapeHtml, fmtNum = Common.fmtNum;
  var WEEK_MS = 7 * 86400000;
  var TITLES = { kho: 'Kho / Đối soát — kho mã chung', sp: 'Đối soát đơn hàng trả — Shopee', tt: 'Đối soát đơn hàng trả — TikTok Shop' };

  function $(id) { return document.getElementById(id); }

  /* ---------- chuyển tab. Mỗi tab giữ dữ liệu riêng, đổi tab không mất file ---------- */
  function switchTab(p) {
    if (!TITLES[p]) p = 'kho';
    document.documentElement.setAttribute('data-tab', p);
    ['kho', 'sp', 'tt'].forEach(function (k) {
      $('pane_' + k).classList.toggle('active', k === p);
      var b = $('platBtn_' + k);
      b.classList.toggle('active', k === p);
      b.setAttribute('aria-selected', k === p ? 'true' : 'false');
    });
    $('platTitle').textContent = TITLES[p];
    UI.memSet('platform', p);
  }
  function currentTab() { return document.documentElement.getAttribute('data-tab') || 'kho'; }

  /* ---------- 4 thẻ số liệu kho chung ---------- */
  function setStat(id, value, sub) {
    $('st_' + id).textContent = value;
    if (sub !== undefined) $('st_' + id + 'Sub').textContent = sub || ' ';
  }
  function weekChip(ok) {
    return ok ? '<span class="chip chip-ok"><span class="emo" aria-hidden="true">✓</span> Đã có người tải kho</span>'
              : '<span class="chip chip-warn"><span class="emo" aria-hidden="true">⚠</span> Chưa tải kho tuần này</span>';
  }

  function renderStatus() {
    var msg = $('khoStatusMsg');
    $('st_oldCard').classList.remove('is-warn');
    if (!Api.configured() || Kho.status !== 'ok') {
      var text = Kho.status === 'loading' || Kho.status === 'idle' ? 'Đang tải…' : '—';
      setStat('count', text, ''); setStat('old', '—', '');
      $('st_lastTime').textContent = '—'; $('st_lastSub').textContent = '\u00a0';
      $('st_week').innerHTML = '<span class="stat-sub">—</span>';
      if (!Api.configured()) msg.innerHTML = '<div class="guide-box">' + UI.guideHtml() + '</div>';
      else if (Kho.status === 'error') msg.innerHTML = '<div class="err-box"><span><b>Không đọc được kho chung:</b> ' + esc(Kho.error && Kho.error.message) + '</span>' +
        '<button class="btn-export" onclick="App.refreshStatus()">Thử lại</button></div>';
      else msg.innerHTML = '';
      return;
    }
    msg.innerHTML = '';
    var st = Kho.state, info = st.info, last = info.lanTaiCuoi;
    // Tuổi tồn chỉ tính mã còn Chờ đối soát; mã Đã khớp không còn "tồn".
    var old = st.kho.filter(function (r) { var d = Common.daysSince(r[2]); return !TrangThai.isKhop(r) && d !== null && d >= 7; }).length;
    setStat('count', fmtNum(info.soCho), 'chờ đối soát · ' + fmtNum(info.soKhop) + ' mã đã khớp');
    setStat('old', fmtNum(old), old ? 'cần truy gấp' : 'không có mã tồn lâu');
    $('st_oldCard').classList.toggle('is-warn', old > 0);
    // "Tải lần cuối: dd/mm/yyyy hh:mm · N mã trong kho" — không có tên người.
    $('st_lastTime').textContent = last ? UI.fmtIso(last.thoiGian) : 'Chưa có';
    $('st_lastSub').textContent = fmtNum(info.soMa) + ' mã trong kho';
    $('st_week').innerHTML = weekChip(!!last && Date.now() - new Date(last.thoiGian).getTime() <= WEEK_MS);
  }

  function refreshStatus() {
    if (!Api.configured()) { UI.alert('Chưa cấu hình máy chủ kho chung', UI.guideHtml()); return; }
    Kho.refresh().catch(function () {});
  }

  function init() {
    // Chủ đề đã được js/theme.js áp từ trong <head>; ở đây chỉ gắn hộp chọn.
    Theme.initPicker($('themeBtn'));
    Theme.onChange(function () { SP.applyChartTheme(); TT.applyChartTheme(); });
    switchTab(UI.memGet('platform') || 'kho');
    Kho.onChange(renderStatus);
    renderStatus();
    KhoTab.init(); SP.init(); TT.init();
    if (Api.configured()) Kho.refresh().catch(function () {});
  }

  return { init: init, switchTab: switchTab, currentTab: currentTab, refreshStatus: refreshStatus };
})();

document.addEventListener('DOMContentLoaded', App.init);
