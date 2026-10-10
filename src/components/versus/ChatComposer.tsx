'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type RefObject } from 'react';
import { rememberEmoji, useRecentEmoji } from '@/lib/client/recentEmoji';
import { VERSUS } from '@/lib/versus/config';
import { EMOJI_BY_CODE, findEmojiQuery, insertEmoji, suggestEmoji, VOZ_EMOJI, type EmojiDef, type EmojiQuery } from '@/lib/versus/emoji';
import { sanitizeChat } from '@/lib/versus/protocol';
import EmojiImage from './EmojiImage';

interface Props {
  inputRef: RefObject<HTMLInputElement | null>;
  connected: boolean;
  /** gửi tin; false nếu chưa gửi được (mất kết nối) thì giữ nguyên chữ trong ô nhập */
  onSend: (text: string) => boolean;
  /** lỗi từ server (vd gửi quá nhanh) */
  serverError: string;
  pickerOpen: boolean;
  setPickerOpen: (open: boolean) => void;
}

/** Lỗi do chính ô nhập (vd chèn emoji làm tin quá dài) tự ẩn sau chừng này. */
const LOCAL_ERROR_MS = 3000;

const hasFinePointer = () => window.matchMedia('(pointer: fine)').matches;
const sameQuery = (a: EmojiQuery | null, b: EmojiQuery | null) => a === b || (!!a && !!b && a.start === b.start && a.end === b.end && a.query === b.query);

const SmileIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M8.5 14.5a4.5 4.5 0 0 0 7 0" />
    <circle cx="9" cy="10" r="1" fill="currentColor" stroke="none" />
    <circle cx="15" cy="10" r="1" fill="currentColor" stroke="none" />
  </svg>
);

/**
 * Ô nhập chat có emoji voz:
 * - Nút mặt cười mở bảng chọn emoji (hàng "Dùng gần đây" + toàn bộ bộ emoji); bấm một emoji thì chèn mã vào chỗ con trỏ, bảng vẫn mở
 *   để chọn tiếp; đóng bằng nút đó, Esc hoặc bấm ra ngoài.
 * - Gõ `:` + chữ (đầu tin hoặc sau dấu cách) thì hiện tối đa 3 emoji gần khớp nhất ngay trên ô nhập (bỏ dấu tiếng Việt khi so, để
 *   bộ gõ Telex không làm hỏng): chạm/bấm để chọn, ↑↓ để đổi, Tab để chèn, Esc để bỏ qua. Enter chèn emoji khi đã gõ từ 2 chữ trở
 *   lên (hoặc đã dùng ↑↓); mới gõ 1 chữ (`:v`, `:p`...) thì Enter vẫn gửi tin như bình thường.
 * Ô nhập không điều khiển bằng React (như ô đoán) để bộ gõ tiếng Việt hoạt động ổn định.
 */
export default function ChatComposer({ inputRef, connected, onSend, serverError, pickerOpen, setPickerOpen }: Props) {
  const composing = useRef(false);
  /** vị trí con trỏ gần nhất: bảng emoji chèn vào đây khi ô nhập không có focus (điện thoại: bàn phím đã đóng) */
  const caret = useRef<{ start: number; end: number } | null>(null);
  const recent = useRecentEmoji();
  const recentEmoji = useMemo(() => recent.map((c) => EMOJI_BY_CODE.get(c)).filter((e): e is EmojiDef => !!e), [recent]);

  // ---------- gợi ý khi gõ ":x" ----------
  const [query, setQuery] = useState<EmojiQuery | null>(null);
  /** đoạn ":x" (theo vị trí dấu ":") người dùng đã bấm Esc để bỏ gợi ý */
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const suggestions = useMemo(
    () => (query && query.start !== dismissedAt ? suggestEmoji(query.query, recent) : []),
    [query, dismissedAt, recent],
  );
  const queryKey = query ? `${query.start}:${query.query}` : '';
  // ô đang chọn trong danh sách gợi ý; chỉ có hiệu lực với đúng đoạn đang gõ (gõ thêm chữ thì về ô đầu)
  const [nav, setNav] = useState({ key: '', index: 0 });
  const navigated = nav.key === queryKey && queryKey !== '';
  const active = navigated ? Math.min(nav.index, suggestions.length - 1) : 0;

  function syncQuery() {
    const input = inputRef.current;
    if (!input) return;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    caret.current = { start, end };
    const next = start === end ? findEmojiQuery(input.value, start) : null;
    setQuery((prev) => (sameQuery(prev, next) ? prev : next));
    if (!next) setDismissedAt(null);
  }

  // ---------- lỗi ----------
  const [localError, setLocalError] = useState<{ seq: number; message: string } | null>(null);
  useEffect(() => {
    if (!localError) return;
    const timer = setTimeout(() => setLocalError(null), LOCAL_ERROR_MS);
    return () => clearTimeout(timer);
  }, [localError]);
  const showError = (message: string) => setLocalError((prev) => ({ seq: (prev?.seq ?? 0) + 1, message }));

  /** Chèn emoji thay cho đoạn [start, end) rồi đặt con trỏ ngay sau. */
  function insert(emoji: EmojiDef, start: number, end: number, focus: boolean) {
    const input = inputRef.current;
    if (!input) return;
    const next = insertEmoji(input.value, start, end, emoji);
    if (!next) {
      showError(`Tin nhắn tối đa ${VERSUS.chatMax} ký tự`);
      return;
    }
    input.value = next.value;
    caret.current = { start: next.caret, end: next.caret };
    if (focus) input.focus();
    if (focus || document.activeElement === input) input.setSelectionRange(next.caret, next.caret);
    rememberEmoji(emoji.code);
    setQuery(null);
  }

  /** Chọn một gợi ý: thay đoạn ":x" đang gõ bằng mã emoji. */
  function accept(emoji: EmojiDef) {
    if (query) insert(emoji, query.start, query.end, false);
  }

  /** Chọn từ bảng emoji: chèn ở chỗ con trỏ (hoặc cuối tin). Có chuột thì đưa focus về ô nhập; điện thoại thì để bàn phím đóng. */
  function pick(emoji: EmojiDef) {
    const input = inputRef.current;
    if (!input) return;
    const length = input.value.length;
    const at = document.activeElement === input
      ? { start: input.selectionStart ?? length, end: input.selectionEnd ?? length }
      : caret.current ?? { start: length, end: length };
    insert(emoji, Math.min(at.start, length), Math.min(at.end, length), hasFinePointer());
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (composing.current || e.nativeEvent.isComposing) return;
    if (suggestions.length > 0 && query) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const step = e.key === 'ArrowDown' ? 1 : -1;
        setNav({ key: queryKey, index: (active + step + suggestions.length) % suggestions.length });
        return;
      }
      if ((e.key === 'Tab' && !e.shiftKey) || (e.key === 'Enter' && (query.query.length >= 2 || navigated))) {
        e.preventDefault(); // Tab: không chuyển focus sang nút Gửi; Enter: không gửi tin
        accept(suggestions[active].emoji);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation(); // không đóng luôn khung chat
        setDismissedAt(query.start);
        return;
      }
    }
    if (e.key === 'Escape' && pickerOpen) {
      e.stopPropagation();
      setPickerOpen(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const input = inputRef.current;
    if (!input || composing.current) return;
    const text = sanitizeChat(input.value);
    if (!text) return;
    if (onSend(text)) {
      input.value = '';
      caret.current = null;
      setQuery(null);
    }
  }

  // ---------- bảng chọn emoji ----------
  const pickerRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!pickerOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!pickerRef.current?.contains(target) && !toggleRef.current?.contains(target)) setPickerOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [pickerOpen, setPickerOpen]);

  const cell = (emoji: EmojiDef) => (
    <button
      key={emoji.code}
      className="emoji-cell"
      type="button"
      aria-label={`:${emoji.code}:`}
      title={`:${emoji.code}: ${emoji.label}`}
      onMouseDown={(e) => e.preventDefault()} // giữ focus (và bàn phím, nếu đang mở) ở ô nhập
      onClick={() => pick(emoji)}
    >
      <EmojiImage emoji={emoji} maxWidth={40} maxHeight={40} />
    </button>
  );

  const error = localError?.message ?? serverError;
  const showSuggestions = suggestions.length > 0;

  return (
    <div className="chat-compose">
      <p className="chat-error" role="alert">{error}</p>

      {showSuggestions && (
        <div className="emoji-suggest">
          <ul id="chat-emoji-suggest" role="listbox" aria-label="Gợi ý emoji">
            {suggestions.map(({ emoji, alias }, i) => (
              <li
                key={emoji.code}
                id={`chat-emoji-opt-${i}`}
                className={'emoji-option' + (i === active ? ' active' : '')}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()} // giữ focus và bàn phím ở ô nhập
                onClick={() => accept(emoji)}
              >
                <span className="emoji-option-pic"><EmojiImage emoji={emoji} maxWidth={32} maxHeight={32} /></span>
                <code>:{emoji.code}:</code>
                {alias && <span className="emoji-option-alias">{alias}</span>}
              </li>
            ))}
          </ul>
          <p className="emoji-suggest-hint" aria-hidden="true">↑↓ để chọn · Tab để chèn · Esc để bỏ qua</p>
        </div>
      )}

      {pickerOpen && (
        <div
          ref={pickerRef}
          id="chat-emoji-picker"
          className="emoji-picker"
          role="dialog"
          aria-label="Chọn emoji"
          onKeyDown={(e) => {
            if (e.key !== 'Escape') return;
            e.stopPropagation();
            setPickerOpen(false);
            toggleRef.current?.focus();
          }}
        >
          {recentEmoji.length > 0 && (
            <>
              <p className="emoji-picker-title">Dùng gần đây</p>
              <div className="emoji-grid">{recentEmoji.map(cell)}</div>
            </>
          )}
          <p className="emoji-picker-title">Emoji voz</p>
          <div className="emoji-grid">{VOZ_EMOJI.map(cell)}</div>
        </div>
      )}

      <form className="chat-form" onSubmit={submit} autoComplete="off">
        <button
          ref={toggleRef}
          className={'icon-btn chat-emoji-btn' + (pickerOpen ? ' active' : '')}
          type="button"
          aria-label={pickerOpen ? 'Đóng bảng emoji' : 'Chọn emoji'}
          aria-expanded={pickerOpen}
          aria-controls="chat-emoji-picker"
          title="Emoji"
          onClick={() => setPickerOpen(!pickerOpen)}
        >
          <SmileIcon />
        </button>
        <label className="visually-hidden" htmlFor="chat-input">Tin nhắn</label>
        <input
          ref={inputRef}
          id="chat-input"
          className="chat-input"
          type="text"
          lang="vi"
          enterKeyHint="send"
          autoComplete="off"
          maxLength={VERSUS.chatMax}
          placeholder={connected ? 'Nhắn tin, gõ : chèn emoji' : 'Đang nối lại…'}
          disabled={!connected}
          defaultValue=""
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showSuggestions}
          aria-controls={showSuggestions ? 'chat-emoji-suggest' : undefined}
          aria-activedescendant={showSuggestions ? `chat-emoji-opt-${active}` : undefined}
          onInput={syncQuery}
          onSelect={syncQuery}
          onBlur={() => {
            syncQuery(); // nhớ vị trí con trỏ cho bảng emoji
            setQuery(null); // rời ô nhập thì ẩn gợi ý
          }}
          onKeyDown={onKeyDown}
          onCompositionStart={() => { composing.current = true; }}
          onCompositionEnd={() => { composing.current = false; syncQuery(); }}
        />
        <button className="btn chat-send" type="submit" disabled={!connected}>Gửi</button>
      </form>
    </div>
  );
}
