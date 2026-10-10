// Repository trong bộ nhớ cho test: không cần mạng hay Supabase.
import type { Difficulty, KeywordCounts } from '@/lib/game/difficulty';
import type { Definition } from '@/lib/game/types';
import type { GameRecord, Repository } from '@/lib/server/repository';

export function createMemoryRepository(words: Record<string, { definitions?: Definition[]; keyword?: boolean; tier?: Difficulty }>) {
  const games = new Map<string, GameRecord>();
  // số thứ tự từ khóa: theo mức trước (chưa có mức coi như 3), cùng mức thì theo thứ tự trong `words`, bắt đầu từ 1 (như renumber_keywords())
  const tierOf = (w: string) => words[w].tier ?? 3;
  const keywords = Object.keys(words).filter((w) => words[w].keyword).map((w, i) => ({ w, i })).sort((a, b) => tierOf(a.w) - tierOf(b.w) || a.i - b.i).map((x) => x.w);
  let seq = 0;
  const copy = (g: GameRecord): GameRecord => ({ ...g, hints: [...g.hints], guesses: g.guesses.map((x) => ({ ...x, statuses: [...x.statuses] })) });

  const picks: (Difficulty | undefined)[] = [];
  const repo: Repository & { games: typeof games; picks: typeof picks } = {
    games,
    picks,
    // độ khó của lần chọn ngẫu nhiên được ghi lại để test kiểm tra; độ khó chưa có từ nào thì chọn trong toàn bộ (như pick_keyword())
    async pickKeyword(no, difficulty) {
      if (no !== undefined) return no >= 1 && no <= keywords.length ? { word: keywords[no - 1], no } : null;
      picks.push(difficulty);
      const inTier = keywords.filter((w) => tierOf(w) <= (difficulty ?? 1));
      const pool = inTier.length ? inTier : keywords;
      const word = pool[seq++ % pool.length];
      return { word, no: keywords.indexOf(word) + 1 };
    },
    async keywordCounts() {
      const total = keywords.length;
      const upTo = (d: number) => keywords.filter((w) => tierOf(w) <= d).length || total;
      return [upTo(1), upTo(2), total] satisfies KeywordCounts;
    },
    async lookupWord(word) {
      if (!(word in words)) return null;
      const i = keywords.indexOf(word);
      return { keywordNo: i >= 0 ? i + 1 : null };
    },
    async definitionsOf(word) { return words[word]?.definitions ?? []; },
    async insertGame(answer, keywordNo, difficulty) {
      const id = `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
      const g: GameRecord = { id, answer, keywordNo, difficulty, guesses: [], hints: [], hintCount: 0, over: false, won: false, turns: 0 };
      games.set(id, g);
      return copy(g);
    },
    async findGame(id) { const g = games.get(id); return g ? copy(g) : null; },
    async saveGuesses(game) {
      const g = games.get(game.id);
      if (!g || g.over || g.turns !== game.turns) return false;
      Object.assign(g, { guesses: copy(game).guesses, over: game.over, won: game.won, turns: game.guesses.length });
      return true;
    },
    async saveHints(game) {
      const g = games.get(game.id);
      if (!g || g.over || g.turns !== game.turns || g.hintCount !== game.hintCount) return false;
      Object.assign(g, { hints: [...game.hints], hintCount: game.hints.length });
      return true;
    },
    async purgeOldGames() {},
  };
  return repo;
}
