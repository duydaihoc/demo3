import React, { useEffect, useState } from 'react';
import AdminSidebar from './AdminSidebar';
import './AdminPage.css';
import { useNavigate } from 'react-router-dom';

function AdminWalletsPage() {
  const [users, setUsers] = useState([]);
  const [userWallets, setUserWallets] = useState([]);
  const [walletsModal, setWalletsModal] = useState({ show: false, userId: null, userName: '' });
  const [editModal, setEditModal] = useState({ show: false, wallet: null, loading: false });
  const [editForm, setEditForm] = useState({ name: '', currency: 'VND', initialBalance: 0 });
  const [deleteConfirm, setDeleteConfirm] = useState({ show: false, walletId: null, walletName: '' });
  const token = localStorage.getItem('token');
  const navigate = useNavigate();

  useEffect(() => {
    const role = localStorage.getItem('role');
    if (!token || role !== 'admin') {
      navigate('/login');
      return;
    }
    fetch('http://localhost:5000/api/admin/users', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      // only keep non-admin users in the table
      .then(data => {
        const list = data || [];
        setUsers(list.filter(u => u && u.role !== 'admin'));
      })
      .catch(err => {
        console.error('Failed to load users', err);
        setUsers([]);
      });
  }, [navigate, token]);

  const openUserWallets = async (user) => {
    try {
      const res = await fetch(`http://localhost:5000/api/wallets/user/${user._id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        console.error('Failed to load wallets');
        setUserWallets([]);
      } else {
        const data = await res.json();
        setUserWallets(data || []);
      }
      setWalletsModal({ show: true, userId: user._id, userName: user.name });
    } catch (err) {
      console.error('Error fetching user wallets', err);
      setUserWallets([]);
      setWalletsModal({ show: true, userId: user._id, userName: user.name });
    }
  };

  const closeWalletsModal = () => {
    setWalletsModal({ show: false, userId: null, userName: '' });
    setUserWallets([]);
  };

  const openEditWallet = (wallet) => {
    setEditForm({
      name: wallet.name || '',
      currency: wallet.currency || 'VND',
      initialBalance: wallet.initialBalance || 0
    });
    setEditModal({ show: true, wallet, loading: false });
  };

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditForm(prev => ({ ...prev, [name]: value }));
  };

  const submitEdit = async (e) => {
    e.preventDefault();
    if (!editModal.wallet) return;
    setEditModal(prev => ({ ...prev, loading: true }));
    try {
      const res = await fetch(`http://localhost:5000/api/wallets/${editModal.wallet._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: editForm.name,
          currency: editForm.currency,
          initialBalance: Number(editForm.initialBalance) || 0
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Update failed');
      }
      const updated = await res.json();
      setUserWallets(prev => prev.map(w => (w._id === updated._id ? updated : w)));
      setEditModal({ show: false, wallet: null, loading: false });
    } catch (err) {
      console.error('Edit wallet failed', err);
      alert('Lỗi khi cập nhật ví: ' + (err.message || ''));
      setEditModal(prev => ({ ...prev, loading: false }));
    }
  };

  const askDeleteWallet = (wallet) => {
    setDeleteConfirm({ show: true, walletId: wallet._id, walletName: wallet.name });
  };

  const cancelDelete = () => {
    setDeleteConfirm({ show: false, walletId: null, walletName: '' });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm.walletId) return;
    try {
      const res = await fetch(`http://localhost:5000/api/wallets/${deleteConfirm.walletId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Delete failed');
      }
      setUserWallets(prev => prev.filter(w => w._id !== deleteConfirm.walletId));
      setDeleteConfirm({ show: false, walletId: null, walletName: '' });
    } catch (err) {
      console.error('Delete wallet failed', err);
      alert('Lỗi khi xóa ví: ' + (err.message || ''));
      setDeleteConfirm({ show: false, walletId: null, walletName: '' });
    }
  };

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <div className="admin-main-content">
        <h2 className="admin-title">Quản lý ví (Admin)</h2>

        <div style={{ marginBottom: 12 }}>
          <strong>Danh sách người dùng:</strong>
        </div>

        <table className="admin-users-table" style={{ marginBottom: 18 }}>
          <thead>
            <tr>
              <th>Tên</th>
              <th>Email</th>
              <th>Hành động</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u._id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>
                  <button onClick={() => openUserWallets(u)}>Xem ví</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {walletsModal.show && (
          <div className="admin-confirm-modal">
            <div className="admin-confirm-content wallets-modal" style={{ maxWidth: 900 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>Ví của: {walletsModal.userName}</h3>
                <button className="confirm-btn" onClick={closeWalletsModal}>Đóng</button>
              </div>

              <div style={{ marginTop: 14 }}>
                {userWallets.length === 0 ? (
                  <div style={{ color: '#666', padding: 14 }}>Không có ví</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 12 }}>
                    {userWallets.map(w => (
                      <div key={w._id} className="wallet-card-admin" style={{ padding: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ fontWeight: 700 }}>{w.name}</div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontWeight: 700 }}>
                              {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: w.currency || 'VND' }).format(w.initialBalance || 0)}
                            </div>
                            <div style={{ fontSize: 12, color: '#6b8798' }}>{w.currency}</div>
                          </div>
                        </div>
                        <div style={{ marginTop: 8 }}>
                          <div style={{ fontSize: 12, fontWeight: 800, color: '#163a5a' }}>Chi tiêu</div>
                          <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {(w.categories || []).filter(c => c.type === 'expense').map(c => (
                              <span key={c._id} className="cat-chip">{c.icon} <span className="cat-name">{c.name}</span></span>
                            ))}
                            {((w.categories || []).filter(c => c.type === 'expense')).length === 0 && <span style={{ color: '#8a9aa6' }}>—</span>}
                          </div>
                        </div>
                        <div style={{ marginTop: 10 }}>
                          <div style={{ fontSize: 12, fontWeight: 800, color: '#163a5a' }}>Thu nhập</div>
                          <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {(w.categories || []).filter(c => c.type === 'income').map(c => (
                              <span key={c._id} className="cat-chip">{c.icon} <span className="cat-name">{c.name}</span></span>
                            ))}
                            {((w.categories || []).filter(c => c.type === 'income')).length === 0 && <span style={{ color: '#8a9aa6' }}>—</span>}
                          </div>
                        </div>

                        {/* Admin actions */}
                        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                          <button onClick={() => openEditWallet(w)} style={{ padding: '8px 10px', background: '#2a5298', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Sửa</button>
                          <button onClick={() => askDeleteWallet(w)} style={{ padding: '8px 10px', background: '#fff0f0', color: '#b71c1c', border: '1px solid rgba(183,28,28,0.12)', borderRadius: 6, cursor: 'pointer' }}>Xóa</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Edit Modal (REPLACED: improved UI) */}
        {editModal.show && (
          <div className="admin-confirm-modal" aria-hidden={!editModal.show}>
            <div
              className="admin-confirm-content"
              style={{
                maxWidth: 460,
                width: '100%',
                padding: 20,
                borderRadius: 12,
                background: '#ffffff',
                boxShadow: '0 12px 30px rgba(7,22,37,0.12)'
              }}
            >
              <div style={{ textAlign: 'center', marginBottom: 8 }}>
                <h3 style={{ margin: 0, color: '#163a5a' }}>Sửa ví</h3>
                <div style={{ fontSize: 12, color: '#6b8798', marginTop: 6 }}>Chỉnh sửa thông tin cơ bản của ví</div>
              </div>

              <form onSubmit={submitEdit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontWeight: 800, color: '#163a5a', textAlign: 'center' }}>Tên</label>
                  <input
                    name="name"
                    value={editForm.name}
                    onChange={handleEditChange}
                    required
                    style={{
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1px solid #e6f0f4',
                      boxShadow: 'inset 0 1px 0 rgba(0,0,0,0.02)'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontWeight: 800, color: '#163a5a', textAlign: 'center' }}>Loại tiền</label>
                    <select
                      name="currency"
                      value={editForm.currency}
                      onChange={handleEditChange}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 8,
                        border: '1px solid #e6f0f4',
                        background: '#fff'
                      }}
                    >
                      <option value="VND">VND</option>
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                    </select>
                  </div>

                  <div style={{ width: 130, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontWeight: 800, color: '#163a5a', textAlign: 'center' }}>Số dư</label>
                    <input
                      name="initialBalance"
                      type="number"
                      value={editForm.initialBalance}
                      onChange={handleEditChange}
                      min="0"
                      style={{
                        padding: '10px 12px',
                        borderRadius: 8,
                        border: '1px solid #e6f0f4'
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
                  <button
                    type="button"
                    onClick={() => setEditModal({ show: false, wallet: null, loading: false })}
                    style={{
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: '1px solid rgba(15,40,64,0.06)',
                      background: '#f2f7fa',
                      color: '#12324a',
                      cursor: 'pointer',
                      fontWeight: 700
                    }}
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={editModal.loading}
                    style={{
                      padding: '10px 16px',
                      borderRadius: 8,
                      border: 'none',
                      background: editModal.loading ? 'linear-gradient(90deg,#9fcfca,#6aa8b2)' : 'linear-gradient(90deg,#2a5298,#4ecdc4)',
                      color: '#fff',
                      cursor: editModal.loading ? 'default' : 'pointer',
                      fontWeight: 800,
                      boxShadow: '0 8px 20px rgba(42,82,152,0.08)'
                    }}
                  >
                    {editModal.loading ? 'Đang lưu...' : 'Lưu'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Delete confirm */}
        {deleteConfirm.show && (
          <div className="admin-confirm-modal">
            <div className="admin-confirm-content" style={{ maxWidth: 420 }}>
              <h3>Xác nhận xóa</h3>
              <p>Bạn có chắc chắn muốn xóa ví "{deleteConfirm.walletName}"? Hành động này không thể hoàn tác.</p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="confirm-btn" onClick={cancelDelete}>Hủy</button>
                <button className="confirm-btn danger" onClick={confirmDelete}>Xóa</button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

export default AdminWalletsPage;
