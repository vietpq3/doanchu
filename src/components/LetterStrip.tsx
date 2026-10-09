import type { Status } from '@/lib/game/scoring';
import { ALPHABET } from '@/lib/game/vietnamese';
import { STATUS_LABEL } from './labels';

/** Bảng chữ cái tô màu theo kết quả các lượt đã đoán (chỉ để xem, không bấm được). */
export default function LetterStrip({ statuses }: { statuses: Record<string, Status> }) {
  return (
    <div className="letters" role="list" aria-label="Trạng thái chữ cái đã đoán">
      {ALPHABET.map((ch) => {
        const st = statuses[ch];
        return (
          <span key={ch} className="letter" role="listitem" data-status={st} aria-label={`${ch}: ${st ? STATUS_LABEL[st] : 'chưa đoán'}`}>
            {ch}
          </span>
        );
      })}
    </div>
  );
}
