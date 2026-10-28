/* =====================================================================
   SP — tab Shopee. Giao diện chuyển nguyên từ công cụ gốc; phần tính toán
   nằm ở js/core/shopee-core.js. Kho lấy từ kho chung (không còn ô tải file
   Kho, không còn Sổ mã localStorage).
   ===================================================================== */
var SP = (function () {
var _PFX = 'sp_';
function _$(id) {
  id = String(id);
  return document.getElementById(id.indexOf(_PFX) === 0 ? id : _PFX + id);
}
var esc = Common.escapeHtml, fmtNum = Common.fmtNum, fmtSize = Common.fmtSize, daysSince = Common.daysSince;
var parseShopName = ShopeeCore.parseShopName;
var filesA = [], filesB = [];
var shipChart = null, prodChart = null, provChart = null;
var resultMissA = [], resultMissB = [];
var searchStrA = "", searchStrB = "";
var pageA = 1, pageB = 1;
var running = false;
const pageSize = 10;
const SHOPEE_COLORS = ['#ee4d2d','#f69113','#1d9e75','#3b82f6','#a855f7','#b45309','#ef4444','#71717a'];

function progress(pct) {
  var pb = _$('pb'), pf = _$('pbFill');
  pb.style.display = 'block'; pf.style.width = pct + '%';
}
function yieldThread() { return new Promise(function(r){ setTimeout(r, 10); }); }

/* ---------- Quản lý danh sách file ---------- */
function zoneArr(z) { return z === 1 ? filesA : filesB; }

function editShopName(z, idx) {
  var arr = zoneArr(z);
  var oldName = arr[idx].customShopName || parseShopName(arr[idx].name);
  var newName = prompt('Nhập tên gian hàng:', oldName);
  if (newName !== null && newName.trim() !== "") { arr[idx].customShopName = newName.trim(); renderAll(); }
}
function removeFile(z, i, e) { e.stopPropagation(); zoneArr(z).splice(i, 1); renderAll(); }
function addFiles(z, newFiles) {
  var arr = zoneArr(z);
  Array.from(newFiles).forEach(function(f) {
    if (!arr.find(function(x){ return x.name === f.name; })) arr.push(f);
  });
  renderAll();
}
function renderFileList(listId, arr, z) {
  var el = _$(listId);
  if (!arr.length) { el.innerHTML = ''; return; }
  el.innerHTML = arr.map(function(f, i) {
    var shop = f.customShopName || parseShopName(f.name);
    return '<div class="file-item">' +
      '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' +
      '<span class="file-item-name">' + esc(f.name) + '</span>' +
      '<span class="file-item-shop" title="Bấm để đổi tên gian hàng" onclick="SP.editShopName(' + z + ',' + i + ')"><span class="emo" aria-hidden="true">🏷️</span> ' + esc(shop) + '</span>' +
      '<span class="file-item-type">' + fmtSize(f.size) + '</span>' +
      '<button class="file-item-del" onclick="SP.removeFile(' + z + ',' + i + ',event)">' +
        '<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
      '</button></div>';
  }).join('');
}
function renderAll() {
  renderFileList('list1', filesA, 1);
  renderFileList('list2', filesB, 2);
  _$('btnRun').disabled = running || !((filesA.length + filesB.length) > 0);
  var s = [];
  if (filesA.length) s.push(filesA.length + ' file đơn hàng');
  if (filesB.length) s.push(filesB.length + ' file khiếu nại');
  _$('fileSummary').textContent = s.length ? s.join(', ') + ' · kho lấy từ kho chung' : 'Chưa có file nào được chọn';
}

/* =================== ĐỐI SOÁT =================== */
async function runMatch() {
  if (running) return;
  running = true; renderAll();
  try { await runMatchInner(); }
  catch (err) {
    console.error(err);
    UI.alert('Không đối soát được', esc(err && err.message ? err.message : err) + '<br>Kho chung không thay đổi.');
    _$('pb').style.display = 'none';
  } finally { running = false; renderAll(); }
}

async function runMatchInner() {
  _$('results').hidden = true;
  KhoSync.hide('sp');
  progress(2);

  /* ---- Kho chung: đọc từ server ngay lúc bấm ---- */
  var khoRows = await KhoSync.loadForRun();
  if (!khoRows) { _$('pb').style.display = 'none'; return; }
  progress(20);

  /* ---- Đọc 2 loại file Shopee ---- */
  var allShopFiles = filesA.map(function(f){ return {f:f, kind:'don', loai:'Đơn hàng'}; })
             .concat(filesB.map(function(f){ return {f:f, kind:'khieunai', loai:'Khiếu nại'}; }));
  var books = [];
  for (var fi = 0; fi < allShopFiles.length; fi++) {
    var item = allShopFiles[fi];
    books.push({ wb: await Common.readWb(item.f), kind: item.kind, loai: item.loai, shop: item.f.customShopName || parseShopName(item.f.name) });
    await yieldThread();
    progress(20 + Math.round((fi+1)/allShopFiles.length*55));
  }

  // Đối soát với MỌI mã trong kho (cả mã đã khớp từ trước, để đối soát lại vẫn tính là khớp),
  // rồi tách ra: mã 'cho' cần chuyển sang 'khop', và "kho chưa có chứng từ" chỉ gồm mã 'cho'.
  var R = ShopeeCore.match({ files: books, khoItems: TrangThai.items(khoRows), skipRefundOnly: _$('chkSkipRefundOnly').checked });
  var T = TrangThai.sauDoiSoat(R, khoRows);
  var records = R.records, missA = R.missA, missB = T.missB, khoIds = R.khoIds, shopeeIds = R.shopeeIds;
  var matchCount = R.matchCount, rate = R.rate, refundOnlyCount = R.refundOnlyCount, noTidCount = R.noTidCount;

  resultMissA = missA; resultMissB = missB;
  pageA = 1; pageB = 1;
  _$('searchA').value = '';
  _$('searchB').value = '';
  searchStrA = ''; searchStrB = '';

  /* ---- Chỉ số ---- */
  _$('mTotal').textContent   = fmtNum(T.soCho);
  _$('mShopee').textContent  = fmtNum(shopeeIds.size);
  _$('mMatched').textContent = fmtNum(matchCount);
  _$('mRate').textContent    = rate + '%';
  _$('mMissA').textContent   = fmtNum(missA.length);
  _$('mMissB').textContent   = fmtNum(missB.length);
  _$('mRefundOnly').textContent = fmtNum(refundOnlyCount);

  var oldCount = missB.filter(function(m){ return (daysSince(m.date) || 0) >= 7; }).length;
  _$('mOld').textContent = fmtNum(oldCount);
  // Hàng thẻ tổng kết lớn phía trên (cùng số liệu với các thẻ chi tiết bên dưới)
  _$('sumMatched').textContent = fmtNum(matchCount);
  _$('sumMissA').textContent = fmtNum(missA.length);
  _$('sumMissB').textContent = fmtNum(missB.length);
  _$('sumOld').textContent = fmtNum(oldCount);
  _$('sumOldCard').classList.toggle('is-warn', oldCount > 0);

  _$('mValue').textContent = fmtNum(records.reduce(function(s,x){ return s+x.amt; }, 0)) + ' đ';

  function topOf(arr) {
    var m = {};
    arr.forEach(function(v){ if (v) m[v] = (m[v]||0)+1; });
    return Object.entries(m).sort(function(a,b){ return b[1]-a[1]; });
  }
  var shipSorted = topOf(records.map(function(x){ return x.dvvc; }));
  var prodSorted = topOf(records.map(function(x){ return x.prod ? x.prod.substring(0,50) : ''; }));
  var provSorted = topOf(records.map(function(x){ return x.prov; }));

  function fillTop(sorted, idVal, idSub, unit, emptyMsg) {
    if (sorted.length) {
      _$(idVal).textContent = sorted[0][0].substring(0,40);
      _$(idSub).textContent = fmtNum(sorted[0][1]) + ' ' + unit;
    } else {
      _$(idVal).textContent = '—';
      _$(idSub).textContent = emptyMsg;
    }
  }
  fillTop(shipSorted, 'mTopShip', 'mTopShipSub', 'đơn', 'file không có cột ĐVVC');
  fillTop(prodSorted, 'mTopProd', 'mTopProdSub', 'đơn', 'file không có cột sản phẩm');
  fillTop(provSorted, 'mTopProv', 'mTopProvSub', 'đơn', 'file không có cột Tỉnh/Thành');

  /* ---- Cảnh báo ---- */
  var warns = [];
  if (rate < 90) warns.push({ok:false, text:rate+'% mã Shopee đã về kho — dưới ngưỡng 90%, còn '+fmtNum(missA.length)+' mã chưa thấy hàng'});
  else warns.push({ok:true, text:rate+'% mã Shopee đã về kho — đạt yêu cầu'});
  if (missB.length) {
    warns.push({ok:false, text:fmtNum(missB.length)+' mã đã về kho nhưng Shopee chưa ghi nhận'
      + (oldCount ? ' — trong đó '+fmtNum(oldCount)+' mã tồn ≥ 7 ngày' : '')});
  }
  if (refundOnlyCount) warns.push({ok:true, text:'Đã loại '+fmtNum(refundOnlyCount)+' đơn hoàn tiền không có hàng trả về khỏi danh sách thất thoát'});
  if (noTidCount) warns.push({ok:false, text:fmtNum(noTidCount)+' dòng khiếu nại thiếu mã vận đơn trả — không đối soát được'});
  _$('warningArea').innerHTML = warns.map(function(w){
    return '<span class="chip '+(w.ok?'chip-ok':'chip-warn')+'">'+'<span class="emo" aria-hidden="true">'+(w.ok?'✓':'⚠')+'</span> '+esc(w.text)+'</span>';
  }).join('');

  /* ---- Thanh theo gian hàng ---- */
  var shopMap = {};
  records.forEach(function(x){
    if (!shopMap[x.shop]) shopMap[x.shop] = {match:0, miss:0};
    if (khoIds.has(x.cleanTid)) shopMap[x.shop].match++; else shopMap[x.shop].miss++;
  });
  _$('shopBars').innerHTML = Object.entries(shopMap)
    .sort(function(a,b){ return (b[1].match+b[1].miss)-(a[1].match+a[1].miss); })
    .map(function(e){
      var s=esc(e[0]), d=e[1], tot=d.match+d.miss||1;
      var mp=Math.round(d.match/tot*100), fp=100-mp;
      return '<div class="shop-bar-row"><div class="shop-bar-label" title="'+s+'">'+s+'</div>'+
        '<div class="shop-bar-track">'+
        (d.match?'<div class="shop-bar-match" style="width:'+mp+'%">'+d.match+'</div>':'')+
        (d.miss?'<div class="shop-bar-miss" style="width:'+fp+'%">'+d.miss+'</div>':'')+
        '</div><div class="shop-bar-end '+(d.miss?'miss':'ok')+'">'+
        (d.miss?'✗ '+d.miss:'✓')+'</div></div>';
    }).join('') || '<div style="color:var(--text-muted);font-size:13px;padding:8px 0">Không có dữ liệu</div>';

  /* ---- Biểu đồ ---- */
  var labelColor = Theme.chartColor();
  if (shipChart) shipChart.destroy();
  shipChart = null;
  if (shipSorted.length) {
    shipChart = new Chart(_$('chartShip'), {
      type: 'doughnut',
      data: { labels: shipSorted.map(function(d){ return d[0]+' ('+d[1]+')'; }),
              datasets: [{ data: shipSorted.map(function(d){ return d[1]; }), backgroundColor: SHOPEE_COLORS, borderWidth: 0 }] },
      options: { responsive:true, maintainAspectRatio:false, cutout:'65%',
                 plugins:{ legend:{ position:'right', labels:{ font:{size:13}, boxWidth:10, padding:6, color:labelColor } } } }
    });
  }
  function barChart(ref, sorted, color) {
    var top5 = sorted.slice(0,5);
    if (!top5.length) return null;
    return new Chart(_$(ref), {
      type: 'bar',
      data: { labels: top5.map(function(p){ return p[0].length>20 ? p[0].substring(0,20)+'…' : p[0]; }),
              datasets: [{ data: top5.map(function(p){ return p[1]; }), backgroundColor: color, borderRadius: 4, borderWidth: 0 }] },
      options: { indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}},
                 scales:{ x:{ticks:{font:{size:13},color:labelColor},grid:{display:false}},
                          y:{ticks:{font:{size:13},color:labelColor},grid:{display:false}} } }
    });
  }
  if (prodChart) prodChart.destroy();
  prodChart = barChart('chartProd', prodSorted, '#ee4d2d');
  if (provChart) provChart.destroy();
  provChart = barChart('chartProv', provSorted, '#1d9e75');

  /* ---- Thanh ngang: thanh toán + cơ cấu mã kho chưa khớp ---- */
  function horizBars(elId, sorted, total, colors) {
    var max = sorted.length ? sorted[0][1] : 1;
    _$(elId).innerHTML = sorted.map(function(d, i) {
      var l = esc(d[0]);
      return '<div class="bar-row"><div class="bar-label" title="'+l+'">'+l+'</div>'+
        '<div class="bar-track"><div class="bar-fill" style="width:'+Math.round(d[1]/max*100)+'%;background:'+colors[i%colors.length]+'"></div></div>'+
        '<div class="bar-count">'+d[1]+' <span class="bar-pct">('+Math.round(d[1]/(total||1)*100)+'%)</span></div></div>';
    }).join('') || '<div style="color:var(--text-muted);font-size:13px;padding:8px 0">Không có dữ liệu</div>';
  }
  horizBars('payChart', topOf(records.map(function(x){ return ShopeeCore.normalizePay(x.pay); })), records.length, SHOPEE_COLORS);
  horizBars('pfxChart', topOf(missB.map(function(m){ return ShopeeCore.prefixLabel(m.cleanId); })), missB.length, SHOPEE_COLORS);

  renderTableA(); renderTableB();
  progress(100);
  setTimeout(function(){ _$('pb').style.display='none'; }, 400);
  _$('empty').hidden = true;
  _$('results').hidden = false;
  _$('results').scrollIntoView({behavior:'smooth', block:'start'});

  /* ---- Kho chung: xoá mã Shopee đã khớp (sau khi người dùng đồng ý) ---- */
  await yieldThread();
  await KhoSync.offerKhop('sp', 'shopee', T.khop, T.daKhopTruoc.length);
}

function applyChartTheme() {
  var c = Theme.chartColor();
  if (shipChart) { shipChart.options.plugins.legend.labels.color = c; shipChart.update(); }
  [prodChart, provChart].forEach(function(ch) {
    if (ch) { ch.options.scales.x.ticks.color = c; ch.options.scales.y.ticks.color = c; ch.update(); }
  });
}

/* =================== BẢNG =================== */
function handleSearchA() { searchStrA = _$('searchA').value.toLowerCase().trim(); pageA=1; renderTableA(); }
function handleSearchB() { searchStrB = _$('searchB').value.toLowerCase().trim(); pageB=1; renderTableB(); }

function renderTableA() {
  var tbody = _$('tbodyA'), pager = _$('pagerA');
  var filtered = resultMissA.filter(function(r){
    return r.tid.toLowerCase().indexOf(searchStrA) >= 0 || r.shop.toLowerCase().indexOf(searchStrA) >= 0;
  });
  _$('cntA').textContent = '('+filtered.length+')';
  _$('btnExportA').style.display = resultMissA.length ? 'inline-flex' : 'none';
  if (!filtered.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="8"><span class="emo" aria-hidden="true">✅</span> Tất cả mã Shopee đều đã có hàng về kho</td></tr>';
    pager.innerHTML = ''; return;
  }
  var totalPages = Math.ceil(filtered.length/pageSize), start = (pageA-1)*pageSize;
  tbody.innerHTML = filtered.slice(start, start+pageSize).map(function(r, i) {
    return '<tr><td>'+(start+i+1)+'</td>'+
      '<td><span class="shop-tag">'+esc(r.shop)+'</span></td>'+
      '<td><span class="type-tag">'+(r.kind==='don'?'Đơn hàng':r.kind==='khieunai'?'Khiếu nại':'<span class="emo" aria-hidden="true">📂</span> Xuất lại')+'</span></td>'+
      '<td><code>'+esc(r.tid)+'</code></td>'+
      '<td><code style="opacity:.7">'+esc(r.oid||'—')+'</code></td>'+
      '<td style="max-width:220px;overflow:hidden;text-overflow:ellipsis">'+esc(r.prod||'—')+'</td>'+
      '<td>'+esc(r.prov||'—')+'</td>'+
      '<td>'+esc(r.kho||'—')+'</td></tr>';
  }).join('');
  UI.renderPager(pager, pageA, totalPages, function(p){ pageA=p; renderTableA(); });
}

function renderTableB() {
  var tbody = _$('tbodyB'), pager = _$('pagerB');
  var filtered = resultMissB.filter(function(m){ return m.id.toLowerCase().indexOf(searchStrB) >= 0; });
  _$('cntB').textContent = '('+filtered.length+')';
  if (!filtered.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="5"><span class="emo" aria-hidden="true">✅</span> Mọi mã trong kho đều có chứng từ Shopee</td></tr>';
    pager.innerHTML = ''; return;
  }
  var totalPages = Math.ceil(filtered.length/pageSize), start = (pageB-1)*pageSize;
  tbody.innerHTML = filtered.slice(start, start+pageSize).map(function(m, i) {
    var days = daysSince(m.date);
    var isOld = days !== null && days >= 7;
    return '<tr><td>'+(start+i+1)+'</td>'+
      '<td><code>'+esc(m.id)+'</code></td>'+
      '<td>'+(isOld ? '<span class="badge-old"><span class="emo" aria-hidden="true">📅</span> '+esc(m.date)+'</span>' : '<span class="badge-new"><span class="emo" aria-hidden="true">📅</span> '+esc(m.date)+'</span>')+'</td>'+
      '<td class="'+(isOld?'days-old':'days-new')+'">'+(days===null?'—':days+' ngày')+'</td>'+
      '<td>'+(isOld?'<span class="badge-red"><span class="emo" aria-hidden="true">⚠</span> Tồn lâu</span>':'<span class="badge-amber">Chưa có chứng từ</span>')+'</td></tr>';
  }).join('');
  UI.renderPager(pager, pageB, totalPages, function(p){ pageB=p; renderTableB(); });
}

function switchTab(paneId, btn) {
  document.querySelectorAll('#pane_sp .tab-pane').forEach(function(p){ p.classList.remove('active'); });
  document.querySelectorAll('#pane_sp .tab-btn').forEach(function(b){ b.classList.remove('active'); });
  _$(paneId).classList.add('active');
  btn.classList.add('active');
}

/* =================== XUẤT EXCEL =================== */
// "Sàn báo, kho chưa nhận" -> đúng bộ cột của file mẫu đơn thiếu.
function exportExcelA() {
  if (!resultMissA.length) { alert('Không có mã nào để xuất!'); return; }
  var recs = resultMissA.map(function(r) {
    return { tid: r.tid, shop: r.shop, typeLabel: ShopeeCore.typeLabel(r), prod: r.prod, variant: r.variant };
  });
  UI.downloadWb(Template.buildExportWorkbook('shopee', recs, new Date()),
    'Shopee_chua_ve_kho_'+new Date().toISOString().slice(0,10)+'.xlsx');
}
function exportExcelB() {
  if (!resultMissB.length) { alert('Không có mã nào để xuất!'); return; }
  var rows = resultMissB.map(function(m, i) {
    var days = daysSince(m.date);
    return { 'STT': i+1, 'Mã vận đơn': m.id,
             'Ngày đối soát': m.date, 'Số ngày tồn': days !== null ? days : '',
             'Trạng thái': (days !== null && days >= 7) ? '⚠ Tồn lâu (≥7 ngày)' : 'Chưa có chứng từ Shopee' };
  });
  var ws = XLSX.utils.json_to_sheet(rows);
  Common.forceTextCol(ws, 1);
  ws['!cols'] = [{wch:6},{wch:24},{wch:16},{wch:13},{wch:30}];
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Kho_chua_chung_tu_Shopee');
  UI.downloadWb(wb, 'Kho_chua_co_chung_tu_shopee_'+new Date().toISOString().slice(0,10)+'.xlsx');
}
function downloadTemplate() {
  UI.downloadWb(Template.buildTemplateWorkbook('shopee', new Date()), Template.templateFileName('shopee'));
}

function init() {
  UI.setupDropZone(_$('zone1'), _$('inp1'), function (fs) { addFiles(1, fs); });
  UI.setupDropZone(_$('zone2'), _$('inp2'), function (fs) { addFiles(2, fs); });
  renderAll();
}

return { init: init, renderAll: renderAll, runMatch: runMatch, switchTab: switchTab, exportExcelA: exportExcelA, exportExcelB: exportExcelB,
         downloadTemplate: downloadTemplate, handleSearchA: handleSearchA, handleSearchB: handleSearchB,
         removeFile: removeFile, editShopName: editShopName, applyChartTheme: applyChartTheme };
})();
