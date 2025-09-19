import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminSidebar from './AdminSidebar';
import './AdminPage.css';

function AdminFamiliesPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('role');
    if (!token || role !== 'admin') {
      navigate('/login');
    }
  }, [navigate]);

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <div className="admin-main-content">
        <h2 className="admin-title">Quản lý gia đình</h2>
        <div className="admin-card">
          <p>Danh sách và thao tác với gia đình sẽ hiển thị ở đây.</p>
        </div>
      </div>
    </div>
  );
}

export default AdminFamiliesPage;
