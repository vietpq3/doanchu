import type { CSSProperties } from 'react';
import type { TextCells } from '@/lib/game/input';
import type { ScoredRow } from '@/lib/game/scoring';
import type { Hint } from '@/lib/game/types';
import Cell from './Cell';

interface Props {
  /** số chữ cái của từng âm tiết */
  structure: number[];
  rows: ScoredRow[];
  /** hàng đang gõ; null khi ván đã kết thúc */
  current: TextCells | null;
  maxRows: number;
  /** các ô đã gợi ý (nút Hint): hiện mờ ở hàng đang gõ, trong ô người chơi chưa gõ chữ */
  hints?: Hint[];
  /** tăng lên mỗi lần lượt đoán bị từ chối, để hàng đang gõ rung lại */
  shakeKey?: number;
}

/** Ô chữ: các lượt đã đoán, hàng đang gõ và các hàng trống. Âm tiết được tách bằng khoảng cách rộng hơn. */
export default function Board({ structure, rows, current, maxRows, hints = [], shakeKey = 0 }: Props) {
  const total = structure.reduce((a, b) => a + b, 0);
  const style = { '--n': total, '--g': structure.length } as CSSProperties;

  return (
    <div className="board-wrap">
      <div className="board" role="grid" aria-label="Ô chữ" style={style}>
        {Array.from({ length: maxRows }, (_, r) => {
          const row = rows[r];
          const isCurrent = !row && current !== null && r === rows.length;
          const cells = row ? row.cells : isCurrent ? current.cells : new Array<string>(total).fill('');
          let offset = 0;
          return (
            <div
              key={isCurrent ? `current-${shakeKey}` : r}
              role="row"
              className={'row' + (isCurrent ? ' current' : '') + (isCurrent && shakeKey ? ' shake' : '')}
            >
              {structure.map((len, g) => {
                const start = offset;
                offset += len;
                const className = 'syl'
                  + (isCurrent && g === current.activeGroup ? ' active' : '')
                  + (isCurrent && current.overflowGroups[g] ? ' overflow' : '');
                return (
                  <div key={g} className={className}>
                    {cells.slice(start, start + len).map((ch, k) => {
                      const hinted = isCurrent && !ch ? hints.find((h) => h.index === start + k) : undefined;
                      return (
                        <Cell
                          key={k}
                          ch={hinted?.ch ?? ch}
                          hint={!!hinted}
                          status={row?.statuses[start + k]}
                          cursor={isCurrent && current.cursor === start + k}
                        />
                      );
                    })}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
