-- Đoán Chữ: từ điển + ván chơi.
-- Mọi truy vấn chạy ở server bằng secret key (bỏ qua RLS). RLS bật và KHÔNG có policy nào,
-- nên publishable/anon key không đọc được gì — đặc biệt là đáp án trong bảng games.

-- Từ điển: mọi từ ghép tiếng Việt (>= 2 âm tiết), đã chuẩn hoá theo kiểu dấu của game.
create table if not exists public.words (
  word        text primary key,
  -- [{ "pos": "Danh từ", "text": "...", "example": "..." }]
  definitions jsonb   not null default '[]'::jsonb,
  -- có trong bộ từ khóa (data/keywords.json)
  is_keyword  boolean not null default false
);
create index if not exists words_keyword_idx on public.words (word) where is_keyword;

-- Ván chơi: từ khóa chỉ nằm ở đây cho tới khi ván kết thúc.
create table if not exists public.games (
  id         uuid primary key default gen_random_uuid(),
  answer     text        not null,
  -- [{ "word": "vụ mùa", "statuses": ["correct", ...] }]
  guesses    jsonb       not null default '[]'::jsonb,
  turns      smallint    not null default 0,
  status     text        not null default 'playing' check (status in ('playing', 'won', 'lost')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists games_updated_at_idx on public.games (updated_at);

alter table public.words enable row level security;
alter table public.games enable row level security;
