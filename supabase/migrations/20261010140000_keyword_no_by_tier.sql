-- Đánh số từ khóa theo mức trước rồi mới theo chữ: mức 1 là #1..#n1, mức 2 tiếp theo, mức 3 cuối cùng (chưa xếp mức coi như 3).
-- Nhờ vậy mỗi độ khó là một khoảng số liền nhau bắt đầu từ 1 (Thường = mức 1, Khó = mức 1+2, Rất khó = tất cả), và cùng một số
-- luôn là cùng một từ dù đang chọn độ khó nào. Chỉ đổi thứ tự trong renumber_keywords(); chạy npm run db:seed (hoặc gọi hàm này)
-- để đánh số lại. Bản app cũ không bị hỏng, chỉ thấy số #N của từng từ đổi.
create or replace function public.renumber_keywords() returns integer
language plpgsql
set search_path = public
as $$
declare
  total integer;
begin
  update words set keyword_no = null where keyword_no is not null and not is_keyword;
  update words w set keyword_no = r.n
  from (select word, row_number() over (order by coalesce(keyword_tier, 3), word)::integer as n from words where is_keyword) r
  where w.word = r.word and w.keyword_no is distinct from r.n;
  select count(*) into total from words where keyword_no is not null;
  return total;
end
$$;

revoke all on function public.renumber_keywords() from public, anon, authenticated;
grant execute on function public.renumber_keywords() to service_role;
