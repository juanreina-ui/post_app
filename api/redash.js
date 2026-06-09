export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const response = await fetch('https://redash.humand.co/api/queries/15023/results', {
    method: 'POST',
    headers: {
      'Authorization': `Key ${process.env.REDASH_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(req.body || {}),
  });

  const data = await response.json();
  res.status(response.status).json(data);
}
