# Hướng dẫn cài đặt và sử dụng

Phần A và B chỉ làm **một lần** (người quản trị). Phần C là việc hằng tuần của cả nhóm.

---

## A. Tạo kho chung trên Google Sheet

1. Vào <https://sheets.google.com>, tạo **Bảng tính trống mới**. Đặt tên dễ nhận, ví dụ `KHO CHUNG DOI SOAT`.
   Dùng một bảng tính **riêng**, không dùng chung với bảng lợi nhuận hay bảng nào khác.
2. Trong bảng tính: **Tiện ích mở rộng › Apps Script**.
3. Xoá hết nội dung có sẵn trong `Code.gs`, dán **toàn bộ** nội dung file [`apps-script/Code.gs`](apps-script/Code.gs) của repo này. Bấm 💾 **Lưu**.
4. Bấm **Triển khai › Tùy chọn triển khai mới**:
   - Bấm biểu tượng bánh răng ở "Chọn loại", chọn **Ứng dụng web**.
   - **Mô tả**: `Kho chung v1` (tuỳ ý).
   - **Thực thi dưới dạng**: **Tôi** (tài khoản của bạn).
   - **Người có quyền truy cập**: **Bất kỳ ai** (Anyone). Đừng chọn "Bất kỳ ai có Tài khoản Google", vì trang sẽ không đọc được.
   - Bấm **Triển khai**.
5. Google hỏi cấp quyền: **Cấp quyền truy cập** → chọn tài khoản → nếu hiện "Google chưa xác minh ứng dụng này" thì bấm
   **Nâng cao › Đi tới … (không an toàn)** → **Cho phép**. Script chỉ đọc/ghi chính bảng tính này.
6. Sao chép **URL ứng dụng web**, có dạng `https://script.google.com/macros/s/AKfy…/exec`. Link phải **kết thúc bằng `/exec`**.

Kiểm tra nhanh: mở link `/exec` trên trình duyệt, phải thấy một dòng chữ bắt đầu bằng `{"ok":true,...`.
Lần đầu gọi, script tự tạo các sheet `KHO`, `KHO_TRUOC`, `THONG_TIN`, `LICH_SU`.

> **Khi sửa Code.gs về sau**: dùng **Triển khai › Quản lý tùy chọn triển khai › ✏️ › Phiên bản: Phiên bản mới › Triển khai**.
> Cách này giữ nguyên link `/exec`. Nếu tạo "Tùy chọn triển khai mới" thì link đổi và phải dán lại vào `js/config.js`.

## B. Đưa trang lên GitHub Pages

1. Mở file [`js/config.js`](js/config.js) trên GitHub (bấm ✏️ để sửa), dán link vào giữa hai dấu nháy:
   ```js
   var API_URL = 'https://script.google.com/macros/s/AKfy…/exec';
   ```
   Commit vào nhánh `main`.
2. Trong repo: **Settings › Pages** → **Source: Deploy from a branch** → **Branch: `main`**, thư mục **`/ (root)`** → **Save**.
3. Sau 1–2 phút, trang có địa chỉ dạng `https://<tên-tài-khoản>.github.io/doi-soat-kho/`. Gửi link này cho nhóm (tối đa ~5 người).

Nếu `API_URL` còn trống, trang hiện khung vàng hướng dẫn thay vì báo lỗi.

Có thể chuyển dữ liệu từ **Sổ mã cũ** sang kho chung. Trong công cụ cũ, bấm **⬇ Tải sổ mã** để được file `So_ma_doi_soat_….xlsx`.
Trên trang mới, ở tab **Kho / Đối soát**, kéo file đó vào ô file → **Xử lý & xem trước** → **Lưu vào kho chung**.
File sổ mã có cột *Ngày đối soát* và *Số ngày tồn* nên **giữ nguyên ngày đối soát cũ**, tuổi tồn không bị reset.

---

## C. Dùng hằng tuần

### 1. Tải mã kho (tab "Kho / Đối soát")

1. Nhìn dòng trạng thái đầu trang:
   - Nhãn xanh **"Tuần này đã có người tải kho"**: đã có người tải trong 7 ngày qua. Xem tên và giờ để tránh tải trùng
     (tải trùng cũng không sao, mã đã có sẽ được gộp).
   - Nhãn vàng **"Chưa tải kho tuần này"**: cần tải.
2. Gõ **Tên người tải** (trình duyệt nhớ cho lần sau).
3. Dán nguyên đoạn chat Zalo của kho vào ô lớn, và/hoặc kéo file Excel/CSV quét mã vạch vào ô file.
4. Bấm **Xử lý & xem trước**. Kiểm tra bảng:
   - **Mới**: mã chưa có trong kho, sẽ nhận ngày đối soát = **hôm nay**.
   - **Đã có trong kho**: giữ ngày đối soát cũ.
   - **Mã sai**: quá ngắn hoặc quá dài, sẽ không gửi lên. Bấm ✕ để bỏ những mã nhìn là biết sai.
   - Khung vàng "dòng chưa nhận diện được": các dòng chat không phải mã, chỉ để bạn soát lại.
5. Bấm **Lưu vào kho chung**. Nếu kho đã có dữ liệu, trang hỏi:
   - **Gộp thêm vào kho** (nên chọn, mặc định): thêm mã mới, mã đã có giữ nguyên ngày cũ.
   - **Thay thế kho**: kho chỉ còn đúng các mã bạn gửi, mọi mã khác bị bỏ. Chỉ dùng khi biết chắc (vd. kiểm kê lại toàn bộ kho).
     Trang hỏi lại thêm một lần.

Ngày quét ghi trong tin nhắn Zalo **không** được dùng làm ngày đối soát. Ngày đối soát luôn là ngày mã được tải lên kho chung.

### 2. Đối soát từng sàn (tab "Shopee" hoặc "TikTok")

Hai sàn đối soát **riêng**, cùng dùng một kho chung. Làm sàn nào trước cũng được.

1. Kéo file của sàn vào (Shopee: đơn hàng + khiếu nại; TikTok: Giao không thành công + Trả hàng). Có thể kéo thêm **file mẫu
   đơn thiếu đã điền** hoặc file "Sàn báo, kho chưa nhận" của tuần trước.
2. Bấm **Tiến hành đối soát**. Trang đọc kho chung mới nhất rồi hiện kết quả, biểu đồ và bảng như công cụ cũ.
3. Trang hỏi: **"Sẽ xoá N mã đã khớp khỏi kho chung. Đồng ý?"**
   - **Đồng ý**: các mã đã có chứng từ của sàn này bị xoá khỏi kho chung ("bụp"). Mã kho còn lệch giữ nguyên, ngày đối soát cũ.
   - **Huỷ**: kho không đổi. Một dải vàng hiện nút **Xoá N mã đã khớp khỏi kho** để ghi lại sau.
4. Tab **"Chưa về kho" / "Thiếu trong đối soát"** = sàn báo, kho chưa nhận. Bấm **Xuất "Sàn báo, kho chưa nhận"** để có file
   Excel đúng bộ cột mẫu. Cột **KHO** để trống, người kho tự điền tay (vd. "đã tìm thấy", "chưa thấy"). Khi nạp lại, trang đọc
   nguyên văn cột này.
5. Tab **"Kho chưa có chứng từ"** = kho đã nhận nhưng sàn chưa báo. Mã tồn ≥ 7 ngày tô đỏ.

**Vì sao đối soát sàn này không làm mất mã của sàn kia?** Trang chỉ gửi lên danh sách mã **vừa có trong chứng từ của sàn đang
chạy, vừa có trong kho**. Mã kho không xuất hiện trong chứng từ sàn này (có thể là hàng trả của sàn kia) không bao giờ bị
gửi đi để xoá. Ở tab TikTok, khi bật "Loại mã không thuộc TikTok", các mã SPXVN / GY… bị loại khỏi phép so khớp nên cũng
không bao giờ bị xoá. Chúng chờ đến lượt đối soát Shopee.

### 3. File mẫu cho người mới nhận bàn giao

Ở tab Shopee hoặc TikTok, bấm **Tải file mẫu**: file Excel có hàng tiêu đề và 1 dòng ví dụ.

```
Tuần đối soát | KHO | Mã vận đơn | Gian hàng Shopee (hoặc TikTok) | Loại tệp tin | Tên sản phẩm | Phân loại
```

Xoá dòng ví dụ (quên xoá cũng không sao, dòng mã `012345678901` tự bị bỏ qua), điền các đơn sàn báo nhưng kho chưa nhận,
rồi kéo file vào ô file của tab sàn tương ứng. Cột Mã vận đơn đã khoá dạng Text: gõ hoặc dán mã 12 số vẫn giữ nguyên.

### 4. Đổi giao diện

Bấm nút 🎨 ở góc phải thanh trên cùng, chọn **Mèo con**, **Vintage** hoặc **Tối giản**, và bật/tắt **Chế độ tối**.
Lựa chọn chỉ lưu trên trình duyệt của bạn, không ảnh hưởng người khác và không đụng tới kho chung.

---

## D. Lỡ ghi nhầm thì làm gì?

| Tình huống | Cách xử lý |
| --- | --- |
| Vừa lưu nhầm, vừa bấm "Thay thế kho" nhầm, hoặc vừa đồng ý xoá nhầm sau đối soát | Tab **Kho / Đối soát › ↩ Hoàn tác**. Kho quay về **trạng thái ngay trước lần ghi gần nhất** (của bất kỳ ai). Bấm Hoàn tác lần nữa để làm lại. |
| Nhầm từ 2 lần ghi trước trở lên | Hoàn tác chỉ lùi được 1 bước. Xem bảng **Lịch sử** để biết ai làm gì, lúc nào. Mở Google Sheet: sheet `KHO_TRUOC` là bản ngay trước lần ghi gần nhất. Hoặc dùng file **Tải kho về Excel** đã sao lưu: kéo file đó vào tab Kho, chọn **Thay thế kho**. File này giữ nguyên ngày đối soát. |
| Báo "Kho vừa được người khác thay đổi" | Có người khác vừa ghi. Bấm **⟳ Làm mới** rồi làm lại. |
| Báo "Có người khác đang ghi kho" | Hai người bấm cùng lúc. Đợi vài giây rồi bấm lại. |
| Báo "Máy chủ trả về một trang web thay vì dữ liệu" | Web app chưa để quyền **Bất kỳ ai**, hoặc link trong `js/config.js` không kết thúc bằng `/exec`. Làm lại bước A4 và B1. |
| Báo "Không kết nối được" / "phản hồi quá lâu" | Kiểm tra mạng rồi bấm lại. Dữ liệu bạn vừa dán vẫn còn trên trang. Nếu đó là thao tác ghi, bấm **Làm mới** trước để xem kho đã đổi chưa. |

**Sao lưu**: thỉnh thoảng (vd. mỗi tháng) bấm **⬇ Tải kho về Excel** và cất file. Google Sheet cũng có
**Tệp › Lịch sử phiên bản** để khôi phục về bất kỳ thời điểm nào.

Lịch sử giữ khoảng 500 thao tác gần nhất trong sheet `LICH_SU`. Trang hiện 30 thao tác mới nhất.
