/*
 * Rà soát kho từ vựng, bước 1/3: tín hiệu cho từng từ và chia lô cho AI xếp mức (bước 2), rồi merge.ts gộp lại (bước 3).
 * Chạy: npx tsx scripts/vocab-review/prepare.ts
 *
 * Đầu vào
 *   data/keywords.json                    từ khóa (words) và từ đang bị loại (excluded, kèm lý do): toàn bộ là đối tượng rà soát
 *   từ điển offline (DICTIONARY_DB_PATH)  nghĩa hiển thị, từ loại, nguồn, câu ví dụ, và ~700 nghìn đoạn văn để đếm chữ hoa
 *   bộ tin tức Leipzig (LEIPZIG_SENTENCES, mặc định ../../database/leipzig/vie_news_2022_1M/vie_news_2022_1M-sentences.txt)
 *                                         1 triệu câu tin tức 2022: tần suất từng từ trong văn bản hiện đại và tỉ lệ viết hoa
 *                                         (tên riêng). Chỉ dùng số đếm; văn bản gốc để ngoài repo.
 * Kết quả (var/vocab-review/, không commit)
 *   signals.json                          mọi tín hiệu của từng từ (merge.ts dùng lại, không cần chạy lại bước này)
 *   batches/batch-NN-<hash>.tsv           các lô cho AI; hash theo nội dung lô để phát hiện kết quả AI đã lỗi thời
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { isValidSyllable } from '../../src/lib/versus/syllable';
import { displayedSenses, iterateTexts, loadSenses, openDictionary } from '../dictionary-source';
import { describesLocation, scanCapitalization, type CapitalCount } from '../keyword-exclusions';

const OUT_DIR = path.resolve('var/vocab-review');
const BATCH_DIR = path.join(OUT_DIR, 'batches');
const LEIPZIG = path.resolve(process.env.LEIPZIG_SENTENCES ?? '../../database/leipzig/vie_news_2022_1M/vie_news_2022_1M-sentences.txt');
/** Số lô cho AI (mỗi lô một agent) */
const BATCHES = 56;
/** Nghĩa đầu gửi cho AI được cắt còn chừng này ký tự */
const DEF_CHARS = 90;

const POS_SHORT: Record<string, string> = {
  A: 'tính', C: 'liên', D: 'phó', E: 'giới', I: 'tình thái', M: 'lượng', N: 'danh', O: 'thán', P: 'đại', R: 'trạng', S: 'đặc biệt',
  V: 'động', X: 'phụ trợ', Z: 'hậu tố',
};

export interface WordSignals {
  word: string;
  /** 'keyword' hoặc lý do đang bị loại (proper_noun, auxiliary, manual) */
  status: string;
  syllables: number;
  /** từ loại của các nghĩa hiển thị (vd ["danh", "động"]); "phụ trợ (Wiktionary)" là X chưa phân loại của Wiktionary */
  pos: string[];
  /** nhãn đầu nghĩa, vd ["cũ", "văn chương"] */
  labels: string[];
  /** nghĩa đầu, cắt ngắn */
  def: string;
  /** số nguồn từ điển có định nghĩa từ này (TVTD, Wiktionary, tudientv.com) */
  sources: number;
  hasExample: boolean;
  /** có âm tiết sai cấu trúc tiếng Việt (thường là phiên âm), chỉ là gợi ý */
  foreignSyllable: boolean;
  /** nghĩa đầu là "Dạng viết khác / Viết tắt / Xem / Như ..." */
  variant: boolean;
  /** nghĩa mô tả địa danh/dân tộc ("Một xã thuộc huyện X") */
  location: boolean;
  /** trong giải nghĩa + ví dụ của từ điển: số lần viết hoa từng âm tiết / viết thường */
  dictCap: CapitalCount;
  /** trong 1 triệu câu tin tức 2022: số lần viết hoa từng âm tiết / viết thường */
  news: CapitalCount;
  /** số lần xuất hiện (hoa + thường) trên 1 triệu câu tin tức */
  newsPerMillion: number;
}

function labelsOf(text: string): string[] {
  const m = /^\(([^)]{1,40})\)/.exec(text);
  return m ? m[1].split(/[,;]| hoặc /).map((s) => s.trim().toLowerCase().replace(/\.$/, '')).filter(Boolean) : [];
}

const clean = (s: string) => s.replace(/[\t\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Trộn cố định (seed) để mỗi lô có đủ loại từ mà kết quả chia lô vẫn ổn định giữa các lần chạy. */
function shuffled<T>(items: T[], seed: number): T[] {
  const a = [...items];
  let s = seed >>> 0;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function* leipzigSentences(file: string): AsyncGenerator<string> {
  const rl = readline.createInterface({ input: fs.createReadStream(file, 'utf8'), crlfDelay: Infinity });
  for await (const line of rl) {
    const tab = line.indexOf('\t');
    yield tab >= 0 ? line.slice(tab + 1) : line;
  }
}

async function main() {
  if (!fs.existsSync(LEIPZIG)) throw new Error(`Không thấy bộ tin tức: ${LEIPZIG} (đặt LEIPZIG_SENTENCES)`);
  const keywords = JSON.parse(fs.readFileSync('data/keywords.json', 'utf8')) as { words: string[]; excluded: Record<string, string> };
  const status = new Map<string, string>(keywords.words.map((w) => [w, 'keyword']));
  for (const [w, reason] of Object.entries(keywords.excluded)) status.set(w, reason);
  const targets = new Set(status.keys());
  console.log(`Rà soát ${targets.size} từ (${keywords.words.length} từ khóa + ${Object.keys(keywords.excluded).length} từ bị loại)`);

  const db = openDictionary();
  const { senses } = loadSenses(db);
  console.log('Đếm chữ hoa trong từ điển…');
  const dictCap = scanCapitalization(iterateTexts(db), targets);

  console.log('Đếm tần suất trong tin tức 2022…');
  const sentences: string[] = [];
  for await (const s of leipzigSentences(LEIPZIG)) sentences.push(s);
  const news = scanCapitalization(sentences, targets);
  const perMillion = 1e6 / sentences.length;
  console.log(`  ${sentences.length} câu`);

  const signals: WordSignals[] = [];
  for (const word of [...targets].sort((a, b) => a.localeCompare(b, 'vi'))) {
    const all = senses.get(word) ?? [];
    const shown = displayedSenses(all);
    const first = shown[0]?.text ?? '';
    const pos = [...new Set(shown.map((s) => (s.pos === 'X' && s.source === 'Wiktionary' ? 'phụ trợ (Wiktionary)' : POS_SHORT[s.pos ?? ''] ?? '')).filter(Boolean))];
    const n = news.get(word) ?? { title: 0, lower: 0 };
    signals.push({
      word,
      status: status.get(word)!,
      syllables: word.split(' ').length,
      pos,
      labels: [...new Set(shown.flatMap((s) => labelsOf(s.text)))],
      def: clean(first).slice(0, DEF_CHARS),
      sources: new Set(all.map((s) => s.source)).size,
      hasExample: all.some((s) => s.example),
      foreignSyllable: word.split(' ').some((s) => !isValidSyllable(s)),
      variant: /^(Dạng viết khác|Cách viết khác|Viết tắt|Dạng khác|Biến thể|Xem\s|Như\s)/i.test(clean(first)),
      location: shown.some((s) => describesLocation(s.text)),
      dictCap: dictCap.get(word) ?? { title: 0, lower: 0 },
      news: n,
      newsPerMillion: Math.round((n.title + n.lower) * perMillion * 10) / 10,
    });
  }

  fs.mkdirSync(BATCH_DIR, { recursive: true });
  for (const f of fs.readdirSync(BATCH_DIR)) fs.unlinkSync(path.join(BATCH_DIR, f));
  fs.writeFileSync(path.join(OUT_DIR, 'signals.json'), JSON.stringify({ generated: new Date().toISOString(), newsSentences: sentences.length, words: signals }));

  // Lô cho AI: từ ⇥ tần suất/1tr câu tin tức ⇥ % viết hoa (tin tức; từ điển) ⇥ nhãn ⇥ từ loại ⇥ trạng thái ⇥ nghĩa đầu
  const pct = (c: CapitalCount) => (c.title + c.lower ? `${Math.round((100 * c.title) / (c.title + c.lower))}%` : '-');
  const statusText: Record<string, string> = { keyword: 'khóa', proper_noun: 'loại:tên riêng', auxiliary: 'loại:phụ trợ', manual: 'loại:tay' };
  const order = shuffled(signals, 20261010);
  const size = Math.ceil(order.length / BATCHES);
  const header = ['từ', 'tần_suất_tin_tức', 'viết_hoa_tin_tức', 'viết_hoa_từ_điển', 'nhãn', 'từ_loại', 'trạng_thái', 'nghĩa'].join('\t');
  for (let b = 0; b < BATCHES; b++) {
    const rows = order.slice(b * size, (b + 1) * size).map((s) =>
      [s.word, s.newsPerMillion, pct(s.news), pct(s.dictCap), s.labels.join(', ') || '-', s.pos.join(', ') || '-', statusText[s.status] ?? s.status, s.def || '-'].join('\t'),
    );
    const body = [header, ...rows].join('\n') + '\n';
    const hash = createHash('sha1').update(body).digest('hex').slice(0, 8);
    fs.writeFileSync(path.join(BATCH_DIR, `batch-${String(b + 1).padStart(2, '0')}-${hash}.tsv`), body);
  }
  console.log(`Đã ghi ${BATCHES} lô (~${size} từ/lô) vào ${path.relative(process.cwd(), BATCH_DIR)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
