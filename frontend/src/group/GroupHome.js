import React from 'react';
import { useNavigate } from 'react-router-dom';
import './GroupHome.css';
import GroupSidebar from './GroupSidebar';

export default function GroupHome() {
  const navigate = useNavigate();
  const userName = localStorage.getItem('userName') || 'Bạn';

  return (
    // wrap page content so sidebar and main content sit side-by-side
    <div className="group-page">
      <GroupSidebar /> {/* inserted sidebar */}

      <main className="group-main">
        <header className="group-header">
          <h1 className="group-title">Giao diện Nhóm</h1>
          <div className="group-actions">
            <button className="group-back" onClick={() => navigate('/home')}>← Trở về</button>
          </div>
        </header>

        <section className="group-content">
          <div className="group-welcome">
            <h2>Chào {userName}</h2>
            <p>Đây là trang chủ cho chức năng nhóm. Bạn có thể hiển thị danh sách nhóm, tạo nhóm mới hoặc quản lý thành viên tại đây.</p>
          </div>

          <div className="group-cards">
            <div className="group-card">
              <h3>Nhóm của tôi</h3>
              <p>Danh sách nhóm sẽ hiển thị ở đây.</p>
            </div>
            <div className="group-card">
              <h3>Tạo nhóm mới</h3>
              <p>Nút tạo nhóm và form sẽ được đặt vào đây.</p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
