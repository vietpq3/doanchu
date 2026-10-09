-- Số thứ tự của từ khóa (#1, #2, ...): vị trí của từ trong các dòng is_keyword của bảng words, xếp theo cột word.
-- Người chơi thấy số này ở góc trên bên trái và có thể chọn số để chơi lại đúng từ khóa đó.
-- Chỉ thêm cột, chỉ mục và hàm mới; không đổi gì mà bản app cũ đang dùng (kể cả hàm random_keyword()).

-- Số thứ tự của từ khóa trong bảng words; null nếu không phải từ khóa. Do renumber_keywords() điền.
alter table public.words add column if not exists keyword_no integer;
create index if not exists words_keyword_no_idx on public.words (keyword_no) where keyword_no is not null;

-- Số thứ tự của từ khóa lúc tạo ván; null với ván tạo trước khi có tính năng này hoặc từ không phải từ khóa.
alter table public.games add column if not exists keyword_no integer;

-- Đánh số lại 1..N theo thứ tự cột word (số bằng nhau thì bỏ qua, không ghi lại dòng đó). Trả về N.
-- Chạy sau mỗi lần nạp từ điển (npm run db:seed). Thêm hoặc bớt từ khóa thì số của các từ phía sau sẽ dịch theo.
create or replace function public.renumber_keywords() returns integer
language plpgsql
set search_path = public
as $$
declare
  total integer;
begin
  update words set keyword_no = null where keyword_no is not null and not is_keyword;
  update words w set keyword_no = r.n
  from (select word, row_number() over (order by word)::integer as n from words where is_keyword) r
  where w.word = r.word and w.keyword_no is distinct from r.n;
  select count(*) into total from words where keyword_no is not null;
  return total;
end
$$;

-- Từ khóa số `n`; bỏ trống `n` thì chọn ngẫu nhiên. Không có số đó thì trả về không dòng nào.
create or replace function public.pick_keyword(n integer default null)
returns table (picked_word text, picked_no integer)
language plpgsql
set search_path = public
as $$
begin
  if n is null then
    return query
      select w.word, w.keyword_no
      from words w
      where w.keyword_no is not null
      order by w.keyword_no
      offset floor(random() * (select count(*) from words x where x.keyword_no is not null))::integer
      limit 1;
  else
    return query select w.word, w.keyword_no from words w where w.keyword_no = n limit 1;
  end if;
end
$$;

-- Chỉ server (secret key = role service_role) được gọi; publishable/anon key thì không.
revoke all on function public.renumber_keywords() from public, anon, authenticated;
grant execute on function public.renumber_keywords() to service_role;
revoke all on function public.pick_keyword(integer) from public, anon, authenticated;
grant execute on function public.pick_keyword(integer) to service_role;
