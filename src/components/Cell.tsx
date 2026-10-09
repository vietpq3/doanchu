import type { Status } from '@/lib/game/scoring';
import { STATUS_LABEL } from './labels';

/** Một ô chữ cái. Không có status = ô chưa chấm (đang gõ hoặc trống). `hint` = chữ gợi ý (nút Hint) hiện mờ trong ô còn trống. */
export default function Cell({ ch, status, cursor, hint }: { ch: string; status?: Status; cursor?: boolean; hint?: boolean }) {
  const label = ch ? (hint ? `gợi ý: ${ch}` : status ? `${ch}: ${STATUS_LABEL[status]}` : ch) : 'ô trống';
  return (
    <div
      className="cell"
      role="gridcell"
      aria-label={label}
      data-filled={ch && !hint ? '1' : undefined}
      data-hint={hint ? '1' : undefined}
      data-status={status}
      data-cursor={cursor ? '1' : undefined}
    >
      {ch}
    </div>
  );
}
