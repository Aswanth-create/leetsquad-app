const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const leetcodeService = require('../services/leetcodeService');

const router = express.Router();

// ✅ Validate LeetCode username
router.post('/validate', async (req, res) => {
  try {
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    const isValid = await leetcodeService.validateUsername(username);

    if (isValid) {
      const profile = await leetcodeService.getUserProfile(username);
      res.json({
        valid: true,
        profile: {
          username: profile.username,
          totalSolved: profile.totalSolved,
          successRate: profile.successRate,
          avatar: profile.avatar
        }
      });
    } else {
      res.json({ valid: false });
    }

  } catch (error) {
    console.error('Validate username error:', error);
    res.status(500).json({ error: 'Failed to validate username' });
  }
});

// ✅ Get full LeetCode profile data
router.get('/profile/:username', authenticateToken, async (req, res) => {
  try {
    const { username } = req.params;

    const profile = await leetcodeService.getUserProfile(username);
    const contestRanking = await leetcodeService.getUserContestRanking(username);

    res.json({
      profile,
      contestRanking
    });

  } catch (error) {
    console.error('Get LeetCode profile error:', error);
    res.status(500).json({ error: 'Failed to get LeetCode profile' });
  }
});

module.exports = router;
