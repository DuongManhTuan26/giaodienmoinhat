import { query, queryOne } from "../db.js";
import * as zernio from "./zernio.js";
import { handleWebhookEvent } from "./events.js";

/**
 * LƯỚI AN TOÀN KHI WEBHOOK CHẾT.
 *
 * Vì sao bắt buộc phải có.
 *
 * Toàn bộ sản phẩm sống nhờ webhook: khách nhắn tin, khách bình luận, bài đăng
 * xong — tất cả đều vào bằng đường đó. Mà đường đó đứt rất dễ:
 *   - Địa chỉ công khai đổi hoặc sập (đã xảy ra 4 lần trong một ngày).
 *   - Zernio ĐÌNH CHỈ giao tin sau nhiều lần lỗi liên tiếp, và KHÔNG tự gỡ.
 * Khi đó AI điếc hoàn toàn mà không ai hay biết — khách nhắn vào khoảng không,
 * chủ shop mất khách mà không hiểu vì sao.
 *
 * Lưới này chủ động hỏi Zernio "có gì mới không" theo nhịp, rồi bơm thứ tìm
 * được vào ĐÚNG hàng đợi mà webhook vẫn bơm vào. Một đường ống duy nhất, nên
 * mọi chốt chặn (chống lặp ba tầng, cửa sổ 24 giờ, hàng rào an toàn) vẫn nguyên
 * vẹn, không có đường tắt nào.
 *
 * Chống trùng: mã sự kiện sinh theo id tin nhắn, nên quét lại bao nhiêu lần
 * cũng chỉ xử lý một lần — bảng webhook_events đã có khoá duy nhất trên event_id.
 */

/** Số hội thoại xem chi tiết tối đa mỗi lượt quét, cho mỗi kênh. */
const MAX_HOI_THOAI_MOI_LUOT = 10;

/**
 * Chỉ xét tin trong 24 giờ gần đây.
 *
 * Lưới này để BẮT TIN MỚI BỊ SÓT, không phải để chép lại lịch sử. Bản đầu không
 * có mốc này và hậu quả đã đo được: nó lôi tin từ tháng 7 ra, đưa vào đường ống
 * như tin mới, và AI định trả lời 10 tin cũ — chỉ trượt vì Facebook chặn ở phút
 * chót chứ không phải vì mã đúng. Khách nhận lời đáp cho câu hỏi hai tháng
 * trước là hỏng uy tín shop, và là mẫu hành vi bot rõ ràng.
 *
 * 24 giờ cũng chính là cửa sổ Meta cho phép trả lời — ngoài khoảng đó AI không
 * được gửi gì, nên xử lý cũng vô nghĩa.
 */
const CUA_SO_XET_MS = 24 * 60 * 60 * 1_000;

/**
 * Ngưỡng hạn mức còn lại mà dưới đó thì bỏ lượt quét.
 *
 * Hạn mức 60 lượt/phút dùng CHUNG với việc trả lời khách. Việc rà soát nền
 * không bao giờ được giành phần của việc chính.
 */
const HAN_MUC_TOI_THIEU = 20;

interface KetQua {
  daQuet: number;
  tinMoi: number;
  /** Bình luận vớt được nhờ quét bù, tức là webhook đã không đưa nó vào. */
  binhLuanMoi: number;
  boQua: string | null;
}

/**
 * Quét bù BÌNH LUẬN.
 *
 * Vòng rà soát cũ chỉ quét hội thoại. Nên khi đường webhook chết thì tin nhắn
 * vẫn về (chậm 5 phút) còn bình luận MẤT TRẮNG — không có đường nào khác đưa
 * nó vào. Đã xảy ra thật suốt nhiều ngày mà không ai hay: nhà cung cấp gửi 10
 * lần comment.received, cả 10 đều hỏng vì địa chỉ webhook đăng ký nhầm.
 *
 * Hai lớp phải cùng che một thứ, nếu không thì lớp nào hỏng là thủng đúng chỗ
 * đó. Bình luận đã có trong database rồi thì bỏ qua, nên chạy lại bao nhiêu
 * lần cũng không nhân đôi.
 */
async function raSoatBinhLuan(account: {
  id: string;
  user_id: number;
}): Promise<number> {
  let them = 0;

  let bai: zernio.BaiCoBinhLuan[];
  try {
    bai = await zernio.layBaiCoBinhLuan({ accountId: account.id, limit: 25 });
  } catch (error) {
    console.error(
      `[rà soát bình luận] Không đọc được danh sách bài của ${account.id}:`,
      error instanceof Error ? error.message : error
    );
    return 0;
  }

  for (const b of bai) {
    if (!b.commentCount || b.commentCount <= 0) continue;

    let dsBinhLuan: zernio.BinhLuanCuaBai[];
    try {
      dsBinhLuan = await zernio.layBinhLuanCuaBai({ postId: b.id, accountId: account.id });
    } catch (error) {
      console.error(
        `[rà soát bình luận] Không đọc được bình luận của bài ${b.id}:`,
        error instanceof Error ? error.message : error
      );
      continue;
    }

    for (const c of dsBinhLuan) {
      if (!c.id) continue;
      const daCo = await queryOne("SELECT 1 FROM comments WHERE id = $1", [c.id]);
      if (daCo) continue;

      /*
       * Đi qua ĐÚNG đường mà webhook đi, không viết đường nạp thứ hai.
       *
       * Hai đường nạp khác nhau là hai bộ luật khác nhau, và sớm muộn chúng
       * lệch nhau — đúng cái bẫy đã gặp ở chỗ đồng bộ kênh trước đây.
       */
      try {
        await handleWebhookEvent({
          eventId: `ra-soat:${c.id}`,
          eventType: "comment.received",
          accountId: account.id,
          payload: {
            comment: {
              id: c.id,
              text: c.message ?? "",
              platformPostId: b.id,
              parentCommentId: c.parent?.id,
              isReply: Boolean(c.parent?.id),
              platform: "facebook",
              createdAt: c.createdTime,
              author: { id: c.from?.id, name: c.from?.name },
            },
          },
        });
        them += 1;
      } catch (error) {
        console.error(
          `[rà soát bình luận] Không nạp được bình luận ${c.id}:`,
          error instanceof Error ? error.message : error
        );
      }
    }
  }

  return them;
}

export async function reconcileInbox(): Promise<KetQua> {
  const ket: KetQua = { daQuet: 0, tinMoi: 0, binhLuanMoi: 0, boQua: null };

  // Còn ít hạn mức thì nhường cho việc trả lời khách.
  const han = zernio.getRateLimitState();
  if (han.remaining !== null && han.remaining < HAN_MUC_TOI_THIEU) {
    ket.boQua = `còn ${han.remaining} lượt gọi, để dành cho việc trả lời khách`;
    return ket;
  }

  const accounts = await query<{ id: string; user_id: number; platform: string }>(
    `SELECT id, user_id, platform FROM social_accounts
      WHERE connected = TRUE AND platform <> 'metaads'`
  );

  for (const account of accounts.rows) {
    /*
     * Quét bù bình luận TRƯỚC hội thoại.
     *
     * Bình luận là thứ duy nhất không có đường dự phòng nào khác, nên nếu hạn
     * mức gọi hết giữa chừng thì phần bị bỏ dở nên là hội thoại — thứ vẫn còn
     * webhook và vòng sau vớt lại được.
     */
    ket.binhLuanMoi += await raSoatBinhLuan(account);

    let conversations: zernio.ZernioConversation[];
    try {
      conversations = await zernio.listConversations({ accountId: account.id });
    } catch (error) {
      console.error(
        `[rà soát] Không đọc được hội thoại của ${account.id}:`,
        error instanceof Error ? error.message : error
      );
      continue;
    }

    /*
     * Chỉ xem chi tiết hội thoại NGHI CÓ TIN MỚI: Zernio báo cập nhật muộn hơn
     * mốc mình đang giữ. Xem hết mọi hội thoại mỗi lượt sẽ đốt sạch hạn mức.
     */
    const dangNgo: zernio.ZernioConversation[] = [];
    for (const c of conversations) {
      const ta = await queryOne<{ last_message_at: Date | null }>(
        "SELECT last_message_at FROM conversations WHERE id = $1",
        [c.id]
      );
      const moiBenZernio = c.updatedTime ? new Date(c.updatedTime) : null;
      const chuaCo = !ta;
      const moiHon =
        moiBenZernio && ta?.last_message_at
          ? moiBenZernio.getTime() > ta.last_message_at.getTime() + 1_000
          : Boolean(moiBenZernio);

      if (chuaCo || moiHon) dangNgo.push(c);
    }

    for (const c of dangNgo.slice(0, MAX_HOI_THOAI_MOI_LUOT)) {
      ket.daQuet++;
      let messages: zernio.ZernioMessage[];
      try {
        const chiTiet = await zernio.getConversation(c.id, account.id);
        messages = chiTiet.messages;
      } catch (error) {
        console.error(
          `[rà soát] Không đọc được tin của hội thoại ${c.id}:`,
          error instanceof Error ? error.message : error
        );
        continue;
      }

      /*
       * Mốc so sánh: tin mới nhất mình ĐANG CÓ của hội thoại này. Mọi thứ cũ
       * hơn mốc đó là lịch sử, không phải tin bị sót.
       */
      const mocCu = await queryOne<{ moi_nhat: Date | null }>(
        "SELECT MAX(sent_at) AS moi_nhat FROM messages WHERE conversation_id = $1",
        [c.id]
      );
      const moc = mocCu?.moi_nhat ? mocCu.moi_nhat.getTime() : 0;

      for (const m of messages) {
        if (!m.id) continue;

        const luc = new Date(
          (m as { createdAt?: string; sentAt?: string }).createdAt ??
            (m as { sentAt?: string }).sentAt ??
            m.createdTime ??
            0
        ).getTime();

        // Quá cũ so với thứ mình đã có, hoặc quá 24 giờ — là lịch sử, bỏ qua.
        if (!Number.isFinite(luc) || luc <= moc) continue;
        if (Date.now() - luc > CUA_SO_XET_MS) continue;

        // Đã có trong database rồi thì thôi.
        const daCo = await queryOne(
          "SELECT id FROM messages WHERE external_id = $1 AND conversation_id = $2",
          [m.id, c.id]
        );
        if (daCo) continue;

        /*
         * Bơm vào đúng hàng đợi của webhook, với mã sự kiện suy ra từ id tin
         * nhắn. Chạy lại lượt quét cũng chỉ xử lý một lần.
         */
        const eventId = `rasoat-${m.id}`;
        const trung = await queryOne("SELECT id FROM webhook_events WHERE event_id = $1", [
          eventId,
        ]);
        if (trung) continue;

        const payload = {
          message: {
            id: m.id,
            conversationId: c.id,
            platform: c.platform ?? account.platform,
            /*
             * Dùng THẲNG direction của Zernio.
             *
             * Bản đầu tôi tự suy từ m.isFromPage — một trường KHÔNG TỒN TẠI
             * trong phản hồi thật, nên mọi tin đều thành "incoming", kể cả tin
             * do chính Trang gửi. Hậu quả nếu để vậy: AI trả lời chính tin của
             * mình, hai bên nói qua nói lại tới khi hết hạn mức.
             *
             * Kiểm chứng bằng dữ liệu thật: tin của khách có
             * direction="incoming", senderId = id người tham gia; tin của Trang
             * có direction="outgoing", senderId = id Trang.
             */
            direction: (m as { direction?: string }).direction ?? "incoming",
            text: m.message ?? m.text ?? null,
            // Giữ nguyên thời điểm thật, nếu không tin cũ sẽ mang dấu thời
            // gian hôm nay và làm hỏng dòng thời gian hội thoại.
            createdAt:
              (m as { createdAt?: string; sentAt?: string }).createdAt ??
              (m as { sentAt?: string }).sentAt ??
              m.createdTime,
            attachments: m.attachments ?? [],
            sender: {
              id: m.senderId ?? c.participantId,
              name: m.senderName ?? c.participantName,
            },
          },
        };

        await query(
          `INSERT INTO webhook_events (event_id, event_type, account_id, payload, status)
           VALUES ($1, 'message.received', $2, $3, 'processing')
           ON CONFLICT (event_id) DO NOTHING`,
          [eventId, account.id, JSON.stringify(payload)]
        );

        try {
          await handleWebhookEvent({
            eventId,
            eventType: "message.received",
            accountId: account.id,
            payload,
            attempt: 1,
            maxAttempts: 1,
          });
          await query(
            "UPDATE webhook_events SET status='done', processed_at=now() WHERE event_id=$1",
            [eventId]
          );
          ket.tinMoi++;
        } catch (error) {
          const loi = error instanceof Error ? error.message : String(error);
          await query(
            "UPDATE webhook_events SET status='failed', last_error=$2 WHERE event_id=$1",
            [eventId, loi.slice(0, 1_000)]
          );
          console.error(`[rà soát] Xử lý tin ${m.id} lỗi: ${loi}`);
        }
      }
    }
  }

  return ket;
}
