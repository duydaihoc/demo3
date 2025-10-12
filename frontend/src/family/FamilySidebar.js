import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './FamilySidebar.css';

export default function FamilySidebar({ active = 'home' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [selected, setSelected] = useState(active);

  // New: menu items required by user
  const items = [
    { id: 'home', label: 'Trang chủ', route: '/family', icon: 'fas fa-home' },
    { id: 'transactions', label: 'Giao dịch', route: '/family/transactions', icon: 'fas fa-exchange-alt' },
    { id: 'tx-list', label: 'Danh sách giao dịch', route: '/family/transactions/list', icon: 'fas fa-list-alt' },
    { id: 'groceries', label: 'Danh sách tạp hóa', route: '/family/groceries', icon: 'fas fa-shopping-basket' },
    { id: 'todos', label: 'Danh sách việc cần làm', route: '/family/todos', icon: 'fas fa-clipboard-list' },
    { id: 'members', label: 'Thành viên', route: '/family/members', icon: 'fas fa-users' },
  ];

  // Sync selected state with current URL
  useEffect(() => {
    const path = location.pathname || '';
    // find first matching item by route prefix
    const match = items.find(it => path === it.route || path.startsWith(it.route + '/') || (it.route !== '/' && path.startsWith(it.route)));
    if (match) setSelected(match.id);
    // fallback if no match (keep existing)
  }, [location.pathname]); // eslint-disable-line

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
    setSelected(it.id);
    if (it.route) {
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

  return (
    <aside className="family-sidebar" aria-label="Sidebar gia đình">
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
      
      <div className="fs-header">
        <div className="fs-logo">GIA ĐÌNH</div>
        <div className="fs-sub">Quản lý tài chính gia đình</div>
      </div>

      <nav className="fs-nav" role="navigation">
        <ul className="sidebar-menu">
          {items.map(it => (
            <li key={it.id}>
              <button
                className={`fs-item ${selected === it.id ? 'active' : ''}`}
                onClick={() => handleNav(it)}
                aria-pressed={selected === it.id}
                aria-label={it.label}
                title={it.label}
              >
                <i className={it.icon + ' fs-icon'} aria-hidden="true"></i>
                <span className="fs-label">{it.label}</span>
              </button>
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
