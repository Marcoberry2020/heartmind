 // ai-chat.js
require("dotenv").config();
const express = require("express");
const axios = require("axios");
const { ElevenLabsClient } = require("@elevenlabs/elevenlabs-js");
const { Readable } = require("stream");
const User = require("../models/User"); // adjust path if needed

const router = express.Router();

// ElevenLabs client
const elevenlabs = new ElevenLabsClient({ apiKey: process.env.ELEVEN_LABS_API_KEY });

// Helper: send SSE events
function sendSSE(res, event, data) {
  if (event) res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// System prompt with therapy rules
const SYSTEM_PROMPT = `
You are HeartMind — a warm, deeply caring emotional support companion.
RULES:
- Sound human, soft, emotional, caring, and soothing.
- Validate the user's feelings before giving advice.
- Use the user's name naturally.
- Keep responses short: 1–3 sentences. Use 4 only if very emotional.
- Switch between English and Nigerian Pidgin based on user's input.
- Be comforting, reassuring, and emotionally present.
- Help with heartbreak, loneliness, anxiety, self-worth.
- Use reflection questions or gentle grounding when needed.
- No long lists. Max one tiny list if absolutely necessary.
- Never judge or minimize feelings.
- Never mention you are an AI or model.
`;

// --------------------- TEXT CHAT ---------------------
router.post("/text", async (req, res) => {
  try {
    const { text, token, userId } = req.body;
    if (!text) return res.status(400).send("Missing text");

    // Fetch user memory
    let memory = [];
    if (userId) {
      const user = await User.findById(userId);
      if (user?.chatHistory) memory = user.chatHistory;
    }

    // Add latest user message
    const messagesForAI = [
      { role: "system", content: SYSTEM_PROMPT },
      ...memory.map(m => ({ role: m.role, content: m.text })),
      { role: "user", content: text }
    ];

    const payload = {
      model: "llama-3.3-70b-versatile",
      messages: messagesForAI,
      max_tokens: 500,
      temperature: 0.7
    };

    const aiRes = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      payload,
      {
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const aiText = aiRes.data.choices[0].message.content;

    // Save updated memory
    if (userId) {
      await User.findByIdAndUpdate(userId, {
        chatHistory: [
          ...memory,
          { role: "user", text },
          { role: "assistant", text: aiText }
        ]
      });
    }

    res.json({ text: aiText });
  } catch (err) {
    console.error("AI text error:", err?.response?.data || err);
    res.status(500).send("AI processing failed");
  }
});

// --------------------- STREAM CHAT + VOICE ---------------------
router.get("/stream", async (req, res) => {
  try {
    const { text, voiceId, userId } = req.query;
    if (!text || !voiceId) return res.status(400).send("Missing text or voiceId");

    // SSE headers
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.flushHeaders();

    // Fetch memory
    let memory = [];
    if (userId) {
      const user = await User.findById(userId);
      if (user?.chatHistory) memory = user.chatHistory;
    }

    const messagesForAI = [
      { role: "system", content: SYSTEM_PROMPT },
      ...memory.map(m => ({ role: m.role, content: m.text })),
      { role: "user", content: text }
    ];

    const payload = {
      model: "llama-3.3-70b-versatile",
      messages: messagesForAI,
      max_tokens: 500,
      temperature: 0.7,
    };

    const aiRes = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      payload,
      {
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const aiText = aiRes.data.choices[0].message.content;

    // Send AI text in chunks
    const textChunks = aiText.match(/.{1,60}/g) || [aiText];
    for (const chunk of textChunks) sendSSE(res, "text", chunk);

    // Stream ElevenLabs audio
    const audioStream = await elevenlabs.textToSpeech.stream(voiceId, {
      text: aiText,
      modelId: "eleven_multilingual_v2",
    });

    const nodeStream = Readable.from(audioStream);
    const audioChunks = [];
    for await (const chunk of nodeStream) {
      audioChunks.push(Array.from(chunk));
      sendSSE(res, "audio", Array.from(chunk));
    }

    sendSSE(res, "done", "[DONE]");
    res.end();

    // Save memory after streaming
    if (userId) {
      await User.findByIdAndUpdate(userId, {
        chatHistory: [
          ...memory,
          { role: "user", text },
          { role: "assistant", text: aiText }
        ]
      });
    }

  } catch (err) {
    console.error("STREAM ROUTE ERROR:", err?.response?.data || err);
    sendSSE(res, "error", "AI processing failed");
    res.end();
  }
});

// --------------------- MEMORY ENDPOINTS ---------------------
// Get memory
router.get("/memory/:userId", async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.json([]);
    res.json(user.chatHistory || []);
  } catch (err) {
    console.error(err);
    res.status(500).send([]);
  }
});

// Save memory
router.post("/memory/save", async (req, res) => {
  try {
    const { userId, messages } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).send("User not found");

    user.chatHistory = messages;
    await user.save();
    res.send("Memory saved");
  } catch (err) {
    console.error(err);
    res.status(500).send("Failed to save memory");
  }
});

module.exports = router;
  