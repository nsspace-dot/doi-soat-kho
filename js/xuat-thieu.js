/* =====================================================================
   XuatThieu — nút xuất / chép của danh sách "Sàn báo, kho chưa nhận",
   dùng chung cho tab Shopee và TikTok.
   Hỏi "Tuần đối soát" (điền sẵn theo khoảng ngày trong file, sửa được) rồi
   xuất Excel hoặc chép TSV đúng thứ tự cột của Google Sheet theo dõi.
   ===================================================================== */
var XuatThieu = (function () {
  var SAN = { shopee: 'Shopee', tiktok: 'TikTok' };
  var FILE = { shopee: 'Shopee_chua_ve_kho_', tiktok: 'TikTok_chua_co_trong_kho_' };
  var tuanDaNhap = {};   // nhớ tuần vừa nhập trong phiên làm việc, mỗi sàn một giá trị

  // Dòng kết quả đối soát -> dòng của bảng theo dõi.
  function recs(missA) {
    return (missA || []).map(function (r) {
      return { tid: r.tid, shop: r.shop, typeLabel: TrangThai.loaiCuaDong(r), prod: r.prod, variant: r.variant,
        kho: r.kho || NhanDien.CHUA_RO, khoNguon: r.khoNguon || '', time: r.time || '',
        dvvc: r.dvvcTen || NhanDien.CHUA_RO, dvvcNguon: r.dvvcNguon || '', lyDo: r.lyDo || '', oid: r.oid || '', week: r.week || '' };
    });
  }
  function tuanGoiY(san, times) { return tuanDaNhap[san] || NhanDien.tuanMacDinh(times); }

  function hoiTuan(san, times, okLabel) {
    return UI.prompt('Tuần đối soát',
      '<p>Ghi vào cột <b>Tuần đối soát</b> của mọi dòng. Đã điền sẵn theo khoảng ngày trong file ' + SAN[san] +
      ', sửa được (dạng <code>02/11 - 08/11</code>).</p>', tuanGoiY(san, times), okLabel)
      .then(function (t) { if (t) tuanDaNhap[san] = t; return t; });
  }

  async function xuat(san, missA, times) {
    if (!missA || !missA.length) { UI.toast('Không có mã nào để xuất.'); return; }
    var tuan = await hoiTuan(san, times, 'Xuất Excel');
    if (tuan === null) return;
    UI.downloadWb(Template.buildExportWorkbook(san, recs(missA), tuan), FILE[san] + new Date().toISOString().slice(0, 10) + '.xlsx');
  }

  async function chep(san, missA, times) {
    if (!missA || !missA.length) { UI.toast('Không có mã nào để chép.'); return; }
    var tuan = await hoiTuan(san, times, 'Chép bảng');
    if (tuan === null) return;
    var ok = await UI.copyText(Template.toTsv(Template.exportAoa(recs(missA), tuan)));
    if (ok) UI.toast('Đã chép ' + missA.length + ' dòng + tiêu đề. Dán (Ctrl+V) vào Google Sheets.', 5000, 'ok');
    else UI.alert('Chưa chép được', 'Trình duyệt không cho chép vào bộ nhớ tạm. Hãy dùng nút Xuất Excel.');
  }

  /* ---------- Đòi ĐVVC: file Excel + nút chép tin nhắn cho từng kho × ĐVVC ---------- */
  // Dòng kết quả đối soát -> dòng của file đòi ĐVVC.
  function dvvcItems(san, missA, times) {
    var tuan = tuanGoiY(san, times);
    return recs(missA).map(function (r) {
      return { ma: r.tid, dvvc: r.dvvc, dvvcNguon: r.dvvcNguon, gian: r.shop, loai: r.typeLabel, maDon: r.oid, sp: r.prod,
        lyDo: r.lyDo, tuan: r.week || tuan, kho: r.kho, khoNguon: r.khoNguon };
    });
  }
  // theo: 'kho' (mỗi kho 1 sheet) | 'dvvc' (mỗi ĐVVC 1 sheet)
  function xuatDvvc(tenSan, items, theo) {
    if (!items || !items.length) { UI.toast('Không có mã nào để xuất.'); return; }
    UI.downloadWb(DoiDvvc.buildWorkbook(items, theo), 'Doi_DVVC' + (theo === 'dvvc' ? '_theo_DVVC_' : '_') + tenSan + '_' + new Date().toISOString().slice(0, 10) + '.xlsx');
  }
  function doiDvvc(san, missA, times, theo) { xuatDvvc(SAN[san], dvvcItems(san, missA, times), theo); }

  // Vẽ khối "Tin nhắn đòi ĐVVC" vào box: mỗi kho × ĐVVC 1 dòng + nút "Chép tin nhắn".
  function veTinNhan(box, items) {
    var groups = DoiDvvc.nhom(items);
    box._groups = groups;
    box.hidden = !groups.length;
    if (!groups.length) { box.innerHTML = ''; return; }
    var esc = Common.escapeHtml, open = box.querySelector('details') && box.querySelector('details').open;
    box.innerHTML = '<details class="help dvvc-box"' + (open ? ' open' : '') + '><summary><span class="emo" aria-hidden="true">🚚</span> Tin nhắn đòi ĐVVC (' +
      groups.length + ' nhóm kho × ĐVVC)</summary><div class="help-body">' + groups.map(function (g, i) {
        return '<div class="dvvc-row"><span><b>KHO ' + esc(g.kho) + '</b> · ' + esc(g.dvvc) + ' · ' + g.items.length + ' kiện (' + g.giao +
          ' giao KTC, ' + g.tra + ' trả hàng)</span><button class="btn-export dvvc-copy" data-i="' + i + '"><span class="emo" aria-hidden="true">📋</span> Chép tin nhắn</button></div>';
      }).join('') + '</div></details>';
    if (!box._bound) {
      box._bound = true;
      box.addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('.dvvc-copy') : null;
        if (!b) return;
        var g = box._groups[+b.getAttribute('data-i')];
        UI.copyText(DoiDvvc.tinNhan(g)).then(function (ok) {
          if (ok) UI.toast('Đã chép tin nhắn [' + g.dvvc + '] KHO ' + g.kho + ' (' + g.items.length + ' kiện).', 4000, 'ok');
          else UI.alert('Chưa chép được', '<pre style="white-space:pre-wrap">' + esc(DoiDvvc.tinNhan(g)) + '</pre>');
        });
      });
    }
  }

  return { recs: recs, tuanGoiY: tuanGoiY, hoiTuan: hoiTuan, xuat: xuat, chep: chep,
           dvvcItems: dvvcItems, xuatDvvc: xuatDvvc, doiDvvc: doiDvvc, veTinNhan: veTinNhan };
})();
