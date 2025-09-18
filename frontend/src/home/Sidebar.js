import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import './Sidebar.css';

function Sidebar({ userName = "Tên người dùng" }) {
  const location = useLocation();

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
          <Link
            to="/logout"
            className={location.pathname === "/logout" ? "active" : ""}
          >
            Đăng xuất
          </Link>
        </li>
      </ul>
    </nav>
  );
}

export default Sidebar;
