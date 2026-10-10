import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { parseDifficulty, type KeywordCounts } from '@/lib/game/difficulty';
import type { Definition } from '@/lib/game/types';
import { config } from './config';
import type { GameRecord, Repository } from './repository';

interface GameRow {
  id: string;
  answer: string;
  keyword_no: number | null;
  difficulty: number | null;
  guesses: GameRecord['guesses'];
  turns: number;
  hints: number[];
  hint_count: number;
  status: 'playing' | 'won' | 'lost';
}

const GAME_COLUMNS = 'id, answer, keyword_no, difficulty, guesses, turns, hints, hint_count, status';

/** Tổng số từ khóa ít khi đổi (chỉ khi nạp lại từ điển), nên nhớ trong tiến trình một lúc để khỏi truy vấn mỗi lần. */
const KEYWORD_COUNT_CACHE_MS = 10 * 60 * 1000;

function toRecord(row: GameRow): GameRecord {
  return {
    id: row.id,
    answer: row.answer,
    keywordNo: row.keyword_no,
    difficulty: parseDifficulty(row.difficulty),
    guesses: row.guesses,
    turns: row.turns,
    hints: row.hints,
    hintCount: row.hint_count,
    over: row.status !== 'playing',
    won: row.status === 'won',
  };
}

function fail(what: string, error: { message: string }): never {
  throw new Error(`Supabase: ${what}: ${error.message}`);
}

/**
 * Dữ liệu trên Supabase (bảng words, games — xem supabase/migrations). Dùng secret key nên chỉ chạy ở server;
 * hai bảng bật RLS và không có policy, nên publishable key không đọc được đáp án.
 */
export function createSupabaseRepository(): Repository {
  let client: SupabaseClient | null = null;
  const db = () => {
    if (client) return client;
    const { supabaseUrl: url, supabaseSecretKey: key } = config;
    if (!url || !key) throw new Error('Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SECRET_KEY (xem .dev.vars.example)');
    return (client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }));
  };

  let keywordTotals: { counts: KeywordCounts; loadedAt: number } | null = null;

  return {
    async pickKeyword(no, difficulty) {
      // hàm pick_keyword() trong CSDL (xem supabase/migrations): bộ từ khóa quá lớn để tải về bốc thăm
      const { data, error } = await db().rpc('pick_keyword', no === undefined ? { difficulty } : { n: no });
      if (error) fail('chọn từ khóa', error);
      const row = (data as { picked_word: string; picked_no: number }[] | null)?.[0];
      return row ? { word: row.picked_word, no: row.picked_no } : null;
    },

    async keywordCounts() {
      if (keywordTotals && Date.now() - keywordTotals.loadedAt < KEYWORD_COUNT_CACHE_MS) return keywordTotals.counts;
      // mức 1, mức <= 2 và tất cả (từ chưa xếp mức có keyword_tier null: không lọt vào lte, tức coi như mức 3)
      const keywords = () => db().from('words').select('word', { count: 'exact', head: true }).not('keyword_no', 'is', null);
      const results = await Promise.all([keywords().lte('keyword_tier', 1), keywords().lte('keyword_tier', 2), keywords()]);
      for (const { error } of results) if (error) fail('đếm từ khóa', error);
      const [tier1, upTo2, total] = results.map((r) => r.count ?? 0);
      if (!total) throw new Error('Supabase: bộ từ khóa trống — chạy npm run db:seed');
      const counts: KeywordCounts = [tier1 || total, upTo2 || total, total];
      keywordTotals = { counts, loadedAt: Date.now() };
      return counts;
    },

    async lookupWord(word) {
      const { data, error } = await db().from('words').select('keyword_no').eq('word', word).maybeSingle();
      if (error) fail('tìm từ', error);
      return data ? { keywordNo: (data.keyword_no as number | null) ?? null } : null;
    },

    async definitionsOf(word) {
      const { data, error } = await db().from('words').select('definitions').eq('word', word).maybeSingle();
      if (error) fail('đọc giải nghĩa', error);
      return ((data?.definitions as Definition[] | undefined) ?? []);
    },

    async insertGame(answer, keywordNo, difficulty) {
      const { data, error } = await db().from('games').insert({ answer, keyword_no: keywordNo, difficulty }).select(GAME_COLUMNS).single();
      if (error) fail('tạo ván', error);
      return toRecord(data as GameRow);
    },

    async findGame(id) {
      const { data, error } = await db().from('games').select(GAME_COLUMNS).eq('id', id).maybeSingle();
      if (error) fail('đọc ván', error);
      return data ? toRecord(data as GameRow) : null;
    },

    async saveGuesses(game) {
      const status = game.won ? 'won' : game.over ? 'lost' : 'playing';
      const { data, error } = await db()
        .from('games')
        .update({ guesses: game.guesses, turns: game.guesses.length, status, updated_at: new Date().toISOString() })
        .eq('id', game.id)
        .eq('status', 'playing')
        .eq('turns', game.turns)
        .select('id');
      if (error) fail('lưu lượt đoán', error);
      return data.length === 1;
    },

    async saveHints(game) {
      const { data, error } = await db()
        .from('games')
        .update({ hints: game.hints, hint_count: game.hints.length, updated_at: new Date().toISOString() })
        .eq('id', game.id)
        .eq('status', 'playing')
        .eq('turns', game.turns)
        .eq('hint_count', game.hintCount)
        .select('id');
      if (error) fail('lưu gợi ý', error);
      return data.length === 1;
    },

    async purgeOldGames(ttlDays) {
      const day = 24 * 60 * 60 * 1000;
      const now = Date.now();
      const [old, unused] = await Promise.all([
        db().from('games').delete().lt('updated_at', new Date(now - ttlDays * day).toISOString()),
        db().from('games').delete().eq('turns', 0).lt('updated_at', new Date(now - day).toISOString()),
      ]);
      if (old.error) fail('xoá ván cũ', old.error);
      if (unused.error) fail('xoá ván cũ', unused.error);
    },
  };
}
