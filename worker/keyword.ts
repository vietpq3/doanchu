/** Chọn từ khóa cho một ván đấu: gọi hàm SQL pick_keyword() của Supabase (xem supabase/migrations). Dùng secret key nên chỉ chạy ở worker. */
export interface KeywordEnv {
  SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SECRET_KEY?: string;
}

/** Từ khóa ngẫu nhiên; null nếu không chọn được (thiếu cấu hình, Supabase lỗi hoặc bộ từ khóa trống). */
export async function pickRandomKeyword(env: KeywordEnv): Promise<string | null> {
  const url = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    console.error('Thiếu SUPABASE_URL hoặc SUPABASE_SECRET_KEY để chọn từ khóa');
    return null;
  }
  try {
    const res = await fetch(`${url}/rest/v1/rpc/pick_keyword`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!res.ok) {
      console.error(`pick_keyword lỗi ${res.status}`);
      return null;
    }
    const rows = (await res.json()) as { picked_word?: string }[];
    return rows[0]?.picked_word ?? null;
  } catch (err) {
    console.error('pick_keyword lỗi mạng', err);
    return null;
  }
}
