'use client';

import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent, type RefObject } from 'react';
import { ChatImageError, prepareChatImage, type PreparedImage } from '@/lib/client/chatImage';
import { rememberEmoji, useRecentEmoji } from '@/lib/client/recentEmoji';
import { VERSUS } from '@/lib/versus/config';
import { EMOJI_BY_CODE, emojiCode, findEmojiQuery, insertEmoji, searchEmoji, VOZ_EMOJI, type EmojiDef, type EmojiQuery } from '@/lib/versus/emoji';
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
 * - Gõ `::` (mã emoji là `::tên::`) thì cũng mở bảng đó; gõ tiếp chữ thì bảng chỉ còn các emoji khớp (bỏ dấu tiếng Việt khi so, để bộ
 *   gõ Telex không làm hỏng), không còn emoji nào khớp thì bảng ẩn. Chạm/bấm một emoji, hoặc Enter/Tab, thì thay đoạn `::x` đang gõ
 *   bằng mã emoji rồi đóng bảng; phím mũi tên để đổi emoji đang chọn, Esc để đóng. Một dấu `:` (`:v`, `:)`, `10:30`) không mở bảng.
 * Ô nhập không điều khiển bằng React (như ô đoán) để bộ gõ tiếng Việt hoạt động ổn định.
 */
export default function ChatComposer({ inputRef, connected, onSend, onSendImage, serverError, pickerOpen, setPickerOpen }: Props) {
  const composing = useRef(false);
  /** vị trí con trỏ gần nhất: bảng emoji chèn vào đây khi ô nhập không có focus (điện thoại: bàn phím đã đóng) */
  const caret = useRef<{ start: number; end: number } | null>(null);
  const recent = useRecentEmoji();
  const recentEmoji = useMemo(() => recent.map((c) => EMOJI_BY_CODE.get(c)).filter((e): e is EmojiDef => !!e), [recent]);

  // ---------- gõ "::x" ----------
  const [query, setQuery] = useState<EmojiQuery | null>(null);
  /** đoạn "::x" (theo vị trí "::") người dùng đã đóng bảng (Esc, nút mặt cười) */
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const typing = query && query.start !== dismissedAt ? query : null;
  const typingText = typing?.query ?? null;
  const matches = useMemo(() => (typingText ? searchEmoji(typingText, recent) : []), [typingText, recent]);
  const queryKey = typing ? `${typing.start}:${typing.query}` : '';

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

  /** Chọn emoji khi đang gõ "::x": thay đoạn đó bằng mã emoji (bảng đóng, trừ khi đã mở bằng nút mặt cười). */
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
  const scrollRef = useRef<HTMLDivElement>(null);
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

  // Bảng mở do gõ "::" (mới gõ "::", hoặc có emoji khớp chữ gõ tiếp); không còn emoji nào khớp thì không tính (bảng ẩn, hoặc nếu đã mở
  // bằng nút mặt cười thì về lại toàn bộ bộ emoji).
  const typingShown = !!typing && (!typingText || matches.length > 0);
  // Các nhóm emoji trong bảng: đang gõ "::x" thì chỉ các emoji khớp; còn lại (kể cả mới gõ "::") thì "Dùng gần đây" + toàn bộ.
  const sections = typingShown && typingText
    ? [{ key: 'match', title: `Emoji khớp “${typingText}”`, emoji: matches.map((m) => m.emoji) }]
    : [
        ...(recentEmoji.length > 0 ? [{ key: 'recent', title: 'Dùng gần đây', emoji: recentEmoji }] : []),
        { key: 'all', title: 'Emoji voz', emoji: VOZ_EMOJI },
      ];
  const shown = pickerOpen || typingShown;
  const cellCount = sections.reduce((n, section) => n + section.emoji.length, 0);
  // emoji đang chọn khi gõ "::x" (Enter/Tab chèn emoji này); chỉ có hiệu lực với đúng đoạn đang gõ, gõ thêm chữ thì về emoji đầu
  const [nav, setNav] = useState({ key: '', index: 0 });
  const active = typingShown ? (nav.key === queryKey ? Math.min(nav.index, cellCount - 1) : 0) : -1;
  const activeEmoji = active >= 0 ? sections.flatMap((section) => section.emoji)[active] : undefined;
  const activeAlias = typingText ? matches[active]?.alias ?? null : null;

  // Giữ emoji đang chọn trong vùng nhìn thấy của bảng (chỉ cuộn bảng, không cuộn trang); emoji đầu thì cuộn lên đầu để thấy tiêu đề.
  useEffect(() => {
    const scroller = scrollRef.current;
    if (active < 0 || !scroller) return;
    if (active === 0) {
      scroller.scrollTop = 0;
      return;
    }
    const cell = scroller.querySelector<HTMLElement>(`#chat-emoji-cell-${active}`);
    if (!cell) return;
    const box = scroller.getBoundingClientRect();
    const rect = cell.getBoundingClientRect();
    if (rect.top < box.top) scroller.scrollTop -= box.top - rect.top + 4;
    else if (rect.bottom > box.bottom) scroller.scrollTop += rect.bottom - box.bottom + 4;
  }, [active, queryKey]);

  /** Emoji kế tiếp theo phím mũi tên: ←→ sang ô bên cạnh, ↑↓ sang hàng trên/dưới (ô gần nhất theo chiều ngang, đo trên bảng). */
  function move(key: string): number {
    const cells = Array.from(scrollRef.current?.querySelectorAll<HTMLElement>('.emoji-cell') ?? []);
    if (cells.length === 0) return 0;
    if (key === 'ArrowLeft') return Math.max(0, active - 1);
    if (key === 'ArrowRight') return Math.min(cells.length - 1, active + 1);
    const from = cells[active].getBoundingClientRect();
    const x = from.left + from.width / 2;
    const down = key === 'ArrowDown';
    let rowTop: number | null = null;
    let best = active;
    let bestDx = Infinity;
    cells.forEach((cell, i) => {
      const rect = cell.getBoundingClientRect();
      if (down ? rect.top <= from.top + 1 : rect.top >= from.top - 1) return;
      const nearer = rowTop === null || (down ? rect.top < rowTop - 1 : rect.top > rowTop + 1);
      if (!nearer && Math.abs(rect.top - rowTop!) > 1) return;
      const dx = Math.abs(rect.left + rect.width / 2 - x);
      if (nearer || dx < bestDx) {
        rowTop = rect.top;
        best = i;
        bestDx = dx;
      }
    });
    return best;
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (composing.current || e.nativeEvent.isComposing) return;
    if (typingShown && typing && activeEmoji) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        setNav({ key: queryKey, index: move(e.key) });
        return;
      }
      if ((e.key === 'Tab' && !e.shiftKey) || e.key === 'Enter') {
        e.preventDefault(); // Tab: không chuyển focus sang nút Gửi; Enter: không gửi tin
        accept(activeEmoji);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation(); // không đóng luôn khung chat
        setDismissedAt(typing.start);
        return;
      }
    }
    if (e.key === 'Escape' && pickerOpen) {
      e.stopPropagation();
      setPickerOpen(false);
    }
  }

  /** Bảng đang mở do gõ "::" lúc bấm nút mặt cười: bấm nút thì đóng bảng (lúc click thì ô nhập đã mất focus, gợi ý đã ẩn). */
  const typingAtPointer = useRef<number | null>(null);
  function toggle() {
    const start = typingAtPointer.current;
    typingAtPointer.current = null;
    if (start !== null) {
      setDismissedAt(start);
      setPickerOpen(false);
    } else {
      setPickerOpen(!pickerOpen);
    }
  }

  let cellIndex = 0;
  const cell = (emoji: EmojiDef, index: number) => (
    <button
      key={emoji.code}
      id={typingShown ? `chat-emoji-cell-${index}` : undefined}
      className={'emoji-cell' + (index === active ? ' active' : '')}
      type="button"
      aria-label={emojiCode(emoji)}
      title={`${emojiCode(emoji)} ${emoji.label}`}
      onMouseDown={(e) => e.preventDefault()} // giữ focus (và bàn phím, nếu đang mở) ở ô nhập
      onClick={() => (typingShown ? accept(emoji) : pick(emoji))}
    >
      <EmojiImage emoji={emoji} maxWidth={40} maxHeight={40} />
    </button>
  );

  const error = localError?.message ?? serverError;

  return (
    <div className="chat-compose">
      <p className="chat-error" role="alert">{error}</p>

      {shown && (
        <div
          ref={pickerRef}
          id="chat-emoji-picker"
          className="emoji-picker"
          role="dialog"
          aria-label="Chọn emoji"
          // bấm vào chỗ trống/tiêu đề trong bảng thì ô nhập không mất focus (bảng mở do gõ "::" không bị đóng); thanh cuộn thì vẫn kéo được
          onMouseDown={(e) => {
            if (e.target !== scrollRef.current) e.preventDefault();
          }}
          onKeyDown={(e) => {
            if (e.key !== 'Escape') return;
            e.stopPropagation();
            setPickerOpen(false);
            toggleRef.current?.focus();
          }}
        >
          <div ref={scrollRef} className="emoji-picker-scroll">
            {sections.map((section) => (
              <div key={section.key}>
                <p className="emoji-picker-title">{section.title}</p>
                <div className="emoji-grid">{section.emoji.map((emoji) => cell(emoji, cellIndex++))}</div>
              </div>
            ))}
          </div>
          {activeEmoji && (
            <p className="emoji-picker-foot" aria-hidden="true">
              <code>{emojiCode(activeEmoji)}</code>
              {activeAlias && <span>{activeAlias}</span>}
              <span className="emoji-picker-keys">↑↓←→ chọn · Enter chèn · Esc đóng</span>
            </p>
          )}
        </div>
      )}

      <div className="chat-tools">
        <button
          ref={toggleRef}
          className={'icon-btn chat-tool' + (shown ? ' active' : '')}
          type="button"
          aria-label={shown ? 'Đóng bảng emoji' : 'Chọn emoji'}
          aria-expanded={shown}
          aria-controls="chat-emoji-picker"
          title="Emoji"
          onPointerDown={() => {
            typingAtPointer.current = typingShown && typing ? typing.start : null;
          }}
          onClick={toggle}
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
          placeholder={!connected ? 'Đang nối lại…' : pending ? 'Thêm chú thích (không bắt buộc)' : 'Nhắn tin, gõ :: chèn emoji'}
          disabled={!connected}
          defaultValue=""
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={shown}
          aria-controls={shown ? 'chat-emoji-picker' : undefined}
          aria-activedescendant={activeEmoji ? `chat-emoji-cell-${active}` : undefined}
          onInput={syncQuery}
          onSelect={syncQuery}
          onBlur={() => {
            syncQuery(); // nhớ vị trí con trỏ cho bảng emoji
            setQuery(null); // rời ô nhập thì đóng bảng mở do gõ "::"
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
