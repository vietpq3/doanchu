import { DEFAULT_STYLE, normalizeSyllable, type ToneStyle } from './vietnamese';

export interface TextCells {
  cells: string[];
  overflow: boolean;
  /** overflowGroups[i]: âm tiết i dài hơn ô chữ (gõ thừa âm tiết thì tính vào âm tiết cuối) */
  overflowGroups: boolean[];
  /** âm tiết đang gõ */
  activeGroup: number;
  /** ô trống đầu tiên của âm tiết đang gõ, -1 nếu đã đầy */
  cursor: number;
}

/**
 * Ô hiển thị cho chữ trong ô nhập. Chữ có dấu do bộ gõ của máy (Unikey, Telex của macOS/iOS/Android)
 * tạo ra — game không tự xử lý Telex. Hàm này chỉ để hiển thị: không sửa chữ trong ô nhập và không
 * kiểm tra hợp lệ (server kiểm tra khi bấm Đoán). Âm tiết nào là âm tiết tiếng Việt thì đặt lại dấu
 * theo kiểu dấu của game; chữ lạ (w, f, số...) hiện nguyên.
 */
export function textCells(text: string, structure: number[], style: ToneStyle = DEFAULT_STYLE): TextCells {
  const raw = String(text).normalize('NFC').toLowerCase();
  const syllables = raw.trim() ? raw.trim().split(/\s+/) : [];
  const cells: string[] = [];
  const overflowGroups = structure.map((len, i) => {
    const syl = syllables[i] ?? '';
    const chars = Array.from(syl ? normalizeSyllable(syl, style) ?? syl : '');
    for (let k = 0; k < len; k++) cells.push(chars[k] ?? '');
    return chars.length > len;
  });
  if (syllables.length > structure.length) overflowGroups[structure.length - 1] = true;
  const typingNext = syllables.length > 0 && /\s$/.test(raw);
  const activeGroup = Math.min(structure.length - 1, Math.max(0, syllables.length - 1 + (typingNext ? 1 : 0)));
  let offset = 0;
  for (let i = 0; i < activeGroup; i++) offset += structure[i];
  let cursor = -1;
  for (let k = 0; k < structure[activeGroup]; k++) {
    if (!cells[offset + k]) { cursor = offset + k; break; }
  }
  return { cells, overflow: overflowGroups.some(Boolean), overflowGroups, activeGroup, cursor };
}
