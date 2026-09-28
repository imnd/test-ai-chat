const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const path = require('path');

require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const OPENROUTER_URL = process.env.OPENROUTER_URL || 'https://api.openrouter.ai/v1/chat/completions';
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
const DEFAULT_MODEL = process.env.DEFAULT_MODEL || 'gpt-4o-mini:free';

if (!OPENROUTER_KEY) {
  console.warn('OPENROUTER_API_KEY not set — server will error on requests');
}

app.post('/api/chat', async (req, res) => {
  // Proxy request to OpenRouter and stream back via SSE-like chunking
  const { messages, model = DEFAULT_MODEL } = req.body;
  if (!messages) return res.status(400).json({ error: 'messages required' });

  const controller = new AbortController();
  req.on('close', () => controller.abort());

  try {
    const upstream = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_KEY}`
      },
      body: JSON.stringify({ model, messages, stream: true }),
      signal: controller.signal
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      return res.status(upstream.status).json({ error: text });
    }

    // Stream response to client
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    upstream.body.on('data', (chunk) => {
      const str = chunk.toString();
      // Forward raw chunks as events
      res.write(`data: ${JSON.stringify(str)}\n\n`);
    });

    upstream.body.on('end', () => {
      res.write('event: done\n');
      res.write('data: [DONE]\n\n');
      res.end();
    });

    upstream.body.on('error', (err) => {
      res.write('event: error\n');
      res.write(`data: ${JSON.stringify(err.message)}\n\n`);
      res.end();
    });

  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(499).json({ error: 'client aborted' });
    }
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

app.use('/', express.static(path.join(__dirname, '..', 'frontend')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
