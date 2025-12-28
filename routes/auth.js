 const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const User = require('../models/User');

const router = express.Router();

// ---------- AUTH MIDDLEWARE ----------
const auth = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'No token provided' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

// ---------- SIGNUP ----------
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: 'Email and password required' });

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Email already used' });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      email,
      passwordHash,
      freeMessages: 5,
      freeStreams: 5,
      subscriptionExpiresAt: null,
      chatHistory: [],
    });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        freeMessages: user.freeMessages,
        freeStreams: user.freeStreams,
        subscriptionExpiresAt: user.subscriptionExpiresAt,
      },
      message: "You have 5 free text messages and 5 free streaming messages before subscribing."
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ---------- LOGIN ----------
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(400).json({ message: 'Invalid credentials' });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        freeMessages: user.freeMessages,
        freeStreams: user.freeStreams,
        subscriptionExpiresAt: user.subscriptionExpiresAt,
      },
      message: "You have 5 free text messages and 5 free streaming messages before subscribing."
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ---------- FORGOT PASSWORD ----------
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.json({ message: 'If email exists, reset link sent' });

    const token = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = crypto.createHash('sha256').update(token).digest('hex');
    user.resetPasswordExpires = Date.now() + 15 * 60 * 1000; // 15 mins
    await user.save();

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    const resetURL = `${process.env.FRONTEND_URL}/reset-password/${token}`;
    await transporter.sendMail({
      from: `"AI App" <${process.env.SMTP_USER}>`,
      to: user.email,
      subject: 'Password Reset',
      html: `<p>You requested a password reset.</p>
             <p>Click this <a href="${resetURL}">link</a> to reset your password. Expires in 15 minutes.</p>`
    });

    res.json({ message: 'Password reset link sent if email exists.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ---------- RESET PASSWORD ----------
router.post('/reset-password/:token', async (req, res) => {
  try {
    const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) return res.status(400).json({ message: 'Invalid or expired token' });

    const salt = await bcrypt.genSalt(10);
    user.passwordHash = await bcrypt.hash(req.body.password, salt);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ message: 'Password reset successful' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ---------- GET LOGGED-IN USER ----------
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-passwordHash');
    if (!user) return res.status(404).json({ message: 'User not found' });

    const now = new Date();
    const isSubscribed = user.subscriptionExpiresAt && new Date(user.subscriptionExpiresAt) > now;

    res.json({
      ...user.toObject(),
      subscriptionExpiresAt: user.subscriptionExpiresAt || null,
      freeMessages: user.freeMessages,
      freeStreams: user.freeStreams,
      canChat: isSubscribed || user.freeMessages > 0 || user.freeStreams > 0,
    });
  } catch (err) {
    console.error('Fetch user error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ---------- DECREMENT FREE TEXT MESSAGE ----------
router.post('/decrement-free-message', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.freeMessages > 0) {
      user.freeMessages -= 1;
      await user.save();
    }

    res.json({ success: true, freeMessages: user.freeMessages });
  } catch (err) {
    console.error('Decrement free message error:', err);
    res.status(500).json({ message: 'Could not update free messages' });
  }
});

// ---------- DECREMENT FREE STREAM MESSAGE ----------
router.post('/decrement-free-stream', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.freeStreams > 0) {
      user.freeStreams -= 1;
      await user.save();
    }

    res.json({ success: true, freeStreams: user.freeStreams });
  } catch (err) {
    console.error('Decrement free stream error:', err);
    res.status(500).json({ message: 'Could not update free streaming messages' });
  }
});

// ---------- CHAT MEMORY: GET ----------
router.get('/memory/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user.chatHistory || []);
  } catch (err) {
    console.error('Fetch memory error:', err);
    res.status(500).json({ message: 'Could not fetch memory' });
  }
});

// ---------- CHAT MEMORY: SAVE ----------
router.post('/memory/save', auth, async (req, res) => {
  try {
    const { userId, messages } = req.body;
    if (!userId || !messages) return res.status(400).json({ message: 'Missing userId or messages' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.chatHistory = messages.map(m => ({
      role: m.role,
      text: m.text,
      timestamp: new Date()
    }));

    await user.save();
    res.json({ success: true });
  } catch (err) {
    console.error('Save memory error:', err);
    res.status(500).json({ message: 'Could not save memory' });
  }
});

// ---------- CHAT MEMORY: PRUNE OLD ----------
router.post('/memory/prune', auth, async (req, res) => {
  try {
    const { userId, days = 7 } = req.body;
    if (!userId) return res.status(400).json({ message: 'Missing userId' });

    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    await User.updateOne(
      { _id: userId },
      { $pull: { chatHistory: { timestamp: { $lt: cutoff } } } }
    );

    res.json({ success: true, message: `Messages older than ${days} days deleted.` });
  } catch (err) {
    console.error('Prune memory error:', err);
    res.status(500).json({ message: 'Could not prune memory' });
  }
});

module.exports = router;
