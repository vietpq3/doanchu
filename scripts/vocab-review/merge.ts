/*
 * Rà soát kho từ vựng, bước 3/3: gộp kết quả AI xếp mức với tín hiệu của prepare.ts → danh sách và số liệu cho báo cáo.
 * Chạy: npx tsx scripts/vocab-review/merge.ts [--partial]
 *
 * Kết quả AI (var/vocab-review/results/batch-NN-<hash>.tsv) là DỮ LIỆU ĐẦU VÀO: script này không gọi AI, đổi luật gộp thì chạy lại
 * mà không tốn token. Mỗi file kết quả phải trùng tên (cả hash) với một lô hiện có trong batches/; lô đã đổi nội dung thì kết quả cũ
 * bị coi là lỗi thời. Lô có lỗi (thiếu/thừa dòng, chép sai từ, mức hay mã lạ) phải chạy lại cả lô. --partial: vẫn ghi kết quả khi
 * còn thiếu lô (để xem trước).
 *
 * Ghi ra
 *   ../../docs/vocabulary-review/tiers.tsv, tier1.txt, tier2.txt, tier3.txt, index.html   danh sách để duyệt (đúng kết quả AI)
 *   var/vocab-review/summary.json                                                         số liệu cho báo cáo
 *   data/keyword-tiers.json   mức từng từ cho game (độ khó; npm run db:seed nạp vào cột words.keyword_tier): kết quả AI,
 *                             sửa tay theo scripts/vocab-review/overrides.tsv, bỏ các từ trong data/word-blocklist.txt
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadBlocklist } from '../word-blocklist';
import type { WordSignals } from './prepare';

const REVIEW_DIR = path.resolve('var/vocab-review');
const BATCH_DIR = path.join(REVIEW_DIR, 'batches');
const RESULT_DIR = path.join(REVIEW_DIR, 'results');
const DOCS_DIR = path.resolve('../../docs/vocabulary-review');
const OVERRIDES_PATH = path.resolve('scripts/vocab-review/overrides.tsv');
const TIERS_PATH = path.resolve('data/keyword-tiers.json');
const partial = process.argv.includes('--partial');

/** Phiên bản bộ tiêu chí (scripts/vocab-review/rubric.md) và model đã dùng: ghi vào báo cáo. */
export const RUBRIC_VERSION = 'v1';
export const MODEL = 'Claude Haiku 5.5, effort medium';

export const GROUPS: Record<string, string> = {
  TU_THUONG: 'Từ thường (thuần Việt / Hán Việt)',
  HAN_VIET_CU: 'Hán Việt cũ, văn chương',
  LAY: 'Từ láy',
  THANH_NGU: 'Thành ngữ, tục ngữ, quán ngữ',
  KHAU_NGU: 'Khẩu ngữ',
  LONG: 'Từ lóng, từ mới trên mạng',
  PHUONG_NGU: 'Phương ngữ, địa phương',
  THUAT_NGU: 'Thuật ngữ chuyên ngành',
  TON_GIAO: 'Tôn giáo, tín ngưỡng',
  LICH_SU: 'Lịch sử (chức quan, thể chế cũ)',
  SINH_VAT: 'Động thực vật, món ăn',
  VIET_HOA: 'Từ mượn, phiên âm (Việt hóa)',
  TEN_RIENG: 'Danh từ riêng',
  PHU_TRO: 'Từ phụ trợ, hư từ',
  BIEN_THE: 'Biến thể chính tả, viết tắt',
  THO_TUC: 'Thô tục, nhạy cảm',
  KHONG_RO: 'Không thành từ, giải nghĩa lỗi',
};

interface Row extends WordSignals {
  tier: 1 | 2 | 3;
  group: string;
  hint: string;
}

const byVi = (a: string, b: string) => a.localeCompare(b, 'vi');
const pct = (title: number, lower: number) => (title + lower ? Math.round((100 * title) / (title + lower)) : null);
const newsCap = (s: WordSignals) => pct(s.news.title, s.news.lower);

function readBatches() {
  const batches = fs.readdirSync(BATCH_DIR).filter((f) => f.endsWith('.tsv')).sort();
  const results = new Set(fs.existsSync(RESULT_DIR) ? fs.readdirSync(RESULT_DIR).filter((f) => f.endsWith('.tsv')) : []);
  const assigned = new Map<string, { tier: 1 | 2 | 3; group: string; hint: string }>();
  const problems: { batch: string; problem: string }[] = [];
  for (const file of batches) {
    results.delete(file);
    const words = fs.readFileSync(path.join(BATCH_DIR, file), 'utf8').trimEnd().split('\n').slice(1).map((l) => l.split('\t')[0]);
    const resultPath = path.join(RESULT_DIR, file);
    if (!fs.existsSync(resultPath)) {
      problems.push({ batch: file, problem: 'chưa có kết quả' });
      continue;
    }
    const lines = fs.readFileSync(resultPath, 'utf8').normalize('NFC').split('\n').map((l) => l.replace(/\r$/, '')).filter((l) => l.trim());
    const errors: string[] = [];
    const got = new Map<string, { tier: 1 | 2 | 3; group: string; hint: string }>();
    lines.forEach((line, i) => {
      const [word, tier, group, ...rest] = line.split('\t').map((c) => c.trim());
      if (!['1', '2', '3'].includes(tier)) errors.push(`dòng ${i + 1}: mức "${tier}"`);
      else if (!GROUPS[group]) errors.push(`dòng ${i + 1}: mã "${group}"`);
      else if (got.has(word)) errors.push(`dòng ${i + 1}: trùng "${word}"`);
      else got.set(word, { tier: Number(tier) as 1 | 2 | 3, group, hint: rest.join(' ').trim() });
    });
    const missing = words.filter((w) => !got.has(w));
    const extra = [...got.keys()].filter((w) => !words.includes(w));
    if (missing.length) errors.push(`thiếu ${missing.length} từ (vd ${missing.slice(0, 3).join(', ')})`);
    if (extra.length) errors.push(`thừa/chép sai ${extra.length} từ (vd ${extra.slice(0, 3).join(', ')})`);
    if (errors.length) problems.push({ batch: file, problem: errors.slice(0, 6).join('; ') });
    else for (const w of words) assigned.set(w, got.get(w)!);
  }
  for (const stale of results) problems.push({ batch: stale, problem: 'kết quả lỗi thời (không còn lô trùng tên/hash)' });
  return { batches, assigned, problems };
}

function sample<T>(items: T[], n: number, seed = 7): T[] {
  let s = seed;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

function main() {
  const { batches, assigned, problems } = readBatches();
  console.log(`${batches.length} lô, ${assigned.size} từ đã xếp mức`);
  for (const p of problems) console.log(`  ✗ ${p.batch}: ${p.problem}`);
  if (problems.length && !partial) {
    console.log('Còn lô lỗi hoặc thiếu: chạy lại các lô đó (hoặc --partial để xem trước).');
    process.exitCode = 1;
    return;
  }

  const { words: signals, newsSentences } = JSON.parse(fs.readFileSync(path.join(REVIEW_DIR, 'signals.json'), 'utf8')) as { words: WordSignals[]; newsSentences: number };
  const rows: Row[] = signals.filter((s) => assigned.has(s.word)).map((s) => ({ ...s, ...assigned.get(s.word)! }));

  // ---------- số liệu ----------
  const count = (pred: (r: Row) => boolean) => rows.filter(pred).length;
  const isKeyword = (r: Row) => r.status === 'keyword';
  const tiers = ([1, 2, 3] as const).map((t) => ({
    tier: t,
    all: count((r) => r.tier === t),
    keywords: count((r) => r.tier === t && isKeyword(r)),
    excluded: count((r) => r.tier === t && !isKeyword(r)),
  }));
  const groups = Object.keys(GROUPS).map((g) => ({
    group: g,
    name: GROUPS[g],
    byTier: ([1, 2, 3] as const).map((t) => count((r) => r.group === g && r.tier === t)),
    examples: ([1, 2, 3] as const).map((t) => sample(rows.filter((r) => r.group === g && r.tier === t), 20).map((r) => r.word)),
  }));
  const oldLabel = (r: Row) => r.labels.some((l) => /^(cũ|cổ|từ cũ|từ cổ|lỗi thời|hiếm|ít dùng)$/.test(l));
  const brief = (r: Row) => ({ word: r.word, tier: r.tier, group: r.group, hint: r.hint, status: r.status, newsPerMillion: r.newsPerMillion, newsCap: newsCap(r), labels: r.labels, def: r.def });
  const conflicts = {
    commonButTier3: rows.filter((r) => r.tier === 3 && r.newsPerMillion >= 50 && !(r.group === 'TEN_RIENG' && (newsCap(r) ?? 0) >= 50)).map(brief),
    capitalizedButTier1: rows.filter((r) => r.tier === 1 && r.news.title + r.news.lower >= 20 && (newsCap(r) ?? 0) >= 80).map(brief),
    oldLabelButTier1: rows.filter((r) => r.tier === 1 && oldLabel(r)).map(brief),
    properNounRarelyCapitalized: rows.filter((r) => r.group === 'TEN_RIENG' && r.news.title + r.news.lower >= 20 && (newsCap(r) ?? 100) < 20).map(brief),
    foreignSyllableButTier1: rows.filter((r) => r.tier === 1 && r.foreignSyllable).map(brief),
  };
  const summary = {
    generated: new Date().toISOString(),
    rubric: RUBRIC_VERSION,
    model: MODEL,
    newsSentences,
    total: rows.length,
    keywords: count(isKeyword),
    excluded: count((r) => !isKeyword(r)),
    partial: problems.length > 0,
    problems,
    tiers,
    groups,
    excludedButTier1: rows.filter((r) => !isKeyword(r) && r.tier === 1).map(brief),
    keywordsTier3ByGroup: Object.keys(GROUPS).map((g) => ({ group: g, count: count((r) => isKeyword(r) && r.tier === 3 && r.group === g) })).filter((x) => x.count),
    conflicts,
    // mẫu để chấm lại (đều theo mức) — cố định để chấm lại được
    qaSample: ([1, 2, 3] as const).flatMap((t) => sample(rows.filter((r) => r.tier === t), 100, 20261010 + t).map(brief)),
  };
  fs.writeFileSync(path.join(REVIEW_DIR, 'summary.json'), JSON.stringify(summary, null, 1));

  // ---------- danh sách để duyệt ----------
  fs.mkdirSync(DOCS_DIR, { recursive: true });
  const sorted = [...rows].sort((a, b) => byVi(a.word, b.word));
  const statusText: Record<string, string> = { keyword: 'từ khóa', proper_noun: 'đang loại: tên riêng', auxiliary: 'đang loại: phụ trợ', manual: 'đang loại: tay' };
  const tsv = [
    ['từ', 'mức', 'nhóm', 'gợi ý của AI', 'trạng thái hiện tại', 'tần suất / 1 triệu câu báo 2022', 'viết hoa trên báo (%)', 'nhãn từ điển', 'nghĩa đầu'].join('\t'),
    ...sorted.map((r) => [r.word, r.tier, GROUPS[r.group], r.hint, statusText[r.status] ?? r.status, r.newsPerMillion, newsCap(r) ?? '', r.labels.join(', '), r.def].join('\t')),
  ].join('\n');
  fs.writeFileSync(path.join(DOCS_DIR, 'tiers.tsv'), tsv + '\n');
  for (const t of [1, 2, 3]) fs.writeFileSync(path.join(DOCS_DIR, `tier${t}.txt`), sorted.filter((r) => r.tier === t).map((r) => r.word).join('\n') + '\n');
  fs.writeFileSync(path.join(DOCS_DIR, 'index.html'), viewerHtml(sorted, summary.generated));

  // ---------- mức cho game ----------
  const gameTiers = new Map(sorted.map((r) => [r.word, r.tier as number]));
  const overrides = readOverrides();
  for (const [word, tier] of overrides) {
    if (!gameTiers.has(word)) throw new Error(`overrides.tsv: "${word}" không có trong kết quả rà soát`);
    gameTiers.set(word, tier);
  }
  const blocklist = loadBlocklist();
  for (const word of blocklist) gameTiers.delete(word);
  const levels = Object.fromEntries([1, 2, 3].map((t) => [t, [...gameTiers].filter(([, x]) => x === t).map(([w]) => w)]));
  const meta = {
    generated: summary.generated.slice(0, 10),
    source: `rà soát kho từ vựng bằng AI (${MODEL}, bộ tiêu chí ${RUBRIC_VERSION}, scripts/vocab-review/rubric.md)`,
    levels: '1 = phù hợp nhất, 2 = trung bình, 3 = ít phù hợp; từ khóa không có trong file này coi như mức 3',
    overrides: overrides.size,
    blocked: [...blocklist].filter((w) => assigned.has(w)).length,
    counts: Object.fromEntries(Object.entries(levels).map(([t, ws]) => [t, ws.length])),
  };
  fs.writeFileSync(TIERS_PATH, JSON.stringify({ meta, levels }, null, 1) + '\n');

  console.log(`Mức 1: ${tiers[0].all} · mức 2: ${tiers[1].all} · mức 3: ${tiers[2].all}`);
  console.log(`Đã ghi ${path.relative(process.cwd(), DOCS_DIR)}/ và ${path.relative(process.cwd(), path.join(REVIEW_DIR, 'summary.json'))}`);
  console.log(`Đã ghi ${path.relative(process.cwd(), TIERS_PATH)}: ${gameTiers.size} từ (sửa tay ${overrides.size}, bỏ ${meta.blocked} từ trong danh sách xóa)`);
}

/** scripts/vocab-review/overrides.tsv: từ<TAB>mức<TAB>ghi chú; dòng # là chú thích. */
function readOverrides(): Map<string, number> {
  const out = new Map<string, number>();
  for (const line of fs.readFileSync(OVERRIDES_PATH, 'utf8').split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    const [word, tier] = line.split('\t').map((c) => c.trim());
    if (!['1', '2', '3'].includes(tier)) throw new Error(`overrides.tsv: mức "${tier}" của "${word}"`);
    out.set(word.normalize('NFC'), Number(tier));
  }
  return out;
}

/** Trang xem/lọc danh sách: dữ liệu nhúng sẵn, mở thẳng file được. */
function viewerHtml(rows: Row[], generated: string): string {
  const data = rows.map((r) => [r.word, r.tier, r.group, r.hint, r.status, r.newsPerMillion, r.def]);
  const json = JSON.stringify({ groups: GROUPS, rows: data }).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Rà soát kho từ vựng — Đoán Chữ</title>
<style>
body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;margin:0;padding:20px;background:#f6f4ef;color:#1d2025}
h1{margin:0 0 4px;font-size:1.4rem}p{margin:0 0 12px;color:#5b616b}
.bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:12px;position:sticky;top:0;background:#f6f4ef;padding:8px 0;z-index:1}
input,select{font:inherit;padding:6px 8px;border:1px solid #d9d5ca;border-radius:8px;background:#fff}
label{display:inline-flex;gap:4px;align-items:center}
table{border-collapse:collapse;width:100%;background:#fff;font-size:.9rem}
th,td{border-bottom:1px solid #ece8de;padding:5px 8px;text-align:left;vertical-align:top}
th{background:#efece4;position:sticky;top:52px}
.t1{color:#2e7d43;font-weight:700}.t2{color:#a0700b;font-weight:700}.t3{color:#b5382a;font-weight:700}
.muted{color:#5b616b}.nav{display:flex;gap:8px;align-items:center;margin:10px 0}
button{font:inherit;padding:5px 10px;border:1px solid #d9d5ca;border-radius:8px;background:#fff;cursor:pointer}
</style></head><body>
<h1>Rà soát kho từ vựng Đoán Chữ</h1>
<p>Mức 1 = phù hợp nhất · 2 = trung bình · 3 = ít phù hợp. Xếp mức bởi AI (${MODEL}, bộ tiêu chí ${RUBRIC_VERSION}), tạo lúc ${new Date(generated).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })} (giờ Việt Nam). Chi tiết: ../vocabulary-review.md</p>
<div class="bar">
  <input id="q" placeholder="Tìm từ hoặc nghĩa…" size="24">
  <label><input type="checkbox" class="tier" value="1" checked> Mức 1</label>
  <label><input type="checkbox" class="tier" value="2" checked> Mức 2</label>
  <label><input type="checkbox" class="tier" value="3" checked> Mức 3</label>
  <select id="group"><option value="">Mọi nhóm</option></select>
  <select id="status"><option value="">Mọi trạng thái</option><option value="keyword">Đang là từ khóa</option><option value="excluded">Đang bị loại</option></select>
  <select id="sort"><option value="word">Xếp theo chữ cái</option><option value="freq">Xếp theo tần suất trên báo</option></select>
  <span id="count" class="muted"></span>
</div>
<table><thead><tr><th>Từ</th><th>Mức</th><th>Nhóm</th><th>Gợi ý của AI</th><th>Trạng thái</th><th>Tần suất/1tr câu báo</th><th>Nghĩa đầu</th></tr></thead><tbody id="rows"></tbody></table>
<div class="nav"><button id="prev">‹ Trước</button><span id="page" class="muted"></span><button id="next">Sau ›</button></div>
<script>
const D=${json};const PAGE=300;let page=0,list=[];
const st={keyword:'từ khóa',proper_noun:'loại: tên riêng',auxiliary:'loại: phụ trợ',manual:'loại: tay'};
const g=document.getElementById('group');for(const [k,v] of Object.entries(D.groups)){const o=document.createElement('option');o.value=k;o.textContent=v;g.appendChild(o)}
const esc=s=>String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
function apply(){const q=document.getElementById('q').value.trim().toLowerCase();const tiers=[...document.querySelectorAll('.tier:checked')].map(x=>+x.value);
const gr=g.value,s=document.getElementById('status').value;
list=D.rows.filter(r=>tiers.includes(r[1])&&(!gr||r[2]===gr)&&(!s||(s==='keyword'?r[4]==='keyword':r[4]!=='keyword'))&&(!q||r[0].includes(q)||r[6].toLowerCase().includes(q)));
if(document.getElementById('sort').value==='freq')list.sort((a,b)=>b[5]-a[5]);page=0;render()}
function render(){const pages=Math.max(1,Math.ceil(list.length/PAGE));document.getElementById('count').textContent=list.length.toLocaleString('vi-VN')+' từ';
document.getElementById('page').textContent='Trang '+(page+1)+'/'+pages;
document.getElementById('rows').innerHTML=list.slice(page*PAGE,(page+1)*PAGE).map(r=>'<tr><td><b>'+esc(r[0])+'</b></td><td class="t'+r[1]+'">'+r[1]+'</td><td>'+esc(D.groups[r[2]]||r[2])+'</td><td>'+esc(r[3])+'</td><td class="muted">'+esc(st[r[4]]||r[4])+'</td><td>'+r[5]+'</td><td class="muted">'+esc(r[6])+'</td></tr>').join('')}
for(const id of ['q','group','status','sort'])document.getElementById(id).addEventListener('input',apply);
document.querySelectorAll('.tier').forEach(x=>x.addEventListener('change',apply));
document.getElementById('prev').onclick=()=>{if(page>0){page--;render();scrollTo(0,0)}};
document.getElementById('next').onclick=()=>{if((page+1)*PAGE<list.length){page++;render();scrollTo(0,0)}};
apply();
</script></body></html>
`;
}

main();
