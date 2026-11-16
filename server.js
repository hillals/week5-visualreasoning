// Buket Tasarımcısı — bağımlılıksız Node sunucusu (Node 18+)
// Çalıştırma: GEMINI_API_KEY=... node server.js  →  http://localhost:3000
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const KEY = process.env.GEMINI_API_KEY;

const PROMPT = `Sen uzman bir çiçek tasarımcısısın. Bu buket fotoğrafını analiz et ve kullanıcının buketi kendisinin yeniden yapabilmesi için öğretici bir rehber hazırla.
Tüm metinler TÜRKÇE olsun. Çiçek türleri ve adetler TAHMİNİDİR; "confidence" alanını dürüstçe doldur.
YALNIZCA aşağıdaki şemaya uyan geçerli JSON döndür, başka hiçbir metin yazma:
{
  "is_bouquet": true,
  "title": "kısa, şiirsel buket adı",
  "summary": "1-2 cümlelik genel tanım",
  "style": "buket stili (ör. romantik bahçe, minimalist, kır, klasik yuvarlak)",
  "arrangement": "dizilimin kısa açıklaması (form, yükseklik, yoğunluk)",
  "palette": [{"name": "renk adı", "hex": "#RRGGBB"}],
  "flowers": [{"name": "çiçek adı", "role": "ana" | "dolgu", "quantity": "tahmini adet ör. 5-7", "color": "renk", "confidence": "yüksek" | "orta" | "düşük"}],
  "greenery": [{"name": "yeşillik/dekor adı", "quantity": "tahmini adet", "note": "kısa not"}],
  "decor": ["ambalaj, kurdele vb."],
  "steps": [
    {"phase": "Hazırlık", "title": "...", "detail": "...", "tip": "..."},
    {"phase": "Merkez", ...}, {"phase": "Destek çiçekleri", ...}, {"phase": "Yeşillik", ...}, {"phase": "Bağlama ve sarma", ...}
  ],
  "alternatives": [
    {"name": "alternatif adı", "description": "neyi değiştirir", "swaps": ["X yerine Y"], "palette": ["#RRGGBB", "#RRGGBB", "#RRGGBB", "#RRGGBB"], "shape": "yuvarlak" | "kaskad" | "doğal" }
  ]
}
"steps" 5-8 adım içersin ve her aşamayı kapsasın. "alternatives" tam 3 öğe içersin (ör. bütçe dostu, mevsimsel, farklı renk). Fotoğraf buket değilse is_bouquet=false yap ve summary'de nedenini açıkla.`;

async function analyze(base64, mediaType) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": KEY },
    body: JSON.stringify({
      contents: [{
        role: "user",
        parts: [
          { inline_data: { mime_type: mediaType, data: base64 } },
          { text: PROMPT },
        ],
      }],
      generationConfig: { responseMimeType: "application/json", maxOutputTokens: 8000 },
    }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || `API hatası (${r.status})`);
  const text = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");
  if (!text) throw new Error("Gemini boş yanıt döndürdü.");
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return JSON.parse(json);
}

const server = http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/api/analyze") {
    let body = "";
    req.on("data", c => { body += c; if (body.length > 15e6) req.destroy(); });
    req.on("end", async () => {
      res.setHeader("content-type", "application/json; charset=utf-8");
      try {
        if (!KEY) throw new Error("Sunucuda GEMINI_API_KEY tanımlı değil.");
        const { image, mediaType } = JSON.parse(body);
        if (!["image/jpeg", "image/png"].includes(mediaType)) throw new Error("Yalnızca JPG ve PNG desteklenir.");
        res.end(JSON.stringify(await analyze(image, mediaType)));
      } catch (e) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }
  const file = path.join(__dirname, "public", req.url === "/" ? "index.html" : path.normalize(req.url));
  if (!file.startsWith(path.join(__dirname, "public"))) { res.statusCode = 403; return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.statusCode = 404; return res.end("Bulunamadı"); }
    res.setHeader("content-type", file.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream");
    res.end(buf);
  });
});

server.listen(PORT, () => console.log(`🌸 Buket Tasarımcısı: http://localhost:${PORT}`));
