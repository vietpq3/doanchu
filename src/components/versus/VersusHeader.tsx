import Link from 'next/link';
import type { ReactNode } from 'react';
import ThemeSwitch from '../ThemeSwitch';

/**
 * Thanh trên của các trang đấu theo nhóm: nút quay lại bên trái (liên kết, hoặc nút nếu có `onBack`), tên trang ở giữa, bên phải là `right`
 * (nếu có) và nút chọn giao diện sáng/tối.
 */
export default function VersusHeader({ title, backHref, backLabel, right, onBack }: { title: string; backHref: string; backLabel: string; right?: ReactNode; onBack?: () => void }) {
  const arrow = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>;
  return (
    <header className="topbar">
      <div className="wrap">
        {onBack ? (
          // hành động (không chỉ chuyển trang): vd Rời phòng giữa ván phải có hiệu lực ngay
          <button className="icon-btn back-btn" type="button" aria-label={backLabel} title={backLabel} onClick={onBack}>{arrow}</button>
        ) : (
          <Link className="icon-btn back-btn" href={backHref} aria-label={backLabel} title={backLabel}>{arrow}</Link>
        )}
        <h1 className="brand">{title}</h1>
        <span className="topbar-right">
          {right}
          <ThemeSwitch />
        </span>
      </div>
    </header>
  );
}
