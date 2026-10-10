/**
 * Vẽ ảnh PNG ô chữ của mình sau ván đấu theo nhóm (nút "Chụp ảnh màn hình"): tiêu đề, kết quả, từ khóa, các hàng đã đoán
 * (chữ + màu) và địa chỉ trang. Vẽ bằng canvas theo màu đang hiển thị (cả chế độ tối), không cần thư viện chụp DOM.
 */
import type { ScoredRow } from '../game/scoring';

export interface BoardImageInput {
  /** dòng nhỏ dưới tên game, vd "Đấu theo nhóm · Room #2" */
  subtitle: string;
  /** kết quả, vd "Bạn đã thắng sau 3/6 lượt!" */
  result: string;
  won: boolean;
  word: string;
  structure: number[];
  rows: ScoredRow[];
  maxRows: number;
}

const WIDTH = 560; // px logic; ảnh thật nhân SCALE để nét trên màn hình mật độ cao
const SCALE = 2;
const PAD = 28;
const GAP = 5;
const SYL_GAP = 14;
const MAX_CELL = 56;

function cssVar(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Tạo ảnh; trả về Promise ngay (gọi trong lúc bấm nút để Safari cho phép ghi clipboard). */
export async function renderBoardImage(input: BoardImageInput): Promise<Blob> {
  await document.fonts?.ready;
  const font = getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif';
  const color = {
    bg: cssVar('--surface', '#ffffff'),
    text: cssVar('--text', '#1d2025'),
    muted: cssVar('--muted', '#5b616b'),
    accent: cssVar('--accent', '#b5382a'),
    cellBorder: cssVar('--cell-border', '#cdc8bb'),
    correct: cssVar('--c-correct', '#3c8c55'),
    present: cssVar('--c-present', '#c28e14'),
    tone: cssVar('--c-tone', '#2f6bd8'),
    absent: cssVar('--c-absent', '#7b7e84'),
    onTile: cssVar('--on-tile', '#ffffff'),
    onAbsent: cssVar('--on-absent', '#ffffff'),
    absentBorder: cssVar('--absent-border', 'transparent'),
  };
  const fill: Record<string, string> = { correct: color.correct, present: color.present, tone: color.tone, absent: color.absent };

  const total = input.structure.reduce((a, b) => a + b, 0);
  const inner = WIDTH - 2 * PAD;
  const cell = Math.floor(Math.min(MAX_CELL, (inner - (total - input.structure.length) * GAP - (input.structure.length - 1) * SYL_GAP) / total));
  const boardWidth = total * cell + (total - input.structure.length) * GAP + (input.structure.length - 1) * SYL_GAP;
  const boardTop = PAD + 132;
  const boardHeight = input.maxRows * cell + (input.maxRows - 1) * GAP;
  const height = boardTop + boardHeight + 52;

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH * SCALE;
  canvas.height = height * SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas không khả dụng');
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = color.bg;
  ctx.fillRect(0, 0, WIDTH, height);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  // Tên game: "Đoán Chữ" (chữ "Chữ" màu nhấn), dòng phụ, kết quả, từ khóa
  ctx.font = `800 26px ${font}`;
  ctx.fillStyle = color.text;
  ctx.fillText('Đoán ', PAD, PAD + 24);
  ctx.fillStyle = color.accent;
  ctx.fillText('Chữ', PAD + ctx.measureText('Đoán ').width, PAD + 24);
  ctx.font = `600 15px ${font}`;
  ctx.fillStyle = color.muted;
  ctx.fillText(input.subtitle, PAD, PAD + 50);
  ctx.font = `700 19px ${font}`;
  ctx.fillStyle = input.won ? color.correct : color.text;
  ctx.fillText(input.result, PAD, PAD + 86, inner);
  ctx.font = `400 16px ${font}`;
  ctx.fillStyle = color.muted;
  const label = 'Từ khóa: ';
  ctx.fillText(label, PAD, PAD + 112);
  ctx.font = `700 16px ${font}`;
  ctx.fillStyle = color.text;
  ctx.fillText(input.word, PAD + ctx.measureText(label).width, PAD + 112, inner);

  // Ô chữ, căn giữa; mỗi âm tiết cách nhau rộng hơn
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${Math.round(cell * 0.5)}px ${font}`;
  const left = (WIDTH - boardWidth) / 2;
  for (let r = 0; r < input.maxRows; r++) {
    const row = input.rows[r];
    const y = boardTop + r * (cell + GAP);
    let x = left;
    let index = 0;
    input.structure.forEach((len, g) => {
      if (g > 0) x += SYL_GAP - GAP;
      for (let k = 0; k < len; k++, index++) {
        const status = row?.statuses[index];
        roundRect(ctx, x + 1, y + 1, cell - 2, cell - 2, 6);
        if (status) {
          ctx.fillStyle = fill[status] ?? color.absent;
          ctx.fill();
          if (status === 'absent' && color.absentBorder !== 'transparent') {
            ctx.strokeStyle = color.absentBorder;
            ctx.lineWidth = 2;
            ctx.stroke();
          }
          ctx.fillStyle = status === 'absent' ? color.onAbsent : color.onTile;
          ctx.fillText((row!.cells[index] ?? '').toLocaleUpperCase('vi'), x + cell / 2, y + cell / 2 + 1);
        } else {
          ctx.strokeStyle = color.cellBorder;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        x += cell + GAP;
      }
    });
  }

  // Địa chỉ trang ở cuối
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `600 14px ${font}`;
  ctx.fillStyle = color.muted;
  ctx.fillText(location.host, WIDTH / 2, height - 20);

  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('không tạo được ảnh'))), 'image/png'));
}
