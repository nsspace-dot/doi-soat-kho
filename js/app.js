/* =====================================================================
   App — 3 tab, theme Sáng/Tối dùng chung, dòng trạng thái kho chung
   luôn hiện ở đầu trang.
   ===================================================================== */
var App = (function () {
  var esc = Common.escapeHtml, fmtNum = Common.fmtNum;
  var WEEK_MS = 7 * 86400000;
  var TITLES = { kho: 'Kho / Đối soát — kho mã chung', sp: 'Đối soát đơn hàng trả — Shopee', tt: 'Đối soát đơn hàng trả — TikTok Shop' };

  /* ---------- chuyển tab. Mỗi tab giữ dữ liệu riêng, đổi tab không mất file ---------- */
  function switchTab(p) {
    if (!TITLES[p]) p = 'kho';
    document.documentElement.setAttribute('data-platform', p);
    ['kho', 'sp', 'tt'].forEach(function (k) {
      document.getElementById('pane_' + k).classList.toggle('active', k === p);
      var b = document.getElementById('platBtn_' + k);
      b.classList.toggle('active', k === p);
      b.setAttribute('aria-selected', k === p ? 'true' : 'false');
    });
    document.getElementById('platTitle').textContent = TITLES[p];
    UI.memSet('platform', p);
  }

  /* ---------- giao diện Sáng/Tối ---------- */
  function toggleTheme() {
    var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    UI.memSet('theme', next);
    paintThemeIcon(next);
    SP.applyChartTheme(); TT.applyChartTheme();
  }
  function paintThemeIcon(mode) {
    var icon = document.getElementById('theme-icon');
    if (!icon) return;
    icon.innerHTML = mode === 'dark'
      ? '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>'
      : '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
  }

  /* ---------- dòng trạng thái kho chung ---------- */
  function renderStatus() {
    var el = document.getElementById('khoStatus');
    var refreshBtn = '<button class="btn-export btn-small" onclick="App.refreshStatus()" title="Đọc lại kho chung từ máy chủ">⟳ Làm mới</button>';
    if (!Api.configured()) {
      el.innerHTML = '<div class="guide-box">' + UI.guideHtml() + '</div>';
      return;
    }
    if (Kho.status === 'loading' || Kho.status === 'idle') {
      el.innerHTML = '<span class="kho-status-text">Đang tải thông tin kho chung…</span>';
      return;
    }
    if (Kho.status === 'error') {
      el.innerHTML = '<span class="kho-status-text"><span class="err">⚠ Không đọc được kho chung:</span> ' + esc(Kho.error && Kho.error.message) + '</span>' + refreshBtn;
      return;
    }
    var info = Kho.state.info, last = info.lanTaiCuoi, html, chip;
    if (last) {
      var t = new Date(last.thoiGian);
      html = 'Tải lần cuối: <b>' + esc(UI.fmtIso(last.thoiGian)) + '</b> bởi <b>' + esc(last.nguoi) + '</b> · <b>' + fmtNum(info.soMa) + '</b> mã trong kho';
      chip = (Date.now() - t.getTime() <= WEEK_MS)
        ? '<span class="chip chip-ok">✓ Tuần này đã có người tải kho</span>'
        : '<span class="chip chip-warn">⚠ Chưa tải kho tuần này</span>';
    } else {
      html = 'Chưa ai tải kho lần nào · <b>' + fmtNum(info.soMa) + '</b> mã trong kho';
      chip = '<span class="chip chip-warn">⚠ Chưa tải kho tuần này</span>';
    }
    el.innerHTML = '<span class="kho-status-text">📦 ' + html + '</span>' + chip + refreshBtn;
  }

  function refreshStatus() { Kho.refresh().catch(function () {}); }

  function init() {
    var savedTheme = UI.memGet('theme') || 'light';
    if (savedTheme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    paintThemeIcon(savedTheme);
    switchTab(UI.memGet('platform') || 'kho');
    Kho.onChange(renderStatus);
    renderStatus();
    KhoTab.init(); SP.init(); TT.init();
    if (Api.configured()) refreshStatus();
  }

  return { init: init, switchTab: switchTab, toggleTheme: toggleTheme, refreshStatus: refreshStatus };
})();

document.addEventListener('DOMContentLoaded', App.init);
