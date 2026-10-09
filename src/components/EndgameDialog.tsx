'use client';

import { useRef } from 'react';
import type { PublicGame } from '@/lib/game/types';
import Cell from './Cell';
import Modal from './Modal';

interface Props {
  open: boolean;
  game: PublicGame;
  onReplay: () => void;
  onClose: () => void;
}

/** Màn hình kết thúc ván: công bố từ khóa, giải nghĩa, bên dưới là nút Chơi lại. */
export default function EndgameDialog({ open, game, onReplay, onClose }: Props) {
  const replayRef = useRef<HTMLButtonElement>(null);
  const { won, answer = '', definitions = [], rows, maxTurns } = game;

  return (
    <Modal open={open && game.over} onClose={onClose} className="endgame-dlg" label="Kết quả ván chơi" initialFocus={replayRef}>
      <section className={`endgame ${won ? 'won' : 'lost'}`}>
        <button className="icon-btn endgame-close" type="button" aria-label="Đóng để xem lại ô chữ" onClick={onClose}>✕</button>
        <div className="endgame-badge" aria-hidden="true">
          {won ? (
            <svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="24" fill="var(--c-correct)" /><path d="M14 24.5l7 7 13-14" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          ) : (
            <svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="24" fill="var(--c-absent)" /><path d="M17 17l14 14M31 17L17 31" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" /></svg>
          )}
        </div>
        <h2 className="endgame-title">{won ? 'Chính xác!' : 'Hết lượt đoán'}</h2>
        <p className="endgame-sub">
          {won ? `Bạn đoán đúng ở lượt ${rows.length}/${maxTurns}.` : `Bạn đã dùng hết ${maxTurns} lượt. Từ khóa là:`}
        </p>

        <p className="answer-label">Từ khóa</p>
        <div className={'answer-tiles' + (won ? '' : ' lost')} role="img" aria-label={`Từ khóa: ${answer}`}>
          {answer.split(' ').map((syl, i) => (
            <div key={i} className="syl">
              {Array.from(syl).map((ch, k) => <Cell key={k} ch={ch} status={won ? 'correct' : undefined} />)}
            </div>
          ))}
        </div>

        <p className="answer-label">Giải nghĩa</p>
        {definitions.length ? (
          <ol className="defs">
            {definitions.map((d, i) => (
              <li key={i}>
                {d.pos && <span className="pos">{d.pos}</span>}
                {d.text}
                {d.example && <span className="ex">Ví dụ: {formatExample(d.example)}</span>}
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted">Chưa có giải nghĩa cho từ này trong từ điển.</p>
        )}

        <div className="endgame-actions">
          <button ref={replayRef} className="btn" type="button" onClick={onReplay}>Chơi lại</button>
          <button className="link-btn" type="button" onClick={onClose}>Xem lại ô chữ</button>
        </div>
        <p className="source-note">Nguồn giải nghĩa: Từ điển tiếng Việt (TVTD) qua minhqnd/dictionary · CC BY-SA 4.0</p>
      </section>
    </Modal>
  );
}

/** Ví dụ trong từ điển ngăn cách bằng "~"; chỉ lấy 2 ví dụ đầu. */
function formatExample(e: string) {
  return e.split(/\s*~\s*/).filter(Boolean).slice(0, 2).join(' · ');
}
