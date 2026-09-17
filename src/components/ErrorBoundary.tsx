import React from 'react';

/**
 * Lưới hứng lỗi của giao diện.
 *
 * Vì sao cần: React tháo bỏ TOÀN BỘ cây giao diện khi một chỗ ném lỗi lúc vẽ.
 * Kết quả là màn hình TRẮNG TRƠN, không chữ, không nút — chủ shop tưởng hệ
 * thống sập hoặc bị đăng xuất, và không có cách nào thoát ngoài việc tự đoán ra
 * phải tải lại trang. Đã xảy ra thật khi máy chủ khởi động lại giữa chừng.
 *
 * Hứng lại thì lỗi chỉ giới hạn trong một màn hình, kèm lời giải thích và một
 * nút bấm để thoát ra.
 */
interface Props {
  children: React.ReactNode;
}

interface State {
  loi: Error | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  /*
   * Khai báo tường minh vì dự án không cài @types/react, nên TypeScript không
   * tự biết component dạng class có props và state. Dùng `declare` để đây chỉ
   * là khai báo kiểu, không sinh ra thuộc tính lúc chạy (sẽ ghi đè giá trị thật
   * mà React gán).
   */
  declare props: Props;
  declare state: State;

  constructor(props: Props) {
    super(props);
    this.state = { loi: null };
  }

  static getDerivedStateFromError(loi: Error): State {
    return { loi };
  }

  componentDidCatch(loi: Error, info: React.ErrorInfo) {
    // Ghi ra console để còn lần được nguyên nhân khi chủ shop báo lỗi.
    console.error('[giao diện] Lỗi không bắt được:', loi, info.componentStack);
  }

  render() {
    if (!this.state.loi) return this.props.children;

    return (
      <div className="w-full min-h-[60vh] flex items-center justify-center p-8 bg-background">
        {/*
          Độ rộng ghi bằng pixel tường minh, theo đúng quy ước của các màn hình
          khác trong dự án. Lớp max-w-md ở đây KHÔNG phải 28rem như Tailwind mặc
          định — bộ token riêng của dự án quy nó về 24px, làm chữ bị bóp thành
          một cột dọc.
        */}
        <div className="w-[420px] max-w-[90vw] text-center mx-auto">
          <span className="material-symbols-outlined text-[48px] text-error opacity-70">
            error
          </span>
          <h1 className="text-xl font-bold text-on-surface mt-4 mb-2">
            Màn hình này gặp sự cố
          </h1>
          <p className="text-sm text-on-surface-variant leading-relaxed mb-6">
            Dữ liệu của bạn vẫn an toàn, không có gì bị mất. Vui lòng tải lại trang;
            nếu vẫn lỗi, báo lại cho bộ phận hỗ trợ kèm ảnh màn hình này.
          </p>

          <div className="bg-surface-container border border-outline-variant rounded-xl p-3 mb-6 text-left">
            <p className="text-xs font-mono text-on-surface-variant break-words">
              {this.state.loi.message}
            </p>
          </div>

          <div className="flex gap-3 justify-center">
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2.5 bg-primary text-on-primary font-bold text-sm rounded-xl hover:brightness-110 transition-all"
            >
              Tải lại trang
            </button>
            <button
              onClick={() => { window.location.href = '/'; }}
              className="px-6 py-2.5 border border-outline-variant text-on-surface font-bold text-sm rounded-xl hover:bg-surface-variant transition-colors"
            >
              Về Bảng điều khiển
            </button>
          </div>
        </div>
      </div>
    );
  }
}
