# Đối soát kho chung Shopee / TikTok

Trang web tĩnh (chạy trên GitHub Pages, không đăng nhập) để đối soát đơn trả Shopee và TikTok với **một kho mã chung**.
Kho mã nằm trên một Google Sheet riêng, đọc/ghi qua một Google Apps Script Web app. Trang dành cho nhóm nhỏ (tối đa khoảng 5 người) dùng chung.

> Hướng dẫn cài đặt và cách dùng hằng tuần: **[HUONG-DAN.md](HUONG-DAN.md)**.

## Năm tab

| Tab | Việc làm |
| --- | --- |
| **Kho / Đối soát** | Dán tin nhắn Zalo (`[QR]`, `[C128]`, khối CSV, tiêu đề Zalo) hoặc tải file Excel/CSV mã kho → xem trước, xoá mã sai, gộp trùng, bỏ qua mã đã khớp → **Lưu vào kho chung** (Gộp thêm / Thay thế). Có Hoàn tác, Tải kho về Excel, lịch sử. |
| **Shopee** | Nạp file đơn hàng + khiếu nại Shopee (mỗi file có ô **Gian hàng** và **Loại file**) → đối soát với kho chung → chuyển mã Shopee đã khớp sang **Đã khớp** (sau khi xác nhận) → tab con **"Đã khớp kho (N)"** liệt kê mọi mã trong chứng từ có trong kho (đánh dấu mã vừa khớp / đã khớp từ trước), có tìm mã và xuất Excel. |
| **TikTok** | Như Shopee, cho file Giao không thành công / Trả hàng của TikTok. Giữ tuỳ chọn loại mã SPXVN / GY… khỏi đối soát (các mã này không bị đổi trạng thái). |
| **Đã đối soát** | Bảng mã Đã khớp (sàn, gian, loại file, ngày đối soát, ngày khớp), lọc sàn / gian / tuần khớp / tìm mã, xuất Excel theo bộ lọc. |

| **🖼 Báo cáo hình** | Dán bảng theo dõi đơn thiếu (Ctrl+V từ Google Sheets / Excel) hoặc chọn file xlsx / csv → tự vẽ thẻ báo cáo 820px màu cố định (TikTok đen → hồng, Shopee cam → đỏ) → **Tải PNG**, **Chép hình** (dán thẳng Zalo), **Chép bản chữ**. Nhận cột theo tên tiêu đề; nhớ bảng dán gần nhất trên máy (localStorage `doiSoat_baoCao_v1`). |

Ô **Tìm một mã** ở đầu trang (mọi tab) cho biết mã đang Chờ đối soát / Đã khớp / Không có trong kho.
Không đăng nhập, không ghi tên người: lịch sử chỉ có thời gian, hành động và số lượng.

## Kho "không xoá, chỉ đổi trạng thái"

Mỗi mã trong sheet `KHO` có `trang_thai`: **`cho`** (Chờ đối soát) hoặc **`khop`** (Đã khớp, kèm `san`, `gian_hang`,
`loai_file`, `ngay_khop`). Khi đối soát một sàn, chỉ những mã **đang chờ và có trong chứng từ của chính sàn đó** chuyển
sang `khop`; mã đã `khop` thì giữ nguyên (đối soát lại vẫn tính là khớp, không đổi ngày khớp). Nạp lại một mã đã `khop` sẽ bị
bỏ qua, không đưa về `cho`. Hàm `donKho()` chạy mỗi đêm (trigger tạo bằng `taoTriggerDonKho()`), xoá mã `cho` quá 60 ngày
kể từ ngày đối soát và mã `khop` quá 60 ngày kể từ ngày khớp. Kho cũ được chuyển tự động bằng `migrate()` (chạy lại an toàn).

## Giao diện và chủ đề

Đầu trang (cả 4 tab) có 4 thẻ số liệu kho chung: **Mã trong kho** (chờ đối soát · đã khớp), **Tải lần cuối**
(`dd/mm/yyyy hh:mm · N mã trong kho`), **Tồn từ 7 ngày trở lên** (chỉ mã chờ), **Tuần này** (nhãn xanh/vàng theo mốc 7 ngày).
Tab Kho chia 3 bước: ① Nhập mã → ② Xem trước → ③ Lưu vào kho. Màu nút chính và viền thẻ đổi theo tab đang xem
(Kho xanh dương, Shopee cam, TikTok hồng, Đã đối soát tím).

Nút 🎨 ở góc phải thanh trên cùng mở hộp chọn chủ đề: **Mèo con** (mặc định), **Vintage**, **Tối giản**, mỗi chủ đề có
công tắc Sáng/Tối (6 biến thể). Lựa chọn lưu trong trình duyệt (localStorage, khoá `doiSoat_chuDe_v1`), mỗi máy một lựa chọn riêng.
Màu của từng biến thể nằm trong `css/themes.css`; `css/app.css` chỉ dùng biến. Mọi cặp chữ/nền đạt tương phản ≥ 4.5:1
(`tests/theme.test.js` kiểm tra).

## Nhận diện ĐVVC, Lý do, Kho cho từng đơn

Mọi đơn đọc từ file sàn được gắn thêm ĐVVC, Lý do, Kho (`js/core/nhan-dien.js`); danh sách "Sàn báo, kho chưa nhận" hiện thêm cột **ĐVVC** và **Lý do**.
Giá trị đoán có nhãn *đoán* bên cạnh.

| | ĐVVC | Lý do | Kho |
| --- | --- | --- | --- |
| Shopee giao thất bại | cột "Đơn Vị Vận Chuyển" (bỏ tiền tố Nhanh-, Hàng Cồng Kềnh-, Tiết kiệm-, Hỏa Tốc-) | "Giao thất bại" | cột "Tên kho hàng" → NVS / TSN / VL |
| Shopee trả hàng | cột "Đơn vị vận chuyển trả hàng" (chiều về), trống thì đoán theo mã | cột "Lí do Trả hàng/Hoàn tiền" | "Chưa rõ" (không đoán) |
| TikTok giao KTC | cột "Shipping Provider Name" | cột "Cancel Reason" | đoán theo tên SP |
| TikTok trả hàng | đoán theo mã "Return Logistics Tracking ID" | cột "Return Reason" (dịch sang tiếng Việt) | đoán theo tên SP (tranh / liễn / khung → NVS, còn lại → VL) |

Đoán ĐVVC theo mã: chứa `VTPVN` → Viettel Post; `SPXVN…` → SPX Express; `VNGH…` hoặc `GY` + 6 ký tự → GHN; `530` + 9 số → J&T Cargo;
`85…`/`86…` đủ 12 số → J&T Express; còn lại "Chưa rõ". Mỗi mã vận đơn chỉ 1 dòng, kiện nhiều SKU gộp tên sản phẩm bằng ` | `.

## Nút "🚚 Xuất file đòi ĐVVC"

Có ở danh sách "Sàn báo, kho chưa nhận" (Shopee, TikTok) và ở tab Báo cáo hình (từ bảng đã dán). File Excel gồm:
**Tổng hợp** (bảng kho × ĐVVC theo số kiện + ghi chú số kiện có ĐVVC / kho là đoán), **mỗi kho 1 sheet** nhóm theo ĐVVC
(`STT | Mã vận đơn | ĐVVC | Gian | Loại | Mã đơn | Sản phẩm | Lý do | Tuần | Kho (thật/đoán)`, mã dạng chữ), và **Tin nhắn**
(mỗi ô 1 tin soạn sẵn cho 1 kho × 1 ĐVVC). Trên trang, khối **Tin nhắn đòi ĐVVC** có nút **📋 Chép tin nhắn** cho từng kho × ĐVVC.

## File mẫu đơn thiếu và file xuất

File mẫu (nút **Tải file mẫu**, mỗi tab sàn): tiêu đề + 1 dòng ví dụ (mã `012345678901`, tự bỏ qua khi nạp lại).

```
Tuần đối soát | KHO | Mã vận đơn | Gian hàng Shopee/TikTok | Loại tệp tin | Tên sản phẩm | Phân loại
```

File xuất **"Sàn báo, kho chưa nhận"**: đúng thứ tự cột của Google Sheet theo dõi, dán thẳng vào được.

```
Tuần đối soát | KHO | Mã vận đơn | Gian hàng | Loại tệp tin | Tên sản phẩm | Phân loại | Thời gian trả trên hệ thống | ĐVVC | Lý do
```

- Nút xuất hỏi **Tuần đối soát**: điền sẵn theo khoảng ngày trong file (dạng `02/11 - 08/11`), sửa được; file không có ngày thì lấy tuần Thứ Hai - Chủ Nhật vừa qua.
- Nút **📋 Chép bảng**: chép cùng bảng đó dạng TSV có tiêu đề, dán thẳng vào Google Sheets.
- Cột `Mã vận đơn` luôn khoá định dạng Text, nên Excel không đổi mã 12 số thành `8.6233E+11`.
- Khi nạp lại: nhận cả hai bộ cột (`Gian hàng`, `Gian hàng Shopee`, `Gian hàng TikTok`), đọc lại `KHO`, `ĐVVC`, `Lý do`, và vẫn nhận file xuất cũ của công cụ gốc.

## Cấu trúc

```
index.html              trang duy nhất (4 tab)
css/themes.css          6 bộ biến màu (3 chủ đề × Sáng/Tối)
css/app.css             giao diện, chỉ dùng biến
css/bao-cao.css         thẻ báo cáo hình: màu cố định, không theo chủ đề
js/config.js            API_URL: chỗ duy nhất cần sửa sau khi deploy
js/theme.js             chủ đề: nạp trong <head>, áp màu trước khi vẽ; hộp chọn 🎨
js/core/                logic thuần, không đụng DOM, có test
  common.js             hàm dùng chung: đọc ô, dò cột, dò tiêu đề, đọc file, ngày, tuần ISO, khoá cột Text
  kho-input.js          tách tin nhắn Zalo, đọc file mã kho, gộp trùng
  shopee-core.js        tính toán đối soát Shopee (tách từ công cụ gốc)
  tiktok-core.js        tính toán đối soát TikTok (tách từ công cụ gốc)
  trang-thai.js         mô hình trạng thái: mã cần chuyển 'khop', nhãn loại file, tìm một mã
  da-doi-soat.js        tab Đã đối soát: danh sách, bộ lọc, xuất Excel
  template.js           bộ cột file mẫu / file xuất, đọc lại file
  doi-dvvc.js           file Excel + tin nhắn đòi ĐVVC (kho × ĐVVC)
  bao-cao.js            tab Báo cáo hình: đọc bảng dán (TSV), chuẩn hoá tuần / gian / loại / lý do, tính số liệu, bản chữ
  nhan-dien.js          ĐVVC, Lý do, Kho cho từng đơn; gộp mỗi mã 1 dòng
js/api.js               gọi Web app + giữ bản kho mới nhất
js/ui.js                toast, hộp thoại, phân trang, kéo thả, tên người dùng
js/kho-sync.js          tải kho trước khi đối soát, xác nhận và xoá mã đã khớp
js/xuat-thieu.js        nút xuất / chép của danh sách "Sàn báo, kho chưa nhận" (hỏi Tuần đối soát)
js/kho-tab.js, shopee.js, tiktok.js, da-doi-soat-tab.js, bao-cao-tab.js, app.js   giao diện từng tab
apps-script/Code.gs     backend Google Apps Script
tests/                  test Node (node --test) + e2e Playwright
goc/                    hai công cụ gốc, giữ lại để đối chiếu
```

xlsx 0.18.5, Chart.js 4.4.1 và html2canvas 1.4.1 (chụp thẻ báo cáo thành PNG) tải từ cdnjs, ghim phiên bản. Không có bước build: sửa file rồi push là xong.

## Chạy test

```bash
npm install          # chỉ để có xlsx cho test
npm test             # bộ tách mã, gộp trùng, chuyển trạng thái đúng sàn, bộ cột, chủ đề, tab Đã đối soát,
                     # backend (Code.gs chạy trên Apps Script giả lập: dọn 60 ngày, migrate, hoàn tác, ghi theo lô)
npm run test:e2e     # (tuỳ chọn) chạy trang thật bằng Playwright + Chromium, máy chủ giả lập dùng chính Code.gs;
                     # quét tương phản mọi chữ trên trang ở cả 6 chủ đề, kiểm tra điện thoại 390px
```

`npm run test:e2e` cần sẵn `playwright` và Chromium (`npx playwright install chromium`). Ảnh chụp màn hình lưu ở `tests/e2e/out/`.

Xem thử tại máy: mở bằng một máy chủ tĩnh bất kỳ, ví dụ `npx serve .` hoặc `python3 -m http.server`, rồi vào `http://localhost:...`.

## Bảo mật

Không có đăng nhập: **ai có link /exec đều đọc và ghi được kho**. Chỉ chia sẻ link trang trong nhóm. Backend kiểm tra
định dạng mã, độ dài tên, kích thước dữ liệu, dùng khoá chống ghi đè và luôn giữ bản trước lần ghi gần nhất để Hoàn tác.
Kho chỉ chứa mã vận đơn, ngày, và tên người tải, không có thông tin khách hàng.
