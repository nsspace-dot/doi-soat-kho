/* =====================================================================
   DoiDvvc — file Excel + tin nhắn đòi ĐVVC hoàn trả kiện chưa về kho.
   Đầu vào: các đơn "sàn báo, kho chưa nhận" đã chuẩn hoá
     { ma, dvvc, dvvcNguon, gian, loai, maDon, sp, lyDo, tuan, kho, khoNguon }
   File gồm: "Tổng hợp" (kho × ĐVVC), mỗi kho 1 sheet (nhóm theo ĐVVC),
   "Tin nhắn" (mỗi ô 1 tin cho 1 kho × 1 ĐVVC). Không đụng DOM.
   ===================================================================== */
(function (root, factory) {
  var req = typeof require === 'function' ? require : null;
  var api = factory(root.Common || req('./common.js'), root.NhanDien || req('./nhan-dien.js'), root.BaoCao || req('./bao-cao.js'));
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DoiDvvc = api;
})(typeof self !== 'undefined' ? self : this, function (Common, NhanDien, BaoCao) {
  'use strict';

  var COT = ['STT', 'Mã vận đơn', 'ĐVVC', 'Gian', 'Loại', 'Mã đơn', 'Sản phẩm', 'Lý do', 'Tuần', 'Kho (thật/đoán)'];

  function chuan(items) {
    return (items || []).map(function (x) {
      var kho = String(x.kho || '').trim() || NhanDien.CHUA_RO;
      return { ma: String(x.ma || ''), dvvc: String(x.dvvc || '').trim() || NhanDien.CHUA_RO, dvvcNguon: x.dvvcNguon || '',
        gian: x.gian || '', loai: BaoCao.chuanLoai(x.loai), loaiGoc: x.loai || '', maDon: x.maDon || '', sp: x.sp || '',
        lyDo: x.lyDo || '', tuan: x.tuan || '', kho: kho,
        khoNguon: kho === NhanDien.CHUA_RO ? '' : (x.khoNguon === NhanDien.DOAN ? NhanDien.DOAN : NhanDien.FILE) };
    }).filter(function (x) { return x.ma; });
  }
  function khoNhan(x) { return x.kho === NhanDien.CHUA_RO ? 'chưa rõ' : (x.khoNguon === NhanDien.DOAN ? 'đoán' : 'thật'); }

  /* Nhóm kho × ĐVVC: [{ kho, dvvc, items, giao, tra }], kho theo thứ tự NVS, TSN, VL…, trong kho ĐVVC nhiều kiện trước. */
  function nhom(items) {
    var list = chuan(items), map = {}, out = [];
    list.forEach(function (x) {
      var k = x.kho + '\u0001' + x.dvvc;
      if (!map[k]) { map[k] = { kho: x.kho, dvvc: x.dvvc, items: [], giao: 0, tra: 0 }; out.push(map[k]); }
      map[k].items.push(x);
      if (x.loai === BaoCao.LOAI_GIAO) map[k].giao++; else if (x.loai === BaoCao.LOAI_TRA) map[k].tra++;
    });
    var thuTu = BaoCao.sapKho(out.map(function (g) { return g.kho; }).filter(function (k, i, a) { return a.indexOf(k) === i; }));
    return out.sort(function (a, b) {
      return (thuTu.indexOf(a.kho) - thuTu.indexOf(b.kho)) || (b.items.length - a.items.length) || a.dvvc.localeCompare(b.dvvc, 'vi');
    });
  }

  function tinNhan(g) {
    return '[' + g.dvvc + '] KHO ' + g.kho + ' – nhờ kiểm tra & hoàn trả ' + g.items.length + ' kiện chưa về kho (' +
      g.giao + ' giao không thành công, ' + g.tra + ' trả hàng):\n' + g.items.map(function (x) { return x.ma; }).join('\n');
  }

  function tenSheet(name, used) {
    var s = String(name).replace(/[\[\]:*?\/\\]/g, ' ').trim().slice(0, 28) || 'Kho', t = s, i = 2;
    while (used[t.toLowerCase()]) t = s + ' ' + (i++);
    used[t.toLowerCase()] = true;
    return t;
  }

  // theo: 'kho' (mặc định, mỗi kho 1 sheet) hoặc 'dvvc' (mỗi ĐVVC 1 sheet, trong sheet nhóm theo kho).
  function buildWorkbook(items, theo) {
    var XL = Common.xlsx(), groups = nhom(items), wb = XL.utils.book_new();
    var khos = [], dvvcs = [], all = [];
    groups.forEach(function (g) {
      if (khos.indexOf(g.kho) < 0) khos.push(g.kho);
      if (dvvcs.indexOf(g.dvvc) < 0) dvvcs.push(g.dvvc);
      all = all.concat(g.items);
    });
    dvvcs.sort(function (a, b) { return (a === NhanDien.CHUA_RO) - (b === NhanDien.CHUA_RO) || a.localeCompare(b, 'vi'); });
    function so(kho, dv) { var g = groups.find(function (x) { return x.kho === kho && x.dvvc === dv; }); return g ? g.items.length : 0; }

    /* ---- Tổng hợp ---- */
    var aoa = [['KHO \\ ĐVVC'].concat(dvvcs, ['Tổng'])];
    khos.forEach(function (k) {
      var row = dvvcs.map(function (d) { return so(k, d); });
      aoa.push([k].concat(row, [row.reduce(function (s, v) { return s + v; }, 0)]));
    });
    var tot = dvvcs.map(function (d) { return khos.reduce(function (s, k) { return s + so(k, d); }, 0); });
    aoa.push(['Tổng'].concat(tot, [all.length]));
    var dvDoan = all.filter(function (x) { return x.dvvcNguon === NhanDien.DOAN; }).length;
    var khoDoan = all.filter(function (x) { return x.khoNguon === NhanDien.DOAN; }).length;
    var khoChuaRo = all.filter(function (x) { return x.kho === NhanDien.CHUA_RO; }).length;
    aoa.push([], ['Ghi chú'],
      ['ĐVVC đoán theo đầu mã vận đơn (file sàn không có cột ĐVVC): ' + dvDoan + '/' + all.length + ' kiện'],
      ['Kho đoán theo tên sản phẩm: ' + khoDoan + '/' + all.length + ' kiện'],
      ['Kho chưa rõ: ' + khoChuaRo + '/' + all.length + ' kiện'],
      ['Số trong bảng là số kiện (mỗi mã vận đơn 1 kiện).']);
    var ws0 = XL.utils.aoa_to_sheet(aoa);
    ws0['!cols'] = [{ wch: 16 }].concat(dvvcs.map(function () { return { wch: 16 }; }), [{ wch: 10 }]);
    var used = {};
    XL.utils.book_append_sheet(wb, ws0, tenSheet('Tổng hợp', used));
    used['tin nhắn'] = true;

    /* ---- Mỗi kho 1 sheet, nhóm theo ĐVVC ---- */
    var theoDvvc = theo === 'dvvc';
    var keys = theoDvvc ? dvvcs.slice().sort(function (a, b) {
      return (a === NhanDien.CHUA_RO) - (b === NhanDien.CHUA_RO) || (tot[dvvcs.indexOf(b)] - tot[dvvcs.indexOf(a)]) || a.localeCompare(b, 'vi');
    }) : khos;
    keys.forEach(function (k) {
      var rows = [COT.slice()], stt = 0;
      groups.filter(function (g) { return (theoDvvc ? g.dvvc : g.kho) === k; }).forEach(function (g) {
        g.items.forEach(function (x) {
          rows.push([++stt, x.ma, x.dvvc, x.gian, x.loaiGoc || x.loai, x.maDon, x.sp, x.lyDo, x.tuan, khoNhan(x)]);
        });
      });
      var ws = XL.utils.aoa_to_sheet(rows);
      Common.forceTextCol(ws, 1);
      Common.forceTextCol(ws, 5);
      ws['!cols'] = [{ wch: 5 }, { wch: 24 }, { wch: 16 }, { wch: 22 }, { wch: 14 }, { wch: 22 }, { wch: 44 }, { wch: 28 }, { wch: 15 }, { wch: 15 }];
      XL.utils.book_append_sheet(wb, ws, tenSheet((theoDvvc ? '' : 'Kho ') + k, used));
    });

    /* ---- Tin nhắn: mỗi ô 1 tin cho 1 kho × 1 ĐVVC ---- */
    var tn = [['Kho', 'ĐVVC', 'Số kiện', 'Tin nhắn (chép nguyên ô)']];
    groups.forEach(function (g) { tn.push([g.kho, g.dvvc, g.items.length, tinNhan(g)]); });
    var ws2 = XL.utils.aoa_to_sheet(tn);
    for (var r = 1; r < tn.length; r++) {
      var a = XL.utils.encode_cell({ r: r, c: 3 });
      ws2[a].t = 's'; ws2[a].z = '@';
    }
    ws2['!cols'] = [{ wch: 10 }, { wch: 16 }, { wch: 8 }, { wch: 90 }];
    XL.utils.book_append_sheet(wb, ws2, 'Tin nhắn');
    return wb;
  }

  return { COT: COT, nhom: nhom, tinNhan: tinNhan, buildWorkbook: buildWorkbook };
});
