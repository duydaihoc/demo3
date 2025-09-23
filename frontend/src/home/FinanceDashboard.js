import React, { useEffect, useState, useCallback } from 'react';
import './FinanceDashboard.css';

const FinanceDashboard = () => {
  const [totalsByCurrency, setTotalsByCurrency] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const formatCurrency = (amount, currency) => {
    try {
      return new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: currency || 'VND'
      }).format(amount);
    } catch (e) {
      return `${amount} ${currency || ''}`;
    }
  };

  const computeTotalsFromWallets = useCallback((wallets) => {
    const sums = {};
    (wallets || []).forEach(w => {
      const curr = w.currency || 'VND';
      const amt = Number(w.initialBalance) || 0;
      sums[curr] = (sums[curr] || 0) + amt;
    });
    setTotalsByCurrency(sums);
  }, []);

  useEffect(() => {
    const fetchWalletTotals = async () => {
      setLoading(true);
      setError(null);
      try {
        const token = localStorage.getItem('token');
        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch('http://localhost:5000/api/wallets', { headers });
        if (!res.ok) {
          throw new Error('Không thể tải ví');
        }
        const wallets = await res.json();
        computeTotalsFromWallets(wallets);
      } catch (err) {
        console.error('Fetch wallets failed', err);
        setError('Không thể tải tổng số dư');
      } finally {
        setLoading(false);
      }
    };

    // initial load
    fetchWalletTotals();

    // listen for wallet updates from Wallets component
    const handler = (e) => {
      if (e && e.detail && Array.isArray(e.detail)) {
        // use provided list to compute totals immediately
        computeTotalsFromWallets(e.detail);
      } else {
        // fallback: re-fetch totals
        fetchWalletTotals();
      }
    };
    window.addEventListener('walletsUpdated', handler);
    return () => {
      window.removeEventListener('walletsUpdated', handler);
    };
  }, [computeTotalsFromWallets]);

  // prepare display string
  const currencyKeys = Object.keys(totalsByCurrency);
  let totalDisplay = '0₫';
  if (currencyKeys.length === 1) {
    const c = currencyKeys[0];
    totalDisplay = formatCurrency(totalsByCurrency[c], c);
  } else if (currencyKeys.length > 1) {
    totalDisplay = currencyKeys.map(c => `${formatCurrency(totalsByCurrency[c], c)}`).join(' • ');
  }

  // keep other values unchanged (static placeholders)
  const incomeMonth = '0₫';
  const expenseMonth = '0₫';

  return (
    <div className="fd-dashboard" role="region" aria-label="Bảng điều khiển tài chính">
      <div className="fd-header">
        <div className="fd-title">Bảng điều khiển tài chính</div>
        <div className="fd-sub">Theo dõi thu nhập & chi tiêu hàng tháng</div>
      </div>

      <div className="fd-cards">
        <div className="fd-card fd-overview">
          <div className="fd-card-label">Tổng số dư</div>
          <div className="fd-card-value">
            {loading ? 'Đang tải...' : (error ? '—' : totalDisplay)}
          </div>
        </div>

        <div className="fd-card fd-income">
          <div className="fd-card-label">Thu nhập tháng này</div>
          <div className="fd-card-value">{incomeMonth}</div>
          <div className="fd-badge positive">+0%</div>
        </div>

        <div className="fd-card fd-expense">
          <div className="fd-card-label">Chi phí tháng này</div>
          <div className="fd-card-value">{expenseMonth}</div>
          <div className="fd-badge negative">-0%</div>
        </div>
      </div>

      <div className="fd-footer">
        <button className="fd-action" type="button">Chi tiết báo cáo</button>
        <div className="fd-note">{error ? error : 'Cập nhật dữ liệu để nhìn báo cáo chính xác hơn.'}</div>
      </div>
    </div>
  );
};

export default FinanceDashboard;

