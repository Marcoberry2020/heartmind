 require("dotenv").config();
const express = require("express");
const router = express.Router();
const axios = require("axios");
const { ElevenLabsClient } = require("@elevenlabs/elevenlabs-js");

const eleven = new ElevenLabsClient({
  apiKey: process.env.ELEVEN_LABS_API_KEY,
});

// Helper to send SSE events
function sendSSE(res, event, data) {
  if (event) res.write(`event: ${event}\n`);
  res.write(`data: ${data}\n\n`);
}

router.get("/stream", async (req, res) => {
  const { text, voiceId } = req.query;

  if (!text || !voiceId) {
    return res.status(400).send("Missing text or voiceId");
  }

  // Setup SSE
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.flushHeaders();

  try {
    // 1️⃣ AI text generation (Groq)
    const aiReq = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: "You are HeartMind, an empathetic companion." },
          { role: "user", content: text },
        ],
        temperature: 0.7,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const aiText = aiReq.data.choices[0].message.content;

    // 2️⃣ Stream tokenized text (simulated chunking)
    for (const chunk of aiText.match(/.{1,50}/g)) {
      sendSSE(res, "text", chunk);
    }

    // 3️⃣ ElevenLabs streaming (CHUNKED base64)
    const audioStream = await eleven.textToSpeech.convertAsStream(voiceId, {
      text: aiText,
      model_id: "eleven_multilingual_v2",
      optimize_streaming_latency: 4,
      stream: true,
    });

    for await (const chunk of audioStream) {
      const b64 = Buffer.from(chunk).toString("base64");
      sendSSE(res, "audio", b64);
    }

    // 4️⃣ Done
    sendSSE(res, "done", "[DONE]");
    res.end();
  } catch (err) {
    console.error("STREAM ERROR:", err);
    sendSSE(res, "error", "Streaming failed");
    res.end();
  }
});

module.exports = router;
