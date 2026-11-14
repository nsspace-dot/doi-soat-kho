/* =====================================================================
   BaoCao — tab "Báo cáo hình": đọc bảng theo dõi đơn thiếu (dán từ Google
   Sheets / Excel hoặc file xlsx / csv) rồi tính số liệu cho thẻ báo cáo.
   Nhận cột theo TÊN tiêu đề, không theo vị trí:
     bắt buộc: Tuần đối soát, KHO, Mã vận đơn, Gian hàng, Loại tệp tin
     tuỳ chọn: Tên sản phẩm, Phân loại, Lý do, ĐVVC, Mã đơn hàng
   Không đụng DOM, chạy được trong Node để test.
   ===================================================================== */
(function (root, factory) {
  var req = typeof require === 'function' ? require : null;
  var api = factory(root.Common || req('./common.js'), root.NhanDien || req('./nhan-dien.js'));
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BaoCao = api;
})(typeof self !== 'undefined' ? self : this, function (Common, NhanDien) {
  'use strict';

  var DAY = 86400000;
  var SAN_LABEL = { tiktok: 'TikTok', shopee: 'Shopee' };
  var LOAI_TRA = 'Trả hàng', LOAI_GIAO = 'Giao KTC', LOAI_KHAC = 'Khác';
  var KHO_UU_TIEN = ['NVS', 'TSN', 'VL'];
  var NHOM_LY_DO = ['Giao thất bại', 'Không còn nhu cầu/đổi ý', 'Hư hỏng/vỡ/trầy', 'Khác mô tả', 'Gửi sai/thiếu hàng',
    'Đổi phân loại/địa chỉ', 'Hàng mẫu KOC', 'Khác'];
  var EXAMPLE_CODE = '012345678901';

  function low(s) { return NhanDien.nfc(s).toLowerCase().replace(/\s+/g, ' ').trim(); }

  /* ---------- đọc bảng dán (TSV) ----------
     Google Sheets / Excel bọc ô có xuống dòng, tab hoặc ngoặc kép trong "…",
     ngoặc kép bên trong viết thành "".                                       */
  function parseTsv(text) {
    text = String(text || '').replace(/\r\n?/g, '\n');
    var rows = [], row = [], cell = '', i = 0, n = text.length, inQ = false, atStart = true;
    while (i < n) {
      var ch = text.charAt(i);
      if (inQ) {
        if (ch === '"') {
          if (text.charAt(i + 1) === '"') { cell += '"'; i += 2; continue; }
          inQ = false; i++; continue;
        }
        cell += ch; i++; continue;
      }
      if (ch === '"' && atStart) { inQ = true; atStart = false; i++; continue; }
      if (ch === '\t') { row.push(cell); cell = ''; atStart = true; i++; continue; }
      if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; atStart = true; i++; continue; }
      cell += ch; atStart = false; i++;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (c) { return String(c).trim() !== ''; }); });
  }
  // Workbook (xlsx / csv) -> mảng dòng chữ, đọc ô như các tab khác (không làm hỏng mã 12 số).
  function rowsFromWorkbook(wb) {
    var ws = Common.firstSheet(wb), rg = Common.sheetRange(ws), out = [];
    for (var r = rg.s.r; r <= rg.e.r; r++) {
      var row = [];
      for (var c = rg.s.c; c <= rg.e.c; c++) row.push(Common.getCellStr(ws, r, c));
      if (row.some(function (v) { return v !== ''; })) out.push(row);
    }
    return out;
  }

  /* ---------- nhận cột theo tên ---------- */
  var COT = [
    { k: 'tuan', ten: 'Tuần đối soát', bb: true, f: function (h) { return h.indexOf('tuần đối soát') >= 0 || h === 'tuần'; } },
    { k: 'kho', ten: 'KHO', bb: true, f: function (h) { return h === 'kho'; } },
    { k: 'ma', ten: 'Mã vận đơn', bb: true, f: function (h) { return h.indexOf('mã vận đơn') >= 0; } },
    { k: 'gian', ten: 'Gian hàng', bb: true, f: function (h) { return h.indexOf('gian hàng') === 0 || h === 'gian'; } },
    { k: 'loai', ten: 'Loại tệp tin', bb: true, f: function (h) { return h.indexOf('loại tệp') >= 0 || h.indexOf('loại file') >= 0 || h === 'loại'; } },
    { k: 'sp', ten: 'Tên sản phẩm', f: function (h) { return h.indexOf('tên sản phẩm') >= 0 || h === 'sản phẩm'; } },
    { k: 'pl', ten: 'Phân loại', f: function (h) { return h.indexOf('phân loại') >= 0; } },
    { k: 'lyDo', ten: 'Lý do', f: function (h) { return h.indexOf('lý do') >= 0 || h.indexOf('lí do') >= 0; } },
    { k: 'dvvc', ten: 'ĐVVC', f: function (h) { return h.indexOf('đvvc') >= 0 || h.indexOf('đơn vị vận chuyển') >= 0; } },
    { k: 'maDon', ten: 'Mã đơn hàng', f: function (h) { return h.indexOf('mã đơn') >= 0; } }
  ];
  function mapCot(row) {
    var m = {};
    row.forEach(function (v, i) {
      var h = low(v);
      if (!h) return;
      COT.forEach(function (c) { if (m[c.k] === undefined && c.f(h)) m[c.k] = i; });
    });
    return m;
  }
  function timTieuDe(rows) {
    var best = null;
    for (var r = 0; r < Math.min(rows.length, 15); r++) {
      var m = mapCot(rows[r]);
      var n = COT.filter(function (c) { return c.bb && m[c.k] !== undefined; }).length;
      if (m.ma !== undefined && (!best || n > best.n)) best = { r: r, m: m, n: n };
    }
    return best;
  }

  /* ---------- tuần: "2/11 - 9/11", "26/10 - 1/11", "02/11/2026 - 08/11/2026" ---------- */
  var RE_TUAN = /(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{2,4}))?\s*[-–—~]\s*(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{2,4}))?/;
  function nam(y) { y = +y; return y < 100 ? 2000 + y : y; }
  function ddmm(d) { return Common.pad(d.getDate()) + '/' + Common.pad(d.getMonth() + 1); }
  function parseTuan(s, now) {
    var m = String(s || '').match(RE_TUAN);
    if (!m) return null;
    var d1 = +m[1], m1 = +m[2], d2 = +m[4], m2 = +m[5];
    if (m1 < 1 || m1 > 12 || m2 < 1 || m2 > 12 || d1 < 1 || d1 > 31 || d2 < 1 || d2 > 31) return null;
    now = now || new Date();
    var y2 = m[6] ? nam(m[6]) : (m[3] ? nam(m[3]) : null), end;
    if (y2 === null) {
      // Không ghi năm: lấy năm gần hôm nay nhất mà ngày cuối tuần không rơi quá 31 ngày về tương lai
      // (cuối tháng 12 vẫn hiểu đúng "26/12 - 1/1" là sang năm sau).
      for (y2 = now.getFullYear() + 1; ; y2--) {
        end = new Date(y2, m2 - 1, d2);
        if (end.getTime() - now.getTime() <= 31 * DAY) break;
      }
    } else end = new Date(y2, m2 - 1, d2);
    var y1 = m[3] ? nam(m[3]) : y2;
    var start = new Date(y1, m1 - 1, d1);
    if (start > end) start = new Date(y1 - 1, m1 - 1, d1);
    return { start: start, end: end, label: ddmm(start) + ' - ' + ddmm(end), key: start.getTime() + '_' + end.getTime() };
  }

  /* ---------- chuẩn hoá gian, loại, kho, lý do ---------- */
  // Bỏ chữ TikTok / Shopee: "NHÀ SÁCH" và "TikTok Nhà Sách" là một gian.
  function chuanGian(s) {
    var t = NhanDien.nfc(s).replace(/tik\s*tok(\s*shop)?|shopee/gi, ' ').replace(/[\s\-–:|]+/g, ' ').trim();
    return (t || '(không rõ gian)').toLocaleUpperCase('vi');
  }
  function chuanLoai(s) {
    var l = low(s);
    if (/trả|hoàn|khiếu nại|return|refund/.test(l)) return LOAI_TRA;
    if (/giao|ktc|đơn hàng|hủy|huỷ|failed|unsuccessful/.test(l)) return LOAI_GIAO;
    return LOAI_KHAC;
  }
  function chuanKho(s) {
    var t = NhanDien.khoTuTen(s);
    if (!t) return NhanDien.CHUA_RO;
    return /^[a-z0-9]{2,5}$/i.test(t) ? t.toUpperCase() : t;
  }
  function nhomLyDo(lyDo, loai) {
    var l = low(lyDo);
    if (!l) return loai === LOAI_GIAO ? NHOM_LY_DO[0] : 'Khác';
    if (/hàng mẫu|koc|sample/.test(l)) return 'Hàng mẫu KOC';
    if (/giao thất bại|giao không thành công|giao hàng không thành công|ktc|delivery fail|failed deliver|không liên lạc|không nhận hàng|từ chối nhận|unreachable/.test(l)) return 'Giao thất bại';
    if (/địa chỉ|phân loại|đổi màu|đổi size|đổi kích|address|change (the )?(color|colour|size|sku)/.test(l)) return 'Đổi phân loại/địa chỉ';
    if (/hư hỏng|bị hư|hư hại|hỏng|vỡ|trầy|bể|móp|rách|lỗi|defect|damag|broken|doesn't work|does not work/.test(l)) return 'Hư hỏng/vỡ/trầy';
    if (/mô tả|description|không giống|khác với|hàng giả|doesn't match/.test(l)) return 'Khác mô tả';
    if (/sai|thiếu|nhầm|wrong|missing|incomplete/.test(l)) return 'Gửi sai/thiếu hàng';
    if (/nhu cầu|đổi ý|change of mind|không muốn|no longer|đặt trùng|giá tốt hơn|better price/.test(l)) return 'Không còn nhu cầu/đổi ý';
    return 'Khác';
  }
  function sapKho(list) {
    return list.slice().sort(function (a, b) {
      var ia = KHO_UU_TIEN.indexOf(a), ib = KHO_UU_TIEN.indexOf(b);
      if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      if (a === NhanDien.CHUA_RO) return 1;
      if (b === NhanDien.CHUA_RO) return -1;
      return a.localeCompare(b, 'vi');
    });
  }

  function loi(msg) { return { ok: false, loi: msg, items: [] }; }

  /* rows: mảng dòng (mỗi dòng là mảng ô chữ). Trả về
     { ok, loi, items, soDong, soTrung, soTuanLoi, coLyDo, coDvvc, coSp }     */
  function docBang(rows, opts) {
    var now = (opts && opts.now) || new Date();
    rows = rows || [];
    if (!rows.length) return loi('Chưa có dữ liệu. Hãy dán bảng (kèm dòng tiêu đề) hoặc chọn file.');
    var tenBB = COT.filter(function (c) { return c.bb; }).map(function (c) { return c.ten; }).join(', ');
    var h = timTieuDe(rows);
    if (!h) return loi('Không thấy dòng tiêu đề. Hãy chép cả dòng tiêu đề của bảng; cần có các cột: ' + tenBB + '.');
    var thieu = COT.filter(function (c) { return c.bb && h.m[c.k] === undefined; }).map(function (c) { return c.ten; });
    if (thieu.length) return loi('Dòng tiêu đề thiếu cột: ' + thieu.join(', ') + '. (Cần có: ' + tenBB + '.)');

    var m = h.m, items = [], seen = new Set(), soDong = 0, soTrung = 0, soTuanLoi = 0, viDuTuan = [];
    function cell(row, k) { return m[k] === undefined ? '' : String(row[m[k]] === undefined ? '' : row[m[k]]).trim(); }
    for (var r = h.r + 1; r < rows.length; r++) {
      var row = rows[r], raw = cell(row, 'ma');
      if (/^\d[\d.]*[eE][+\-]?\d+$/.test(raw)) raw = String(Math.round(parseFloat(raw)));
      var ma = Common.sanitizeTrackingId(raw);
      if (!ma || ma.length < 4 || ma === EXAMPLE_CODE) continue;
      soDong++;
      var tuan = parseTuan(cell(row, 'tuan'), now);
      if (!tuan) { soTuanLoi++; if (viDuTuan.length < 3 && viDuTuan.indexOf(cell(row, 'tuan')) < 0) viDuTuan.push(cell(row, 'tuan')); continue; }
      if (seen.has(ma)) { soTrung++; continue; }
      seen.add(ma);
      var loai = chuanLoai(cell(row, 'loai')), dv = NhanDien.dvvc(cell(row, 'dvvc'), ma), lyDo = cell(row, 'lyDo');
      items.push({ ma: ma, maGoc: raw, tuan: tuan, kho: chuanKho(cell(row, 'kho')), gian: chuanGian(cell(row, 'gian')), loai: loai,
        sp: cell(row, 'sp'), pl: cell(row, 'pl'), lyDo: lyDo, nhomLyDo: nhomLyDo(lyDo, loai),
        dvvc: dv.ten, dvvcNguon: dv.nguon, maDon: cell(row, 'maDon') });
    }
    if (!soDong) return loi('Có dòng tiêu đề nhưng bên dưới không có dòng nào có mã vận đơn.');
    if (!items.length) {
      return loi('Không đọc được cột Tuần đối soát ở ' + soTuanLoi + ' dòng. Cần dạng "02/11 - 08/11". Giá trị đang có: ' +
        viDuTuan.map(function (v) { return '"' + v + '"'; }).join(', ') + '.');
    }
    return { ok: true, loi: '', items: items, soDong: soDong, soTrung: soTrung, soTuanLoi: soTuanLoi,
      coLyDo: m.lyDo !== undefined, coDvvc: m.dvvc !== undefined, coSp: m.sp !== undefined };
  }

  /* ---------- tính số liệu cho thẻ báo cáo ---------- */
  function dem(items, key) {
    var m = {};
    items.forEach(function (x) { var k = typeof key === 'function' ? key(x) : x[key]; m[k] = (m[k] || 0) + 1; });
    return m;
  }
  function boSo(items) {
    return { tong: items.length, tra: items.filter(function (x) { return x.loai === LOAI_TRA; }).length,
      giao: items.filter(function (x) { return x.loai === LOAI_GIAO; }).length };
  }
  function theoKhoList(items, khoList) {
    var m = dem(items, 'kho');
    return khoList.filter(function (k) { return m[k]; }).map(function (k) { return { kho: k, n: m[k] }; });
  }
  function pct(a, b) { return b ? Math.round(a / b * 100) : 0; }

  function tinh(doc, opts) {
    var now = (opts && opts.now) || new Date();
    var san = (opts && opts.san) === 'shopee' ? 'shopee' : 'tiktok';
    var items = doc.items;
    var tuans = [], byKey = {};
    items.forEach(function (x) { if (!byKey[x.tuan.key]) { byKey[x.tuan.key] = x.tuan; tuans.push(x.tuan); } });
    tuans.sort(function (a, b) { return (b.start - a.start) || (b.end - a.end); });   // mới nhất trước
    var tuanNay = tuans[0];
    var nay = items.filter(function (x) { return x.tuan.key === tuanNay.key; });
    var cu = items.filter(function (x) { return x.tuan.key !== tuanNay.key; });
    var khoList = sapKho(Object.keys(dem(items, 'kho')));

    // Bảng gian × kho của tuần này
    var gianMap = {};
    nay.forEach(function (x) { (gianMap[x.gian] = gianMap[x.gian] || []).push(x); });
    var gians = Object.keys(gianMap).map(function (g) {
      return { ten: g, tong: gianMap[g].length, theoKho: dem(gianMap[g], 'kho'), kho: theoKhoList(gianMap[g], khoList) };
    }).sort(function (a, b) { return b.tong - a.tong || a.ten.localeCompare(b.ten, 'vi'); });
    var max = 0;
    gians.forEach(function (g) { khoList.forEach(function (k) { max = Math.max(max, g.theoKho[k] || 0); }); });

    // Tồn các tuần trước: mỗi tuần 1 thẻ
    var today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var ton = tuans.slice(1).map(function (t) {
      var arr = cu.filter(function (x) { return x.tuan.key === t.key; });
      return { label: t.label, quaNgay: Math.max(0, Math.round((today0 - t.end) / DAY)), tong: arr.length, kho: theoKhoList(arr, khoList) };
    });

    var tongKho = theoKhoList(items, khoList).map(function (k) { return { kho: k.kho, n: k.n, pct: pct(k.n, items.length) }; });

    var lyDo = null;
    if (doc.coLyDo) {
      var lm = dem(items, 'nhomLyDo');
      lyDo = NHOM_LY_DO.filter(function (k) { return lm[k]; }).map(function (k) { return { nhom: k, n: lm[k], pct: pct(lm[k], items.length) }; })
        .sort(function (a, b) { return b.n - a.n; });
    }

    var topSp = null;
    if (doc.coSp) {
      var sm = {};
      items.forEach(function (x) {
        var names = [];
        String(x.sp || '').split(' | ').forEach(function (s) { s = s.trim(); if (s && names.indexOf(s) < 0) names.push(s); });
        names.forEach(function (s) { (sm[s] = sm[s] || []).push(x); });
      });
      topSp = Object.keys(sm).map(function (s) {
        var arr = sm[s], b = boSo(arr);
        return { ten: s, n: arr.length, tra: b.tra, giao: b.giao, khac: b.tong - b.tra - b.giao, kho: theoKhoList(arr, khoList) };
      }).sort(function (a, b) { return b.n - a.n || a.ten.localeCompare(b.ten, 'vi'); }).slice(0, 5);
      if (!topSp.length) topSp = null;
    }

    var khoTop = tongKho.slice().sort(function (a, b) { return b.n - a.n; })[0];
    var dm = dem(items, 'dvvc');
    var dvvc = Object.keys(dm).map(function (k) { return { ten: k, n: dm[k] }; }).sort(function (a, b) { return b.n - a.n || a.ten.localeCompare(b.ten, 'vi'); });

    return {
      san: san, sanLabel: SAN_LABEL[san], tuanNay: tuanNay.label, soGian: gians.length, khoList: khoList,
      so: { nay: boSo(nay), ton: boSo(cu), tong: boSo(items) },
      bang: { gians: gians, tongKho: dem(nay, 'kho'), tong: nay.length, max: max },
      ton: ton, tongKho: tongKho, lyDo: lyDo, topSp: topSp,
      ghiChu: { kho: khoTop.kho, a: khoTop.n, b: items.length, pct: khoTop.pct, cuNhat: tuans[tuans.length - 1].label,
        dvvc: dvvc, dvvcDoan: items.filter(function (x) { return x.dvvcNguon === NhanDien.DOAN; }).length },
      soDong: doc.soDong, soTrung: doc.soTrung, soTuanLoi: doc.soTuanLoi
    };
  }

  /* ---------- bản chữ để dán Zalo ---------- */
  function khoChu(list) { return list.map(function (k) { return k.n + ' đơn kho ' + k.kho; }).join('; '); }
  function banChu(M) {
    var SAN = M.sanLabel.toUpperCase(), out = ['Báo cáo kết quả đối soát ' + M.tuanNay + ' ' + M.sanLabel.toLowerCase()];
    if (!M.bang.gians.length) out.push('Tuần này không thiếu đơn nào');
    M.bang.gians.forEach(function (g) { out.push(SAN + ' ' + g.ten + ' THIẾU ' + g.tong + ' ĐƠN: ' + khoChu(g.kho)); });
    out.push('Tồn các tuần trước: ' + M.so.ton.tong + ' đơn');
    M.ton.forEach(function (t) { out.push('- Tuần ' + t.label + ': ' + t.tong + ' đơn (' + khoChu(t.kho) + ')'); });
    out.push('Tổng còn treo: ' + M.so.tong.tong + ' đơn (' + khoChu(M.tongKho) + ')');
    return out.join('\n');
  }

  return {
    NHOM_LY_DO: NHOM_LY_DO, SAN_LABEL: SAN_LABEL, LOAI_TRA: LOAI_TRA, LOAI_GIAO: LOAI_GIAO,
    parseTsv: parseTsv, rowsFromWorkbook: rowsFromWorkbook, parseTuan: parseTuan, chuanGian: chuanGian, chuanLoai: chuanLoai,
    chuanKho: chuanKho, nhomLyDo: nhomLyDo, sapKho: sapKho, docBang: docBang, tinh: tinh, banChu: banChu
  };
});
