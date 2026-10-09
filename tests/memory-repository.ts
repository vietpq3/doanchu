// Repository trong bộ nhớ cho test: không cần mạng hay Supabase.
import type { Definition } from '@/lib/game/types';
import type { GameRecord, Repository } from '@/lib/server/repository';

export function createMemoryRepository(words: Record<string, { definitions?: Definition[]; keyword?: boolean }>) {
  const games = new Map<string, GameRecord>();
  const keywords = Object.keys(words).filter((w) => words[w].keyword);
  let seq = 0;
  const copy = (g: GameRecord): GameRecord => ({ ...g, hints: [...g.hints], guesses: g.guesses.map((x) => ({ ...x, statuses: [...x.statuses] })) });

  const repo: Repository & { games: typeof games } = {
    games,
    // số thứ tự từ khóa = vị trí trong `words` (bắt đầu từ 1)
    async pickKeyword(no) {
      const i = no === undefined ? seq++ % keywords.length : no - 1;
      return i >= 0 && i < keywords.length ? { word: keywords[i], no: i + 1 } : null;
    },
    async keywordCount() { return keywords.length; },
    async lookupWord(word) {
      if (!(word in words)) return null;
      const i = keywords.indexOf(word);
      return { keywordNo: i >= 0 ? i + 1 : null };
    },
    async definitionsOf(word) { return words[word]?.definitions ?? []; },
    async insertGame(answer, keywordNo) {
      const id = `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
      const g: GameRecord = { id, answer, keywordNo, guesses: [], hints: [], hintCount: 0, over: false, won: false, turns: 0 };
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
