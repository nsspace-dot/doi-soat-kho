'use strict';
const XLSX = require('xlsx');

// Tạo workbook từ mảng 2 chiều rồi ghi/đọc lại như file thật (cellText như trình duyệt).
function wbFromAoa(aoa, opts) {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return roundTrip(wb, opts);
}

function roundTrip(wb, opts) {
  const bookType = (opts && opts.bookType) || 'xlsx';
  const buf = XLSX.write(wb, { type: 'buffer', bookType: bookType });
  if (bookType === 'csv') return XLSX.read(buf.toString('utf8'), { type: 'string', cellText: true });
  return XLSX.read(buf, { type: 'buffer', cellText: true, cellNF: true });
}

function writeBuffer(wb) {
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// Đọc XML thô trong file xlsx để kiểm tra định dạng ô như Excel sẽ thấy.
function zipFile(buf, path) {
  const zip = XLSX.CFB.read(buf, { type: 'buffer' });
  const f = XLSX.CFB.find(zip, '/' + path);
  return f ? Buffer.from(f.content).toString('utf8') : null;
}

function kho(codes, date) {
  return codes.map((c) => ({ c: c, id: c, d: date || '20/10/2026' }));
}

module.exports = { XLSX, wbFromAoa, roundTrip, writeBuffer, zipFile, kho };
