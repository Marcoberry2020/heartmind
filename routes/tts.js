 const express = require("express");
const axios = require("axios");
const router = express.Router();

const VOICE_ID = "JBFqnCBsd6RMkjVDRZzb"; // your ElevenLabs voice
const ELEVEN_KEY = process.env.ELEVENLABS_API_KEY?.trim();

if (!ELEVEN_KEY) {
  console.error("⚠️ Missing ElevenLabs API key in environment variables!");
}

// Optional: simple in-memory cache
const cache = new Map();

// POST /api/tts
router.post("/", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: "Text is required" });
    }

    // Check cache first
    if (cache.has(text)) {
      return res.json({ audio: cache.get(text) });
    }

    const ttsRes = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
      {
        text,
        model_id: "cgSgspJ2msm6clMCkdW9",
        voice_settings: { stability: 0.7, similarity_boost: 0.85 }
      },
      {
        headers: {
          "xi-api-key": ELEVEN_KEY,
          "Content-Type": "application/json",
          Accept: "audio/mpeg"
        },
        responseType: "arraybuffer"
      }
    );

    // Check if response is actually audio
    if (ttsRes.headers["content-type"]?.includes("audio")) {
      const audioBase64 = Buffer.from(ttsRes.data).toString("base64");
      cache.set(text, audioBase64);
      return res.json({ audio: audioBase64 });
    } else {
      // If ElevenLabs returned JSON error instead of audio
      let errorData = {};
      try {
        errorData = JSON.parse(Buffer.from(ttsRes.data).toString("utf8"));
      } catch (parseErr) {
        errorData = { message: "Unknown TTS error", raw: ttsRes.data.toString() };
      }
      console.error("TTS API returned error:", errorData);
      return res.status(500).json({ error: "TTS failed", details: errorData });
    }
  } catch (err) {
    // Handle axios error
    let details = err.response?.data;
    if (details && Buffer.isBuffer(details)) {
      try {
        details = JSON.parse(details.toString("utf8"));
      } catch {}
    }
    console.error("TTS ERROR:", details || err.message);
    res.status(500).json({ error: "TTS failed", details: details || err.message });
  }
});

module.exports = router;
