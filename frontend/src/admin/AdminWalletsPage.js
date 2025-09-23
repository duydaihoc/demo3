import React, { useEffect, useState } from 'react';
import AdminSidebar from './AdminSidebar';
import './AdminPage.css';
import { useNavigate } from 'react-router-dom';

function AdminWalletsPage() {
  const [users, setUsers] = useState([]);
  const [userWallets, setUserWallets] = useState([]);
  const [walletsModal, setWalletsModal] = useState({ show: false, userId: null, userName: '' });
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
      .then(data => setUsers(data || []))
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
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

export default AdminWalletsPage;
