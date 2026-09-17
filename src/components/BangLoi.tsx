/**
 * Băng báo lỗi dùng chung.
 *
 * Vì sao có tệp này: bốn trang gọi setErrorMessage tổng cộng 64 lần mà không
 * trang nào hiển thị giá trị đó ra màn hình. Chủ shop bấm nút, thao tác hỏng,
 * màn hình không đổi gì — trông y như nút không ăn.
 *
 * Đã xảy ra thật: bài 40 và 41 gửi sang TikTok bị từ chối vì nội dung 648 ký
 * tự vượt mức 90, database ghi 'failed', còn chủ shop chỉ thấy "bấm đăng bài
 * mà không lên".
 */
export default function BangLoi({
  noiDung,
  onDong,
  className = '',
}: {
  noiDung: string;
  onDong?: () => void;
  className?: string;
}) {
  if (!noiDung) return null;

  return (
    <div
      role="alert"
      className={`flex items-start gap-2 text-sm text-error bg-error/10 border border-error/30 rounded-xl px-4 py-3 ${className}`}
    >
      <span className="material-symbols-outlined text-[18px] mt-0.5 shrink-0">error</span>
      <span className="leading-relaxed flex-1">{noiDung}</span>
      {onDong && (
        <button
          type="button"
          onClick={onDong}
          className="text-error/70 hover:text-error shrink-0"
          aria-label="Đóng thông báo lỗi"
        >
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      )}
    </div>
  );
}
