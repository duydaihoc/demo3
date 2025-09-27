import React, { useEffect, useState } from 'react';
import './SavingsGoals.css';

export default function SavingsGoals() {
  const STORAGE_KEY = 'savingsGoals_v1';
  const [goals, setGoals] = useState([]);
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState('');
  const [current, setCurrent] = useState('');
  const [currency, setCurrency] = useState('VND');

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setGoals(JSON.parse(raw));
    } catch {
      setGoals([]);
    }
  }, []);

  const persist = (next) => {
    setGoals(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
  };

  const handleAdd = (e) => {
    e.preventDefault();
    const t = title.trim();
    const tgt = Number(target) || 0;
    const cur = Number(current) || 0;
    if (!t || tgt <= 0) return;
    const g = { id: Date.now().toString(), title: t, target: tgt, current: cur, currency, createdAt: new Date().toISOString(), done: cur >= tgt };
    persist([g, ...goals]);
    setTitle(''); setTarget(''); setCurrent('');
  };

  const handleDelete = (id) => {
    if (!window.confirm('Xóa mục tiêu này?')) return;
    const next = goals.filter(g => g.id !== id);
    persist(next);
  };

  const updateProgress = (id, delta) => {
    const next = goals.map(g => {
      if (g.id !== id) return g;
      const updated = { ...g, current: Math.max(0, Number(g.current || 0) + Number(delta || 0)) };
      updated.done = updated.current >= Number(updated.target || 0);
      return updated;
    });
    persist(next);
  };

  const gradients = [
    'linear-gradient(135deg,#1e3c72,#2a5298)',
    'linear-gradient(135deg,#2a5298,#4ecdc4)',
    'linear-gradient(135deg,#283c86,#45a247)',
    'linear-gradient(135deg,#614385,#516395)',
    'linear-gradient(135deg,#0f2027,#203a43)',
  ];

  const formatCurrency = (amount, curr = 'VND') => {
    try { return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: curr }).format(Number(amount || 0)); }
    catch { return `${amount} ${curr}`; }
  };

  return (
    <div className="sv-container">
      

        <div className="sv-list" role="list">
          {goals.length === 0 ? (
            <div className="sv-add-card">
              <div className="sv-empty">Chưa có mục tiêu nào — tạo mục tiêu để bắt đầu</div>
              <button className="sv-add-btn-large" onClick={() => document.querySelector('.sv-form input')?.focus()}>Tạo mục tiêu</button>
            </div>
          ) : (
            goals.map((g, idx) => {
              const pct = g.target ? Math.min(100, Math.round((g.current / g.target) * 100)) : 0;
              const grad = gradients[idx % gradients.length];
              return (
                <div
                  key={g.id}
                  className={`sv-item ${g.done ? 'done' : ''}`}
                  style={{ '--card-grad': grad }}
                  role="listitem"
                  aria-label={`Mục tiêu ${g.title}`}
                >
                  <div className="sv-top">
                    <span className="sv-label">GOAL</span>
                    <span className="sv-id">#{String(g.id).slice(-6).toUpperCase()}</span>
                  </div>

                  <div className="sv-title-row">
                    <div className="sv-title">{g.title}</div>
                    <div className="sv-badge">{pct}%</div>
                  </div>

                  <div className="sv-amount">{formatCurrency(g.current, g.currency)} / {formatCurrency(g.target, g.currency)}</div>

                  <div className="sv-progress">
                    <div className="sv-progress-bar">
                      <div className="sv-progress-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="sv-progress-meta">{pct}% • {g.current.toLocaleString()} {g.currency}</div>
                  </div>

                  <div className="sv-item-actions">
                    <button onClick={() => updateProgress(g.id, Math.round(g.target * 0.1))} title="Thêm 10%">+10%</button>
                    <button onClick={() => updateProgress(g.id, -Math.round(g.target * 0.1))} title="Giảm 10%">-10%</button>
                    <button className="sv-del" onClick={() => handleDelete(g.id)} aria-label={`Xóa ${g.title}`}>Xóa</button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
  );
}
