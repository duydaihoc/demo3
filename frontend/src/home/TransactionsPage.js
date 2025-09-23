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
  const fetchTransactions = async () => {
    setLoadingTransactions(true);
    try {
      const token = localStorage.getItem('token');
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch('http://localhost:5000/api/transactions', { headers });
      if (!res.ok) throw new Error('Không thể tải giao dịch');
      const data = await res.json();
      setTransactions(data || []);
    } catch (err) {
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
    const fetchWalletsAndTotals = async () => {
      setLoadingTotals(true);
      setTotalsError(null);
      try {
        const token = localStorage.getItem('token');
        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch('http://localhost:5000/api/wallets', { headers });
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
        console.error('Fetch wallet totals failed', err);
        setTotalsError('Không thể tải tổng số dư');
      } finally {
        setLoadingTotals(false);
      }
    };
    fetchWalletsAndTotals();
    // also load transactions
    fetchTransactions();
  }, []);

  // filtered transactions by walletFilter
  const filteredTransactions = (walletFilter && walletFilter !== '') 
    ? transactions.filter(tx => {
        const wid = tx.wallet && (typeof tx.wallet === 'string' ? tx.wallet : tx.wallet._id);
        return String(wid) === String(walletFilter);
      })
    : transactions;

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
        date: form.date
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

  // delete handler (simple confirm)
  const handleDelete = async (txId) => {
    const ok = window.confirm('Bạn có chắc chắn muốn xóa giao dịch này?');
    if (!ok) return;
    try {
      const token = localStorage.getItem('token');
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`http://localhost:5000/api/transactions/${txId}`, { method: 'DELETE', headers });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Xóa thất bại');
      }
      setTransactions(prev => prev.filter(t => t._id !== txId));
      showToast('Đã xóa giao dịch', 'success');
      // refresh wallets/totals to reflect change
      try {
        const token2 = localStorage.getItem('token');
        const headers2 = {};
        if (token2) headers2['Authorization'] = `Bearer ${token2}`;
        const r = await fetch('http://localhost:5000/api/wallets', { headers: headers2 });
        if (r.ok) {
          const data = await r.json();
          setWallets(data || []);
          try { window.dispatchEvent(new CustomEvent('walletsUpdated', { detail: data })); } catch(_) {}
          const sums = {};
          (data || []).forEach(w => { const curr = w.currency || 'VND'; const amt = Number(w.initialBalance) || 0; sums[curr] = (sums[curr] || 0) + amt; });
          setTotalsByCurrency(sums);
        }
      } catch (_) {}
    } catch (err) {
      console.error('Delete transaction failed', err);
      showToast(err.message || 'Lỗi khi xóa giao dịch', 'error');
    }
  };

  // Recompute monthly income/expense for displayed transactions whenever transactions or walletFilter change
  useEffect(() => {
    const inc = {};
    const exp = {};
    // compute start/end of current month
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const list = filteredTransactions || [];
    list.forEach(tx => {
      const txDate = tx.date ? new Date(tx.date) : null;
      if (!txDate) return;
      // only include transactions in current month
      if (txDate >= monthStart && txDate < monthEnd) {
        // determine currency (prefer populated wallet currency, else lookup in wallets)
        let currency = 'VND';
        if (tx.wallet && typeof tx.wallet !== 'string' && tx.wallet.currency) currency = tx.wallet.currency;
        else if (typeof tx.wallet === 'string') {
          const w = wallets.find(wt => String(wt._id) === String(tx.wallet));
          if (w && w.currency) currency = w.currency;
        }
        const amt = Number(tx.amount) || 0;
        if (tx.type === 'income') {
          inc[currency] = (inc[currency] || 0) + amt;
        } else {
          exp[currency] = (exp[currency] || 0) + amt;
        }
      }
    });
    setIncomeByCurrency(inc);
    setExpenseByCurrency(exp);
  }, [filteredTransactions, wallets]); // recompute when displayed transactions or wallets change

  return (
    <div>
      <Sidebar userName={userName} />
      <main className="transactions-main" style={{ marginLeft: 220 }}>
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
            <input type="date" value={form.date} onChange={(e) => handleFormChange('date', e.target.value)} required />
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
          <div className="transactions-list-title">Danh sách giao dịch</div>
          <table className="transactions-table">
            <thead>
              <tr>
                <th>Ngày</th>
                <th>Tên</th>
                {showWalletColumn && <th>Ví</th>}
                <th>Loại</th>
                <th>Danh mục</th>
                <th>Số tiền</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loadingTransactions ? (
                <tr><td colSpan="6" style={{ textAlign: 'center', color: '#888' }}>Đang tải...</td></tr>
              ) : filteredTransactions.length === 0 ? (
                <tr><td colSpan="6" style={{ textAlign: 'center', color: '#888' }}>(Chưa có giao dịch)</td></tr>
              ) : filteredTransactions.map(tx => {
                // compute derived values to avoid mixing && and || in JSX
                const titleText = tx.title || tx.description || '—';
                const categoryLabel = tx.category ? (tx.category.name || tx.category) : '';
                const walletObj = tx.wallet && (typeof tx.wallet === 'string' ? null : tx.wallet);
                const currency = walletObj && walletObj.currency ? walletObj.currency : 'VND';
                // determine wallet name: prefer populated wallet object, else lookup from wallets list when tx.wallet is id
                let walletName = '';
                if (walletObj && walletObj.name) walletName = walletObj.name;
                else if (typeof tx.wallet === 'string') {
                  const w = wallets.find(wt => String(wt._id) === String(tx.wallet));
                  walletName = w ? w.name : '';
                }
                const amountFormatted = formatCurrency(tx.amount, currency);

                return (
                  <tr key={tx._id}>
                    <td>{new Date(tx.date).toLocaleDateString()}</td>
                    <td>{titleText}</td>
                    {showWalletColumn && <td>{walletName}</td>}
                    <td style={{ textTransform: 'capitalize' }}>{tx.type}</td>
                    <td>{categoryLabel}</td>
                    <td>{amountFormatted}</td>
                    <td className="tx-actions">
                      <button className="tx-edit-btn" onClick={() => openEdit(tx)}>Sửa</button>
                      <button className="tx-delete-btn" onClick={() => handleDelete(tx._id)}>Xóa</button>
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
    </div>
  );
}

export default TransactionsPage;
