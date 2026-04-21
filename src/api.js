const REDASH_API_KEY = 'Pbs779L6IJcjJ8pIcZTg7W1ozTkbaScCsZX2h5nm';
const REDASH_URL = '/redash-api/api/queries/15023/results';

const HUMAND_API_KEY = 'Basic NTg3Nzg0ODoyOVljWHNSZmZEeGZKRzQ0YnE4bWdtbmpJYzVjbVR0Tg==';
const HUMAND_URL = '/humand-api/public/api/v1/posts';

const GEMINI_API_KEY = 'AIzaSyBXoOyTWWGFePmgCzUKEdAZnwvEzdjcDpk';
const GEMINI_URL = `/gemini-api/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_API_KEY}`;

export async function fetchPosts() {
  const response = await fetch(REDASH_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Key ${REDASH_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    throw new Error(`Redash API error: ${response.status}`);
  }

  const data = await response.json();
  return data.query_result.data.rows;
}

export async function generateSummaryWithGemini(posts, topN, sortBy) {
  const postList = posts
    .map((p, i) => {
      const url = p.URL || p['Post URL'] || p.url || p.link || '';
      const urlLine = url ? `\nURL: ${url}` : '';
      return `Post ${i + 1}:\nAuthor: ${p['User::multi-filter']}\nContent: ${p.Post.slice(0, 600)}${urlLine}`;
    })
    .join('\n\n---\n\n');

  const prompt = `You are writing an internal digest for a company platform. Below are the top ${topN} posts from the last 7 days, ranked by ${sortBy}.

For each post, write exactly 1-2 sentences summarizing what the post is about — focus on the topic and content, not on the engagement numbers. If a URL is provided for the post, end that post's entry with: "For more information, here is the post: [URL]" on its own line, showing the full URL.

Then write a short 2-3 sentence introduction paragraph to kick off the digest.

Format the response as a complete, ready-to-publish digest post in plain text. Use a warm, professional internal communications tone.

${postList}`;

  const response = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${err}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

function linkify(text) {
  return text.replace(
    /(https?:\/\/[^\s]+)/g,
    (url) => `<a href="${url}" target="_blank">${url}</a>`
  );
}

export async function publishPost(body) {
  // Convert plain text to simple HTML, turning URLs into hyperlinks
  const bodyHtml = body
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => `<p>${linkify(line)}</p>`)
    .join('');

  const response = await fetch(HUMAND_URL, {
    method: 'POST',
    headers: {
      'Authorization': HUMAND_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      body,
      bodyHtml,
      sendNotification: true,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Humand API error: ${response.status} - ${errorText}`);
  }

  return response.json();
}
