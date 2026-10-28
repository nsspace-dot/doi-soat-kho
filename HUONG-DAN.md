# Hướng dẫn cài đặt và sử dụng

Phần A, B (hoặc A2 nếu đang dùng bản cũ) chỉ làm **một lần** (người quản trị). Phần C là việc hằng tuần của cả nhóm.
Trang không đăng nhập, không hỏi tên: ai có link đều dùng được. Lịch sử chỉ ghi thời gian, hành động và số lượng mã.

---

## A. Tạo kho chung trên Google Sheet (cài mới)

1. Vào <https://sheets.google.com>, tạo **Bảng tính trống mới**. Đặt tên dễ nhận, ví dụ `KHO CHUNG DOI SOAT`.
   Dùng một bảng tính **riêng**, không dùng chung với bảng lợi nhuận hay bảng nào khác.
2. Trong bảng tính: **Tiện ích mở rộng › Apps Script**.
3. Xoá hết nội dung có sẵn trong `Code.gs`, dán **toàn bộ** nội dung file [`apps-script/Code.gs`](apps-script/Code.gs) của repo này. Bấm 💾 **Lưu**.
4. Bấm **Triển khai › Tùy chọn triển khai mới**:
   - Bấm biểu tượng bánh răng ở "Chọn loại", chọn **Ứng dụng web**.
   - **Mô tả**: `Kho chung` (tuỳ ý).
   - **Thực thi dưới dạng**: **Tôi** (tài khoản của bạn).
   - **Người có quyền truy cập**: **Bất kỳ ai** (Anyone). Đừng chọn "Bất kỳ ai có Tài khoản Google", vì trang sẽ không đọc được.
   - Bấm **Triển khai**.
5. Google hỏi cấp quyền: **Cấp quyền truy cập** → chọn tài khoản → nếu hiện "Google chưa xác minh ứng dụng này" thì bấm
   **Nâng cao › Đi tới … (không an toàn)** → **Cho phép**. Script chỉ đọc/ghi chính bảng tính này.
6. Sao chép **URL ứng dụng web**, có dạng `https://script.google.com/macros/s/AKfy…/exec`. Link phải **kết thúc bằng `/exec`**.
7. **Tạo lịch dọn kho tự động** (chạy MỘT lần): trong trình soạn Apps Script, ở ô chọn hàm cạnh nút ▶, chọn
   **`taoTriggerDonKho`** → bấm **▶ Chạy**. Google hỏi thêm quyền "chạy khi bạn vắng mặt" thì **Cho phép**.
   Kiểm tra: menu bên trái **⏰ Trình kích hoạt** có một dòng `donKho`, chạy **hằng ngày, 2–3 giờ sáng**.
   Chạy lại hàm này cũng không tạo trùng.

Kiểm tra nhanh: mở link `/exec` trên trình duyệt, phải thấy một dòng chữ bắt đầu bằng `{"ok":true,...`.
Lần đầu gọi, script tự tạo các sheet `KHO`, `KHO_TRUOC`, `THONG_TIN`, `LICH_SU`.

## A2. Nâng cấp từ bản cũ (kho đang có dữ liệu)

Bản mới **không xoá mã khi khớp** mà chỉ đổi trạng thái, nên sheet `KHO` có cấu trúc mới
(`ma_sach | ma_goc | ngay_doi_soat | trang_thai | san | gian_hang | loai_file | ngay_khop`) và **bỏ cột người tải**.

1. Nên sao lưu trước: trên trang cũ bấm **⬇ Tải kho về Excel** (hoặc trong Google Sheet: **Tệp › Tạo bản sao**).
2. Mở **Tiện ích mở rộng › Apps Script**, xoá hết `Code.gs` cũ, dán **toàn bộ** `apps-script/Code.gs` mới, bấm 💾 **Lưu**.
3. **Triển khai › Quản lý tùy chọn triển khai** → bấm ✏️ ở bản đang dùng → **Phiên bản: Phiên bản mới** → **Triển khai**.
   Cách này **giữ nguyên link `/exec`**, không phải sửa `js/config.js`. (Nếu tạo "Tùy chọn triển khai mới" thì link đổi.)
4. **Chuyển dữ liệu cũ (migrate)**: tự chạy ở lần đầu có người mở trang. Muốn chạy tay cho chắc: chọn hàm **`migrate`** → **▶ Chạy**.
   - Mọi mã đang có thành **Chờ đối soát**, giữ nguyên **ngày đối soát**.
   - Cột người tải (sheet `KHO`) và cột người (sheet `LICH_SU`) bị bỏ.
   - Chạy lại bao nhiêu lần cũng an toàn: kho đã đúng cấu trúc thì không làm gì.
   - Lịch sử ghi một dòng "Chuyển đổi dữ liệu" kèm số mã đã chuyển.
5. Chạy **`taoTriggerDonKho`** một lần như bước A7.
6. Báo cả nhóm **tải lại trang** (Ctrl+F5 / kéo xuống làm mới trên điện thoại). Trang bản cũ còn mở sẽ bị máy chủ từ chối
   khi đối soát, kèm lời nhắc tải lại; kho không bị ảnh hưởng.

## B. Đưa trang lên GitHub Pages

1. Mở file [`js/config.js`](js/config.js) trên GitHub (bấm ✏️ để sửa), dán link vào giữa hai dấu nháy:
   ```js
   var API_URL = 'https://script.google.com/macros/s/AKfy…/exec';
   ```
   Commit vào nhánh `main`.
2. Trong repo: **Settings › Pages** → **Source: Deploy from a branch** → **Branch: `main`**, thư mục **`/ (root)`** → **Save**.
3. Sau 1–2 phút, trang có địa chỉ dạng `https://<tên-tài-khoản>.github.io/doi-soat-kho/`. Gửi link này cho nhóm (tối đa ~5 người).

Nếu `API_URL` còn trống, trang hiện khung vàng hướng dẫn thay vì báo lỗi.

Có thể chuyển dữ liệu từ **Sổ mã** của công cụ cũ: bấm **⬇ Tải sổ mã** ở công cụ cũ, rồi ở tab **Kho / Đối soát** kéo file đó vào
ô file → **Xử lý & xem trước** → **Lưu vào kho chung**. File có cột *Ngày đối soát* và *Số ngày tồn* nên giữ nguyên ngày cũ.

---

## C. Dùng hằng tuần

### Trạng thái của một mã trong kho

| Trạng thái | Nghĩa | Khi nào rời kho |
| --- | --- | --- |
| **Chờ đối soát** | Kho đã nhận, chưa khớp chứng từ sàn nào | Tự dọn khi quá **60 ngày** kể từ ngày đối soát |
| **Đã khớp** | Đã khớp chứng từ Shopee hoặc TikTok; ghi sàn, gian hàng, loại file, ngày khớp | Tự dọn khi quá **60 ngày** kể từ ngày khớp |

Mã **không bị xoá khi khớp** nữa, nên luôn tra lại được: ở tab **Đã đối soát** hoặc ô **Tìm một mã**.
Việc dọn chạy tự động mỗi đêm (2–3 giờ sáng) và ghi lịch sử số mã đã dọn mỗi loại. Đêm nào không có mã quá hạn thì không ghi gì.

### 1. Tải mã kho (tab "Kho / Đối soát")

1. Nhìn các thẻ đầu trang:
   - **Tải lần cuối: dd/mm/yyyy hh:mm · N mã trong kho**.
   - Nhãn xanh **"Đã có người tải kho"**: đã có người tải trong 7 ngày qua (tải trùng cũng không sao, mã đã có sẽ được gộp).
   - Nhãn vàng **"Chưa tải kho tuần này"**: cần tải.
2. Dán nguyên đoạn chat Zalo của kho vào ô lớn, và/hoặc kéo file Excel/CSV quét mã vạch vào ô file.
3. Bấm **Xử lý & xem trước**. Kiểm tra bảng:
   - **Mới**: mã chưa có trong kho, sẽ vào **Chờ đối soát** với ngày đối soát = **hôm nay**.
   - **Đã có trong kho**: giữ ngày đối soát cũ.
   - **Đã khớp trước đó (ngày …) — bỏ qua**: mã đã khớp rồi, **không** bị đưa về Chờ đối soát. Khung thông tin ghi rõ
     "N mã đã khớp trước đó (ngày …), bỏ qua".
   - **Mã sai**: quá ngắn hoặc quá dài, sẽ không gửi lên. Bấm ✕ để bỏ những mã nhìn là biết sai.
4. Bấm **Lưu vào kho chung**. Nếu kho đang có mã Chờ đối soát, trang hỏi:
   - **Gộp thêm vào kho** (nên chọn, mặc định): thêm mã mới, mã đã có giữ nguyên ngày cũ.
   - **Thay thế kho**: phần **Chờ đối soát** chỉ còn đúng các mã bạn gửi; mã **Đã khớp giữ nguyên**. Chỉ dùng khi kiểm kê lại toàn bộ.

### 2. Đối soát từng sàn (tab "Shopee" hoặc "TikTok")

Hai sàn đối soát **riêng**, cùng dùng một kho chung. Làm sàn nào trước cũng được.

1. Kéo file của sàn vào. Mỗi file trong danh sách có 2 ô:
   - **Gian hàng**: tự đoán từ tên file, sửa trực tiếp nếu sai.
   - **Loại file**: Giao KTC / Trả hàng / Đơn hàng / Khiếu nại / Khác. Trang đoán sẵn; chọn lại nếu sai.
     Loại file quyết định cột mã vận đơn được đọc: Shopee *Khiếu nại / Trả hàng* đọc cột "Mã vận đơn trả hàng";
     TikTok *Giao KTC* đọc "Tracking ID", *Trả hàng* đọc "Return Tracking ID". *Khác* thì trang tự nhận như trước.
2. Bấm **Tiến hành đối soát**. Trang đọc kho chung mới nhất rồi hiện kết quả, biểu đồ và bảng.
3. Trang hỏi: **"Sẽ chuyển N mã sang Đã khớp. Đồng ý?"**
   - **Đồng ý**: các mã Chờ đối soát có trong chứng từ của sàn này chuyển sang **Đã khớp**, kèm sàn, gian hàng, loại file, ngày khớp.
     Tab con **"Đã khớp kho (N)"** (cạnh "Chưa về kho" và "Kho chưa có chứng từ") liệt kê mọi mã trong chứng từ vừa nạp
     có trong kho, mỗi mã một lần: Gian hàng, Loại file (theo nhãn bạn gán ở danh sách file), Mã vận đơn, Ngày đối soát.
     Mã vừa chuyển lần này có nhãn **Vừa khớp**, mã đã khớp từ những lần trước có nhãn **Đã khớp từ trước**.
     Có ô **Tìm mã vận đơn…** và nút **Xuất Excel đã khớp kho** (xuất đúng các mã đang hiện theo ô tìm).
   - **Huỷ**: kho không đổi. Một dải vàng hiện nút **Chuyển N mã sang Đã khớp** để ghi lại sau.
4. **Đối soát lại thoải mái**: nạp lại file có mã đã khớp thì mã đó vẫn tính là khớp trong thẻ tổng kết và tỷ lệ, không báo lỗi,
   và **không** đổi ngày khớp, gian hàng hay loại file cũ.
5. Tab **"Chưa về kho" / "Thiếu trong đối soát"** = sàn báo, kho chưa nhận. Bấm **Xuất "Sàn báo, kho chưa nhận"** để có file
   Excel đúng bộ cột mẫu. Cột **KHO** để trống, người kho tự điền tay.
6. Tab **"Kho chưa có chứng từ"** = mã Chờ đối soát mà sàn chưa báo. Mã tồn ≥ 7 ngày tô đỏ.

**Vì sao đối soát sàn này không đụng mã của sàn kia?** Trang chỉ gửi lên danh sách mã **vừa có trong chứng từ của sàn đang chạy,
vừa đang Chờ đối soát trong kho**. Mã kho không xuất hiện trong chứng từ sàn này không bao giờ bị đổi trạng thái. Ở tab TikTok,
khi bật "Loại mã không thuộc TikTok", các mã SPXVN / GY… bị loại khỏi phép so khớp nên luôn giữ Chờ đối soát, chờ đến lượt Shopee.

### 3. Tab "Đã đối soát"

- Bảng mọi mã **Đã khớp**: mã, sàn, gian hàng, loại file, ngày đối soát, ngày khớp.
- Lọc theo **Sàn**, **Gian hàng**, **Tuần khớp** (tuần ISO, vd "Tuần 44/2026") và ô **Tìm mã**.
- **Xuất Excel** xuất đúng các mã đang hiện theo bộ lọc; cột mã khoá dạng Text.
- Dòng "Giữ 60 ngày rồi tự dọn" nhắc rằng mã Đã khớp tự rời kho sau 60 ngày kể từ ngày khớp.

### 4. Ô "Tìm một mã" (đầu trang, mọi tab)

Gõ hoặc dán một mã vận đơn: trang cho biết mã đang **Chờ đối soát**, **Đã khớp** hay **Không có trong kho**, kèm ngày đối soát,
ngày khớp, sàn, gian hàng, loại file.

### 5. File mẫu cho người mới nhận bàn giao

Ở tab Shopee hoặc TikTok, bấm **Tải file mẫu**: file Excel có hàng tiêu đề và 1 dòng ví dụ.

```
Tuần đối soát | KHO | Mã vận đơn | Gian hàng Shopee (hoặc TikTok) | Loại tệp tin | Tên sản phẩm | Phân loại
```

Xoá dòng ví dụ (quên xoá cũng không sao, dòng mã `012345678901` tự bị bỏ qua), điền các đơn sàn báo nhưng kho chưa nhận,
rồi kéo file vào ô file của tab sàn tương ứng. Cột Mã vận đơn đã khoá dạng Text.

### 6. Đổi giao diện

Bấm nút 🎨 ở góc phải thanh trên cùng, chọn **Mèo con**, **Vintage** hoặc **Tối giản**, và bật/tắt **Chế độ tối**.
Lựa chọn chỉ lưu trên trình duyệt của bạn, không ảnh hưởng người khác và không đụng tới kho chung.

---

## D. Lỡ ghi nhầm thì làm gì?

| Tình huống | Cách xử lý |
| --- | --- |
| Vừa lưu nhầm, vừa bấm "Thay thế kho" nhầm, hoặc vừa đồng ý chuyển nhầm sang Đã khớp | Tab **Kho / Đối soát › ↩ Hoàn tác**. Kho quay về **trạng thái ngay trước lần ghi gần nhất**, gồm cả **trạng thái, sàn, gian, loại file, ngày khớp** của từng mã. Bấm Hoàn tác lần nữa để làm lại. |
| Lần dọn tự động đêm qua xoá mã mà bạn còn cần | Nếu chưa ai ghi gì sau đó: **↩ Hoàn tác** (lần dọn cũng là một "lần ghi"). |
| Nhầm từ 2 lần ghi trước trở lên | Hoàn tác chỉ lùi được 1 bước. Xem bảng **Lịch sử** để biết lúc nào làm gì. Cách khôi phục đầy đủ (kể cả trạng thái): mở Google Sheet → **Tệp › Lịch sử phiên bản › Xem lịch sử phiên bản** → chọn thời điểm trước khi nhầm → **Khôi phục phiên bản này**. Sheet `KHO_TRUOC` là bản ngay trước lần ghi gần nhất. |
| Chỉ có file **Tải kho về Excel** đã sao lưu | Kéo file vào tab Kho → **Thay thế kho**: khôi phục phần **Chờ đối soát** với ngày đối soát cũ. Dòng **Đã khớp** trong file sao lưu bị bỏ qua (không bị đưa về Chờ); muốn khôi phục cả Đã khớp thì dùng Lịch sử phiên bản của Google Sheet. |
| Báo "Kho vừa được người khác thay đổi" | Có người khác vừa ghi. Bấm **⟳ Làm mới** rồi làm lại. |
| Báo "Có người khác đang ghi kho" | Hai người bấm cùng lúc (hoặc đang chạy dọn kho). Đợi vài giây rồi bấm lại. |
| Báo "Trang đang mở là bản cũ" | Tải lại trang (Ctrl+F5) rồi đối soát lại. |
| Báo "Máy chủ trả về một trang web thay vì dữ liệu" | Web app chưa để quyền **Bất kỳ ai**, hoặc link trong `js/config.js` không kết thúc bằng `/exec`. Làm lại bước A4 và B1. |
| Báo "Không kết nối được" / "phản hồi quá lâu" | Kiểm tra mạng rồi bấm lại. Dữ liệu bạn vừa dán vẫn còn trên trang. Nếu đó là thao tác ghi, bấm **Làm mới** trước để xem kho đã đổi chưa. |

**Sao lưu**: thỉnh thoảng (vd. mỗi tháng) bấm **⬇ Tải kho về Excel** và cất file. File có đủ cột Trạng thái, Sàn, Gian hàng,
Loại file, Ngày khớp. Google Sheet cũng có **Tệp › Lịch sử phiên bản** để khôi phục về bất kỳ thời điểm nào.

Lịch sử giữ khoảng 500 thao tác gần nhất trong sheet `LICH_SU`. Trang hiện 30 thao tác mới nhất.
