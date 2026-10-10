/**
 * Lấy dữ liệu từ khóa cho một ván đấu từ Supabase: chọn từ (hàm SQL pick_keyword(), xem supabase/migrations) và lấy giải nghĩa
 * (bảng words). Dùng secret key nên chỉ chạy ở worker.
 */
import { VERSUS } from '../src/lib/versus/config';
import type { Definition } from '../src/lib/game/types';

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

/**
 * Giải nghĩa của `word` (đã chuẩn hoá) để hiện ở màn hình kết thúc, tối đa VERSUS.maxDefinitions nghĩa.
 * Lấy sẵn lúc bắt đầu ván; lỗi hay chưa có nghĩa thì trả về [] (ván vẫn chơi bình thường, màn kết thúc báo chưa có giải nghĩa).
 */
export async function fetchDefinitions(env: KeywordEnv, word: string): Promise<Definition[]> {
  const url = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SECRET_KEY;
  if (!url || !key) return [];
  try {
    const res = await fetch(`${url}/rest/v1/words?word=eq.${encodeURIComponent(word)}&select=definitions`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
      console.error(`đọc giải nghĩa lỗi ${res.status}`);
      return [];
    }
    const rows = (await res.json()) as { definitions?: Definition[] }[];
    return (rows[0]?.definitions ?? []).slice(0, VERSUS.maxDefinitions);
  } catch (err) {
    console.error('đọc giải nghĩa lỗi mạng', err);
    return [];
  }
}
