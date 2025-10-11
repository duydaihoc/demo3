import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './FamilySidebar.css';

export default function FamilySidebar({ active = 'home' }) {
  const navigate = useNavigate();
  const [selected, setSelected] = useState(active);

  const items = [
    { id: 'home', label: 'Trang chủ', route: '/family', icon: 'fas fa-home' },
    { id: 'expenses', label: 'Chi tiêu', route: '/family/expenses', icon: 'fas fa-receipt' },
    { id: 'budget', label: 'Ngân sách', route: '/family/budget', icon: 'fas fa-wallet' },
    { id: 'savings', label: 'Tiết kiệm', route: '/family/savings', icon: 'fas fa-piggy-bank' },
    { id: 'bills', label: 'Hóa đơn', route: '/family/bills', icon: 'fas fa-file-invoice-dollar' },
    { id: 'members', label: 'Thành viên', route: '/family/members', icon: 'fas fa-users' },
  ];

  // Keep sidebar height in sync on resize (UI-only)
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
              >
                <i className={it.icon}></i>
                <span>{it.label}</span>
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
