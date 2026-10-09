-- Nút Hint: mỗi ván được gợi ý tối đa 3 ô (xem config.maxHints).
-- Chỉ thêm cột, có giá trị mặc định: bản chạy trước đó (không biết hai cột này) vẫn chạy bình thường.

-- Chỉ số các ô đã gợi ý, tính trên toàn bộ ô chữ từ 0, theo thứ tự gợi ý: [3, 7]
alter table public.games add column if not exists hints jsonb not null default '[]'::jsonb;
-- Số gợi ý đã lưu; dùng để chặn ghi đè khi gửi trùng (giống cột turns)
alter table public.games add column if not exists hint_count smallint not null default 0;
