/**
 * Kiểm tra từ đoán ở đấu theo nhóm ở mức "từ này có hợp lệ không?" (không đòi có nghĩa): mỗi âm tiết phải đúng cấu trúc tiếng Việt
 * (phụ âm đầu + vần + thanh, có quy tắc chính tả), HOẶC đã xuất hiện trong từ điển (data/syllables.txt, `npm run syllables`)
 * để các âm tiết ngoại lệ (gen, ku, từ mượn...) vẫn được nhận. Vd: `tượi` hợp lệ (t + ươi + nặng) dù từ điển không có;
 * `chiơ` không hợp lệ (không có vần `iơ`). Hàm thuần, không gọi mạng, dùng chung cho worker và test.
 */

/** Phụ âm đầu, chữ dài xếp trước để khớp theo thứ tự dài -> ngắn. Rỗng (không có phụ âm đầu) được thử riêng. */
const INITIALS = ['ngh', 'ng', 'nh', 'ph', 'th', 'tr', 'ch', 'kh', 'gh', 'gi', 'qu',
  'b', 'c', 'd', 'đ', 'g', 'h', 'k', 'l', 'm', 'n', 'p', 'r', 's', 't', 'v', 'x'];

/** Vần tiếng Việt (phần sau phụ âm đầu, không tính dấu thanh), chia theo âm cuối. */
const RHYMES = new Set(`
a e ê i y o ô ơ u ư
ai ao au ay âu ây eo êu iu oi ôi ơi ui ưi ưu
ia ua ưa uya oa oe uê uy uơ
oai oay oeo uây uôi ươi ươu iêu yêu uyu
ac ăc âc ec oc ôc uc ưc iêc oac oăc uôc ươc
ach êch ich oach uêch uych
am ăm âm em êm im om ôm ơm um iêm yêm uôm ươm oam oăm
an ăn ân en ên in on ôn ơn un iên yên uôn ươn oan oăn uân oen uyên
ang ăng âng eng êng ong ông ung ưng iêng uông ương oang oăng uâng
anh ênh inh oanh uênh uynh ynh
ap ăp âp ep êp ip op ôp ơp up iêp ươp
at ăt ât et êt it ot ôt ơt ut ưt iêt yêt uôt ươt oat oăt uât uyêt uyt yt oet uêt
`.split(/\s+/).filter(Boolean));

const TONE_MARKS = new Map([['̀', 'huyền'], ['́', 'sắc'], ['̉', 'hỏi'], ['̃', 'ngã'], ['̣', 'nặng']]);

/** "tượi" -> { base: "tươi", tone: "nặng" }; null nếu có hai dấu thanh hoặc có ký tự ngoài bảng chữ cái tiếng Việt. */
function splitTone(syllable: string): { base: string; tone: string | null } | null {
  let tone: string | null = null;
  let base = '';
  for (const ch of syllable.normalize('NFD')) {
    const t = TONE_MARKS.get(ch);
    if (t) {
      if (tone) return null;
      tone = t;
    } else base += ch;
  }
  base = base.normalize('NFC');
  return /^[a-zăâêôơưđ]+$/.test(base) ? { base, tone } : null;
}

const startsWithAny = (rhyme: string, letters: string) => letters.includes(rhyme[0]!);

/** Phụ âm đầu `initial` có đi với `rhyme` (đã biết là vần hợp lệ) và `tone` được không: quy tắc chính tả + thanh điệu. */
function fits(initial: string, rhyme: string, tone: string | null): boolean {
  // vần kết thúc bằng c, ch, p, t chỉ mang thanh sắc hoặc nặng
  if (/(c|ch|p|t)$/.test(rhyme) && tone !== 'sắc' && tone !== 'nặng') return false;
  switch (initial) {
    case 'c': return !startsWithAny(rhyme, 'eêiy'); // c không đứng trước e, ê, i, y (dùng k)
    case 'k': return startsWithAny(rhyme, 'eêiy');
    case 'g': return !startsWithAny(rhyme, 'eêy'); // g + i hợp lệ vì "gi" (gì, gìn)
    case 'gh': return startsWithAny(rhyme, 'eêi');
    case 'ng': return !startsWithAny(rhyme, 'eêiy');
    case 'ngh': return startsWithAny(rhyme, 'eêi');
    case 'gi': return !startsWithAny(rhyme, 'iy');
    case 'qu': return !startsWithAny(rhyme, 'uo'); // qu đã chứa u
    case '':
      return !rhyme.startsWith('iê'); // không có phụ âm đầu thì viết yê (yên, yêu), không viết iê
  }
  // yê, yt, ynh chỉ đi với "không có phụ âm đầu" hoặc "qu" (yên, quyên, quýt, quỳnh)
  if (/^(yê|yt$|ynh$)/.test(rhyme)) return false;
  return true;
}

/** Một âm tiết (đã chuẩn hoá, chữ thường) có đúng cấu trúc âm tiết tiếng Việt không (không xét có trong từ điển hay không). */
export function isValidSyllable(syllable: string): boolean {
  const parts = splitTone(syllable);
  if (!parts) return false;
  const { base, tone } = parts;
  for (const initial of ['', ...INITIALS]) {
    if (!base.startsWith(initial)) continue;
    const rhyme = base.slice(initial.length);
    if (rhyme && RHYMES.has(rhyme) && fits(initial, rhyme, tone)) return true;
  }
  return false;
}

/**
 * Hàm kiểm tra từ đoán cho RoomMachine (`isValidWord`). `attestedText` là nội dung data/syllables.txt: mỗi âm tiết một dòng,
 * đã chuẩn hoá kiểu dấu như `evaluateGuess`. Từ hợp lệ khi MỌI âm tiết thuộc danh sách đó hoặc đúng cấu trúc.
 * Tìm bằng một lần includes trên chuỗi vài chục KB, không dựng Set.
 */
export function createSyllableValidator(attestedText: string): (word: string) => boolean {
  const haystack = `\n${attestedText.replace(/\r/g, '').trim()}\n`;
  const attested = (s: string) => !s.includes('\n') && haystack.includes(`\n${s}\n`);
  return (word) => {
    const syllables = word.split(' ');
    return syllables.every((s) => s.length > 0 && (attested(s) || isValidSyllable(s)));
  };
}
