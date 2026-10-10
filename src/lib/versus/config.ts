/**
 * Hằng số của tính năng đấu theo nhóm (xem docs/versus-v2.md). Một nơi duy nhất để chỉnh.
 * Dùng chung cho Durable Object (worker/) và giao diện, nên chỉ dùng import tương đối trong thư mục này.
 */
export const VERSUS = {
  /** Số room cố định (tương lai sẽ cho thêm/xóa room) */
  roomCount: 5,
  /** Sảnh chờ nhận tối đa bấy nhiêu người khi VÀO room; người từ Bàn chơi quay về sảnh luôn được nhận */
  lobbyMax: 10,
  /** Số ô ở Bàn chơi */
  seats: 6,
  /** Số người ngồi bàn tối thiểu để bấm Start */
  minPlayersToStart: 2,
  /** Đếm ngược từ lúc bấm Start tới lúc bắt đầu ván */
  countdownMs: 5_000,
  /** Sau khi ván kết thúc: popup `OK (10s)` và phòng bị khóa chừng này thời gian */
  resultLockMs: 10_000,
  /** Giới hạn thời gian một ván */
  matchMaxMs: 10 * 60_000,
  /** Đang trong ván mà mất kết nối: chờ nối lại chừng này (tải lại trang không mất ván), quá hạn thì bị loại */
  reconnectGraceMs: 30_000,
  /** Số lượt đoán mỗi người (bằng config.maxTurns của Chơi đơn) */
  maxTurns: 6,
  /** Số nghĩa tối đa hiện ở màn hình kết thúc (bằng config.maxDefinitions của Chơi đơn) */
  maxDefinitions: 4,
  /**
   * Từ đoán phải hợp lệ (mọi âm tiết đúng cấu trúc tiếng Việt hoặc có trong từ điển; src/lib/versus/syllable.ts) mới được chấm,
   * để chặn nhập chuỗi vô nghĩa như `aê yiư` chỉ nhằm loại trừ chữ cái. Không đòi từ phải có nghĩa. Đổi thành false để tắt.
   */
  validateGuessWords: true,
  /** Độ dài tên người chơi */
  nameMax: 20,
  /** Chat của phòng: độ dài một tin nhắn (ký tự), số tin gần nhất được giữ lại, và tần suất gửi tối đa mỗi người */
  chatMax: 200,
  chatHistory: 50,
  chatRate: { messages: 5, windowMs: 5_000 },
  /** Leader Board của phòng (số ván thắng trong ngày): reset lúc 00:00 giờ Việt Nam (UTC+7, không có giờ mùa hè) */
  leaderboardUtcOffsetMs: 7 * 60 * 60_000,
  /** Số người tối đa được nhớ trên Leader Board của một phòng (quá thì bỏ người thấp nhất) */
  leaderboardMax: 100,
} as const;

export const roomName = (id: number) => `Room #${id}`;

export const isRoomId = (n: number) => Number.isInteger(n) && n >= 1 && n <= VERSUS.roomCount;
