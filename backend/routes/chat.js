const express = require('express');
const { getDatabase } = require('../database/init');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get chat messages for a group
router.get('/:groupId', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    const db = getDatabase();

    // Check if user is a member of the group
    const membership = await db.get(
      'SELECT * FROM group_members WHERE group_id = ? AND user_id = ?',
      [groupId, req.userId]
    );

    if (!membership) {
      return res.status(403).json({ error: 'Not a member of this group' });
    }

    // Get messages
    const messages = await db.all(`
      SELECT cm.id, cm.message, cm.created_at,
             u.id as user_id, u.username, u.avatar_url
      FROM chat_messages cm
      JOIN users u ON cm.user_id = u.id
      WHERE cm.group_id = ?
      ORDER BY cm.created_at DESC
      LIMIT ? OFFSET ?
    `, [groupId, parseInt(limit), offset]);

    // Format & reverse to show oldest first
    const formattedMessages = messages.reverse().map(msg => ({
      id: msg.id,
      userId: msg.user_id,
      username: msg.username,
      avatar: msg.avatar_url,
      message: msg.message,
      timestamp: new Date(msg.created_at).toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit' 
      }),
      createdAt: msg.created_at
    }));

    res.json({ messages: formattedMessages });

  } catch (error) {
    console.error('Get chat messages error:', error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

// Send a message
router.post('/:groupId', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { message } = req.body;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message cannot be empty' });
    }

    const db = getDatabase();

    // Check if user is a member of the group
    const membership = await db.get(
      'SELECT * FROM group_members WHERE group_id = ? AND user_id = ?',
      [groupId, req.userId]
    );

    if (!membership) {
      return res.status(403).json({ error: 'Not a member of this group' });
    }

    // Save message
    const result = await db.run(
      'INSERT INTO chat_messages (group_id, user_id, message) VALUES (?, ?, ?)',
      [groupId, req.userId, message.trim()]
    );

    // Get saved message with user details
    const savedMessage = await db.get(`
      SELECT cm.id, cm.message, cm.created_at,
             u.id as user_id, u.username, u.avatar_url
      FROM chat_messages cm
      JOIN users u ON cm.user_id = u.id
      WHERE cm.id = ?
    `, [result.lastID]);

    const formattedMessage = {
      id: savedMessage.id,
      userId: savedMessage.user_id,
      username: savedMessage.username,
      avatar: savedMessage.avatar_url,
      message: savedMessage.message,
      timestamp: new Date(savedMessage.created_at).toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit' 
      }),
      createdAt: savedMessage.created_at
    };

    res.status(201).json({ 
      message: 'Message sent successfully',
      data: formattedMessage
    });

  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

module.exports = router;
