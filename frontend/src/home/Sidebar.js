import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import './Sidebar.css';

function Sidebar({ userName = "Tên người dùng" }) {
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = (e) => {
    e.preventDefault();
    localStorage.removeItem('token');
    localStorage.removeItem('userName');
    navigate('/login');
  };

  return (
    <nav className="sidebar">
      <div className="sidebar-user">
        <span>{userName}</span>
      </div>
      <ul className="sidebar-menu">
        <li>
          <Link
            to="/home"
            className={location.pathname === "/home" ? "active" : ""}
          >
            Trang chủ
          </Link>
        </li>
        <li>
          <Link
            to="/transactions"
            className={location.pathname === "/transactions" ? "active" : ""}
          >
            Giao dịch
          </Link>
        </li>
        <li>
          <Link
            to="/settings"
            className={location.pathname === "/settings" ? "active" : ""}
          >
            Cài đặt
          </Link>
        </li>
        <li>
          {/* Sử dụng Link để giữ nguyên CSS, xử lý logout bằng onClick */}
          <Link
            to="/login"
            className={location.pathname === "/logout" ? "active" : ""}
            onClick={handleLogout}
          >
            Đăng xuất
          </Link>
        </li>
      </ul>
    </nav>
  );
}

export default Sidebar;
