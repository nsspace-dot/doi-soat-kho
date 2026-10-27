'use strict';
/* Kiểm thử đầu-cuối trên trình duyệt thật (Playwright + Chromium):
   chạy index.html với một máy chủ giả lập Web app (dùng chính Code.gs qua
   tests/gas-mock.js). Thư viện CDN được thay bằng bản trong node_modules để
   chạy được không cần Internet.
   Chạy: npm run test:e2e   (cần cài playwright + chromium)                 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { chromium } = require('playwright');
const XLSX = require('xlsx');
const { createGas } = require('../gas-mock.js');

const ROOT = path.join(__dirname, '..', '..');
const OUT = process.env.E2E_OUT || path.join(ROOT, 'tests', 'e2e', 'out');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

function startServer() {
  const gas = createGas();
  gas.state.now = new Date();
  const ctl = { breakPost: false, gas };
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/exec') {
      gas.state.now = new Date();
      if (req.method === 'GET') { res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); return res.end(JSON.stringify(gas.get())); }
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        if (ctl.breakPost) { res.writeHead(500, { 'Content-Type': 'text/html', 'Access-Control-Allow-Origin': '*' }); return res.end('<html>Lỗi</html>'); }
        ctl.lastContentType = req.headers['content-type'];
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify(gas.post(body)));
      });
      return;
    }
    const f = path.join(ROOT, decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname));
    if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((r) => srv.listen(0, () => r({ srv, ctl, port: srv.address().port })));
}

async function newPage(browser, port, configured, viewport) {
  const page = await browser.newPage({ viewport: viewport || { width: 1280, height: 900 }, acceptDownloads: true });
  page.on('pageerror', (e) => { throw e; });
  await page.route('https://cdnjs.cloudflare.com/**', (route) => {
    const u = route.request().url();
    const file = u.includes('xlsx') ? path.join(ROOT, 'node_modules/xlsx/dist/xlsx.full.min.js') : path.join(ROOT, 'node_modules/chart.js/dist/chart.umd.js');
    route.fulfill({ body: fs.readFileSync(file), contentType: 'text/javascript' });
  });
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ body: '', contentType: 'text/css' }));
  // Luôn thay js/config.js: không bao giờ gọi Web app thật khi chạy test.
  await page.route('**/js/config.js', (r) => r.fulfill({
    body: "var API_URL = '" + (configured ? 'http://localhost:' + port + '/exec' : '') + "';", contentType: 'text/javascript' }));
  await page.goto('http://localhost:' + port + '/');
  return page;
}

function xlsxFile(name, aoa) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'S');
  return { name, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) };
}

async function readDownload(page, click) {
  const [dl] = await Promise.all([page.waitForEvent('download'), click()]);
  const p = await dl.path();
  return { name: dl.suggestedFilename(), wb: XLSX.read(fs.readFileSync(p), { type: 'buffer', cellNF: true }) };
}

async function modalClick(page, label) {
  await page.locator('.modal').waitFor();
  await page.locator('.modal-actions button', { hasText: label }).click();
}

const codes = (ctl) => ctl.gas.get().kho.map((r) => r[0]).sort();

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const { srv, ctl, port } = await startServer();
  const browser = await chromium.launch();
  const steps = [];
  const step = (s) => { steps.push(s); console.log('✓ ' + s); };
  try {
    /* ---- Chưa cấu hình API_URL: hiện hướng dẫn, không lỗi ---- */
    let page = await newPage(browser, port, false);
    await page.locator('#khoStatus .guide-box').waitFor();
    assert.match(await page.locator('#khoStatus').innerText(), /js\/config\.js/);
    await page.screenshot({ path: path.join(OUT, '0-chua-cau-hinh.png'), fullPage: false });
    await page.close();
    step('Chưa cấu hình: hiện hướng dẫn thay vì lỗi');

    /* ---- Đã cấu hình ---- */
    page = await newPage(browser, port, true);
    await page.locator('#st_lastWho', { hasText: 'Chưa ai tải' }).waitFor();
    assert.equal(await page.textContent('#st_count'), '0');
    assert.match(await page.locator('#st_week').innerText(), /Chưa tải kho tuần này/);
    step('Kho trống: nhãn vàng "Chưa tải kho tuần này"');

    // Tab Kho: dán Zalo + file
    await page.fill('#kho_name', 'Lan');
    await page.fill('#kho_input', [
      '[20/10/2026 09:15:02] Kho HN: mã hoàn',
      '[QR]: 862330000001', '[C128] 862330000002', '[QR]: SPXVN00000004', '[QR]: 862330000001', '[QR]: ABC', 'rác'
    ].join('\n'));
    await page.setInputFiles('#kho_inp', [xlsxFile('scan.xlsx', [['Báo cáo'], [], ['Symbology', 'Code', 'Timestamp'], ['QR', 'VNGH00000003', 1729500000000], ['QR', 'XOAMANAY01', 1]])]);
    assert.ok(await page.locator('#kho_step2.is-idle').count(), 'bước 2 mờ khi chưa xử lý');
    assert.ok(await page.locator('#kho_step3.is-idle').count(), 'bước 3 mờ khi chưa xử lý');
    await page.click('text=Xử lý & xem trước');
    await page.locator('#kho_step2:not(.is-idle) #kho_results').waitFor();
    await page.locator('#kho_step3:not(.is-idle)').waitFor();
    assert.equal(await page.textContent('#kho_sUnique'), '5');
    assert.equal(await page.textContent('#kho_sDup'), '1');
    assert.equal(await page.textContent('#kho_sNew'), '5');
    await page.click('.del-btn[data-code="XOAMANAY01"]');
    assert.equal(await page.textContent('#kho_sUnique'), '4');
    await page.screenshot({ path: path.join(OUT, '1-kho-xem-truoc.png'), fullPage: true });
    await page.click('#kho_btnSave');
    await page.locator('#st_lastWho', { hasText: 'Lan' }).waitFor();
    assert.equal(await page.textContent('#st_count'), '4');
    assert.match(await page.locator('#st_week').innerText(), /Đã có người tải kho/);
    assert.match(await page.textContent('#st_lastWhen'), /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2} · 4 mã$/);
    assert.equal(await page.textContent('#st_old'), '0');
    assert.ok(!(await page.locator('#st_oldCard.is-warn').count()));
    assert.ok(await page.locator('#kho_step2.is-idle').count(), 'lưu xong thì bước 2 về trạng thái chờ');
    assert.equal(ctl.lastContentType, 'text/plain;charset=utf-8');
    assert.deepEqual(codes(ctl), ['862330000001', '862330000002', 'SPXVN00000004', 'VNGH00000003']);
    assert.equal(await page.inputValue('#kho_input'), '', 'lưu xong thì xoá bản nháp');
    step('Tab Kho: tách Zalo + file, xoá mã sai, gộp trùng, lưu, dòng trạng thái xanh');

    // Lưu lần 2 khi kho đã có dữ liệu -> hỏi Gộp / Thay thế
    await page.fill('#kho_input', '[QR]: 862330000001\n[QR]: GYABC123');
    await page.click('text=Xử lý & xem trước');
    assert.equal(await page.textContent('#kho_sNew'), '1');
    await page.click('#kho_btnSave');
    await page.locator('.modal', { hasText: 'Gộp thêm vào kho' }).waitFor();
    await page.screenshot({ path: path.join(OUT, '2-hoi-gop-thay.png') });
    await modalClick(page, 'Gộp thêm vào kho');
    await page.locator('#st_count', { hasText: '5' }).waitFor();
    step('Kho có dữ liệu: hỏi Gộp/Thay thế, gộp giữ mã cũ');

    // Lỗi máy chủ: báo rõ, giữ nguyên dữ liệu vừa nhập
    ctl.breakPost = true;
    await page.fill('#kho_input', '[QR]: MOIMOI0001');
    await page.click('text=Xử lý & xem trước');
    await page.click('#kho_btnSave');
    await modalClick(page, 'Gộp thêm vào kho');
    await page.locator('.modal', { hasText: 'Chưa lưu được' }).waitFor();
    assert.match(await page.locator('.modal').innerText(), /trang web thay vì dữ liệu/);
    await modalClick(page, 'Đã hiểu');
    assert.equal(await page.inputValue('#kho_input'), '[QR]: MOIMOI0001');
    assert.equal(await page.textContent('#kho_sUnique'), '1');
    ctl.breakPost = false;
    await page.click('text=Xoá hết');
    step('API lỗi: báo rõ, không mất dữ liệu vừa nhập');

    /* ---- Tab Shopee ---- */
    await page.click('#platBtn_sp');
    const tpl = await readDownload(page, () => page.click('#pane_sp >> text=Tải file mẫu'));
    const tplRows = XLSX.utils.sheet_to_json(tpl.wb.Sheets[tpl.wb.SheetNames[0]], { header: 1, blankrows: false }).filter((r) => r.some((v) => v !== ''));
    assert.deepEqual(tplRows[0], ['Tuần đối soát', 'KHO', 'Mã vận đơn', 'Gian hàng Shopee', 'Loại tệp tin', 'Tên sản phẩm', 'Phân loại']);
    assert.equal(tplRows.length, 2);
    step('Shopee: tải file mẫu đúng bộ cột');

    await page.setInputFiles('#sp_inp1', [xlsxFile('Shop_A.xlsx', [
      ['Mã đơn hàng', 'Mã vận đơn', 'Đơn vị vận chuyển', 'Tên sản phẩm', 'Tên phân loại hàng', 'Tổng giá trị đơn hàng', 'Tỉnh/Thành phố'],
      ['DH1', '862330000001', 'J&T', 'Lịch 2027', 'Đỏ', '135150.00', 'Hà Nội'],
      ['DH2', 'SPXVN00000004', 'SPX', 'Áo', 'M', '50000.00', 'HCM'],
      ['DH3', 'SPXVN99999999', 'SPX', 'Quần', 'L', '70000.00', 'HCM']
    ])]);
    assert.ok(await page.isVisible('#sp_empty'), 'chưa đối soát: hiện trạng thái rỗng');
    assert.ok(!(await page.isVisible('#sp_results')));
    await page.click('#sp_btnRun');
    await page.locator('.modal', { hasText: 'Sẽ xoá 2 mã đã khớp khỏi kho chung' }).waitFor();
    await page.screenshot({ path: path.join(OUT, '3-shopee-xac-nhan.png') });
    await modalClick(page, 'Xoá 2 mã');
    await page.locator('#sp_syncBox.done').waitFor();
    assert.deepEqual(codes(ctl), ['862330000002', 'GYABC123', 'VNGH00000003']);
    assert.equal(await page.textContent('#sp_mMissA'), '1');
    assert.ok(!(await page.isVisible('#sp_empty')), 'có kết quả: ẩn trạng thái rỗng');
    assert.deepEqual(await Promise.all(['Matched', 'MissA', 'MissB', 'Old'].map((k) => page.textContent('#sp_sum' + k))), ['2', '1', '3', '0']);
    assert.ok(!(await page.locator('#sp_sumOldCard.is-warn').count()));
    const ls = ctl.gas.get().lichSu[0];
    assert.equal(ls.hanhDong, 'Đối soát Shopee');
    assert.equal(ls.nguoi, 'Lan');
    await page.screenshot({ path: path.join(OUT, '4-shopee-ket-qua.png'), fullPage: true });
    step('Shopee: đọc kho chung, xác nhận, chỉ xoá 2 mã Shopee đã khớp, ghi lịch sử');

    const exA = await readDownload(page, () => page.click('#sp_btnExportA'));
    const exRows = XLSX.utils.sheet_to_json(exA.wb.Sheets[exA.wb.SheetNames[0]], { header: 1 });
    assert.equal(exRows[0][3], 'Gian hàng Shopee');
    assert.match(exRows[1][0], /^Tuần \d+\/\d{4}$/);
    assert.equal(exRows[1][1] || '', '');
    assert.deepEqual(exRows[1].slice(2), ['SPXVN99999999', 'Shop A', 'Đơn hàng (hủy / giao KTC)', 'Quần', 'L']);
    assert.equal(exA.wb.Sheets[exA.wb.SheetNames[0]].C2.z, '@');
    step('Shopee: xuất "Sàn báo, kho chưa nhận" đúng bộ cột, tuần ISO, KHO trống');

    /* ---- Tab TikTok ---- */
    await page.click('#platBtn_tt');
    await page.setInputFiles('#tt_inp1', [xlsxFile('TIKTOK_Gian_1_giao.xlsx', [
      ['Order ID', 'Tracking ID', 'Product Name', 'Variation', 'Shipping Provider', 'Order Amount', 'Payment Method'],
      ['O1', '862330000002', 'Lịch', 'Xanh', 'J&T', '50000', 'Cash on delivery'],
      ['O2', 'GYABC123', 'Lịch', 'Xanh', 'GHN', '50000', 'Cash on delivery'],
      ['O3', '862330000077', 'Lịch', 'Vàng', 'J&T', '50000', 'Cash on delivery']
    ])]);
    await page.click('#tt_btnRun');
    await page.locator('.modal', { hasText: 'Sẽ xoá 1 mã đã khớp khỏi kho chung' }).waitFor();
    await modalClick(page, 'Huỷ');
    await page.locator('#tt_syncBox.pending').waitFor();
    assert.equal(codes(ctl).length, 3, 'huỷ thì kho không đổi');
    await page.click('#tt_syncBox button');
    await page.locator('#tt_syncBox.done').waitFor();
    assert.deepEqual(codes(ctl), ['GYABC123', 'VNGH00000003']);
    assert.equal(await page.textContent('#tt_mFiltered'), '1');
    step('TikTok: huỷ không đổi kho; ghi lại chỉ xoá mã TikTok, GY bị lọc vẫn còn trong kho');

    const ttA = await readDownload(page, () => page.click('#tt_btnExportA'));
    const ttRows = XLSX.utils.sheet_to_json(ttA.wb.Sheets[ttA.wb.SheetNames[0]], { header: 1 });
    assert.deepEqual(ttRows[0], ['Tuần đối soát', 'KHO', 'Mã vận đơn', 'Gian hàng TikTok', 'Loại tệp tin', 'Tên sản phẩm', 'Phân loại']);
    assert.equal(ttRows[1][2], '862330000077');
    step('TikTok: xuất đúng bộ cột "Gian hàng TikTok"');

    /* ---- Hoàn tác ---- */
    await page.click('#platBtn_kho');
    await page.click('#kho_btnUndo');
    await page.locator('.modal', { hasText: 'Đối soát TikTok' }).waitFor();
    await modalClick(page, 'Hoàn tác');
    await page.locator('#st_count', { hasText: '3' }).waitFor();
    assert.ok(codes(ctl).includes('862330000002'));
    await page.locator('#kho_history tr', { hasText: 'Hoàn tác' }).first().waitFor();
    await page.screenshot({ path: path.join(OUT, '5-lich-su.png'), fullPage: true });
    step('Hoàn tác: kho về trước lần ghi gần nhất, lịch sử hiện trên trang');

    const kx = await readDownload(page, () => page.click('text=Tải kho về Excel'));
    const kxRows = XLSX.utils.sheet_to_json(kx.wb.Sheets[kx.wb.SheetNames[0]], { header: 1 });
    assert.deepEqual(kxRows[0].slice(0, 4), ['STT', 'Mã vận đơn', 'Ngày đối soát', 'Số ngày tồn']);
    assert.equal(kxRows.length, 4);
    step('Tải kho về Excel để sao lưu');

    /* ---- Chủ đề (theme) ---- */
    assert.equal(await page.getAttribute('html', 'data-theme'), 'meo-light', 'mặc định: Mèo con, Sáng');
    assert.equal(await page.locator('#theme-toggle').count(), 0, 'đã bỏ nút sáng/tối cũ');
    assert.ok(await page.isVisible('#platBtn_kho .tab-ico'), 'Mèo con: tab có con vật');
    assert.match(await page.locator('#toast').innerText(), /^Xong rồi nè 🐻 /, 'Mèo con: thông báo thành công có con vật');
    // Thẻ "Tồn từ 7 ngày" tô cảnh báo khi có mã cũ
    ctl.gas.post({ action: 'upload', cheDo: 'gop', nguoi: 'Cũ', items: [{ ma: 'CU0000000001', ngay: '01/10/2026' }] });
    await page.click('#st_refresh');
    await page.locator('#st_oldCard.is-warn').waitFor();
    assert.equal(await page.textContent('#st_old'), '1');
    step('Mặc định Mèo con Sáng, có con vật; thẻ "Tồn từ 7 ngày" tô cảnh báo khi > 0');

    // Màu nhấn đổi theo tab đang xem
    for (const t of ['kho', 'sp', 'tt']) {
      await page.click('#platBtn_' + t);
      const c = await page.evaluate((t) => {
        const probe = document.createElement('div');
        probe.style.background = 'var(--' + t + ')';
        document.body.appendChild(probe);
        const want = getComputedStyle(probe).backgroundColor; probe.remove();
        return { want, tab: getComputedStyle(document.getElementById('platBtn_' + t)).backgroundColor,
          btn: getComputedStyle(document.querySelector('#pane_' + t + ' .btn-main')).backgroundColor,
          accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() };
      }, t);
      assert.equal(c.tab, c.want, 'tab ' + t + ' tô màu riêng');
      assert.equal(c.btn, c.want, 'nút chính tab ' + t + ' lấy màu tab');
    }
    const colours = await page.evaluate(() => ['kho', 'sp', 'tt'].map((t) => getComputedStyle(document.getElementById('platBtn_' + t)).getPropertyValue('--c').trim()));
    assert.equal(new Set(colours).size, 3);
    step('Tab đang chọn tô màu riêng, nút chính đổi màu theo tab');

    // Chuẩn bị trang để quét: tab Kho có bảng xem trước, Shopee/TikTok có kết quả
    await page.click('#platBtn_kho');
    await page.fill('#kho_input', '[QR]: 862330000099\n[QR]: AB1');
    await page.click('text=Xử lý & xem trước');
    await page.locator('#kho_step3:not(.is-idle)').waitFor();

    const ANIMALS = /[\u{1F400}-\u{1F43F}\u{1F980}-\u{1F9AE}]/u;
    const visibleText = (p) => p.evaluate(() => {
      const t = document.getElementById('toast'); const keep = t.textContent; t.textContent = '';
      const out = document.body.innerText; t.textContent = keep; return out;
    });
    const scanContrast = (p) => p.evaluate(() => {
      const parse = (c) => { const n = c.match(/[\d.]+/g).map(Number); return { r: n[0], g: n[1], b: n[2], a: n.length > 3 ? n[3] : 1 }; };
      const lum = (c) => [c.r, c.g, c.b].map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
        .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
      const blend = (top, bot) => ({ r: top.r * top.a + bot.r * (1 - top.a), g: top.g * top.a + bot.g * (1 - top.a), b: top.b * top.a + bot.b * (1 - top.a), a: 1 });
      const bgOf = (el) => {
        const layers = [];
        for (let e = el; e; e = e.parentElement) {
          const c = parse(getComputedStyle(e).backgroundColor);
          if (c.a > 0) { layers.push(c); if (c.a >= 1) break; }
        }
        let base = layers.length && layers[layers.length - 1].a >= 1 ? layers.pop() : { r: 255, g: 255, b: 255, a: 1 };
        while (layers.length) base = blend(layers.pop(), base);
        return base;
      };
      const fails = []; let checked = 0;
      for (const el of document.querySelectorAll('body *')) {
        if (['SCRIPT', 'STYLE', 'svg', 'CANVAS'].includes(el.tagName) || el.closest('svg, .sr-only')) continue;
        const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        if (!own || !el.getClientRects().length) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility !== 'visible') continue;
        let op = 1; for (let e = el; e; e = e.parentElement) op *= +getComputedStyle(e).opacity;
        if (op === 0) continue;
        const fg = parse(cs.color), bg = bgOf(el);
        const a = lum(fg), b = lum(bg), ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        checked++;
        if (ratio < 4.5) fails.push(el.tagName + '.' + el.className + ' "' + el.textContent.trim().slice(0, 30) + '" ' + ratio.toFixed(2));
      }
      return { fails, checked };
    });

    const VARIANTS = [['meo', 'sang'], ['meo', 'toi'], ['vintage', 'sang'], ['vintage', 'toi'], ['toigian', 'sang'], ['toigian', 'toi']];
    for (const [chuDe, cheDo] of VARIANTS) {
      const name = chuDe + '-' + (cheDo === 'toi' ? 'dark' : 'light');
      await page.click('#themeBtn');
      await page.locator('#themePanel').waitFor();
      assert.equal(await page.locator('#themePanel .theme-opt').count(), 3);
      assert.equal(await page.locator('#themePanel .theme-opt .sw').count(), 12, 'mỗi chủ đề có ô màu xem trước');
      await page.click('#themePanel .theme-opt[data-chu-de="' + chuDe + '"]');
      if (await page.isChecked('#themeDark') !== (cheDo === 'toi')) await page.click('#themePanel .mode-switch');
      assert.equal(await page.getAttribute('html', 'data-theme'), name);
      const saved = JSON.parse(await page.evaluate(() => localStorage.getItem('doiSoat_chuDe_v1')));
      assert.deepEqual(saved, { chuDe, cheDo });
      const panelScan = await scanContrast(page);
      assert.deepEqual(panelScan.fails, [], name + ' hộp chọn chủ đề');
      await page.keyboard.press('Escape');
      await page.locator('#themePanel').waitFor({ state: 'hidden' });

      for (const t of ['kho', 'sp', 'tt']) {
        await page.click('#platBtn_' + t);
        const r = await scanContrast(page);
        assert.ok(r.checked > 40, name + ' ' + t + ' quét ' + r.checked + ' phần tử');
        assert.deepEqual(r.fails, [], name + ' tab ' + t);
        const text = await visibleText(page);
        if (chuDe !== 'meo') assert.ok(!ANIMALS.test(text), name + ' ' + t + ': không được có con vật');
        if (chuDe === 'toigian') assert.ok(!/\p{Extended_Pictographic}/u.test(text), name + ' ' + t + ': không emoji');
        if (chuDe === 'meo') {
          const tables = await page.evaluate((t) => [...document.querySelectorAll('#pane_' + t + ' table, #pane_' + t + ' .chart-card')].map((e) => e.innerText).join(' '), t);
          assert.ok(!ANIMALS.test(tables), name + ': không con vật trong bảng/biểu đồ');
        }
        if (t !== 'kho') {
          const chart = await page.evaluate((t) => {
            const ch = Chart.getChart(document.getElementById(t + '_chartShip'));
            return { got: ch.options.plugins.legend.labels.color, want: getComputedStyle(document.documentElement).getPropertyValue('--chart-text').trim() };
          }, t);
          assert.equal(chart.got.toLowerCase(), chart.want.toLowerCase(), name + ': màu nhãn biểu đồ theo theme');
        }
      }
      // Hộp xác nhận
      await page.click('#platBtn_kho');
      await page.click('#kho_btnUndo');
      await page.locator('.modal').waitFor();
      assert.deepEqual((await scanContrast(page)).fails, [], name + ' hộp xác nhận');
      await modalClick(page, 'Huỷ');
      await page.screenshot({ path: path.join(OUT, 'theme-' + name + '.png'), fullPage: true });
    }
    step('6 biến thể: chọn qua 🎨, lưu localStorage, tương phản ≥ 4.5:1 trên mọi chữ (cả hộp thoại), không con vật ở Vintage/Tối giản, không emoji ở Tối giản, nhãn biểu đồ đổi màu');

    // Lưu và khôi phục sau khi tải lại trang
    await page.reload();
    assert.equal(await page.getAttribute('html', 'data-theme'), 'toigian-dark');
    step('Tải lại trang: giữ chủ đề đã chọn');

    // Áp theme trước khi vẽ: data-theme đã có ngay khi DOM bắt đầu dựng
    const early = await browser.newPage();
    await early.addInitScript(() => {
      localStorage.setItem('doiSoat_chuDe_v1', JSON.stringify({ chuDe: 'vintage', cheDo: 'toi' }));
      document.addEventListener('readystatechange', () => {
        if (document.readyState === 'interactive') window.__themeAtInteractive = document.documentElement.getAttribute('data-theme');
      });
      new MutationObserver((ms, obs) => {
        if (document.body) { window.__themeAtBody = document.documentElement.getAttribute('data-theme'); obs.disconnect(); }
      }).observe(document, { childList: true, subtree: true });
    });
    await early.route('**/js/config.js', (r) => r.fulfill({ body: "var API_URL = '';", contentType: 'text/javascript' }));
    await early.route('https://cdnjs.cloudflare.com/**', (r) => r.fulfill({ body: '', contentType: 'text/javascript' }));
    await early.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ body: '', contentType: 'text/css' }));
    await early.goto('http://localhost:' + port + '/');
    assert.equal(await early.evaluate(() => window.__themeAtBody), 'vintage-dark', 'theme có trước khi dựng <body>');
    await early.close();
    step('Áp theme đã lưu trước khi vẽ <body> (không nháy màu)');

    // Giá trị lưu sai -> Mèo con, Sáng
    for (const bad of ['{"chuDe":"hong","cheDo":"sang"}', '{"chuDe":"meo","cheDo":"tim"}', 'không phải json', '[]', 'null']) {
      const p = await browser.newPage();
      await p.addInitScript((v) => localStorage.setItem('doiSoat_chuDe_v1', v), bad);
      await p.route('**/js/config.js', (r) => r.fulfill({ body: "var API_URL = '';", contentType: 'text/javascript' }));
      await p.route('https://cdnjs.cloudflare.com/**', (r) => r.fulfill({ body: '', contentType: 'text/javascript' }));
      await p.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ body: '', contentType: 'text/css' }));
      await p.goto('http://localhost:' + port + '/');
      assert.equal(await p.getAttribute('html', 'data-theme'), 'meo-light', 'giá trị sai: ' + bad);
      await p.close();
    }
    step('Giá trị lưu sai -> về mặc định Mèo con, Sáng');

    /* ---- Điện thoại: cả 6 biến thể, cả 3 tab ---- */
    const mobile = await newPage(browser, port, true, { width: 390, height: 844 });
    await mobile.locator('#st_count', { hasText: /^\d+$/ }).waitFor();
    for (const [chuDe, cheDo] of VARIANTS) {
      await mobile.evaluate((t) => Theme.set(t), { chuDe, cheDo });
      for (const t of ['kho', 'sp', 'tt']) {
        await mobile.click('#platBtn_' + t);
        const over = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        assert.ok(over <= 0, chuDe + '-' + cheDo + ' tab ' + t + ' tràn ngang ' + over + 'px');
      }
      await mobile.click('#themeBtn');
      const box = await mobile.locator('#themePanel').boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= 390, 'hộp chọn chủ đề nằm trong màn hình');
      await mobile.keyboard.press('Escape');
      await mobile.click('#platBtn_kho');
      await mobile.screenshot({ path: path.join(OUT, 'dien-thoai-' + chuDe + '-' + cheDo + '.png'), fullPage: false });
    }
    step('Điện thoại 390px: 6 biến thể × 3 tab không tràn ngang, hộp chọn chủ đề vừa màn hình');
  } finally {
    await browser.close();
    srv.close();
  }
  console.log('\nE2E: ' + steps.length + ' bước đều đạt. Ảnh chụp ở ' + path.relative(ROOT, OUT));
}

main().catch((e) => { console.error(e); process.exit(1); });
