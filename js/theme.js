/* =====================================================================
   Theme — chọn chủ đề (Mèo con / Vintage / Tối giản) × (Sáng / Tối).
   File này nạp trong <head>, TRƯỚC css, và áp data-theme ngay lập tức để
   không nháy màu. Lựa chọn lưu ở localStorage khoá 'doiSoat_chuDe_v1'
   dạng {"chuDe":"meo","cheDo":"sang"}; giá trị sai -> Mèo con, Sáng.
   ===================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Theme = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var KEY = 'doiSoat_chuDe_v1';
  var OLD_KEY = 'theme';   // công tắc sáng/tối của bản trước
  var DEFAULT = { chuDe: 'meo', cheDo: 'sang' };
  var THEMES = {
    meo: { ten: 'Mèo con', moTa: 'Hoạt hình, bo tròn, có con vật nhỏ',
      mau: { sang: ['#FFF6EE', '#5B9BEA', '#FF7A45', '#FF4F8B'], toi: ['#2B211F', '#7DB2F5', '#FF9468', '#FF6FA0'] } },
    vintage: { ten: 'Vintage', moTa: 'Giấy kem, viền tem thư, chữ có chân',
      mau: { sang: ['#F3EAD7', '#4F6D8F', '#A9521F', '#A84868'], toi: ['#241C14', '#8FB0D6', '#E39361', '#E28FAE'] } },
    toigian: { ten: 'Tối giản', moTa: 'Trắng, viền mảnh, không trang trí',
      mau: { sang: ['#FFFFFF', '#2563EB', '#C2410C', '#BE185D'], toi: ['#0F172A', '#60A5FA', '#FB923C', '#F472B6'] } }
  };
  var ANIMAL = { kho: '🐻', sp: '🐱', tt: '🐰' };

  // Kiểm tra giá trị đọc từ localStorage; sai bất kỳ chỗ nào -> mặc định.
  function parse(raw) {
    var o = null;
    try { o = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { o = null; }
    if (!o || typeof o !== 'object' || !Object.prototype.hasOwnProperty.call(THEMES, o.chuDe) ||
        (o.cheDo !== 'sang' && o.cheDo !== 'toi')) return { chuDe: DEFAULT.chuDe, cheDo: DEFAULT.cheDo };
    return { chuDe: o.chuDe, cheDo: o.cheDo };
  }
  function attr(t) { return t.chuDe + '-' + (t.cheDo === 'toi' ? 'dark' : 'light'); }

  function load(storage) {
    var raw = null, old = null;
    try { raw = storage.getItem(KEY); old = storage.getItem(OLD_KEY); } catch (e) { return parse(null); }
    if (raw === null && old === 'dark') return { chuDe: DEFAULT.chuDe, cheDo: 'toi' };
    return parse(raw);
  }
  function save(t, storage) {
    try { storage.setItem(KEY, JSON.stringify(parse(t))); return true; } catch (e) { return false; }
  }

  var current = parse(null);
  var listeners = [];
  function apply(t, docEl) {
    current = parse(t);
    docEl.setAttribute('data-theme', attr(current));
    return current;
  }
  function get() { return { chuDe: current.chuDe, cheDo: current.cheDo }; }
  function set(t) {
    apply(t, document.documentElement);
    try { save(current, localStorage); } catch (e) { /* localStorage bị chặn: vẫn áp dụng cho phiên này */ }
    listeners.forEach(function (fn) { try { fn(get()); } catch (e) { console.error(e); } });
    syncPicker();
  }
  function onChange(fn) { listeners.push(fn); }

  function isCute() { return current.chuDe === 'meo'; }
  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  function chartColor() { return cssVar('--chart-text') || '#475569'; }

  // Câu thông báo thành công: con vật chỉ ở "Mèo con", dấu ✓ ở Vintage, chữ trơn ở Tối giản.
  function successText(msg, tab) {
    if (current.chuDe === 'meo') return 'Xong rồi nè ' + (ANIMAL[tab] || ANIMAL.kho) + ' ' + msg;
    if (current.chuDe === 'vintage') return '✓ ' + msg;
    return msg;
  }

  /* ---------------- Hộp chọn chủ đề ---------------- */
  var panel = null, btn = null;
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function buildPanel() {
    panel = document.createElement('div');
    panel.className = 'theme-panel';
    panel.id = 'themePanel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Chọn chủ đề');
    panel.hidden = true;
    var html = '<div class="theme-panel-h">Chủ đề giao diện</div><div class="theme-list" role="radiogroup" aria-label="Chủ đề">';
    Object.keys(THEMES).forEach(function (k) {
      html += '<button type="button" class="theme-opt" role="radio" data-chu-de="' + k + '">' +
        '<span class="swatches" data-chu-de="' + k + '"></span>' +
        '<span class="theme-opt-text"><span class="theme-opt-name">' + esc(THEMES[k].ten) + '</span>' +
        '<span class="theme-opt-desc">' + esc(THEMES[k].moTa) + '</span></span></button>';
    });
    html += '</div><label class="mode-switch"><span>Chế độ tối</span>' +
      '<input type="checkbox" role="switch" id="themeDark"><span class="switch-track" aria-hidden="true"><span class="switch-knob"></span></span></label>';
    panel.innerHTML = html;
    panel.querySelectorAll('.theme-opt').forEach(function (b) {
      b.addEventListener('click', function () { set({ chuDe: b.getAttribute('data-chu-de'), cheDo: current.cheDo }); });
    });
    panel.querySelector('#themeDark').addEventListener('change', function (e) {
      set({ chuDe: current.chuDe, cheDo: e.target.checked ? 'toi' : 'sang' });
    });
    document.body.appendChild(panel);
  }

  function syncPicker() {
    if (!panel) return;
    panel.querySelectorAll('.theme-opt').forEach(function (b) {
      var k = b.getAttribute('data-chu-de'), on = k === current.chuDe;
      b.classList.toggle('active', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      // Ô màu xem trước theo chế độ sáng/tối đang chọn.
      b.querySelector('.swatches').innerHTML = THEMES[k].mau[current.cheDo].map(function (c) {
        return '<span class="sw" style="background:' + c + '"></span>';
      }).join('');
    });
    panel.querySelector('#themeDark').checked = current.cheDo === 'toi';
  }

  function open() {
    if (!panel) buildPanel();
    syncPicker();
    var r = btn.getBoundingClientRect();
    panel.style.top = Math.round(r.bottom + 8) + 'px';
    panel.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    var a = panel.querySelector('.theme-opt.active');
    if (a) a.focus();
  }
  function close() {
    if (!panel || panel.hidden) return;
    panel.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
  }
  function toggle() { if (panel && !panel.hidden) close(); else open(); }

  function initPicker(button) {
    btn = button;
    btn.addEventListener('click', function (e) { e.stopPropagation(); toggle(); });
    document.addEventListener('click', function (e) { if (panel && !panel.hidden && !panel.contains(e.target)) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && panel && !panel.hidden) { close(); btn.focus(); } });
  }

  // Áp chủ đề NGAY khi file được nạp (trong <head>), trước khi vẽ giao diện.
  if (typeof document !== 'undefined' && document.documentElement) {
    try { apply(load(localStorage), document.documentElement); }
    catch (e) { apply(null, document.documentElement); }
  }

  return { KEY: KEY, THEMES: THEMES, DEFAULT: DEFAULT, ANIMAL: ANIMAL, parse: parse, attr: attr, load: load, save: save,
           apply: apply, get: get, set: set, onChange: onChange, isCute: isCute, cssVar: cssVar, chartColor: chartColor,
           successText: successText, initPicker: initPicker, open: open, close: close };
});
