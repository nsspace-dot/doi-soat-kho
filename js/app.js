/* =====================================================================
   App — 3 tab, theme Sáng/Tối dùng chung, 4 thẻ số liệu kho chung
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

  /* ---------- giao diện Sáng/Tối ---------- */
  function toggleTheme() {
    var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    UI.memSet('theme', next);
    paintThemeIcon(next);
    SP.applyChartTheme(); TT.applyChartTheme();
  }
  function paintThemeIcon(mode) {
    var icon = $('theme-icon');
    if (!icon) return;
    icon.innerHTML = mode === 'dark'
      ? '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>'
      : '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
  }

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
      $('st_lastWho').textContent = '—'; $('st_lastWhen').textContent = ' ';
      $('st_week').innerHTML = '<span class="stat-sub">—</span>';
      if (!Api.configured()) msg.innerHTML = '<div class="guide-box">' + UI.guideHtml() + '</div>';
      else if (Kho.status === 'error') msg.innerHTML = '<div class="err-box"><span><b>Không đọc được kho chung:</b> ' + esc(Kho.error && Kho.error.message) + '</span>' +
        '<button class="btn-export" onclick="App.refreshStatus()">Thử lại</button></div>';
      else msg.innerHTML = '';
      return;
    }
    msg.innerHTML = '';
    var st = Kho.state, info = st.info, last = info.lanTaiCuoi;
    var old = st.kho.filter(function (r) { var d = Common.daysSince(r[2]); return d !== null && d >= 7; }).length;
    setStat('count', fmtNum(info.soMa), 'mã chờ đối soát');
    setStat('old', fmtNum(old), old ? 'cần truy gấp' : 'không có mã tồn lâu');
    $('st_oldCard').classList.toggle('is-warn', old > 0);
    if (last) {
      $('st_lastWho').textContent = last.nguoi;
      $('st_lastWhen').textContent = UI.fmtIso(last.thoiGian) + ' · ' + fmtNum(last.soMa) + ' mã';
      $('st_week').innerHTML = weekChip(Date.now() - new Date(last.thoiGian).getTime() <= WEEK_MS);
    } else {
      $('st_lastWho').textContent = 'Chưa ai tải';
      $('st_lastWhen').textContent = ' ';
      $('st_week').innerHTML = weekChip(false);
    }
  }

  function refreshStatus() {
    if (!Api.configured()) { UI.alert('Chưa cấu hình máy chủ kho chung', UI.guideHtml()); return; }
    Kho.refresh().catch(function () {});
  }

  function init() {
    var savedTheme = UI.memGet('theme') || 'light';
    if (savedTheme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    paintThemeIcon(savedTheme);
    switchTab(UI.memGet('platform') || 'kho');
    Kho.onChange(renderStatus);
    renderStatus();
    KhoTab.init(); SP.init(); TT.init();
    if (Api.configured()) Kho.refresh().catch(function () {});
  }

  return { init: init, switchTab: switchTab, currentTab: currentTab, toggleTheme: toggleTheme, refreshStatus: refreshStatus };
})();

document.addEventListener('DOMContentLoaded', App.init);
