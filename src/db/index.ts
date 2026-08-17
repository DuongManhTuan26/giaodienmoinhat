import { Pool } from "pg";
import dotenv from "dotenv";

// Tải biến môi trường từ .env
dotenv.config();

// Khởi tạo Pool kết nối tới PostgreSQL (Neon.tech)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Hàm khởi tạo CSDL: Tự động tạo bảng nếu chưa có
export async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      -- Bảng Khách hàng
      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255),
        phone VARCHAR(50),
        address TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Bảng Đơn hàng
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER REFERENCES customers(id),
        product VARCHAR(255),
        quantity INTEGER,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Bảng Fanpage/Kênh kết nối
      CREATE TABLE IF NOT EXISTS pages (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255),
        platform VARCHAR(50),
        connected BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      -- Bảng Hội thoại/Tin nhắn (Tích hợp AI)
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER REFERENCES customers(id),
        page_id VARCHAR(50) REFERENCES pages(id),
        sender_type VARCHAR(20), -- 'customer', 'ai', 'human'
        content TEXT,
        is_handoff BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("✅ PostgreSQL (Neon) Tables initialized successfully.");
  } catch (error) {
    console.error("❌ Error initializing database tables:", error);
  } finally {
    client.release();
  }
}

export default pool;
