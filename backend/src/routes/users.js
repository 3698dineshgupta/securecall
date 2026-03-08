const express = require('express');
const { query } = require('../config/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// GET /api/users/search?q=username
router.get('/search', authenticate, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }

    const result = await query(
      `SELECT id, username, email, avatar_url, is_online, last_seen
       FROM users
       WHERE (username ILIKE $1 OR email ILIKE $1)
       AND id != $2
       LIMIT 20`,
      [`%${q}%`, req.userId]
    );

    res.json({ users: result.rows });
  } catch (err) {
    console.error('User search error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

// GET /api/users/contacts
router.get('/contacts', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT u.id, u.username, u.email, u.avatar_url, u.is_online, u.last_seen,
              c.status, c.created_at as connected_at
       FROM contacts c
       JOIN users u ON u.id = c.contact_id
       WHERE c.user_id = $1 AND c.status = 'accepted'
       ORDER BY u.is_online DESC, u.username ASC`,
      [req.userId]
    );

    res.json({ contacts: result.rows });
  } catch (err) {
    console.error('Get contacts error:', err);
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
});

// POST /api/users/contacts
router.post('/contacts', authenticate, async (req, res) => {
  try {
    const { contactId } = req.body;

    if (!contactId) {
      return res.status(400).json({ error: 'Contact ID required' });
    }

    if (contactId === req.userId) {
      return res.status(400).json({ error: 'Cannot add yourself as contact' });
    }

    // Check if user exists
    const userExists = await query('SELECT id FROM users WHERE id = $1', [contactId]);
    if (userExists.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check existing contact
    const existing = await query(
      'SELECT id, status FROM contacts WHERE user_id = $1 AND contact_id = $2',
      [req.userId, contactId]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({
        error: 'Contact already exists',
        status: existing.rows[0].status
      });
    }

    // Create bidirectional contact (auto-accept for simplicity)
    await query(
      'INSERT INTO contacts (user_id, contact_id, status) VALUES ($1, $2, $3)',
      [req.userId, contactId, 'accepted']
    );
    await query(
      'INSERT INTO contacts (user_id, contact_id, status) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [contactId, req.userId, 'accepted']
    );

    res.status(201).json({ message: 'Contact added successfully' });
  } catch (err) {
    console.error('Add contact error:', err);
    res.status(500).json({ error: 'Failed to add contact' });
  }
});

// DELETE /api/users/contacts/:contactId
router.delete('/contacts/:contactId', authenticate, async (req, res) => {
  try {
    const { contactId } = req.params;

    await query(
      'DELETE FROM contacts WHERE (user_id = $1 AND contact_id = $2) OR (user_id = $2 AND contact_id = $1)',
      [req.userId, contactId]
    );

    res.json({ message: 'Contact removed' });
  } catch (err) {
    console.error('Remove contact error:', err);
    res.status(500).json({ error: 'Failed to remove contact' });
  }
});

// GET /api/users/:id/profile
router.get('/:id/profile', authenticate, async (req, res) => {
  try {
    const result = await query(
      'SELECT id, username, email, avatar_url, is_online, last_seen, created_at FROM users WHERE id = $1',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

module.exports = router;
