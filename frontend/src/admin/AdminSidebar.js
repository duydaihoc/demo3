import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import './AdminSidebar.css';

function AdminSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [usersOpen, setUsersOpen] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);

  useEffect(() => {
    // Nếu đang ở trong users/wallets/categories/transactions thì auto mở submenu
    const shouldOpen =
      location.pathname.startsWith('/admin/users') ||
      location.pathname.startsWith('/admin/wallets') ||
      location.pathname.startsWith('/admin/categories') ||
      location.pathname.startsWith('/admin/transactions');
    setUsersOpen(shouldOpen);
    // auto open groups submenu when in groups or groups activity
    const groupsShouldOpen =
      location.pathname.startsWith('/admin/groups') ||
      location.pathname.startsWith('/admin/groups/activity');
    setGroupsOpen(groupsShouldOpen);
  }, [location.pathname]);

  const handleLogout = (e) => {
    e.preventDefault();
    localStorage.removeItem('token');
    localStorage.removeItem('userName');
    localStorage.removeItem('role');
    navigate('/login');
  };

  const handleUsersToggle = (e) => {
    e.preventDefault();
    setUsersOpen((s) => !s);
    navigate('/admin/users');
  };

  const handleGroupsToggle = (e) => {
    e && e.preventDefault();
    setGroupsOpen((s) => !s);
    // navigate to groups main page when toggling open (keeps behaviour consistent)
    navigate('/admin/groups');
  };

  const parentActive =
    location.pathname.startsWith('/admin/users') ||
    location.pathname.startsWith('/admin/wallets') ||
    location.pathname.startsWith('/admin/categories') ||
    location.pathname.startsWith('/admin/transactions');

  const groupsParentActive =
    location.pathname.startsWith('/admin/groups') || location.pathname.startsWith('/admin/groups/activity');

  return (
    <nav className="admin-sidebar">
      <div className="admin-sidebar-title">Quản trị hệ thống</div>
      <ul className="admin-sidebar-menu">
        <li>
          {/* Thay Link bằng button để toggle submenu + điều hướng */}
          <button
            className={`admin-parent-btn ${parentActive ? 'active' : ''}`}
            onClick={handleUsersToggle}
            aria-expanded={usersOpen}
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
              fontWeight: 500,
              position: 'relative'
            }}
          >
            👤 Quản lý người dùng
            <span className={`chev ${usersOpen ? 'open' : ''}`} aria-hidden>▾</span>
          </button>

          {/* Submenu: gom quản lý ví, danh mục và giao dịch vào đây */}
          <ul className={`admin-submenu ${usersOpen ? 'open' : ''}`}>
            <li>
              <Link
                to="/admin/wallets"
                className={location.pathname === '/admin/wallets' ? 'active' : ''}
              >
                💼 Quản lý ví
              </Link>
            </li>
            <li>
              <Link
                to="/admin/categories"
                className={location.pathname === '/admin/categories' ? 'active' : ''}
              >
                🗂️ Quản lý danh mục
              </Link>
            </li>
            <li>
              <Link
                to="/admin/transactions"
                className={location.pathname === '/admin/transactions' ? 'active' : ''}
              >
                💸 Quản lý giao dịch
              </Link>
            </li>
          </ul>
        </li>

        <li>
          <button
            className={`admin-parent-btn ${groupsParentActive ? 'active' : ''}`}
            onClick={handleGroupsToggle}
            aria-expanded={groupsOpen}
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
              fontWeight: 500,
              position: 'relative'
            }}
          >
            👥 Quản lý nhóm
            <span className={`chev ${groupsOpen ? 'open' : ''}`} aria-hidden>▾</span>
          </button>

          <ul className={`admin-submenu ${groupsOpen ? 'open' : ''}`}>
            <li>
              <Link to="/admin/groups" className={location.pathname === '/admin/groups' ? 'active' : ''}>
                📋 Tất cả nhóm
              </Link>
            </li>
            <li>
              <Link to="/admin/groups/transition-group" className={location.pathname === '/admin/groups/transition-group' ? 'active' : ''}>
                ⚡ giao dịch
              </Link>
            </li>
          </ul>
        </li>

        <li>
          <Link
            to="/admin/families"
            className={location.pathname === '/admin/families' ? 'active' : ''}
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
