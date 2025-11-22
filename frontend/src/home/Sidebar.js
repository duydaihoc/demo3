import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import './Sidebar.css';

function Sidebar({ userName = "Tên người dùng" }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    // Load collapsed state from localStorage
    const saved = localStorage.getItem('sidebarCollapsed');
    return saved === 'true';
  });
  const settingsRef = useRef(null);

  const handleLogout = (e) => {
    e.preventDefault();
    localStorage.removeItem('token');
    localStorage.removeItem('userName');
    navigate('/login');
  };

  // close submenu when clicking outside
  useEffect(() => {
    const onDocClick = (e) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target)) {
        setShowSettingsMenu(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // Toggle sidebar collapse
  const toggleSidebar = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    localStorage.setItem('sidebarCollapsed', newState.toString());
    // Update body class to adjust main content margin
    if (newState) {
      document.body.classList.add('sidebar-collapsed');
    } else {
      document.body.classList.remove('sidebar-collapsed');
    }
  };

  // Apply initial collapsed state to body
  useEffect(() => {
    if (isCollapsed) {
      document.body.classList.add('sidebar-collapsed');
    } else {
      document.body.classList.remove('sidebar-collapsed');
    }
  }, []);

  return (
    <>
      {/* Toggle button - tách ra ngoài để luôn hiển thị */}
      <button 
        className={`sidebar-toggle ${isCollapsed ? 'collapsed' : ''}`}
        onClick={toggleSidebar}
        aria-label={isCollapsed ? "Mở sidebar" : "Đóng sidebar"}
        title={isCollapsed ? "Mở sidebar" : "Đóng sidebar"}
      >
        <span className={`toggle-arrow ${isCollapsed ? 'collapsed' : ''}`}>
          {isCollapsed ? '›' : '‹'}
        </span>
      </button>
      
      <nav className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
        {/* Add logo component at the top */}
      <div className="sidebar-logo">
        <div className="logo-icon">
          <div className="coin-stack">
            <div className="coin coin-1"></div>
            <div className="coin coin-2"></div>
            <div className="coin coin-3"></div>
          </div>
          <div className="wallet"></div>
        </div>
        <div className="logo-text">
          <span className="text-primary">Quản lý</span>
          <span className="text-secondary">Chi tiêu</span>
        </div>
      </div>
      
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
        <li ref={settingsRef}>
          {/* Make "Cài đặt" a toggle (no immediate navigation) */}
          <button
            type="button"
            className={`sidebar-settings-btn ${ (location.pathname === "/settings" && !location.search.includes('tab=categories')) || showSettingsMenu ? "active" : "" }`}
            onClick={() => setShowSettingsMenu(prev => !prev)}
            aria-expanded={showSettingsMenu}
            aria-haspopup="menu"
          >
            Cài đặt <span className="caret">▾</span>
          </button>

          {showSettingsMenu && (
            <ul className="sidebar-submenu" role="menu">
              <li role="menuitem">
                <Link to="/settings" onClick={() => setShowSettingsMenu(false)}>Cài đặt người dùng</Link>
              </li>
              <li role="menuitem">
                <Link to="/settings?tab=categories" onClick={() => setShowSettingsMenu(false)}>Cài đặt danh mục</Link>
              </li>
              <li role="menuitem">
                <Link to="/settings/general" onClick={() => setShowSettingsMenu(false)}>Cài đặt chung</Link>
              </li>
            </ul>
          )}
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
    </>
  );
}

export default Sidebar;
