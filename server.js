require('dotenv').config();
const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;

if (!process.env.DATABASE_URL) {
  console.error('Missing DATABASE_URL environment variable. Set it to your Neon connection string.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // required for Neon
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS comments (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      text TEXT NOT NULL,
      stars INTEGER NOT NULL DEFAULT 5,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// List comments, newest first
app.get('/api/comments', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, text, stars, created_at FROM comments ORDER BY created_at DESC LIMIT 200'
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /api/comments failed:', err);
    res.status(500).json({ error: 'db_error' });
  }
});

// Add a new comment
app.post('/api/comments', async (req, res) => {
  const { name, text, stars } = req.body || {};

  if (typeof name !== 'string' || typeof text !== 'string') {
    return res.status(400).json({ error: 'invalid_input' });
  }

  const cleanName = name.trim().slice(0, 40);
  const cleanText = text.trim().slice(0, 300);
  const cleanStars = Math.min(5, Math.max(1, parseInt(stars, 10) || 5));

  if (!cleanName || !cleanText) {
    return res.status(400).json({ error: 'invalid_input' });
  }

  try {
    const { rows } = await pool.query(
      'INSERT INTO comments (name, text, stars) VALUES ($1, $2, $3) RETURNING id, name, text, stars, created_at',
      [cleanName, cleanText, cleanStars]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /api/comments failed:', err);
    res.status(500).json({ error: 'db_error' });
  }
});

// Fallback to the single-page site for any other route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

initDb()
  .then(() => {
    app.listen(port, () => console.log(`Server running on port ${port}`));
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
