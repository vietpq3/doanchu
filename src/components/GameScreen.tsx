'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { ApiError, postJson } from '@/lib/client/api';
import { cellPosition } from '@/lib/game/hints';
import { textCells } from '@/lib/game/input';
import { letterStatuses } from '@/lib/game/scoring';
import type { PublicGame } from '@/lib/game/types';
import Board from './Board';
import EndgameDialog from './EndgameDialog';
import HelpDialog from './HelpDialog';
import KeywordDialog from './KeywordDialog';
import LetterStrip from './LetterStrip';
import ThemeSwitch from './ThemeSwitch';

const HELP_SEEN_KEY = 'doanchu-seen-help';
const noopSubscribe = () => () => {};
/** Lần đầu vào trang (chưa từng đóng hộp luật chơi). Server luôn trả false để HTML khớp khi hydrate. */
function readFirstVisit() {
  try { return !localStorage.getItem(HELP_SEEN_KEY); } catch { return false; }
}
function markHelpSeen() {
  try { localStorage.setItem(HELP_SEEN_KEY, '1'); } catch { /* trình duyệt chặn localStorage: bỏ qua */ }
}
const DEFAULT_HINT = 'Gõ bằng bộ gõ tiếng Việt của máy; các âm tiết cách nhau bằng dấu cách.';
/** Chờ một chút để người chơi thấy lượt cuối được tô màu rồi mới hiện màn kết thúc. */
const ENDGAME_DELAY_MS = 700;

/**
 * Màn chơi. Trình duyệt chỉ hiển thị: chữ có dấu do bộ gõ của máy gõ vào ô nhập thật,
 * mỗi lần bấm Đoán thì gửi nguyên chữ đó lên server; server kiểm tra, chấm màu và trả trạng thái ván.
 */
export default function GameScreen({ initialGame }: { initialGame: PublicGame }) {
  const [game, setGame] = useState(initialGame);
  const [text, setText] = useState('');
  const [busy, setBusyState] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);
  const [toast, setToast] = useState('');
  const [endgameOpen, setEndgameOpen] = useState(false);
  const [keywordOpen, setKeywordOpen] = useState(false);
  // Hộp luật chơi mở khi người chơi bấm "?", hoặc tự mở ở lần đầu vào trang cho tới khi được đóng.
  // `helpDismissed` giữ trong state để nút ✕ luôn đóng được, kể cả khi trình duyệt không ghi được localStorage.
  const [helpRequested, setHelpRequested] = useState(false);
  const [helpDismissed, setHelpDismissed] = useState(false);
  const firstVisit = useSyncExternalStore(noopSubscribe, readFirstVisit, () => false);
  const helpOpen = helpRequested || (firstVisit && !helpDismissed);

  const inputRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false); // đọc trong handler, tránh giá trị cũ của state
  const composing = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const endgameTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const current = useMemo(() => (game.over ? null : textCells(text, game.structure)), [game, text]);
  const letters = useMemo(() => letterStatuses(game.rows), [game.rows]);
  const totalLetters = game.structure.reduce((a, b) => a + b, 0);
  const hintsLeft = game.maxHints - game.hints.length;

  useEffect(() => () => { clearTimeout(toastTimer.current); clearTimeout(endgameTimer.current); }, []);

  // Đặt con trỏ vào ô nhập khi đang chơi và không có hộp thoại nào mở.
  useEffect(() => {
    if (!game.over && !busy && !helpOpen && !endgameOpen && !keywordOpen) inputRef.current?.focus({ preventScroll: true });
  }, [game, busy, helpOpen, endgameOpen, keywordOpen]);

  function setBusy(v: boolean) {
    busyRef.current = v;
    setBusyState(v);
  }

  function showToast(msg: string) {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 1800);
  }

  function clearInput() {
    if (inputRef.current) inputRef.current.value = '';
    setText('');
  }

  async function newGame() {
    if (busyRef.current) return;
    clearTimeout(endgameTimer.current);
    setEndgameOpen(false);
    setBusy(true);
    try {
      setGame(await postJson<PublicGame>('/api/games', {}));
      setShakeKey(0);
      clearInput();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Lỗi máy chủ');
    } finally {
      setBusy(false);
    }
  }

  /** Chọn số từ khóa: bắt đầu ván mới với đúng từ khóa đó. Trả về thông báo lỗi nếu không bắt đầu được, null nếu thành công. */
  async function startWithKeyword(no: number): Promise<string | null> {
    if (busyRef.current) return 'Đang xử lý, hãy thử lại sau giây lát';
    setBusy(true);
    try {
      setGame(await postJson<PublicGame>('/api/games', { number: no }));
      clearTimeout(endgameTimer.current);
      setEndgameOpen(false);
      setShakeKey(0);
      clearInput();
      setKeywordOpen(false);
      return null;
    } catch (err) {
      return err instanceof ApiError ? err.message : 'Lỗi máy chủ';
    } finally {
      setBusy(false);
    }
  }

  /** Nút Hint: server chọn ngẫu nhiên một ô chưa xanh lá; ô đó hiện mờ ở hàng đang gõ. Không mất lượt đoán. */
  async function hint() {
    if (busyRef.current || composing.current || game.over || hintsLeft <= 0) return;
    setBusy(true);
    try {
      const next = await postJson<PublicGame>(`/api/games/${game.id}/hints`, {});
      setGame(next);
      const added = next.hints.find((h) => !game.hints.some((old) => old.index === h.index));
      if (added) {
        const { syllable, letter } = cellPosition(next.structure, added.index);
        showToast(`Gợi ý: âm tiết ${syllable}, chữ thứ ${letter} là “${added.ch}”`);
      }
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : new ApiError('server_error', 'Lỗi máy chủ');
      showToast(apiErr.message);
      if (apiErr.code === 'game_not_found') {
        setBusy(false);
        return newGame();
      }
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busyRef.current || composing.current || game.over) return;
    setBusy(true);
    try {
      const next = await postJson<PublicGame>(`/api/games/${game.id}/guesses`, { guess: inputRef.current?.value ?? text });
      setGame(next);
      clearInput();
      if (next.over) {
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        endgameTimer.current = setTimeout(() => setEndgameOpen(true), reduced ? 0 : ENDGAME_DELAY_MS);
      }
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : new ApiError('server_error', 'Lỗi máy chủ');
      showToast(apiErr.message);
      if (apiErr.code === 'game_not_found') {
        setBusy(false);
        return newGame();
      }
      setShakeKey((k) => k + 1);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="topbar">
        <div className="wrap">
          {game.keywordNo !== null ? (
            <button
              className="keyword-no"
              type="button"
              aria-label={`Từ khóa số ${game.keywordNo}. Bấm để chọn từ khóa khác`}
              title="Bấm để chọn từ khóa theo số"
              onClick={() => setKeywordOpen(true)}
            >
              #{game.keywordNo}
            </button>
          ) : (
            <span className="spacer" />
          )}
          <h1 className="brand">Đoán <span>Chữ</span></h1>
          <span className="topbar-right">
            <ThemeSwitch />
            <Link className="icon-btn" href="/" aria-label="Trang chủ" title="Trang chủ">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 10.5 12 3l9 7.5" />
                <path d="M5 9v11h5v-6h4v6h5V9" />
              </svg>
            </Link>
            <button className="icon-btn" type="button" aria-label="Luật chơi" title="Luật chơi" onClick={() => setHelpRequested(true)}>?</button>
          </span>
        </div>
      </header>

      <main className="game wrap">
        <div className="toast-host">
          <div className="toast" role="status" aria-live="polite" hidden={!toast}>{toast}</div>
        </div>
        <p className="meta">
          <span>Từ khóa: <b>{game.structure.length} âm tiết · {totalLetters} chữ cái</b></span>
          {game.over ? <span>Ván đã kết thúc</span> : <span>Lượt <b>{game.rows.length + 1}/{game.maxTurns}</b></span>}
        </p>

        <div onClick={() => inputRef.current?.focus()}>
          <Board structure={game.structure} rows={game.rows} current={current} maxRows={game.maxTurns} hints={game.hints} shakeKey={shakeKey} />
        </div>

        {game.over ? (
          <div className="ended-bar">
            <span>{game.won ? 'Bạn đã đoán đúng!' : 'Ván đã kết thúc'}</span>
            <span className="actions">
              <button className="btn secondary" type="button" onClick={() => setEndgameOpen(true)}>Xem kết quả</button>
              <button className="btn" type="button" onClick={newGame} disabled={busy}>Chơi lại</button>
            </span>
          </div>
        ) : (
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
                onInput={(e) => setText(e.currentTarget.value)}
                onCompositionStart={() => { composing.current = true; }}
                onCompositionEnd={(e) => { composing.current = false; setText(e.currentTarget.value); }}
              />
              <button className="btn" type="submit" disabled={busy}>Đoán</button>
            </form>
            <p className={'input-hint' + (current?.overflow ? ' warn' : '')}>
              {current?.overflow ? 'Nhiều chữ hơn ô chữ' : DEFAULT_HINT}
            </p>
            <LetterStrip statuses={letters} />
            <div className="tools">
              <button
                className="btn secondary tool hint-feature"
                type="button"
                onClick={hint}
                disabled={busy || hintsLeft <= 0}
                title={hintsLeft > 0 ? `Còn ${hintsLeft} lần gợi ý` : 'Đã dùng hết lần gợi ý'}
              >
                Hint ({hintsLeft})
              </button>
              <button className="btn secondary tool" type="button" onClick={newGame} disabled={busy}>New game</button>
            </div>
          </div>
        )}
      </main>

      <KeywordDialog
        open={keywordOpen}
        current={game.keywordNo}
        count={game.keywordCount}
        busy={busy}
        onStart={startWithKeyword}
        onClose={() => setKeywordOpen(false)}
      />
      <EndgameDialog open={endgameOpen} game={game} onReplay={newGame} onClose={() => setEndgameOpen(false)} />
      <HelpDialog
        open={helpOpen}
        onClose={() => {
          markHelpSeen();
          setHelpDismissed(true);
          setHelpRequested(false);
        }}
      />
    </>
  );
}
