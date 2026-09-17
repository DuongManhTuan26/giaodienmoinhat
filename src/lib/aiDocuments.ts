/**
 * Nạp tài liệu cho AI — phần dùng chung.
 *
 * Có hai màn hình cùng làm việc này: hộp thoại Vai trò (cho AI viết bài, quảng
 * cáo, thống kê) và khối "Tài liệu AI được dùng" ở trang Kịch bản tự động (cho
 * AI bán hàng). Chép đôi phần đọc tệp sang cả hai nơi là cách chắc chắn nhất để
 * mai này sửa một bên, quên bên kia.
 */

import { api, type AiDocument } from './api';

/**
 * Định dạng ĐỌC ĐƯỢC nội dung chữ ngay trong trình duyệt.
 *
 * Máy chủ lưu phần CHỮ đã bóc tách chứ không lưu tệp gốc, vì AI chỉ học được
 * từ chữ. Với các định dạng dưới đây trình duyệt tự đọc được, không cần thêm
 * thư viện nào.
 */
export const DUOI_VAN_BAN = ['.txt', '.md', '.csv', '.json', '.log'];
export const NHAN_VAN_BAN = '.txt,.md,.csv,.json,.log';
export const NHAN_ANH = 'image/png,image/jpeg,image/webp,image/gif';

export function docDuocChu(name: string): boolean {
  const n = name.toLowerCase();
  return DUOI_VAN_BAN.some((duoi) => n.endsWith(duoi));
}

/**
 * Duyệt FileList theo chỉ số thay vì Array.from.
 * @types/node khai báo một kiểu File toàn cục khác với File của trình duyệt,
 * khiến Array.from(FileList) bị suy ra thành unknown khi hai kiểu này cùng tồn tại.
 */
export function toFileArray(list: FileList): File[] {
  const files: File[] = [];
  for (let i = 0; i < list.length; i++) {
    const file = list.item(i);
    if (file) files.push(file);
  }
  return files;
}

export function doiCoTep(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Thu nhỏ ảnh ngay trong trình duyệt trước khi gửi.
 *
 * Thân request giới hạn 2MB, mà base64 phình thêm khoảng một phần ba. Ảnh chụp
 * bằng điện thoại bây giờ thường 4-8MB nên gửi thẳng là trượt. Model đọc chữ
 * cũng không cần độ phân giải cao hơn mức này — 1600px đủ để đọc rõ một bảng
 * giá chụp bằng điện thoại.
 */
export function thuNhoAnh(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const doc = new FileReader();
    doc.onerror = () => reject(new Error('Không đọc được tệp ảnh'));
    doc.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Tệp này không phải ảnh hợp lệ'));
      img.onload = () => {
        const CANH_TOI_DA = 1600;
        const ti = Math.min(1, CANH_TOI_DA / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * ti);
        canvas.height = Math.round(img.height * ti);
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Trình duyệt không xử lý được ảnh này'));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Hạ dần chất lượng cho tới khi chui lọt giới hạn thân request.
        let chatLuong = 0.82;
        let ra = canvas.toDataURL('image/jpeg', chatLuong);
        while (ra.length > 1_400_000 && chatLuong > 0.4) {
          chatLuong -= 0.12;
          ra = canvas.toDataURL('image/jpeg', chatLuong);
        }
        if (ra.length > 1_400_000) {
          return reject(new Error('Ảnh quá nặng, hãy cắt bớt rồi thử lại'));
        }
        resolve(ra);
      };
      img.src = String(doc.result);
    };
    doc.readAsDataURL(file);
  });
}

export interface KetQuaNap {
  daNap: AiDocument[];
  boQua: string[];
  loi: string;
}

/** Nạp các tệp chữ. Tệp nào trình duyệt không đọc được thì trả về ở `boQua`. */
export async function napTepChu(kind: string, files: File[]): Promise<KetQuaNap> {
  const daNap: AiDocument[] = [];
  const boQua: string[] = [];
  let loi = '';

  for (const file of files) {
    if (!docDuocChu(file.name)) {
      boQua.push(file.name);
      continue;
    }
    try {
      const text = await file.text();
      const { data } = await api.ai.addDocument(kind, {
        filename: file.name,
        mimeType: file.type || 'text/plain',
        text,
        sizeBytes: file.size,
      });
      daNap.push(data);
    } catch (error) {
      loi = error instanceof Error ? error.message : `Không tải lên được ${file.name}`;
    }
  }
  return { daNap, boQua, loi };
}

/** Nạp ảnh: thu nhỏ rồi để máy chủ đọc chữ trong ảnh. */
export async function napTepAnh(kind: string, files: File[]): Promise<KetQuaNap> {
  const daNap: AiDocument[] = [];
  const boQua: string[] = [];
  let loi = '';

  for (const file of files) {
    if (!file.type.startsWith('image/')) {
      boQua.push(file.name);
      continue;
    }
    try {
      const dataUrl = await thuNhoAnh(file);
      const { data } = await api.ai.addDocument(kind, {
        filename: file.name,
        mimeType: 'image/jpeg',
        imageDataUrl: dataUrl,
        sizeBytes: file.size,
      });
      daNap.push(data);
    } catch (error) {
      loi = error instanceof Error ? error.message : `Không đọc được ${file.name}`;
    }
  }
  return { daNap, boQua, loi };
}
