import React, { useEffect, useState } from 'react';
import './GroupCharts.css';
import { Bar, Doughnut } from 'react-chartjs-2';

export default function GroupCharts({ groupId }) {
  const API_BASE = 'http://localhost:5000';
  const token = localStorage.getItem('token');

  const [txs, setTxs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Derived data
  const [txsByDay, setTxsByDay] = useState([]);
  const [debtByUser, setDebtByUser] = useState({});
  const [todaySummary, setTodaySummary] = useState({ txCount: 0, debtTotal: 0 });

  useEffect(() => {
    if (!groupId) return;
    let mounted = true;
    const fetchTxs = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE}/api/groups/${groupId}/transactions`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        if (!res.ok) {
          setTxs([]);
          setError('Không lấy được giao dịch');
          setLoading(false);
          return;
        }
        const data = await res.json();
        if (!mounted) return;
        setTxs(Array.isArray(data) ? data : (data ? [data] : []));
      } catch (e) {
        if (!mounted) return;
        setError('Lỗi mạng');
        setTxs([]);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetchTxs();
    return () => { mounted = false; };
  }, [groupId, token]);

  useEffect(() => {
    // compute last 7 days labels
    const now = new Date();
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      days.push(d);
    }

    const labels = days.map(d => d.toLocaleDateString());
    const counts = labels.map(() => 0);
    const debtsMap = new Map();
    let todayTxCount = 0;
    let todayDebtTotal = 0;

    const startOf = (date) => {
      const s = new Date(date);
      s.setHours(0,0,0,0); return s;
    };
    const endOf = (date) => {
      const e = new Date(date);
      e.setHours(23,59,59,999); return e;
    };

    const todayStart = startOf(new Date());
    const todayEnd = endOf(new Date());

    (txs || []).forEach(tx => {
      const txDate = new Date(tx.date || tx.createdAt || tx.created || Date.now());
      // count per day
      for (let i = 0; i < days.length; i++) {
        const s = startOf(days[i]), e = endOf(days[i]);
        if (txDate >= s && txDate <= e) counts[i] += 1;
      }
      // accumulate debts by participants (only unsettled amounts)
      if (Array.isArray(tx.participants)) {
        tx.participants.forEach(p => {
          const key = (p.user && (p.user.name || p.user.email)) || (p.email || 'Unknown');
          const amount = Number(p.shareAmount || 0);
          const settled = !!p.settled;
          if (!settled && amount > 0) {
            debtsMap.set(key, (debtsMap.get(key) || 0) + amount);
            // if tx is today, add to today's debt
            if (txDate >= todayStart && txDate <= todayEnd) {
              todayDebtTotal += amount;
            }
          }
        });
      }
      // transactions today count
      if (txDate >= todayStart && txDate <= todayEnd) {
        todayTxCount += 1;
      }
    });

    // reduce to object
    const debtsObj = {};
    Array.from(debtsMap.entries()).forEach(([k, v]) => debtsObj[k] = v);

    setTxsByDay({ labels, data: counts });
    setDebtByUser(debtsObj);
    setTodaySummary({ txCount: todayTxCount, debtTotal: todayDebtTotal });
  }, [txs]);

  // Chart data
  const barData = {
    labels: txsByDay.labels || [],
    datasets: [
      {
        label: 'Số giao dịch',
        backgroundColor: '#3b82f6',
        data: txsByDay.data || []
      }
    ]
  };

  const debtLabels = Object.keys(debtByUser).slice(0, 8); // limit to top 8 for readability
  const debtValues = debtLabels.map(k => Math.round(debtByUser[k] || 0));

  const doughnutData = {
    labels: debtLabels,
    datasets: [{
      data: debtValues,
      backgroundColor: [
        '#ef4444','#f97316','#f59e0b','#fbbf24','#10b981','#06b6d4','#3b82f6','#8b5cf6'
      ].slice(0, debtLabels.length)
    }]
  };

  return (
    <div className="group-charts">
      <div className="gc-row gc-top">
        <div className="gc-card gc-summary">
          <div className="gc-card-title">Giao dịch hôm nay</div>
          <div className="gc-card-value">{loading ? '...' : (todaySummary.txCount || 0)}</div>
          <div className="gc-card-sub">Số giao dịch diễn ra hôm nay</div>
        </div>

        <div className="gc-card gc-summary">
          <div className="gc-card-title">Khoản nợ hôm nay</div>
          <div className="gc-card-value">{loading ? '...' : new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(todaySummary.debtTotal || 0)}</div>
          <div className="gc-card-sub">Tổng khoản nợ (chưa thanh toán) hôm nay</div>
        </div>
      </div>

      <div className="gc-row">
        <div className="gc-chart gc-chart-wide">
          <div className="gc-chart-title">Giao dịch 7 ngày gần nhất</div>
          <Bar data={barData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display:false } } }} />
        </div>

        <div className="gc-chart gc-chart-narrow">
          <div className="gc-chart-title">Khoản nợ theo người (chưa thanh toán)</div>
          {debtLabels.length === 0 ? (
            <div className="gc-empty">Không có khoản nợ chưa thanh toán</div>
          ) : (
            <Doughnut data={doughnutData} options={{ responsive: true, maintainAspectRatio: false }} />
          )}
        </div>
      </div>

      {error && <div className="gc-error">{error}</div>}
    </div>
  );
}

