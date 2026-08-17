import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import axios from "axios";
import { GoogleGenAI } from "@google/genai";
import pool, { initDB } from "./src/db/index.js";

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());

// ==========================================
// 1. DATABASE CONNECTION (PostgreSQL - Neon.tech)
// ==========================================
// Sử dụng CSDL thật từ URL bạn cung cấp để lưu trữ Đơn hàng, Khách hàng & Tin nhắn.

// ==========================================
// 2. AI CONFIGURATION (Gemini)
// ==========================================
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// ==========================================
// 3. ZERNIO API CONFIGURATION
// ==========================================
const ZERNIO_API_KEY = process.env.ZERNIO_API_KEY;
const ZERNIO_BASE_URL = "https://zernio.com/api/v1";

const zernioClient = axios.create({
  baseURL: ZERNIO_BASE_URL,
  headers: {
    "Authorization": `Bearer ${ZERNIO_API_KEY}`,
    "Content-Type": "application/json"
  }
});

// ==========================================
// 4. API ROUTES (BFF - Backend For Frontend)
// ==========================================

// Health Check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Zernio AI Backend is running" });
});

// [AI] Trích xuất thông tin khách hàng từ tin nhắn
app.post("/api/ai/extract-info", async (req, res) => {
  const { messages } = req.body;
  
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Yêu cầu cung cấp mảng tin nhắn (messages)" });
  }

  try {
    const chatHistory = messages.map((m: any) => `${m.senderType}: ${m.text}`).join('\n');
    
    const systemInstruction = `Bạn là một trợ lý AI phân tích cuộc hội thoại bán hàng. Nhiệm vụ của bạn là trích xuất 5 thông tin của KHÁCH HÀNG từ lịch sử chat.
Trường thông tin cần lấy: name (Tên), phone (Số điện thoại), address (Địa chỉ), product (Sản phẩm), quantity (Số lượng).
Nếu thông tin nào chưa có trong cuộc hội thoại, trả về giá trị "Chưa có".
CHỈ trả về một JSON object duy nhất, không có markdown formatting, ví dụ:
{ "name": "Nguyễn Văn A", "phone": "0987654321", "address": "123 Đường X, Hà Nội", "product": "Áo thun đen", "quantity": "2" }`;

    const prompt = `Lịch sử chat:\n${chatHistory}\n\nHãy trích xuất thông tin khách hàng ra JSON.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.7-flash',
      contents: prompt,
      config: {
        systemInstruction,
        temperature: 0.1,
      }
    });

    let rawText = response.text || "{}";
    rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    const extractedData = JSON.parse(rawText);

    res.json({ success: true, data: extractedData });
  } catch (error) {
    console.error("Error extracting info:", error);
    res.status(500).json({ error: "Lỗi trích xuất thông tin từ AI" });
  }
});
// [AI] Tạo bài viết Content
app.post("/api/ai/generate-post", async (req, res) => {
  const { topic, goal } = req.body;
  
  try {
    let systemInstruction = "Bạn là một chuyên gia Marketing đa kênh viết bài cho Fanpage.";
    if (goal === 'sales') systemInstruction += " Mục tiêu của bạn là viết bài BÁN HÀNG, chốt sale, nhấn mạnh ưu đãi và kêu gọi hành động (Call to action) mạnh mẽ.";
    if (goal === 'engagement') systemInstruction += " Mục tiêu của bạn là TĂNG TƯƠNG TÁC, đặt câu hỏi mở, tạo minigame hoặc khảo sát ý kiến khách hàng.";
    if (goal === 'announcement') systemInstruction += " Mục tiêu của bạn là THÔNG BÁO, truyền đạt thông tin rõ ràng, chuyên nghiệp, súc tích.";

    const prompt = `Hãy viết 3 phương án bài đăng Facebook/Instagram khác nhau cho chủ đề sau: "${topic}". Trả về định dạng JSON là một mảng chuỗi (array of strings) chứa 3 phương án. KHÔNG BAO GỒM BẤT KỲ ĐỊNH DẠNG MARKDOWN NÀO NHƯ \`\`\`json. CHỈ TRẢ VỀ MẢNG JSON TỪ [ ĐẾN ].`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.7-flash',
      contents: prompt,
      config: {
        systemInstruction,
        temperature: 0.7,
      }
    });

    let rawText = response.text || "[]";
    // Clean up potential markdown blocks if AI ignored instruction
    rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    const options = JSON.parse(rawText);

    res.json({ success: true, options });
  } catch (error) {
    console.error("Error generating post:", error);
    res.status(500).json({ error: "Lỗi tạo bài viết từ AI" });
  }
});

// [DASHBOARD] Lấy thông kê tổng quan từ DB
app.get("/api/dashboard/stats", async (req, res) => {
  try {
    // Tổng số đơn hàng
    const ordersResult = await pool.query('SELECT COUNT(*) FROM orders');
    const totalOrders = parseInt(ordersResult.rows[0].count, 10);

    // Tổng số khách hàng
    const customersResult = await pool.query('SELECT COUNT(*) FROM customers');
    const totalCustomers = parseInt(customersResult.rows[0].count, 10);

    // Danh sách 5 đơn hàng mới nhất
    const recentOrdersResult = await pool.query(`
      SELECT o.id, c.name as customer_name, o.product, o.quantity, o.status, o.created_at
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      ORDER BY o.created_at DESC
      LIMIT 5
    `);

    // Danh sách trang đã kết nối
    const pagesResult = await pool.query('SELECT COUNT(*) FROM pages WHERE connected = true');
    const activePages = parseInt(pagesResult.rows[0].count, 10);

    // Tin nhắn AI đã xử lý
    const aiMessagesResult = await pool.query("SELECT COUNT(*) FROM messages WHERE sender_type = 'ai'");
    const aiMessagesCount = parseInt(aiMessagesResult.rows[0].count, 10);

    // [Thêm logic cho Cột Phải: Cần xử lý ngay]
    // Tìm các tin nhắn khách hàng cần nhân viên hỗ trợ (is_handoff = true)
    const urgentResult = await pool.query(`
      SELECT 
        c.name as customer_name,
        m.content as issue,
        m.created_at
      FROM messages m
      JOIN customers c ON m.customer_id = c.id
      WHERE m.is_handoff = true
      ORDER BY m.created_at DESC
      LIMIT 3
    `);
    const urgentTasks = urgentResult.rows;

    // [Thêm logic cho Cột Phải: Phân tích của Trợ lý AI]
    // Lấy 10 tin nhắn gần nhất mà AI phải chuyển cho nhân viên (handoff)
    const handoffMessagesResult = await pool.query(`
      SELECT content FROM messages WHERE is_handoff = true ORDER BY created_at DESC LIMIT 10
    `);
    
    let aiInsight = { rawData: "", recommendation: "" };

    if (handoffMessagesResult.rows.length > 0) {
      // Dùng Gemini để phân tích các cuộc hội thoại thất bại này
      const handoffsText = handoffMessagesResult.rows.map(r => r.content).join(" | ");
      const systemInstruction = `Bạn là hệ thống AI phân tích dữ liệu CRM. Dựa vào các đoạn tin nhắn mà AI không thể trả lời và phải chuyển cho nhân viên, hãy đưa ra 1 phát hiện (rawData) và 1 lời khuyên (recommendation) để huấn luyện AI. Trả về đúng JSON format: {"rawData": "string", "recommendation": "string"}`;
      
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3.7-flash',
          contents: `Các tin nhắn AI thất bại gần đây: "${handoffsText}". Hãy phân tích.`,
          config: { systemInstruction, temperature: 0.1 }
        });
        
        let rawText = response.text || "{}";
        rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        aiInsight = JSON.parse(rawText);
      } catch (err) {
        console.error("AI Insight Error:", err);
        aiInsight = {
          rawData: "Có lỗi khi kết nối với AI phân tích.",
          recommendation: "Vui lòng thử lại sau."
        };
      }
    } else {
      // Default state khi hệ thống mới chưa có dữ liệu handoff
      aiInsight = {
        rawData: "Hệ thống vừa khởi tạo. AI đang theo dõi các đoạn chat mới để tìm ra mẫu câu hỏi thường gặp mà chưa có kịch bản trả lời.",
        recommendation: "Hãy kết nối Fanpage. Các đề xuất tối ưu kịch bản chốt đơn sẽ tự động xuất hiện tại đây khi có đủ dữ liệu."
      };
    }

    res.json({
      success: true,
      stats: {
        totalOrders,
        totalCustomers,
        activePages,
        aiMessagesCount
      },
      recentOrders: recentOrdersResult.rows,
      urgentTasks: urgentTasks,
      aiInsight: aiInsight
    });
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    res.status(500).json({ error: "Lỗi lấy dữ liệu Dashboard từ DB" });
  }
});

// [ZERNIO] Lấy danh sách Fanpage/Tài khoản đã kết nối
app.get("/api/zernio/pages", async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM pages ORDER BY created_at DESC');
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("Error fetching pages:", error.message);
    res.status(500).json({ error: "Failed to fetch pages from database" });
  }
});

// [ZERNIO] Kết nối Fanpage/Tài khoản mới
app.post("/api/zernio/pages", async (req, res) => {
  const { id, name, platform } = req.body;
  if (!id || !name || !platform) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  try {
    const check = await pool.query('SELECT id FROM pages WHERE id = $1', [id]);
    if (check.rows.length > 0) {
      await pool.query('UPDATE pages SET connected = true WHERE id = $1', [id]);
    } else {
      await pool.query('INSERT INTO pages (id, name, platform, connected) VALUES ($1, $2, $3, $4)', [id, name, platform, true]);
    }
    res.json({ success: true, message: "Kết nối thành công" });
  } catch (error) {
    console.error("Error saving page connection:", error);
    res.status(500).json({ error: "Lỗi lưu dữ liệu trang" });
  }
});

// [ZERNIO] Hủy kết nối (Xóa page)
app.delete("/api/zernio/pages/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM pages WHERE id = $1', [id]);
    res.json({ success: true, message: "Đã ngắt kết nối thành công" });
  } catch (error) {
    console.error("Error disconnecting page:", error);
    res.status(500).json({ error: "Lỗi ngắt kết nối" });
  }
});

// [ZERNIO] Nhận tin nhắn mới (Webhook mô phỏng)
app.post("/api/zernio/webhook", (req, res) => {
  const incomingMessage = req.body;
  console.log("Received message from Zernio:", incomingMessage);
  // Todo: Gửi tin nhắn này cho Gemini xử lý
  res.json({ success: true });
});

// [CRM] Lưu đơn hàng mới
app.post("/api/orders", async (req, res) => {
  const { customerId, product, quantity, status } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO orders (customer_id, product, quantity, status) 
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [customerId || null, product, quantity, status || 'pending']
    );
    res.json({ success: true, order: result.rows[0] });
  } catch (error) {
    console.error("Error creating order:", error);
    res.status(500).json({ error: "Lỗi lưu đơn hàng vào PostgreSQL" });
  }
});

// [CRM] Lấy danh sách đơn hàng
app.get("/api/orders", async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).json({ error: "Lỗi lấy danh sách đơn hàng từ PostgreSQL" });
  }
});

// ==========================================
// 4. VITE MIDDLEWARE SETUP (MANDATORY FOR FULLSTACK)
// ==========================================
async function startServer() {
  // Initialize Database First
  await initDB();

  
// [CONTENT] Quản lý bài viết
app.get("/api/posts", async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM posts ORDER BY created_at DESC');
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("Error fetching posts:", error);
    res.status(500).json({ error: "Lỗi lấy danh sách bài viết" });
  }
});

app.post("/api/posts", async (req, res) => {
  const { content, status, hasImage, scheduleTime } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO posts (content, status, platforms, scheduled_for, created_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING *',
      [content, status || 'Chờ duyệt', hasImage ? 'has_image' : '', scheduleTime ? new Date(scheduleTime) : null]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error("Error creating post:", error);
    res.status(500).json({ error: "Lỗi tạo bài viết" });
  }
});

app.put("/api/posts/:id/status", async (req, res) => {
  const { id } = req.params;
  const { status, scheduleTime } = req.body;
  try {
    let query, params;
    if (scheduleTime) {
      query = 'UPDATE posts SET status = $1, scheduled_for = $2 WHERE id = $3 RETURNING *';
      params = [status, new Date(scheduleTime), id];
    } else {
      query = 'UPDATE posts SET status = $1 WHERE id = $2 RETURNING *';
      params = [status, id];
    }
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error("Error updating post status:", error);
    res.status(500).json({ error: "Lỗi cập nhật trạng thái bài viết" });
  }
});

app.delete("/api/posts/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM posts WHERE id = $1', [id]);
    res.json({ success: true, message: "Đã xóa bài viết" });
  } catch (error) {
    console.error("Error deleting post:", error);
    res.status(500).json({ error: "Lỗi xóa bài viết" });
  }
});


  
// [AI] Tạo bài viết bằng Gemini
app.post("/api/ai/generate-post", async (req, res) => {
  const { topic, goal } = req.body;
  if (!topic) return res.status(400).json({ error: "Missing topic" });
  
  try {
    const systemInstruction = "Bạn là một AI chuyên viết content Facebook bán hàng và marketing xuất sắc. Dựa vào yêu cầu (topic) và mục tiêu (goal: sales, engagement, announcement), hãy viết ra 2 phiên bản content khác nhau để người dùng lựa chọn. Trả về đúng định dạng JSON: {\"options\": [\"Nội dung 1...\", \"Nội dung 2...\"]}";
    
    const response = await ai.models.generateContent({
      model: 'gemini-3.7-flash',
      contents: `Yêu cầu: "${topic}", Mục tiêu: ${goal}. Hãy viết 2 phiên bản bài đăng.`,
      config: { systemInstruction, temperature: 0.7 }
    });
    
    let rawText = response.text || "{}";
    rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(rawText);
    
    res.json({ success: true, options: parsed.options || [] });
  } catch (error) {
    console.error("AI Generation Error:", error);
    res.status(500).json({ error: "Lỗi kết nối Gemini API" });
  }
});

  if (process.env.NODE_ENV !== "production") {
    // In development, let Vite handle assets and HMR
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // In production, serve static files from dist
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    // SPA Fallback
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Start the server
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
