'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { saveName, useSavedName } from '@/lib/client/player';
import SettingsMenu from './SettingsMenu';
import NameDialog from './versus/NameDialog';

/**
 * Trang chủ (/): hai ô vuông `Chơi đơn` (/solo) và `Đấu theo nhóm` (/rooms).
 * Đấu theo nhóm: đã có tên thì vào thẳng /rooms; chưa có thì hỏi tên trong hộp thoại (điền sẵn tên gợi ý) rồi mới vào.
 */
export default function HomeScreen() {
  const router = useRouter();
  const name = useSavedName(); // null khi chưa đọc được (đang hydrate)
  const [dialog, setDialog] = useState<'enter' | 'rename' | null>(null);

  function enterVersus() {
    if (name) router.push('/rooms');
    else setDialog('enter');
  }

  function submitName(newName: string) {
    saveName(newName);
    const enter = dialog === 'enter';
    setDialog(null);
    if (enter) router.push('/rooms');
  }

  return (
    <>
      <header className="topbar">
        <div className="wrap">
          <span className="spacer" />
          <h1 className="brand">Đoán <span>Chữ</span></h1>
          <span className="topbar-right"><SettingsMenu note="Áp dụng cho ván mới. Mỗi độ khó có các từ khóa số 1 đến một số nhất định (chọn ở nút #N)." /></span>
        </div>
      </header>

      <main className="home wrap">
        <p className="home-intro">Đoán từ ghép tiếng Việt trong 6 lượt, đúng đến từng dấu thanh.</p>

        <nav className="mode-grid" aria-label="Chế độ chơi">
          <Link className="mode-tile" href="/solo">
            <span className="mode-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </span>
            <span className="mode-name">Chơi đơn</span>
            <span className="mode-desc">Một mình đoán từ khóa</span>
          </Link>
          <button className="mode-tile" type="button" onClick={enterVersus}>
            <span className="mode-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </span>
            <span className="mode-name">Đấu theo nhóm</span>
            <span className="mode-desc">Thi đoán cùng bạn bè</span>
          </button>
        </nav>

        {name && (
          <p className="home-name">
            Đấu theo nhóm với tên <b>{name}</b> ·{' '}
            <button className="link-btn" type="button" onClick={() => setDialog('rename')}>Đổi tên</button>
          </p>
        )}
      </main>

      <NameDialog
        open={dialog !== null}
        title={dialog === 'rename' ? 'Đổi tên' : 'Tên của bạn'}
        initialName={dialog === 'rename' ? (name ?? '') : ''}
        submitLabel={dialog === 'rename' ? 'Lưu' : 'Vào'}
        onSubmit={submitName}
        onClose={() => setDialog(null)}
      />
    </>
  );
}
