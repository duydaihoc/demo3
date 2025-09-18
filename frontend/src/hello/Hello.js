import React from 'react';
import { Link } from 'react-router-dom';
import './Hello.css';

function Hello() {
  return (
    <div className="hello-container">
      <div className="hero-section">
        <h1 className="hello-title">Quản lý chi tiêu tài chính</h1>
        <p className="hero-subtitle">Dễ dàng theo dõi và tối ưu hóa tài chính cá nhân, nhóm và gia đình.</p>
        <div className="hello-buttons">
          <Link to="/login">
            <button className="hello-button login">Đăng nhập</button>
          </Link>
          <Link to="/register">
            <button className="hello-button signup">bắt đầu miễn phí</button>
          </Link>
        </div>
      </div>
      <div className="benefits-section">
        <h2>Lợi ích khi sử dụng:</h2>
        <div className="benefits-grid">
          <div className="benefit-card">
            <h3>Cá nhân</h3>
            <p>Quản lý chi tiêu hiệu quả, tiết kiệm thời gian.</p>
          </div>
          <div className="benefit-card">
            <h3>Gia đình</h3>
            <p>Phân chia ngân sách hợp lý cho mọi thành viên.</p>
          </div>
          <div className="benefit-card">
            <h3>Nhóm</h3>
            <p>Theo dõi chi tiêu minh bạch và dễ dàng.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Hello;
