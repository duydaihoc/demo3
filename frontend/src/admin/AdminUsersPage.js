import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminSidebar from './AdminSidebar';
import './AdminPage.css';

function AdminUsersPage() {
  const [users, setUsers] = useState([]);
  const [editId, setEditId] = useState(null);
  const [editData, setEditData] = useState({ name: '', email: '', role: 'user' });
  const [message, setMessage] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleteId, setDeleteId] = useState(null);

  // New state for user wallets modal
  const [userWallets, setUserWallets] = useState([]);
  const [walletsModal, setWalletsModal] = useState({ show: false, userId: null, userName: '' });

  const navigate = useNavigate();
  const token = localStorage.getItem('token');

  useEffect(() => {
    const role = localStorage.getItem('role');
    if (!token || role !== 'admin') {
      navigate('/login');
    }

    fetch('http://localhost:5000/api/admin/users', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => setUsers(data));
  }, [navigate, token]);

  const handleEdit = (user) => {
    setEditId(user._id);
    setEditData({ name: user.name, email: user.email, role: user.role });
  };

  const handleEditChange = (e) => {
    setEditData({ ...editData, [e.target.name]: e.target.value });
  };

  const handleEditSave = async () => {
    const res = await fetch(`http://localhost:5000/api/admin/users/${editId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(editData)
    });
    if (res.ok) {
      setMessage('Sửa thông tin thành công!');
      setTimeout(() => setMessage(''), 1500);
    }
    setEditId(null);
    fetch('http://localhost:5000/api/admin/users', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => setUsers(data));
  };

  const handleDelete = (id) => {
    setDeleteId(id);
    setShowConfirm(true);
  };

  const confirmDelete = async () => {
    await fetch(`http://localhost:5000/api/admin/users/${deleteId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    setUsers(users.filter(u => u._id !== deleteId));
    setMessage('Xóa người dùng thành công!');
    setTimeout(() => setMessage(''), 1500);
    setShowConfirm(false);
    setDeleteId(null);
  };

  const cancelDelete = () => {
    setShowConfirm(false);
    setDeleteId(null);
  };

  // New: open wallets modal and fetch wallets for that user (admin)
  const openUserWallets = async (user) => {
    try {
      const token = localStorage.getItem('token');
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

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <div className="admin-main-content">
        <h2 className="admin-title">Quản lý người dùng</h2>
        {message && (
          <div className="admin-success-message">{message}</div>
        )}
        <table className="admin-users-table">
          <thead>
            <tr>
              <th>Tên</th>
              <th>Email</th>
              <th>Role</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {users
              .filter(user => user.role === 'user')
              .map(user =>
                editId === user._id ? (
                  <tr key={user._id}>
                    <td>
                      <input
                        name="name"
                        value={editData.name}
                        onChange={handleEditChange}
                      />
                    </td>
                    <td>
                      <input
                        name="email"
                        value={editData.email}
                        onChange={handleEditChange}
                      />
                    </td>
                    <td>
                      <select
                        name="role"
                        value={editData.role}
                        onChange={handleEditChange}
                      >
                        <option value="user">user</option>
                        <option value="admin">admin</option>
                      </select>
                    </td>
                    <td>
                      <button onClick={handleEditSave}>Lưu</button>
                      <button onClick={() => setEditId(null)}>Hủy</button>
                    </td>
                  </tr>
                ) : (
                  <tr key={user._id}>
                    <td>{user.name}</td>
                    <td>{user.email}</td>
                    <td>{user.role}</td>
                    <td>
                      {/* Changed: open modal instead of navigate */}
                      <button className="admin-wallet-btn" onClick={() => openUserWallets(user)}>Ví</button>
                      <button onClick={() => handleEdit(user)}>Sửa</button>
                      <button onClick={() => handleDelete(user._id)}>Xóa</button>
                    </td>
                  </tr>
                )
              )}
          </tbody>
        </table>

        {/* existing confirm delete modal */}
        {showConfirm && (
          <div className="admin-confirm-modal">
            <div className="admin-confirm-content">
              <p>Bạn có chắc chắn muốn xóa người dùng này không?</p>
              <button className="confirm-btn" onClick={confirmDelete}>Xác nhận</button>
              <button className="cancel-btn" onClick={cancelDelete}>Hủy</button>
            </div>
          </div>
        )}

        {/* NEW: User wallets modal (reworked UI into cards with split categories) */}
        {walletsModal.show && (
          <div className="admin-confirm-modal">
            <div className="admin-confirm-content wallets-modal" style={{ maxWidth: 900 }}>
              <div className="wallets-modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>Ví của: {walletsModal.userName}</h3>
                <button className="confirm-btn" onClick={closeWalletsModal}>Đóng</button>
              </div>

              <div className="wallets-modal-grid" style={{ marginTop: 14 }}>
                {userWallets.length === 0 ? (
                  <div className="no-wallet">Không có ví</div>
                ) : userWallets.map(w => {
                  const expenseCats = (w.categories || []).filter(c => c.type === 'expense');
                  const incomeCats = (w.categories || []).filter(c => c.type === 'income');
                  return (
                    <div key={w._id} className="wallet-card-admin">
                      <div className="wallet-card-admin-header">
                        <div className="w-name">{w.name}</div>
                        <div className="w-balance">
                          {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: w.currency || 'VND' }).format(w.initialBalance || 0)}
                          <div className="w-currency">{w.currency}</div>
                        </div>
                      </div>

                      <div className="wallet-cats-split">
                        <div className="cats-col">
                          <div className="cats-title">Chi tiêu</div>
                          <div className="cats-list">
                            {expenseCats.length === 0 ? <span className="cat-empty">—</span> : expenseCats.map(c => (
                              <span key={c._id} className="cat-chip">{c.icon} <span className="cat-name">{c.name}</span></span>
                            ))}
                          </div>
                        </div>

                        <div className="cats-col">
                          <div className="cats-title">Thu nhập</div>
                          <div className="cats-list">
                            {incomeCats.length === 0 ? <span className="cat-empty">—</span> : incomeCats.map(c => (
                              <span key={c._id} className="cat-chip">{c.icon} <span className="cat-name">{c.name}</span></span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

export default AdminUsersPage;
