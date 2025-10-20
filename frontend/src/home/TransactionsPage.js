/* eslint-disable no-undef */ // temporary: silence false-positive no-undef errors during build
import React, { useEffect, useState } from 'react';
import Sidebar from './Sidebar';
import './TransactionsPage.css';

function TransactionsPage() {
  const userName = localStorage.getItem('userName') || 'Tên người dùng'; // Get from localStorage with fallback

  // new: totals of wallets grouped by currency
  const [totalsByCurrency, setTotalsByCurrency] = useState({});
  const [loadingTotals, setLoadingTotals] = useState(false);
  const [totalsError, setTotalsError] = useState(null);

  // wallets list + transaction form state
  const [wallets, setWallets] = useState([]);
  const [transactions, setTransactions] = useState([]); // NEW: danh sách giao dịch
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  // edit modal/form state (fix ReferenceError: editModal is not defined)
  const [editModal, setEditModal] = useState({ show: false, tx: null, saving: false });
  const [editForm, setEditForm] = useState({ name: '', amount: '', date: '', type: 'expense', categoryId: '', walletId: '' });
  const [form, setForm] = useState({
    walletId: '',
    name: '',
    type: 'expense',
    categoryId: '',
    amount: '',
    date: new Date().toISOString().slice(0,10),
    note: ''
  });
  const [saving, setSaving] = useState(false);
  const [txMessage, setTxMessage] = useState(null);
  const [walletFilter, setWalletFilter] = useState(''); // '' = all wallets
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' }); // new
  const [incomeByCurrency, setIncomeByCurrency] = useState({});
  const [expenseByCurrency, setExpenseByCurrency] = useState({});
  // confirm delete state for transactions
  const [confirmDelete, setConfirmDelete] = useState({ show: false, txId: null, title: '' });

  // thêm state cho lọc theo ngày
  const [startDate, setStartDate] = useState(''); // format yyyy-mm-dd
  const [endDate, setEndDate] = useState('');     // format yyyy-mm-dd

  const formatCurrency = (amount, currency) => {
    try {
      return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: currency || 'VND' }).format(amount);
    } catch (e) {
      return `${amount} ${currency || ''}`;
    }
  };

  // show toast helper
  const showToast = (message, type = 'success', duration = 3000) => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), duration);
  };

  // fetch transactions for current user (admin can request all)
  // fetch transactions for current user (admin can request all)
  // accepts optional AbortSignal to cancel requests when unmounting/navigation
  const fetchTransactions = async (signal) => {
    setLoadingTransactions(true);
    try {
      const token = localStorage.getItem('token');
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const opts = { headers };
      if (signal) opts.signal = signal;
      const res = await fetch('http://localhost:5000/api/transactions', opts);
      if (!res.ok) throw new Error('Không thể tải giao dịch');
      const data = await res.json();
      setTransactions(data || []);
    } catch (err) {
      if (err.name === 'AbortError') {
        // fetch was aborted — ignore
        return;
      }
      console.error('Fetch transactions failed', err);
      setTransactions([]);
    } finally {
      setLoadingTransactions(false);
    }
  };

  // refresh wallets + totals (used after create / edit / delete)
  const refreshWallets = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const r = await fetch('http://localhost:5000/api/wallets', { headers });
      if (!r.ok) return;
      const data = await r.json();
      setWallets(data || []);
      try { window.dispatchEvent(new CustomEvent('walletsUpdated', { detail: data })); } catch(_) {}
      const sums = {};
      (data || []).forEach(w => {
        const curr = w.currency || 'VND';
        const amt = Number(w.initialBalance) || 0;
        sums[curr] = (sums[curr] || 0) + amt;
      });
      setTotalsByCurrency(sums);
    } catch (err) {
      console.error('Refresh wallets failed', err);
    }
  };

  useEffect(() => {
    const fetchWalletsAndTotals = async (signal) => {
       setLoadingTotals(true);
       setTotalsError(null);
       try {
         const token = localStorage.getItem('token');
         const headers = {};
         if (token) headers['Authorization'] = `Bearer ${token}`;

         const res = await fetch('http://localhost:5000/api/wallets', { headers, signal });
         if (!res.ok) throw new Error('Không thể tải ví');
         const data = await res.json();
         setWallets(data || []);

         const sums = {};
         (data || []).forEach(w => {
           const curr = w.currency || 'VND';
           const amt = Number(w.initialBalance) || 0;
           sums[curr] = (sums[curr] || 0) + amt;
         });
         setTotalsByCurrency(sums);
       } catch (err) {
        if (err.name === 'AbortError') {
          // aborted, ignore
          return;
        }
        console.error('Fetch wallet totals failed', err);
         setTotalsError('Không thể tải tổng số dư');
       } finally {
         setLoadingTotals(false);
       }
     };
    // use one AbortController for both requests so cleanup cancels all
    const ctrl = new AbortController();
    fetchWalletsAndTotals(ctrl.signal);
    // also load transactions (pass signal)
    fetchTransactions(ctrl.signal);
    return () => { ctrl.abort(); };
   }, []);

  // filtered transactions by walletFilter AND date range
  const filteredTransactions = transactions.filter(tx => {
    // wallet filter
    if (walletFilter && walletFilter !== '') {
      // Pending transactions (chưa trả nợ nhóm) hiển thị cho tất cả ví
      // vì chưa biết sẽ dùng ví nào để trả
      if (tx.isPending) {
        // show for all wallets - don't filter pending debts
      } else {
        // Settled transactions: filter theo ví đã dùng
        const wid = tx.wallet && (typeof tx.wallet === 'string' ? tx.wallet : tx.wallet._id);
        if (String(wid) !== String(walletFilter)) return false;
      }
    }
    // date filter: tx.date may be string or Date
    if (startDate || endDate) {
      const txDate = tx.date ? new Date(tx.date) : null;
      if (!txDate) return false;
      if (startDate) {
        const sd = new Date(startDate);
        sd.setHours(0,0,0,0);
        if (txDate < sd) return false;
      }
      if (endDate) {
        const ed = new Date(endDate);
        ed.setHours(23,59,59,999);
        if (txDate > ed) return false;
      }
    }
    
    // Không lọc theo groupTransaction, giữ tất cả các loại giao dịch
    return true;
  });

  // show wallet column when "Tất cả ví" is selected
  const showWalletColumn = !walletFilter;

  // helper to update single form field
  const handleFormChange = (k, v) => {
    setForm(prev => ({ ...prev, [k]: v }));
    // reset categoryId when wallet or type changes
    if (k === 'walletId' || k === 'type') {
      setForm(prev => ({ ...prev, categoryId: '' }));
    }
  };

  // categories available for selected wallet & type
  const availableCategories = (() => {
    if (!form.walletId) return [];
    const w = wallets.find(x => String(x._id) === String(form.walletId));
    if (!w || !Array.isArray(w.categories)) return [];
    return (w.categories || []).filter(c => c.type === form.type);
  })();

  // submit transaction
  const handleSubmit = async (e) => {
    e && e.preventDefault();
    setTxMessage(null);
    // validation
    if (!form.walletId) return setTxMessage({ type: 'error', text: 'Vui lòng chọn ví.' });
    if (!form.name || !form.name.trim()) return setTxMessage({ type: 'error', text: 'Vui lòng nhập tên giao dịch.' });
    if (!form.categoryId) return setTxMessage({ type: 'error', text: 'Vui lòng chọn danh mục.' });
    if (!form.amount || Number(form.amount) <= 0) return setTxMessage({ type: 'error', text: 'Số tiền phải lớn hơn 0.' });

    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const body = {
        wallet: form.walletId,
        category: form.categoryId,
        type: form.type,
        amount: Number(form.amount),
        title: form.name,
        description: form.note,
        // Always use server-localized ISO timestamp for "added now"
        date: new Date().toISOString()
      };

      const res = await fetch('http://localhost:5000/api/transactions', { method: 'POST', headers, body: JSON.stringify(body) });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Tạo giao dịch thất bại');
      }
      const created = await res.json();
      // show success toast when transaction added
      showToast('Đã thêm giao dịch', 'success');
      // prepend to transactions list so UI cập nhật ngay
      setTransactions(prev => [created, ...prev]);
      try { window.dispatchEvent(new CustomEvent('transactionsUpdated', { detail: created })); } catch(_) {}

      // refresh wallets & totals to reflect balance change
      try {
        const token2 = localStorage.getItem('token');
        const headers2 = {};
        if (token2) headers2['Authorization'] = `Bearer ${token2}`;
        const r = await fetch('http://localhost:5000/api/wallets', { headers: headers2 });
        if (r.ok) {
          const data = await r.json();
          setWallets(data || []);
          // dispatch for other components that listen (FinanceDashboard / Wallets)
          try { window.dispatchEvent(new CustomEvent('walletsUpdated', { detail: data })); } catch(_) {}
          const sums = {};
          (data || []).forEach(w => {
            const curr = w.currency || 'VND';
            const amt = Number(w.initialBalance) || 0;
            sums[curr] = (sums[curr] || 0) + amt;
          });
          setTotalsByCurrency(sums);
        }
      } catch (ignoreErr) { /* ignore */ }

      // reset form (keep selected wallet to ease multiple entries)
      setForm(prev => ({ ...prev, name: '', categoryId: '', amount: '', date: new Date().toISOString().slice(0,10), note: '' }));
    } catch (err) {
      console.error('Create transaction failed', err);
      const msg = err.message || 'Lỗi khi thêm giao dịch';
      setTxMessage({ type: 'error', text: msg });
      showToast(msg, 'error'); // toast on error
    } finally {
      setSaving(false);
    }
  };

  // Insert helper to open edit modal
  const openEdit = (tx) => {
    // compute IDs clearly to avoid mixing && and || in one expression
    const categoryId = tx.category
      ? (tx.category._id ? tx.category._id : tx.category)
      : '';
    const walletId = tx.wallet
      ? (tx.wallet._id ? tx.wallet._id : tx.wallet)
      : '';

    setEditForm({
      name: tx.title || '',
      amount: tx.amount || '',
      date: tx.date ? new Date(tx.date).toISOString().slice(0,10) : new Date().toISOString().slice(0,10),
      type: tx.type || 'expense',
      categoryId,
      walletId
    });
    setEditModal({ show: true, tx, saving: false });
  };

  // edit form change handler
  const handleEditChange = (k, v) => {
    setEditForm(prev => ({ ...prev, [k]: v }));
  };

  // submit edit
  const submitEdit = async (e) => {
    e && e.preventDefault();
    if (!editModal.tx) return;
    setEditModal(prev => ({ ...prev, saving: true }));
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const body = {
        wallet: editForm.walletId,
        category: editForm.categoryId,
        type: editForm.type,
        amount: Number(editForm.amount),
        title: editForm.name,
        description: ''
      };
      const res = await fetch(`http://localhost:5000/api/transactions/${editModal.tx._id}`, { method: 'PUT', headers, body: JSON.stringify(body) });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Cập nhật thất bại');
      }
      const updated = await res.json();
      setTransactions(prev => prev.map(t => t._id === updated._id ? updated : t));
      try { window.dispatchEvent(new CustomEvent('transactionsUpdated', { detail: updated })); } catch(_) {}
      showToast('Đã cập nhật giao dịch', 'success');
      // ensure wallets/totals are updated immediately after editing a transaction
      refreshWallets();
      setEditModal({ show: false, tx: null, saving: false });
    } catch (err) {
      console.error('Update transaction failed', err);
      showToast(err.message || 'Lỗi khi cập nhật giao dịch', 'error');
      setEditModal(prev => ({ ...prev, saving: false }));
    }
  };

  // open a confirmation dialog for deletion (replaces window.confirm)
  const openDeleteConfirm = (tx) => {
    setConfirmDelete({ show: true, txId: tx._id, title: tx.title || tx.description || '(không tên)' });
  };

  const cancelDelete = () => setConfirmDelete({ show: false, txId: null, title: '' });

  // perform delete after user confirms
  const handleDeleteConfirmed = async () => {
    const txId = confirmDelete.txId;
    if (!txId) return cancelDelete();
    try {
      const token = localStorage.getItem('token');
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`http://localhost:5000/api/transactions/${txId}`, { method: 'DELETE', headers });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Xóa thất bại');
      }
      // remove from list and refresh wallets/totals (backend reverts money)
      setTransactions(prev => prev.filter(t => t._id !== txId));
      showToast('Đã xóa giao dịch', 'success');
      // refresh wallets/totals
      await refreshWallets();
    } catch (err) {
      console.error('Delete transaction failed', err);
      showToast(err.message || 'Lỗi khi xóa giao dịch', 'error');
    } finally {
      cancelDelete();
    }
  };

  // Recompute monthly income/expense for displayed transactions whenever transactions or walletFilter change
  useEffect(() => {
    // compute new maps from current source data & filters
    const inc = {};
    const exp = {};
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const list = (transactions || []).filter(tx => {
      // Loại bỏ giao dịch nhóm đang pending (chưa thanh toán) khi tính toán số dư
      if (tx.isPending) return false;
      
      if (walletFilter && walletFilter !== '') {
        // Settled transactions: filter theo ví đã dùng
        const wid = tx.wallet && (typeof tx.wallet === 'string' ? tx.wallet : tx.wallet._id);
        if (String(wid) !== String(walletFilter)) return false;
      }
      
      if (startDate || endDate) {
        const txDate = tx.date ? new Date(tx.date) : null;
        if (!txDate) return false;
        if (startDate) {
          const sd = new Date(startDate);
          sd.setHours(0,0,0,0);
          if (txDate < sd) return false;
        }
        if (endDate) {
          const ed = new Date(endDate);
          ed.setHours(23,59,59,999);
          if (txDate > ed) return false;
        }
      }
      return true;
    });

    list.forEach(tx => {
      const txDate = tx.date ? new Date(tx.date) : null;
      if (!txDate) return;
      if (txDate >= monthStart && txDate < monthEnd) {
        let currency = 'VND';
        if (tx.wallet && typeof tx.wallet !== 'string' && tx.wallet.currency) currency = tx.wallet.currency;
        else if (typeof tx.wallet === 'string') {
          const w = wallets.find(wt => String(wt._id) === String(tx.wallet));
          if (w && w.currency) currency = w.currency;
        }
        const amt = Number(tx.amount) || 0;
        if (tx.type === 'income') inc[currency] = (inc[currency] || 0) + amt;
        else exp[currency] = (exp[currency] || 0) + amt;
      }
    });

    // shallow compare helper
    const mapsEqual = (a, b) => {
      const ak = Object.keys(a || {});
      const bk = Object.keys(b || {});
      if (ak.length !== bk.length) return false;
      for (let k of ak) {
        if (Number(a[k]) !== Number(b[k])) return false;
      }
      return true;
    };

    // use functional setState to compare with previous value without referencing it in deps
    setIncomeByCurrency(prev => mapsEqual(prev, inc) ? prev : inc);
    setExpenseByCurrency(prev => mapsEqual(prev, exp) ? prev : exp);
  }, [transactions, walletFilter, startDate, endDate, wallets]); // recompute when source data or filters change

  return (
    <div>
      <Sidebar userName={userName} />
      <main
        className="transactions-main"
        style={{
          marginLeft: 220,
          height: '100vh',          // fill viewport height
          overflowY: 'auto',       // enable vertical scrolling
          boxSizing: 'border-box', // include padding in height calculations
          padding: '24px'          // keep spacing consistent with other pages
        }}
      >
        <div className="transactions-header">
          <span className="transactions-title">Giao dịch</span>
          <div className="transactions-date">
            <button className="date-btn">September 2025</button>
          </div>
        </div>
        <div className="transactions-summary">
          <div className="wallet-card1">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div className="wallet-title" style={{ margin: 0 }}>Ví</div>
              {/* select để chọn All hoặc 1 ví cụ thể */}
              <select
                value={walletFilter}
                onChange={(e) => setWalletFilter(e.target.value)}
                aria-label="Chọn ví hoặc tất cả ví"
                style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #dce7ef', background: '#fff' }}
              >
                <option value="">Tất cả ví</option>
                {wallets.map(w => (
                  <option key={w._id} value={w._id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="wallet-balance" style={{ marginTop: 12 }}>
              {loadingTotals ? 'Đang tải...' : (totalsError ? '—' : (
                walletFilter ? (
                  // show single wallet balance
                  (() => {
                    const sel = wallets.find(x => String(x._id) === String(walletFilter));
                    return sel ? formatCurrency(sel.initialBalance || 0, sel.currency) : '0₫';
                  })()
                ) : (
                  // all wallets: existing totals display
                  (Object.keys(totalsByCurrency).length === 0) ? '0₫'
                  : (Object.keys(totalsByCurrency).length === 1
                     ? formatCurrency(totalsByCurrency[Object.keys(totalsByCurrency)[0]], Object.keys(totalsByCurrency)[0])
                     : Object.keys(totalsByCurrency).map(c => `${formatCurrency(totalsByCurrency[c], c)}`).join(' • ')
                    )
                )
              ))}
            </div>
            <div className="wallet-note">{totalsError ? totalsError : ''}</div>
          </div>

          <div className="summary-item">
            <div className="summary-label">Tổng số dư</div>
            <div className="summary-value">
              {/* reuse wallet-balance logic for total display */}
              {walletFilter ? (
                (() => {
                  const sel = wallets.find(x => String(x._id) === String(walletFilter));
                  return sel ? formatCurrency(sel.initialBalance || 0, sel.currency) : '0₫';
                })()
              ) : (
                (Object.keys(totalsByCurrency).length === 0) ? '0₫'
                : (Object.keys(totalsByCurrency).length === 1
                   ? formatCurrency(totalsByCurrency[Object.keys(totalsByCurrency)[0]], Object.keys(totalsByCurrency)[0])
                   : Object.keys(totalsByCurrency).map(c => `${formatCurrency(totalsByCurrency[c], c)}`).join(' • ')
                  )
              )}
            </div>
          </div>
          <div className="summary-item">
            <div className="summary-label">Thu nhập tháng này</div>
            <div className="summary-value" style={{ color: '#27ae60' }}>
              {Object.keys(incomeByCurrency).length === 0 ? '0₫' : Object.keys(incomeByCurrency).map(c => formatCurrency(incomeByCurrency[c], c)).join(' • ')}
            </div>
          </div>
          <div className="summary-item">
            <div className="summary-label">Chi phí tháng này</div>
            <div className="summary-value" style={{ color: '#e74c3c' }}>
              {Object.keys(expenseByCurrency).length === 0 ? '0₫' : Object.keys(expenseByCurrency).map(c => formatCurrency(expenseByCurrency[c], c)).join(' • ')}
            </div>
          </div>
        </div>
        <div className="transactions-form-section">
          <div className="transactions-form-title">Thêm giao dịch</div>
          <form className="transactions-form" onSubmit={handleSubmit}>
            <select value={form.walletId} onChange={(e) => handleFormChange('walletId', e.target.value)} required>
              <option value="">-- Chọn ví --</option>
              {wallets.map(w => (
                <option key={w._id} value={w._id}>{w.name} — {w.currency} {w.initialBalance}</option>
              ))}
            </select>

            <input
              type="text"
              placeholder="Tên giao dịch"
              value={form.name}
              onChange={(e) => handleFormChange('name', e.target.value)}
              required
            />

            <select value={form.type} onChange={(e) => handleFormChange('type', e.target.value)}>
              <option value="expense">Chi tiêu</option>
              <option value="income">Thu nhập</option>
            </select>

            <select value={form.categoryId} onChange={(e) => handleFormChange('categoryId', e.target.value)} required>
              <option value="">-- Chọn danh mục --</option>
              {availableCategories.map(c => (
                <option key={c._id} value={c._id}>{c.icon || ''} {c.name}</option>
              ))}
            </select>

            <input type="number" placeholder="Số tiền" value={form.amount} onChange={(e) => handleFormChange('amount', e.target.value)} required min="0" />
            <input type="text" placeholder="Ghi chú" value={form.note} onChange={(e) => handleFormChange('note', e.target.value)} style={{ gridColumn: '1 / span 3' }} />

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="save-btn" type="submit" disabled={saving} style={{ minWidth: 160 }}>
                {saving ? 'Đang lưu...' : 'Thêm giao dịch'}
              </button>
            </div>

            {txMessage && <div style={{ marginTop: 8, color: txMessage.type === 'error' ? '#b71c1c' : '#1565c0' }}>{txMessage.text}</div>}
          </form>
        </div>
        <div className="transactions-list-section">
          <div className="transactions-list-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Danh sách giao dịch</span>

            {/* DATE RANGE PICKER */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label style={{ fontSize: 13, color: '#666' }}>Từ</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                aria-label="Từ ngày"
                style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #e6eef6' }}
              />
              <label style={{ fontSize: 13, color: '#666' }}>Đến</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                aria-label="Đến ngày"
                style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #e6eef6' }}
              />
              <button
                type="button"
                onClick={() => { setStartDate(''); setEndDate(''); }}
                style={{ padding: '6px 10px', borderRadius: 6, background: '#eef7fb', border: '1px solid #d8edf6' }}
              >
                Đặt lại
              </button>
            </div>
          </div>

          <table className="transactions-table">
            <thead>
              <tr>
                <th>Ngày</th>
                <th>Tên</th>
                {showWalletColumn && <th>Ví</th>}
                <th>Loại</th>
                <th>Danh mục</th>
                <th>Số tiền</th>
                {/* Loại bỏ cột nhóm */}
                {/* <th>Nhóm</th> */}
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loadingTransactions ? (
                <tr><td colSpan={showWalletColumn ? 7 : 6} style={{ textAlign: 'center', color: '#888' }}>Đang tải...</td></tr>
              ) : filteredTransactions.length === 0 ? (
                <tr><td colSpan={showWalletColumn ? 7 : 6} style={{ textAlign: 'center', color: '#888' }}>(Chưa có giao dịch)</td></tr>
              ) : filteredTransactions.map(tx => {
                const titleText = tx.title || tx.description || '—';
                const categoryLabel = tx.category ? (tx.category.name || tx.category) : '';
                const walletObj = tx.wallet && (typeof tx.wallet === 'string' ? null : tx.wallet);
                const currency = walletObj && walletObj.currency ? walletObj.currency : 'VND';
                let walletName = '';
                if (walletObj && walletObj.name) walletName = walletObj.name;
                else if (typeof tx.wallet === 'string') {
                  const w = wallets.find(wt => String(wt._id) === String(tx.wallet));
                  walletName = w ? w.name : '';
                }
                const amountFormatted = formatCurrency(tx.amount, currency);
                
                // Xác định kiểu hiển thị và style cho giao dịch nhóm
                const isGroupTx = tx.groupTransaction === true;
                const isPending = tx.isPending === true;
                
                // Tính toán style và icon cho giao dịch nhóm
                let rowStyle = {};
                let actionIcon = '';
                let detailText = '';
                
                if (isGroupTx) {
                  detailText = tx.displayDetails || '';
                  
                  // Style cho các loại giao dịch nhóm khác nhau
                  if (tx.groupRole === 'payer' && tx.groupActionType === 'paid') {
                    rowStyle = { backgroundColor: '#fff8e1' }; // Màu vàng nhạt cho người trả tiền
                    actionIcon = '💰 ';
                  } else if (tx.groupRole === 'receiver') {
                    rowStyle = { backgroundColor: '#e8f5e9' }; // Màu xanh nhạt cho người nhận
                    actionIcon = '💸 ';
                  } else if (tx.groupRole === 'participant' && tx.groupActionType === 'paid') {
                    rowStyle = { backgroundColor: '#ffebee' }; // Màu đỏ nhạt cho người đã trả
                    actionIcon = '✅ ';
                  } else if (isPending) {
                    rowStyle = { backgroundColor: '#f5f5f5', color: '#757575' }; // Màu xám cho giao dịch chưa thanh toán
                    actionIcon = '⏱️ ';
                  }
                }

                return (
                  <tr key={tx._id} style={rowStyle}>
                    <td>{new Date(tx.date).toLocaleDateString()}</td>
                    <td>
                      {isGroupTx && <span style={{ marginRight: '5px' }}>{actionIcon}</span>}
                      <strong style={isPending ? { fontStyle: 'italic' } : {}}>{titleText}</strong>
                      {isPending && <span style={{ color: '#f57c00', marginLeft: '5px', fontSize: '12px' }}>(Chưa thanh toán)</span>}
                      {isGroupTx && detailText && (
                        <div style={{ fontSize: '12px', color: '#666', marginTop: '4px', lineHeight: '1.4' }}>
                          {detailText}
                        </div>
                      )}
                      {isGroupTx && tx.groupName && (
                        <div style={{ fontSize: '11px', color: '#999', marginTop: '2px', fontStyle: 'italic' }}>
                          Nhóm: {tx.groupName}
                        </div>
                      )}
                    </td>
                    {showWalletColumn && <td>{walletName}</td>}
                    <td>
                      <span style={{ 
                        color: tx.type === 'income' ? '#27ae60' : '#e74c3c',
                        fontWeight: '500'
                      }}>
                        {tx.type === 'income' ? 'Thu nhập' : 'Chi tiêu'}
                      </span>
                      {isGroupTx && (
                        <div style={{ fontSize: '11px', color: '#999', marginTop: '2px' }}>
                          {tx.groupRole === 'payer' ? '👤 Người tạo' : 
                           tx.groupRole === 'receiver' ? '💰 Người nhận' : 
                           tx.groupRole === 'participant' ? '📝 Người nợ' : ''}
                        </div>
                      )}
                    </td>
                    <td>{categoryLabel}</td>
                    <td style={isPending ? { color: '#757575', fontStyle: 'italic' } : { fontWeight: '500' }}>
                      {amountFormatted}
                      {isGroupTx && tx.groupTransactionType && (
                        <div style={{ fontSize: '11px', color: '#999', marginTop: '2px' }}>
                          {tx.groupTransactionType === 'payer_for_others' ? '🤝 Trả giúp' :
                           tx.groupTransactionType === 'equal_split' ? '➗ Chia đều' :
                           tx.groupTransactionType === 'percentage_split' ? '📊 Chia %' :
                           tx.groupTransactionType === 'payer_single' ? '💳 Trả đơn' : ''}
                        </div>
                      )}
                    </td>
                    <td className="tx-actions">
                      {/* Chỉ hiển thị nút Sửa/Xóa cho giao dịch cá nhân */}
                      {!isGroupTx && (
                        <>
                          <button className="tx-edit-btn" onClick={() => openEdit(tx)}>Sửa</button>
                          <button className="tx-delete-btn" onClick={() => openDeleteConfirm(tx)}>Xóa</button>
                        </>
                      )}
                      {/* Hiển thị nút Xem chi tiết cho giao dịch nhóm */}
                      {isGroupTx && (
                        <button 
                          className="tx-view-btn" 
                          onClick={() => window.location.href = `/groups/${tx.groupId}/transactions`}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: '#3498db',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                          }}
                        >
                          Chi tiết
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>

      {/* Toast notification */}
      {toast.show && (
        <div className={`tx-toast ${toast.type}`}>
          <div className="tx-toast-message">{toast.message}</div>
          <button className="tx-toast-close" onClick={() => setToast({ show: false, message: '', type: 'success' })} aria-label="Đóng">✕</button>
        </div>
      )}

      {/* Edit Transaction Modal */}
      {editModal.show && (
        <div className="tx-overlay">
          <div className="tx-edit-modal" role="dialog" aria-modal="true" aria-label="Sửa giao dịch">
            <h3 style={{ marginTop: 0 }}>Sửa giao dịch</h3>
            <form onSubmit={submitEdit} style={{ display: 'grid', gap: 8 }}>
              <select value={editForm.walletId} onChange={(e) => handleEditChange('walletId', e.target.value)} required>
                <option value="">-- Chọn ví --</option>
                {wallets.map(w => <option key={w._id} value={w._id}>{w.name}</option>)}
              </select>
              <input value={editForm.name} onChange={(e) => handleEditChange('name', e.target.value)} placeholder="Tên giao dịch" required />
              <select value={editForm.type} onChange={(e) => handleEditChange('type', e.target.value)}>
                <option value="expense">Chi tiêu</option>
                <option value="income">Thu nhập</option>
              </select>
              <select value={editForm.categoryId} onChange={(e) => handleEditChange('categoryId', e.target.value)} required>
                <option value="">-- Chọn danh mục --</option>
                {
                  // categories available for selected wallet in edit modal
                  (() => {
                    const w = wallets.find(x => String(x._id) === String(editForm.walletId));
                    if (!w || !Array.isArray(w.categories)) return null;
                    return (w.categories || []).filter(c => c.type === editForm.type).map(c => (
                      <option key={c._id} value={c._id}>{c.icon || ''} {c.name}</option>
                    ));
                  })()
                }
              </select>
              <input type="number" value={editForm.amount} onChange={(e) => handleEditChange('amount', e.target.value)} min="0" required />
              <input type="date" value={editForm.date} onChange={(e) => handleEditChange('date', e.target.value)} required />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setEditModal({ show: false, tx: null, saving: false })}>Hủy</button>
                <button type="submit" disabled={editModal.saving}>{editModal.saving ? 'Đang lưu...' : 'Lưu'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {confirmDelete.show && (
        <div className="tx-overlay" role="dialog" aria-modal="true">
          <div className="tx-edit-modal" style={{ maxWidth: 420 }}>
            <h3 style={{ marginTop: 0 }}>Xác nhận xóa</h3>
            <p>Bạn có chắc chắn muốn xóa giao dịch "<strong>{confirmDelete.title}</strong>"? Sau khi xóa, số tiền sẽ được hoàn về ví.</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button type="button" onClick={cancelDelete} style={{ padding: '8px 12px', borderRadius: 8 }}>Hủy</button>
              <button type="button" onClick={handleDeleteConfirmed} className="tx-delete-btn" style={{ padding: '8px 12px', borderRadius: 8 }}>Xóa</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TransactionsPage;
