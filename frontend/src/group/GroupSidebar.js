import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './GroupSidebar.css';

export default function GroupSidebar({ active = 'overview' }) {
  const navigate = useNavigate();
  const [selected, setSelected] = useState(active);

  const items = [
    { id: 'overview', label: 'Tổng quan' },
    { id: 'members', label: 'Thành viên' },
    { id: 'events', label: 'Sự kiện' },
    { id: 'files', label: 'Tài liệu' },
    { id: 'settings', label: 'Cài đặt' },
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
                onClick={() => setSelected(it.id)}
                aria-pressed={selected === it.id}
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
