 const express = require("express");
const { ElevenLabsClient } = require("@elevenlabs/elevenlabs-js");
const auth = require("../middleware/auth");
const router = express.Router();

const ELEVEN_API_KEY = process.env.ELEVEN_API_KEY;

router.post("/tts-stream", auth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: "Text required" });

    const elevenlabs = new ElevenLabsClient({ apiKey: ELEVEN_API_KEY });

    const audioStream = await elevenlabs.textToSpeech.convert(
      "21m00Tcm4TlvDq8ikWAM",
      { text, modelId: "eleven_multilingual_v2", outputFormat: "mp3_44100_128" }
    );

    // Stream directly to frontend
    res.setHeader("Content-Type", "audio/mpeg");
    audioStream.pipe(res);
  } catch (err) {
    console.error("Streaming TTS failed:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
