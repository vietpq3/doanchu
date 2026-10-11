'use client';

import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent, type RefObject } from 'react';
import { ChatImageError, prepareChatImage, type PreparedImage } from '@/lib/client/chatImage';
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
  /** gửi ảnh kèm chữ (có thể rỗng); trả về câu báo lỗi, hoặc null nếu đã gửi */
  onSendImage: (image: PreparedImage, text: string) => Promise<string | null>;
  /** lỗi từ server (vd gửi quá nhanh) */
  serverError: string;
  pickerOpen: boolean;
  setPickerOpen: (open: boolean) => void;
}

/** Lỗi do chính ô nhập (vd chèn emoji làm tin quá dài) tự ẩn sau chừng này. */
const LOCAL_ERROR_MS = 3000;

const hasFinePointer = () => window.matchMedia('(pointer: fine)').matches;
const sameQuery = (a: EmojiQuery | null, b: EmojiQuery | null) => a === b || (!!a && !!b && a.start === b.start && a.end === b.end && a.query === b.query);

const ImageIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4" width="18" height="16" rx="2.5" />
    <circle cx="9" cy="10" r="1.8" />
    <path d="m21 16-5.2-5.2L6 20" />
  </svg>
);

const PasteIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 4h6v3H9z" />
    <path d="M15 5h2.5A1.5 1.5 0 0 1 19 6.5v13a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19.5v-13A1.5 1.5 0 0 1 6.5 5H9" />
    <path d="M9 12h6M9 16h4" />
  </svg>
);

const formatSize = (bytes: number) => (bytes >= 100_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`);

const SmileIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M8.5 14.5a4.5 4.5 0 0 0 7 0" />
    <circle cx="9" cy="10" r="1" fill="currentColor" stroke="none" />
    <circle cx="15" cy="10" r="1" fill="currentColor" stroke="none" />
  </svg>
);

/**
 * Ô nhập chat có emoji voz và ảnh:
 * - Hàng nút nhỏ trên ô nhập: emoji, gửi ảnh từ máy (chọn file), dán từ clipboard (ảnh, vd ảnh từ nút `Chụp ảnh màn hình`, hoặc chữ).
 *   Ctrl+V / dán vào ô nhập một ảnh cũng được. Ảnh chọn/dán hiện thành ô xem trước (bỏ được bằng ✕); bấm Gửi thì gửi ảnh kèm chữ
 *   đang gõ (nếu có). Ảnh lớn được thu nhỏ trước khi gửi (src/lib/client/chatImage.ts).
 * - Nút mặt cười mở bảng chọn emoji (hàng "Dùng gần đây" + toàn bộ bộ emoji); bấm một emoji thì chèn mã vào chỗ con trỏ, bảng vẫn mở
 *   để chọn tiếp; đóng bằng nút đó, Esc hoặc bấm ra ngoài.
 * - Gõ `:` + chữ (đầu tin hoặc sau dấu cách) thì hiện tối đa 3 emoji gần khớp nhất ngay trên ô nhập (bỏ dấu tiếng Việt khi so, để
 *   bộ gõ Telex không làm hỏng): chạm/bấm để chọn, ↑↓ để đổi, Tab để chèn, Esc để bỏ qua. Enter chèn emoji khi đã gõ từ 2 chữ trở
 *   lên (hoặc đã dùng ↑↓); mới gõ 1 chữ (`:v`, `:p`...) thì Enter vẫn gửi tin như bình thường.
 * Ô nhập không điều khiển bằng React (như ô đoán) để bộ gõ tiếng Việt hoạt động ổn định.
 */
export default function ChatComposer({ inputRef, connected, onSend, onSendImage, serverError, pickerOpen, setPickerOpen }: Props) {
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

  // ---------- ảnh ----------
  /** ảnh đang chờ gửi (đã chọn/dán), kèm đường dẫn tạm để xem trước */
  const [pending, setPending] = useState<{ image: PreparedImage; url: string } | null>(null);
  /** đang xử lý ảnh vừa chọn/dán, hoặc đang gửi ảnh */
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => (pending ? () => URL.revokeObjectURL(pending.url) : undefined), [pending]);

  async function attach(file: Blob) {
    setBusy(true);
    try {
      const image = await prepareChatImage(file);
      setPending({ image, url: URL.createObjectURL(image.blob) });
      if (hasFinePointer()) inputRef.current?.focus();
    } catch (err) {
      showError(err instanceof ChatImageError ? err.message : 'Không đọc được ảnh này');
    } finally {
      setBusy(false);
    }
  }

  /** Chèn chữ (dán từ clipboard) vào chỗ con trỏ; quá độ dài tối đa thì cắt bớt. */
  function insertText(raw: string) {
    const input = inputRef.current;
    if (!input) return;
    const clean = raw.replace(/\s+/g, ' ');
    if (!clean.trim()) {
      showError('Clipboard không có chữ hay ảnh');
      return;
    }
    const length = input.value.length;
    const at = document.activeElement === input
      ? { start: input.selectionStart ?? length, end: input.selectionEnd ?? length }
      : caret.current ?? { start: length, end: length };
    const start = Math.min(at.start, length);
    const end = Math.min(at.end, length);
    const room = VERSUS.chatMax - (length - (end - start));
    if (room <= 0) {
      showError(`Tin nhắn tối đa ${VERSUS.chatMax} ký tự`);
      return;
    }
    const piece = clean.slice(0, room);
    input.value = input.value.slice(0, start) + piece + input.value.slice(end);
    const next = start + piece.length;
    caret.current = { start: next, end: next };
    if (hasFinePointer()) input.focus();
    if (document.activeElement === input) input.setSelectionRange(next, next);
    if (piece.length < clean.length) showError(`Tin nhắn tối đa ${VERSUS.chatMax} ký tự: đã cắt bớt`);
  }

  /** Nút dán: đọc clipboard (trình duyệt có thể hỏi quyền); có ảnh thì lấy ảnh, không thì lấy chữ. */
  async function pasteFromClipboard() {
    const clip = navigator.clipboard;
    try {
      if (clip?.read) {
        const items = await clip.read();
        for (const item of items) {
          const imageType = item.types.find((t) => t.startsWith('image/'));
          if (imageType) return attach(await item.getType(imageType));
        }
        const textItem = items.find((item) => item.types.includes('text/plain'));
        return insertText(textItem ? await (await textItem.getType('text/plain')).text() : '');
      }
      if (clip?.readText) return insertText(await clip.readText());
    } catch {
      /* bị từ chối quyền đọc clipboard, hoặc trình duyệt không hỗ trợ */
    }
    showError('Trình duyệt không cho đọc clipboard: nhấn giữ ô nhập rồi chọn Dán (hoặc Ctrl+V)');
  }

  /** Dán (Ctrl+V, menu Dán) vào ô nhập: có ảnh thì lấy ảnh; chữ thì để trình duyệt dán như thường. */
  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    const file = Array.from(e.clipboardData.files).find((f) => f.type.startsWith('image/'));
    if (!file) return;
    e.preventDefault();
    void attach(file);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const input = inputRef.current;
    if (!input || composing.current || busy) return;
    const text = sanitizeChat(input.value);
    if (pending) {
      setBusy(true);
      const failure = await onSendImage(pending.image, text ?? '');
      setBusy(false);
      if (failure) {
        showError(failure);
        return;
      }
      setPending(null);
      input.value = '';
      caret.current = null;
      setQuery(null);
      return;
    }
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

      <div className="chat-tools">
        <button
          ref={toggleRef}
          className={'icon-btn chat-tool' + (pickerOpen ? ' active' : '')}
          type="button"
          aria-label={pickerOpen ? 'Đóng bảng emoji' : 'Chọn emoji'}
          aria-expanded={pickerOpen}
          aria-controls="chat-emoji-picker"
          title="Emoji"
          onClick={() => setPickerOpen(!pickerOpen)}
        >
          <SmileIcon />
        </button>
        <button
          className="icon-btn chat-tool"
          type="button"
          aria-label="Gửi ảnh từ máy"
          title="Gửi ảnh"
          disabled={!connected || busy}
          onClick={() => fileRef.current?.click()}
        >
          <ImageIcon />
        </button>
        <input
          ref={fileRef}
          className="visually-hidden"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = ''; // chọn lại đúng file đó lần sau vẫn có sự kiện
            if (file) void attach(file);
          }}
        />
        <button
          className="icon-btn chat-tool"
          type="button"
          aria-label="Dán từ clipboard"
          title="Dán (chữ hoặc ảnh)"
          disabled={!connected || busy}
          onMouseDown={(e) => e.preventDefault()} // giữ focus và vị trí con trỏ ở ô nhập
          onClick={() => void pasteFromClipboard()}
        >
          <PasteIcon />
        </button>
        {pending && (
          <span className="chat-attachment">
            {/* eslint-disable-next-line @next/next/no-img-element -- ảnh tạm (blob:) của người dùng */}
            <img src={pending.url} alt="Ảnh sắp gửi" />
            <span className="chat-attachment-info">{busy ? 'Đang gửi…' : `Ảnh · ${formatSize(pending.image.blob.size)}`}</span>
            <button className="chat-attachment-remove" type="button" aria-label="Bỏ ảnh" disabled={busy} onClick={() => setPending(null)}>✕</button>
          </span>
        )}
        {!pending && busy && <span className="chat-attachment-info">Đang xử lý ảnh…</span>}
      </div>

      <form className="chat-form" onSubmit={submit} autoComplete="off">
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
          placeholder={!connected ? 'Đang nối lại…' : pending ? 'Thêm chú thích (không bắt buộc)' : 'Nhắn tin, gõ : chèn emoji'}
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
          onPaste={onPaste}
          onCompositionStart={() => { composing.current = true; }}
          onCompositionEnd={() => { composing.current = false; syncQuery(); }}
        />
        <button className="btn chat-send" type="submit" disabled={!connected || busy}>Gửi</button>
      </form>
    </div>
  );
}
