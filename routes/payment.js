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

    // Use a unique fallback email if user.email is missing
    const email = user.email?.trim() || `user-${user._id}@heartmind.app`;

    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      {
        email,
        amount: 75000, // ₦750 in kobo
        currency: "NGN",
        metadata: { userId: user._id.toString() },
        callback_url: `${process.env.CLIENT_URL}/payment-success`,
      },
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET}`,
          "Content-Type": "application/json",
        },
      }
    );

    return res.json({ url: response.data.data.authorization_url });
  } catch (err) {
    console.error("❌ Paystack Checkout Error:", err.response?.data || err);
    res.status(500).json({ message: "Could not create checkout" });
  }
});

// 2️⃣ Webhook to verify payment
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
          // Give user 30 days subscription
          await User.findByIdAndUpdate(userId, {
            subscriptionExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          });
          console.log(`✅ Subscription activated for ${userId}`);
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
  const user = await User.findById(req.user.id);
  if (user?.subscriptionExpiresAt && new Date(user.subscriptionExpiresAt) > new Date()) {
    return res.json({ success: true });
  }
  return res.json({ success: false });
});

module.exports = router;
