import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import './PublicGroupView.css';

export default function PublicGroupView() {
  const { shareKey } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [expanded, setExpanded] = useState({ transactions: true, members: true, charts: true });
  const API_BASE = 'http://localhost:5000';

  useEffect(() => {
    if (!shareKey) return;
    let canceled = false;
    (async () => {
      setLoading(true); setErr(''); setData(null);
      try {
        let res = await fetch(`${API_BASE}/api/public/group/${shareKey}`);
        if (!res.ok) {
          res = await fetch(`${API_BASE}/api/groups/public/${shareKey}`);
        }
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          if (!canceled) setErr(body?.message || 'Không thể tải dữ liệu công khai.');
        } else {
          if (!canceled) setData(body);
        }
      } catch (e) {
        if (!canceled) setErr('Lỗi mạng');
      } finally {
        if (!canceled) setLoading(false);
      }
    })();
    return () => { canceled = true; };
  }, [shareKey]);

  const fmtMoney = v => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(v || 0);
  const fmtDate = d => d ? new Date(d).toLocaleDateString('vi-VN') : '';

  if (loading) {
    return (
      <div className="pgp-wrap">
        <div className="pgp-hero skeleton">
          <div className="pgp-hero-inner">
            <div className="pgp-avatar sk-block"></div>
            <div className="pgp-lines">
              <div className="sk-line big"></div>
              <div className="sk-line mid"></div>
              <div className="sk-line small"></div>
            </div>
          </div>
        </div>
        <div className="pgp-section">
          <div className="pgp-cards">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="pgp-card sk-card">
                <div className="sk-line wide"></div>
                <div className="sk-line short"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (err) {
    return (
      <div className="pgp-wrap">
        <div className="pgp-error-box">
          <i className="fas fa-exclamation-triangle"></i> {err}
          <div className="pgp-hint">Kiểm tra shareKey hoặc cấu hình chia sẻ nhóm.</div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="pgp-wrap">
        <div className="pgp-error-box">Không có dữ liệu.</div>
      </div>
    );
  }

  const { groupInfo, shareSettings, transactions = [], statistics, charts, membersCount } = data;
  const toggle = key => setExpanded(prev => ({ ...prev, [key]: !prev[key] }));

  const trendValues = charts?.trend?.values || [];
  const trendLabels = charts?.trend?.labels || [];
  const maxTrend = Math.max(0, ...trendValues);

  return (
    <div className="pgp-wrap">
      <header className="pgp-hero">
        <div className="pgp-hero-inner">
          <div
            className="pgp-avatar"
            style={{
              background: groupInfo.color && typeof groupInfo.color === 'object'
                ? (groupInfo.color.direction === 'circle'
                    ? `radial-gradient(circle, ${(groupInfo.color.colors || ['#667eea']).join(',')})`
                    : `linear-gradient(${groupInfo.color.direction || '135deg'}, ${(groupInfo.color.colors || ['#667eea']).join(',')})`)
                : 'linear-gradient(135deg,#667eea,#764ba2)'
            }}
          >
            {(groupInfo.name || 'G').charAt(0).toUpperCase()}
          </div>
          <div className="pgp-head-block">
            <h1 className="pgp-title">{groupInfo.name}</h1>
            {groupInfo.description && <p className="pgp-desc">{groupInfo.description}</p>}
            <div className="pgp-meta">
              <span><i className="fas fa-user-shield"></i> {groupInfo.ownerName}</span>
              {shareSettings?.members && <span><i className="fas fa-users"></i> {membersCount} thành viên</span>}
              <span><i className="fas fa-calendar-alt"></i> {fmtDate(groupInfo.createdAt)}</span>
            </div>
          </div>
          <div className="pgp-badge"><i className="fas fa-eye"></i> Công khai</div>
        </div>
      </header>

      <section className="pgp-section">
        <div className="pgp-cards">
          <div className="pgp-card">
            <div className="pgp-card-label"><i className="fas fa-exchange-alt"></i> Giao dịch</div>
            <div className="pgp-card-value">{statistics?.totalTransactions ?? transactions.length}</div>
          </div>
          <div className="pgp-card">
            <div className="pgp-card-label"><i className="fas fa-money-bill-wave"></i> Tổng giá trị</div>
            <div className="pgp-card-value">{fmtMoney(statistics?.totalAmount || transactions.reduce((s, t) => s + (t.amount || 0), 0))}</div>
          </div>
          <div className="pgp-card">
            <div className="pgp-card-label"><i className="fas fa-check-circle"></i> Tỉ lệ thanh toán</div>
            <div className="pgp-card-value">{(statistics?.settlementRate ?? 0)}%</div>
          </div>
        </div>
      </section>

      {shareSettings?.charts && charts && (
        <section className="pgp-section">
          <div className="pgp-section-header" onClick={() => toggle('charts')}>
            <h2><i className="fas fa-chart-area"></i> Phân tích</h2>
            <button className="pgp-toggle-btn">{expanded.charts ? 'Ẩn' : 'Hiện'}</button>
          </div>
          {expanded.charts && (
            <div className="pgp-charts-grid">
              <div className="pgp-panel">
                <h3 className="pgp-panel-title">Xu hướng gần đây</h3>
                {trendValues.length && maxTrend > 0 ? (
                  <div className="pgp-bars">
                    {trendValues.slice(-30).map((v, i) => {
                      const h = Math.max(4, Math.round((v / maxTrend) * 120));
                      return (
                        <div key={i} className="pgp-bar-wrap" title={`${trendLabels[trendLabels.length - trendValues.slice(-30).length + i]}: ${fmtMoney(v)}`}>
                          <div className="pgp-bar" style={{ height: `${h}px` }}></div>
                        </div>
                      );
                    })}
                  </div>
                ) : <div className="pgp-empty">Chưa có dữ liệu xu hướng</div>}
              </div>
              <div className="pgp-panel">
                <h3 className="pgp-panel-title">Danh mục</h3>
                {charts.categories?.length ? (
                  <div className="pgp-donut-block">
                    <div className="pgp-donut" style={{
                      background: `conic-gradient(${charts.categories.map((c, idx) => {
                        const palette = ['#67e8f9','#60a5fa','#a78bfa','#f472b6','#fb7185','#f59e0b','#34d399','#22c55e','#14b8a6','#0ea5e9','#ef4444'];
                        const total = charts.categories.reduce((s, x) => s + (x.amount || 0), 0) || 1;
                        const start = charts.categories.slice(0, idx).reduce((s, x) => s + (x.amount || 0), 0) / total;
                        const end = start + (c.amount || 0) / total;
                        return `${palette[idx % palette.length]} ${start * 360}deg ${end * 360}deg`;
                      }).join(',')})`
                    }}></div>
                    <ul className="pgp-legend">
                      {charts.categories.slice(0, 10).map((c, i) => (
                        <li key={i}>
                          <span className={`pgp-dot d${i % 11}`}></span>
                          <span className="pgp-legend-name">{c.name}</span>
                          <span className="pgp-legend-val">{fmtMoney(c.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : <div className="pgp-empty">Chưa có dữ liệu danh mục</div>}
              </div>
              {shareSettings.members && charts.members?.length > 0 && (
                <div className="pgp-panel">
                  <h3 className="pgp-panel-title">Thành viên</h3>
                  <div className="pgp-members-grid">
                    {charts.members.map((m, i) => (
                      <div key={i} className="pgp-member-card">
                        <div className="pgp-member-avatar">{(m.name || 'U').charAt(0).toUpperCase()}</div>
                        <div className="pgp-member-info">
                          <div className="pgp-member-name">{m.name}</div>
                          <div className="pgp-member-row"><span>Đã trả</span><strong>{fmtMoney(m.paid)}</strong></div>
                          <div className="pgp-member-row"><span>Đã mượn</span><strong>{fmtMoney(m.borrowed)}</strong></div>
                          <div className="pgp-member-row"><span>Được nợ</span><strong>{fmtMoney(m.owed)}</strong></div>
                          <div className="pgp-member-row balance"><span>Cân bằng</span>
                            <strong className={m.owed - m.borrowed >= 0 ? 'pos' : 'neg'}>
                              {fmtMoney(Math.abs(m.owed - m.borrowed))}
                            </strong>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {shareSettings?.transactions && transactions.length > 0 && (
        <section className="pgp-section">
          <div className="pgp-section-header" onClick={() => toggle('transactions')}>
            <h2><i className="fas fa-list"></i> Giao dịch gần đây ({transactions.length})</h2>
            <button className="pgp-toggle-btn">{expanded.transactions ? 'Ẩn' : 'Hiện'}</button>
          </div>
          {expanded.transactions && (
            <ul className="pgp-tx-list">
              {transactions.map(tx => {
                const settledTxt = tx.isFullySettled
                  ? 'Đã thanh toán'
                  : `${tx.settledCount}/${tx.participantsCount} đã trả`;
                return (
                  <li key={tx._id} className={`pgp-tx-item ${tx.isFullySettled ? 'ok' : 'pending'}`}>
                    <div className="pgp-tx-left">
                      <div className="pgp-tx-title">{tx.title}</div>
                      <div className="pgp-tx-meta">
                        <span><i className="fas fa-calendar-alt"></i> {fmtDate(tx.date)}</span>
                        <span><i className="fas fa-users"></i> {tx.participantsCount} người</span>
                        {tx.category && tx.category.name && (
                          <span><i className="fas fa-tag"></i> {tx.category.name}</span>
                        )}
                      </div>
                      <div className={`pgp-tx-status ${tx.isFullySettled ? 's' : 'w'}`}>
                        <i className={`fas ${tx.isFullySettled ? 'fa-check-circle' : 'fa-clock'}`}></i> {settledTxt}
                      </div>
                    </div>
                    <div className="pgp-tx-right">{fmtMoney(tx.amount)}</div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      <footer className="pgp-footer">
        <p><i className="fas fa-shield-alt"></i> Dữ liệu hiển thị theo quyền chia sẻ được chủ nhóm cấu hình.</p>
      </footer>
    </div>
  );
}
