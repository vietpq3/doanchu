import { wordInfo, type WordInfo } from './vietnamese';

/**
 * Số chữ cái (ô) của từ khóa. Ô chữ chia đều theo chiều ngang màn hình nên từ quá dài sẽ ra ô rất nhỏ
 * trên điện thoại; 12 chữ cái vẫn còn ô cỡ 20px ở màn hình 360px.
 */
export const KEYWORD_LETTERS = { min: 4, max: 12 } as const;

const LOWERCASE_VIETNAMESE = /^[a-zđàáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ ]+$/;

/**
 * Mục từ trong từ điển (`raw`, đúng như trong từ điển) có đủ điều kiện làm từ khóa không?
 * Là từ ghép (>= 2 âm tiết) chỉ gồm chữ cái tiếng Việt viết thường và dấu cách — loại mục từ có chữ hoa, gạch nối,
 * chữ số hay ký tự lạ — và có KEYWORD_LETTERS.min–max chữ cái. Trả về WordInfo đã chuẩn hoá dấu, hoặc null.
 * Lưu ý: từ điển nguồn lưu mọi mục từ bằng chữ thường (kể cả "hà nội"), nên bộ lọc này KHÔNG loại được tên riêng;
 * việc đó do danh sách loại trừ (scripts/keyword-exclusions.ts). Điều kiện có giải nghĩa nằm ở
 * scripts/export-keywords.ts vì cần tra từ điển.
 */
export function keywordInfo(raw: string): WordInfo | null {
  const text = raw.normalize('NFC').trim();
  if (!LOWERCASE_VIETNAMESE.test(text)) return null;
  const info = wordInfo(text);
  if (!info || info.syllables.length < 2) return null;
  if (info.cells.length < KEYWORD_LETTERS.min || info.cells.length > KEYWORD_LETTERS.max) return null;
  return info;
}

/** Số thứ tự từ khóa lớn nhất nhận được: giới hạn của cột integer trong CSDL. */
export const MAX_KEYWORD_NO = 2_147_483_647;

/**
 * Đọc số thứ tự từ khóa từ một chuỗi (vd: tham số `?id=300` của đường dẫn): 1 đến 10 chữ số, trong 1..MAX_KEYWORD_NO.
 * Không phải số nguyên dương hợp lệ thì trả về null. Không kiểm tra số có tồn tại trong bộ từ khóa hay không.
 */
export function parseKeywordNo(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{1,10}$/.test(value)) return null;
  const no = Number(value);
  return no >= 1 && no <= MAX_KEYWORD_NO ? no : null;
}

/** Link chia sẻ từ khóa số `no`: mở link này (trang Chơi đơn) bắt đầu ván mới với đúng từ khóa đó (xem src/app/solo/page.tsx, parseKeywordNo). */
export function buildShareLink(origin: string, no: number): string {
  return `${origin.replace(/\/+$/, '')}/solo?id=${no}`;
}

