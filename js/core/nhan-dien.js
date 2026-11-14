/* =====================================================================
   NhanDien — nhận diện ĐVVC, Lý do, Kho cho từng đơn đọc từ file sàn.
   - ĐVVC: ưu tiên cột trong file (nguồn "file"), không có thì đoán theo
     đầu mã vận đơn (nguồn "đoán").
   - Lý do: dịch câu lý do tiếng Anh của TikTok, câu lạ giữ nguyên.
   - Kho: tên kho đầy đủ -> NVS / TSN / VL; TikTok không có cột kho thì
     đoán theo tên sản phẩm; Shopee trả hàng KHÔNG đoán (tranh gửi từ cả
     NVS lẫn TSN) -> "Chưa rõ".
   Không đụng DOM; dùng chung cho tab Shopee, TikTok, Báo cáo hình.
   ===================================================================== */
(function (root, factory) {
  var api = factory(root.Common || (typeof require === 'function' ? require('./common.js') : null));
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NhanDien = api;
})(typeof self !== 'undefined' ? self : this, function (Common) {
  'use strict';

  var CHUA_RO = 'Chưa rõ', FILE = 'file', DOAN = 'đoán';

  function nfc(s) { s = String(s === null || s === undefined ? '' : s); return s.normalize ? s.normalize('NFC') : s; }
  function boDau(s) {
    s = nfc(s).toLowerCase().replace(/đ/g, 'd');
    return s.normalize ? s.normalize('NFD').replace(/[̀-ͯ]/g, '') : s;
  }

  /* ---------------- ĐVVC ---------------- */
  var TIEN_TO = /^\s*(nhanh|hang cong kenh|tiet kiem|hoa toc)\s*[-–—]\s*/;
  // Bỏ tiền tố loại dịch vụ của Shopee: "Nhanh-", "Hàng Cồng Kềnh-", "Tiết kiệm-", "Hỏa Tốc-".
  function boTienTo(name) {
    var s = nfc(name).trim();
    for (var i = 0; i < 3; i++) {
      var m = boDau(s).match(TIEN_TO);
      if (!m) break;
      s = s.slice(m[0].length).trim();
    }
    return s;
  }
  function chuanHoaDvvc(name) {
    var s = boTienTo(name);
    if (!s) return '';
    var l = s.toLowerCase();
    if (l.indexOf('cargo') >= 0) return 'J&T Cargo';
    if (/j\s*&\s*t/.test(l)) return 'J&T Express';
    if (l.indexOf('giao hàng nhanh') >= 0 || /(^|[^a-z])ghn([^a-z]|$)/.test(l)) return 'GHN';
    if (l.indexOf('spx') >= 0) return 'SPX Express';
    if (l.indexOf('viettel') >= 0) return 'Viettel Post';
    return s;
  }
  function doanDvvc(code) {
    var c = Common.sanitizeTrackingId(code);
    if (!c) return CHUA_RO;
    if (c.indexOf('VTPVN') >= 0) return 'Viettel Post';
    if (c.indexOf('SPXVN') === 0) return 'SPX Express';
    if (c.indexOf('VNGH') === 0 || /^GY[A-Z0-9]{6}$/.test(c)) return 'GHN';
    if (/^530\d{9}$/.test(c)) return 'J&T Cargo';
    if (/^8[56]\d{10}$/.test(c)) return 'J&T Express';
    return CHUA_RO;
  }
  // -> { ten, nguon: 'file' | 'đoán' }
  function dvvc(tenTrongFile, code) {
    var t = chuanHoaDvvc(tenTrongFile);
    if (t) return { ten: t, nguon: FILE };
    return { ten: doanDvvc(code), nguon: DOAN };
  }

  /* ---------------- Lý do ---------------- */
  var LY_DO_TIKTOK = [
    ['change of mind', 'Đổi ý'],
    ["product doesn't match description", 'Khác mô tả'],
    ['wrong product sent', 'Gửi sai hàng'],
    ["product is defective or doesn't work", 'Lỗi/hỏng'],
    ['congrats on meeting your refundable sample criteria!', 'Hàng mẫu KOC']
  ];
  function dichLyDoTikTok(raw) {
    var s = nfc(raw).trim();
    if (!s) return '';
    var l = s.toLowerCase().replace(/[’`]/g, "'").replace(/\s+/g, ' ');
    for (var i = 0; i < LY_DO_TIKTOK.length; i++) {
      var k = LY_DO_TIKTOK[i][0];
      if (l === k || l === k.replace(/[.!]$/, '')) return LY_DO_TIKTOK[i][1];
    }
    return s;   // câu lạ giữ nguyên
  }

  /* ---------------- Kho ---------------- */
  // "Nguyễn Văn Săng" -> NVS, "Tân Sơn Nhì" -> TSN, "Vườn Lài" -> VL; tên khác giữ nguyên.
  function khoTuTen(name) {
    var s = nfc(name).trim();
    if (!s) return '';
    var l = boDau(s);
    if (l.indexOf('nguyen van sang') >= 0 || l === 'nvs') return 'NVS';
    if (l.indexOf('tan son nhi') >= 0 || l === 'tsn') return 'TSN';
    if (l.indexOf('vuon lai') >= 0 || l === 'vl') return 'VL';
    return s;
  }
  // Chỉ dùng cho TikTok: tranh / liễn / khung -> NVS, còn lại -> VL.
  function doanKhoTheoSp(prod) {
    var l = nfc(prod).toLowerCase();
    if (!l.trim()) return '';
    return /tranh|liễn|khung/.test(l) ? 'NVS' : 'VL';
  }
  /* -> { ten, nguon: 'file' | 'đoán' | '' }
     khoFile: giá trị cột kho trong file (đã đổi sang mã kho nếu cần).
     san: 'shopee' | 'tiktok'.                                              */
  function kho(san, khoFile, prod) {
    var k = nfc(khoFile).trim();
    if (k) return { ten: k, nguon: FILE };
    if (san === 'tiktok') {
      var g = doanKhoTheoSp(prod);
      if (g) return { ten: g, nguon: DOAN };
    }
    return { ten: CHUA_RO, nguon: '' };
  }

  /* ---------------- Ngày giờ trong file sàn ---------------- */
  function tuSerial(n) {
    var ms = Math.round((n - 25569) * 86400000);   // 25569 = 01/01/1970
    var u = new Date(ms);
    return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate(), u.getUTCHours(), u.getUTCMinutes());
  }
  // Nhận yyyy-mm-dd, dd/mm/yyyy, dd-mm-yyyy (kèm giờ), số serial Excel. Không đọc được -> null.
  function parseNgay(s) {
    if (s === null || s === undefined) return null;
    if (typeof s === 'number') return (s > 20000 && s < 80000) ? tuSerial(s) : null;
    s = String(s).trim();
    if (!s) return null;
    if (/^\d+(\.\d+)?$/.test(s)) { var n = parseFloat(s); return (n > 20000 && n < 80000) ? tuSerial(n) : null; }
    var m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
    if (m) return ok(new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)));
    m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})(?:[ T](\d{1,2}):(\d{2}))?/);
    if (m) return ok(new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0)));
    return null;
    function ok(d) { return isNaN(d.getTime()) ? null : d; }
  }
  // Đọc ô thời gian: ô số (serial) -> "dd/mm/yyyy hh:mm"; ô chữ giữ nguyên văn.
  function cellTime(ws, r, c) {
    if (c === undefined) return '';
    var cell = ws[Common.xlsx().utils.encode_cell({ r: r, c: c })];
    if (!cell) return '';
    if (cell.t === 'n' || typeof cell.v === 'number') {
      var d = parseNgay(Number(cell.v));
      return d ? Common.fmtDT(d) : String(cell.v);
    }
    return String(cell.v === undefined ? '' : cell.v).trim();
  }

  function ddmm(d) { return Common.pad(d.getDate()) + '/' + Common.pad(d.getMonth() + 1); }
  /* Nhãn "Tuần đối soát" điền sẵn, dạng "02/11 - 08/11":
     khoảng ngày nhỏ nhất - lớn nhất đọc được trong file; không có ngày nào
     thì lấy tuần Thứ Hai - Chủ Nhật gần nhất đã trọn trước hôm nay.          */
  function tuanMacDinh(times, now) {
    var min = null, max = null;
    (times || []).forEach(function (t) {
      var d = parseNgay(t);
      if (!d) return;
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      if (!min || d < min) min = d;
      if (!max || d > max) max = d;
    });
    if (!min) {
      now = now || new Date();
      var dow = now.getDay() || 7;   // Thứ Hai = 1 … Chủ Nhật = 7
      max = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow);
      min = new Date(max.getFullYear(), max.getMonth(), max.getDate() - 6);
    }
    return ddmm(min) + ' - ' + ddmm(max);
  }

  /* ---------------- Mỗi mã vận đơn 1 dòng ----------------
     Kiện nhiều SKU: gộp tên sản phẩm (và phân loại) bằng " | ".
     Trả về BẢN SAO, không sửa các dòng cấp SKU dùng cho biểu đồ.            */
  function gopTheoMa(records) {
    var map = new Map(), out = [];
    function them(arr, v) { v = String(v || '').trim(); if (v && arr.indexOf(v) < 0) arr.push(v); }
    (records || []).forEach(function (rec) {
      var g = map.get(rec.cleanTid);
      if (!g) {
        g = { rec: Object.assign({}, rec), prods: [], variants: [] };
        map.set(rec.cleanTid, g); out.push(g);
      } else {
        var a = g.rec;
        if (!a.lyDo && rec.lyDo) a.lyDo = rec.lyDo;
        if (!a.time && rec.time) a.time = rec.time;
        if (!a.oid && rec.oid) a.oid = rec.oid;
        if (a.dvvcNguon !== FILE && rec.dvvcNguon === FILE) { a.dvvcTen = rec.dvvcTen; a.dvvcNguon = FILE; }
        if (a.khoNguon !== FILE && rec.khoNguon === FILE) { a.kho = rec.kho; a.khoNguon = FILE; }
      }
      them(g.prods, rec.prod); them(g.variants, rec.variant);
    });
    return out.map(function (g) {
      g.rec.prod = g.prods.join(' | ');
      g.rec.variant = g.variants.join(' | ');
      return g.rec;
    });
  }

  return {
    CHUA_RO: CHUA_RO, FILE: FILE, DOAN: DOAN, nfc: nfc, boDau: boDau,
    boTienTo: boTienTo, chuanHoaDvvc: chuanHoaDvvc, doanDvvc: doanDvvc, dvvc: dvvc,
    dichLyDoTikTok: dichLyDoTikTok, khoTuTen: khoTuTen, doanKhoTheoSp: doanKhoTheoSp, kho: kho,
    parseNgay: parseNgay, cellTime: cellTime, tuanMacDinh: tuanMacDinh, gopTheoMa: gopTheoMa
  };
});
