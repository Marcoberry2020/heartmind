 const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
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
    const user = await User.create({ name, email, passwordHash });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email },
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
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ---------- GET LOGGED-IN USER (FIXED SUBSCRIPTION CHECK) ----------
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-passwordHash');
    if (!user) return res.status(404).json({ message: 'User not found' });

    const now = new Date();
    const subscriptionActive = user.subscription?.active && user.subscription.expiresAt > now;

    res.json({
      ...user.toObject(),
      subscription: {
        active: subscriptionActive,
        expiresAt: user.subscription?.expiresAt,
      },
    });
  } catch (err) {
    console.error('Fetch user error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
