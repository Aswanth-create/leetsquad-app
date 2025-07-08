const express = require('express');
const { getDatabase } = require('../database/init');
const { authenticateToken } = require('../middleware/auth');
const leetcodeService = require('../services/leetcodeService');

const router = express.Router();

// ✅ Get user profile by ID
router.get('/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const db = getDatabase();

    const user = await db.get(`
      SELECT u.*, s.problems_solved, s.easy_solved, s.medium_solved, s.hard_solved,
             s.acceptance_rate, s.ranking, s.reputation
      FROM users u
      LEFT JOIN user_stats s ON u.id = s.user_id
      WHERE u.id = ?
    `, [userId]);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      id: user.id,
      username: user.username,
      leetcodeUsername: user.leetcode_username,
      avatar: user.avatar_url,
      totalSolved: user.problems_solved || user.total_solved,
      successRate: user.acceptance_rate || user.success_rate,
      easySolved: user.easy_solved || 0,
      mediumSolved: user.medium_solved || 0,
      hardSolved: user.hard_solved || 0,
      ranking: user.ranking,
      reputation: user.reputation || 0,
      lastScraped: user.last_scraped,
      createdAt: user.created_at
    });

  } catch (error) {
    console.error('Get user profile error:', error);
    res.status(500).json({ error: 'Failed to get user profile' });
  }
});

// ✅ Update current user's username
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { username } = req.body;

    if (!username || username.trim().length === 0) {
      return res.status(400).json({ error: 'Username is required' });
    }

    const db = getDatabase();

    // Check for duplicate username
    const existingUser = await db.get(
      'SELECT id FROM users WHERE username = ? AND id != ?',
      [username.trim(), req.userId]
    );

    if (existingUser) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    await db.run(
      'UPDATE users SET username = ?, updated_at = ? WHERE id = ?',
      [username.trim(), new Date().toISOString(), req.userId]
    );

    res.json({ message: 'Profile updated successfully' });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

module.exports = router;
