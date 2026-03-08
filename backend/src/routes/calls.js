const express = require('express');
const { query } = require('../config/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// GET /api/calls/history
router.get('/history', authenticate, async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    const result = await query(
      `SELECT
        ch.id, ch.call_type, ch.status, ch.started_at, ch.ended_at, ch.duration_seconds,
        ch.created_at,
        CASE WHEN ch.caller_id = $1 THEN 'outgoing' ELSE 'incoming' END as direction,
        CASE WHEN ch.caller_id = $1 THEN callee.id ELSE caller.id END as other_user_id,
        CASE WHEN ch.caller_id = $1 THEN callee.username ELSE caller.username END as other_username,
        CASE WHEN ch.caller_id = $1 THEN callee.avatar_url ELSE caller.avatar_url END as other_avatar
       FROM call_history ch
       JOIN users caller ON caller.id = ch.caller_id
       JOIN users callee ON callee.id = ch.callee_id
       WHERE ch.caller_id = $1 OR ch.callee_id = $1
       ORDER BY ch.created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.userId, parseInt(limit), parseInt(offset)]
    );

    const countResult = await query(
      'SELECT COUNT(*) FROM call_history WHERE caller_id = $1 OR callee_id = $1',
      [req.userId]
    );

    res.json({
      calls: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (err) {
    console.error('Get call history error:', err);
    res.status(500).json({ error: 'Failed to fetch call history' });
  }
});

// POST /api/calls/record
router.post('/record', authenticate, async (req, res) => {
  try {
    const { calleeId, callType, status, startedAt, endedAt, durationSeconds } = req.body;

    if (!calleeId || !callType || !status) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await query(
      `INSERT INTO call_history (caller_id, callee_id, call_type, status, started_at, ended_at, duration_seconds)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [req.userId, calleeId, callType, status, startedAt || null, endedAt || null, durationSeconds || 0]
    );

    res.status(201).json({ callId: result.rows[0].id });
  } catch (err) {
    console.error('Record call error:', err);
    res.status(500).json({ error: 'Failed to record call' });
  }
});

module.exports = router;
