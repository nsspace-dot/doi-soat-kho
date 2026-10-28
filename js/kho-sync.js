/* =====================================================================
   KhoSync — nối tab Shopee/TikTok với kho chung:
   1. loadForRun: tải kho chung mới nhất ngay khi bấm "Tiến hành đối soát".
   2. offerKhop: sau khi có kết quả, hỏi "Sẽ chuyển N mã sang Đã khớp.
      Đồng ý?" rồi gửi DANH SÁCH MÃ ĐÃ KHỚP kèm gian hàng / loại file (không
      gửi cả kho), nên người khác tải thêm mã cùng lúc cũng không bị đè.
      Mã không bị xoá khỏi kho; chỉ đổi trạng thái 'cho' -> 'khop'.
   ===================================================================== */
var KhoSync = (function () {
  var esc = Common.escapeHtml, fmtNum = Common.fmtNum;
  var SAN_LABEL = { shopee: 'Shopee', tiktok: 'TikTok' };

  function loadForRun() {
    if (!Api.configured()) {
      UI.alert('Chưa cấu hình máy chủ kho chung', UI.guideHtml());
      return Promise.resolve(null);
    }
    return Kho.refresh().then(function () { return Kho.rows(); }, function (err) {
      UI.alert('Không đọc được kho chung', esc(err.message) + '<br><br>Chưa đối soát, kho chung không thay đổi. Các file bạn đã chọn vẫn còn, bấm lại khi mạng ổn.');
      return null;
    });
  }

  function banner(pfx, kind, html, retry) {
    var box = document.getElementById(pfx + '_syncBox');
    box.className = 'sync-banner show ' + kind;
    box.innerHTML = '<span>' + html + '</span>';
    if (retry) {
      var b = document.createElement('button');
      b.className = 'btn-export';
      b.textContent = retry.label;
      b.onclick = retry.fn;
      box.appendChild(b);
    }
  }
  function hide(pfx) {
    var box = document.getElementById(pfx + '_syncBox');
    box.className = 'sync-banner';
    box.innerHTML = '';
  }

  /* items: [{ ma, gian, loai }] — mã 'cho' khớp chứng từ của sàn đang chạy.
     daKhopTruoc: số mã trong chứng từ đã 'khop' từ trước (không gửi lại). */
  function offerKhop(pfx, san, items, daKhopTruoc) {
    var label = SAN_LABEL[san];
    var truoc = daKhopTruoc ? ' ' + fmtNum(daKhopTruoc) + ' mã khác đã khớp từ trước, giữ nguyên.' : '';
    if (!items.length) {
      banner(pfx, 'done', esc('Không có mã Chờ đối soát nào khớp chứng từ ' + label + '; kho chung không đổi.' + truoc));
      return Promise.resolve();
    }
    return UI.confirm('Cập nhật kho chung',
      'Sẽ chuyển <b>' + fmtNum(items.length) + '</b> mã sang Đã khớp. Đồng ý?' +
      '<br><span style="font-size:13px">Chỉ đổi trạng thái mã có trong chứng từ ' + label + ' vừa nạp; mã vẫn nằm trong kho (xem ở tab Đã đối soát). Mã kho còn lệch giữ nguyên với ngày đối soát cũ.' + esc(truoc) + '</span>',
      'Chuyển ' + fmtNum(items.length) + ' mã').then(function (ok) {
      if (!ok) return pending(pfx, san, items, 'Chưa ghi kết quả: ' + fmtNum(items.length) + ' mã khớp ' + label + ' vẫn đang Chờ đối soát.');
      return send(pfx, san, items);
    });
  }

  function pending(pfx, san, items, msg) {
    banner(pfx, 'pending', esc(msg), { label: 'Chuyển ' + fmtNum(items.length) + ' mã sang Đã khớp', fn: function () { send(pfx, san, items); } });
  }

  function send(pfx, san, items) {
    banner(pfx, 'pending', 'Đang ghi kết quả vào kho chung…');
    var payload = items.map(function (it) { return { ma: it.ma, gian: it.gian, loai: it.loai }; });
    return Api.reconcile(san, payload).then(function (st) {
      Kho.apply(st);
      var k = st.ketQua || {};
      var x = k.khop !== undefined ? k.khop : items.length;
      var msg = 'Đã chuyển ' + fmtNum(x) + ' mã ' + SAN_LABEL[san] + ' sang Đã khớp. Kho còn ' + fmtNum(st.info.soCho) + ' mã Chờ đối soát.';
      if (x < items.length) msg += ' (' + fmtNum(items.length - x) + ' mã đã được chuyển trước đó hoặc không còn trong kho.)';
      banner(pfx, 'done', esc(msg));
      UI.toast(msg, null, 'ok');
      document.dispatchEvent(new CustomEvent('kho-khop', { detail: { pfx: pfx, ngayKhop: k.ngayKhop } }));
    }, function (err) {
      pending(pfx, san, items, 'Chưa ghi được kết quả vào kho chung: ' + err.message);
    });
  }

  return { loadForRun: loadForRun, offerKhop: offerKhop, hide: hide };
})();
