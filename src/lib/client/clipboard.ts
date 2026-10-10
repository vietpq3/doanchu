/**
 * Copy chữ vào clipboard của người dùng; trả về false nếu trình duyệt không cho phép.
 * Dùng Clipboard API (cần trang https hoặc localhost và được gọi từ một thao tác bấm). Nếu không được (trình duyệt cũ,
 * trình duyệt nhúng trong ứng dụng khác, trang http) thì thử cách cũ: chọn chữ trong một ô tạm rồi copy.
 * `container`: nơi đặt ô tạm; phải nằm trong hộp thoại đang mở (showModal) nếu đang gọi từ hộp thoại, vì phần còn lại
 * của trang bị vô hiệu khi hộp thoại mở và không chọn/copy được.
 */
export async function copyToClipboard(text: string, container: HTMLElement = document.body): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* bị từ chối: thử cách dự phòng bên dưới */
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
  container.appendChild(area);
  try {
    area.select();
    area.setSelectionRange(0, text.length); // iOS Safari cần dòng này để chọn hết
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
  }
}

/**
 * Copy ảnh PNG vào clipboard; trả về false nếu trình duyệt không hỗ trợ hoặc không cho phép.
 * Nhận Promise (không phải ảnh đã vẽ xong) và phải được gọi ngay trong lúc bấm nút: Safari chỉ cho ghi clipboard khi
 * ClipboardItem được tạo trong thao tác của người dùng, còn ảnh thì được vẽ xong sau.
 */
export async function copyImageToClipboard(png: Promise<Blob>): Promise<boolean> {
  try {
    if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) return false;
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
    return true;
  } catch {
    return false;
  }
}

/** Tải một file về máy (dự phòng khi không copy được ảnh). */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
