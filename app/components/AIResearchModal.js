'use client';

import { useState } from 'react';
import { apiFetch } from '../lib/api-client';
import { formatDateInput } from '@/lib/date';
import ModalFrame from './ModalFrame';
import Icon from './Icon';
import EditModal from './EditModal';

export default function AIResearchModal({ onClose, onAdd }) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const doResearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const data = await apiFetch('/api/research', {
        method: 'POST',
        body: { companyName: query.trim() },
      });
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  if (result) return <EditModal title="リサーチ結果を確認・編集" company={{ ...result, interest: 3, research_date: formatDateInput() }} onClose={() => setResult(null)} onSave={onAdd} />;

  return (
    <ModalFrame
      title="AIリサーチ"
      onClose={onClose}
    >
          <p style={{fontSize:13,color:'var(--text-secondary)',marginBottom:16}}>
            企業名を入力すると、AIがWeb検索を行い、基本情報・待遇・インターン情報を自動で収集します。
          </p>
          <div className="ai-research-input-row">
            <input
              className="form-input"
              placeholder="例: キーエンス、任天堂、三菱商事..."
              aria-label="リサーチする企業名"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') doResearch(); }}
              disabled={loading}
            />
            <button className="btn btn-primary" type="button" onClick={doResearch} disabled={loading || !query.trim()}>
              {loading ? <><div className="spinner" /> 検索中...</> : <><Icon name="search" /> リサーチ</>}
            </button>
          </div>

          {loading && (
            <div className="research-progress">
              <div className="research-step loading"><span className="research-step-icon"><div className="spinner" /></span> AIがWeb検索で情報を収集しています...</div>
            </div>
          )}

          {error && <div className="research-error"><Icon name="alert" /> {error}</div>}

    </ModalFrame>
  );
}
