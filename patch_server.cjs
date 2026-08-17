const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf-8');

const postsApi = `
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

`;

content = content.replace(
  'if (process.env.NODE_ENV !== "production") {',
  postsApi + '\n  if (process.env.NODE_ENV !== "production") {'
);

fs.writeFileSync('server.ts', content);
console.log('Patched server.ts');
