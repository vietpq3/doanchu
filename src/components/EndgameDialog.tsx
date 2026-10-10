'use client';

import { useEffect, useRef, useState } from 'react';
import { copyToClipboard } from '@/lib/client/clipboard';
import { buildShareLink } from '@/lib/game/keywords';
import type { PublicGame } from '@/lib/game/types';
import Cell from './Cell';
import DefinitionList, { DEFINITION_SOURCE } from './DefinitionList';
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
  const { won, answer = '', definitions = [], rows, maxTurns, keywordNo } = game;

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
        <DefinitionList definitions={definitions} />

        {keywordNo !== null && <ShareLink keywordNo={keywordNo} />}

        <div className="endgame-actions">
          <button ref={replayRef} className="btn" type="button" onClick={onReplay}>Chơi lại</button>
          <button className="link-btn" type="button" onClick={onClose}>Xem lại ô chữ</button>
        </div>
        <p className="source-note">{DEFINITION_SOURCE}</p>
      </section>
    </Modal>
  );
}

const COPIED_MESSAGE_MS = 3000;

/**
 * Nút copy link chia sẻ từ khóa này (`/?id=N`) vào clipboard. Báo kết quả ngay trên nút (hộp thoại che mất thông báo nhanh của trang).
 * Nếu trình duyệt không cho copy thì hiện link trong một ô để người chơi tự copy.
 * Được dựng lại mỗi lần mở hộp thoại nên trạng thái luôn bắt đầu từ đầu.
 */
function ShareLink({ keywordNo }: { keywordNo: number }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [link, setLink] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy(button: HTMLButtonElement) {
    const url = buildShareLink(window.location.origin, keywordNo);
    setLink(url);
    clearTimeout(timer.current);
    if (await copyToClipboard(url, button.closest('dialog') ?? document.body)) {
      setState('copied');
      timer.current = setTimeout(() => setState('idle'), COPIED_MESSAGE_MS);
    } else {
      setState('failed');
    }
  }

  return (
    <div className="share">
      <button className="btn secondary share-btn" type="button" title="Copy link vào clipboard để gửi cho bạn bè" onClick={(e) => copy(e.currentTarget)}>
        {state === 'copied' ? '✓ Đã copy link! Gửi bạn bè nhé' : <>Thách bạn bè đoán từ này <span aria-hidden="true">🔗</span></>}
      </button>
      <p className="visually-hidden" role="status" aria-live="polite">{state === 'copied' ? 'Đã copy link vào clipboard' : ''}</p>
      {state === 'failed' && (
        <>
          <p className="share-fail" role="alert">Không copy tự động được. Hãy chọn và copy link này:</p>
          <input
            className="share-link"
            readOnly
            value={link}
            aria-label="Link chia sẻ từ khóa"
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
          />
        </>
      )}
    </div>
  );
}
