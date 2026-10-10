// Kịch bản không cần chọn sẵn từ khóa: chạy được trên mọi bản deploy (kể cả production tắt REVIEW_MODE).
import fs from 'node:fs';
import { expect, reviewModeEnabled, test } from './fixtures';

/** Phiên bản trong package.json: phải khớp số hiện ở đầu hộp thoại Luật chơi (kể cả trên bản đã deploy). */
const appVersion = JSON.parse(fs.readFileSync('package.json', 'utf8')).version as string;

test('trang chủ có hai ô Chơi đơn và Đấu theo nhóm; Chơi đơn ở /solo và có nút về trang chủ', async ({ game, page }) => {
  await page.goto('/');
  const tiles = page.locator('.mode-tile');
  await expect(tiles).toHaveCount(2);
  await expect(tiles.nth(0)).toContainText('Chơi đơn');
  await expect(tiles.nth(1)).toContainText('Đấu theo nhóm');
  await expect(page.locator('#guess')).toHaveCount(0); // trang chủ không còn màn chơi

  await page.getByRole('link', { name: /Chơi đơn/ }).click();
  await expect(page).toHaveURL(/\/solo$/);
  await expect(game.meta).toContainText('Lượt 1/6');

  await page.getByRole('link', { name: 'Trang chủ' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(tiles).toHaveCount(2);
});

test.describe('lần đầu vào trang', () => {
  test.use({ seenHelp: false });

  test('hiện luật chơi; nút ✕ đóng và con trỏ về ô nhập; nút ? mở lại', async ({ game, page }) => {
    await game.open();
    const help = page.locator('dialog[open]', { has: page.locator('.legend') });
    await expect(help).toBeVisible();
    await expect(help.locator('.dlg-head h2')).toHaveText('Luật chơi');
    await expect(help.locator('.dlg-head .version')).toHaveText(`v${appVersion}`);
    await help.getByRole('button', { name: 'Đóng' }).click();
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await expect(game.input).toBeFocused();

    await page.getByRole('button', { name: 'Luật chơi' }).click();
    await expect(help).toBeVisible();
    await help.getByRole('button', { name: 'Đóng' }).click();
    await expect(page.locator('dialog[open]')).toHaveCount(0);

    // tải lại trang: không tự mở nữa
    await page.reload();
    await expect(game.meta).toBeVisible();
    await expect(page.locator('dialog[open]')).toHaveCount(0);
  });

  test('Esc cũng đóng luật chơi, rồi nút ? vẫn mở lại được', async ({ game, page }) => {
    await game.open();
    await expect(page.locator('dialog[open] .legend')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Luật chơi' }).click();
    await expect(page.locator('dialog[open] .legend')).toBeVisible();
  });
});

test('lượt không hợp lệ bị server từ chối và không mất lượt', async ({ game }) => {
  await game.open();
  const structure = await game.structure();
  await expect(game.meta).toContainText('Lượt 1/6');

  await game.guess('b');
  await expect(game.toast).toHaveText('Chưa đủ chữ cái');

  // thừa một chữ ở âm tiết đầu
  await game.type(structure.map((n, i) => 'b'.repeat(i === 0 ? n + 1 : n)).join(' '));
  await expect(game.hint).toHaveText('Nhiều chữ hơn ô chữ');
  await game.page.keyboard.press('Enter');
  await expect(game.toast).toHaveText('Số chữ cái không khớp ô chữ');

  await game.guess(structure.map((n) => 'w'.repeat(n)).join(' '));
  await expect(game.toast).toHaveText('Chỉ dùng chữ cái tiếng Việt');

  await expect(game.meta).toContainText('Lượt 1/6');
});

test('New game giữa ván: bỏ từ khóa hiện tại, bắt đầu ván mới và nhớ ván mới sau khi tải lại', async ({ game, page }) => {
  await game.open();
  const structure = await game.structure();
  await game.guessScored(structure.map((n) => 'b'.repeat(n)).join(' '), 0);
  await expect(game.meta).toContainText('Lượt 2/6');
  const oldGameId = (await page.context().cookies()).find((c) => c.name === 'dc_game')?.value;
  expect(oldGameId).toBeTruthy();

  await page.getByRole('button', { name: 'New game' }).click();
  await expect(game.meta).toContainText('Lượt 1/6');
  await expect(page.locator('.row .cell[data-status]')).toHaveCount(0);
  await expect(game.input).toBeFocused();
  await expect(game.input).toHaveValue('');
  await expect.poll(async () => (await page.context().cookies()).find((c) => c.name === 'dc_game')?.value).not.toBe(oldGameId);

  // ván mới đoán được bình thường, và tải lại trang thì chơi tiếp ván mới (không quay về ván cũ)
  const newStructure = await game.structure();
  await game.guessScored(newStructure.map((n) => 'b'.repeat(n)).join(' '), 0);
  await page.reload();
  await expect(game.meta).toContainText('Lượt 2/6');
  await expect(page.locator('.row .cell[data-status]')).toHaveCount(newStructure.reduce((a, b) => a + b, 0));
});

// Nút Hint đang tạm ẩn (.hint-feature trong globals.css): bỏ test.skip khi hiện lại.
test.skip('Hint: 3 lần mỗi ván, không mất lượt, giữ nguyên khi tải lại, New game được 3 lần mới', async ({ game, page }) => {
  await game.open();
  const structure = await game.structure();
  await expect(game.hintButton).toHaveText('Hint (3)');
  await expect(game.hintCells).toHaveCount(0);

  for (let i = 1; i <= 3; i++) {
    await game.hintButton.click();
    await expect(game.hintCells).toHaveCount(i);
    await expect(game.hintButton).toHaveText(`Hint (${3 - i})`);
  }
  await expect(game.hintButton).toBeDisabled();
  await expect(game.meta).toContainText('Lượt 1/6');
  await expect(game.hintCells.first()).toHaveAttribute('aria-label', /^gợi ý: \S+$/);

  // gõ chữ vào các ô thì chữ gợi ý nhường chỗ; xoá chữ thì chữ gợi ý hiện lại
  await game.type(structure.map((n) => 'b'.repeat(n)).join(' '));
  await expect(game.hintCells).toHaveCount(0);
  await game.type('');
  await expect(game.hintCells).toHaveCount(3);

  // tải lại trang vẫn là ván đó, còn nguyên 3 gợi ý và không được gợi ý thêm
  await page.reload();
  await expect(game.hintCells).toHaveCount(3);
  await expect(game.hintButton).toHaveText('Hint (0)');
  await expect(game.hintButton).toBeDisabled();

  // sang lượt sau, các chữ gợi ý vẫn hiện ở hàng đang gõ
  await game.guessScored(structure.map((n) => 'b'.repeat(n)).join(' '), 0);
  await expect(game.hintCells).toHaveCount(3);

  await page.getByRole('button', { name: 'New game' }).click();
  await expect(game.meta).toContainText('Lượt 1/6');
  await expect(game.hintButton).toHaveText('Hint (3)');
  await expect(game.hintCells).toHaveCount(0);
});

test('số thứ tự từ khóa (#N) ở góc trên bên trái; bấm vào để chọn số và chơi đúng từ khóa đó', async ({ game, page }) => {
  await game.open();
  const topbar = page.locator('.topbar');
  await expect(game.keywordButton).toHaveText(/^#\d+$/);
  const box = (await game.keywordButton.boundingBox())!;
  const brand = (await page.locator('.brand').boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.x).toBeLessThan(24); // sát mép trái
  expect(box.y + box.height).toBeLessThan((await topbar.boundingBox())!.height + 1); // trong thanh trên cùng
  expect(box.x + box.width).toBeLessThan(brand.x); // bên trái tên game
  expect(Math.abs(brand.x + brand.width / 2 - viewport.width / 2)).toBeLessThan(2); // tên game vẫn đúng giữa

  // mở hộp thoại: ô nhập có con trỏ, cho biết khoảng số được chọn
  await game.keywordButton.click();
  await expect(game.keywordDialog).toBeVisible();
  await expect(game.keywordDialog.locator('#keyword-no')).toBeFocused();
  const count = Number(/từ 1 đến (\d+)/.exec(await game.keywordDialog.innerText())![1]);
  expect(count).toBeGreaterThan(1);

  // số sai không gửi lên, hộp thoại giữ nguyên
  const dialogInput = game.keywordDialog.locator('#keyword-no');
  for (const bad of ['0', String(count + 1), 'abc', '']) {
    await dialogInput.fill(bad);
    await dialogInput.press('Enter');
    await expect(game.keywordDialog.getByRole('alert')).toHaveText(`Nhập số từ 1 đến ${count}`);
  }
  await expect(game.keywordDialog).toBeVisible();

  // chọn số 7: ván mới, từ khóa số 7
  await dialogInput.fill('7');
  await dialogInput.press('Enter');
  await expect(game.keywordDialog).toHaveCount(0);
  await expect(game.keywordButton).toHaveText('#7');
  await expect(game.meta).toContainText('Lượt 1/6');
  await expect(game.input).toBeFocused();
  const structure = await game.structure();

  // đoán một lượt rồi chọn lại đúng số 7: bắt đầu lại ván, vẫn cùng cấu trúc ô chữ
  await game.guessScored(structure.map((n) => 'b'.repeat(n)).join(' '), 0);
  await expect(game.meta).toContainText('Lượt 2/6');
  await game.keywordButton.click();
  await expect(game.keywordDialog).toContainText('Từ khóa đang chơi: #7');
  await game.keywordDialog.locator('#keyword-no').fill('7');
  await game.keywordDialog.getByRole('button', { name: 'Bắt đầu' }).click();
  await expect(game.meta).toContainText('Lượt 1/6');
  await expect(page.locator('.row .cell[data-status]')).toHaveCount(0);
  expect(await game.structure()).toEqual(structure);

  // số của ván nhớ qua tải lại trang; Esc đóng hộp thoại mà không đổi ván
  await page.reload();
  await expect(game.keywordButton).toHaveText('#7');
  await game.keywordButton.click();
  await expect(game.keywordDialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(game.keywordDialog).toHaveCount(0);
  await expect(game.keywordButton).toHaveText('#7');
  await expect(game.input).toBeFocused();
});

test('/solo?id=N bắt đầu ván mới với từ khóa số N, về "/solo" và nhớ ván ngay cả khi tải lại trước lượt đoán đầu', async ({ game, page }) => {
  await page.goto('/solo?id=7');
  await expect(game.meta).toBeVisible();
  expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe('/solo'); // đã về "/solo", không còn ?id=
  await expect(game.keywordButton).toHaveText('#7');
  await expect(game.meta).toContainText('Lượt 1/6');
  const structure = await game.structure();

  // tải lại NGAY (chưa đoán lượt nào): cookie đã được ghi lúc chuyển hướng nên vẫn là ván này, không thành ván ngẫu nhiên
  await page.reload();
  await expect(game.keywordButton).toHaveText('#7');

  // đoán một lượt rồi tải lại: tiến độ còn nguyên (không bị tạo lại ván mới vì URL không còn ?id=)
  await game.guessScored(structure.map((n) => 'b'.repeat(n)).join(' '), 0);
  await page.reload();
  await expect(game.keywordButton).toHaveText('#7');
  await expect(game.meta).toContainText('Lượt 2/6');
  await expect(page.locator('.row .cell[data-status]')).toHaveCount(structure.reduce((a, b) => a + b, 0));

  // mở link khác khi đang chơi dở: bỏ ván hiện tại, vào từ khóa số 8
  await page.goto('/solo?id=8');
  await expect(game.keywordButton).toHaveText('#8');
  await expect(game.meta).toContainText('Lượt 1/6');
  await expect(page.locator('.row .cell[data-status]')).toHaveCount(0);

  // cùng số thì cùng từ khóa (cùng cấu trúc ô chữ)
  await page.goto('/solo?id=7');
  await expect(game.keywordButton).toHaveText('#7');
  expect(await game.structure()).toEqual(structure);
});

test('/solo?id= không hợp lệ hoặc ngoài khoảng: bỏ qua, vào ván bình thường', async ({ game, page }) => {
  for (const id of ['abc', '0', '-3', '1.5', '99999999999', '2147483647']) {
    await page.goto(`/solo?id=${id}`);
    await expect(game.meta).toBeVisible();
    await expect(game.meta).toContainText('Lượt 1/6');
    await expect(game.keywordButton).toHaveText(/^#\d+$/); // một ván ngẫu nhiên bình thường
    await expect(page.locator('.panel[role=alert]')).toHaveCount(0);
  }
  // số hợp lệ nhưng không có từ khóa: tới "/" chứ không dừng ở một trang lỗi hay đường dẫn trung gian
  await page.goto('/solo?id=2147483647');
  await expect(game.meta).toBeVisible();
  expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe('/solo');
});

test('chọn số khi ván đã kết thúc; số ngoài khoảng bị server từ chối; cùng số luôn ra cùng từ khóa', async ({ game, page, request }) => {
  const created = await (await request.post('/api/games', { data: {} })).json();
  const { keywordCount: count } = created as { keywordCount: number };

  // số cuối cùng chọn được, số vượt khoảng bị từ chối
  const last = await request.post('/api/games', { data: { number: count } });
  expect(last.status()).toBe(201);
  expect((await last.json()).keywordNo).toBe(count);
  for (const number of [count + 1, 0, -3, 1.5, '7']) {
    const res = await request.post('/api/games', { data: { number } });
    expect([number, res.status()]).toEqual([number, 400]);
  }
  const outOfRange = await request.post('/api/games', { data: { number: count + 1 } });
  expect((await outOfRange.json()).message).toBe(`Không có từ khóa số ${count + 1}; chọn số từ 1 đến ${count}`);

  // chơi hết 6 lượt để lộ từ khóa; cùng số thì cùng từ khóa, số khác thì từ khóa khác
  async function answerOf(number: number) {
    const start = await (await request.post('/api/games', { data: { number } })).json();
    const nonsense = (start.structure as number[]).map((n) => 'b'.repeat(n)).join(' ');
    let state = start;
    for (let i = 0; i < start.maxTurns; i++) state = await (await request.post(`/api/games/${start.id}/guesses`, { data: { guess: nonsense } })).json();
    expect(state.over).toBe(true);
    return state.answer as string;
  }
  const a1 = await answerOf(7);
  expect(await answerOf(7)).toBe(a1);
  expect(await answerOf(8)).not.toBe(a1);

  // trên giao diện: ván đã kết thúc vẫn chọn được số mới từ nút #N
  await game.open();
  const structure = await game.structure();
  for (let i = 0; i < 6; i++) await game.guessScored(structure.map((n) => 'b'.repeat(n)).join(' '), i);
  await expect(game.endgame).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(game.endedBar).toBeVisible();
  await game.keywordButton.click();
  await game.keywordDialog.locator('#keyword-no').fill('3');
  await game.keywordDialog.getByRole('button', { name: 'Bắt đầu' }).click();
  await expect(game.keywordButton).toHaveText('#3');
  await expect(game.meta).toContainText('Lượt 1/6');
  await expect(game.endedBar).toHaveCount(0);
  await expect(game.input).toBeFocused();
});

test.describe('chia sẻ link từ khóa ở màn hình kết thúc', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  test('nút chia sẻ copy link /solo?id=N vào clipboard, mở link ra đúng từ khóa; không copy được thì hiện link để tự copy', async ({ game, page }) => {
    await page.goto('/solo?id=7');
    await expect(game.keywordButton).toHaveText('#7');
    const structure = await game.structure();
    for (let i = 0; i < 6; i++) await game.guessScored(structure.map((n) => 'b'.repeat(n)).join(' '), i);
    await expect(game.endgame).toBeVisible();

    const share = game.shareButton;
    await expect(share).toHaveText(/^Thách bạn bè đoán từ này/);
    const link = `${new URL(page.url()).origin}/solo?id=7`;

    // bấm: link có ?id= của từ khóa này nằm trong clipboard, nút báo đã copy rồi trở lại như cũ
    await share.click();
    await expect(share).toHaveText(/Đã copy link/);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
    await expect(share).toHaveText(/^Thách bạn bè đoán từ này/, { timeout: 8000 });

    // trình duyệt không cho copy: hiện link trong một ô (đã chọn sẵn) để người chơi tự copy
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) }, configurable: true });
      document.execCommand = () => false;
    });
    await share.click();
    await expect(game.endgame.getByRole('alert')).toContainText('Không copy tự động được');
    await expect(game.endgame.getByLabel('Link chia sẻ từ khóa')).toHaveValue(link);

    // link đã copy: mở ra bắt đầu ván mới với đúng từ khóa số 7
    await page.goto(link);
    await expect(game.keywordButton).toHaveText('#7');
    await expect(game.meta).toContainText('Lượt 1/6');
    expect(await game.structure()).toEqual(structure);
  });
});

test('chuỗi chữ bất kỳ vẫn được chấm; thua sau 6 lượt; tải lại trang; Chơi lại', async ({ game, page }) => {
  await game.open();
  const structure = await game.structure();
  const nonsense = structure.map((n) => 'b'.repeat(n)).join(' '); // không phải từ có nghĩa

  for (let i = 0; i < 6; i++) await game.guessScored(nonsense, i);

  await expect(game.endgame).toBeVisible();
  await expect(game.endgame.locator('.endgame-title')).toHaveText('Hết lượt đoán');
  await expect(game.endgame.locator('.answer-tiles')).toHaveAttribute('aria-label', /^Từ khóa: \S+( \S+)+$/);
  await expect(game.endgame.locator('.defs li').first()).toBeVisible();
  await expect(game.endgame.getByRole('button', { name: 'Chơi lại' })).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(game.endgame).toHaveCount(0);
  await expect(game.endedBar).toContainText('Ván đã kết thúc');

  await page.reload();
  await expect(game.meta).toContainText('Ván đã kết thúc');
  await expect(page.locator('.row .cell[data-status]')).toHaveCount(6 * structure.reduce((a, b) => a + b, 0));

  await game.endedBar.getByRole('button', { name: 'Xem kết quả' }).click();
  await expect(game.endgame).toBeVisible();
  await game.endgame.getByRole('button', { name: 'Chơi lại' }).click();
  await expect(game.meta).toContainText('Lượt 1/6');
  await expect(game.input).toBeFocused();
});

test.describe('khi server tắt REVIEW_MODE', () => {
  test.beforeAll(async ({}, testInfo) => {
    test.skip(await reviewModeEnabled(testInfo.project.use.baseURL), 'REVIEW_MODE đang bật');
  });

  test('không chọn sẵn được từ khóa: API từ chối, ?tu= bị bỏ qua', async ({ game, request }) => {
    const res = await request.post('/api/games', { data: { word: 'vũ trụ' } });
    expect(res.status()).toBe(403);
    await game.open('tổ chức');
    await expect(game.meta).toContainText('Lượt 1/6');
  });
});
