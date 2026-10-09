-- Chọn ngẫu nhiên một từ khóa ngay trong CSDL.
-- Bộ từ khóa lên tới hàng chục nghìn từ nên app không tải cả danh sách về để bốc thăm nữa
-- (sẽ cần ~40 request mỗi lần, vượt giới hạn subrequest của Cloudflare Workers).
-- Chỉ thêm hàm; bản app cũ không biết tới hàm này vẫn chạy bình thường.
create or replace function public.random_keyword() returns text
language sql
set search_path = public
as $$
  select word
  from words
  where is_keyword
  order by word
  offset floor(random() * (select count(*) from words where is_keyword))::int
  limit 1
$$;

-- Chỉ server (secret key = role service_role) được gọi; publishable/anon key thì không.
revoke all on function public.random_keyword() from public, anon, authenticated;
grant execute on function public.random_keyword() to service_role;
