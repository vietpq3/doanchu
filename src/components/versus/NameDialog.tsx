'use client';

import { useRef, useState, type FormEvent, type RefObject } from 'react';
import { VERSUS } from '@/lib/versus/config';
import { randomPlayerName } from '@/lib/versus/names';
import { sanitizeName } from '@/lib/versus/protocol';
import Modal from '../Modal';

interface Props {
  open: boolean;
  title: string;
  /** tên điền sẵn; '' thì điền một tên gợi ý ngẫu nhiên */
  initialName: string;
  /** chữ trên nút gửi, vd `Vào` hoặc `Lưu` */
  submitLabel: string;
  /** tên đã chuẩn hoá (không trống) */
  onSubmit: (name: string) => void;
  /** Hủy, ✕, Esc hoặc bấm ra ngoài */
  onClose: () => void;
}

/** Hộp thoại nhập tên để đấu theo nhóm: điền sẵn tên gợi ý (bấm 🎲 để đổi gợi ý); tên không được trống. */
export default function NameDialog({ open, title, initialName, submitLabel, onSubmit, onClose }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <Modal open={open} onClose={onClose} className="name-dlg" label={title} initialFocus={inputRef}>
      <div className="dlg-head">
        <h2>{title}</h2>
        <button className="icon-btn" type="button" aria-label="Đóng" onClick={onClose}>✕</button>
      </div>
      <NameForm inputRef={inputRef} initialName={initialName} submitLabel={submitLabel} onSubmit={onSubmit} onClose={onClose} />
    </Modal>
  );
}

/** Tách riêng để ô nhập (và tên gợi ý) được dựng lại mỗi lần mở hộp thoại. */
function NameForm({ inputRef, initialName, submitLabel, onSubmit, onClose }: Omit<Props, 'open' | 'title'> & { inputRef: RefObject<HTMLInputElement | null> }) {
  // chỉ chạy ở trình duyệt (hộp thoại chỉ mở sau khi trang đã hiện) nên tên ngẫu nhiên không lệch khi hydrate
  const [value, setValue] = useState(() => initialName || randomPlayerName());
  const [error, setError] = useState('');
  const selected = useRef(false); // chọn sẵn cả tên một lần khi mở để gõ đè; chạm lại vào ô thì sửa bình thường

  function submit(e: FormEvent) {
    e.preventDefault();
    const name = sanitizeName(value);
    if (!name) {
      setError('Hãy nhập tên của bạn');
      inputRef.current?.focus();
      return;
    }
    onSubmit(name);
  }

  function suggest() {
    setValue(randomPlayerName());
    setError('');
    inputRef.current?.focus();
  }

  return (
    <form className="dlg-body name-form" onSubmit={submit} autoComplete="off" noValidate>
      <p className="muted">Tên hiện cho những người cùng phòng. Dùng tên gợi ý hoặc gõ tên của bạn.</p>
      <label className="visually-hidden" htmlFor="versus-name">Tên của bạn</label>
      <div className="name-row">
        <input
          ref={inputRef}
          id="versus-name"
          className="versus-name"
          type="text"
          enterKeyHint="go"
          autoComplete="off"
          maxLength={VERSUS.nameMax}
          placeholder="Tên của bạn"
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby="versus-name-error"
          onFocus={(e) => {
            if (selected.current) return;
            selected.current = true;
            e.currentTarget.select();
          }}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError('');
          }}
        />
        <button className="icon-btn dice-btn" type="button" aria-label="Gợi ý tên khác" title="Gợi ý tên khác" onClick={suggest}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="4" />
            <circle cx="8.5" cy="8.5" r="1.2" fill="currentColor" />
            <circle cx="15.5" cy="15.5" r="1.2" fill="currentColor" />
            <circle cx="12" cy="12" r="1.2" fill="currentColor" />
          </svg>
        </button>
      </div>
      <p id="versus-name-error" className="versus-error" role="alert">{error}</p>
      <div className="name-actions">
        <button className="btn secondary" type="button" onClick={onClose}>Hủy</button>
        <button className="btn" type="submit">{submitLabel}</button>
      </div>
    </form>
  );
}
