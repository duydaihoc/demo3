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

        {/* user-wallets modal removed (use AdminWalletsPage instead) */}

      </div>
    </div>
  );
}

export default AdminUsersPage;

      
