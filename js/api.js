/* =====================================================================
   Api + Kho — gọi Web app Apps Script và giữ bản kho chung mới nhất.
   POST gửi text/plain;charset=utf-8 để trình duyệt không gửi CORS preflight.
   Mọi lỗi được đổi thành câu tiếng Việt rõ ràng; không hàm nào xoá dữ
   liệu người dùng đang nhập khi gọi API thất bại.
   ===================================================================== */
var Api = (function () {
  var TIMEOUT_GET = 45000, TIMEOUT_POST = 90000;

  function url() { return (typeof API_URL === 'string' ? API_URL : '').trim(); }
  function configured() { return !!url(); }

  function ApiError(code, message) {
    var e = new Error(message);
    e.code = code;
    return e;
  }

  function request(method, body) {
    if (!configured()) return Promise.reject(ApiError('NO_CONFIG', 'Chưa cấu hình máy chủ kho chung: link API_URL trong js/config.js đang trống.'));
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var limit = method === 'GET' ? TIMEOUT_GET : TIMEOUT_POST;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, limit) : null;
    var opts = { method: method, redirect: 'follow', signal: ctrl ? ctrl.signal : undefined };
    var target = url();
    if (method === 'GET') {
      target += (target.indexOf('?') >= 0 ? '&' : '?') + '_=' + Date.now();
    } else {
      opts.headers = { 'Content-Type': 'text/plain;charset=utf-8' };
      opts.body = JSON.stringify(body);
    }
    return fetch(target, opts).then(function (res) {
      return res.text().then(function (txt) {
        var data;
        try { data = JSON.parse(txt); } catch (e) {
          throw ApiError('NOT_JSON', 'Máy chủ trả về một trang web thay vì dữ liệu (mã ' + res.status + '). Thường do Web app chưa để quyền "Anyone" hoặc link trong js/config.js không phải link kết thúc bằng /exec.');
        }
        if (!data || data.ok !== true) throw ApiError((data && data.loi) || 'SERVER', (data && data.thongBao) || 'Máy chủ báo lỗi không rõ.');
        return data;
      });
    }, function (err) {
      if (err && err.name === 'AbortError') {
        throw ApiError('TIMEOUT', 'Máy chủ phản hồi quá lâu (quá ' + Math.round(limit / 1000) + ' giây).' +
          (method === 'POST' ? ' Thao tác có thể đã hoặc chưa được ghi: bấm "Làm mới" để kiểm tra trước khi thử lại.' : ' Hãy thử lại.'));
      }
      throw ApiError('NETWORK', 'Không kết nối được máy chủ kho chung. Kiểm tra mạng Internet và link API_URL trong js/config.js.');
    }).finally(function () { if (timer) clearTimeout(timer); });
  }

  return {
    configured: configured,
    getState: function () { return request('GET'); },
    upload: function (cheDo, items, phienBan) {
      return request('POST', { action: 'upload', cheDo: cheDo, items: items, phienBan: phienBan });
    },
    // khop: [{ ma, gian, loai }] — chuyển các mã này sang 'Đã khớp' (không xoá khỏi kho)
    reconcile: function (san, khop) {
      return request('POST', { action: 'reconcile', san: san, khop: khop });
    },
    undo: function (phienBan) {
      return request('POST', { action: 'undo', phienBan: phienBan });
    }
  };
})();

/* Bản kho chung mới nhất đã tải về + người nghe thay đổi. */
var Kho = (function () {
  var state = null, status = 'idle', error = null, listeners = [];

  function emit() { listeners.forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } }); }
  function apply(st) { state = st; status = 'ok'; error = null; emit(); return st; }

  function refresh() {
    if (!Api.configured()) { status = 'noconfig'; emit(); return Promise.reject(new Error('NO_CONFIG')); }
    status = 'loading'; emit();
    return Api.getState().then(apply, function (err) {
      status = 'error'; error = err; emit();
      throw err;
    });
  }

  // Dòng kho: [ma_sach, ma_goc, ngay_doi_soat, trang_thai, san, gian_hang, loai_file, ngay_khop]
  function rows() { return state && state.kho ? state.kho : []; }
  // -> { c, id, d } cho thuật toán đối soát (mọi mã, cả 'cho' lẫn 'khop')
  function items() {
    return (state && state.kho ? state.kho : []).map(function (r) { return { c: r[0], id: r[1] || r[0], d: r[2] }; });
  }
  function codeSet() {
    var s = new Set();
    (state && state.kho ? state.kho : []).forEach(function (r) { s.add(r[0]); });
    return s;
  }

  return {
    refresh: refresh, apply: apply, rows: rows, items: items, codeSet: codeSet,
    onChange: function (fn) { listeners.push(fn); },
    get state() { return state; }, get status() { return status; }, get error() { return error; }
  };
})();
