 const express = require('express');
const router = express.Router();
const axios = require('axios');
const User = require('../models/User');
const auth = require('../middleware/auth');

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

// ✅ Create Paystack inline session
router.post('/create-inline', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const amount = 750 * 100; // ₦750 in kobo

    // Ensure valid email for Paystack
    const email = user.email?.trim() || `user${user._id.toString()}@heartmind.ai`;
    if (!email.includes('@')) {
      return res.status(400).json({ error: 'Invalid email for Paystack payment' });
    }

    // Initialize Paystack transaction
    const response = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email,
        amount,
      },
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const { reference } = response.data.data;

    // Save reference in user document
    user.paystackReference = reference;
    await user.save();

    // Send data needed for Paystack inline popup
    res.json({
      key: process.env.PAYSTACK_PUBLIC_KEY,
      email,
      amount,
      reference,
    });
  } catch (err) {
    console.error('Error creating payment:', err.response?.data || err);
    res.status(500).json({ error: 'Could not initiate payment' });
  }
});

// ✅ Verify payment
router.get('/verify/:reference', auth, async (req, res) => {
  try {
    const { reference } = req.params;
    const user = await User.findById(req.user.id);

    if (!user || user.paystackReference !== reference) {
      return res.status(400).json({ error: 'Invalid reference' });
    }

    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
      }
    );

    const { status } = response.data.data;

    if (status === 'success') {
      const now = new Date();
      if (user.subscriptionExpiresAt && user.subscriptionExpiresAt > now) {
        // Extend existing subscription
        user.subscriptionExpiresAt.setMonth(user.subscriptionExpiresAt.getMonth() + 1);
      } else {
        // Start new subscription
        user.subscriptionExpiresAt = new Date(now.setMonth(now.getMonth() + 1));
      }

      user.paystackReference = null;
      await user.save();

      return res.json({ success: true, message: 'Subscription activated!' });
    }

    res.status(400).json({ error: 'Payment verification failed' });
  } catch (err) {
    console.error('Payment verification error:', err.response?.data || err);
    res.status(500).json({ error: 'Verification failed' });
  }
});

module.exports = router;
