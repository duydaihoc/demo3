import React, { useState } from 'react';
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

  return (
    <aside className="group-sidebar" aria-label="Sidebar nhóm">
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
                onClick={() => {
                  setSelected(it.id);
                  if (it.route) navigate(it.route);
                }}
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


