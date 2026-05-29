import "dotenv/config";
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware for body parsing
  app.use(express.json({ limit: "15mb" }));

  // API endpoint for Gemini content generation
  app.post("/api/gemini/generate", async (req, res) => {
    try {
      const { prompt, schema, defaultGeminiModel, worldInfo } = req.body;

      // Access API key from server environment
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(400).json({ 
          error: "GEMINI_API_KEY ist auf dem Server nicht konfiguriert. Bitte trage den API Key in die Umgebungsvariablen oder die .env-Datei auf dem Server ein." 
        });
      }

      // Initialize the official @google/genai SDK on the server side
      const ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });

      let model = worldInfo?.llmModel || defaultGeminiModel || "gemini-3.5-flash";
      const provider = worldInfo?.llmProvider || "gemini";
      
      // Falls der Provider auf "gemini" eingestellt ist, aber das gespeicherte Modell ein Ollama-Modell ist (z.B. ein lokaler Name wie VladimirGav/...):
      if (provider === "gemini" && !model.startsWith("gemini-")) {
        console.warn(`Ungültiges Gemini-Modell "${model}" für Gemini-Provider erkannt. Fallback auf "gemini-3.5-flash" vorgenommen.`);
        model = "gemini-3.5-flash";
      }

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Gemini generateContent hat nach 60 Sekunden das Zeitlimit überschritten.")), 60000)
      );

      // Execute content generation with the model and schema
      const resPromise = ai.models.generateContent({
        model: model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: schema,
          temperature: 1,
        },
      });

      const geminiRes = await Promise.race([resPromise, timeoutPromise]) as any;

      // Extract usage token statistics
      const tokenStats = {
        promptTokens: geminiRes.usageMetadata?.promptTokenCount || 0,
        completionTokens: geminiRes.usageMetadata?.candidatesTokenCount || 0,
        totalTokens: geminiRes.usageMetadata?.totalTokenCount || 0,
      };

      res.json({
        json: JSON.parse(geminiRes.text || "{}"),
        tokenStats,
      });
    } catch (error: any) {
      console.error("Server-side Gemini proxy error:", error);
      res.status(500).json({ 
        error: error.message || "Fehler bei der Kommunikation mit der Gemini API auf dem Server." 
      });
    }
  });

  // Setup Vite or standard Static Assets Serving
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting server in development mode with Vite middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Serving static production assets from dist/ directory...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start server:", error);
});
