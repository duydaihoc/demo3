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

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <div className="admin-main-content">
        <div className="admin-page-header">
          <h2 className="admin-title">Quản lý người dùng</h2>
          <div className="admin-header-stats">
            <span className="stat-badge">
              <i className="fas fa-users"></i> {users.filter(u => u.role === 'user').length} người dùng
            </span>
          </div>
        </div>
        
        {message && (
          <div className="admin-success-message">{message}</div>
        )}
        
        <div className="admin-table-container">
          <table className="admin-users-table">
            <thead>
              <tr>
                <th>Tên</th>
                <th>Email</th>
                <th>Vai trò</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {users
                .filter(user => user.role === 'user')
                .map(user =>
                  editId === user._id ? (
                    <tr key={user._id} className="edit-row">
                      <td>
                        <input
                          className="admin-input"
                          name="name"
                          value={editData.name}
                          onChange={handleEditChange}
                          placeholder="Tên người dùng"
                        />
                      </td>
                      <td>
                        <input
                          className="admin-input"
                          name="email"
                          type="email"
                          value={editData.email}
                          onChange={handleEditChange}
                          placeholder="Email"
                        />
                      </td>
                      <td>
                        <select
                          className="admin-select"
                          name="role"
                          value={editData.role}
                          onChange={handleEditChange}
                        >
                          <option value="user">Người dùng</option>
                          <option value="admin">Quản trị viên</option>
                        </select>
                      </td>
                      <td>
                        <div className="action-buttons-group">
                          <button className="btn-save" onClick={handleEditSave}>
                            <i className="fas fa-check"></i> Lưu
                          </button>
                          <button className="btn-cancel" onClick={() => setEditId(null)}>
                            <i className="fas fa-times"></i> Hủy
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={user._id}>
                      <td>
                        <div className="user-name-cell">
                          <i className="fas fa-user-circle"></i>
                          <span>{user.name || 'Chưa có tên'}</span>
                        </div>
                      </td>
                      <td>{user.email}</td>
                      <td>
                        <span className={`role-badge ${user.role}`}>
                          {user.role === 'admin' ? 'Quản trị viên' : 'Người dùng'}
                        </span>
                      </td>
                      <td>
                        <div className="action-buttons-group">
                          <button className="btn-edit" onClick={() => handleEdit(user)}>
                            <i className="fas fa-edit"></i> Sửa
                          </button>
                          <button className="btn-delete" onClick={() => handleDelete(user._id)}>
                            <i className="fas fa-trash-alt"></i> Xóa
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                )}
            </tbody>
          </table>
        </div>

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

        {/* user-wallets modal removed (use AdminWalletsPage instead) */}

      </div>
    </div>
  );
}

export default AdminUsersPage;

      
