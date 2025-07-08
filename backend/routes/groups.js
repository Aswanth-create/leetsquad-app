// routes/groups.js - Group management routes
const express = require('express');
const { getDatabase } = require('../database/init');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Generate random group code
function generateGroupCode() {
  return Math.random().toString(36).substr(2, 6).toUpperCase();
}

// Create group
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, description, isPrivate = false } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Group name is required' });
    }

    const db = getDatabase();
    let code;
    let attempts = 0;

    // Generate unique code
    do {
      code = generateGroupCode();
      const existing = await db.get('SELECT id FROM groups WHERE code = ?', [code]);
      if (!existing) break;
      attempts++;
    } while (attempts < 10);

    if (attempts >= 10) {
      return res.status(500).json({ error: 'Failed to generate unique group code' });
    }

    // Create group
    const result = await db.run(
      'INSERT INTO groups (name, code, creator_id, description, is_private) VALUES (?, ?, ?, ?, ?)',
      [name.trim(), code, req.userId, description || '', isPrivate]
    );

    // Add creator as admin member
    await db.run(
      'INSERT INTO group_members (group_id, user_id, is_admin) VALUES (?, ?, 1)',
      [result.lastID, req.userId]
    );

    const group = await db.get(
      `SELECT g.*, u.username as creator_username,
              COUNT(gm.user_id) as member_count
       FROM groups g
       JOIN users u ON g.creator_id = u.id
       LEFT JOIN group_members gm ON g.id = gm.group_id
       WHERE g.id = ?
       GROUP BY g.id`,
      [result.lastID]
    );

    res.status(201).json({
      message: 'Group created successfully',
      group: {
        id: group.id,
        name: group.name,
        code: group.code,
        description: group.description,
        creatorUsername: group.creator_username,
        memberCount: group.member_count,
        isPrivate: Boolean(group.is_private),
        createdAt: group.created_at
      }
    });

  } catch (error) {
    console.error('Create group error:', error);
    res.status(500).json({ error: 'Failed to create group' });
  }
});

// Join group by code
router.post('/join', authenticateToken, async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Group code is required' });
    }

    const db = getDatabase();
    
    // Find group
    const group = await db.get('SELECT * FROM groups WHERE code = ?', [code.toUpperCase()]);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Check if already a member
    const existingMember = await db.get(
      'SELECT * FROM group_members WHERE group_id = ? AND user_id = ?',
      [group.id, req.userId]
    );

    if (existingMember) {
      return res.status(400).json({ error: 'Already a member of this group' });
    }

    // Add user to group
    await db.run(
      'INSERT INTO group_members (group_id, user_id) VALUES (?, ?)',
      [group.id, req.userId]
    );

    res.json({ message: 'Successfully joined group', groupId: group.id });

  } catch (error) {
    console.error('Join group error:', error);
    res.status(500).json({ error: 'Failed to join group' });
  }
});

// Get user's groups
router.get('/', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase();
    
    const groups = await db.all(`
      SELECT g.*, u.username as creator_username,
             COUNT(gm2.user_id) as member_count,
             gm.is_admin,
             gm.joined_at
      FROM groups g
      JOIN group_members gm ON g.id = gm.group_id
      JOIN users u ON g.creator_id = u.id
      LEFT JOIN group_members gm2 ON g.id = gm2.group_id
      WHERE gm.user_id = ?
      GROUP BY g.id
      ORDER BY gm.joined_at DESC
    `, [req.userId]);

    const formattedGroups = groups.map(group => ({
      id: group.id,
      name: group.name,
      code: group.code,
      description: group.description,
      creatorUsername: group.creator_username,
      memberCount: group.member_count,
      isAdmin: Boolean(group.is_admin),
      isPrivate: Boolean(group.is_private),
      joinedAt: group.joined_at,
      createdAt: group.created_at
    }));

    res.json({ groups: formattedGroups });

  } catch (error) {
    console.error('Get groups error:', error);
    res.status(500).json({ error: 'Failed to get groups' });
  }
});

// Get group details with members and rankings
router.get('/:groupId', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params;
    const db = getDatabase();

    // Check if user is member of the group
    const membership = await db.get(
      'SELECT * FROM group_members WHERE group_id = ? AND user_id = ?',
      [groupId, req.userId]
    );

    if (!membership) {
      return res.status(403).json({ error: 'Not a member of this group' });
    }

    // Get group details
    const group = await db.get(`
      SELECT g.*, u.username as creator_username,
             COUNT(gm.user_id) as member_count
      FROM groups g
      JOIN users u ON g.creator_id = u.id
      LEFT JOIN group_members gm ON g.id = gm.group_id
      WHERE g.id = ?
      GROUP BY g.id
    `, [groupId]);

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Get members with their stats and rankings
    const members = await db.all(`
      SELECT u.id, u.username, u.leetcode_username, u.avatar_url,
             COALESCE(s.problems_solved, u.total_solved) as solved,
             COALESCE(s.acceptance_rate, u.success_rate) as success_rate,
             COALESCE(s.easy_solved, 0) as easy_solved,
             COALESCE(s.medium_solved, 0) as medium_solved,
             COALESCE(s.hard_solved, 0) as hard_solved,
             gm.joined_at, gm.is_admin
      FROM group_members gm
      JOIN users u ON gm.user_id = u.id
      LEFT JOIN user_stats s ON u.id = s.user_id
      WHERE gm.group_id = ?
      ORDER BY COALESCE(s.problems_solved, u.total_solved) DESC, 
               COALESCE(s.acceptance_rate, u.success_rate) DESC
    `, [groupId]);

    // Add rankings
    const membersWithRanking = members.map((member, index) => ({
      id: member.id,
      username: member.username,
      leetcodeUsername: member.leetcode_username,
      avatar: member.avatar_url,
      solved: member.solved || 0,
      successRate: Math.round((member.success_rate || 0) * 100) / 100,
      easySolved: member.easy_solved || 0,
      mediumSolved: member.medium_solved || 0,
      hardSolved: member.hard_solved || 0,
      rank: index + 1,
      isAdmin: Boolean(member.is_admin),
      joinedAt: member.joined_at
    }));

    res.json({
      group: {
        id: group.id,
        name: group.name,
        code: group.code,
        description: group.description,
        creatorUsername: group.creator_username,
        memberCount: group.member_count,
        isPrivate: Boolean(group.is_private),
        createdAt: group.created_at
      },
      members: membersWithRanking,
      userRank: membersWithRanking.find(m => m.id === req.userId)?.rank || null
    });

  } catch (error) {
    console.error('Get group details error:', error);
    res.status(500).json({ error: 'Failed to get group details' });
  }
});

// Leave group
router.delete('/:groupId/leave', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params;
    const db = getDatabase();

    const result = await db.run(
      'DELETE FROM group_members WHERE group_id = ? AND user_id = ?',
      [groupId, req.userId]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Not a member of this group' });
    }

    res.json({ message: 'Successfully left the group' });

  } catch (error) {
    console.error('Leave group error:', error);
    res.status(500).json({ error: 'Failed to leave group' });
  }
});

module.exports = router;