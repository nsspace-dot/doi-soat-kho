# Đối soát kho chung Shopee / TikTok

Trang web tĩnh (chạy trên GitHub Pages, không đăng nhập) để đối soát đơn trả Shopee và TikTok với **một kho mã chung**.
Kho mã nằm trên một Google Sheet riêng, đọc/ghi qua một Google Apps Script Web app. Trang dành cho nhóm nhỏ (tối đa khoảng 5 người) dùng chung.

> Hướng dẫn cài đặt và cách dùng hằng tuần: **[HUONG-DAN.md](HUONG-DAN.md)**.

## Ba tab

| Tab | Việc làm |
| --- | --- |
| **Kho / Đối soát** | Dán tin nhắn Zalo (`[QR]`, `[C128]`, khối CSV, tiêu đề Zalo) hoặc tải file Excel/CSV mã kho → xem trước, xoá mã sai, gộp trùng → **Lưu vào kho chung** (Gộp thêm / Thay thế). Có Hoàn tác, Tải kho về Excel, lịch sử. |
| **Shopee** | Nạp file đơn hàng + khiếu nại Shopee (và file mẫu đơn thiếu đã điền) → đối soát với kho chung → xoá khỏi kho những mã Shopee đã khớp (sau khi xác nhận). |
| **TikTok** | Như Shopee, cho file Giao không thành công / Trả hàng của TikTok. Giữ tuỳ chọn loại mã SPXVN / GY… khỏi đối soát (các mã này **không** bị xoá khỏi kho). |

Dòng trạng thái ở đầu trang (cả 3 tab): `Tải lần cuối: dd/mm/yyyy hh:mm bởi <tên> · N mã trong kho`, kèm nhãn xanh
"Tuần này đã có người tải kho" (lần tải cuối trong 7 ngày) hoặc nhãn vàng "Chưa tải kho tuần này".

## Giao diện và chủ đề

Đầu trang (cả 3 tab) có 4 thẻ số liệu kho chung: **Mã trong kho**, **Tải lần cuối**, **Tồn từ 7 ngày trở lên**, **Tuần này**.
Tab Kho chia 3 bước: ① Nhập mã → ② Xem trước → ③ Lưu vào kho. Màu nút chính và viền thẻ đổi theo tab đang xem
(Kho xanh dương, Shopee cam, TikTok hồng).

Nút 🎨 ở góc phải thanh trên cùng mở hộp chọn chủ đề: **Mèo con** (mặc định), **Vintage**, **Tối giản**, mỗi chủ đề có
công tắc Sáng/Tối (6 biến thể). Lựa chọn lưu trong trình duyệt (localStorage, khoá `doiSoat_chuDe_v1`), mỗi máy một lựa chọn riêng.
Màu của từng biến thể nằm trong `css/themes.css`; `css/app.css` chỉ dùng biến. Mọi cặp chữ/nền đạt tương phản ≥ 4.5:1
(`tests/theme.test.js` kiểm tra).

## File mẫu đơn thiếu và file xuất

Một bộ cột duy nhất, đúng thứ tự:

```
Tuần đối soát | KHO | Mã vận đơn | Gian hàng Shopee/TikTok | Loại tệp tin | Tên sản phẩm | Phân loại
```

- Nút **Tải file mẫu** (mỗi tab sàn): tiêu đề + 1 dòng ví dụ (mã `012345678901`, tự bỏ qua khi nạp lại).
- Nút **Xuất "Sàn báo, kho chưa nhận"**: cùng bộ cột, `Tuần đối soát` = tuần ISO ngày xuất (vd `Tuần 44/2026`), cột `KHO` để trống.
- Cột `Mã vận đơn` luôn khoá định dạng Text, nên Excel không đổi mã 12 số thành `8.6233E+11`.
- Khi nạp lại: nhận cả `Gian hàng Shopee` lẫn `Gian hàng TikTok`, đọc cột `KHO` nguyên văn, và vẫn nhận file xuất cũ của công cụ gốc.

## Cấu trúc

```
index.html              trang duy nhất (3 tab)
css/themes.css          6 bộ biến màu (3 chủ đề × Sáng/Tối)
css/app.css             giao diện, chỉ dùng biến
js/config.js            API_URL: chỗ duy nhất cần sửa sau khi deploy
js/theme.js             chủ đề: nạp trong <head>, áp màu trước khi vẽ; hộp chọn 🎨
js/core/                logic thuần, không đụng DOM, có test
  common.js             hàm dùng chung: đọc ô, dò cột, dò tiêu đề, đọc file, ngày, tuần ISO, khoá cột Text
  kho-input.js          tách tin nhắn Zalo, đọc file mã kho, gộp trùng
  shopee-core.js        tính toán đối soát Shopee (tách từ công cụ gốc)
  tiktok-core.js        tính toán đối soát TikTok (tách từ công cụ gốc)
  template.js           bộ cột file mẫu / file xuất, đọc lại file
js/api.js               gọi Web app + giữ bản kho mới nhất
js/ui.js                toast, hộp thoại, phân trang, kéo thả, tên người dùng
js/kho-sync.js          tải kho trước khi đối soát, xác nhận và xoá mã đã khớp
js/kho-tab.js, shopee.js, tiktok.js, app.js   giao diện từng tab
apps-script/Code.gs     backend Google Apps Script
tests/                  test Node (node --test) + e2e Playwright
goc/                    hai công cụ gốc, giữ lại để đối chiếu
```

xlsx 0.18.5 và Chart.js 4.4.1 tải từ cdnjs như bản gốc. Không có bước build: sửa file rồi push là xong.

## Chạy test

```bash
npm install          # chỉ để có xlsx cho test
npm test             # bộ tách mã, gộp trùng, xoá đúng sàn, bộ cột, backend (Code.gs chạy trên Apps Script giả lập)
npm run test:e2e     # (tuỳ chọn) chạy trang thật bằng Playwright + Chromium, máy chủ giả lập dùng chính Code.gs;
                     # quét tương phản mọi chữ trên trang ở cả 6 chủ đề, kiểm tra điện thoại 390px
```

`npm run test:e2e` cần sẵn `playwright` và Chromium (`npx playwright install chromium`). Ảnh chụp màn hình lưu ở `tests/e2e/out/`.

Xem thử tại máy: mở bằng một máy chủ tĩnh bất kỳ, ví dụ `npx serve .` hoặc `python3 -m http.server`, rồi vào `http://localhost:...`.

## Bảo mật

Không có đăng nhập: **ai có link /exec đều đọc và ghi được kho**. Chỉ chia sẻ link trang trong nhóm. Backend kiểm tra
định dạng mã, độ dài tên, kích thước dữ liệu, dùng khoá chống ghi đè và luôn giữ bản trước lần ghi gần nhất để Hoàn tác.
Kho chỉ chứa mã vận đơn, ngày, và tên người tải, không có thông tin khách hàng.
