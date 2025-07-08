// database/init.js - Database setup
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');

let db;

async function initializeDatabase() {
  db = await open({
    filename: path.join(__dirname, '../leetsquad.db'),
    driver: sqlite3.Database
  });

  // Create tables
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      leetcode_username TEXT UNIQUE NOT NULL,
      username TEXT NOT NULL,
      email TEXT,
      avatar_url TEXT,
      total_solved INTEGER DEFAULT 0,
      success_rate REAL DEFAULT 0,
      last_scraped DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      creator_id INTEGER NOT NULL,
      description TEXT,
      is_private BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (creator_id) REFERENCES users (id)
    );

    CREATE TABLE IF NOT EXISTS group_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_admin BOOLEAN DEFAULT 0,
      FOREIGN KEY (group_id) REFERENCES groups (id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
      UNIQUE(group_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      message TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (group_id) REFERENCES groups (id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      problems_solved INTEGER DEFAULT 0,
      easy_solved INTEGER DEFAULT 0,
      medium_solved INTEGER DEFAULT 0,
      hard_solved INTEGER DEFAULT 0,
      acceptance_rate REAL DEFAULT 0,
      ranking INTEGER,
      reputation INTEGER DEFAULT 0,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON group_members(group_id);
    CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON group_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_chat_messages_group_id ON chat_messages(group_id);
    CREATE INDEX IF NOT EXISTS idx_user_stats_user_id ON user_stats(user_id);
  `);

  console.log('Database initialized successfully');
  return db;
}

function getDatabase() {
  return db;
}

module.exports = { initializeDatabase, getDatabase };
