 const express = require("express");
const auth = require("../middleware/auth");
const User = require("../models/User");
const Stripe = require("stripe");
const router = express.Router();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ✅ Create Stripe Checkout Session
router.post("/create-session", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const CLIENT_URL = (process.env.CLIENT_URL || "http://localhost:3000").replace(/\/$/, "");

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: "HeartMind Subscription" },
            unit_amount: 999, // $9.99
          },
          quantity: 1,
        },
      ],
      success_url: `${CLIENT_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${CLIENT_URL}/dashboard`,
      customer_email: user.email || "noemail@heartmind.app",
      metadata: { userId: user._id.toString() },
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("❌ Stripe session creation failed:", err);
    res.status(500).json({ message: "Payment session creation failed" });
  }
});

// ✅ Stripe Webhook (updates subscription immediately)
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error("❌ Webhook signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const userId = session.metadata?.userId;

      if (userId) {
        try {
          await User.findByIdAndUpdate(userId, {
            subscriptionExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
          });
          console.log(`✅ Subscription activated for user ${userId}`);
        } catch (err) {
          console.error("❌ Error updating subscription:", err.message);
        }
      } else {
        console.warn("⚠️ No userId metadata found in Stripe session");
      }
    }

    res.json({ received: true });
  }
);

// ✅ Verify payment after returning from Stripe Checkout
router.post("/verify", auth, async (req, res) => {
  const { sessionId } = req.body;
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status === "paid") {
      const user = await User.findById(req.user.id);
      if (user) {
        user.subscriptionExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
        await user.save();
        console.log(`✅ Subscription verified for ${user.name || user._id}`);
        return res.json({ success: true });
      }
    }
    res.json({ success: false });
  } catch (err) {
    console.error("❌ Payment verification failed:", err);
    res.status(500).json({ success: false });
  }
});

module.exports = router;
