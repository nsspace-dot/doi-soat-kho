'use strict';
/* Giả lập tối thiểu các dịch vụ Apps Script mà Code.gs dùng, để chạy
   apps-script/Code.gs trong Node bằng vm. Mô phỏng cả việc Google Sheets tự
   đổi chuỗi số thành số (mất số 0 đầu) khi ô chưa được định dạng '@'.       */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

class Sheet {
  constructor(name) { this.name = name; this.data = []; this.fmt = {}; }
  getLastRow() {
    for (let r = this.data.length - 1; r >= 0; r--) {
      if ((this.data[r] || []).some((v) => v !== '' && v !== undefined && v !== null)) return r + 1;
    }
    return 0;
  }
  getRange(row, col, nr, nc) { return new Range(this, row, col, nr || 1, nc || 1); }
  setFrozenRows() {}
  deleteRows(start, n) { this.data.splice(start - 1, n); }
}

class Range {
  constructor(sh, row, col, nr, nc) { Object.assign(this, { sh, row, col, nr, nc }); }
  _cells(fn) {
    for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) fn(this.row - 1 + i, this.col - 1 + j, i, j);
  }
  setNumberFormat(f) { this._cells((r, c) => { this.sh.fmt[r + ':' + c] = f; }); return this; }
  setValues(vals) {
    if (vals.length !== this.nr || vals.some((v) => v.length !== this.nc)) throw new Error('Kích thước không khớp');
    this._cells((r, c, i, j) => {
      while (this.sh.data.length <= r) this.sh.data.push([]);
      let v = vals[i][j];
      // Sheets "Automatic": chuỗi toàn số -> số; chuỗi dd/mm/yyyy -> ngày
      if (this.sh.fmt[r + ':' + c] !== '@' && typeof v === 'string') {
        if (/^\d+$/.test(v)) v = Number(v);
        else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v)) v = { date: v };
      }
      this.sh.data[r][c] = v;
    });
    return this;
  }
  getDisplayValues() {
    const out = [];
    for (let i = 0; i < this.nr; i++) {
      const row = [];
      for (let j = 0; j < this.nc; j++) {
        const v = (this.sh.data[this.row - 1 + i] || [])[this.col - 1 + j];
        row.push(v === undefined || v === null ? '' : (typeof v === 'object' ? 'DATE(' + v.date + ')' : String(v)));
      }
      out.push(row);
    }
    return out;
  }
  clearContent() { this._cells((r, c) => { if (this.sh.data[r]) this.sh.data[r][c] = ''; }); return this; }
}

function createGas(opts) {
  const sheets = {};
  const state = { lockFree: true, now: new Date('2026-10-27T03:00:00Z') };
  const ss = {
    getSheetByName: (n) => sheets[n] || null,
    insertSheet: (n) => (sheets[n] = new Sheet(n))
  };
  const ctx = {
    console,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    LockService: { getScriptLock: () => ({ tryLock: () => state.lockFree, releaseLock: () => {} }) },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (s) => ({ content: s, setMimeType() { return this; }, getContent() { return this.content; } })
    },
    Utilities: {
      // Chỉ hỗ trợ đúng các mẫu Code.gs dùng; múi giờ cố định +7.
      formatDate(d, tz, fmt) {
        const t = new Date(d.getTime() + 7 * 3600000);
        const p = (n) => String(n).padStart(2, '0');
        return fmt.replace('dd', p(t.getUTCDate())).replace('MM', p(t.getUTCMonth() + 1)).replace('yyyy', t.getUTCFullYear());
      }
    }
  };
  vm.createContext(ctx);
  const code = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8');
  vm.runInContext(code, ctx, { filename: 'Code.gs' });
  ctx.now_ = () => new Date(state.now.getTime());

  const call = (res) => JSON.parse(res.getContent());
  return {
    ctx, sheets, state,
    get: () => call(ctx.doGet({})),
    post: (body) => call(ctx.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } }))
  };
}

module.exports = { createGas };
