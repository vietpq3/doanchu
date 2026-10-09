// Kịch bản cần chọn sẵn từ khóa bằng ?tu= — chỉ chạy khi server bật REVIEW_MODE=1.
import { expect, reviewModeEnabled, test } from './fixtures';

test.beforeAll(async ({}, testInfo) => {
  test.skip(!(await reviewModeEnabled(testInfo.project.use.baseURL)), 'REVIEW_MODE đang tắt: không chọn sẵn được từ khóa');
});

test('luật màu theo ví dụ trong requirement, rồi thắng', async ({ game }) => {
  await game.open('tổ chức');
  await expect(game.meta).toContainText('2 âm tiết · 6 chữ cái');

  // Từ khóa có ổ ở ô 2; đoán ộ ở ô 5 -> xanh dương. ỏ ở ô 2 là chữ o (khác ô) -> xám.
  await game.guessScored('bỏ cuộc', 0);
  expect(await game.row(0)).toBe('b:absent ỏ:absent c:correct u:absent ộ:tone c:correct');

  // Không kiểm tra từ điển: "tố chúc" không có nghĩa vẫn được chấm.
  await game.guessScored('tố chúc', 1);
  expect(await game.row(1)).toBe('t:correct ố:tone c:correct h:correct ú:absent c:correct');
  expect(await game.letterStatus('ô')).toBe('tone');
  expect(await game.letterStatus('u')).toBe('absent');
  expect(await game.letterStatus('c')).toBe('correct');

  await game.guessScored('tổ chức', 2);
  await expect(game.endgame).toBeVisible();
  await expect(game.endgame.locator('.endgame-title')).toHaveText('Chính xác!');
  await expect(game.endgame.locator('.endgame-sub')).toHaveText('Bạn đoán đúng ở lượt 3/6.');
  await expect(game.endgame.locator('.answer-tiles')).toHaveAttribute('aria-label', 'Từ khóa: tổ chức');
  await expect(game.endgame.locator('.defs li').first()).toBeVisible();
  await expect(game.endgame.getByRole('button', { name: 'Chơi lại' })).toBeFocused();
});

test('chữ lặp lại: mỗi chữ của từ khóa chỉ được tính một lần', async ({ game }) => {
  await game.open('hòa bình');
  await expect(game.meta).toContainText('2 âm tiết · 7 chữ cái');
  await game.guessScored('anh hùng', 0);
  // n thứ hai xám (từ khóa chỉ có một n), hai chữ h vàng, a vàng (kiểu dấu cũ: dấu nằm trên o)
  expect(await game.row(0)).toBe('a:present n:absent h:present h:present ù:absent n:correct g:absent');
});

test('kiểu dấu: gõ "hoà" (kiểu mới) vẫn được tính là "hòa"', async ({ game }) => {
  await game.open('hoà bình');
  await expect(game.meta).toContainText('2 âm tiết · 7 chữ cái');
  await game.type('hoà bình');
  expect(await game.row(0)).toBe('h:- ò:- a:- b:- ì:- n:- h:-');
  await game.page.keyboard.press('Enter');
  await expect(game.endgame.locator('.endgame-title')).toHaveText('Chính xác!');
  await expect(game.endgame.locator('.answer-tiles')).toHaveAttribute('aria-label', 'Từ khóa: hòa bình');
});

test('từ trên ?tu= không có trong từ điển thì bị bỏ qua', async ({ game, page }) => {
  await game.open('xyz abc');
  await expect(game.meta).toContainText('Lượt 1/6');
  await expect(page.locator('.panel[role=alert]')).toHaveCount(0);
});

// Nút Hint đang tạm ẩn (.hint-feature trong globals.css): bỏ test.skip khi hiện lại.
test.skip('Hint không gợi ý ô đã xanh lá', async ({ game, page }) => {
  await game.open('vũ trụ');
  await game.guessScored('vũ trừ', 0);
  expect(await game.row(0)).toBe('v:correct ũ:correct t:correct r:correct ừ:absent');

  // chỉ còn ô cuối (ụ) chưa xanh lá, nên gợi ý chắc chắn là ô đó
  await game.hintButton.click();
  await expect(game.toast).toHaveText('Gợi ý: âm tiết 2, chữ thứ 3 là “ụ”');
  await expect(game.hintCells).toHaveCount(1);
  await expect(page.locator('.row.current .cell').nth(4)).toHaveAttribute('data-hint', '1');
  await expect(page.locator('.row.current .cell').nth(4)).toHaveText('ụ');

  // ô gợi ý không có màu của luật chấm; đoán đúng thì vẫn thắng bình thường
  await game.guessScored('vũ trụ', 1);
  await expect(game.endgame.locator('.endgame-title')).toHaveText('Chính xác!');
});
