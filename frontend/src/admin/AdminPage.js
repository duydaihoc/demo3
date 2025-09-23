import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminSidebar from './AdminSidebar';
import './AdminPage.css';

function AdminPage() {
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
        <div className="admin-header">
          <h1 className="admin-title">Trang Quản Trị (Admin)</h1>
          <div className="admin-welcome">
            <h2>Chào mừng bạn đến trang quản trị!</h2>
            <p>Quản lý người dùng, dữ liệu, và các chức năng hệ thống tại đây.</p>
          </div>
        </div>
        <div className="admin-cards">
          <div className="admin-card admin-card-users">
            <div className="admin-card-icon">👤</div>
            <div className="admin-card-content">
              <h3>Người dùng</h3>
              <p>Quản lý tài khoản người dùng</p>
            </div>
          </div>
          <div className="admin-card admin-card-data">
            <div className="admin-card-icon">📊</div>
            <div className="admin-card-content">
              <h3>Dữ liệu</h3>
              <p>Kiểm tra và phân tích dữ liệu</p>
            </div>
          </div>
          <div className="admin-card admin-card-settings">
            <div className="admin-card-icon">⚙️</div>
            <div className="admin-card-content">
              <h3>Cài đặt hệ thống</h3>
              <p>Cấu hình các thông số hệ thống</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminPage;
