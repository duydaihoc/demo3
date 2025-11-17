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
        <div className="admin-page-header">
          <h2 className="admin-title">Quản lý ví</h2>
          <div className="admin-header-stats">
            <span className="stat-badge">
              <i className="fas fa-wallet"></i> {users.length} người dùng
            </span>
          </div>
        </div>

        <div className="admin-table-container">
          <table className="admin-users-table">
            <thead>
              <tr>
                <th>Tên</th>
                <th>Email</th>
                <th>Hành động</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan="3" style={{ textAlign: 'center', padding: '40px', color: '#a0aec0', fontStyle: 'italic' }}>
                    Không có người dùng nào
                  </td>
                </tr>
              ) : (
                users.map(u => (
                  <tr key={u._id}>
                    <td>
                      <div className="user-name-cell">
                        <i className="fas fa-user-circle"></i>
                        <span>{u.name || 'Chưa có tên'}</span>
                      </div>
                    </td>
                    <td>{u.email}</td>
                    <td>
                      <button className="btn-view-wallet" onClick={() => openUserWallets(u)}>
                        <i className="fas fa-wallet"></i> Xem ví
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {walletsModal.show && (
          <div className="admin-confirm-modal">
            <div className="admin-confirm-content wallets-modal" style={{ maxWidth: 1000, maxHeight: '90vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, paddingBottom: 16, borderBottom: '2px solid rgba(0,0,0,0.05)' }}>
                <h3 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#2d3748' }}>
                  <i className="fas fa-wallet" style={{ marginRight: 8, color: '#667eea' }}></i>
                  Ví của: {walletsModal.userName}
                </h3>
                <button className="btn-close-modal" onClick={closeWalletsModal}>
                  <i className="fas fa-times"></i> Đóng
                </button>
              </div>

              <div>
                {userWallets.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '60px 20px', color: '#a0aec0', fontStyle: 'italic' }}>
                    <i className="fas fa-wallet" style={{ fontSize: '3rem', marginBottom: 16, opacity: 0.3 }}></i>
                    <p style={{ fontSize: '1.1rem', margin: 0 }}>Không có ví nào</p>
                  </div>
                ) : (
                  <div className="wallets-modal-grid">
                    {userWallets.map(w => (
                      <div key={w._id} className="wallet-card-admin">
                        <div className="wallet-card-admin-header">
                          <div className="w-name">{w.name}</div>
                          <div className="w-balance">
                            <div>
                              {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: w.currency || 'VND' }).format(w.initialBalance || 0)}
                            </div>
                            <div className="w-currency">{w.currency || 'VND'}</div>
                          </div>
                        </div>
                        <div className="wallet-cats-split">
                          <div className="cats-col">
                            <div className="cats-title">Chi tiêu</div>
                            <div className="cats-list">
                              {(w.categories || []).filter(c => c.type === 'expense').length > 0 ? (
                                (w.categories || []).filter(c => c.type === 'expense').map(c => (
                                  <span key={c._id} className="cat-chip">
                                    {c.icon || '💰'} <span className="cat-name">{c.name}</span>
                                  </span>
                                ))
                              ) : (
                                <span className="cat-empty">—</span>
                              )}
                            </div>
                          </div>
                          <div className="cats-col">
                            <div className="cats-title">Thu nhập</div>
                            <div className="cats-list">
                              {(w.categories || []).filter(c => c.type === 'income').length > 0 ? (
                                (w.categories || []).filter(c => c.type === 'income').map(c => (
                                  <span key={c._id} className="cat-chip">
                                    {c.icon || '💰'} <span className="cat-name">{c.name}</span>
                                  </span>
                                ))
                              ) : (
                                <span className="cat-empty">—</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Admin actions */}
                        <div style={{ marginTop: 16, display: 'flex', gap: 8, paddingTop: 12, borderTop: '1px solid rgba(0,0,0,0.05)' }}>
                          <button className="btn-edit-wallet" onClick={() => openEditWallet(w)}>
                            <i className="fas fa-edit"></i> Sửa
                          </button>
                          <button className="btn-delete-wallet" onClick={() => askDeleteWallet(w)}>
                            <i className="fas fa-trash-alt"></i> Xóa
                          </button>
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

