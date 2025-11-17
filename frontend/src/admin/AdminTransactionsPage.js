import React, { useEffect, useState } from 'react';
import './AdminSidebar.css'; // reuse existing styles if needed
import './AdminTransactionsPage.css';
import AdminSidebar from './AdminSidebar';

function AdminTransactionsPage() {
  const [txs, setTxs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // new: users list & selected user for filtering
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(''); // '' = all users
  const [loadingUsers, setLoadingUsers] = useState(false);

  // fetch users (admin) so admin can pick a user to view transactions
  useEffect(() => {
    const fetchUsers = async () => {
      setLoadingUsers(true);
      try {
        const token = localStorage.getItem('token');
        // use full backend URL to avoid dev-server returning index.html
        const res = await fetch('http://localhost:5000/api/admin/users', { headers: token ? { Authorization: `Bearer ${token}` } : {} });
        if (!res.ok) throw new Error('Không thể tải danh sách người dùng');
        const data = await res.json();
        // filter out admin accounts so dropdown doesn't include admin users
        const list = Array.isArray(data) ? data : [];
        const filtered = list.filter(u => {
          // prefer explicit role field, fallback to string checks
          if (u.role && typeof u.role === 'string') return u.role.toLowerCase() !== 'admin';
          const name = (u.name || '').toLowerCase();
          const email = (u.email || '').toLowerCase();
          return !(name === 'admin' || email === 'admin' || email.startsWith('admin@'));
        });
        setUsers(filtered);
      } catch (err) {
        // ignore user list error (still allow showing transactions)
        console.warn('Fetch users failed', err);
        setUsers([]);
      } finally {
        setLoadingUsers(false);
      }
    };
    fetchUsers();
  }, []);

  // fetch transactions for either all users (admin) or a specific user
  const fetchTxs = async (userId = '') => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const url = userId ? `http://localhost:5000/api/transactions?userId=${encodeURIComponent(userId)}` : 'http://localhost:5000/api/transactions';
      const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      // protect against HTML responses (dev-server returning index.html)
      const contentType = res.headers.get('content-type') || '';
      if (!res.ok) {
        const body = contentType.includes('application/json') ? await res.json().catch(()=>({message: res.statusText})) : null;
        throw new Error((body && body.message) ? body.message : `Request failed: ${res.status} ${res.statusText}`);
      }
      if (!contentType.includes('application/json')) {
        // likely HTML error page — surface clearer message
        const text = await res.text().catch(()=>'<no body>');
        throw new Error('Server did not return JSON. Response: ' + (text.substring(0,200)) );
      }
      const data = await res.json();
      setTxs(data);
    } catch (err) {
      setError(err.message || 'Error fetching transactions');
      setTxs([]);
    } finally {
      setLoading(false);
    }
  };

  // initial load + reload when selectedUser changes
  useEffect(() => {
    fetchTxs(selectedUser);
  }, [selectedUser]);

  const formatDate = (d) => {
    try {
      return new Date(d).toLocaleString();
    } catch {
      return d;
    }
  };

  if (loading) {
    return (
      <div className="admin-tx-root">
        <AdminSidebar />
        <main className="admin-transactions-main">
          <div className="admin-loading-state">
            <div className="loading-spinner"></div>
            <p>Đang tải giao dịch...</p>
          </div>
        </main>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="admin-tx-root">
        <AdminSidebar />
        <main className="admin-transactions-main">
          <div className="admin-error-state">
            <div className="error-icon">⚠️</div>
            <h3>Lỗi khi tải dữ liệu</h3>
            <p>{error}</p>
            <button className="btn-retry" onClick={() => fetchTxs(selectedUser)}>
              Thử lại
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="admin-tx-root">
      <AdminSidebar />
      <main className="admin-transactions-main">
        <header className="admin-tx-header">
          <h2 className="admin-tx-title">Quản lý giao dịch</h2>
          <div className="admin-tx-actions">
            <button className="btn-refresh" onClick={() => fetchTxs(selectedUser)}>Refresh</button>
          </div>
        </header>

        <section className="admin-tx-controls">
          <label className="ctrl-label">Lọc theo người dùng:</label>
          <select
            className="ctrl-select"
            value={selectedUser}
            onChange={(e) => setSelectedUser(e.target.value)}
            disabled={loadingUsers}
          >
            <option value="">— Tất cả người dùng —</option>
            {users.map(u => (
              <option key={u._id} value={u._id}>{u.name || u.email || u._id}</option>
            ))}
          </select>
        </section>

        <section className="admin-tx-table-wrap">
          {txs.length === 0 ? (
            <div className="tx-empty">Không có giao dịch nào.</div>
          ) : (
            <div className="admin-tx-table-scroll">
              <table className="admin-tx-table">
                <thead>
                  <tr>
                    <th>Tiêu đề</th>
                    <th>Số tiền</th>
                    <th>Loại</th>
                    <th>Ví</th>
                    <th>Danh mục</th>
                    <th>Ngày</th>
                    <th>Mô tả</th>
                    <th>Người tạo</th>
                  </tr>
                </thead>
                <tbody>
                  {txs.map(tx => (
                    <tr key={tx._id}>
                      <td>{tx.title || '—'}</td>
                      <td className={`tx-amount ${tx.type === 'income' ? 'income' : 'expense'}`}>{tx.type === 'income' ? '+' : '-'} {tx.amount}</td>
                      <td style={{ textTransform: 'capitalize' }}>{tx.type}</td>
                      <td>{tx.wallet && (tx.wallet.name || tx.wallet._id)}</td>
                      <td>{tx.category && (tx.category.name || tx.category._id)}</td>
                      <td>{formatDate(tx.date)}</td>
                      <td>{tx.description || '—'}</td>
                      <td>
                        {tx.createdBy ? (
                          typeof tx.createdBy === 'object' && tx.createdBy !== null
                            ? (tx.createdBy.name || tx.createdBy.email || tx.createdBy._id || '—')
                            : (tx.createdBy || '—')
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default AdminTransactionsPage;
