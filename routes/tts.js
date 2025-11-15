 const express = require('express');
const axios = require('axios');
const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: "Text is required" });

    const VOICE_ID = "EXAVITQu4vr4xnSDxMaL";
    const API_KEY = (process.env.ELEVENLABS_API_KEY || "").trim();

    if (!API_KEY) {
      console.error("❌ ELEVENLABS_API_KEY is MISSING");
      return res.status(500).json({ error: "Missing ElevenLabs API key" });
    }

    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
      {
        text,
        voice_settings: {
          stability: 0.70,
          similarity_boost: 0.85
        }
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

    res.set("Content-Type", "audio/mpeg");
    res.send(response.data);

  } catch (err) {
    console.error("TTS ERROR FULL:", err.response?.data?.toString() || err.message);

    return res.status(500).json({
      error: "TTS failed",
      details: err.response?.data?.toString() || err.message
    });
  }
});

module.exports = router;
