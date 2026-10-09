'use client';

import { useRef, useState, type FormEvent, type RefObject } from 'react';
import Modal from './Modal';

interface Props {
  open: boolean;
  /** số của từ khóa đang chơi; null nếu không có */
  current: number | null;
  /** tổng số từ khóa */
  count: number;
  busy: boolean;
  /** Bắt đầu ván mới với từ khóa số `no`. Trả về thông báo lỗi nếu không bắt đầu được, null nếu thành công. */
  onStart: (no: number) => Promise<string | null>;
  onClose: () => void;
}

/** Chọn số của từ khóa để bắt đầu ván mới với đúng từ khóa đó (số hiện ở góc trên bên trái màn chơi). */
export default function KeywordDialog({ open, current, count, busy, onStart, onClose }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <Modal open={open} onClose={onClose} label="Chọn từ khóa theo số" initialFocus={inputRef}>
      <div className="dlg-head">
        <h2>Chọn từ khóa theo số</h2>
        <button className="icon-btn" type="button" aria-label="Đóng" onClick={onClose}>✕</button>
      </div>
      <KeywordForm inputRef={inputRef} current={current} count={count} busy={busy} onStart={onStart} />
    </Modal>
  );
}

/** Tách riêng để ô nhập và thông báo lỗi được dựng lại (xoá sạch) mỗi lần mở hộp thoại. */
function KeywordForm({ inputRef, current, count, busy, onStart }: Pick<Props, 'current' | 'count' | 'busy' | 'onStart'> & { inputRef: RefObject<HTMLInputElement | null> }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const digits = value.trim();
    const no = Number(digits);
    if (!/^\d+$/.test(digits) || no < 1 || no > count) {
      setError(`Nhập số từ 1 đến ${count}`);
      return;
    }
    setError('');
    const failure = await onStart(no);
    if (failure) setError(failure);
  }

  return (
    <form className="dlg-body" onSubmit={submit} autoComplete="off">
      <p>Mỗi từ khóa có một số thứ tự từ <b>1</b> đến <b>{count}</b>. Nhập số để bắt đầu ván mới với đúng từ khóa đó.</p>
      {current !== null && <p className="muted">Từ khóa đang chơi: <b>#{current}</b></p>}
      <label className="visually-hidden" htmlFor="keyword-no">Số của từ khóa</label>
      <div className="guess-form">
        <input
          ref={inputRef}
          id="keyword-no"
          className="guess-input"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          enterKeyHint="go"
          autoComplete="off"
          maxLength={10}
          placeholder={`vd: ${Math.min(300, count)}`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-describedby="keyword-error"
        />
        <button className="btn" type="submit" disabled={busy}>Bắt đầu</button>
      </div>
      <p id="keyword-error" className="input-hint warn keyword-error" role="alert">{error}</p>
    </form>
  );
}
