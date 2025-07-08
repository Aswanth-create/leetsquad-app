const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createServer } = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const groupRoutes = require('./routes/groups');
const chatRoutes = require('./routes/chat');
const leetcodeRoutes = require('./routes/leetcode');
const { initializeDatabase, getDatabase } = require('./database/init');
const { authenticateSocket } = require('./middleware/auth');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(helmet());

app.use(cors({
  origin: ['http://localhost:5173'],
  credentials: true
}));




const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/leetcode', leetcodeRoutes);

// Socket.io for real-time chat
io.use(authenticateSocket);

io.on('connection', (socket) => {
  console.log(`User ${socket.userId} connected`);

  socket.on('join-group', (groupId) => {
    socket.join(`group-${groupId}`);
    console.log(`User ${socket.userId} joined group ${groupId}`);
  });

  socket.on('leave-group', (groupId) => {
    socket.leave(`group-${groupId}`);
    console.log(`User ${socket.userId} left group ${groupId}`);
  });

socket.on('send-message', async (data) => {
  console.log('Backend received send-message:', data); // Log received data
  try {
    const { groupId, message } = data;
    const db = getDatabase();

    console.log('Attempting to insert message into DB:', { groupId, userId: socket.userId, message });
    const result = await db.run(
      'INSERT INTO chat_messages (group_id, user_id, message) VALUES (?, ?, ?)',
      [groupId, socket.userId, message]
    );
    console.log('Message inserted, lastID:', result.lastID);

    const savedMessageId = result.lastID;
    const savedMessage = await db.get(`
      SELECT cm.id, cm.message, cm.created_at,
             u.username, u.avatar_url
      FROM chat_messages cm
      JOIN users u ON cm.user_id = u.id
      WHERE cm.id = ?
    `, [savedMessageId]);
    console.log('Fetched saved message from DB:', savedMessage);

    const messageToBroadcast = {
      id: savedMessage.id,
      userId: socket.userId,
      username: savedMessage.username,
      avatar: savedMessage.avatar_url,
      groupId,
      message,
      timestamp: new Date(savedMessage.created_at).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
      })
    };

    console.log('Broadcasting new-message:', messageToBroadcast); // Log the message being broadcasted
    io.to(`group-${groupId}`).emit('new-message', messageToBroadcast);
    console.log('new-message broadcasted to room:', `group-${groupId}`);

  } catch (error) {
    console.error('Failed to send message on backend:', error);
    socket.emit('error', { message: 'Failed to send message' });
  }
});

  socket.on('disconnect', () => {
    console.log(`User ${socket.userId} disconnected`);
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const PORT = process.env.PORT || 3000;

// Initialize database and start server
initializeDatabase().then(() => {
  httpServer.listen(PORT, () => {
    console.log(`LeetSquad server running on port ${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
