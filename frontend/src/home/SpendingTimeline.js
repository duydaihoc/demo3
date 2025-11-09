import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import './SpendingTimeline.css';

function SpendingTimeline() {
  const [mode, setMode] = useState('day'); // day | week | month
  const [loading, setLoading] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [error, setError] = useState('');
  const [activeGroupKey, setActiveGroupKey] = useState(null);
  const [selectedTx, setSelectedTx] = useState(null);
  const [layout, setLayout] = useState('horizontal'); // 'horizontal' | 'vertical'
  const [minAmount, setMinAmount] = useState(0);
  const [hoveredKey, setHoveredKey] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef(null);
  const dragState = useRef({ x:0, scroll:0, active:false });

  useEffect(() => {
    const fetchTx = async () => {
      setLoading(true);
      setError('');
      try {
        const token = localStorage.getItem('token');
        const res = await fetch('http://localhost:5000/api/transactions', {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        if (!res.ok) throw new Error('Không thể tải giao dịch');
        const data = await res.json();
        setTransactions(Array.isArray(data) ? data : []);
      } catch (e) {
        setError(e.message || 'Lỗi khi tải dữ liệu');
      } finally {
        setLoading(false);
      }
    };
    fetchTx();
  }, []);

  const groups = useMemo(() => {
    if (!transactions.length) return [];
    const map = new Map();

    const getWeekKey = (d) => {
      const date = new Date(d.getTime());
      date.setHours(0,0,0,0);
      // ISO week
      const dayNum = (date.getDay() + 6) % 7 + 1;
      date.setDate(date.getDate() - dayNum + 4);
      const yearStart = new Date(date.getFullYear(), 0, 1);
      const week = Math.floor(((date - yearStart) / 86400000 + 1) / 7) + 1;
      return `${date.getFullYear()}-W${week}`;
    };

    for (const tx of transactions) {
      if (!tx.date) continue;
      const d = new Date(tx.date);
      let key;
      if (mode === 'day') {
        // FIX: use local date parts instead of UTC ISO (toISOString caused day shift)
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        key = `${y}-${m}-${day}`;
      } else if (mode === 'week') {
        key = getWeekKey(d);
      } else {
        key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      }
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(tx);
    }

    // Build group objects
    const groupArr = [];
    for (const [key, txs] of map.entries()) {
      // Sort txs by amount desc for expense/income separation
      const expenses = txs.filter(t => t.type === 'expense').sort((a,b) => b.amount - a.amount);
      const incomes  = txs.filter(t => t.type === 'income').sort((a,b) => b.amount - a.amount);
      const highlight = [];
      if (expenses[0]) highlight.push({ ...expenses[0], highlightType: 'expense-max' });
      if (incomes[0]) highlight.push({ ...incomes[0], highlightType: 'income-max' });
      // Fallback: if no highlight found, pick any first
      if (!highlight.length && txs[0]) highlight.push({ ...txs[0], highlightType: 'single' });

      // Totals
      const totalExpense = expenses.reduce((s,t)=>s+Number(t.amount||0),0);
      const totalIncome  = incomes.reduce((s,t)=>s+Number(t.amount||0),0);

      groupArr.push({
        key,
        totalExpense,
        totalIncome,
        net: totalIncome - totalExpense,
        count: txs.length,
        highlight,
        all: txs.sort((a,b)=>new Date(b.date)-new Date(a.date))
      });
    }

    // Sort groups by key (date descending)
    const parseKeyDate = (k) => {
      if (mode === 'day') {
        // FIX: manual parse to keep local day (avoid Date('YYYY-MM-DD') UTC parse)
        const [y,m,d] = k.split('-').map(Number);
        return new Date(y, m - 1, d);
      }
      if (mode === 'month') {
        const [y,m] = k.split('-').map(Number);
        return new Date(y, m-1, 1);
      }
      const [y,w] = k.split('-W').map(Number);
      return new Date(y, 0, 1 + (w-1)*7);
    };

    groupArr.sort((a,b)=>parseKeyDate(b.key)-parseKeyDate(a.key));
    return groupArr;
  }, [transactions, mode]);

  const formatMoney = (amt, currency='VND') =>
    new Intl.NumberFormat('vi-VN',{style:'currency',currency}).format(amt || 0);

  const renderKeyLabel = (key) => {
    if (mode === 'day') {
      const d = new Date(key);
      return d.toLocaleDateString('vi-VN',{ day:'2-digit', month:'2-digit' });
    }
    if (mode === 'week') return key.replace('-W',' Tuần ');
    return key; // month
  };

  const displayGroups = useMemo(() => {
    return groups.filter(g => (Math.abs(g.totalExpense) + Math.abs(g.totalIncome)) >= minAmount);
  }, [groups, minAmount]);

  const activeGroup = displayGroups.find(g => g.key === activeGroupKey) || displayGroups[0];

  const handleNodeClick = (g) => {
    setActiveGroupKey(g.key);
    setSelectedTx(null);
  };

  // Sparkline bars helper
  const Spark = ({ g }) => {
    const exp = g.totalExpense;
    const inc = g.totalIncome;
    const total = (inc + exp) || 1;
    const incPct = Math.min(100, Math.max(0, (inc / total) * 100));
    return (
      <div className="st-spark">
        <div className="st-spark-inc" style={{ width: `${incPct}%` }} />
        <div className="st-spark-exp" style={{ width: `${100 - incPct}%` }} />
      </div>
    );
  };

  // Drag scroll (horizontal only)
  const attachDrag = useCallback((el) => {
    if (!el) return;
    dragRef.current = el;
  }, []);

  useEffect(() => {
    const el = dragRef.current;
    if (!el || layout !== 'horizontal') return;
    const down = (e) => {
      dragState.current = { x: e.clientX, scroll: el.scrollLeft, active: true };
      setIsDragging(true);
      el.classList.add('dragging');
    };
    const move = (e) => {
      if (!dragState.current.active) return;
      const dx = e.clientX - dragState.current.x;
      el.scrollLeft = dragState.current.scroll - dx;
    };
    const up = () => {
      dragState.current.active = false;
      setIsDragging(false);
      el.classList.remove('dragging');
    };
    el.addEventListener('mousedown', down);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      el.removeEventListener('mousedown', down);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, [layout]);

  // Prevent click while dragging
  const guardClick = (e) => {
    if (isDragging) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  // Tooltip data
  const hoveredGroup = useMemo(
    () => displayGroups.find(g => g.key === hoveredKey),
    [hoveredKey, displayGroups]
  );

  return (
    <div className={`spending-timeline-card layout-${layout}`}>
      {/* Controls */}
      <div className="st-toolbar">
        <div className="st-title">🕓 Timeline chi tiêu</div>
        <div className="st-controls">
          <div className="st-modes">
            {['day','week','month'].map(m => (
              <button
                key={m}
                className={`st-mode-btn ${mode===m?'active':''}`}
                onClick={() => { setMode(m); setActiveGroupKey(null); setSelectedTx(null); }}
              >
                {m==='day'?'Ngày': m==='week'?'Tuần':'Tháng'}
              </button>
            ))}
          </div>
          <div className="st-filter">
            <label>Tối thiểu:</label>
            <input
              type="number"
              value={minAmount}
              onChange={e => setMinAmount(Number(e.target.value) || 0)}
              className="st-filter-input"
              min={0}
              placeholder="0"
            />
          </div>
          <div className="st-layout-toggle">
            <button
              className={layout === 'horizontal' ? 'active' : ''}
              onClick={() => setLayout('horizontal')}
              title="Ngang"
            >↔</button>
            <button
              className={layout === 'vertical' ? 'active' : ''}
              onClick={() => setLayout('vertical')}
              title="Dọc"
            >↕</button>
          </div>
        </div>
      </div>

      {/* Track */}
      <div className={`st-track-wrapper ${layout}`}>
        {/* ...existing loading / error / empty logic updated to displayGroups... */}
        {loading && <div className="st-loading">Đang tải...</div>}
        {error && <div className="st-error">{error}</div>}
        {!loading && !error && displayGroups.length === 0 && (
          <div className="st-empty">Không có nhóm nào phù hợp bộ lọc.</div>
        )}

        <div
          className={`st-track ${layout}`}
          ref={attachDrag}
          onClick={guardClick}
        >
          {displayGroups.map(g => {
            const positive = g.net >= 0;
            const active = activeGroupKey === g.key;
            return (
              <div
                key={g.key}
                className={`st-node ${active ? 'active':''}`}
                onClick={() => !isDragging && handleNodeClick(g)}
                onMouseEnter={() => setHoveredKey(g.key)}
                onMouseLeave={() => setHoveredKey(k => k === g.key ? null : k)}
                title={`${g.key} • ${g.count} giao dịch`}
              >
                <div className="st-node-shell">
                  <div className="st-dot" data-positive={positive}></div>
                  <div className="st-node-center">
                    <div className="st-node-label">{renderKeyLabel(g.key)}</div>
                    <Spark g={g} />
                    <div className="st-node-net" data-positive={positive}>
                      {positive?'+':''}{formatMoney(g.net)}
                    </div>
                  </div>
                  <div className="st-node-glow" />
                  {active && <div className="st-node-focus-ring" />}
                </div>
                <div className="st-node-expand">
                  <div className="st-mini-stats">
                    <span className="exp">Chi {formatMoney(g.totalExpense)}</span>
                    <span className="inc">Thu {formatMoney(g.totalIncome)}</span>
                    <span className="cnt">{g.count} tx</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Tooltip */}
        {hoveredGroup && !isDragging && (
          <div className="st-tooltip">
            <div className="st-tip-row"><strong>{hoveredGroup.key}</strong></div>
            <div className="st-tip-row">
              <span className="exp">Chi: {formatMoney(hoveredGroup.totalExpense)}</span>
              <span className="inc">Thu: {formatMoney(hoveredGroup.totalIncome)}</span>
            </div>
            <div className="st-tip-row net">
              Net: {formatMoney(hoveredGroup.net)}
            </div>
            <div className="st-tip-row count">
              {hoveredGroup.count} giao dịch
            </div>
          </div>
        )}
      </div>

      {/* Detail panel (giữ nguyên nhưng dùng activeGroup + displayGroups) */}
      {activeGroup && (
        <div className="st-detail">
          <div className="st-detail-header">
            <div className="st-detail-period">
              {mode==='day'?'Ngày':mode==='week'?'Tuần':'Tháng'}: {activeGroup.key}
            </div>
            <div className="st-detail-stats">
              <span className="exp">Chi: {formatMoney(activeGroup.totalExpense)}</span>
              <span className="inc">Thu: {formatMoney(activeGroup.totalIncome)}</span>
              <span className="net">Net: {formatMoney(activeGroup.net)}</span>
            </div>
          </div>

            <div className="st-highlights">
              {activeGroup.highlight.map(h => (
                <button
                  key={h._id || h.id}
                  className={`st-hl st-hl-${h.highlightType}`}
                  onClick={() => setSelectedTx(h)}
                  title={`${h.title || h.description || ''}`}
                >
                  <span className="st-hl-type">
                    {h.type==='expense'?'💸':'💰'}
                  </span>
                  <span className="st-hl-amt">{formatMoney(h.amount, (h.wallet && h.wallet.currency) || 'VND')}</span>
                  <span className="st-hl-cat">{h.category?.name || '—'}</span>
                </button>
              ))}
            </div>

            <div className="st-all-title">Giao dịch ({activeGroup.count})</div>
            <div className="st-all-list">
              {activeGroup.all.slice(0,50).map(tx => (
                <div
                  key={tx._id}
                  className={`st-row ${selectedTx && selectedTx._id===tx._id?'selected':''}`}
                  onClick={() => setSelectedTx(tx)}
                >
                  <div className="st-row-left">
                    <div className="st-row-title">{tx.title || tx.description || '—'}</div>
                    <div className="st-row-meta">
                      {(tx.category && tx.category.name) || 'Không danh mục'} • {(tx.wallet && tx.wallet.name) || 'Ví'}
                    </div>
                  </div>
                  <div className={`st-row-amt ${tx.type==='income'?'income':'expense'}`}>
                    {tx.type==='income'?'+':'-'}{formatMoney(tx.amount, (tx.wallet && tx.wallet.currency) || 'VND')}
                  </div>
                </div>
              ))}
              {activeGroup.all.length > 50 && <div className="st-more">… (đã rút gọn)</div>}
            </div>

            {selectedTx && (
              <div className="st-selected-panel">
                <div className="st-selected-header">
                  <div className="st-selected-title">
                    {selectedTx.title || selectedTx.description || 'Chi tiết giao dịch'}
                  </div>
                  <button className="st-close-btn" onClick={() => setSelectedTx(null)}>×</button>
                </div>
                <div className="st-selected-body">
                  <div><strong>Loại:</strong> {selectedTx.type==='income'?'Thu nhập':'Chi tiêu'}</div>
                  <div><strong>Số tiền:</strong> {formatMoney(selectedTx.amount, (selectedTx.wallet && selectedTx.wallet.currency)||'VND')}</div>
                  <div><strong>Danh mục:</strong> {selectedTx.category?.name || '—'}</div>
                  <div><strong>Ví:</strong> {selectedTx.wallet?.name || '—'}</div>
                  <div><strong>Ngày:</strong> {new Date(selectedTx.date).toLocaleString('vi-VN')}</div>
                  {selectedTx.note && <div><strong>Ghi chú:</strong> {selectedTx.note}</div>}
                  {selectedTx.createdAt && <div><strong>Tạo lúc:</strong> {new Date(selectedTx.createdAt).toLocaleString('vi-VN')}</div>}
                  {selectedTx.updatedAt && <div><strong>Cập nhật:</strong> {new Date(selectedTx.updatedAt).toLocaleString('vi-VN')}</div>}
                </div>
              </div>
            )}
        </div>
      )}
    </div>
  );
}

export default SpendingTimeline;
