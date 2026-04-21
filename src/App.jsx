import { useState, useEffect } from 'react';
import { fetchPosts, generateSummaryWithGemini, publishPost } from './api';
import Automation from './Automation';
import './App.css';

const SORT_OPTIONS = [
  { value: 'Unique Views', label: 'Unique Views' },
  { value: 'Reactions', label: 'Reactions' },
  { value: 'Comments', label: 'Comments' },
];

const TOP_N_OPTIONS = [5, 10, 15, 20];

function truncate(text, maxLen = 220) {
  if (!text) return '';
  return text.length > maxLen ? text.slice(0, maxLen).trimEnd() + '…' : text;
}

function PostCard({ post, index }) {
  return (
    <div className="post-card">
      <div className="post-rank">#{index + 1}</div>
      <div className="post-content">
        <div className="post-meta">
          <span className="post-author">{post['User::multi-filter']}</span>
          <span className="post-date">
            {new Date(post.PublishDate).toLocaleDateString()}
          </span>
        </div>
        <p className="post-body">{truncate(post.Post)}</p>
        <div className="post-stats">
          <span>👁 {post['Unique Views']} views</span>
          <span>❤️ {post.Reactions} reactions</span>
          <span>💬 {post.Comments} comments</span>
        </div>
        {(post.URL || post['Post URL'] || post.url || post.link) && (
          <a
            className="post-url"
            href={post.URL || post['Post URL'] || post.url || post.link}
            target="_blank"
            rel="noopener noreferrer"
          >
            {post.URL || post['Post URL'] || post.url || post.link}
          </a>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState('manual');
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(null);

  const [sortBy, setSortBy] = useState('Unique Views');
  const [topN, setTopN] = useState(5);

  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [geminiError, setGeminiError] = useState(null);
  const [summary, setSummary] = useState('');

  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState(null);
  const [publishSuccess, setPublishSuccess] = useState(false);

  useEffect(() => {
    loadPosts();
  }, []);

  // Reset summary when selection changes
  useEffect(() => {
    setSummary('');
    setGeminiError(null);
    setPublishSuccess(false);
    setPublishError(null);
  }, [sortBy, topN]);

  async function loadPosts() {
    setLoading(true);
    setFetchError(null);
    try {
      const rows = await fetchPosts();
      setPosts(rows);
    } catch (err) {
      setFetchError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const sortedPosts = [...posts]
    .sort((a, b) => b[sortBy] - a[sortBy])
    .slice(0, topN);

  async function handleGenerateSummary() {
    if (sortedPosts.length === 0) return;
    setGeneratingSummary(true);
    setGeminiError(null);
    setSummary('');
    setPublishSuccess(false);
    setPublishError(null);

    try {
      const text = await generateSummaryWithGemini(sortedPosts, topN, sortBy);
      setSummary(text);
    } catch (err) {
      setGeminiError(err.message);
    } finally {
      setGeneratingSummary(false);
    }
  }

  async function handlePublish() {
    if (!summary.trim()) return;
    setPublishing(true);
    setPublishError(null);
    setPublishSuccess(false);

    try {
      await publishPost(summary);
      setPublishSuccess(true);
    } catch (err) {
      setPublishError(err.message);
    } finally {
      setPublishing(false);
    }
  }

  const sortLabel = SORT_OPTIONS.find((o) => o.value === sortBy)?.label;

  return (
    <div className="app">
      <header className="app-header">
        <h1>Post Summary App</h1>
        <p className="subtitle">Generate AI digests from top posts and publish to Humand.</p>
      </header>

      <div className="tab-nav">
        <button
          className={`tab-btn${activeTab === 'manual' ? ' active' : ''}`}
          onClick={() => setActiveTab('manual')}
        >
          ✏️ Manual
        </button>
        <button
          className={`tab-btn${activeTab === 'automation' ? ' active' : ''}`}
          onClick={() => setActiveTab('automation')}
        >
          ⚡ Automation
        </button>
      </div>

      {activeTab === 'automation' && <Automation />}

      {activeTab === 'manual' && <>
      {/* ── Controls ── */}
      <div className="controls">
        <div className="control-group">
          <label>Sort by</label>
          <div className="btn-group">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className={`btn-option${sortBy === opt.value ? ' active' : ''}`}
                onClick={() => setSortBy(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="control-group">
          <label>Show top</label>
          <div className="btn-group">
            {TOP_N_OPTIONS.map((n) => (
              <button
                key={n}
                className={`btn-option${topN === n ? ' active' : ''}`}
                onClick={() => setTopN(n)}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <button className="refresh-btn" onClick={loadPosts} disabled={loading}>
          {loading ? 'Loading…' : '↻ Refresh'}
        </button>
      </div>

      {fetchError && (
        <div className="error-banner">
          <strong>Error loading posts:</strong> {fetchError}
        </div>
      )}

      {loading && <div className="loading-spinner">Fetching posts…</div>}

      {!loading && !fetchError && sortedPosts.length > 0 && (
        <>
          {/* ── Post list ── */}
          <div className="section-heading">
            Top {topN} posts by {sortLabel}
          </div>
          <div className="posts-list">
            {sortedPosts.map((post, i) => (
              <PostCard
                key={post.Username + post.PublishDate}
                post={post}
                index={i}
              />
            ))}
          </div>

          {/* ── Generate button ── */}
          <div className="action-bar">
            <button
              className={`generate-btn${generatingSummary ? ' loading' : ''}`}
              onClick={handleGenerateSummary}
              disabled={generatingSummary || publishing}
            >
              {generatingSummary
                ? '✨ Generating…'
                : summary
                ? '✨ Regenerate Summary'
                : '✨ Generate Summary with Gemini'}
            </button>
          </div>

          {geminiError && (
            <div className="error-banner">
              <strong>Gemini error:</strong> {geminiError}
            </div>
          )}

          {/* ── Summary area ── */}
          {summary && (
            <div className="summary-panel">
              <div className="summary-panel-header">
                <span className="summary-panel-title">Generated Digest</span>
                <span className="summary-panel-hint">You can edit before publishing</span>
              </div>
              <textarea
                className="summary-textarea"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                rows={12}
              />

              <div className="publish-bar">
                <button
                  className={`publish-btn${publishing ? ' loading' : ''}`}
                  onClick={handlePublish}
                  disabled={!summary.trim() || publishing || publishSuccess}
                >
                  {publishing ? 'Publishing…' : '🚀 Publish to Humand'}
                </button>

                {publishSuccess && (
                  <span className="status-success">✅ Published successfully!</span>
                )}
                {publishError && (
                  <span className="status-error">{publishError}</span>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {!loading && !fetchError && sortedPosts.length === 0 && (
        <p className="empty">No posts found.</p>
      )}
      </>}
    </div>
  );
}
