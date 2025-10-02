import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './GroupSidebar.css';

export default function GroupSidebar({ active = 'overview' }) {
  const navigate = useNavigate();
  const [selected, setSelected] = useState(active);

  const items = [
    { id: 'home', label: 'Trang chủ', route: '/group' },
    { id: 'groups', label: 'Nhóm', route: '/groups' },
    { id: 'friends', label: 'Bạn bè', route: '/friends' }, // mới
    { id: 'activity', label: 'Hoạt động', route: '/activity' },
    { id: 'settings', label: 'Cài đặt', route: '/settings' },
  ];

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
    <aside className="group-sidebar" aria-label="Sidebar nhóm">
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
        <div className="gs-logo">NHÓM</div>
        <div className="gs-sub">Quản lý nhóm</div>
      </div>

      <nav className="gs-nav" role="navigation">
        <ul className="sidebar-menu">
          {items.map(it => (
            <li key={it.id}>
              <button
                className={`gs-item ${selected === it.id ? 'active' : ''}`}
                onClick={() => handleNav(it)}
                aria-pressed={selected === it.id}
                aria-label={it.label}
              >
                {it.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="gs-footer">
        <button className="gs-back" onClick={() => navigate('/home')}>← Về Trang chủ</button>
      </div>
    </aside>
  );
}


