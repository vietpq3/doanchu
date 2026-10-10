'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { getSavedName, saveName } from '@/lib/client/player';
import { sanitizeName } from '@/lib/versus/protocol';
import { VERSUS } from '@/lib/versus/config';

/** Lối vào đấu theo nhóm từ trang Chơi đơn: ô nhập tên + nút `Đấu theo nhóm` (tên không được trống). */
export default function VersusEntry() {
  const router = useRouter();
  const nameRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');

  // Điền lại tên đã nhập lần trước (đọc localStorage nên chỉ làm ở trình duyệt, sau khi trang đã hiện).
  useEffect(() => {
    const input = nameRef.current;
    if (input && !input.value) input.value = getSavedName();
  }, []);

  function submit(e: FormEvent) {
    e.preventDefault();
    const name = sanitizeName(nameRef.current?.value);
    if (!name) {
      setError('Hãy nhập tên của bạn');
      nameRef.current?.focus();
      return;
    }
    saveName(name);
    router.push('/rooms');
  }

  return (
    <form className="versus-entry" onSubmit={submit} autoComplete="off" noValidate>
      <label className="visually-hidden" htmlFor="versus-name">Tên của bạn để đấu theo nhóm</label>
      <div className="versus-entry-row">
        <input
          ref={nameRef}
          id="versus-name"
          className="versus-name"
          type="text"
          maxLength={VERSUS.nameMax}
          placeholder="Tên của bạn"
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby="versus-name-error"
          onChange={() => error && setError('')}
        />
        <button className="btn secondary versus-btn" type="submit">Đấu theo nhóm</button>
      </div>
      <p id="versus-name-error" className="versus-error" role="alert">{error}</p>
    </form>
  );
}
