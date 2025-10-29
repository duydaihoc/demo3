import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './FamilySidebar.css';

export default function FamilySidebar({ active, collapsed = false }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Menu items array với dropdown cho lists
  const items = [
    { id: 'home', label: 'Trang chủ', route: '/family', icon: 'fas fa-home' },
    { id: 'transactions', label: 'Giao dịch', route: '/family/transactions', icon: 'fas fa-exchange-alt' },
    { 
      id: 'lists', 
      label: 'Danh sách', 
      icon: 'fas fa-list',
      hasDropdown: true,
      submenu: [
        { id: 'shopping-list', label: 'Danh sách mua sắm', route: '/family/shopping-list', icon: 'fas fa-shopping-cart' },
        { id: 'todo-list', label: 'Danh sách việc cần làm', route: '/family/todo-list', icon: 'fas fa-tasks' }
      ]
    },
    { id: 'archive', label: 'Lưu trữ', route: '/family/archive', icon: 'fas fa-archive' },
    { id: 'charts', label: 'Biểu đồ', route: '/family/charts', icon: 'fas fa-chart-bar' },
    { id: 'members', label: 'Thành viên', route: '/family/members', icon: 'fas fa-users' },
    { id: 'settings', label: 'Cài đặt', route: '/family/settings', icon: 'fas fa-cog' },
  ];

  // Xác định tab active dựa trên URL hiện tại
  const getActiveTab = () => {
    const path = location.pathname;
    
    if (path === '/family') return 'home';
    if (path === '/family/transactions') return 'transactions';
    if (path === '/family/lists') return 'lists';
    if (path === '/family/shopping-list') return 'shopping-list';
    if (path === '/family/todo-list') return 'todo-list';
    if (path === '/family/archive') return 'archive';
    if (path === '/family/charts') return 'charts';
    if (path === '/family/members') return 'members';
    if (path === '/family/settings') return 'settings';
    
    return '';
  };

  const activeTab = getActiveTab();

  // Auto-open dropdown if submenu is active
  useEffect(() => {
    if (activeTab === 'shopping-list' || activeTab === 'todo-list') {
      setDropdownOpen(true);
    }
  }, [activeTab]);

  // Keep main content height in sync on resize (UI-only)
  useEffect(() => {
    const resizeHandler = () => {
      const main = document.querySelector('.family-main');
      if (!main) return;
      // ensure main is at least viewport height so internal scroll behaves consistently
      main.style.minHeight = '100vh';
    };
    window.addEventListener('resize', resizeHandler);
    // initial run
    resizeHandler();
    return () => window.removeEventListener('resize', resizeHandler);
  }, []);

  const handleNav = (it) => {
    if (it.hasDropdown) {
      setDropdownOpen(!dropdownOpen);
    } else if (it.route) {
      navigate(it.route);
      // UI: after navigation, ensure the content scroll container is at top
      setTimeout(() => {
        const main = document.querySelector('.family-main');
        if (main) {
          try {
            main.scrollTo({ top: 0, behavior: 'smooth' });
          } catch (e) {
            // fallback
            main.scrollTop = 0;
          }
        } else {
          // fallback to window scroll
          try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch(e){ window.scrollTo(0,0); }
        }
      }, 60);
    }
  };

  const handleSubmenuNav = (submenuItem) => {
    if (submenuItem.route) {
      navigate(submenuItem.route);
      setTimeout(() => {
        const main = document.querySelector('.family-main');
        if (main) {
          try {
            main.scrollTo({ top: 0, behavior: 'smooth' });
          } catch (e) {
            main.scrollTop = 0;
          }
        } else {
          try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch(e){ window.scrollTo(0,0); }
        }
      }, 60);
    }
  };

  return (
    <aside className={`family-sidebar ${collapsed ? 'collapsed' : ''}`} aria-label="Sidebar gia đình">
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
          <span className="text-secondary">Gia đình</span>
        </div>
      </div>
      
      <div className="fs-header1">
        <div className="fs-logo">GIA ĐÌNH</div>
        <div className="fs-sub">Quản lý tài chính gia đình</div>
      </div>

      <nav className="fs-nav" role="navigation">
        <ul className="sidebar-menu">
          {items.map(it => (
            <li key={it.id}>
              <button
                className={`fs-item ${activeTab === it.id || (it.submenu && it.submenu.some(sub => sub.id === activeTab)) ? 'active' : ''}`}
                onClick={() => handleNav(it)}
                aria-pressed={activeTab === it.id}
                aria-label={it.label}
                title={it.label}
              >
                <i className={it.icon + ' fs-icon'} aria-hidden="true"></i>
                <span className="fs-label">{it.label}</span>
                {it.hasDropdown && (
                  <i className={`fas fa-chevron-${dropdownOpen ? 'up' : 'down'} fs-dropdown-icon`} aria-hidden="true"></i>
                )}
              </button>
              
              {/* Submenu dropdown */}
              {it.hasDropdown && it.submenu && (
                <ul className={`fs-submenu ${dropdownOpen ? 'open' : ''}`}>
                  {it.submenu.map(subItem => (
                    <li key={subItem.id}>
                      <button
                        className={`fs-submenu-item ${activeTab === subItem.id ? 'active' : ''}`}
                        onClick={() => handleSubmenuNav(subItem)}
                        aria-pressed={activeTab === subItem.id}
                        aria-label={subItem.label}
                        title={subItem.label}
                      >
                        <i className={subItem.icon + ' fs-submenu-icon'} aria-hidden="true"></i>
                        <span className="fs-submenu-label">{subItem.label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </nav>

      <div className="fs-footer">
        <button className="fs-group-btn" onClick={() => navigate('/group')}>
          <i className="fas fa-users"></i> Chuyển sang Nhóm
        </button>
        <button className="fs-back" onClick={() => navigate('/home')}>← Về Trang chủ</button>
      </div>
    </aside>
  );
}
