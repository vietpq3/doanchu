# Bộ tiêu chí xếp mức từ cho game Đoán Chữ — phiên bản v1

Game Đoán Chữ: người chơi đoán một từ ghép tiếng Việt. Ta chọn từ khóa cho game: phải là từ mà **người Việt hiện đại**
(đời sống, báo chí, văn học khoảng 100 năm gần đây) hiểu và đoán được. Mỗi từ được xếp vào **một mức** và **một nhóm**.

## Ba mức

- **1 = Phù hợp nhất**: từ thông dụng, hiện đại; Hán Việt thường dùng; hay gặp trong đời sống, báo chí, văn học hiện đại.
- **2 = Trung bình**: Hán Việt cũ / văn chương; thuần Việt nhưng hiếm gặp; phương ngữ; từ lóng; thuật ngữ chuyên sâu.
- **3 = Ít phù hợp**: danh từ riêng; từ Việt hóa phiên âm chuyên ngành; từ phụ trợ / hư từ; biến thể chính tả; thô tục; không rõ nghĩa.

## Nhóm (mã) và mức tương ứng

| Mã | Nhóm | Mức |
|---|---|---|
| TU_THUONG | Từ thường (thuần Việt hoặc Hán Việt) | phổ biến → 1; hiếm gặp → 2 |
| HAN_VIET_CU | Hán Việt cũ, văn chương, trang trọng kiểu cũ (anh thư, cô tịch, chưởng bạ) | 2 |
| LAY | Từ láy (lung linh, xinh xắn) | quen thuộc → 1; hiếm gặp → 2 |
| THANH_NGU | Thành ngữ, tục ngữ, quán ngữ 3–5 âm tiết | quen thuộc (ăn cháo đá bát) → 1; ít gặp, cổ → 2 |
| KHAU_NGU | Khẩu ngữ | phổ biến → 1; ít gặp → 2 |
| LONG | Từ lóng, từ mới trên mạng | 2 |
| PHUONG_NGU | Phương ngữ, từ địa phương | 2 |
| THUAT_NGU | Thuật ngữ khoa học, kỹ thuật, y học, luật, kinh tế, tin học, quân sự… (không phải phiên âm) | phổ thông (máy tính, vi khuẩn) → 1; chuyên sâu (đồng phân) → 2 |
| TON_GIAO | Tôn giáo, tín ngưỡng | phổ biến (chùa chiền, niết bàn) → 1; chuyên sâu → 2 |
| LICH_SU | Lịch sử: chức quan, thể chế, sự vật thời xưa | phổ biến (vua chúa, trạng nguyên) → 1; chuyên sâu → 2 |
| SINH_VAT | Động vật, thực vật, món ăn | quen thuộc (cá chép, bánh chưng) → 1; tên địa phương, loài hiếm → 2 |
| VIET_HOA | Từ mượn tiếng nước ngoài, phiên âm | đã quen trong đời sống (cà phê, xà phòng, sô cô la) → 1; phiên âm chuyên ngành, tên khoa học (cacbon đioxit, sun phua) → 3 |
| TEN_RIENG | Danh từ riêng: địa danh (kể cả địa danh cũ), tên người, triều đại, tác phẩm, tổ chức | 3 |
| PHU_TRO | Từ phụ trợ, hư từ, từ đệm, quán ngữ đưa đẩy (thì ra, chăng nữa, vả lại) | 3 |
| BIEN_THE | Biến thể chính tả, viết tắt, "dạng viết khác của…" | 3 |
| THO_TUC | Thô tục, tục tĩu, nhạy cảm (tình dục, xúc phạm, chửi bới) | 3 |
| KHONG_RO | Cụm từ tự do không thành từ, giải nghĩa lỗi hoặc không hiểu được | 3 |

Phân vân giữa hai mức: chọn mức mà **đa số người Việt hiện đại** sẽ thấy đúng. Từ người chơi bình thường nghe là hiểu ngay → 1.

## Cột trong lô (dùng làm gợi ý, kết hợp với hiểu biết của bạn)

- `tần_suất_tin_tức`: số lần xuất hiện trên 1 triệu câu báo chí 2022. Từ 20 trở lên thường là từ quen; 0 là hiếm trên báo,
  nhưng từ văn học, đời thường hay thành ngữ vẫn có thể quen dù ít lên báo.
- `viết_hoa_tin_tức`, `viết_hoa_từ_điển`: tỉ lệ viết hoa từng âm tiết. Cao (≥ 80%, khi tần suất đáng kể) thường là tên riêng,
  nhưng phải xem nghĩa: "đông nam" hay viết hoa vì "Đông Nam Á" nhưng bản thân là chỉ hướng → từ thường.
- `nhãn`: "cũ", "văn chương", "hiếm" thường → mức 2; "phương ngữ" → PHUONG_NGU; "lóng" → LONG; "thông tục" → xem THO_TUC.
- `từ_loại`: "phụ trợ (Wiktionary)" chỉ là **chưa phân loại**, không có nghĩa là hư từ; hãy đọc nghĩa.
- `trạng_thái`: "khóa" = đang là từ khóa; "loại:tên riêng" / "loại:phụ trợ" = đang bị bộ lọc tự động loại, **có thể loại nhầm**.

## Định dạng kết quả

Mỗi từ một dòng, giữ đúng thứ tự trong lô, **chép nguyên văn từ**, 4 cột cách nhau bằng một ký tự tab:

```
từ<TAB>mức<TAB>mã<TAB>gợi ý
```

- `mức`: 1, 2 hoặc 3. `mã`: một mã trong bảng trên.
- `gợi ý`: 1–4 chữ tiếng Việt nói vì sao (vd `địa danh cũ`, `phiên âm hóa học`, `hán việt cổ`, `thông dụng`). Không dùng tab.
- Không có dòng tiêu đề, không có dòng nào khác.
