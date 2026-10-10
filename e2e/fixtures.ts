import { test as base, expect, request, type Locator, type Page } from '@playwright/test';

/** Thao tác trên màn chơi. Gõ chữ bằng insertText — giống bộ gõ của máy đưa chữ đã có dấu vào ô nhập. */
export class GamePage {
  readonly input: Locator;
  readonly meta: Locator;
  readonly toast: Locator;
  readonly hint: Locator;
  readonly endgame: Locator;
  readonly endedBar: Locator;
  /** số thứ tự từ khóa (#N) ở góc trên bên trái; bấm để chọn số */
  readonly keywordButton: Locator;
  /** hộp thoại chọn từ khóa theo số */
  readonly keywordDialog: Locator;
  /** nút chia sẻ link từ khóa trong màn hình kết thúc (chữ trên nút đổi sau khi copy, nên tìm theo class) */
  readonly shareButton: Locator;
  /** nút Hint */
  readonly hintButton: Locator;
  /** các ô gợi ý đang hiện mờ ở hàng đang gõ */
  readonly hintCells: Locator;

  constructor(readonly page: Page) {
    this.input = page.locator('#guess');
    this.meta = page.locator('.meta');
    this.toast = page.locator('.toast');
    this.hint = page.locator('.input-hint');
    this.endgame = page.locator('dialog.endgame-dlg[open]');
    this.endedBar = page.locator('.ended-bar');
    this.hintButton = page.getByRole('button', { name: /^Hint/ });
    this.shareButton = this.endgame.locator('.share-btn');
    this.keywordButton = page.locator('.keyword-no');
    this.keywordDialog = page.locator('dialog[open]', { has: page.locator('#keyword-no') });
    this.hintCells = page.locator('.row.current .cell[data-hint="1"]');
  }

  /** Mở trang Chơi đơn (/solo); có `word` thì chọn sẵn từ khóa bằng ?tu= (cần REVIEW_MODE=1). */
  async open(word?: string) {
    await this.page.goto(word ? `/solo?tu=${encodeURIComponent(word)}` : '/solo');
    await expect(this.meta).toBeVisible();
  }

  /** Số chữ cái của từng âm tiết, đọc từ ô chữ. */
  structure(): Promise<number[]> {
    return this.page.locator('.row').first().locator('.syl').evaluateAll((syls) => syls.map((s) => s.querySelectorAll('.cell').length));
  }

  /** Gõ chữ vào ô nhập (xoá chữ cũ trước). */
  async type(text: string) {
    await this.input.fill('');
    await this.input.focus();
    await this.page.keyboard.insertText(text);
  }

  async guess(text: string) {
    await this.type(text);
    await this.page.keyboard.press('Enter');
  }

  /** "b:absent ỏ:absent c:correct ..." — chữ và màu của từng ô trong hàng thứ i (tính từ 0). */
  row(i: number): Promise<string> {
    return this.page.locator('.row').nth(i).locator('.cell')
      .evaluateAll((cells) => cells.map((c) => `${c.textContent}:${(c as HTMLElement).dataset.status ?? '-'}`).join(' '));
  }

  /** Đoán rồi chờ server chấm xong hàng thứ i. */
  async guessScored(text: string, i: number) {
    await this.guess(text);
    await expect.poll(() => this.row(i)).not.toContain(':-');
  }

  letterStatus(ch: string): Promise<string> {
    return this.page.locator('.letter', { hasText: new RegExp(`^${ch}$`) }).evaluate((el) => (el as HTMLElement).dataset.status ?? '-');
  }
}

/** Server có cho chọn sẵn từ khóa không (REVIEW_MODE=1)? Hỏi thẳng API tạo ván. */
export async function reviewModeEnabled(baseURL: string | undefined) {
  const ctx = await request.newContext({ baseURL });
  const res = await ctx.post('/api/games', { data: { word: 'vũ trụ' } });
  await ctx.dispose();
  return res.status() === 201;
}

/**
 * Fixture `game`: mỗi test một trình duyệt sạch. `seenHelp` (mặc định true) đánh dấu đã xem luật chơi
 * để hộp thoại không che ô chữ. Cuối test kiểm tra không có lỗi JavaScript trên trang.
 */
export const test = base.extend<{ game: GamePage; seenHelp: boolean }>({
  seenHelp: [true, { option: true }],
  game: async ({ page, seenHelp }, provide) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    if (seenHelp) await page.addInitScript(() => localStorage.setItem('doanchu-seen-help', '1'));
    await provide(new GamePage(page));
    expect(errors, 'lỗi JavaScript trên trang').toEqual([]);
  },
});

export { expect };
