import React, { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
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
          <h1 className="admin-title">Trang Quản Trị</h1>
          <div className="admin-welcome">
            <h2>Chào mừng bạn đến với bảng điều khiển!</h2>
            <p>Quản lý người dùng, ví, danh mục, giao dịch và các chức năng hệ thống tại đây.</p>
          </div>
        </div>
        <div className="admin-cards">
          <Link to="/admin/users" className="admin-card admin-card-users" style={{ textDecoration: 'none' }}>
            <div className="admin-card-icon">👥</div>
            <div className="admin-card-content">
              <h3>Người dùng</h3>
              <p>Quản lý tài khoản và thông tin người dùng</p>
            </div>
            <div className="admin-card-arrow">→</div>
          </Link>
          
          <Link to="/admin/wallets" className="admin-card admin-card-wallets" style={{ textDecoration: 'none' }}>
            <div className="admin-card-icon">💼</div>
            <div className="admin-card-content">
              <h3>Quản lý ví</h3>
              <p>Xem và quản lý tất cả ví của người dùng</p>
            </div>
            <div className="admin-card-arrow">→</div>
          </Link>
          
          <Link to="/admin/categories" className="admin-card admin-card-categories" style={{ textDecoration: 'none' }}>
            <div className="admin-card-icon">🗂️</div>
            <div className="admin-card-content">
              <h3>Danh mục</h3>
              <p>Quản lý danh mục chi tiêu và thu nhập</p>
            </div>
            <div className="admin-card-arrow">→</div>
          </Link>
          
          <Link to="/admin/transactions" className="admin-card admin-card-transactions" style={{ textDecoration: 'none' }}>
            <div className="admin-card-icon">💸</div>
            <div className="admin-card-content">
              <h3>Giao dịch</h3>
              <p>Xem và quản lý tất cả giao dịch trong hệ thống</p>
            </div>
            <div className="admin-card-arrow">→</div>
          </Link>
          
          <Link to="/admin/groups" className="admin-card admin-card-groups" style={{ textDecoration: 'none' }}>
            <div className="admin-card-icon">👥</div>
            <div className="admin-card-content">
              <h3>Nhóm</h3>
              <p>Quản lý các nhóm và giao dịch nhóm</p>
            </div>
            <div className="admin-card-arrow">→</div>
          </Link>
          
          <Link to="/admin/families" className="admin-card admin-card-families" style={{ textDecoration: 'none' }}>
            <div className="admin-card-icon">🏠</div>
            <div className="admin-card-content">
              <h3>Gia đình</h3>
              <p>Quản lý các gia đình và thành viên</p>
            </div>
            <div className="admin-card-arrow">→</div>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default AdminPage;
