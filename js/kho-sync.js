/* =====================================================================
   KhoSync — nối tab Shopee/TikTok với kho chung:
   1. loadForRun: tải kho chung mới nhất ngay khi bấm "Tiến hành đối soát".
   2. offerRemoval: sau khi có kết quả, hỏi "Sẽ xoá N mã đã khớp khỏi kho
      chung. Đồng ý?" rồi gửi DANH SÁCH MÃ CẦN XOÁ (không gửi cả kho), nên
      người khác tải thêm mã cùng lúc cũng không bị đè.
   ===================================================================== */
var KhoSync = (function () {
  var esc = Common.escapeHtml, fmtNum = Common.fmtNum;
  var SAN_LABEL = { shopee: 'Shopee', tiktok: 'TikTok' };

  function loadForRun() {
    if (!Api.configured()) {
      UI.alert('Chưa cấu hình máy chủ kho chung', UI.guideHtml());
      return Promise.resolve(null);
    }
    return Kho.refresh().then(function () { return Kho.items(); }, function (err) {
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

  function offerRemoval(pfx, san, codes) {
    var label = SAN_LABEL[san];
    if (!codes.length) {
      banner(pfx, 'done', 'Không có mã ' + label + ' nào khớp với kho chung, kho giữ nguyên ' + fmtNum(Kho.items().length) + ' mã.');
      return Promise.resolve();
    }
    return UI.confirm('Cập nhật kho chung',
      'Sẽ xoá <b>' + fmtNum(codes.length) + '</b> mã đã khớp khỏi kho chung. Đồng ý?' +
      '<br><span style="font-size:12px">Chỉ xoá mã có trong chứng từ ' + label + ' vừa nạp. Mã kho còn lệch giữ nguyên với ngày đối soát cũ.</span>',
      'Xoá ' + fmtNum(codes.length) + ' mã').then(function (ok) {
      if (!ok) return pending(pfx, san, codes, 'Chưa ghi kết quả: ' + fmtNum(codes.length) + ' mã đã khớp ' + label + ' vẫn còn trong kho chung.');
      return send(pfx, san, codes);
    });
  }

  function pending(pfx, san, codes, msg) {
    banner(pfx, 'pending', esc(msg), { label: 'Xoá ' + fmtNum(codes.length) + ' mã đã khớp khỏi kho', fn: function () { send(pfx, san, codes); } });
  }

  function send(pfx, san, codes) {
    var nguoi = UI.ensureName();
    if (!nguoi) return Promise.resolve(pending(pfx, san, codes, 'Cần nhập tên người thực hiện để ghi lịch sử. Kho chung chưa thay đổi.'));
    banner(pfx, 'pending', 'Đang ghi kết quả vào kho chung…');
    return Api.reconcile(nguoi, san, codes).then(function (st) {
      Kho.apply(st);
      var x = st.ketQua ? st.ketQua.xoa : codes.length;
      var msg = 'Đã xoá ' + fmtNum(x) + ' mã đã khớp ' + SAN_LABEL[san] + ' khỏi kho chung. Kho còn ' + fmtNum(st.info.soMa) + ' mã.';
      if (x < codes.length) msg += ' (' + fmtNum(codes.length - x) + ' mã đã được người khác xoá trước đó.)';
      banner(pfx, 'done', esc(msg));
      UI.toast('✓ ' + msg);
    }, function (err) {
      pending(pfx, san, codes, 'Chưa ghi được kết quả vào kho chung: ' + err.message);
    });
  }

  return { loadForRun: loadForRun, offerRemoval: offerRemoval, hide: hide };
})();
