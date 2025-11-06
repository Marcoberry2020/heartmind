 const express = require("express");
const auth = require("../middleware/auth");
const User = require("../models/User");
const router = express.Router();
const axios = require("axios");
const crypto = require("crypto");

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

// 1️⃣ Create Paystack session
router.post("/create-session", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Ensure valid email fallback
    let email = (user.email || "").trim();
    if (!email || !email.includes("@")) {
      email = `user${user._id.toString()}@heartmind.app`;
    }

    const callbackUrl = `${process.env.CLIENT_URL.replace(/\/$/, "")}/payment-success`;

    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      {
        email,
        amount: 75000, // ₦750 in kobo
        currency: "NGN",
        metadata: { userId: user._id.toString() },
        callback_url: callbackUrl,
      },
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.data?.data?.authorization_url) {
      console.error("❌ Paystack did not return an authorization URL:", response.data);
      return res.status(500).json({ message: "Could not create checkout" });
    }

    return res.json({ url: response.data.data.authorization_url });
  } catch (err) {
    console.error("❌ Paystack Checkout Error:", err.response?.data || err);
    res.status(500).json({ message: "Could not create checkout" });
  }
});

// 2️⃣ Webhook to verify payment and activate subscription
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    try {
      const signature = req.headers["x-paystack-signature"];
      const hash = crypto
        .createHmac("sha512", PAYSTACK_SECRET)
        .update(req.body)
        .digest("hex");

      if (hash !== signature) {
        console.log("❌ Invalid webhook signature");
        return res.status(400).send("Invalid signature");
      }

      const event = JSON.parse(req.body);

      if (event.event === "charge.success") {
        const data = event.data;
        const userId = data.metadata?.userId;

        if (userId) {
          // Activate 1 month subscription and reset free messages
          await User.findByIdAndUpdate(userId, {
            subscriptionExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            freeMessages: 10, // Optional: reset free messages if you want
          });
          console.log(`✅ Subscription activated for user ${userId}`);
        }
      }

      return res.json({ received: true });
    } catch (err) {
      console.error("❌ Webhook Error:", err.message);
      return res.status(400).send("Webhook Error");
    }
  }
);

// 3️⃣ Verify subscription
router.post("/verify", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const now = new Date();

    // Check if subscription active
    if (user?.subscriptionExpiresAt && new Date(user.subscriptionExpiresAt) > now) {
      return res.json({ success: true });
    }

    // Subscription expired
    return res.json({ success: false });
  } catch (err) {
    console.error("❌ Subscription verify error:", err.message);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
