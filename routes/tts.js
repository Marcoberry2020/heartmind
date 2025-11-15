 const express = require('express');
const axios = require('axios');
const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: "Text is required" });

    const VOICE_ID = "EXAVITQu4vr4xnSDxMaL"; // Free natural voice
    const API_KEY = (process.env.ELEVENLABS_API_KEY || "").trim();

    if (!API_KEY) {
      return res.status(500).json({ error: "Missing ElevenLabs API key" });
    }

    const ttsResponse = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
      { 
        text, 
        voice_settings: { stability: 0.7, similarity_boost: 0.85 } 
      },
      { 
        headers: { 
          "xi-api-key": API_KEY, 
          "Content-Type": "application/json", 
          "Accept": "audio/mpeg" 
        },
        responseType: "arraybuffer" 
      }
    );

    const contentType = ttsResponse.headers["content-type"];

    // ⚠️ Handle JSON error responses from ElevenLabs
    if (contentType?.includes("application/json")) {
      const errorData = Buffer.from(ttsResponse.data).toString("utf-8");
      console.error("ElevenLabs API error:", errorData);
      return res.status(500).json({ error: "TTS failed", details: errorData });
    }

    // ✅ Convert valid audio to Base64 for frontend
    const audioBase64 = Buffer.from(ttsResponse.data).toString("base64");

    res.json({ 
      success: true, 
      audio: audioBase64, 
      format: "audio/mpeg", 
      text 
    });

  } catch (err) {
    console.error("TTS ERROR FULL:", err.response?.data || err.message);
    const details = err.response?.data 
      ? Buffer.isBuffer(err.response.data) 
        ? Buffer.from(err.response.data).toString("utf-8") 
        : err.response.data
      : err.message;

    res.status(500).json({ error: "TTS request failed", details });
  }
});

module.exports = router;
