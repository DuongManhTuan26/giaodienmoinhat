/**
 * Liệt kê mọi chỗ dùng một ký hiệu, và chỗ nào có chốt chặn.
 *
 * Đây là BƯỚC 1 bắt buộc của quy trình kiểm duyệt — xem docs/quy-trinh-kiem-duyet.md
 *
 * Vì sao cần: năm lỗi nặng nhất của dự án này sinh ra từ đúng một việc — đổi
 * một nguyên tắc xuyên suốt rồi chỉ sửa những chỗ đang nhìn thấy. Nguyên tắc
 * "gặp khó thì nhường người thật" nằm ở 8 chỗ; sửa 3, sót 5.
 *
 * Mắt người luôn sót. Máy đếm thì không.
 *
 *   npm run liet-ke -- "await handoff(" "tuChu.bat"
 *   npm run liet-ke -- "ai_enabled = FALSE"
 *
 * Tham số 1: chuỗi cần tìm.
 * Tham số 2 (tuỳ chọn): chốt chặn phải xuất hiện trong 16 dòng ngay trước đó.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GOC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [can, chot, soDong] = process.argv.slice(2);

/*
 * Cửa sổ nhìn ngược lên bao nhiêu dòng để tìm chốt chặn.
 *
 * Mặc định 16. Đặt hẹp quá thì báo THIẾU CHỐT cho chỗ thật ra có chốt — đã xảy
 * ra thật: chốt daCoDon cách chỗ tạo đơn 27 dòng, công cụ báo sót trong khi mã
 * hoàn toàn đúng. Dương tính giả kiểu này nguy hiểm vì nó dẫn tới "sửa" một
 * thứ không hỏng.
 */
const CUA_SO = Number(soDong) > 0 ? Number(soDong) : 16;

if (!can) {
  console.error('Thiếu chuỗi cần tìm. Ví dụ: npm run liet-ke -- "await handoff("');
  process.exit(2);
}

/**
 * Chỉ quét MÃ SẢN PHẨM: server/ và src/.
 *
 * Không quét scripts/ vì chính bộ công cụ kiểm duyệt cũng chứa những chuỗi này
 * trong lời hướng dẫn — đếm cả chúng là dương tính giả, mà dương tính giả làm
 * hỏng niềm tin vào phép đếm nhanh hơn cả bỏ sót.
 */
const THU_MUC_QUET = ["server", "src"];

function duyet(thuMuc: string, ra: string[] = []): string[] {
  for (const ten of fs.readdirSync(thuMuc)) {
    if (["node_modules", "dist", ".git", "backup"].includes(ten)) continue;
    const duong = path.join(thuMuc, ten);
    const stat = fs.statSync(duong);
    if (stat.isDirectory()) duyet(duong, ra);
    else if (/\.(ts|tsx|mts)$/.test(ten)) ra.push(duong);
  }
  return ra;
}

/** Dòng chỉ có chú thích thì không phải chỗ dùng thật. */
function laChuThich(dong: string): boolean {
  const t = dong.trim();
  return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*");
}

let tong = 0;
let coChot = 0;
const thieuChot: string[] = [];

for (const tep of THU_MUC_QUET.flatMap((t) => duyet(path.join(GOC, t)))) {
  const dong = fs.readFileSync(tep, "utf8").split("\n");
  dong.forEach((d, i) => {
    if (!d.includes(can) || laChuThich(d)) return;
    tong++;

    const ten = path.relative(GOC, tep);
    if (!chot) {
      console.log(`  ${ten}:${i + 1}  ${d.trim().slice(0, 80)}`);
      return;
    }

    const truoc = dong.slice(Math.max(0, i - CUA_SO), i + 1).join("\n");
    const co = truoc.includes(chot);
    if (co) coChot++;
    else thieuChot.push(`  ${ten}:${i + 1}  ${d.trim().slice(0, 70)}`);
    console.log(`  ${co ? "✓" : "✗"} ${ten}:${i + 1}  ${d.trim().slice(0, 70)}`);
  });
}

console.log(`\nTìm thấy ${tong} chỗ dùng "${can}" (không tính dòng chú thích).`);

if (chot) {
  console.log(`Có chốt "${chot}": ${coChot}/${tong}`);
  if (thieuChot.length > 0) {
    console.log(`\nTHIẾU CHỐT ${thieuChot.length} chỗ (cửa sổ ${CUA_SO} dòng):\n`);
    console.log(thieuChot.join("\n"));
    console.log(
      `\nTRƯỚC KHI KẾT LUẬN LÀ LỖI: mở đúng dòng đó ra đọc. Chốt nằm xa hơn ` +
        `${CUA_SO} dòng thì đây là dương tính giả — nới cửa sổ rồi chạy lại:\n` +
        `  npm run liet-ke -- "${can}" "${chot}" 40`
    );
    process.exit(1);
  }
  console.log("Không sót chỗ nào.");
}
