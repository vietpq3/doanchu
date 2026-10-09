'use client';

import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  className?: string;
  label: string;
  /** phần tử nhận focus khi mở (mặc định: phần tử đầu tiên trình duyệt chọn) */
  initialFocus?: React.RefObject<HTMLElement | null>;
  children: ReactNode;
}

/** Hộp thoại dùng <dialog> gốc của trình duyệt: Esc, bấm ra ngoài hoặc onClose để đóng. */
export default function Modal({ open, onClose, className, label, initialFocus, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      dlg.showModal();
      initialFocus?.current?.focus();
    } else if (!open && dlg.open) {
      dlg.close();
    }
  }, [open, initialFocus]);

  return (
    <dialog
      ref={ref}
      className={className}
      aria-label={label}
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) ref.current.close(); }}
    >
      {open ? children : null}
    </dialog>
  );
}
