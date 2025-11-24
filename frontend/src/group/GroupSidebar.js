import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Home, 
  Users, 
  Mail, 
  Bell,
  Network,
  LayoutGrid
} from 'lucide-react';
import './GroupSidebar.css';

export default function GroupSidebar({ active = 'overview' }) {
  const navigate = useNavigate();
  const [selected, setSelected] = useState(active);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    // Load collapsed state from localStorage (separate key for group sidebar)
    const saved = localStorage.getItem('groupSidebarCollapsed');
    return saved === 'true';
  });

  const items = [
    { id: 'home', label: 'Trang chủ', route: '/group', icon: Home },
    { id: 'groups', label: 'Nhóm', route: '/groups', icon: Users },
    { id: 'friends', label: 'Bạn bè', route: '/friends', icon: Mail },
    { id: 'activity', label: 'Hoạt động', route: '/activity', icon: Bell },
  ];

  // Toggle sidebar collapse
  const toggleSidebar = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    localStorage.setItem('groupSidebarCollapsed', newState.toString());
    // Update body class to adjust main content margin
    if (newState) {
      document.body.classList.add('group-sidebar-collapsed');
    } else {
      document.body.classList.remove('group-sidebar-collapsed');
    }
  };

  // Apply initial collapsed state to body
  useEffect(() => {
    if (isCollapsed) {
      document.body.classList.add('group-sidebar-collapsed');
    } else {
      document.body.classList.remove('group-sidebar-collapsed');
    }
  }, [isCollapsed]);

  // Keep .groups-main height in sync on resize (UI-only)
  useEffect(() => {
    const resizeHandler = () => {
      const main = document.querySelector('.groups-main');
      if (!main) return;
      // ensure main is at least viewport height so internal scroll behaves consistently
      main.style.minHeight = '100vh';
      // on mobile, CSS media query will handle layout
    };
    window.addEventListener('resize', resizeHandler);
    // initial run
    resizeHandler();
    return () => window.removeEventListener('resize', resizeHandler);
  }, []);

  const handleNav = (it) => {
    setSelected(it.id);
    if (it.route) {
      navigate(it.route);
      // UI: after navigation, ensure the group content scroll container is at top
      // small timeout to allow route swap / DOM update
      setTimeout(() => {
        const main = document.querySelector('.groups-main');
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

  return (
    <>
      {/* Toggle button - tách ra ngoài để luôn hiển thị */}
      <button 
        className={`group-sidebar-toggle ${isCollapsed ? 'collapsed' : ''}`}
        onClick={toggleSidebar}
        aria-label={isCollapsed ? "Mở sidebar" : "Đóng sidebar"}
        title={isCollapsed ? "Mở sidebar" : "Đóng sidebar"}
      >
        <span className={`toggle-arrow ${isCollapsed ? 'collapsed' : ''}`}>
          {isCollapsed ? '›' : '‹'}
        </span>
      </button>
      
      <aside className={`group-sidebar ${isCollapsed ? 'collapsed' : ''}`} aria-label="Sidebar nhóm">
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
      
      <div className="gs-header">
        <div className="gs-sub">Quản lý nhóm</div>
      </div>

      <nav className="gs-nav" role="navigation">
        <ul className="sidebar-menu">
          {items.map(it => {
            const IconComponent = it.icon;
            return (
              <li key={it.id}>
                <button
                  className={`gs-item ${selected === it.id ? 'active' : ''}`}
                  onClick={() => handleNav(it)}
                  aria-pressed={selected === it.id}
                  aria-label={it.label}
                >
                  <IconComponent className="gs-item-icon" />
                  <span>{it.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="gs-footer">
        <button 
          className="gs-family-btn" 
          onClick={() => navigate('/family-selector')}
          title="Chuyển sang Gia đình"
          aria-label="Chuyển sang Gia đình"
        >
          <Network className="gs-btn-icon" />
        </button>
        <button 
          className="gs-back" 
          onClick={() => navigate('/home')}
          title="Về Trang cá nhân"
          aria-label="Về Trang cá nhân"
        >
          <LayoutGrid className="gs-btn-icon" />
        </button>
      </div>
    </aside>
    </>
  );
}


