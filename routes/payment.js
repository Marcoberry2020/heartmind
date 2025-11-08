 const express = require("express");
const axios = require("axios");
const User = require("../models/User");
const router = express.Router();

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

// ✅ 1. CREATE PAYSTACK SESSION (Start Payment)
router.post("/create-session", async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "User ID is required." });
    }

    // Load user
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    // Use stored email OR fallback
    const email = user.email
      ? user.email
      : `user${userId.slice(-6)}@example.com`;

    // Amount (₦750)
    const amount = 750 * 100;

    console.log("✅ Creating Paystack session for:", email);

    // Dynamic callback URL with userId for verification
    const callbackUrl = `https://heartmindai.netlify.app/payment-success?userId=${userId}`;

    // Initialize Paystack
    const init = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      {
        email,
        amount,
        callback_url: callbackUrl,
      },
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ Paystack session created:", init.data.data.reference);

    // Return checkout URL
    return res.json({
      url: init.data.data.authorization_url,
    });

  } catch (error) {
    console.error("❌ Paystack session error:", error.response?.data || error.message);
    return res.status(500).json({ error: "Failed to create payment session." });
  }
});

// ✅ 2. VERIFY PAYMENT AFTER PAYSTACK REDIRECT
router.post("/verify-payment", async (req, res) => {
  const { reference, userId } = req.body;

  if (!reference || !userId) {
    return res.status(400).json({
      success: false,
      message: "Reference and userId are required.",
    });
  }

  try {
    console.log("🔍 Verifying payment:", reference);

    // Verify with Paystack
    const verify = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        },
      }
    );

    const data = verify.data?.data;

    if (!data || data.status !== "success") {
      return res.status(400).json({
        success: false,
        message: "Payment verification failed or incomplete.",
      });
    }

    console.log("✅ Paystack verified:", data.amount);

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const now = new Date();
    const currentExpiry =
      user.subscriptionExpiresAt && user.subscriptionExpiresAt > now
        ? new Date(user.subscriptionExpiresAt)
        : now;

    // ✅ Add 30 days subscription
    const newExpiry = new Date(
      currentExpiry.getTime() + 30 * 24 * 60 * 60 * 1000
    );

    user.subscriptionExpiresAt = newExpiry;
    await user.save();

    console.log("✅ Subscription updated:", newExpiry);

    return res.json({
      success: true,
      message: "Payment verified, subscription activated.",
      user: user,
    });

  } catch (error) {
    console.error("❌ Payment verification error:", error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      message: "Verification failed.",
      error: error.message,
    });
  }
});

module.exports = router;
