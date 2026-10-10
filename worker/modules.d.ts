// File .txt được wrangler đóng gói thành module chuỗi (vd: data/syllables.txt).
declare module '*.txt' {
  const text: string;
  export default text;
}
