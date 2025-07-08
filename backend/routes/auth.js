// routes/auth.js - Authentication routes
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { getDatabase } = require('../database/init');
const leetcodeService = require('../services/leetcodeService');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Register/Login with LeetCode username
router.post('/login', async (req, res) => {
  try {
    const { leetcodeUsername } = req.body;

    if (!leetcodeUsername) {
      return res.status(400).json({ error: 'LeetCode username is required' });
    }

    // Validate LeetCode username
    const isValidUser = await leetcodeService.validateUsername(leetcodeUsername);
    if (!isValidUser) {
      return res.status(400).json({ error: 'Invalid LeetCode username' });
    }

    const db = getDatabase();
    
    // Check if user exists
    let user = await db.get(
      'SELECT * FROM users WHERE leetcode_username = ?',
      [leetcodeUsername]
    );

    if (!user) {
      // Create new user
      const profile = await leetcodeService.getUserProfile(leetcodeUsername);
      
      const result = await db.run(
        `INSERT INTO users (leetcode_username, username, avatar_url, total_solved, success_rate, last_scraped)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          leetcodeUsername,
          leetcodeUsername,
          profile.avatar,
          profile.totalSolved,
          profile.successRate,
          new Date().toISOString()
        ]
      );

      user = await db.get('SELECT * FROM users WHERE id = ?', [result.lastID]);
      
      // Create initial stats
      await db.run(
        `INSERT INTO user_stats (user_id, problems_solved, easy_solved, medium_solved, hard_solved, acceptance_rate, ranking)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          user.id,
          profile.totalSolved,
          profile.easySolved,
          profile.mediumSolved,
          profile.hardSolved,
          profile.successRate,
          profile.ranking
        ]
      );
    } else {
      // Update existing user's LeetCode data
      const profile = await leetcodeService.getUserProfile(leetcodeUsername);
      
      await db.run(
        `UPDATE users SET 
         avatar_url = ?, total_solved = ?, success_rate = ?, last_scraped = ?, updated_at = ?
         WHERE id = ?`,
        [
          profile.avatar,
          profile.totalSolved,
          profile.successRate,
          new Date().toISOString(),
          new Date().toISOString(),
          user.id
        ]
      );

      // Update stats
      await db.run(
        `UPDATE user_stats SET 
         problems_solved = ?, easy_solved = ?, medium_solved = ?, hard_solved = ?, 
         acceptance_rate = ?, ranking = ?, last_updated = ?
         WHERE user_id = ?`,
        [
          profile.totalSolved,
          profile.easySolved,
          profile.mediumSolved,
          profile.hardSolved,
          profile.successRate,
          profile.ranking,
          new Date().toISOString(),
          user.id
        ]
      );

      user = await db.get('SELECT * FROM users WHERE id = ?', [user.id]);
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        username: user.username,
        leetcodeUsername: user.leetcode_username,
        avatar: user.avatar_url,
        totalSolved: user.total_solved,
        successRate: user.success_rate
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase();
    const user = await db.get(
      `SELECT u.*, s.problems_solved, s.easy_solved, s.medium_solved, s.hard_solved, 
              s.acceptance_rate, s.ranking
       FROM users u
       LEFT JOIN user_stats s ON u.id = s.user_id
       WHERE u.id = ?`,
      [req.userId]
    );

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
      ranking: user.ranking
    });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user data' });
  }
});

// Refresh user's LeetCode data
router.post('/refresh', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase();
    const user = await db.get('SELECT * FROM users WHERE id = ?', [req.userId]);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const profile = await leetcodeService.getUserProfile(user.leetcode_username);
    
    await db.run(
      `UPDATE users SET 
       avatar_url = ?, total_solved = ?, success_rate = ?, last_scraped = ?, updated_at = ?
       WHERE id = ?`,
      [
        profile.avatar,
        profile.totalSolved,
        profile.successRate,
        new Date().toISOString(),
        new Date().toISOString(),
        user.id
      ]
    );

    await db.run(
      `UPDATE user_stats SET 
       problems_solved = ?, easy_solved = ?, medium_solved = ?, hard_solved = ?, 
       acceptance_rate = ?, ranking = ?, last_updated = ?
       WHERE user_id = ?`,
      [
        profile.totalSolved,
        profile.easySolved,
        profile.mediumSolved,
        profile.hardSolved,
        profile.successRate,
        profile.ranking,
        new Date().toISOString(),
        user.id
      ]
    );

    res.json({ message: 'Data refreshed successfully', profile });

  } catch (error) {
    console.error('Refresh error:', error);
    res.status(500).json({ error: 'Failed to refresh data' });
  }
});

module.exports = router;