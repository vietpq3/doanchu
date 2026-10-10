'use client';

import { usePathname } from 'next/navigation';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react';
import { isEmojiOnly, parseChatText } from '@/lib/versus/emoji';
import ChatComposer from './ChatComposer';
import EmojiImage from './EmojiImage';
import { useRoom } from './RoomProvider';

/** Từ bề rộng này trở lên (laptop) khung chat nằm cố định bên cạnh; hẹp hơn (điện thoại, máy tính bảng dọc) là bubble. Khớp với globals.css. */
const SIDE_QUERY = '(min-width: 960px)';

function subscribeSide(onChange: () => void) {
  const mq = window.matchMedia(SIDE_QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}
const useSideLayout = () => useSyncExternalStore(subscribeSide, () => window.matchMedia(SIDE_QUERY).matches, () => false);

/** Lỗi gửi chat (vd gửi quá nhanh) tự ẩn sau chừng này. */
const ERROR_MS = 3000;
/** Cuộn cách đáy ít hơn chừng này thì coi là đang ở cuối: tin mới đến tự cuộn xuống. */
const BOTTOM_SLACK = 40;

const timeFormat = new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' });

const ChatIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12z" />
  </svg>
);
/** Hai mũi tên sang phải: thu gọn sidebar chat về bên phải (khi đã thu gọn thì xoay ngược lại thành "mở ra"). */
const CollapseIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 6l6 6-6 6M13 6l6 6-6 6" />
  </svg>
);
/** Laptop: người chơi thu gọn sidebar chat thì nhớ lại cho lần sau. */
const COLLAPSED_KEY = 'doanchu-chat-collapsed';
function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}
const CloseIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

/**
 * Nội dung một tin chat: chữ và emoji voz (mã như `:beauty:` hiện thành ảnh, cỡ 40px lẫn trong chữ). Tin chỉ có emoji thì không có nền
 * bong bóng và emoji hiện đúng cỡ gốc 48px.
 */
function MessageText({ text }: { text: string }) {
  const segments = useMemo(() => parseChatText(text), [text]);
  const emojiOnly = isEmojiOnly(segments);
  const size = emojiOnly ? 48 : 40;
  return (
    <span className={'chat-text' + (emojiOnly ? ' emoji-only' : '')}>
      {segments.map((s, i) =>
        s.type === 'text' ? <Fragment key={i}>{s.text}</Fragment> : <EmojiImage key={i} emoji={s.emoji} maxWidth={size} maxHeight={size} className="chat-emoji" />,
      )}
    </span>
  );
}

/**
 * Chat của phòng, dùng chung cho Inside Room (Sảnh chờ) và màn đấu: mọi người trong phòng (ở sảnh, ở bàn, đang đấu) cùng một kênh.
 * - Laptop: khung chat là sidebar bên phải; nút cạnh chữ "Chat" thu gọn nó (trượt sang phải, chỉ còn một dải hẹp có nút mở lại, nút có
 *   chấm đỏ khi có tin mới), trạng thái thu gọn được nhớ cho lần sau.
 * - Điện thoại: bubble ở góc dưới, bấm để mở/đóng khung chat (đang mở thì bubble thành ✕; chạm ra ngoài khung chat hoặc Esc cũng đóng);
 *   có tin mới của người khác khi khung đang đóng thì bubble có chấm đỏ.
 * Đặt ở layout của phòng nên không bị dựng lại khi chuyển giữa sảnh và màn đấu (giữ chữ đang gõ, vị trí cuộn, chấm đỏ); riêng khung chat
 * của bubble tự đóng khi chuyển trang (ván bắt đầu/kết thúc) để không che ô chữ.
 * Có emoji voz: bảng chọn và gợi ý khi gõ `:x` ở ChatComposer, mã emoji trong tin hiện thành ảnh (src/lib/versus/emoji.ts).
 */
export default function RoomChat() {
  const { view, status, chat, chatError, send, onChatMessage } = useRoom();
  const side = useSideLayout();
  const pathname = usePathname();
  // bubble: khung chat mở ở trang nào thì chỉ mở ở trang đó
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  // sidebar (laptop) đã thu gọn; chỉ dựng ở trình duyệt (chat chỉ hiện sau khi đã kết nối) nên đọc localStorage ngay được
  const [collapsed, setCollapsedState] = useState(readCollapsed);
  const visible = side ? !collapsed : open;

  // Chấm đỏ: có tin mới của người khác đến trong lúc khung chat không hiện (không tính lịch sử nhận lúc vào phòng).
  const [unread, setUnread] = useState(false);
  const visibleRef = useRef(visible);
  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);
  useEffect(
    () => onChatMessage((message) => {
      if (!message.mine && !visibleRef.current) setUnread(true);
    }),
    [onChatMessage],
  );

  const bubbleRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // bảng emoji: như khung chat của bubble, mở ở trang nào thì chỉ mở ở trang đó (ván bắt đầu/kết thúc thì tự đóng)
  const [pickerOn, setPickerOn] = useState<string | null>(null);
  const pickerOpen = pickerOn === pathname;
  const setPickerOpen = useCallback((next: boolean) => setPickerOn(next ? pathname : null), [pathname]);

  function setOpen(next: boolean) {
    setUnread(false);
    setOpenOn(next ? pathname : null);
    if (!next) setPickerOpen(false);
    // Có chuột/bàn phím thì đưa focus vào ô nhập; điện thoại thì không (để bàn phím ảo không bật lên che tin nhắn).
    if (next && window.matchMedia('(pointer: fine)').matches) setTimeout(() => inputRef.current?.focus(), 0);
  }

  function setCollapsed(next: boolean) {
    setCollapsedState(next);
    try {
      localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0');
    } catch {
      /* không lưu được thì thôi */
    }
    if (next) setPickerOpen(false);
    else setUnread(false);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key !== 'Escape' || side) return;
    setOpen(false);
    bubbleRef.current?.focus();
  }

  // Tin mới: cuộn xuống cuối nếu đang ở cuối hoặc là tin của mình; mở khung chat thì luôn xem từ cuối.
  const logRef = useRef<HTMLOListElement>(null);
  const atBottom = useRef(true);
  const last = chat.at(-1);
  useEffect(() => {
    if (visible) atBottom.current = true;
  }, [visible]);
  useEffect(() => {
    const log = logRef.current;
    if (log && visible && (atBottom.current || last?.mine)) log.scrollTop = log.scrollHeight;
  }, [last, visible]);

  const [hiddenErrorSeq, setHiddenErrorSeq] = useState(0);
  useEffect(() => {
    if (!chatError) return;
    const timer = setTimeout(() => setHiddenErrorSeq(chatError.seq), ERROR_MS);
    return () => clearTimeout(timer);
  }, [chatError]);
  const error = chatError && chatError.seq !== hiddenErrorSeq ? chatError.message : '';

  if (!view) return null;
  const connected = status === 'open';

  return (
    <aside className={'chat' + (side && collapsed ? ' collapsed' : '')} aria-label="Chat của phòng">
      {side && (
        <>
          {/* nằm ngoài khung chat (không trượt theo): luôn ở mép trái sidebar, lúc thu gọn là nút mở lại trên dải hẹp */}
          <button
            className="icon-btn chat-toggle"
            type="button"
            aria-expanded={!collapsed}
            aria-controls="room-chat"
            aria-label={collapsed ? (unread ? 'Mở chat (có tin nhắn mới)' : 'Mở chat') : 'Thu gọn chat'}
            title={collapsed ? 'Mở chat' : 'Thu gọn chat'}
            onClick={() => setCollapsed(!collapsed)}
          >
            <CollapseIcon />
            {unread && collapsed && <span className="chat-dot" aria-hidden="true" />}
          </button>
          <span className="chat-rail-label" aria-hidden="true">Chat</span>
        </>
      )}
      {!side && open && (
        // Điện thoại, khung chat đang mở: lớp trong suốt phủ phần còn lại của màn hình, chạm vào thì đóng khung chat. Lần chạm đó chỉ để
        // đóng (không bấm xuyên xuống ô ngồi bàn, Start, Rời phòng... bên dưới); kéo để cuộn trang vẫn được.
        <div className="chat-backdrop" aria-hidden="true" onClick={() => setOpen(false)} />
      )}
      {!side && (
        <button
          ref={bubbleRef}
          className="chat-bubble"
          type="button"
          aria-expanded={open}
          aria-controls="room-chat"
          aria-label={open ? 'Đóng chat' : unread ? 'Mở chat (có tin nhắn mới)' : 'Mở chat'}
          title={open ? 'Đóng chat' : 'Chat với mọi người trong phòng'}
          onClick={() => setOpen(!open)}
        >
          {open ? <CloseIcon /> : <ChatIcon />}
          {unread && !open && <span className="chat-dot" aria-hidden="true" />}
        </button>
      )}
      {/* sidebar thu gọn: vẫn hiện (để trượt ra/vào) nhưng không bấm/focus được; bubble đóng: ẩn hẳn */}
      <section id="room-chat" className="chat-panel" hidden={!side && !open} inert={side && collapsed} onKeyDown={onKeyDown}>
        <div className="chat-head">
          <h2>Chat</h2>
          <span className="chat-room">{view.roomName}</span>
        </div>
        <ol
          ref={logRef}
          className="chat-log"
          role="log"
          aria-live="polite"
          aria-label="Tin nhắn"
          onScroll={(e) => {
            const log = e.currentTarget;
            atBottom.current = log.scrollHeight - log.scrollTop - log.clientHeight < BOTTOM_SLACK;
          }}
        >
          {chat.length === 0 && <li className="chat-empty">Chưa có tin nhắn nào. Gửi lời chào tới mọi người trong phòng!</li>}
          {chat.map((m, i) => {
            const prev = chat[i - 1];
            // tin liền nhau của cùng một người: chỉ hiện tên/giờ ở tin đầu
            const head = !prev || prev.name !== m.name || prev.mine !== m.mine;
            return (
              <li key={m.seq} className={'chat-msg' + (m.mine ? ' mine' : '') + (head ? ' head' : '')}>
                {head && (
                  <span className="chat-meta">
                    {!m.mine && <b>{m.name}</b>}
                    <time dateTime={new Date(m.at).toISOString()}>{timeFormat.format(m.at)}</time>
                  </span>
                )}
                <MessageText text={m.text} />
              </li>
            );
          })}
        </ol>
        <ChatComposer
          inputRef={inputRef}
          connected={connected}
          onSend={(text) => send({ type: 'chat', text })}
          serverError={error}
          pickerOpen={pickerOpen}
          setPickerOpen={setPickerOpen}
        />
      </section>
    </aside>
  );
}
