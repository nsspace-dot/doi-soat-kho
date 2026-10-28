'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const THEMES_CSS = fs.readFileSync(path.join(ROOT, 'css', 'themes.css'), 'utf8');
const APP_CSS = fs.readFileSync(path.join(ROOT, 'css', 'app.css'), 'utf8');
const VARIANTS = ['meo-light', 'meo-dark', 'vintage-light', 'vintage-dark', 'toigian-light', 'toigian-dark'];

// Đọc bộ biến của từng data-theme trong css/themes.css.
function themeVars(name) {
  const re = new RegExp('\\[data-theme="' + name + '"\\]\\s*\\{([^}]*)\\}');
  const m = THEMES_CSS.match(re);
  assert.ok(m, 'thiếu khối [data-theme="' + name + '"]');
  const vars = {};
  for (const d of m[1].matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) vars[d[1]] = d[2].trim();
  return vars;
}

function lum(hex) {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.substr(i, 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)))
    .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
}
function contrast(a, b) {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

// Mọi cặp chữ / nền mà css/app.css dùng.
const SURFACES = ['bg', 'surface', 'surface-2'];
const PAIRS = [];
for (const fg of ['text', 'text-2', 'text-muted']) for (const bg of SURFACES.concat('input-bg')) PAIRS.push([fg, bg]);
for (const s of ['kho', 'sp', 'tt', 'ds']) {
  PAIRS.push(['on-' + s, s]);                       // nút chính, tab đang chọn, ô số bước, trang đang xem
  for (const bg of SURFACES) PAIRS.push(['ink-' + s, bg]);  // chữ màu sàn trên thẻ
}
PAIRS.push(['topbar-text', 'topbar-bg'], ['on-ok', 'ok'], ['on-err', 'err'],
  ['toast-text', 'toast-bg'], ['chart-text', 'surface'], ['text', 'warn-bg'], ['text-muted', 'surface-2']);
for (const k of ['ok', 'warn', 'err', 'info']) {
  PAIRS.push([k + '-ink', k + '-bg']);               // nhãn, hộp thông báo, thẻ cảnh báo
  PAIRS.push([k + '-ink', 'surface']);               // số liệu màu, nút xoá, chữ trong bảng
}
PAIRS.push(['warn-ink', 'surface']);                 // mã trong khung hướng dẫn

for (const v of VARIANTS) {
  test('Tương phản ≥ 4.5:1 cho mọi cặp chữ/nền — ' + v, () => {
    const vars = themeVars(v);
    const fails = [];
    for (const [fg, bg] of PAIRS) {
      assert.match(vars[fg] || '', /^#[0-9A-Fa-f]{6}$/, v + ': --' + fg + ' phải là mã hex');
      assert.match(vars[bg] || '', /^#[0-9A-Fa-f]{6}$/, v + ': --' + bg + ' phải là mã hex');
      const c = contrast(vars[fg], vars[bg]);
      if (c < 4.5) fails.push('--' + fg + ' trên --' + bg + ' = ' + c.toFixed(2));
    }
    assert.deepEqual(fails, []);
  });
}

test('Sáu biến thể có đủ cùng một bộ biến', () => {
  const keys = Object.keys(themeVars('meo-light')).sort();
  for (const v of VARIANTS) assert.deepEqual(Object.keys(themeVars(v)).sort(), keys, v);
});

test('Màu nhận diện sàn giữ đúng tông ở mọi theme (Kho xanh dương, Shopee cam, TikTok hồng)', () => {
  const hue = (hex) => {
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(1).substr(i, 2), 16) / 255);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (h * 60 + 360) % 360;
  };
  for (const v of VARIANTS) {
    const t = themeVars(v);
    assert.ok(hue(t.kho) >= 195 && hue(t.kho) <= 230, v + ' kho ' + hue(t.kho));
    assert.ok(hue(t.sp) >= 12 && hue(t.sp) <= 32, v + ' sp ' + hue(t.sp));
    assert.ok(hue(t.tt) >= 320 && hue(t.tt) <= 350, v + ' tt ' + hue(t.tt));
    assert.ok(hue(t.ds) >= 250 && hue(t.ds) <= 290, v + ' ds (tím) ' + hue(t.ds));
  }
});

test('Mèo con dùng đúng bảng màu đã chọn', () => {
  const l = themeVars('meo-light'), d = themeVars('meo-dark');
  assert.deepEqual([l.bg, l.surface, l.border, l.text, l['topbar-bg'], l.kho, l.sp, l.tt, l.ok, l.warn, l.err],
    ['#FFF6EE', '#FFFFFF', '#F6D9C4', '#4A3B35', '#FFE3D0', '#5B9BEA', '#FF7A45', '#FF4F8B', '#4CC38A', '#F5A524', '#EF5B6B']);
  assert.deepEqual([d.bg, d.surface, d.border, d.text, d.kho, d.sp, d.tt],
    ['#2B211F', '#3A2D2A', '#5A4640', '#FFF1E8', '#7DB2F5', '#FF9468', '#FF6FA0']);
  assert.equal(l.radius, '22px');
  assert.equal(l.bw, '2px');
  assert.equal(l['btn-shadow-y'], '4px');
});

test('Vintage: phông có chân hỗ trợ tiếng Việt, không dùng Georgia; Tối giản không bóng', () => {
  for (const v of ['vintage-light', 'vintage-dark']) {
    const t = themeVars(v);
    assert.match(t['font-num'], /Times New Roman/);
    assert.match(t['font-num'], /Noto Serif/);
    assert.equal(t.bstyle, 'double');
    assert.equal(t.radius, '6px');
  }
  assert.ok(!/georgia/i.test(THEMES_CSS + APP_CSS));
  assert.equal(themeVars('toigian-light').shadow, 'none');
  const v = themeVars('vintage-light');
  assert.deepEqual([v.bg, v.surface, v.text], ['#F3EAD7', '#FBF5E6', '#4B3621']);
});

test('css/app.css chỉ dùng biến: không có mã màu riêng', () => {
  const noComments = APP_CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.deepEqual(noComments.match(/#[0-9a-fA-F]{3,8}\b/g) || [], []);
  assert.deepEqual(noComments.match(/\brgba?\(/g) || [], []);
});

test('Hiệu năng: không ảnh nền, blur, animation lặp, phông mới', () => {
  const css = (THEMES_CSS + APP_CSS).replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/url\(/.test(css), 'url()');
  assert.ok(!/blur\(/.test(css), 'blur');
  assert.ok(!/infinite/.test(css), 'animation lặp');
  assert.ok(!/@font-face|@import/.test(css), 'phông mới');
  assert.ok(!/gradient\(/.test(css), 'chỉ màu phẳng');
});

test('Chữ nhỏ nhất 13px', () => {
  const sizes = [...APP_CSS.matchAll(/font-size:\s*([\d.]+)px/g)].map((m) => +m[1]);
  assert.ok(sizes.length > 20);
  assert.deepEqual(sizes.filter((s) => s < 13), []);
});

/* ---------------- js/theme.js (logic thuần, chạy trong Node) ---------------- */
const Theme = require('../js/theme.js');

function fakeStorage(init) {
  const m = new Map(Object.entries(init || {}));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), map: m };
}

test('theme.js: giá trị hợp lệ được giữ, giá trị sai về Mèo con Sáng', () => {
  assert.deepEqual(Theme.parse('{"chuDe":"vintage","cheDo":"toi"}'), { chuDe: 'vintage', cheDo: 'toi' });
  assert.deepEqual(Theme.parse({ chuDe: 'toigian', cheDo: 'sang' }), { chuDe: 'toigian', cheDo: 'sang' });
  for (const bad of [null, undefined, '', 'abc', '[]', '42', '{"chuDe":"hong","cheDo":"sang"}', '{"chuDe":"meo","cheDo":"tim"}',
    '{"chuDe":"__proto__","cheDo":"sang"}', '{"chuDe":"toString","cheDo":"toi"}']) {
    assert.deepEqual(Theme.parse(bad), { chuDe: 'meo', cheDo: 'sang' }, String(bad));
  }
});

test('theme.js: mỗi lựa chọn ứng với một data-theme có trong css/themes.css', () => {
  const seen = new Set();
  for (const chuDe of Object.keys(Theme.THEMES)) for (const cheDo of ['sang', 'toi']) {
    const a = Theme.attr({ chuDe, cheDo });
    assert.ok(VARIANTS.includes(a), a);
    seen.add(a);
  }
  assert.equal(seen.size, 6);
  assert.deepEqual(Object.keys(Theme.THEMES), ['meo', 'vintage', 'toigian']);
  for (const k of Object.keys(Theme.THEMES)) {
    assert.equal(Theme.THEMES[k].mau.sang.length, 4, 'ô màu xem trước');
    assert.equal(Theme.THEMES[k].mau.toi.length, 4);
  }
});

test('theme.js: lưu và khôi phục bằng khoá riêng; localStorage bị chặn vẫn chạy', () => {
  const st = fakeStorage();
  assert.deepEqual(Theme.load(st), { chuDe: 'meo', cheDo: 'sang' });
  assert.equal(Theme.save({ chuDe: 'vintage', cheDo: 'toi' }, st), true);
  assert.equal(st.map.get('doiSoat_chuDe_v1'), '{"chuDe":"vintage","cheDo":"toi"}');
  assert.deepEqual(Theme.load(st), { chuDe: 'vintage', cheDo: 'toi' });
  Theme.save({ chuDe: 'xxx' }, st);   // lưu giá trị sai -> ghi mặc định
  assert.deepEqual(Theme.load(st), { chuDe: 'meo', cheDo: 'sang' });
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.deepEqual(Theme.load(blocked), { chuDe: 'meo', cheDo: 'sang' });
  assert.equal(Theme.save({ chuDe: 'meo', cheDo: 'toi' }, blocked), false);
  // Người đã bật Tối ở bản trước: giữ Tối
  assert.deepEqual(Theme.load(fakeStorage({ theme: 'dark' })), { chuDe: 'meo', cheDo: 'toi' });
});

test('theme.js: thông báo thành công có con vật chỉ ở Mèo con', () => {
  const html = { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } };
  Theme.apply({ chuDe: 'meo', cheDo: 'sang' }, html);
  assert.equal(html.attrs['data-theme'], 'meo-light');
  assert.equal(Theme.successText('Đã lưu', 'sp'), 'Xong rồi nè 🐱 Đã lưu');
  assert.equal(Theme.successText('Đã lưu', 'tt'), 'Xong rồi nè 🐰 Đã lưu');
  assert.equal(Theme.successText('Đã lưu', 'kho'), 'Xong rồi nè 🐻 Đã lưu');
  Theme.apply({ chuDe: 'vintage', cheDo: 'toi' }, html);
  assert.equal(html.attrs['data-theme'], 'vintage-dark');
  assert.equal(Theme.successText('Đã lưu', 'sp'), '✓ Đã lưu');
  Theme.apply({ chuDe: 'toigian', cheDo: 'sang' }, html);
  assert.equal(Theme.successText('Đã lưu', 'sp'), 'Đã lưu');
  assert.ok(!/\p{Extended_Pictographic}/u.test(Theme.successText('x', 'tt')));
});

test('index.html: theme.js nạp trong <head>, trước css, để không nháy màu; bỏ nút sáng/tối cũ', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const head = html.slice(0, html.indexOf('</head>'));
  const iTheme = head.indexOf('<script src="js/theme.js"></script>');
  assert.ok(iTheme > 0, 'theme.js trong <head>');
  assert.ok(iTheme < head.indexOf('css/themes.css') && iTheme < head.indexOf('css/app.css'));
  assert.ok(!/theme-toggle|toggleTheme/.test(html));
  assert.match(html, /id="themeBtn"[^>]*>\s*<span class="emo" aria-hidden="true">🎨<\/span>/);
});

test('Con vật chỉ nằm trong phần tử .animal (ẩn ở Vintage/Tối giản), không trong bảng / biểu đồ', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const ANIMAL = /[\u{1F400}-\u{1F43F}\u{1F980}-\u{1F9AE}]/u;
  const stripped = html.replace(/<(span|div) class="[^"]*\banimal\b[^"]*"[^>]*>[^<]*<\/\1>/g, '');
  assert.ok(!ANIMAL.test(stripped), 'con vật ngoài .animal');
  for (const t of html.match(/<table[\s\S]*?<\/table>/g)) assert.ok(!ANIMAL.test(t));
  for (const f of ['js/shopee.js', 'js/tiktok.js', 'js/kho-tab.js', 'js/app.js']) {
    assert.ok(!ANIMAL.test(fs.readFileSync(path.join(ROOT, f), 'utf8')), f + ' không được tự chèn con vật');
  }
  assert.match(APP_CSS, /:root:not\(\[data-theme\^="meo"\]\) \.animal/);
  assert.match(APP_CSS, /\[data-theme\^="toigian"\] \.emo/);
});
