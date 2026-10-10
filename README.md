# Đoán Chữ

Game đoán từ ghép tiếng Việt: máy chọn ngẫu nhiên một từ ghép (2 âm tiết trở lên), người chơi có 6 lượt để đoán đúng 100%, kể cả dấu thanh. Sau mỗi lượt, từng ô chữ được tô màu; hết ván thì công bố từ khóa, giải nghĩa và nút Chơi lại.

Website SSR viết bằng **Next.js 16 (App Router) + React 19 + TypeScript**, dữ liệu trên **Supabase** (Postgres), deploy lên **Cloudflare Workers** bằng adapter OpenNext. Mọi kiểm tra lượt đoán và việc chấm màu đều làm ở server; trình duyệt không biết từ khóa cho tới khi ván kết thúc.

## Yêu cầu

- Node.js 22 trở lên, npm
- Một project Supabase (gói free đủ dùng: dữ liệu khoảng 11 MB)
- Chỉ khi nạp lại dữ liệu: file từ điển nguồn `minhqnd_dictionary.db` (xem [Dữ liệu](#dữ-liệu))

## Cài đặt lần đầu

```bash
npm install
cp .dev.vars.example .dev.vars  # điền SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_DB_URL
npm run db:migrate              # tạo bảng words, games (hoặc dán supabase/migrations/*.sql vào SQL Editor)
npm run db:seed                 # trích xuất từ điển nguồn, nạp 47.914 từ + giải nghĩa vào bảng words, rồi đánh số từ khóa (36.362 từ)
```

> **Secret chỉ để trong `.dev.vars`, không dùng `.env` / `.env.local`.** Khi build cho Cloudflare, OpenNext gói mọi file `.env*` của Next.js vào code của Worker, nên secret để ở đó sẽ bị tải lên cùng code. `.dev.vars` chỉ wrangler, `npm run dev` và các script đọc; file này không commit.

## Chạy

```bash
npm run dev            # http://localhost:3000 (Node), sửa code là thấy ngay
npm run preview        # build và chạy trong runtime Cloudflare Workers ở local: http://localhost:8787
npm run deploy         # build và deploy lên Cloudflare (cần đăng nhập: npx wrangler login)
```

> **Đấu theo nhóm cần Durable Object**, chỉ chạy được trong runtime Workers: dùng `npm run preview` (build lại mỗi lần chạy). `npm run dev` (Node) vẫn chơi đơn bình thường nhưng không vào được phòng. Chi tiết ở mục [Đấu theo nhóm](#đấu-theo-nhóm).

Biến môi trường ở local nằm trong `.dev.vars` (xem `.dev.vars.example`); trên Cloudflare là `vars` trong `wrangler.jsonc` và secret.

| Biến | Dùng ở | Ý nghĩa |
|---|---|---|
| `SUPABASE_URL` (hoặc `NEXT_PUBLIC_SUPABASE_URL`) | app, script | URL project Supabase |
| `SUPABASE_SECRET_KEY` | app (server), `db:seed` | Secret key (`sb_secret_…` hoặc `service_role`). Chỉ dùng ở server, không bao giờ gửi xuống trình duyệt. |
| `SUPABASE_DB_URL` | `db:migrate` | Connection string Postgres (Dashboard → Connect → Session pooler) |
| `DICTIONARY_DB_PATH` | `db:seed`, `keywords` | Từ điển SQLite nguồn, mặc định `../../database/minhqnd_dictionary.db` |
| `REVIEW_MODE` | app | `1` = cho phép chọn sẵn từ khóa bằng `/solo?tu=vũ trụ` (Chơi đơn) hoặc `/rooms/1?tu=vũ trụ` + Start (đấu theo nhóm) để kiểm thử. Local bật trong `.dev.vars`; production để `0` trong `wrangler.jsonc`. |
| `NEXTJS_ENV` | `preview` | `development` khi chạy Worker ở local |

App không dùng `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: mọi truy vấn chạy ở server bằng secret key, còn hai bảng bật RLS và không có policy nào, nên publishable key không đọc được dữ liệu (nhất là đáp án trong bảng `games`).

## Deploy lên Cloudflare

Bản đang chạy: https://doanchu.pqv.workers.dev

```bash
npx wrangler login                              # một lần
npm version patch --no-git-tag-version          # mỗi lần deploy: tăng patch trước (xem "Phiên bản mỗi lần deploy" bên dưới)
npm run deploy                                  # build + deploy
npx wrangler secret put SUPABASE_SECRET_KEY     # lần đầu: dán secret key khi được hỏi (secret giữ nguyên qua các lần deploy)
npm run test:e2e:prod                           # test lại bản vừa deploy (https://doanchu.pqv.workers.dev)
```

**Phiên bản mỗi lần deploy.** Số phiên bản có định dạng `major.minor.patch` (vd: `1.1.0`) và hiện ở đầu hộp thoại Luật chơi. **Mỗi lần deploy đều tăng số phiên bản; mặc định tăng `patch`** (`1.1.0` → `1.1.1`), trừ khi người phát hành yêu cầu khác (`minor` cho tính năng mới, `major` cho thay đổi lớn, hoặc chỉ định thẳng một số). Tăng **trước** `npm run deploy` vì số được nhúng vào code lúc build; sau khi deploy, `npm run test:e2e:prod` kiểm tra số hiện trong Luật chơi khớp `package.json`. Chi tiết và lịch sử phiên bản ở mục [Phiên bản](#phiên-bản).

Biến không bí mật (`NEXT_PUBLIC_SUPABASE_URL`, `REVIEW_MODE=0`) nằm trong `wrangler.jsonc`. Worker sau khi build khoảng 5,4 MB (nén gzip 1,1 MB). Muốn chạy đủ bộ test E2E trên bản deploy thì tạm đặt `REVIEW_MODE` thành `"1"`, deploy, test, rồi trả lại `"0"` và deploy lại.

Lưu ý gói Workers Free: mỗi request chỉ được 10 ms CPU. Lúc deploy lần đầu (10/2026), `wrangler tail` đo được 40–285 ms CPU mỗi request; Cloudflare chưa chặn request nào, nhưng có thể trả lỗi 1102 khi siết giới hạn. Nếu gặp lỗi đó thì cần gói Workers Paid.

## Dữ liệu

Bảng `words` (khóa `word`): mọi từ ghép tiếng Việt trong từ điển, chuẩn hoá theo kiểu dấu cũ. Mỗi từ có:
- `definitions`: giải nghĩa tiếng Việt, ưu tiên nguồn TVTD, tối đa 8 nghĩa.
- `is_keyword`: đánh dấu 36.362 từ khóa có thể được chọn làm đáp án (xem [Bộ từ khóa](#bộ-từ-khóa)).
- `keyword_no`: số thứ tự của từ khóa (#1..#36362), null với từ không phải từ khóa.
- `excluded_reason`: với từ đủ điều kiện nhưng bị danh sách loại trừ loại: `auxiliary` (từ phụ trợ), `proper_noun` (danh từ riêng) hoặc `manual`; chỉ để xem/lọc trên Supabase.

Bảng `games` lưu từng ván: từ khóa (và số thứ tự `keyword_no` của nó), các lượt đoán, các ô đã gợi ý (`hints`), trạng thái.

`npm run db:seed` đọc từ điển nguồn, ghi bản trích xuất ra `var/words.jsonl`, rồi upsert lên Supabase. Chạy lại an toàn. Thêm `-- --dry-run` để chỉ trích xuất. Nếu chưa có file từ điển nguồn:

```bash
mkdir -p ../../database
curl -L -o ../../database/minhqnd_dictionary.db \
  https://github.com/minhqnd/dictionary/releases/download/v2.0.0/dictionary.db
shasum -a 256 ../../database/minhqnd_dictionary.db
# 9259403f0675b2991a1bd0ef6d0dbc5933afdb135632af095a60662f09bbf1d3
```

### Bộ từ khóa

`data/keywords.json` có **36.362 từ** (`words`), sinh bằng `npm run keywords` (`scripts/export-keywords.ts`). Một mục từ của từ điển là từ khóa khi:
- là từ ghép (2 âm tiết trở lên) chỉ gồm chữ cái tiếng Việt viết thường (`keywordInfo()` trong `src/lib/game/keywords.ts`);
- có **4–12 chữ cái** (`KEYWORD_LETTERS`): ô chữ chia đều theo chiều ngang nên từ dài hơn sẽ ra ô quá nhỏ trên điện thoại (12 chữ cái ở màn hình 360px còn ô cỡ 20px);
- có giải nghĩa tiếng Việt để hiện ở màn hình kết thúc;
- **không bị danh sách loại trừ loại** (xem bên dưới).

Trong 47.914 từ ghép của từ điển, 7.205 từ không đạt ba điều kiện đầu (4.944 chưa có giải nghĩa, 2.112 dài hơn 12 chữ cái, 149 ngắn hơn 4); 40.709 từ còn lại bị danh sách loại trừ loại 4.347 từ, còn 36.362 từ khóa: 32.974 từ 2 âm tiết, 2.609 từ 3 âm tiết và 779 từ 4–5 âm tiết (phần lớn là thành ngữ, tục ngữ). Chọn ngẫu nhiên, không ưu tiên từ thông dụng, nên có cả từ cổ, từ chuyên ngành và từ mượn.

> Từ điển nguồn lưu **mọi** mục từ bằng chữ thường (không có mục từ nào viết hoa, kể cả "hà nội", "việt nam"), nên bộ lọc "chữ thường" của `keywordInfo()` không loại được tên riêng. Tên riêng được loại bằng danh sách loại trừ.

#### Danh sách loại trừ

Cấu hình ở `data/keyword-exclusions.json` (kiểm tra chặt: tuỳ chọn lạ, thiếu hay sai kiểu đều báo lỗi); logic ở `scripts/keyword-exclusions.ts`. Từ bị loại được ghi vào mục `excluded` của `keywords.json` kèm lý do (và cột `words.excluded_reason`):

| Lý do | Cách nhận diện | Số từ |
|---|---|---|
| `auxiliary` (từ phụ trợ) | Nghĩa hiển thị mang mã từ loại `X` do nguồn trong `auxiliary.sources` gắn (mặc định TVTD, tudientv.com). **X của Wiktionary không tính**: đó chỉ là "chưa phân loại" (97% từ có cả X của Wiktionary lẫn nghĩa TVTD thì TVTD gắn là tính/danh/động từ, vd "nhẵn bóng", "hữu danh"). `match`: `any` (một nghĩa là đủ) hoặc `all`. | 418 |
| `proper_noun` (danh từ riêng) | Chỉ xét từ có nghĩa danh từ (`nounsOnly`). Ba tín hiệu: (1) nhãn `Np` của TVTD; (2) nghĩa đầu là mẫu câu địa danh/dân tộc ("Một xã thuộc huyện X, tỉnh Y", "Sông ở…") **và** nhắc một tên viết hoa; (3) quét toàn bộ giải nghĩa + ví dụ của từ điển (~700 nghìn đoạn, ~4 giây): từ xuất hiện dạng "Hà Nội" nhiều hơn "hà nội" (`capitalized`). | 3.929 |
| `manual` | Nằm trong danh sách `exclude`. | 0 |

`keep` (danh sách từ luôn giữ) thắng mọi luật; thứ tự ưu tiên: `keep` > `exclude` > từ phụ trợ > danh từ riêng. Ngưỡng quét chữ hoa hiện là "rộng" (`minCount: 1, minRatioOverLower: 1`: viết hoa ít nhất một lần và nhiều hơn chữ thường); muốn chặt hơn đặt `2` và `3`. Mức rộng nhầm một số từ thường trùng tên người/địa danh hoặc là mảnh của tên dài ("tháng chín", "đông nam", "bồ đào" trong "Bồ Đào Nha"), nên `keep` đã điền sẵn 67 từ thường đã duyệt tay; danh sách này chưa chắc đầy đủ, thấy từ thường bị loại nhầm thì thêm vào `keep`.

Quy trình đổi danh sách loại trừ:
1. Sửa `data/keyword-exclusions.json` (không sửa tay `keywords.json`: lần sinh lại sau sẽ mất).
2. `npm run keywords` → in số từ bị loại theo lý do; mở `var/keyword-exclusions-report.json` (không commit) xem từng từ bị loại kèm bằng chứng để duyệt.
3. `npm run db:migrate` (lần đầu, thêm cột `excluded_reason`) rồi `npm run db:seed`.

**`data/keyword-auxiliary-candidates.txt`** (sinh cùng lúc, mỗi dòng một từ): 2.985 từ khóa còn lại có nghĩa `X` từ nguồn chưa nằm trong `auxiliary.sources`, tức X của Wiktionary. Chưa loại; để xem và cân nhắc loại sau. Muốn loại cả nhóm: thêm `"Wiktionary"` vào `auxiliary.sources`; muốn loại từng từ: chép vào `exclude`.

Đổi danh sách loại trừ làm số `#N` của các từ phía sau dịch (xem bên dưới).

**Số thứ tự (`keyword_no`).** Từ khóa được đánh số 1..N theo vị trí trong các dòng `is_keyword` của bảng `words` khi xếp theo cột `word` (đúng thứ tự bảng hiện trên Supabase: lọc `is_keyword = true` thì dòng thứ 300 là `#300`). Số do hàm SQL `renumber_keywords()` điền, `npm run db:seed` tự gọi sau khi nạp từ; nên số ổn định khi nạp lại cùng bộ từ khóa, còn thêm/bớt từ khóa thì số của các từ phía sau dịch theo. Muốn xem trên Supabase: bảng `words`, lọc `keyword_no` không rỗng, sắp theo `keyword_no`.

Khi tạo ván, app gọi hàm SQL `pick_keyword(n)` (migration `20261009130000_keyword_no.sql`) để lấy từ khóa số `n`, hoặc một từ ngẫu nhiên khi bỏ trống `n`, ngay trong CSDL, không tải cả danh sách về: với hàng chục nghìn từ thì tải về sẽ cần ~40 request mỗi lần, vượt giới hạn của Cloudflare Workers. Vì vậy phải chạy `npm run db:migrate` **trước** khi chạy app/deploy bản này, rồi `npm run db:seed` để đánh số. (Hàm `random_keyword()` của migration `20261009120000` là bản cũ, bản này không còn dùng; có thể xoá sau khi mọi bản deploy đã chuyển sang `pick_keyword`.)

## Kiểm thử

```bash
npm test               # Vitest: lõi game, máy trạng thái phòng đấu (đồng hồ giả), gọi thẳng Route Handler (dữ liệu giả trong bộ nhớ, không cần Supabase)
npm run test:e2e       # Playwright trên Chrome: chơi thật với server + Supabase (tự chạy npm run preview nếu cổng 3000 trống)
npm run lint
npm run typecheck      # cả app (Next) lẫn worker Cloudflare (tự sinh worker/worker-types.d.ts bằng `wrangler types`, không commit)
```

Test E2E (thư mục `e2e/`) dùng Google Chrome cài sẵn trên máy (đổi bằng `E2E_BROWSER_CHANNEL`), chạy giả lập màn hình điện thoại.
- `basic.spec.ts`: chạy trên mọi bản (trang chủ, luật chơi, lượt bị từ chối, New game, Hint, thua sau 6 lượt, tải lại trang, Chơi lại).
- `review.spec.ts`: cần chọn sẵn từ khóa bằng `?tu=` (luật màu theo ví dụ requirement, thắng, chữ lặp, kiểu dấu). Tự bỏ qua khi server tắt `REVIEW_MODE`.
- `versus.spec.ts`: đấu theo nhóm, mỗi "người chơi" là một trình duyệt riêng cùng vào một room (mỗi test một room). Cần Durable Object (`npm run preview` hoặc bản đã deploy). Test cần từ khóa cố định (`/rooms/1?tu=vũ trụ` + Start) tự bỏ qua khi server tắt `REVIEW_MODE`. Khi tự chạy server local, `playwright.config.ts` xoá và dùng thư mục trạng thái riêng (`--persist-to .wrangler/e2e-state`) để các room bắt đầu trống, không dính dữ liệu lần chạy trước.

Mỗi lần chạy test E2E tạo vài ván thật trong bảng `games`; ván cũ được tự xoá.

## Luật chơi đã chốt

- **Trang chủ (`/`):** chỉ có hai ô vuông **Chơi đơn** (→ `/solo`) và **Đấu theo nhóm** (→ `/rooms`, xem [Đấu theo nhóm](#đấu-theo-nhóm)). Màn Chơi đơn có nút **Trang chủ** cạnh nút `?` ở góc trên bên phải. Các luật bên dưới là của Chơi đơn.
- **Giao diện sáng/tối:** nút ☀/☾ (hai radio button trông như một công tắc) ở thanh trên cùng của mọi trang.
  - Chưa chọn thì theo cài đặt của máy; chọn thì nhớ cho lần sau (`localStorage` key `doanchu-theme`).
  - Một đoạn script nhỏ trong `<head>` (`src/lib/themeScript.ts`) đặt màu trước khi trang hiện ra, nên tải lại trang không bị nháy màu.
  - Trên điện thoại (dưới 480px), hai bên thanh trên chỉ rộng vừa các nút và tên trang nằm giữa phần còn lại (từ 480px trở lên vẫn đúng giữa), để đủ chỗ cho nút này mà tên trang không bị cắt (kể cả màn hình 320px).
- **Màu:**
  - xanh lá: đúng chữ, đúng dấu, đúng vị trí
  - vàng: đúng chữ, đúng dấu, sai vị trí
  - xanh dương: đúng nguyên âm nhưng sai dấu thanh (bất kể vị trí)
  - xám: không có trong từ khóa

  "Sai dấu" chỉ tính dấu thanh: o/ô/ơ, a/ă/â, e/ê, u/ư, d/đ là các chữ khác nhau.
- **Chữ lặp:** chấm lần lượt xanh lá → vàng → xanh dương, mỗi chữ của từ khóa chỉ được tính một lần.
- **Lượt đoán:**
  - Mỗi ô là một chữ cái kèm dấu; ch, ng, nh, th, tr, gi, qu… tách thành nhiều ô.
  - Người chơi thấy số âm tiết và số chữ mỗi âm tiết; lượt đoán phải đủ chữ và đúng cấu trúc đó.
  - **Không kiểm tra từ có trong từ điển**: chuỗi chữ bất kỳ cũng được chấm.
  - Lượt bị từ chối (thiếu chữ, sai cấu trúc, ký tự lạ) không mất lượt.
- **Kiểu dấu cũ** (hòa, khỏe, thúy) cho từ khóa, chữ người chơi gõ và phần giải nghĩa; gõ kiểu mới vẫn được tính đúng.
  - Đổi kiểu dấu: sửa `DEFAULT_STYLE` trong `src/lib/game/vietnamese.ts`, rồi chạy lại `npm run db:seed`.
- **Cách gõ:** gõ vào ô nhập bằng bộ gõ tiếng Việt của máy (Unikey/EVKey, Telex/VNI của macOS, bàn phím iOS/Android). Game không tự xử lý Telex. Bên dưới ô nhập là bảng chữ cái tô màu theo kết quả.
- **Số thứ tự từ khóa:** số `#N` hiện ở góc trên bên trái, là số của từ khóa đang chơi (xem [Bộ từ khóa](#bộ-từ-khóa)). Bấm vào đó mở hộp thoại chọn số (từ 1 đến tổng số từ khóa): nhập số rồi bấm **Bắt đầu** thì bỏ ván hiện tại và bắt đầu ván mới với đúng từ khóa đó; cùng số thì luôn ra cùng từ khóa. Dùng được cả khi ván đã kết thúc. Server từ chối số ngoài khoảng (`keyword_not_found`) hoặc không phải số nguyên (`bad_request`). Từ khóa không lộ ra trước khi ván kết thúc dù biết số.
  - **Link `/solo?id=300`**: mở đường dẫn này để bắt đầu ván mới với từ khóa số 300 (gửi cho người khác được). Trang chuyển hướng sang `GET /api/games/start?id=300` (tạo ván và ghi cookie) rồi về `/solo`, nên URL cuối không còn `?id=` và tải lại trang vẫn chơi tiếp đúng ván đó, kể cả khi chưa đoán lượt nào. Mỗi lần mở link là một ván mới (bỏ ván đang chơi). `id` không phải số nguyên dương hoặc không có từ khóa số đó thì bị bỏ qua: không tạo ván, vào `/solo` như bình thường. `?tu=` (REVIEW_MODE) được ưu tiên hơn `?id=`. Từ v1.3.0 link cũ dạng `/?id=N` không còn tác dụng (chỉ mở trang chủ).
- **New game:** nút dưới bảng chữ cái, chỉ hiện khi đang chơi. Bỏ từ khóa hiện tại (không tính thắng/thua) và bắt đầu ngay ván mới với từ khóa mới; ván bỏ dở được dọn tự động như ván cũ. Không hỏi xác nhận.
- **Hint:** nút cạnh New game, hiện số lần còn lại (`Hint (3)`). Mỗi ván được gợi ý tối đa **3 lần**, không mất lượt đoán. Server chọn ngẫu nhiên một ô chưa từng được tô xanh lá ở lượt nào và chưa được gợi ý; chữ đúng của ô đó hiện mờ (viền đứt) ở hàng đang gõ, trong ô người chơi chưa gõ chữ, và vẫn hiện ở các lượt sau. Gợi ý lưu ở server nên tải lại trang vẫn giữ; ván mới (New game / Chơi lại) có lại 3 lần. Đổi số lần ở `maxHints` trong `src/lib/server/config.ts`. **Hiện đang tạm ẩn** nút và dòng giải thích trong luật chơi bằng CSS (`.hint-feature` trong `globals.css`; xoá rule đó và bỏ `test.skip` ở hai test Hint trong `e2e/` để hiện lại); API `POST /api/games/:id/hints` vẫn hoạt động.
- **Kết thúc ván:** màn hình kết thúc hiện 0,7 giây sau lượt cuối, gồm từ khóa, giải nghĩa, nút **"Thách bạn bè đoán từ này 🔗"**, nút Chơi lại và nút đóng để xem lại ô chữ. Nút share copy link `<origin>/solo?id=N` (N là số thứ tự của từ khóa) vào clipboard và đổi chữ thành "✓ Đã copy link! Gửi bạn bè nhé" trong 3 giây; người nhận mở link sẽ vào thẳng từ khóa đó (xem *Link `/solo?id=300`* ở trên). Nếu trình duyệt không cho copy (trang http, trình duyệt nhúng...) thì hiện link trong một ô đã chọn sẵn để tự copy. Ván không có số thứ tự (ván cũ trước v1.1.0, hoặc từ không phải từ khóa chọn bằng `?tu=`) thì không có nút này.

## Đấu theo nhóm

Chế độ đấu nhiều người (mô tả đầy đủ, các quyết định và giả định: `docs/versus-v2.md`, nằm ngoài repo). Ô **Đấu theo nhóm** ở trang chủ (`/`) → `/rooms` (5 room) → `/rooms/[id]` (Sảnh chờ + Bàn chơi, nút Start) → `/rooms/[id]/versus` (cùng một từ khóa, ai đoán đúng trước thắng) → popup `OK (10s)` → về lại Inside Room.

**Quy tắc** (hằng số ở `src/lib/versus/config.ts`):
- **Sức chứa:** Sảnh chờ nhận tối đa 10 người khi *vào* room; Bàn chơi có 6 ô và người ngồi bàn không tính vào 10 (người từ bàn quay về sảnh luôn được nhận). Bấm ô trống để ngồi, bấm tên mình để đứng dậy.
- **Start:** bật khi có từ 2 người ở bàn, ai ở bàn cũng bấm được. Đếm ngược 5 giây ngay trên nút (`Start after 5s`…); **mọi thay đổi số người ở bàn** (ngồi, đứng, rời, mất kết nối) huỷ ngay, phải bấm lại. Hết 5 giây thì khoá bàn, chọn từ khóa ngẫu nhiên và đưa những người ở bàn sang màn Versus.
- **Trong ván:** mỗi người đoán riêng (luật như Chơi đơn, không Hint/New game/`#N`); đối thủ chỉ thấy tên + số lượt (`lượt 3/6`), không thấy chữ/màu. Có đồng hồ **thời gian còn lại** của ván (`Lượt 2/6 · còn 9:41`, đổi màu ở phút cuối).
- **Từ đoán phải hợp lệ (không đòi có nghĩa):** chỉ ở đấu theo nhóm. Mọi âm tiết của từ đoán phải đúng cấu trúc tiếng Việt (phụ âm đầu + vần + thanh, bắt buộc đúng chính tả `c/k`, `g/gh`, `ng/ngh`) hoặc có trong từ điển; nếu không báo "Từ này không hợp lệ" (chung chung, không nêu âm tiết sai) và không mất lượt. Để không ai nhập chuỗi như `aê yiư`, `chiơ` chỉ nhằm loại trừ chữ cái; `tượi` (không có trong từ điển) vẫn hợp lệ. Từ khóa luôn được chấp nhận. Hạn chế: âm tiết đúng cấu trúc ghép vô nghĩa (vd `ba bư`) vẫn qua. Tắt khẩn cấp: `VERSUS.validateGuessWords = false` ở `src/lib/versus/config.ts`.
- **Kết thúc ván** khi có người đoán đúng, hoặc không còn ai đang đoán (mọi người hết 6 lượt hoặc đã rời), hoặc quá 10 phút. Người rời giữa ván bị loại (nút Rời phòng: ngay; mất kết nối: chờ 30 giây nối lại, tải lại trang không mất ván); người còn lại đoán tiếp, kể cả chỉ còn một người.
- **Giải nghĩa:** popup kết quả hiện giải nghĩa từ khóa (tối đa 4 nghĩa, như Chơi đơn). Giải nghĩa được lấy lúc bắt đầu ván và chỉ gửi xuống khi ván kết thúc.
- **Popup kết quả:** `OK (10s)` đếm ngược tới lúc phòng mở lại; bấm `OK` hoặc hết giờ thì về Inside Room. Nút ✕ (hoặc Esc, bấm ra ngoài) **đóng popup để xem lại ô chữ của mình**: dưới ô chữ hiện kết quả, nút `Về phòng (Ns)` (vẫn đếm ngược, hết giờ tự về) và nút chụp ảnh. **`Chụp ảnh màn hình`** (ở popup và màn xem lại) vẽ ô chữ của mình kèm kết quả và từ khóa thành ảnh PNG rồi copy vào clipboard để dán chia sẻ; trình duyệt không cho copy ảnh thì tải ảnh về máy. Thời gian xem lại bằng thời gian khóa phòng (10 giây).
- **Sau ván:** mọi người về Sảnh chờ, Bàn chơi trống, phòng khoá 10 giây; khối **Lượt trước** (từ khóa + giải nghĩa + người thắng/"Không ai tìm ra") nằm **dưới nút Start** để Start không bị đẩy xuống.
- **Nhập tên:** bấm ô Đấu theo nhóm khi **đã có tên** thì vào thẳng `/rooms` (trang chủ hiện "Đấu theo nhóm với tên X · Đổi tên"); **chưa có tên** thì mở hộp thoại nhập tên, điền sẵn một **tên gợi ý ngẫu nhiên** (vd `Hổ Vàng 27`, nút 🎲 đổi gợi ý khác, `src/lib/versus/names.ts`): bấm `Vào` (hoặc Enter) là vào luôn, hoặc gõ tên riêng; tên trống báo "Hãy nhập tên của bạn". Đổi tên được ở trang chủ và ở `/rooms` (`Đổi tên`). Mở thẳng `/rooms` hoặc `/rooms/[id]` khi chưa có tên thì hộp thoại hiện ngay tại chỗ (`NameGate`), nhập xong vào tiếp; `Hủy` thì về trang chủ.
- **Chat của phòng:** ở Inside Room và màn Versus, một kênh chung cho mọi người trong phòng (sảnh, bàn, đang đấu). **Laptop** (rộng từ 960px): khung chat là sidebar ở cột bên phải; nút `»` cạnh chữ `Chat` thu gọn nó (trượt mượt sang phải, còn dải hẹp có nút `«` mở lại, chấm đỏ khi có tin mới), trạng thái thu gọn được nhớ cho lần sau. **Điện thoại**: bubble ở góc dưới, bấm để mở/đóng khung chat, chạm ra ngoài khung chat cũng đóng (lần chạm đó không bấm xuống nút bên dưới); có tin mới của người khác khi khung đang đóng thì bubble có **chấm đỏ**. Tin một dòng ≤ 200 ký tự, tối đa 5 tin/5 giây mỗi người; người vào phòng thấy 50 tin gần nhất, phòng trống thì xóa lịch sử. Khung chat của bubble tự đóng khi chuyển giữa sảnh và màn đấu (không che ô chữ); chữ đang gõ được giữ. Không lọc nội dung.
- **Emoji voz trong chat:** bộ emoji "popopo" của voz.vn (54 ảnh PNG 48px kèm bản 96px cho màn hình nét cao, trong `public/emoji/voz/`). Trước đây dùng bộ "Off" (GIF) của vozforums.com nhưng bị viền răng cưa trên điện thoại: GIF chỉ có trong suốt bật/tắt và chỉ có cỡ 40px.
  - **Bảng chọn:** nút mặt cười cạnh ô nhập mở bảng emoji ("Dùng gần đây" + toàn bộ). Bấm một emoji thì chèn mã vào chỗ con trỏ, bảng vẫn mở để chọn tiếp.
  - **Gõ `:x`:** gõ `:` + chữ thì hiện tối đa 3 emoji gần khớp nhất. Chạm/Tab để chèn, ↑↓ để đổi, Esc để bỏ qua. Enter chèn khi đã gõ từ 2 chữ; mới 1 chữ (`:v`, `:p`) thì Enter vẫn gửi tin. So khớp bỏ dấu tiếng Việt, nên gõ Telex (`:sẽy`, `:bó`) vẫn ra emoji.
  - **Hiển thị:** tin vẫn là chữ; mã `:beauty:` (và các mã cũ của voz như `:sogood:`, hay `:)`, `:D`, `:((` khi đứng riêng) hiện thành ảnh. Tin chỉ có emoji thì không có nền.
- **Danh tính:** không có tài khoản; `playerId` (UUID) và tên lưu ở `localStorage`. Tên 1–20 ký tự, trùng trong phòng thì thêm ` (2)`. Một `playerId` chỉ một kết nối (mở tab mới thì tab cũ bị thay).

**Kiến trúc** (mỗi room là một Durable Object):
- `worker/index.ts` là `main` của Worker (`wrangler.jsonc`): chuyển WebSocket `GET /ws/rooms/:id` vào Durable Object của room (chỉ nhận `Origin` cùng host), trả `GET /api/rooms` (danh sách room, nhớ 2 giây), mọi request khác giao cho OpenNext như trước.
- `worker/room-do.ts` (`RoomDO`, nền SQLite, WebSocket hibernation) là vỏ mỏng: chuyển tin nhắn thành lời gọi `RoomMachine`, lưu trạng thái, đặt alarm cho các mốc thời gian (đếm ngược, khoá phòng, hết giờ, hết hạn nối lại), gửi cho **mỗi người đúng phần họ được thấy**, giới hạn tần suất tin nhắn. Mọi sự kiện đi qua một DO nên được xử lý tuần tự (không có tranh chấp "ai đoán đúng trước").
- `src/lib/versus/room.ts` (`RoomMachine`) là toàn bộ luật của phòng, hàm thuần nhận `now` từ ngoài nên test bằng đồng hồ giả (`tests/versus-room.test.ts`). `protocol.ts`: tin nhắn client↔server và `RoomView`, **không bao giờ chứa đáp án hay chữ của lượt đoán người khác** trước khi ván kết thúc (có test kiểm tra). `config.ts`: hằng số.
- Chọn từ khóa và lấy giải nghĩa: `worker/keyword.ts` gọi hàm SQL `pick_keyword()` và đọc bảng `words` qua REST bằng `SUPABASE_SECRET_KEY` (secret của Worker). Chấm lượt đoán dùng chung `src/lib/game/guess.ts` với Chơi đơn.
- Kiểm tra từ đoán: `src/lib/versus/syllable.ts` (danh sách vần, phụ âm đầu, quy tắc chính tả/thanh điệu) cộng `data/syllables.txt` (~250 âm tiết ngoại lệ của từ điển như `gen`, `ku`, sinh bằng `npm run syllables`). Cả hai được đóng gói vào Worker, nên mỗi lượt đoán không gọi Supabase. Chạy lại `npm run syllables` khi từ điển nguồn, kiểu dấu hoặc quy tắc đổi.
- Trình duyệt: `src/components/versus/RoomProvider.tsx` (đặt ở `app/rooms/[id]/layout.tsx`) giữ **một** WebSocket cho cả `/rooms/[id]` và `/rooms/[id]/versus` nên chuyển trang không đứt kết nối; tự nối lại khi mất mạng. Rời khỏi trang phòng = đóng kết nối = rời phòng.
- Chat: lịch sử nằm trong trạng thái phòng của Durable Object (`RoomMachine.chat()`), gửi bằng tin riêng (`chat`, và `chat_history` lúc vào phòng) chứ không gửi lại cả trạng thái phòng. Người nhận biết tin của mình qua cờ `mine` do server tính; `playerId` không bao giờ được gửi xuống client. Khung chat (`RoomChat.tsx`) nằm trong `RoomShell.tsx` ở layout của phòng nên không bị dựng lại khi chuyển trang.
- Emoji: bảng emoji ở `src/lib/versus/emoji-data.ts`, logic thuần (tách tin thành chữ/emoji, gợi ý theo `:x`, chèn mã) ở `src/lib/versus/emoji.ts` (`tests/versus-emoji.test.ts`). Ô nhập, bảng chọn và gợi ý ở `ChatComposer.tsx`. Server không biết gì về emoji: chỉ chuyển chữ.
- `?tu=` kiểu kiểm thử: `/rooms/1?tu=vũ trụ` rồi bấm Start sẽ chọn sẵn từ khóa, chỉ khi server bật `REVIEW_MODE=1` (production bỏ qua).

**Vận hành:**
- Lần deploy đầu thêm migration Durable Object (`new_sqlite_classes` trong `wrangler.jsonc`) và Worker tùy biến: khó hoàn tác trên Cloudflare, nên cần xác nhận trước khi deploy. Không có migration Supabase (trạng thái phòng nằm trong Durable Object, không trong DB).
- Gói Workers Free có hạn mức request/CPU, và Durable Objects có hạn mức riêng (tin nhắn WebSocket cũng được tính): có thể không đủ khi có nhiều người dùng thật; hibernation giúp không tốn thời gian chờ. Đối chiếu trang giá Cloudflare trước khi mở rộng.
- Sau khi Durable Object khởi động lại (deploy, bị đuổi khỏi bộ nhớ) mọi WebSocket đứt; trình duyệt tự nối lại. Người ở sảnh/bàn mà không nối lại thì bị loại, người trong ván được chờ 30 giây.

## Kiến trúc

```
src/
  app/
    page.tsx                         Trang chủ: hai ô Chơi đơn / Đấu theo nhóm (HomeScreen)
    solo/page.tsx                    Trang Chơi đơn (Server Component): tiếp tục ván trong cookie hoặc tạo ván mới; ?id=N bắt đầu từ khóa số N
    layout.tsx, globals.css, error.tsx, icon.svg
    api/games/route.ts               POST: tạo ván mới (nút Chơi lại, New game; body { number } để chọn từ khóa theo số)
    api/games/start/route.ts         GET ?id=N: tạo ván với từ khóa số N, ghi cookie, chuyển về /solo (đích của link /solo?id=N)
    api/games/[id]/guesses/route.ts  POST: gửi lượt đoán — server kiểm tra, chấm màu, lưu
    api/games/[id]/hints/route.ts    POST: nút Hint — server chọn ngẫu nhiên một ô chưa xanh lá, lưu
    rooms/                           Đấu theo nhóm: page.tsx (Room List), [id]/layout.tsx (hỏi tên nếu chưa có, giữ WebSocket), [id]/page.tsx (Inside Room), [id]/versus/page.tsx
  components/                        Giao diện (GameScreen là Client Component duy nhất có state; KeywordDialog: chọn từ khóa theo số; ThemeSwitch: nút giao diện sáng/tối)
  lib/
    game/                            Lõi game thuần TypeScript, dùng chung server và client
      vietnamese.ts                  Chữ cái, dấu thanh, chuẩn hoá, đặt dấu
      scoring.ts                     Luật màu, màu bảng chữ cái
      hints.ts                       Ô nào được phép gợi ý (nút Hint)
      input.ts                       Vẽ ô từ chữ trong ô nhập
      guess.ts                       Kiểm tra + chấm một lượt đoán (dùng chung Chơi đơn và đấu theo nhóm)
      types.ts                       Kiểu dữ liệu trao đổi với API
    server/                          Chỉ chạy ở server (import 'server-only')
      config.ts                      Biến môi trường
      repository.ts                  Giao diện truy cập dữ liệu
      supabase-repository.ts         Bản dùng Supabase (secret key)
      games.ts                       Tạo ván, kiểm tra và chấm lượt đoán
      http.ts                        Cookie, JSON, lỗi
  lib/client/                        api.ts: gọi API; player.ts: playerId + tên trong localStorage (useSavedName tự cập nhật khi đổi tên); clipboard.ts (chữ, ảnh); boardImage.ts (vẽ ảnh ô chữ); recentEmoji.ts (emoji dùng gần đây); theme.ts (giao diện sáng/tối; lib/themeScript.ts: script đặt màu trong <head>)
  lib/versus/                        Đấu theo nhóm: room.ts (máy trạng thái), protocol.ts, config.ts, syllable.ts (kiểm tra từ đoán), names.ts (tên gợi ý), summary.ts (câu kết quả, đồng hồ), emoji.ts + emoji-data.ts (emoji voz trong chat) — dùng chung worker và giao diện
  components/HomeScreen.tsx          Trang chủ: hai ô vuông, hỏi tên trước khi vào đấu theo nhóm
  components/versus/                 RoomProvider, RoomListScreen, InsideRoomScreen, VersusScreen, ResultDialog, NameDialog (nhập tên, tên gợi ý), NameGate (hỏi tên tại chỗ), ScreenshotButton (chụp ảnh ô chữ), RoomShell + RoomChat + ChatComposer + EmojiImage (chat của phòng, emoji voz)
  components/DefinitionList.tsx      Danh sách giải nghĩa (dùng chung màn hình kết thúc của Chơi đơn và đấu theo nhóm)
public/emoji/voz/                    Emoji voz (bộ "popopo" của voz.vn) cho chat của phòng: 54 PNG 48px + bản 96px (*_x2.png)
worker/                              Worker Cloudflare tùy biến: index.ts (định tuyến), room-do.ts (Durable Object), keyword.ts
supabase/migrations/                 Schema (bảng words, games; hàm pick_keyword, renumber_keywords)
data/keywords.json                   Bộ từ khóa (36.362 từ) + từ bị loại và lý do; sinh bằng npm run keywords
data/syllables.txt                   Âm tiết ngoại lệ của từ điển (~250) để kiểm tra từ đoán ở đấu theo nhóm; sinh bằng npm run syllables
data/keyword-exclusions.json         Danh sách loại trừ (từ phụ trợ, danh từ riêng, exclude/keep): cấu hình được
data/keyword-auxiliary-candidates.txt Từ có nghĩa X của Wiktionary, để cân nhắc loại sau (sinh ra)
scripts/                             db-migrate, seed-supabase, export-keywords, export-syllables, keyword-exclusions, dictionary-source
tests/                               Vitest (tests/memory-repository.ts: dữ liệu giả cho test)
e2e/, playwright.config.ts           Test E2E (Playwright; versus.spec.ts: nhiều trình duyệt cùng vào một room)
wrangler.jsonc, open-next.config.ts  Cấu hình Cloudflare Workers
```

**Luồng một ván:**
1. Trang `/` render ở server với cấu trúc ô chữ, không có từ khóa.
2. Mỗi lần bấm Đoán, trình duyệt gửi `POST /api/games/:id/guesses { guess }`.
3. Server kiểm tra lần lượt: ván còn hiệu lực, chưa kết thúc, chỉ có chữ cái tiếng Việt, đủ chữ, đúng cấu trúc ô chữ.
4. Hợp lệ thì chấm màu, lưu vào Supabase, trả trạng thái ván. Khi ván kết thúc mới kèm từ khóa và giải nghĩa.

Id ván được ghi vào cookie `dc_game` (httpOnly) trong Route Handler, nên từ lượt đoán đầu tiên trở đi tải lại trang vẫn chơi tiếp. Trang không ghi được cookie lúc render, nên nếu tải lại trước khi đoán lượt nào thì sẽ nhận ván mới. Ván cũ được tự xoá: ván chưa đoán lượt nào sau 1 ngày, mọi ván sau 7 ngày.

Lỗi trả về dạng `{ error, message }`:
- 400: `incomplete`, `wrong_structure`, `invalid_chars`, `unknown_word`, `keyword_not_found` (không có từ khóa số đó)
- 403: `review_disabled`
- 404: `game_not_found`
- 409: `game_over`, `no_hints_left` (đã dùng đủ 3 lần Hint), `no_hint_available` (mọi ô đã xanh lá hoặc đã gợi ý)

## Phiên bản

Số phiên bản (`version` trong `package.json`) hiện ở đầu hộp thoại **Luật chơi**, cạnh tiêu đề (vd: `v1.1.0`). Định dạng `major.minor.patch`.

**Quy tắc: mỗi lần deploy tăng số phiên bản, mặc định tăng `patch`** khi người phát hành không yêu cầu gì khác:

```bash
npm version patch --no-git-tag-version   # mặc định mỗi lần deploy: 1.1.0 -> 1.1.1
npm version minor --no-git-tag-version   # khi người phát hành yêu cầu (tính năng mới): 1.1.1 -> 1.2.0
npm version major --no-git-tag-version   # khi người phát hành yêu cầu (thay đổi lớn): 1.2.0 -> 2.0.0
npm version 1.4.0 --no-git-tag-version   # hoặc chỉ định thẳng một số
```

Các lệnh sửa `package.json` + `package-lock.json`; số được nhúng vào code lúc build nên phải tăng **trước** `npm run deploy`. Lịch sử bên dưới ghi các thay đổi đáng chú ý; bản vá nhỏ có thể gộp thành một dòng.

- **v1.3.7**: chat trên điện thoại: chạm ra ngoài khung chat thì đóng (lần chạm đó không bấm xuống nút bên dưới).
- **v1.3.6**: nút **giao diện sáng/tối** ở thanh trên cùng mọi trang (nhớ lựa chọn, không nháy màu khi tải trang). Emoji trong chat đổi sang bộ **popopo của voz.vn** (PNG, có bản 96px), vì bộ "Off" (GIF) bị viền răng cưa trên điện thoại.
- **v1.3.5**: chat trên laptop là **sidebar thu gọn được**: nút `»` cạnh chữ `Chat` trượt sidebar sang phải (chuyển động mượt), còn dải hẹp có nút mở lại (chấm đỏ khi có tin mới); nhớ trạng thái cho lần sau.
- **v1.3.4**: chat của phòng có **emoji voz** (bộ "Off" của vozforums.com): bảng chọn emoji (có "Dùng gần đây"), gõ `:x` thì gợi ý 3 emoji gần khớp nhất, mã emoji (kể cả mã cũ của voz như `:sogood:`, `:)`, `:D`) hiện thành ảnh.
- **v1.3.3**: đấu theo nhóm: **chat của phòng** ở Sảnh chờ và màn đấu. Laptop có khung chat nằm cố định bên phải; điện thoại có bubble bấm để mở/đóng, chấm đỏ khi có tin mới.
- **v1.3.2**: đấu theo nhóm: đồng hồ thời gian còn lại không còn làm khối `Lượt · còn` xô lệch mỗi giây (mỗi chữ số một ô rộng cố định; hiện từ `9:59`).
- **v1.3.1**: đấu theo nhóm: đóng popup kết quả (✕/Esc) để **xem lại ô chữ** với nút đếm ngược `Về phòng (Ns)`; nút **`Chụp ảnh màn hình`** copy ảnh ô chữ của mình vào clipboard để chia sẻ; màn đấu hiện **thời gian còn lại** của ván.
- **v1.3.0**: **trang chủ mới** (`/`) chỉ có hai ô vuông `Chơi đơn` và `Đấu theo nhóm`; Chơi đơn chuyển sang `/solo` (có nút Trang chủ); vào đấu theo nhóm: đã có tên thì vào thẳng, chưa có thì hộp thoại nhập tên có **tên gợi ý ngẫu nhiên**; đổi tên ở trang chủ và Room List; mở thẳng link phòng khi chưa có tên thì hỏi tên tại chỗ. Link chia sẻ từ khóa thành `/solo?id=N` (link cũ `/?id=N` chỉ mở trang chủ).
- **v1.2.3**: đấu theo nhóm: bật lại kiểm tra từ đoán ở mức **hợp lệ** (không đòi có nghĩa): mọi âm tiết đúng cấu trúc tiếng Việt hoặc có trong từ điển (`tượi` hợp lệ, `chiơ` không), thông báo "Từ này không hợp lệ".
- **v1.2.2**: đấu theo nhóm: **tạm tắt** kiểm tra từ đoán phải có trong từ điển (cờ `VERSUS.validateGuessWords = false`; từ đúng nghĩa nhưng từ điển không có không còn bị từ chối).
- **v1.2.1**: đấu theo nhóm: từ đoán phải có trong từ điển (chặn nhập chuỗi vô nghĩa để loại trừ chữ cái); popup kết quả và khối `Lượt trước` có giải nghĩa từ khóa; `Lượt trước` nằm dưới nút `Start`.
- **v1.2.0**: **đấu theo nhóm**: ô tên + nút `Đấu theo nhóm` ở Chơi đơn, `/rooms` (5 room), Inside Room (Sảnh chờ ≤ 10 người, Bàn chơi 6 ô, Start đếm ngược 5 giây), màn Versus và popup kết quả (mỗi room là một Durable Object). Xem mục [Đấu theo nhóm](#đấu-theo-nhóm).
- **v1.1.2**: nút **"Thách bạn bè đoán từ này 🔗"** ở màn hình kết thúc: copy link `/?id=N` của từ khóa vào clipboard để gửi cho bạn bè.
- **v1.1.1**: link `/?id=N` vào thẳng từ khóa số N; danh sách loại trừ từ khóa (từ phụ trợ, danh từ riêng): kho còn 36.362 từ (trước đó 40.709), số `#N` được đánh lại.
- **v1.1.0**: nút New game; bộ từ khóa 40.709 từ (trước đó 660 từ); số thứ tự từ khóa `#N` ở góc trên bên trái và chọn từ khóa theo số; nút Hint (đang tạm ẩn); hiện số phiên bản trong Luật chơi.
- **v1.0.0**: bản đầu tiên: ván 6 lượt, luật màu bốn màu, giải nghĩa và nút Chơi lại, bộ 660 từ khóa.

## Bản quyền dữ liệu

Từ điển và bộ từ khóa lấy từ [minhqnd/dictionary](https://dict.minhqnd.com) v2.0.0, giấy phép **CC BY-SA 4.0**: phải ghi nguồn `@minhqnd` kèm link https://dict.minhqnd.com, và phân phối lại dữ liệu đã sửa thì phải giữ cùng giấy phép. App đã ghi nguồn trong hộp luật chơi và ở màn hình kết thúc.
