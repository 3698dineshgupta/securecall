const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { query } = require('../config/database');
const { authenticate, generateTokens } = require('../middleware/auth');

const router = express.Router();

// Validation rules
const signupValidation = [
  body('username')
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage('Username must be between 3 and 50 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers, and underscores'),
  body('email')
    .trim()
    .isEmail()
    .normalizeEmail()
    .withMessage('Invalid email address'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain uppercase, lowercase, and number'),
];

const loginValidation = [
  body('email').trim().isEmail().normalizeEmail(),
  body('password').notEmpty(),
];

// POST /api/auth/signup
router.post('/signup', signupValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, email, password } = req.body;

    // Check existing user
    const existing = await query(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [email, username]
    );

    if (existing.rows.length > 0) {
      const existing_user = await query('SELECT email FROM users WHERE email = $1', [email]);
      if (existing_user.rows.length > 0) {
        return res.status(409).json({ error: 'Email already registered', field: 'email' });
      }
      return res.status(409).json({ error: 'Username already taken', field: 'username' });
    }

    // Hash password
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
    const password_hash = await bcrypt.hash(password, saltRounds);

    // Create user
    const result = await query(
      `INSERT INTO users (username, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, username, email, created_at`,
      [username, email, password_hash]
    );

    const user = result.rows[0];
    const { accessToken, refreshToken } = generateTokens(user.id);

    // Store refresh token hash
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await query(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [user.id, tokenHash, expiresAt]
    );

    res.status(201).json({
      message: 'Account created successfully',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        created_at: user.created_at,
      },
      accessToken,
      refreshToken,
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// POST /api/auth/login
router.post('/login', loginValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    const result = await query(
      'SELECT id, username, email, password_hash, avatar_url FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      // Timing-safe: still hash to prevent timing attacks
      await bcrypt.hash(password, 12);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update online status
    await query(
      'UPDATE users SET is_online = TRUE, last_seen = NOW() WHERE id = $1',
      [user.id]
    );

    const { accessToken, refreshToken } = generateTokens(user.id);

    // Store refresh token hash
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Clean old refresh tokens (keep last 5)
    await query(
      `DELETE FROM refresh_tokens WHERE user_id = $1 AND id NOT IN (
        SELECT id FROM refresh_tokens WHERE user_id = $1 ORDER BY created_at DESC LIMIT 4
      )`,
      [user.id]
    );

    await query(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [user.id, tokenHash, expiresAt]
    );

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        avatar_url: user.avatar_url,
      },
      accessToken,
      refreshToken,
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token required' });
    }

    const jwt = require('jsonwebtoken');
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    } catch {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    if (decoded.type !== 'refresh') {
      return res.status(401).json({ error: 'Invalid token type' });
    }

    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const stored = await query(
      'SELECT id FROM refresh_tokens WHERE user_id = $1 AND token_hash = $2 AND expires_at > NOW()',
      [decoded.userId, tokenHash]
    );

    if (stored.rows.length === 0) {
      return res.status(401).json({ error: 'Refresh token not found or expired' });
    }

    // Rotate token
    await query('DELETE FROM refresh_tokens WHERE token_hash = $1', [tokenHash]);

    const { accessToken, refreshToken: newRefreshToken } = generateTokens(decoded.userId);
    const newTokenHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await query(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [decoded.userId, newTokenHash, expiresAt]
    );

    res.json({ accessToken, refreshToken: newRefreshToken });
  } catch (err) {
    console.error('Token refresh error:', err);
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

// POST /api/auth/logout
router.post('/logout', authenticate, async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      const crypto = require('crypto');
      const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      await query('DELETE FROM refresh_tokens WHERE token_hash = $1', [tokenHash]);
    }

    // Set offline
    await query(
      'UPDATE users SET is_online = FALSE, last_seen = NOW() WHERE id = $1',
      [req.userId]
    );

    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ error: 'Logout failed' });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
