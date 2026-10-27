/* =====================================================================
   TT — tab TikTok. Giao diện chuyển nguyên từ công cụ gốc; phần tính toán
   nằm ở js/core/tiktok-core.js. Kho lấy từ kho chung.
   ===================================================================== */
var TT = (function () {
var _PFX = 'tt_';
function _$(id) {
  id = String(id);
  return document.getElementById(id.indexOf(_PFX) === 0 ? id : _PFX + id);
}
var esc = Common.escapeHtml, fmtNum = Common.fmtNum, fmtSize = Common.fmtSize, daysSince = Common.daysSince;
var parseShopName = TikTokCore.parseShopName, parseFileType = TikTokCore.parseFileType;
var filesA = [];
var shipChart = null, prodChart = null;
var resultMissA = [], resultMissB = [], resultFiltered = [];
var searchStrA = "", searchStrB = "";
var pageA = 1, pageB = 1;
var running = false;
const pageSize = 10;

function progress(pct) {
  var pb = _$('pb'), pf = _$('pbFill');
  pb.style.display = 'block'; pf.style.width = pct + '%';
}
function yieldThread() { return new Promise(resolve => setTimeout(resolve, 10)); }

function editShopName(idx) {
  const oldName = filesA[idx].customShopName || parseShopName(filesA[idx].name);
  const newName = prompt('Nhập tên gian hàng mới:', oldName);
  if (newName !== null && newName.trim() !== "") {
    filesA[idx].customShopName = newName.trim();
    renderAll();
  }
}

function renderFileList(listId, arr) {
  var el = _$(listId);
  if (!arr.length) { el.innerHTML = ''; return; }
  el.innerHTML = arr.map(function(f, i) {
    var shop = f.customShopName || parseShopName(f.name);
    var ft = parseFileType(f.name);
    var type = ft === 'giao' ? 'Giao KTC' : ft === 'exported' ? 'Xuất lại' : 'Trả hàng';
    return '<div class="file-item">' +
      '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' +
      '<span class="file-item-name">' + esc(f.name) + '</span>' +
      '<span class="file-item-shop" title="Bấm để đổi tên gian hàng" onclick="TT.editShopName(' + i + ')"><span class="emo" aria-hidden="true">🏷️</span> ' + esc(shop) + '</span><span class="file-item-type">' + type + '</span>' +
      '<span class="file-item-type">' + fmtSize(f.size) + '</span>' +
      '<button class="file-item-del" onclick="TT.removeFile(' + i + ',event)">' +
        '<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
      '</button></div>';
  }).join('');
}

function removeFile(i, e) {
  e.stopPropagation();
  filesA.splice(i, 1);
  renderAll();
}

function addFiles(newFiles) {
  Array.from(newFiles).forEach(function(f) { if (!filesA.find(function(x){return x.name===f.name;})) filesA.push(f); });
  renderAll();
}

function renderAll() {
  renderFileList('list1', filesA);
  _$('btnRun').disabled = running || !(filesA.length > 0);
  _$('fileSummary').textContent = filesA.length ? filesA.length + ' file TikTok · kho lấy từ kho chung' : 'Chưa có file nào được chọn';
}

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
  KhoSync.hide('tt');
  progress(2);

  var khoItems = await KhoSync.loadForRun();
  if (!khoItems) { _$('pb').style.display = 'none'; return; }
  progress(20);

  var filterOther = _$('chkFilterOther').checked; // T2
  var books = [];
  for (var fi = 0; fi < filesA.length; fi++) {
    var f = filesA[fi];
    books.push({ wb: await Common.readWb(f), shop: f.customShopName || parseShopName(f.name), ftype: parseFileType(f.name) });
    await yieldThread();
    progress(20 + Math.round((fi+1)/filesA.length*55));
  }

  var R = TikTokCore.match({ files: books, khoItems: khoItems, filterOther: filterOther });
  var tikTokRecords = R.records, missA = R.missA, missB = R.missB, doiSoatIds = R.khoIds, cleanTikTokIds = R.tikTokIds;
  var filteredIds = R.filteredIds, matchCount = R.matchCount, rate = R.rate;
  var colors = ['#ff0050','#00f2fe','#10b981','#3b82f6','#f59e0b','#ef4444','#71717a','#a855f7'];

  resultMissA = missA;
  resultMissB = missB;
  resultFiltered = R.filtered;
  pageA = 1; pageB = 1;
  _$('searchA').value = '';
  _$('searchB').value = '';
  searchStrA = ''; searchStrB = '';

  // Điền số liệu
  _$('mTotal').textContent = fmtNum(doiSoatIds.size);
  _$('mTikTok').textContent = fmtNum(cleanTikTokIds.size);
  _$('mMatched').textContent = fmtNum(matchCount);
  _$('mRate').textContent = rate + '%';
  _$('mMissA').textContent = fmtNum(missA.length);
  _$('mMissB').textContent = fmtNum(missB.length);

  var oldCountAll = missB.filter(function(m){ return (daysSince(m.date) || 0) >= 7; }).length;
  _$('mOld').textContent = fmtNum(oldCountAll);
  // Hàng thẻ tổng kết lớn phía trên (cùng số liệu với các thẻ chi tiết bên dưới)
  _$('sumMatched').textContent = fmtNum(matchCount);
  _$('sumMissA').textContent = fmtNum(missA.length);
  _$('sumMissB').textContent = fmtNum(missB.length);
  _$('sumOld').textContent = fmtNum(oldCountAll);
  _$('sumOldCard').classList.toggle('is-warn', oldCountAll > 0);

  _$('mFiltered').textContent = fmtNum(filteredIds.size);
  _$('mFilteredSub').textContent = filterOther
    ? 'SPXVN + GY… (đã loại, vẫn giữ trong kho)' : 'bộ lọc đang TẮT';

  var totalRefund = tikTokRecords.reduce(function(s,r){return s+r.refund;}, 0);
  _$('mRefund').textContent = fmtNum(totalRefund) + ' đ';

  // T8: Tỉnh/Thành trả nhiều nhất
  var provMap = {};
  tikTokRecords.forEach(function(r){ if (r.prov) provMap[r.prov] = (provMap[r.prov]||0)+1; });
  var provSorted = Object.entries(provMap).sort(function(a,b){return b[1]-a[1];});
  if (provSorted.length) {
    _$('mTopProv').textContent = provSorted[0][0];
    _$('mTopProvSub').textContent = fmtNum(provSorted[0][1]) + ' đơn trả';
  } else {
    _$('mTopProv').textContent = '—';
    _$('mTopProvSub').textContent = 'file không có cột Province';
  }

  // T7: file Trả hàng không có cột ĐVVC -> bỏ hẳn khỏi biểu đồ
  var shipMap = {};
  tikTokRecords.forEach(function(r){ if (r.ship) shipMap[r.ship] = (shipMap[r.ship]||0)+1; });
  var shipSorted = Object.entries(shipMap).sort(function(a,b){return b[1]-a[1];});
  if (shipSorted.length) {
    _$('mTopShip').textContent = shipSorted[0][0];
    _$('mTopShipSub').textContent = fmtNum(shipSorted[0][1]) + ' đơn trả';
  } else { _$('mTopShip').textContent = '—'; _$('mTopShipSub').textContent = ''; }

  var prodMap = {};
  tikTokRecords.forEach(function(r){if(r.prod){var k=r.prod.substring(0,50); prodMap[k]=(prodMap[k]||0)+1;}});
  var prodSorted = Object.entries(prodMap).sort(function(a,b){return b[1]-a[1];});
  if (prodSorted.length) {
    _$('mTopProd').textContent = prodSorted[0][0].substring(0,36)+'...';
    _$('mTopProdSub').textContent = fmtNum(prodSorted[0][1]) + ' đơn hoàn';
  } else { _$('mTopProd').textContent = '—'; _$('mTopProdSub').textContent = ''; }

  var warns = [];
  if (rate < 90) warns.push({ok:false, text:rate+'% mã TikTok đã có ở Kho — dưới ngưỡng 90%, còn '+fmtNum(missA.length)+' mã chưa thấy hàng về'});
  else warns.push({ok:true, text:rate+'% mã TikTok đã có hàng về Kho — đạt yêu cầu'});
  if (filterOther && filteredIds.size) warns.push({ok:true, text:'Đã lọc '+fmtNum(filteredIds.size)+' mã không thuộc TikTok (SPXVN / GY…) khỏi đối soát — các mã này vẫn giữ trong kho chung'});
  else if (!filterOther) warns.push({ok:false, text:'Bộ lọc mã sàn khác đang TẮT — kho chung có thể lẫn hàng trả Shopee'});
  if (missA.length > 0) {
    var shopMissMap = {};
    missA.forEach(function(r){shopMissMap[r.shop]=(shopMissMap[r.shop]||0)+1;});
    var worst = Object.entries(shopMissMap).sort(function(a,b){return b[1]-a[1];})[0];
    if (worst) warns.push({ok:false, text:'Gian "'+worst[0]+'" lệch lớn nhất: '+worst[1]+' mã chưa tìm thấy trong kho'});
  }
  if (missB.length > 0) {
    var oldCount = missB.filter(function(m){ return (daysSince(m.date)||0) >= 7; }).length;
    warns.push({ok:false, text:'Có '+fmtNum(missB.length)+' mã kho chưa khớp chứng từ TikTok' + (oldCount > 0 ? ' — trong đó '+oldCount+' mã tồn trên 7 ngày' : '')});
  }
  _$('warningArea').innerHTML = warns.map(function(w){
    return '<span class="chip '+(w.ok?'chip-ok':'chip-warn')+'">'+'<span class="emo" aria-hidden="true">'+(w.ok?'✓':'⚠')+'</span> '+esc(w.text)+'</span>';
  }).join('');

  // Biểu đồ Shop
  var shopMap2 = {};
  tikTokRecords.forEach(function(r){
    if (!shopMap2[r.shop]) shopMap2[r.shop]={match:0,miss:0};
    if (doiSoatIds.has(r.cleanTid)) shopMap2[r.shop].match++; else shopMap2[r.shop].miss++;
  });
  var shopEntries = Object.entries(shopMap2).sort(function(a,b){return(b[1].match+b[1].miss)-(a[1].match+a[1].miss);});
  _$('shopBars').innerHTML = shopEntries.map(function(e){
    var s=esc(e[0]), d=e[1], tot=d.match+d.miss||1;
    var mp=Math.round(d.match/tot*100), fp=100-mp;
    return '<div class="shop-bar-row"><div class="shop-bar-label" title="'+s+'">'+s+'</div>'+
      '<div class="shop-bar-track">'+
      (d.match?'<div class="shop-bar-match" style="width:'+mp+'%">'+d.match+'</div>':'')+
      (d.miss?'<div class="shop-bar-miss" style="width:'+fp+'%">'+d.miss+'</div>':'')+
      '</div><div class="shop-bar-end '+(d.miss?'miss':'ok')+'">'+
      (d.miss?'✗ '+d.miss:'✓')+'</div></div>';
  }).join('') || '<div style="color:var(--text-muted);font-size:13px;padding:8px 0">Không có dữ liệu</div>';

  const labelColor = Theme.chartColor();

  if (shipChart) shipChart.destroy();
  shipChart = null;
  if (shipSorted.length) {
    shipChart = new Chart(_$('chartShip'), {
      type: 'doughnut',
      data: {
        labels: shipSorted.map(function(d){return d[0]+' ('+d[1]+')';}),
        datasets: [{data: shipSorted.map(function(d){return d[1];}), backgroundColor:colors, borderWidth:0}]
      },
      options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'right', labels:{font:{size:13,family:'Plus Jakarta Sans'},boxWidth:10,padding:6,color:labelColor}}}, cutout:'65%' }
    });
  }

  if (prodChart) prodChart.destroy();
  prodChart = null;
  var top5 = prodSorted.slice(0,5);
  if (top5.length) {
    prodChart = new Chart(_$('chartProd'), {
      type: 'bar',
      data: {
        labels: top5.map(function(p){return p[0].length>20?p[0].substring(0,20)+'…':p[0];}),
        datasets: [{data:top5.map(function(p){return p[1];}), backgroundColor:'#ff0050', borderRadius:4, borderWidth:0}]
      },
      options: { indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{x:{ticks:{font:{size:13,family:'Plus Jakarta Sans'},color:labelColor},grid:{display:false}},y:{ticks:{font:{size:13,family:'Plus Jakarta Sans'},color:labelColor},grid:{display:false}}} }
    });
  }

  var payMap = {};
  tikTokRecords.forEach(function(r){var p=TikTokCore.normalizePay(r.pay); payMap[p]=(payMap[p]||0)+1;}); // T6
  var paySorted = Object.entries(payMap).sort(function(a,b){return b[1]-a[1];});
  var payMax = paySorted.length?paySorted[0][1]:1;
  var payColors = ['#ff0050','#00f2fe','#10b981','#3b82f6','#f59e0b'];
  _$('payChart').innerHTML = paySorted.map(function(d,i){
    var l = esc(d[0]);
    return '<div class="bar-row"><div class="bar-label" title="'+l+'">'+l+'</div>'+
      '<div class="bar-track"><div class="bar-fill" style="width:'+Math.round(d[1]/payMax*100)+'%;background:'+payColors[i%payColors.length]+'"></div></div>'+
      '<div class="bar-count">'+d[1]+' <span class="bar-pct">('+Math.round(d[1]/(tikTokRecords.length||1)*100)+'%)</span></div></div>';
  }).join('');

  renderTableA();
  renderTableB();
  progress(100);
  setTimeout(function(){_$('pb').style.display='none';},400);
  _$('empty').hidden = true;
  _$('results').hidden = false;
  _$('results').scrollIntoView({behavior:'smooth',block:'start'});

  /* Kho chung: chỉ xoá mã TikTok đã khớp; mã bị lọc (SPXVN/GY) không nằm trong R.toRemove. */
  await yieldThread();
  await KhoSync.offerRemoval('tt', 'tiktok', R.toRemove);
}

function handleSearchA() { searchStrA = _$('searchA').value.toLowerCase().trim(); pageA=1; renderTableA(); }
function handleSearchB() { searchStrB = _$('searchB').value.toLowerCase().trim(); pageB=1; renderTableB(); }

function renderTableA() {
  const tbody = _$('tbodyA');
  const pager = _$('pagerA');
  const filtered = resultMissA.filter(r => r.tid.toLowerCase().includes(searchStrA) || r.shop.toLowerCase().includes(searchStrA));
  _$('cntA').textContent = '('+filtered.length+')';
  const btnExA = _$('btnExportA');
  btnExA.style.display = resultMissA.length > 0 ? 'inline-flex' : 'none';
  if (!filtered.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="5"><span class="emo" aria-hidden="true">✅</span> Tất cả mã vận đơn đều khớp dữ liệu Kho</td></tr>';
    pager.innerHTML = ''; return;
  }
  const totalPages = Math.ceil(filtered.length/pageSize);
  const startIdx = (pageA-1)*pageSize;
  const pageData = filtered.slice(startIdx, startIdx+pageSize);
  tbody.innerHTML = pageData.map(function(r,i){
    return '<tr><td>'+(startIdx+i+1)+'</td>'+
      '<td><span class="shop-tag">'+esc(r.shop)+'</span></td>'+
      '<td><span class="type-tag">'+(r.type==='giao'?'Giao KTC':r.type==='exported'?'<span class="emo" aria-hidden="true">📂</span> Xuất lại':'Trả hàng')+'</span></td>'+
      '<td><code>'+esc(r.tid)+'</code></td>'+
      '<td>'+esc(r.kho||'—')+'</td></tr>';
  }).join('');
  UI.renderPager(pager, pageA, totalPages, function(p){pageA=p; renderTableA();});
}

function renderTableB() {
  const tbody = _$('tbodyB');
  const pager = _$('pagerB');
  const filtered = resultMissB.filter(m => m.id.toLowerCase().includes(searchStrB));
  _$('cntB').textContent = '('+filtered.length+')';
  if (!filtered.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="5"><span class="emo" aria-hidden="true">✅</span> Tất cả mã đối soát đều có chứng từ TikTok</td></tr>';
    pager.innerHTML = ''; return;
  }
  const totalPages = Math.ceil(filtered.length/pageSize);
  const startIdx = (pageB-1)*pageSize;
  const pageData = filtered.slice(startIdx, startIdx+pageSize);
  tbody.innerHTML = pageData.map(function(m, i){
    var days = daysSince(m.date);
    var daysLabel = days === null ? '—' : days + ' ngày';
    var isOld = days !== null && days >= 7;
    return '<tr>'+
      '<td>'+(startIdx+i+1)+'</td>'+
      '<td><code>'+esc(m.id)+'</code></td>'+
      '<td>'+(isOld ? '<span class="badge-old"><span class="emo" aria-hidden="true">📅</span> '+esc(m.date)+'</span>' : '<span class="badge-new"><span class="emo" aria-hidden="true">📅</span> '+esc(m.date)+'</span>')+'</td>'+
      '<td class="'+(isOld?'days-old':'days-new')+'">'+daysLabel+'</td>'+
      '<td>'+(isOld?'<span class="badge-red"><span class="emo" aria-hidden="true">⚠</span> Tồn lâu</span>':'<span class="badge-amber">Chưa có chứng từ</span>')+'</td>'+
    '</tr>';
  }).join('');
  UI.renderPager(pager, pageB, totalPages, function(p){pageB=p; renderTableB();});
}

// "Sàn báo, kho chưa nhận" -> đúng bộ cột của file mẫu đơn thiếu.
function exportExcelA() {
  if (!resultMissA.length) { alert('Không có mã nào để xuất!'); return; }
  var recs = resultMissA.map(function(r) {
    return { tid: r.tid, shop: r.shop, typeLabel: TikTokCore.typeLabel(r), prod: r.prod, variant: r.variant };
  });
  UI.downloadWb(Template.buildExportWorkbook('tiktok', recs, new Date()),
    'TikTok_chua_co_trong_kho_'+new Date().toISOString().slice(0,10)+'.xlsx');
}

function exportExcelB() {
  // Ghi cả mã đã bị bộ lọc loại khỏi đối soát TikTok (vẫn nằm trong kho chung).
  var all = resultMissB.concat(resultFiltered);
  if (!all.length) { alert('Không có mã nào để xuất!'); return; }
  var rows = all.map(function(m, i){
    var days = daysSince(m.date);
    return {
      'STT': i+1,
      'Mã vận đơn': m.id,
      'Ngày đối soát': m.date,
      'Số ngày tồn': days !== null ? days : '',
      'Trạng thái': days !== null && days >= 7 ? '⚠ Tồn lâu (≥7 ngày)' : 'Chưa có chứng từ TikTok'
    };
  });
  var ws = XLSX.utils.json_to_sheet(rows);
  Common.forceTextCol(ws, 1);
  ws['!cols'] = [{wch:6},{wch:28},{wch:16},{wch:13},{wch:32}];
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Kho_Chua_Chung_Tu_TikTok');
  UI.downloadWb(wb, 'Kho_chua_co_chung_tu_tiktok_'+new Date().toISOString().slice(0,10)+'.xlsx');
}

function downloadTemplate() {
  UI.downloadWb(Template.buildTemplateWorkbook('tiktok', new Date()), Template.templateFileName('tiktok'));
}

function switchTab(paneId, btn) {
  document.querySelectorAll('#pane_tt .tab-pane').forEach(function(p){p.classList.remove('active');});
  document.querySelectorAll('#pane_tt .tab-btn').forEach(function(b){b.classList.remove('active');});
  _$(paneId).classList.add('active');
  btn.classList.add('active');
}

function applyChartTheme() {
  var c = Theme.chartColor();
  if (shipChart) { shipChart.options.plugins.legend.labels.color = c; shipChart.update(); }
  if (prodChart) { prodChart.options.scales.x.ticks.color = c; prodChart.options.scales.y.ticks.color = c; prodChart.update(); }
}

function init() {
  UI.setupDropZone(_$('zone1'), _$('inp1'), addFiles);
  renderAll();
}

return { init: init, renderAll: renderAll, runMatch: runMatch, switchTab: switchTab, exportExcelA: exportExcelA, exportExcelB: exportExcelB,
         downloadTemplate: downloadTemplate, handleSearchA: handleSearchA, handleSearchB: handleSearchB,
         removeFile: removeFile, editShopName: editShopName, applyChartTheme: applyChartTheme };
})();
