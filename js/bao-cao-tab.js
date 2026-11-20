/* =====================================================================
   BcTab — tab "Báo cáo hình": dán bảng theo dõi đơn thiếu (hoặc chọn file
   xlsx / csv) -> vẽ thẻ báo cáo màu cố định -> tải PNG / chép hình / chép
   bản chữ. Phần đọc bảng và tính số nằm ở js/core/bao-cao.js.
   Bảng dán gần nhất được nhớ trong localStorage của máy (không gửi đi đâu).
   ===================================================================== */
var BcTab = (function () {
  var esc = Common.escapeHtml;
  var KEY = 'doiSoat_baoCao_v1', MAX_STORE = 1500000;
  // Màu kho cố định: NVS cam, TSN xanh dương, VL tím; kho khác lấy lần lượt bảng phụ.
  var KHO_MAU = {
    NVS: { k: '#f97316', on: '#1c1917', ink: '#c2410c' },
    TSN: { k: '#2563eb', on: '#ffffff', ink: '#1d4ed8' },
    VL:  { k: '#7c3aed', on: '#ffffff', ink: '#6d28d9' }
  };
  var MAU_PHU = [{ k: '#0f766e', on: '#ffffff', ink: '#0f766e' }, { k: '#be185d', on: '#ffffff', ink: '#be185d' },
                 { k: '#4d7c0f', on: '#ffffff', ink: '#3f6212' }, { k: '#475569', on: '#ffffff', ink: '#334155' }];
  var MAU_CHUA_RO = { k: '#64748b', on: '#ffffff', ink: '#334155' };

  var san = 'tiktok', model = null, doc = null, timer = null;
  function $(id) { return document.getElementById(id); }

  function mauKho(M, kho) {
    if (KHO_MAU[kho]) return KHO_MAU[kho];
    if (kho === NhanDien.CHUA_RO) return MAU_CHUA_RO;
    var khac = M.khoList.filter(function (k) { return !KHO_MAU[k] && k !== NhanDien.CHUA_RO; });
    return MAU_PHU[Math.max(0, khac.indexOf(kho)) % MAU_PHU.length];
  }
  function khoVar(M, kho) { var c = mauKho(M, kho); return '--k:' + c.k + ';--k-on:' + c.on + ';--k-ink:' + c.ink; }
  function cat(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1).trim() + '…' : s; }
  function traGiao(b) { return b.tra + ' Trả hàng / ' + b.giao + ' Giao KTC'; }

  /* ---------- vẽ thẻ ----------
     Bố cục 2 cột: trái = báo cáo tuần này, phải = các tuần trước; dưới là tổng còn treo,
     lý do + sản phẩm (2 cột), ghi chú.                                                   */
  function cardHtml(M) {
    var h = '';
    h += '<div class="bc-head"><div class="bc-title">📦 BÁO CÁO ĐỐI SOÁT ' + esc(M.sanLabel.toUpperCase()) + '</div>' +
      '<div class="bc-sub">Tuần ' + esc(M.tuanNay) + ' · ' + M.soGian + ' gian hàng</div></div><div class="bc-body"><div class="bc-cols">';

    // Cột trái: tuần này
    h += '<div class="bc-col"><div class="bc-col-h">TUẦN NÀY · ' + esc(M.tuanNay) + '</div>' + numBox('Tuần này thiếu', M.so.nay, true) +
      '<div class="bc-sec"><div class="bc-sec-h">Tuần ' + esc(M.tuanNay) + ' — đơn thiếu theo gian × kho</div>' +
      '<table class="bc-table"><thead><tr><th>Gian hàng</th>' + M.khoList.map(function (k) { return '<th>' + esc(k) + '</th>'; }).join('') + '<th>Tổng</th></tr></thead><tbody>';
    M.bang.gians.forEach(function (g) {
      h += '<tr><td>' + esc(g.ten) + '</td>' + M.khoList.map(function (k) { return heat(g.theoKho[k] || 0, M.bang.max); }).join('') +
        '<td class="sum">' + g.tong + '</td></tr>';
    });
    h += '<tr class="total"><td>Tổng theo kho</td>' + M.khoList.map(function (k) { return '<td>' + (M.bang.tongKho[k] || '–') + '</td>'; }).join('') +
      '<td>' + M.bang.tong + '</td></tr></tbody></table></div></div>';

    // Cột phải: các tuần trước
    h += '<div class="bc-col"><div class="bc-col-h">CÁC TUẦN TRƯỚC · ' + M.ton.length + ' tuần</div>' + numBox('Tồn các tuần trước', M.so.ton) +
      '<div class="bc-sec"><div class="bc-sec-h">Tồn đọng các tuần trước</div>';
    if (M.ton.length) {
      h += '<div class="bc-ton">' + M.ton.map(function (t) {
        return '<div class="bc-ton-row"><div class="bc-ton-top"><span class="bc-ton-w">Tuần ' + esc(t.label) + '</span><span class="bc-ton-late">quá ' + t.quaNgay +
          ' ngày</span><span class="bc-ton-n">' + t.tong + '</span></div><span class="bc-chips">' +
          t.kho.map(function (k) { return '<span class="bc-chip" style="' + khoVar(M, k.kho) + '">' + esc(k.kho) + ' ' + k.n + '</span>'; }).join('') + '</span></div>';
      }).join('') + '</div>';
    } else h += '<div class="bc-empty">Không có đơn tồn từ các tuần trước.</div>';
    h += '</div></div></div>';

    // Tổng còn treo
    h += '<div class="bc-sec bc-treo">' + numBox('Tổng còn treo', M.so.tong) + '<div class="bc-treo-bar"><div class="bc-sec-h">Tổng còn treo theo kho (' + M.so.tong.tong + ' đơn)</div><div class="bc-stack">' +
      M.tongKho.map(function (k) {
        return '<div class="bc-seg" style="' + khoVar(M, k.kho) + ';width:' + (k.n / M.so.tong.tong * 100).toFixed(2) + '%">' + (k.pct >= 9 ? esc(k.kho) + ' ' + k.n : '') + '</div>';
      }).join('') + '</div><div class="bc-legend">' + M.tongKho.map(function (k) {
        return '<span><span class="bc-dot" style="' + khoVar(M, k.kho) + '"></span>' + esc(k.kho) + ': ' + k.n + ' đơn (' + k.pct + '%)</span>';
      }).join('') + '</div></div></div>';

    // Lý do | Sản phẩm
    var lyDoH = '', spH = '';
    if (M.lyDo && M.lyDo.length) {
      var maxL = M.lyDo[0].n;
      lyDoH = '<div class="bc-col"><div class="bc-sec-h">Lý do</div><div class="bc-bars">' + M.lyDo.map(function (l) {
        return '<div class="bc-bar"><div class="bc-bar-l">' + esc(l.nhom) + '</div><div class="bc-bar-t"><div class="bc-bar-f" style="width:' +
          Math.max(2, Math.round(l.n / maxL * 100)) + '%"></div></div><div class="bc-bar-n">' + l.n + ' <span>(' + l.pct + '%)</span></div></div>';
      }).join('') + '</div></div>';
    }
    if (M.topSp) {
      spH = '<div class="bc-col"><div class="bc-sec-h">Sản phẩm còn treo nhiều nhất</div><div class="bc-top">' + M.topSp.map(function (p, i) {
        var loai = [];
        if (p.tra) loai.push(p.tra + ' Trả hàng');
        if (p.giao) loai.push(p.giao + ' Giao KTC');
        if (p.khac) loai.push(p.khac + ' Khác');
        return '<div class="bc-top-row"><span class="bc-top-i">' + (i + 1) + '.</span><span class="bc-top-name">' + esc(cat(p.ten, 90)) + '</span>' +
          '<span class="bc-top-meta"><b>' + p.n + ' đơn</b> · ' + esc(loai.join(', ')) + ' · ' +
          esc(p.kho.map(function (k) { return k.kho + ' ' + k.n; }).join(', ')) + '</span></div>';
      }).join('') + '</div></div>';
    }
    if (lyDoH || spH) h += '<div class="bc-cols bc-sec' + (lyDoH && spH ? '' : ' one') + '">' + lyDoH + spH + '</div>';

    var g = M.ghiChu;
    h += '<div class="bc-note"><div>👉 Ưu tiên kho <b>' + esc(g.kho) + '</b>: <b>' + g.a + '/' + g.b + '</b> đơn (' + g.pct + '%). Đơn cũ nhất từ tuần <b>' + esc(g.cuNhat) + '</b>.</div>' +
      '<div>🚚 Theo ĐVVC: ' + esc(g.dvvc.map(function (d) { return d.ten + ' ' + d.n; }).join(' · ')) +
      (g.dvvcDoan ? ' <span>(' + g.dvvcDoan + ' đơn đoán theo mã)</span>' : '') + '</div></div>';
    h += '<div class="bc-foot">Lập ngày ' + esc(Common.today()) + ' · ' + M.so.tong.tong + ' mã vận đơn</div></div>';
    return h;
  }
  function numBox(label, b, hot) {
    return '<div class="bc-num' + (hot ? ' hot' : '') + '"><div class="bc-num-l">' + label + '</div><div class="bc-num-v">' + b.tong +
      '</div><div class="bc-num-s">' + traGiao(b) + '</div></div>';
  }
  // Ô có số tô đỏ đậm nhạt theo giá trị; ô 0 ghi "–".
  function heat(n, max) {
    if (!n) return '<td class="zero">–</td>';
    var t = max ? n / max : 0;
    if (t >= 0.75) return '<td class="heat max">' + n + '</td>';
    return '<td class="heat" style="background:rgba(220,38,38,' + (0.12 + 0.4 * t).toFixed(2) + ')">' + n + '</td>';
  }

  /* ---------- đọc + vẽ ---------- */
  function showErr(msg) {
    var box = $('bc_err');
    box.hidden = !msg;
    box.querySelector('span').textContent = msg || '';
  }
  function render() {
    var text = $('bc_input').value;
    model = null; doc = null;
    document.querySelectorAll('.bc-san-btn').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-san') === san); });
    if (!text.trim()) {
      showErr(''); $('bc_info').textContent = ''; $('bc_out').hidden = true; $('bc_empty').hidden = false;
      return;
    }
    doc = BaoCao.docBang(BaoCao.parseTsv(text));
    if (!doc.ok) {
      showErr(doc.loi); $('bc_info').textContent = ''; $('bc_out').hidden = true; $('bc_empty').hidden = false;
      return;
    }
    showErr('');
    model = BaoCao.tinh(doc, { san: san });
    var info = 'Đã đọc ' + doc.soDong + ' dòng · ' + doc.items.length + ' mã vận đơn';
    if (doc.soTrung) info += ' · bỏ qua ' + doc.soTrung + ' mã trùng';
    if (doc.soTuanLoi) info += ' · ' + doc.soTuanLoi + ' dòng không đọc được tuần (bỏ qua)';
    $('bc_info').textContent = info;
    var card = $('bc_card');
    card.setAttribute('data-san', san);
    card.innerHTML = cardHtml(model);
    $('bc_empty').hidden = true;
    $('bc_out').hidden = false;
    XuatThieu.veTinNhan($('bc_dvvcBox'), dvvcItems());
  }
  // Bảng đã dán -> dòng của file đòi ĐVVC (kho lấy từ cột KHO của bảng).
  function dvvcItems() {
    return doc && doc.ok ? doc.items.map(function (x) {
      return { ma: x.maGoc || x.ma, dvvc: x.dvvc, dvvcNguon: x.dvvcNguon, gian: x.gian, loai: x.loai, maDon: x.maDon, sp: x.sp,
        lyDo: x.lyDo, tuan: x.tuan.label, kho: x.kho, khoNguon: NhanDien.FILE };
    }) : [];
  }
  function xuatDvvc(theo) { if (model) XuatThieu.xuatDvvc(model.sanLabel, dvvcItems(), theo); }
  function save() {
    var text = $('bc_input').value;
    if (text.length > MAX_STORE) { UI.memSet(KEY, JSON.stringify({ san: san, text: '' })); return; }
    UI.memSet(KEY, JSON.stringify({ san: san, text: text }));
  }
  function onInput() {
    clearTimeout(timer);
    timer = setTimeout(function () { render(); save(); }, 200);
  }
  function setSan(s) { san = s === 'shopee' ? 'shopee' : 'tiktok'; render(); save(); }
  function clear() { $('bc_input').value = ''; render(); UI.memDel(KEY); }

  async function onFile(file) {
    if (!file) return;
    try {
      var rows = BaoCao.rowsFromWorkbook(await Common.readWb(file));
      $('bc_input').value = Template.toTsv(rows);
      render(); save();
    } catch (e) {
      showErr('Không đọc được file "' + file.name + '": ' + (e && e.message ? e.message : e));
    }
  }

  /* ---------- xuất hình ---------- */
  function tenFile() { return 'Bao_cao_doi_soat_' + model.sanLabel + '_' + model.tuanNay.replace(/\//g, '-').replace(/\s+/g, '') + '.png'; }
  function chup() {
    if (typeof html2canvas !== 'function') return Promise.reject(new Error('Chưa tải được thư viện chụp hình (html2canvas). Kiểm tra mạng rồi tải lại trang.'));
    var ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    return ready.then(function () {
      return html2canvas($('bc_card'), { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
    }).then(function (canvas) {
      return new Promise(function (res, rej) {
        canvas.toBlob(function (b) { if (b) res(b); else rej(new Error('Không tạo được hình PNG.')); }, 'image/png');
      });
    });
  }
  function taiBlob(blob) {
    var a = document.createElement('a'), url = URL.createObjectURL(blob);
    a.href = url; a.download = tenFile();
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }
  async function taiPng() {
    if (!model) return;
    try { taiBlob(await chup()); UI.toast('Đã tải hình PNG.', 4000, 'ok'); }
    catch (e) { UI.alert('Chưa tạo được hình', esc(e && e.message ? e.message : e)); }
  }
  // Chép hình vào bộ nhớ tạm để dán thẳng Zalo; trình duyệt không hỗ trợ thì tải PNG.
  async function chepHinh() {
    if (!model) return;
    var blob;
    try { blob = await chup(); }
    catch (e) { UI.alert('Chưa tạo được hình', esc(e && e.message ? e.message : e)); return; }
    try {
      if (!navigator.clipboard || !navigator.clipboard.write || typeof ClipboardItem === 'undefined') throw new Error('no clipboard');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      UI.toast('Đã chép hình. Mở Zalo rồi dán (Ctrl+V).', 5000, 'ok');
    } catch (e) {
      taiBlob(blob);
      UI.toast('Trình duyệt không cho chép hình, đã tải file PNG về máy.', 6000);
    }
  }
  async function chepChu() {
    if (!model) return;
    var ok = await UI.copyText(BaoCao.banChu(model));
    if (ok) UI.toast('Đã chép bản chữ. Dán vào Zalo.', 4000, 'ok');
    else UI.alert('Chưa chép được', '<pre style="white-space:pre-wrap">' + esc(BaoCao.banChu(model)) + '</pre>');
  }

  function init() {
    try {
      var saved = JSON.parse(UI.memGet(KEY) || 'null');
      if (saved && typeof saved === 'object') {
        if (saved.san === 'shopee' || saved.san === 'tiktok') san = saved.san;
        if (typeof saved.text === 'string') $('bc_input').value = saved.text;
      }
    } catch (e) {}
    $('bc_input').addEventListener('input', onInput);
    $('bc_file').onchange = function (e) { var f = e.target.files[0]; e.target.value = ''; onFile(f); };
    render();
  }

  return { init: init, setSan: setSan, clear: clear, taiPng: taiPng, chepHinh: chepHinh, chepChu: chepChu, xuatDvvc: xuatDvvc,
           current: function () { return { doc: doc, model: model, san: san }; } };
})();
