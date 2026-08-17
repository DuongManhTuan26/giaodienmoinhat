const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf-8');

const geminiApi = `
// [AI] Tạo bài viết bằng Gemini
app.post("/api/ai/generate-post", async (req, res) => {
  const { topic, goal } = req.body;
  if (!topic) return res.status(400).json({ error: "Missing topic" });
  
  try {
    const systemInstruction = "Bạn là một AI chuyên viết content Facebook bán hàng và marketing xuất sắc. Dựa vào yêu cầu (topic) và mục tiêu (goal: sales, engagement, announcement), hãy viết ra 2 phiên bản content khác nhau để người dùng lựa chọn. Trả về đúng định dạng JSON: {\\"options\\": [\\"Nội dung 1...\\", \\"Nội dung 2...\\"]}";
    
    const response = await ai.models.generateContent({
      model: 'gemini-3.7-flash',
      contents: \`Yêu cầu: "\${topic}", Mục tiêu: \${goal}. Hãy viết 2 phiên bản bài đăng.\`,
      config: { systemInstruction, temperature: 0.7 }
    });
    
    let rawText = response.text || "{}";
    rawText = rawText.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '').trim();
    const parsed = JSON.parse(rawText);
    
    res.json({ success: true, options: parsed.options || [] });
  } catch (error) {
    console.error("AI Generation Error:", error);
    res.status(500).json({ error: "Lỗi kết nối Gemini API" });
  }
});
`;

content = content.replace(
  'if (process.env.NODE_ENV !== "production") {',
  geminiApi + '\n  if (process.env.NODE_ENV !== "production") {'
);

fs.writeFileSync('server.ts', content);
console.log('Patched server.ts with Gemini endpoint');
