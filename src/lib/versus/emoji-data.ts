/**
 * Bộ emoji "popopo" của voz.vn, dùng trong chat của phòng. Ảnh PNG ở public/emoji/voz/: `file` 48×48 và `file2x` 96×96 cho màn hình
 * mật độ điểm ảnh cao (điện thoại). Danh sách lấy từ trang emoji của voz.vn (bản lưu Internet Archive 2025-04-29), ảnh tải từ
 * data.voz.vn. Thay cho bộ "Off" (GIF) của vozforums.com từ v1.3.6: GIF chỉ có trong suốt bật/tắt (viền trắng răng cưa trên nền
 * màu) và chỉ có cỡ 40px (bị phóng to mờ trên điện thoại).
 * Thứ tự: như bảng emoji cũ (trang emoji của vozforums.com), emoji chỉ voz.vn mới có xếp cuối.
 * `code`: mã chuẩn = tên file (giống voz.vn, vd `:big_smile:`); `aliases`: các mã gõ trên vozforums.com cũ (vd `:sogood:`, `:D`),
 * vẫn được hiện thành ảnh. `width`/`height`: kích thước ảnh `file` (px).
 */
export interface EmojiDef {
  code: string;
  file: string;
  file2x: string;
  width: number;
  height: number;
  label: string;
  aliases: readonly string[];
}

export const VOZ_EMOJI: readonly EmojiDef[] = [
  { code: 'sweat', file: 'sweat.png', file2x: 'sweat_x2.png', width: 48, height: 48, label: 'Sweat', aliases: [] },
  { code: 'nosebleed', file: 'nosebleed.png', file2x: 'nosebleed_x2.png', width: 48, height: 48, label: 'Nose Bleeding', aliases: [':chaymau:'] },
  { code: 'go', file: 'go.png', file2x: 'go_x2.png', width: 48, height: 48, label: 'Go', aliases: [] },
  { code: 'feel_good', file: 'feel_good.png', file2x: 'feel_good_x2.png', width: 48, height: 48, label: 'Feel Good', aliases: [':sogood:'] },
  { code: 'shame', file: 'shame.png', file2x: 'shame_x2.png', width: 48, height: 48, label: 'Shame', aliases: [] },
  { code: 'canny', file: 'canny.png', file2x: 'canny_x2.png', width: 48, height: 48, label: 'Canny', aliases: [] },
  { code: 'sexy_girl', file: 'sexy_girl.png', file2x: 'sexy_girl_x2.png', width: 48, height: 48, label: 'Sexy Girl', aliases: [':sexy:'] },
  { code: 'byebye', file: 'byebye.png', file2x: 'byebye_x2.png', width: 48, height: 48, label: 'Byebye', aliases: [] },
  { code: 'look_down', file: 'look_down.png', file2x: 'look_down_x2.png', width: 48, height: 48, label: 'Look Down', aliases: [] },
  { code: 'burn_joss_stick', file: 'burn_joss_stick.png', file2x: 'burn_joss_stick_x2.png', width: 48, height: 48, label: 'Burn Joss Stick', aliases: [':stick:'] },
  { code: 'adore', file: 'adore.png', file2x: 'adore_x2.png', width: 48, height: 48, label: 'Adore', aliases: [] },
  { code: 'embarrassed', file: 'embarrassed.png', file2x: 'embarrassed_x2.png', width: 48, height: 48, label: 'Embarrassed', aliases: [':">'] },
  { code: 'beauty', file: 'beauty.png', file2x: 'beauty_x2.png', width: 48, height: 48, label: 'Beauty', aliases: [] },
  { code: 'pudency', file: 'pudency.png', file2x: 'pudency_x2.png', width: 48, height: 48, label: 'Pudency', aliases: [] },
  { code: 'too_sad', file: 'too_sad.png', file2x: 'too_sad_x2.png', width: 48, height: 48, label: 'Too Sad', aliases: [':sosad:'] },
  { code: 'surrender', file: 'surrender.png', file2x: 'surrender_x2.png', width: 48, height: 48, label: 'Surrender', aliases: [] },
  { code: 'oh', file: 'oh.png', file2x: 'oh_x2.png', width: 48, height: 48, label: 'Oh', aliases: [] },
  { code: 'cry', file: 'cry.png', file2x: 'cry_x2.png', width: 48, height: 48, label: 'Cry', aliases: [':(('] },
  { code: 'dribble', file: 'dribble.png', file2x: 'dribble_x2.png', width: 48, height: 48, label: 'Dribble', aliases: [] },
  { code: 'waaaht', file: 'waaaht.png', file2x: 'waaaht_x2.png', width: 48, height: 48, label: 'Waaaht', aliases: [] },
  { code: 'after_boom', file: 'after_boom.png', file2x: 'after_boom_x2.png', width: 48, height: 48, label: 'After Boom', aliases: [':aboom:'] },
  { code: 'beat_shot', file: 'beat_shot.png', file2x: 'beat_shot_x2.png', width: 48, height: 48, label: 'Beat Shot', aliases: [':shot:'] },
  { code: 'hungry', file: 'hungry.png', file2x: 'hungry_x2.png', width: 48, height: 48, label: 'Hungry', aliases: [] },
  { code: 'smile', file: 'smile.png', file2x: 'smile_x2.png', width: 48, height: 48, label: 'Smile', aliases: [':)'] },
  { code: 'beat_plaster', file: 'beat_plaster.png', file2x: 'beat_plaster_x2.png', width: 48, height: 48, label: 'Beat Plaster', aliases: [':plaster:'] },
  { code: 'rap', file: 'rap.png', file2x: 'rap_x2.png', width: 48, height: 48, label: 'Rap', aliases: [] },
  { code: 'sweet_kiss', file: 'sweet_kiss.png', file2x: 'sweet_kiss_x2.png', width: 48, height: 48, label: 'Sweet Kiss', aliases: [':*'] },
  { code: 'ops', file: 'ops.png', file2x: 'ops_x2.png', width: 48, height: 48, label: 'Ops', aliases: [] },
  { code: 'tire', file: 'tire.png', file2x: 'tire_x2.png', width: 48, height: 48, label: 'Tire', aliases: [] },
  { code: 'bad_smelly', file: 'bad_smelly.png', file2x: 'bad_smelly_x2.png', width: 48, height: 48, label: 'Bad Smell', aliases: [':badsmell:'] },
  { code: 'beat_brick', file: 'beat_brick.png', file2x: 'beat_brick_x2.png', width: 48, height: 48, label: 'Beat Brick', aliases: [':brick:'] },
  { code: 'cool', file: 'cool.png', file2x: 'cool_x2.png', width: 48, height: 48, label: 'Cool', aliases: [':kool:'] },
  { code: 'hell_boy', file: 'hell_boy.png', file2x: 'hell_boy_x2.png', width: 48, height: 48, label: 'Hell Boy', aliases: [] },
  { code: 'sure', file: 'sure.png', file2x: 'sure_x2.png', width: 48, height: 48, label: 'Sure', aliases: [] },
  { code: 'amazed', file: 'amazed.png', file2x: 'amazed_x2.png', width: 48, height: 48, label: 'Amazed', aliases: [] },
  { code: 'sad', file: 'sad.png', file2x: 'sad_x2.png', width: 48, height: 48, label: 'Sad', aliases: [] },
  { code: 'what', file: 'what.png', file2x: 'what_x2.png', width: 48, height: 48, label: 'What', aliases: [] },
  { code: 'choler', file: 'choler.png', file2x: 'choler_x2.png', width: 48, height: 48, label: 'Choler', aliases: [] },
  { code: 'doubt', file: 'doubt.png', file2x: 'doubt_x2.png', width: 48, height: 48, label: 'Doubt', aliases: [] },
  { code: 'confident', file: 'confident.png', file2x: 'confident_x2.png', width: 48, height: 48, label: 'Confident', aliases: [] },
  { code: 'ah', file: 'ah.png', file2x: 'ah_x2.png', width: 48, height: 48, label: 'Ah', aliases: [] },
  { code: 'baffle', file: 'baffle.png', file2x: 'baffle_x2.png', width: 48, height: 48, label: 'Baffle', aliases: [] },
  { code: 'haha', file: 'haha.png', file2x: 'haha_x2.png', width: 48, height: 48, label: 'Haha', aliases: [] },
  { code: 'big_smile', file: 'big_smile.png', file2x: 'big_smile_x2.png', width: 48, height: 48, label: 'Big Smile', aliases: [':D'] },
  { code: 'matrix', file: 'matrix.png', file2x: 'matrix_x2.png', width: 48, height: 48, label: 'Matrix', aliases: [] },
  { code: 'spiderman', file: 'spiderman.png', file2x: 'spiderman_x2.png', width: 48, height: 48, label: 'Spiderman', aliases: [] },
  { code: 'angry', file: 'angry.png', file2x: 'angry_x2.png', width: 48, height: 48, label: 'Angry', aliases: [] },
  { code: 'misdoubt', file: 'misdoubt.png', file2x: 'misdoubt_x2.png', width: 48, height: 48, label: 'Misdoubt', aliases: [] },
  { code: 'boss', file: 'boss.png', file2x: 'boss_x2.png', width: 48, height: 48, label: 'Boss', aliases: [] },
  { code: 'still_dreaming', file: 'still_dreaming.png', file2x: 'still_dreaming_x2.png', width: 48, height: 48, label: 'Still Dreaming', aliases: [':dreaming:'] },
  { code: 'confuse', file: 'confuse.png', file2x: 'confuse_x2.png', width: 48, height: 48, label: 'Confuse', aliases: [':-s'] },
  { code: 'beated', file: 'beated.png', file2x: 'beated_x2.png', width: 48, height: 48, label: 'Beated', aliases: [] },
  { code: 'cold', file: 'cold.png', file2x: 'cold_x2.png', width: 48, height: 48, label: 'Cold', aliases: [] },
  { code: 'extreme_sexy_girl', file: 'extreme_sexy_girl.png', file2x: 'extreme_sexy_girl_x2.png', width: 48, height: 48, label: 'Extreme Sexy Girl', aliases: [] },
];
