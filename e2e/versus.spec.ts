// Đấu theo nhóm (docs/versus-v2.md): nhiều "người chơi" = nhiều trình duyệt riêng, cùng vào một room.
// Mỗi test dùng một room riêng để không ảnh hưởng nhau. Cần server có Durable Object (npm run preview, hoặc bản đã deploy);
// `npm run dev` (Node) không chạy được tính năng này. Các test cần chọn sẵn từ khóa tự bỏ qua khi server tắt REVIEW_MODE.
import { devices, expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { VERSUS } from '../src/lib/versus/config';
import { reviewModeEnabled } from './fixtures';

const WORD = 'vũ trụ'; // cấu trúc [2, 3]
const WRONG = 'an tâm'; // từ thật (có trong từ điển), cùng cấu trúc [2, 3] nhưng không phải đáp án
const NONSENSE = 'aê yiư'; // cùng cấu trúc [2, 3] nhưng không hợp lệ (không có vần aê, yiư): bị từ chối khi VERSUS.validateGuessWords bật
const UNUSUAL = 'bơ tưi'; // cùng cấu trúc [2, 3], không có nghĩa nhưng mỗi âm tiết đúng cấu trúc tiếng Việt: luôn được chấm
const NAME_KEY = 'doanchu-player-name';

const uid = () => Math.random().toString(36).slice(2, 6);

/** Một người chơi: trình duyệt riêng (localStorage riêng => playerId riêng), cỡ màn hình điện thoại. */
class Player {
  readonly errors: string[] = [];
  constructor(readonly context: BrowserContext, readonly page: Page, readonly name: string) {
    page.on('pageerror', (err) => this.errors.push(err.message));
  }

  static async create(browser: Browser, baseURL: string, name: string): Promise<Player> {
    const context = await browser.newContext({ ...devices['Pixel 7'], baseURL, locale: 'vi-VN', permissions: ['clipboard-read', 'clipboard-write'] });
    await context.addInitScript(([key, value]) => {
      localStorage.setItem('doanchu-seen-help', '1');
      localStorage.setItem(key, value);
    }, [NAME_KEY, name]);
    return new Player(context, await context.newPage(), name);
  }

  /** Vào thẳng một room (path có thể kèm ?tu=...) và chờ vào được sảnh. */
  async enter(path: string) {
    await this.page.goto(path);
    await expect(this.page.getByRole('heading', { name: /Sảnh chờ/ })).toBeVisible();
  }

  get start() { return this.page.locator('.start-btn'); }
  get emptySeats() { return this.page.locator('.seat.empty'); }
  get takenSeats() { return this.page.locator('.seat.taken'); }
  get lobbyTags() { return this.page.locator('.name-tag'); }
  get opponents() { return this.page.locator('.opponents .opponent'); }
  get popup() { return this.page.locator('dialog[open]'); }
  /** thanh xem lại ô chữ sau khi đóng popup kết quả */
  get reviewBar() { return this.page.locator('.review-bar'); }
  sit(n: number) { return this.page.getByRole('button', { name: `Ngồi vào ô ${n}` }).click(); }
  stand() { return this.page.getByRole('button', { name: /bấm để đứng dậy/ }).click(); }

  /** Gõ rồi bấm Enter trong ô đoán của màn Versus (xóa chữ cũ trước: sau lượt bị từ chối chữ vẫn còn để người chơi sửa). */
  async guess(text: string) {
    await this.page.locator('#guess').fill('');
    await this.page.locator('#guess').focus();
    await this.page.keyboard.insertText(text);
    await this.page.keyboard.press('Enter');
  }

  async close() {
    expect(this.errors, `lỗi JavaScript của ${this.name}`).toEqual([]);
    await this.context.close();
  }
}

/** Hai người ngồi bàn (ô 1 và ô 2) trong cùng một room; `path` của người thứ nhất có thể kèm ?tu= để chọn sẵn từ khóa. */
async function twoAtTable(browser: Browser, baseURL: string, room: number, path1 = `/rooms/${room}`) {
  const a = await Player.create(browser, baseURL, `An-${uid()}`);
  const b = await Player.create(browser, baseURL, `Binh-${uid()}`);
  await a.enter(path1);
  await b.enter(`/rooms/${room}`);
  await a.sit(1);
  await b.sit(2);
  await expect(a.takenSeats).toHaveCount(2);
  await expect(b.takenSeats).toHaveCount(2);
  return { a, b };
}

const base = (testInfo: { project: { use: { baseURL?: string } } }) => testInfo.project.use.baseURL!;

/** Trình duyệt mới chưa có tên (localStorage trống), cỡ điện thoại; ghi lại lỗi JavaScript. */
async function freshPage(browser: Browser, baseURL: string) {
  const context = await browser.newContext({ ...devices['Pixel 7'], baseURL, locale: 'vi-VN' });
  await context.addInitScript(() => localStorage.setItem('doanchu-seen-help', '1'));
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return { context, page, errors };
}

/** Tên gợi ý ngẫu nhiên điền sẵn trong hộp thoại nhập tên, vd "Hổ Vàng 27". */
const SUGGESTED = /^\S.* \d{2}$/;

test('Trang chủ: Đấu theo nhóm hỏi tên (điền sẵn tên gợi ý), vào danh sách 5 room, lần sau vào thẳng, đổi tên; room không tồn tại thì 404', async ({ browser }, testInfo) => {
  const name = `Test-${uid()}`;
  const { context, page, errors } = await freshPage(browser, base(testInfo));
  const dialog = page.locator('dialog[open]');
  const input = dialog.locator('#versus-name');

  // chưa có tên mà vào thẳng /rooms: hỏi tên ngay tại chỗ; Hủy thì về trang chủ
  await page.goto('/rooms');
  await expect(dialog).toContainText('Tên của bạn');
  await dialog.getByRole('button', { name: 'Hủy' }).click();
  await expect(page).toHaveURL(/\/$/);

  // trang chủ, chưa có tên: bấm ô Đấu theo nhóm thì mở hộp thoại, điền sẵn tên gợi ý; nút 🎲 đổi gợi ý khác
  const tile = page.getByRole('button', { name: /Đấu theo nhóm/ });
  await tile.click();
  await expect(input).toHaveValue(SUGGESTED);
  await expect(input).toBeFocused();
  await dialog.getByRole('button', { name: 'Gợi ý tên khác' }).click();
  await expect(input).toHaveValue(SUGGESTED);

  // tên trống / toàn dấu cách: báo lỗi tại chỗ, không chuyển trang
  await input.fill('');
  await dialog.getByRole('button', { name: 'Vào' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Hãy nhập tên của bạn' })).toBeVisible();
  await input.fill('   ');
  await dialog.getByRole('button', { name: 'Vào' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Hãy nhập tên của bạn' })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);

  // tên hợp lệ (Enter cũng gửi): sang Room List với 5 room
  await input.fill(name);
  await input.press('Enter');
  await expect(page).toHaveURL(/\/rooms$/);
  const cards = page.locator('.room-card');
  await expect(cards).toHaveCount(5);
  for (let i = 1; i <= 5; i++) await expect(cards.nth(i - 1)).toContainText(`Room #${i}`);
  await expect(page.locator('.meta')).toContainText(name);

  // trang chủ nhớ tên: hiện tên, bấm Đấu theo nhóm vào thẳng Room List (không hỏi lại)
  await page.getByRole('link', { name: 'Về trang chủ' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('.home-name')).toContainText(name);
  await tile.click();
  await expect(page).toHaveURL(/\/rooms$/);
  await expect(dialog).toHaveCount(0);

  // đổi tên ngay ở Room List (điền sẵn tên hiện tại)
  const renamed = `Doi-${uid()}`;
  await page.getByRole('button', { name: 'Đổi tên' }).click();
  await expect(input).toHaveValue(name);
  await input.fill(renamed);
  await dialog.getByRole('button', { name: 'Lưu' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.meta')).toContainText(renamed);

  // click tên room: Inside Room với Sảnh chờ (có tên mới) và Bàn chơi 6 ô (đếm cả ô có người: bản deploy có thể đang có người chơi)
  await page.getByRole('link', { name: /Room #1/ }).click();
  await expect(page).toHaveURL(/\/rooms\/1$/);
  await expect(page.getByRole('heading', { name: /Sảnh chờ/ })).toBeVisible();
  await expect(page.locator('.name-tag', { hasText: renamed })).toBeVisible();
  await expect(page.locator('.seat')).toHaveCount(6);
  await expect(page.locator('.start-btn')).toBeDisabled(); // người ở sảnh không bấm được Start

  const missing = await page.goto('/rooms/9');
  expect(missing?.status()).toBe(404);

  expect(errors, 'lỗi JavaScript').toEqual([]);
  await context.close();
});

test('mở thẳng link phòng khi chưa có tên: hỏi tên tại chỗ, dùng tên gợi ý rồi vào sảnh của phòng đó', async ({ browser }, testInfo) => {
  const { context, page, errors } = await freshPage(browser, base(testInfo));
  const dialog = page.locator('dialog[open]');
  await page.goto('/rooms/3');
  await expect(page).toHaveURL(/\/rooms\/3$/); // không bị đưa về trang chủ
  const suggested = await dialog.locator('#versus-name').inputValue();
  expect(suggested).toMatch(SUGGESTED);
  await dialog.getByRole('button', { name: 'Vào' }).click();
  await expect(page.getByRole('heading', { name: /Sảnh chờ/ })).toBeVisible();
  await expect(page.locator('.name-tag.you')).toHaveText(suggested); // server nhận nguyên tên gợi ý
  await expect(page).toHaveURL(/\/rooms\/3$/);
  expect(errors, 'lỗi JavaScript').toEqual([]);
  await context.close();
});

test('Sảnh chờ tối đa 10 người: người thứ 11 thấy "Phòng đã đầy"; bàn không tính vào 10', async ({ browser }, testInfo) => {
  const url = new URL(base(testInfo));
  const wsBase = `${url.protocol === 'https:' ? 'wss:' : 'ws:'}//${url.host}`;
  const fakes: WebSocket[] = [];
  try {
    for (let i = 0; i < 10; i++) {
      const ws = new WebSocket(`${wsBase}/ws/rooms/5?pid=e2e-full-${uid()}-${i}-aaaa&name=${encodeURIComponent(`Kẻ ${i}-${uid()}`)}`);
      fakes.push(ws);
      await new Promise<void>((resolve, reject) => {
        ws.onopen = () => resolve();
        ws.onerror = () => reject(new Error('không kết nối được WebSocket'));
      });
    }
    const late = await Player.create(browser, base(testInfo), `Muon-${uid()}`);
    await late.page.goto('/rooms/5');
    await expect(late.page.locator('.notice[role=alert]')).toContainText('Phòng đã đầy'); // (Next cũng có một role=alert riêng để đọc tên trang)
    await expect(late.page.getByRole('main').getByRole('link', { name: 'Về danh sách room' })).toBeVisible();
    await late.close();
  } finally {
    fakes.forEach((ws) => ws.close());
  }
});

test('hủy đếm ngược khi có người đứng dậy; Rời phòng; người ở sảnh chỉ xem', async ({ browser }, testInfo) => {
  const { a, b } = await twoAtTable(browser, base(testInfo), 3);
  const c = await Player.create(browser, base(testInfo), `Chi-${uid()}`);
  await c.enter('/rooms/3');
  await expect(c.takenSeats).toHaveCount(2); // người ở sảnh thấy bàn
  await expect(c.start).toBeDisabled(); // nhưng không bấm Start được
  await expect(a.start).toBeEnabled();
  await expect(a.lobbyTags).toHaveCount(1); // hai người đã ngồi bàn nên không còn ở sảnh; ở sảnh chỉ có c
  await expect(a.lobbyTags.first()).toHaveText(c.name);
  await expect(c.lobbyTags).toHaveCount(1);

  // Start: nút đếm ngược "Start after Ns" ở mọi người
  await a.start.click();
  await expect(a.start).toHaveText(/^Start after [1-5]s$/);
  await expect(b.start).toHaveText(/^Start after [1-5]s$/);
  await expect(a.start).toBeDisabled(); // đang đếm thì không bấm lại được

  // một người đứng dậy trong lúc đếm: dừng ngay, nút về Start, và không có gì xảy ra nữa
  await b.stand();
  await expect(a.start).toHaveText('Start');
  await expect(a.start).toBeDisabled(); // còn 1 người ở bàn
  await expect(a.takenSeats).toHaveCount(1);
  await a.page.waitForTimeout(6500); // quá 5 giây
  await expect(a.page).toHaveURL(/\/rooms\/3$/);
  await expect(b.page).toHaveURL(/\/rooms\/3$/);
  await expect(a.page.locator('.start-btn')).toHaveText('Start');

  // người ở sảnh (c) ngồi vào bàn thì lại đủ 2 người
  await c.sit(2);
  await expect(a.start).toBeEnabled();

  // Rời phòng: về danh sách room, và những người còn lại không còn thấy mình
  const gone = a.name;
  await a.page.getByRole('button', { name: 'Rời phòng' }).click();
  await expect(a.page).toHaveURL(/\/rooms$/);
  await expect(b.page.locator('.name-tag, .seat.taken', { hasText: gone })).toHaveCount(0);

  for (const p of [a, b, c]) await p.close();
});

test('lượt không hợp lệ không mất lượt; hết 6 lượt cả hai thì không ai thắng và thấy từ khóa', async ({ browser }, testInfo) => {
  test.skip(!(await reviewModeEnabled(base(testInfo))), 'REVIEW_MODE đang tắt: không chọn sẵn được từ khóa');
  test.setTimeout(90_000);
  const { a, b } = await twoAtTable(browser, base(testInfo), 4, `/rooms/4?tu=${encodeURIComponent(WORD)}`);
  await a.start.click();
  await expect(a.page).toHaveURL(/\/rooms\/4\/versus$/, { timeout: 15_000 });
  await expect(b.page).toHaveURL(/\/rooms\/4\/versus$/);
  await expect(a.page.locator('.meta')).toContainText('2 âm tiết · 5 chữ cái');

  // lượt thiếu chữ: báo lỗi, không có hàng nào được chấm, không mất lượt
  await a.guess('ba');
  await expect(a.page.locator('.toast')).toHaveText('Chưa đủ chữ cái');
  await expect(a.page.locator('.row .cell[data-status]')).toHaveCount(0);
  await expect(a.page.locator('.meta')).toContainText('Lượt 1/6');

  // chuỗi không hợp lệ (đúng cấu trúc ô chữ, chỉ để loại trừ chữ cái)
  const validate = VERSUS.validateGuessWords;
  await a.guess(NONSENSE);
  if (validate) {
    // kiểm tra từ đoán đang bật: bị từ chối, thông báo chung chung, không mất lượt
    await expect(a.page.locator('.toast')).toHaveText('Từ này không hợp lệ');
    await expect(a.page.locator('.row .cell[data-status]')).toHaveCount(0);
    await expect(a.page.locator('.meta')).toContainText('Lượt 1/6');
    await expect(b.opponents.filter({ hasText: a.name })).toContainText('lượt 0/6'); // đối thủ cũng không thấy lượt nào
  } else {
    // đang tắt: chuỗi này vẫn được chấm và tính một lượt
    await expect(a.page.locator('.row .cell[data-status]')).toHaveCount(5);
    await expect(a.page.locator('.meta')).toContainText('Lượt 2/6');
  }
  let spent = validate ? 0 : 1; // số lượt đã dùng

  // từ không có nghĩa nhưng đúng cấu trúc tiếng Việt vẫn hợp lệ: được chấm và tính một lượt
  await a.guess(UNUSUAL);
  spent++;
  await expect(a.page.locator('.row .cell[data-status]')).toHaveCount(spent * 5);
  await expect(a.page.locator('.meta')).toContainText(`Lượt ${spent + 1}/6`);
  await expect(b.opponents.filter({ hasText: a.name })).toContainText(`lượt ${spent}/6`);

  for (let i = spent; i < 6; i++) {
    await a.guess(WRONG);
    await expect(a.page.locator('.row .cell[data-status]')).toHaveCount((i + 1) * 5);
  }
  await expect(a.page.getByText('Bạn đã hết lượt đoán')).toBeVisible();
  await expect(a.popup).toHaveCount(0); // b còn lượt nên ván chưa kết thúc
  await expect(b.opponents.filter({ hasText: a.name })).toContainText('lượt 6/6');

  for (let i = 0; i < 6; i++) {
    await b.guess(WRONG);
    await expect(b.page.locator('.row .cell[data-status]')).toHaveCount((i + 1) * 5);
  }
  for (const p of [a, b]) {
    await expect(p.popup).toContainText('Không ai tìm ra từ khóa. Từ khóa là vũ trụ');
    await expect(p.popup.getByRole('button', { name: /^OK \(\d+s\)$/ })).toBeVisible();
    // giải nghĩa từ khóa ngay trong popup (như Chơi đơn), kèm ghi nguồn
    await expect(p.popup.getByText('Giải nghĩa', { exact: true })).toBeVisible();
    await expect(p.popup.locator('.defs li').first()).toBeVisible();
    await expect(p.popup.locator('.source-note')).toContainText('CC BY-SA 4.0');
  }
  // b đóng popup bằng Esc: ở lại xem ô chữ của mình (6 hàng đã chấm), nút đếm ngược nằm dưới ô chữ
  await b.page.keyboard.press('Escape');
  await expect(b.popup).toHaveCount(0);
  await expect(b.reviewBar).toContainText('Không ai tìm ra từ khóa');
  await expect(b.reviewBar.getByRole('button', { name: /^Về phòng \(\d+s\)$/ })).toBeVisible();
  await expect(b.page.locator('.row .cell[data-status]')).toHaveCount(30);
  await expect(b.page).toHaveURL(/\/rooms\/4\/versus$/);

  await a.popup.getByRole('button', { name: /^OK/ }).click();
  await expect(a.page).toHaveURL(/\/rooms\/4$/);
  await expect(a.page.locator('.last-result')).toContainText('Không ai tìm ra từ khóa');
  await expect(a.page.locator('.last-result')).toContainText(WORD);
  await expect(a.page.locator('.last-result .defs li').first()).toBeVisible(); // lượt trước cũng có giải nghĩa
  await expect(a.page.locator('.toast')).toBeHidden(); // thông báo lỗi của màn Versus ("Từ này không hợp lệ") không hiện lại ở đây
  // hết đếm ngược thì b (đang xem lại ô chữ) tự về Inside Room
  await expect(b.page).toHaveURL(/\/rooms\/4$/, { timeout: 15_000 });

  for (const p of [a, b]) await p.close();
});

test('ván đấu: đếm ngược 5s, cùng từ khóa, thấy số lượt của đối thủ, người đoán đúng thắng, popup rồi về Inside Room', async ({ browser }, testInfo) => {
  test.skip(!(await reviewModeEnabled(base(testInfo))), 'REVIEW_MODE đang tắt: không chọn sẵn được từ khóa');
  test.setTimeout(90_000);
  const { a, b } = await twoAtTable(browser, base(testInfo), 2, `/rooms/2?tu=${encodeURIComponent(WORD)}`);
  const c = await Player.create(browser, base(testInfo), `Chi-${uid()}`);
  await c.enter('/rooms/2');
  await expect(c.start).toBeDisabled();

  const t0 = Date.now();
  await a.start.click();
  await expect(b.start).toHaveText(/^Start after [1-5]s$/);
  await expect(a.page).toHaveURL(/\/rooms\/2\/versus$/, { timeout: 15_000 });
  await expect(b.page).toHaveURL(/\/rooms\/2\/versus$/);
  expect(Date.now() - t0).toBeGreaterThan(4000); // đã đếm đủ ~5 giây
  await expect(c.page).toHaveURL(/\/rooms\/2$/); // người ở sảnh không bị kéo vào ván
  await expect(c.page.locator('.start-btn')).toHaveText(/Đang đấu|Đang bắt đầu/);
  await expect(c.page.getByText('đã khóa')).toBeVisible(); // bàn bị khóa
  await expect(c.emptySeats).toHaveCount(4);

  // cùng một từ khóa: 2 âm tiết · 5 chữ cái; mỗi người thấy tên + số lượt của nhau
  for (const p of [a, b]) await expect(p.page.locator('.meta')).toContainText('2 âm tiết · 5 chữ cái');
  // thời gian còn lại của ván (tối đa 10 phút), chạy lùi
  const clock = a.page.locator('.time-left');
  await expect(clock).toHaveText(/^còn (10:00|9:[0-5]\d)$/);
  const first = await clock.textContent();
  await expect(clock).not.toHaveText(first!, { timeout: 3000 });
  await expect(a.opponents).toHaveCount(2);
  await expect(b.opponents.filter({ hasText: a.name })).toContainText('lượt 0/6');

  // b đoán sai một lượt: a thấy số lượt của b nhưng không thấy chữ của b
  await b.guess(WRONG);
  await expect(a.opponents.filter({ hasText: b.name })).toContainText('lượt 1/6');
  await expect(a.page.locator('.row .cell[data-status]')).toHaveCount(0);
  await expect(b.page.locator('.row .cell[data-status]')).toHaveCount(5);

  // a đoán đúng: a thắng, b thua, cùng thấy từ khóa
  await a.guess(WORD);
  await expect(a.popup).toContainText('Bạn đã thắng! Từ khóa là vũ trụ');
  await expect(b.popup).toContainText(`Bạn đã thua! Từ khóa là vũ trụ. Người chiến thắng là: ${a.name}`);
  await expect(b.popup.getByRole('button', { name: /^OK \(\d+s\)$/ })).toBeVisible();
  for (const p of [a, b]) await expect(p.popup.locator('.defs li').first()).toBeVisible(); // popup có giải nghĩa từ khóa
  await expect(c.page.locator('.last-result')).toContainText(a.name); // người ở sảnh cũng thấy kết quả
  await expect(c.page.locator('.last-result .defs li').first()).toBeVisible(); // và cả giải nghĩa

  await expect(a.page.locator('.time-left')).toHaveCount(0); // ván xong: không còn đồng hồ

  // b đóng popup (✕): xem lại ô chữ của mình, chụp ảnh ô chữ vào clipboard, rồi bấm nút đếm ngược để về phòng
  await b.popup.getByRole('button', { name: 'Đóng để xem lại ô chữ' }).click();
  await expect(b.popup).toHaveCount(0);
  await expect(b.reviewBar).toContainText(`Bạn đã thua. Người thắng: ${a.name}`);
  await expect(b.page.locator('.row .cell[data-status]')).toHaveCount(5);
  await b.page.bringToFront();
  await b.reviewBar.getByRole('button', { name: /Chụp ảnh màn hình/ }).click();
  await expect(b.reviewBar.getByRole('button', { name: /Đã copy ảnh/ })).toBeVisible();
  const image = await b.page.evaluate(async () => {
    const [item] = await navigator.clipboard.read();
    const bitmap = await createImageBitmap(await item!.getType('image/png'));
    return { types: item!.types, width: bitmap.width, height: bitmap.height };
  });
  expect(image.types).toContain('image/png');
  expect(image.width).toBe(1120); // 560px x2
  expect(image.height).toBeGreaterThan(600);

  // Về phòng (hoặc hết 10s): về Inside Room, mọi người về Sảnh chờ, Bàn chơi trống, kết quả lượt trước ở cạnh bàn
  await b.reviewBar.getByRole('button', { name: /^Về phòng \(\d+s\)$/ }).click();
  await expect(b.page).toHaveURL(/\/rooms\/2$/);
  await expect(b.page.locator('.seat.empty')).toHaveCount(6);
  await expect(b.page.locator('.last-result')).toContainText(WORD);
  await expect(b.page.locator('.last-result')).toContainText(a.name);
  await expect(b.page.locator('.last-result .defs li').first()).toBeVisible();
  await expect(b.lobbyTags).toHaveCount(3);
  // "Lượt trước" nằm DƯỚI nút Start (Start không bị đẩy xuống dưới giải nghĩa) và Start vẫn thấy được mà không phải cuộn
  const startBox = (await b.start.boundingBox())!;
  const lastBox = (await b.page.locator('.last-result').boundingBox())!;
  expect(lastBox.y).toBeGreaterThan(startBox.y + startBox.height - 1);
  await expect(b.start).toBeInViewport();
  // a để popup tự hết giờ (10s) rồi tự về Inside Room
  await expect(a.page).toHaveURL(/\/rooms\/2$/, { timeout: 15_000 });
  await expect(a.page.locator('.seat.empty')).toHaveCount(6);

  // phòng mở lại sau khi khóa: lại ngồi bàn được
  await expect(a.page.getByText('đã khóa')).toHaveCount(0, { timeout: 15_000 });
  await a.sit(1);
  await expect(a.takenSeats).toHaveCount(1);

  for (const p of [a, b, c]) await p.close();
});

test('tải lại trang giữa ván vẫn còn ván của mình', async ({ browser }, testInfo) => {
  test.skip(!(await reviewModeEnabled(base(testInfo))), 'REVIEW_MODE đang tắt: không chọn sẵn được từ khóa');
  test.setTimeout(60_000);
  const { a, b } = await twoAtTable(browser, base(testInfo), 1, `/rooms/1?tu=${encodeURIComponent(WORD)}`);
  await a.start.click();
  await expect(a.page).toHaveURL(/\/rooms\/1\/versus$/, { timeout: 15_000 });
  await a.guess(WRONG);
  await expect(a.page.locator('.row .cell[data-status]')).toHaveCount(5);

  await a.page.reload(); // mất kết nối rồi nối lại trong 30 giây
  await expect(a.page.locator('.row .cell[data-status]')).toHaveCount(5);
  await expect(a.page.locator('.meta')).toContainText('Lượt 2/6');
  await expect(a.page).toHaveURL(/\/rooms\/1\/versus$/);

  // vào thẳng /versus khi không có ván của mình thì về Inside Room
  const c = await Player.create(browser, base(testInfo), `Chi-${uid()}`);
  await c.page.goto('/rooms/1/versus');
  await expect(c.page).toHaveURL(/\/rooms\/1$/);

  // người rời giữa ván: ván tiếp tục với người còn lại, người rời được đánh dấu "đã rời"
  await b.page.getByRole('button', { name: 'Rời phòng' }).click();
  await expect(a.opponents.filter({ hasText: b.name })).toContainText('đã rời');
  await expect(a.page.locator('#guess')).toBeVisible();

  for (const p of [a, b, c]) await p.close();
});
