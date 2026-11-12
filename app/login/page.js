'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../lib/api-client';
import Icon, { BrandMark } from '../components/Icon';

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password.trim()) return;

    setLoading(true);
    setError('');

    try {
      await apiFetch('/api/auth/login', {
        method: 'POST',
        body: { password },
      });
      router.push('/');
      router.refresh();
    } catch (e) {
      setError(e.message || 'ネットワークに接続できませんでした。もう一度お試しください');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <header className="login-bar">
        <BrandMark />
        <span>就活ダッシュボード</span>
      </header>

      <main className="login-main">
        <form onSubmit={handleSubmit} className="login-card" aria-labelledby="login-title">
          <h1 id="login-title" className="login-title">ログイン</h1>
          <p className="login-subtitle">設定したパスワードを入力してください。</p>

          <label className="login-label" htmlFor="password">パスワード</label>
          <input
            id="password"
            type="password"
            className={`login-input${error ? ' login-input-error' : ''}`}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (error) setError('');
            }}
            disabled={loading}
            autoFocus
            autoComplete="current-password"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'login-error' : undefined}
          />
          {error && (
            <p id="login-error" className="login-error-msg" role="alert">
              <Icon name="alert" size="sm" /> {error}
            </p>
          )}

          <button
            type="submit"
            className="btn btn-primary login-btn"
            disabled={loading || !password.trim()}
            id="login-submit"
          >
            {loading ? (
              <>
                <span className="spinner" />
                ログイン中…
              </>
            ) : (
              <>
                <Icon name="lock" />
                ログイン
              </>
            )}
          </button>
        </form>
      </main>
    </div>
  );
}
