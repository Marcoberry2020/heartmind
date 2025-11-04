 const jwt = require('jsonwebtoken');

module.exports = function (req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ message: 'No token provided' });

  const token = auth.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Token missing' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    // ✅ Set both userId and full payload for convenience
    req.userId = payload.id || payload._id; // ensure it matches what you stored in JWT
    req.user = payload;
    next();
  } catch (err) {
    console.error('JWT verification failed:', err.message);
    res.status(401).json({ message: 'Invalid or expired token' });
  }
};
