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

  return { recs: recs, tuanGoiY: tuanGoiY, hoiTuan: hoiTuan, xuat: xuat, chep: chep };
})();
