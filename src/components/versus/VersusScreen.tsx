'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { textCells } from '@/lib/game/input';
import { letterStatuses } from '@/lib/game/scoring';
import type { MatchPlayerStatus } from '@/lib/versus/protocol';
import Board from '../Board';
import LetterStrip from '../LetterStrip';
import ResultDialog from './ResultDialog';
import { useRoom } from './RoomProvider';
import VersusHeader from './VersusHeader';

const GUESS_ERRORS = new Set(['bad_request', 'invalid_chars', 'incomplete', 'wrong_structure']);

const STATUS_TEXT: Record<MatchPlayerStatus, string> = { playing: '', won: ' · đã đoán đúng', out: ' · hết lượt', left: ' · đã rời' };

/**
 * Màn Room versus (/rooms/[id]/versus): mỗi người đoán riêng với cùng một từ khóa. Server kiểm tra và chấm từng lượt;
 * mình chỉ thấy chữ/màu của lượt đoán của chính mình, còn đối thủ chỉ thấy tên + số lượt. Không có Hint, New game, số #N.
 */
export default function VersusScreen() {
  const router = useRouter();
  const { roomId, view, status, lastError, send, leave } = useRoom();
  const game = view?.game ?? null;

  const inputRef = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  const rowCount = game?.yourRows.length ?? 0;
  // Chữ đang gõ gắn với số lượt đã đoán: có lượt mới (server đã nhận) thì coi như ô nhập trống.
  const [typed, setTyped] = useState({ rows: 0, text: '' });
  const text = typed.rows === rowCount ? typed.text : '';

  // Không có ván của mình (chưa vào ván, hoặc popup kết quả đã hết hạn và phòng mở lại): về Inside Room.
  useEffect(() => {
    if (view && !view.game) router.replace(`/rooms/${roomId}`);
  }, [view, roomId, router]);

  const toInside = useCallback(() => router.replace(`/rooms/${roomId}`), [router, roomId]);

  // Có lượt mới được chấm: xóa chữ trong ô nhập (giữ nguyên focus để bàn phím không bị đóng).
  useEffect(() => {
    if (inputRef.current) inputRef.current.value = '';
  }, [rowCount]);

  const playing = game !== null && game.yourStatus === 'playing' && game.result === null;
  useEffect(() => {
    if (playing) inputRef.current?.focus({ preventScroll: true });
  }, [playing, rowCount]);

  // Lỗi của lượt đoán (thiếu chữ, sai cấu trúc...): rung hàng đang gõ và báo ngắn gọn.
  const [hiddenSeq, setHiddenSeq] = useState(0);
  useEffect(() => {
    if (!lastError) return;
    const timer = setTimeout(() => setHiddenSeq(lastError.seq), 1800);
    return () => clearTimeout(timer);
  }, [lastError]);
  const guessError = lastError && GUESS_ERRORS.has(lastError.code) ? lastError : null;
  const toast = lastError && lastError.seq !== hiddenSeq ? lastError.message : '';

  const current = useMemo(() => (game && playing ? textCells(text, game.structure) : null), [game, playing, text]);
  const letters = useMemo(() => letterStatuses(game?.yourRows ?? []), [game]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!playing || composing.current) return;
    send({ type: 'guess', guess: inputRef.current?.value ?? text });
  }

  // Rời phòng giữa ván: bị loại ngay (không chờ 30 giây nối lại như khi mất kết nối).
  const header = <VersusHeader title={view?.roomName ?? `Room #${roomId}`} backHref="/rooms" backLabel="Rời phòng" onBack={leave} />;

  if (status === 'rejected' || status === 'replaced') {
    return (
      <>
        {header}
        <main className="game wrap">
          <div className="notice" role="alert">{status === 'replaced' ? 'Bạn đã mở room này ở một tab khác nên tab này bị ngắt.' : 'Không vào được room.'}</div>
        </main>
      </>
    );
  }
  if (!view || !game) {
    return (
      <>
        {header}
        <main className="game wrap"><p className="muted" role="status">Đang vào ván…</p></main>
      </>
    );
  }

  const totalLetters = game.structure.reduce((a, b) => a + b, 0);
  const done = game.yourStatus !== 'playing';

  return (
    <>
      {header}
      <main className="game wrap">
        <div className="toast-host">
          <div className="toast" role="status" aria-live="polite" hidden={!toast}>{toast}</div>
        </div>
        {status === 'reconnecting' && <div className="notice" role="status">Mất kết nối, đang thử nối lại…</div>}

        <p className="meta">
          <span>Từ khóa: <b>{game.structure.length} âm tiết · {totalLetters} chữ cái</b></span>
          <span>Lượt <b>{Math.min(rowCount + 1, game.maxTurns)}/{game.maxTurns}</b></span>
        </p>

        <ul className="opponents" aria-label="Người chơi trong ván">
          {game.players.map((p) => (
            <li key={p.name} className={`opponent ${p.status}${p.isYou ? ' you' : ''}`}>
              {p.isYou ? 'Bạn' : p.name} · lượt {p.turns}/{game.maxTurns}{STATUS_TEXT[p.status]}
            </li>
          ))}
        </ul>

        <div onClick={() => inputRef.current?.focus()}>
          <Board structure={game.structure} rows={game.yourRows} current={current} maxRows={game.maxTurns} shakeKey={guessError?.seq ?? 0} />
        </div>

        {playing ? (
          <div className="input-area">
            <form className="guess-form" onSubmit={submit} autoComplete="off">
              <label className="visually-hidden" htmlFor="guess">Từ bạn đoán</label>
              <input
                ref={inputRef}
                id="guess"
                className="guess-input"
                type="text"
                lang="vi"
                inputMode="text"
                enterKeyHint="send"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={60}
                placeholder="Gõ từ có dấu, vd: vũ trụ"
                defaultValue=""
                onInput={(e) => setTyped({ rows: rowCount, text: e.currentTarget.value })}
                onCompositionStart={() => { composing.current = true; }}
                onCompositionEnd={(e) => { composing.current = false; setTyped({ rows: rowCount, text: e.currentTarget.value }); }}
              />
              <button className="btn" type="submit">Đoán</button>
            </form>
            <p className={'input-hint' + (current?.overflow ? ' warn' : '')}>
              {current?.overflow ? 'Nhiều chữ hơn ô chữ' : 'Gõ bằng bộ gõ tiếng Việt của máy; các âm tiết cách nhau bằng dấu cách.'}
            </p>
            <LetterStrip statuses={letters} />
          </div>
        ) : (
          <div className="notice" role="status">
            {game.result
              ? 'Ván đã kết thúc.'
              : done
                ? 'Bạn đã hết lượt đoán. Đang chờ những người khác…'
                : ''}
          </div>
        )}
      </main>

      {game.result && <ResultDialog game={game} lockedUntil={view.lockedUntil} serverNow={view.serverNow} onOk={toInside} />}
    </>
  );
}
