import { handle } from '../lib/handler.js';

export default async function handler(req, res) {
  const out = await handle({ method: req.method, query: req.query, body: req.body });
  res.setHeader('Cache-Control', 'no-store');
  res.status(out.status).json(out.json);
}
