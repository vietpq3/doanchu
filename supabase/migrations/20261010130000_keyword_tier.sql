-- Độ khó: mỗi từ khóa có một mức (1 = phù hợp nhất, 2 = trung bình, 3 = ít phù hợp; xem data/keyword-tiers.json).
-- Độ khó d của ván chỉ bốc ngẫu nhiên các từ khóa có mức <= d: Thường = 1, Khó = 1+2, Rất khó = 1+2+3.
-- Bản app cũ gọi pick_keyword() / pick_keyword(n) vẫn chạy được: tham số mới có mặc định, và khi chưa có từ nào đủ mức
-- (vd chưa chạy lại npm run db:seed để điền keyword_tier) thì bốc trong toàn bộ từ khóa như trước.

-- Mức của từ; null = chưa xếp mức, coi như mức 3. Do npm run db:seed điền.
alter table public.words add column if not exists keyword_tier smallint check (keyword_tier between 1 and 3);

-- Độ khó lúc tạo ván (1–3); null với ván tạo trước khi có tính năng này hoặc chọn từ theo số #N / từ nhập tay.
alter table public.games add column if not exists difficulty smallint check (difficulty between 1 and 3);

-- Thay hàm cũ pick_keyword(integer) bằng bản có thêm độ khó (hai hàm cùng tên thì PostgREST không biết gọi hàm nào).
drop function if exists public.pick_keyword(integer);

-- Từ khóa số `n` (bỏ qua độ khó); bỏ trống `n` thì chọn ngẫu nhiên trong các từ khóa có mức <= `difficulty`.
-- Không có số đó thì trả về không dòng nào.
create or replace function public.pick_keyword(n integer default null, difficulty integer default 1)
returns table (picked_word text, picked_no integer)
language plpgsql
set search_path = public
as $$
declare
  max_tier integer := least(greatest(coalesce(difficulty, 1), 1), 3);
  total integer;
begin
  if n is not null then
    return query select w.word, w.keyword_no from words w where w.keyword_no = n limit 1;
    return;
  end if;
  select count(*) into total from words x where x.keyword_no is not null and coalesce(x.keyword_tier, 3) <= max_tier;
  if total = 0 then
    -- chưa xếp mức: bốc trong toàn bộ từ khóa
    max_tier := 3;
    select count(*) into total from words x where x.keyword_no is not null;
  end if;
  return query
    select w.word, w.keyword_no
    from words w
    where w.keyword_no is not null and coalesce(w.keyword_tier, 3) <= max_tier
    order by w.keyword_no
    offset floor(random() * total)::integer
    limit 1;
end
$$;

-- Chỉ server (secret key = role service_role) được gọi; publishable/anon key thì không.
revoke all on function public.pick_keyword(integer, integer) from public, anon, authenticated;
grant execute on function public.pick_keyword(integer, integer) to service_role;

-- PostgREST nạp lại danh sách hàm ngay (không chờ tự phát hiện).
notify pgrst, 'reload schema';
