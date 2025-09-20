import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import './AdminSidebar.css';

function AdminSidebar() {
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = (e) => {
    e.preventDefault();
    localStorage.removeItem('token');
    localStorage.removeItem('userName');
    localStorage.removeItem('role');
    navigate('/login');
  };

  return (
    <nav className="admin-sidebar">
      <div className="admin-sidebar-title">Quản trị hệ thống</div>
      <ul className="admin-sidebar-menu">
        <li>
          <Link
            to="/admin/users"
            className={location.pathname === "/admin/users" ? "active" : ""}
          >
            👤 Quản lý người dùng
          </Link>
        </li>
        <li>
          <Link
            to="/admin/categories"
            className={location.pathname === "/admin/categories" ? "active" : ""}
          >
            🗂️ Quản lý danh mục
          </Link>
        </li>
        <li>
          <Link
            to="/admin/groups"
            className={location.pathname === "/admin/groups" ? "active" : ""}
          >
            👥 Quản lý nhóm
          </Link>
        </li>
        <li>
          <Link
            to="/admin/families"
            className={location.pathname === "/admin/families" ? "active" : ""}
          >
            🏠 Quản lý gia đình
          </Link>
        </li>
        <li>
          <button
            className="admin-logout-btn"
            onClick={handleLogout}
            style={{
              width: '100%',
              padding: '12px 32px',
              background: 'none',
              border: 'none',
              color: 'inherit',
              fontSize: '1.08rem',
              textAlign: 'left',
              cursor: 'pointer',
              borderRadius: '8px 0 0 8px',
              marginTop: '18px'
            }}
          >
            🚪 Đăng xuất
          </button>
        </li>
      </ul>
    </nav>
  );
}

export default AdminSidebar;
