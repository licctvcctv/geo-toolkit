import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import sqlite3 from "sqlite3";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import {
  calculateStructuralFormula,
  calculateChloriteTemperature,
  calculateBiotiteTemperature,
  removeOutliers,
  identifyMineral,
  classifyChlorite,
  classifyBiotite,
  classifyMuscovite
} from "./src/utils/geo-calculations";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-for-jwt";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";

type AiChatMessage = {
  role: "assistant" | "system" | "user";
  content: string;
};

let aiClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI | null {
  if (!GEMINI_API_KEY) return null;
  if (!aiClient) {
    aiClient = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  }
  return aiClient;
}

function streamSseChunk(res: express.Response, content: string) {
  res.write(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
}

function endSse(res: express.Response) {
  res.write("data: [DONE]\n\n");
  res.end();
}

function buildFallbackAiReply(messages: AiChatMessage[], reason = "missing-key") {
  const lastUserMessage = [...messages].reverse().find((message) => message.role === "user")?.content?.trim();
  const intro = reason === "missing-key"
    ? "AI 功能已经接入页面，但当前服务器未配置模型密钥（`GEMINI_API_KEY` 或 `GOOGLE_API_KEY`）。"
    : "AI 服务暂时不可用，系统已返回降级提示以避免页面空白或一直加载。";

  return [
    intro,
    lastUserMessage ? `最近一次提问：${lastUserMessage}` : "当前请求中没有读取到有效提问内容。",
    "如果你需要在答辩现场演示真实问答，请在启动服务前配置好 Gemini API Key。",
  ].join("\n\n");
}

function buildGeminiContents(messages: AiChatMessage[]) {
  const systemInstruction = messages
    .filter((message) => message.role === "system" && message.content.trim())
    .map((message) => message.content.trim())
    .join("\n\n");

  const contents = messages
    .filter((message) => message.role !== "system" && message.content.trim())
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content.trim() }],
    }));

  return { contents, systemInstruction };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use(cookieParser());
  app.use(cors());

  // Initialize SQLite database
  const db = new sqlite3.Database('./geotools.db', (err) => {
    if (err) {
      console.error("Error opening database", err.message);
    } else {
      console.log("Connected to the SQLite database.");
      db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT
      )`);
    }
  });

  // API Routes
  app.post("/api/register", (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "用户名和密码不能为空" });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    db.run("INSERT INTO users (username, password) VALUES (?, ?)", [username, hashedPassword], function(err) {
      if (err) {
        return res.status(400).json({ error: "用户名已存在" });
      }
      res.json({ message: "注册成功" });
    });
  });

  app.post("/api/login", (req, res) => {
    const { username, password } = req.body;
    db.get("SELECT * FROM users WHERE username = ?", [username], (err, user: any) => {
      if (err || !user) {
        return res.status(400).json({ error: "用户名或密码错误" });
      }

      const isValid = bcrypt.compareSync(password, user.password);
      if (!isValid) {
        return res.status(400).json({ error: "用户名或密码错误" });
      }

      const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
      res.cookie("token", token, { httpOnly: true, secure: process.env.NODE_ENV === "production" });
      res.json({ message: "登录成功", user: { id: user.id, username: user.username }, token });
    });
  });

  app.post("/api/logout", (req, res) => {
    res.clearCookie("token");
    res.json({ message: "已登出" });
  });

  app.get("/api/me", (req, res) => {
    const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: "未登录" });
    }
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      res.json({ user: decoded });
    } catch (err) {
      res.status(401).json({ error: "登录已过期" });
    }
  });

  app.post("/api/ai/chat", async (req, res) => {
    const { messages = [], max_tokens: maxTokens = 1024, temperature = 0.7 } = req.body ?? {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages 不能为空" });
    }

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const typedMessages = messages
      .filter((message: any) => message && typeof message.content === "string" && typeof message.role === "string")
      .map((message: any) => ({
        role: message.role,
        content: message.content,
      })) as AiChatMessage[];

    const client = getAiClient();
    if (!client) {
      streamSseChunk(res, buildFallbackAiReply(typedMessages));
      return endSse(res);
    }

    try {
      const { contents, systemInstruction } = buildGeminiContents(typedMessages);
      if (contents.length === 0) {
        streamSseChunk(res, "请先输入一个明确的地质学问题。");
        return endSse(res);
      }

      const stream = await client.models.generateContentStream({
        model: GEMINI_MODEL,
        contents,
        config: {
          systemInstruction: systemInstruction || undefined,
          maxOutputTokens: Math.max(256, Math.min(Number(maxTokens) || 1024, 4096)),
          temperature: typeof temperature === "number" ? temperature : 0.7,
        },
      });

      let hasContent = false;
      for await (const chunk of stream) {
        if (chunk.text) {
          hasContent = true;
          streamSseChunk(res, chunk.text);
        }
      }

      if (!hasContent) {
        streamSseChunk(res, "抱歉，当前没有生成有效回答，请稍后重试。");
      }

      return endSse(res);
    } catch (error) {
      console.error("AI chat error", error);
      streamSseChunk(res, buildFallbackAiReply(typedMessages, "runtime-error"));
      return endSse(res);
    }
  });

  // Geochemical APIs
  app.post("/api/thermometer/calculate", (req, res) => {
    const { data, method = "All", removeOutliersFlag = true } = req.body;
    
    try {
      // 1. Calculate structural formula (target 28 O for chlorite)
      let calculatedData = data.map((row: any) => {
        const formula = calculateStructuralFormula(row, 28);
        if (!formula) return null;
        
        const temps = calculateChloriteTemperature(formula);
        const temp = method === 'All' ? temps : (temps as any)[method];
        
        return { ...row, ...formula, Temperature: temp, Temps: temps };
      }).filter(Boolean); // Remove invalid rows

      const originalCount = data.length;
      const validCount = calculatedData.length;
      
      // 2. Remove outliers based on selected method temp
      if (removeOutliersFlag && calculatedData.length > 3) {
        if (method === 'All') {
          calculatedData = removeOutliers(calculatedData.map((d: any) => ({...d, _tempForFilter: d.Temps.Cathelineau})), '_tempForFilter').map((d: any) => {
            const { _tempForFilter, ...rest } = d;
            return rest;
          });
        } else {
          calculatedData = removeOutliers(calculatedData, 'Temperature');
        }
      }
      
      const cleanedCount = calculatedData.length;

      res.json({ 
        results: calculatedData,
        summary: {
          original: originalCount,
          valid: validCount,
          cleaned: cleanedCount,
          outliersRemoved: validCount - cleanedCount
        }
      });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: "计算失败，请检查数据格式" });
    }
  });

  // Biotite thermometer API
  app.post("/api/thermometer/biotite", (req, res) => {
    const { data, removeOutliersFlag = true } = req.body;

    try {
      let calculatedData = data.map((row: any) => {
        const formula = calculateStructuralFormula(row, 22);
        if (!formula) return null;

        const temps = calculateBiotiteTemperature(formula);
        const classification = classifyBiotite(formula);

        return { ...row, ...formula, Temps: temps, Classification: classification };
      }).filter(Boolean);

      const originalCount = data.length;
      const validCount = calculatedData.length;

      if (removeOutliersFlag && calculatedData.length > 3) {
        calculatedData = removeOutliers(
          calculatedData.map((d: any) => ({ ...d, _tempForFilter: d.Temps.Henry })),
          '_tempForFilter'
        ).map((d: any) => {
          const { _tempForFilter, ...rest } = d;
          return rest;
        });
      }

      const cleanedCount = calculatedData.length;

      res.json({
        results: calculatedData,
        summary: {
          original: originalCount,
          valid: validCount,
          cleaned: cleanedCount,
          outliersRemoved: validCount - cleanedCount
        }
      });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: "计算失败，请检查数据格式" });
    }
  });

  app.post("/api/mineral/identify", (req, res) => {
    const { data } = req.body;
    try {
      const results = data.map((row: any) => {
        const formula22 = calculateStructuralFormula(row, 22);
        const formula28 = calculateStructuralFormula(row, 28);
        if (!formula22 || !formula28) return { ...row, error: 'Invalid data' };

        const type = identifyMineral(formula22);

        let classification = '';
        let finalFormula = formula22;
        let temps: any = null;

        if (type === 'Chlorite') {
          finalFormula = formula28;
          classification = classifyChlorite(formula28);
          temps = { type: 'chlorite', values: calculateChloriteTemperature(formula28) };
        } else if (type === 'Biotite') {
          finalFormula = formula22;
          classification = classifyBiotite(formula22);
          temps = { type: 'biotite', values: calculateBiotiteTemperature(formula22) };
        } else if (type === 'Muscovite') {
          finalFormula = formula22;
          classification = classifyMuscovite(formula22);
        }

        return { ...row, Type: type, Classification: classification, Formula: finalFormula, Temps: temps };
      });
      res.json({ results });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: "识别失败" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
