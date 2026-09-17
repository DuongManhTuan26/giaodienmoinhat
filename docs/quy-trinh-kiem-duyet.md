# Quy trình kiểm duyệt

Viết ra sau khi một đợt kiểm duyệt tìm thấy 5 lỗi, mà **cả 5 đều do chính đợt
sửa trước đó đẻ ra**. Mục tiêu của quy trình này là hai điều cùng lúc:

- **Không bỏ sót lỗi** — đếm bằng máy, không bằng mắt
- **Không báo lỗi bừa** — chưa dựng lại được thì chưa phải lỗi

Hai điều đó chống nhau. Bỏ sót thì sản phẩm hỏng; báo bừa thì sửa lung tung,
đẻ lỗi mới, và không bao giờ có hồi kết. Quy trình dưới đây giữ cả hai.

---

## Luật 0 — Ba mức của một phát hiện

Không bao giờ được gọi một thứ là "lỗi" khi chưa qua mức 3.

| Mức | Tên | Điều kiện | Được phép làm gì |
|---|---|---|---|
| 1 | **Nghi vấn** | Đọc mã thấy ngờ ngợ | Ghi lại. KHÔNG sửa. KHÔNG báo cáo là lỗi |
| 2 | **Có cơ sở** | Chỉ được ra dòng mã và lập luận | Dựng phép đo để lên mức 3 |
| 3 | **Lỗi** | **Đã chạy và thấy nó sai** | Được sửa |

Báo cáo phải nói đúng mức. Mức 1 và 2 ghi rõ là *chưa chứng thực*, không trộn
chung với mức 3.

> Đã xảy ra thật ở dự án này: tôi báo "không còn chỗ nào đặt `ai_enabled = FALSE`"
> khi mới đọc lướt — sai. Và báo "bình luận công khai chưa được tạo" trong khi
> ảnh chụp màn hình của chủ shop chứng minh ngược lại.

---

## Bước 1 — Liệt kê bằng máy, trước khi gõ phím

Mọi thay đổi động tới một **nguyên tắc dùng ở nhiều nơi** đều phải bắt đầu bằng
đếm. Không đọc mã rồi sửa chỗ nhìn thấy.

```bash
npm run liet-ke -- "await handoff(" "tuChu.bat"
npm run liet-ke -- "ai_enabled = FALSE"
```

Kết quả phải là **n/n**. Sót một chỗ là sót một lỗi.

> Năm lỗi nặng nhất của dự án sinh ra từ đúng chỗ này: đổi nguyên tắc "gặp khó
> thì nhường người thật" thành "không có người thật", nguyên tắc cũ nằm ở 8 chỗ,
> sửa 3 chỗ đang nhìn thấy, sót 5.

---

## Bước 2 — Dựng lại lỗi TRƯỚC khi sửa

Chưa làm nó sai được trước mặt mình thì chưa được sửa. Đây là chốt chặn chống
"sửa lung tung".

Phép đo phải:
- In ra **giá trị thật**, không in "OK" hay "đạt"
- So hai bên **trước và sau**, để biết sửa có thay đổi gì không
- Dùng đúng đường mã của sản phẩm, không chép lại logic ra kịch bản riêng

> Chép lại logic ra kịch bản riêng rồi đo kịch bản đó là đang đo chính mình.
> Nếu buộc phải chép (hàm không xuất), thêm một phép kiểm cấu trúc buộc bản
> chép và bản thật phải khớp nhau — xem mục `[tiền]` trong `kiem-tra.mts`.

---

## Bước 3 — Tự nghi ngờ phép đo trước khi nghi ngờ mã

Phần lớn "lỗi" tìm thấy hoá ra là phép đo sai. Trước khi kết luận mã hỏng,
kiểm ba thứ này:

1. **Chữ hoa chữ thường.** CSS `uppercase` đổi `innerText`, nên tìm
   `"Giọng bài viết"` sẽ trượt trong khi trên màn hình chữ vẫn hiện.
   *Đã sai 3 lần trong một phiên.*
2. **Nút có biểu tượng.** `textContent` của nút là `"addThêm bước"`, không phải
   `"Thêm bước"`. Dùng `includes`, đừng dùng `===`.
3. **Chú thích trùng chuỗi.** `indexOf("ai_enabled = FALSE")` bắt trúng dòng chú
   thích nói về nó. Tìm câu lệnh thật, ví dụ cả mệnh đề SQL.
4. **Đo khoảng cách ký tự hay số dòng.** *Đã sai 3 lần.* Chốt cách chỗ cần chốt
   27 dòng trong khi cửa sổ đặt 16; nhánh cách khai báo 677 ký tự trong khi trần
   đặt 600. Khoảng cách đổi theo từng lần sửa chú thích nên **không bao giờ là
   thứ đáng đo**. Đo THỨ TỰ (`indexOf` cái này nhỏ hơn `indexOf` cái kia), hoặc
   đếm số chỗ gọi — hai thứ đó không đổi khi viết thêm chú thích.
5. **Tìm tên trường ở bất kỳ đâu trong hàm.** Tên còn nằm trong khai báo kiểu và
   chú thích, nên xoá khỏi phần gửi đi vẫn báo đạt. Tìm đúng dạng dùng thật, ví
   dụ `platform: params.`.

Và kiểm bối cảnh: hội thoại quá 7 ngày thì mọi phép gửi đều bị chặn — đó là
**mã chạy đúng**, không phải lỗi. *Đã suýt báo nhầm một lần.*

---

## Bước 4 — Đo lại sau khi sửa, bằng đúng phép đo cũ

Cùng một phép đo, chạy trước và sau. Khác phép đo thì không so được.

---

## Bước 5 — Biến bằng chứng thành phép kiểm giữ lại

Kịch bản chạy một lần rồi xoá là vứt đi công sức. Mọi lỗi mức 3 đã sửa đều phải
thành một dòng trong `scripts/kiem-tra.mts`.

```bash
npm run kiem-tra
```

Chỉ nhận hàm thuần và kiểm cấu trúc: chạy trong một giây, không chạm database,
không tốn tiền gọi AI. Nhờ vậy chạy được mọi lúc, không có cớ để bỏ qua.

---

## Bước 6 — Kiểm tra chính bộ kiểm tra

Phép kiểm luôn báo xanh còn tệ hơn không có: nó tạo cảm giác an toàn giả.

```bash
npm run kiem-tra-nguoc
```

Nó đục lỗ đúng vào từng chốt chặn rồi bắt `kiem-tra` phải kêu. Không kêu nghĩa
là phép kiểm đó là đồ giả — **sửa phép kiểm, đừng sửa phép thử**.

> Chuyện này đã xảy ra: phép kiểm "mọi tin gửi khách đều qua bộ gỡ markdown"
> chỉ tìm chuỗi, nên thêm `//` vào đầu dòng là nó vẫn báo đạt trong khi tính
> năng đã chết.

---

## Bước 7 — Chạm dữ liệu thật thì lưu và trả lại

Kiểm thử trên database thật phải:

1. Đọc và **giữ nguyên trạng** trước khi đổi
2. Đổi, đo
3. **Trả lại y như cũ**, kể cả khi giữa chừng có lỗi
4. Đọc lại để **xác nhận** đã trả đúng

Tốt hơn nữa: dựng dữ liệu riêng cho lần thử rồi xoá, không đụng dữ liệu thật.

> Đã xảy ra: một kịch bản thử lỗi giữa chừng, không có phần trả lại, làm bẩn 4
> dòng bình luận thật của chủ shop và bật nhầm một chế độ. Lần sau phải sửa tay.

---

## Bước 8 — Nói rõ phần KHÔNG chứng thực được

Có những thứ không thể kiểm nếu thiếu điều kiện thật. Không được im lặng cho
qua, phải đánh dấu trong báo cáo:

- Cần tài khoản quảng cáo đã kết nối → toàn bộ AI Quảng Cáo
- Cần khách thật nhắn tin → hành vi thật của AI trên Messenger
- Cần chờ đủ thời gian → nhắc lại sau 90 phút, lịch đăng bài theo ngày

Ghi là "chưa chứng thực" và nói rõ cần gì để chứng thực. **Không bao giờ báo
"đã kiểm tra" cho thứ chưa chạy lần nào.**

---

## Bảng kiểm trước khi bàn giao

```bash
npm run kiem-tra          # 44 điểm, phải đạt hết
npm run kiem-tra-nguoc    # mọi chốt chặn phải có phép kiểm thật
npx tsc --noEmit          # không lỗi kiểu
npm run build             # dựng được bản chạy thật
```

Và trả lời được ba câu:

1. Lỗi nào đã **dựng lại được** trước khi sửa?
2. Nguyên tắc nào bị đổi, và đã **đếm đủ** chỗ dùng chưa?
3. Phần nào **chưa chứng thực được**, thiếu điều kiện gì?
