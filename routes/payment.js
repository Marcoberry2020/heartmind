 const express = require("express");
const axios = require("axios");
const User = require("../models/User");
const router = express.Router();

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

// ✅ VERIFY PAYMENT
router.post("/verify-payment", async (req, res) => {
  const { reference, userId } = req.body;

  if (!userId || !reference) {
    return res.status(400).json({
      success: false,
      message: "User ID and payment reference are required.",
    });
  }

  try {
    console.log("🔍 Verifying payment:", reference);

    // ✅ Paystack verification
    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        },
      }
    );

    const paystackData = response.data?.data;
    console.log("✅ Paystack verification:", paystackData);

    if (!paystackData || paystackData.status !== "success") {
      return res.status(400).json({
        success: false,
        message: "Payment verification failed or not successful.",
      });
    }

    // ✅ Find the user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    console.log("🔍 User before update:", {
      subscriptionExpiresAt: user.subscriptionExpiresAt,
      freeMessages: user.freeMessages,
    });

    // ✅ Calculate new expiry
    const now = new Date();
    const currentExpiry =
      user.subscriptionExpiresAt && user.subscriptionExpiresAt > now
        ? new Date(user.subscriptionExpiresAt)
        : now;

    const newExpiry = new Date(
      currentExpiry.getTime() + 30 * 24 * 60 * 60 * 1000 // +30 days
    );

    user.subscriptionExpiresAt = newExpiry;

    console.log("🔧 User before save:", {
      subscriptionExpiresAt: user.subscriptionExpiresAt,
    });

    await user.save();

    const updatedUser = await User.findById(userId);

    console.log("✅ User after save:", {
      subscriptionExpiresAt: updatedUser.subscriptionExpiresAt,
    });

    return res.json({
      success: true,
      message: "Payment successful, subscription activated",
      user: updatedUser.toObject(),
    });
  } catch (error) {
    console.error(
      "❌ Error verifying payment:",
      error.response?.data || error.message
    );

    return res.status(500).json({
      success: false,
      message: "Error verifying payment",
      error: error.message,
    });
  }
});

module.exports = router;
