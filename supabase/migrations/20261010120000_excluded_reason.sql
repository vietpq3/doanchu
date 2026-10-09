-- Lý do một từ bị loại khỏi bộ từ khóa dù đủ điều kiện (data/keyword-exclusions.json):
--   auxiliary    từ phụ trợ (nhãn X của TVTD)
--   proper_noun  danh từ riêng (địa danh, tên người, tôn giáo, dân tộc...)
--   manual       nằm trong danh sách "exclude"
-- null: từ khóa, hoặc từ không đủ điều kiện vì lý do khác (quá ngắn/dài, chưa có giải nghĩa, từ đơn...).
-- Chỉ để xem/lọc trên Supabase; app không đọc cột này (từ khóa vẫn xác định bằng is_keyword / keyword_no).
-- Chỉ thêm cột, bản app cũ không bị ảnh hưởng. Do npm run db:seed điền.
alter table public.words add column if not exists excluded_reason text;
