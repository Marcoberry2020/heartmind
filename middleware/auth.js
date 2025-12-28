 const jwt = require('jsonwebtoken');

module.exports = async function (req, res, next) {
  try {
    // Accept token from Authorization header OR query (EventSource)
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1] || req.query.token;

    if (!token) return res.status(401).json({ message: 'No token provided' });

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
