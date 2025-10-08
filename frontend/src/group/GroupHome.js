import React from 'react';
import { useNavigate } from 'react-router-dom';
import './GroupHome.css';
import GroupSidebar from './GroupSidebar';

export default function GroupHome() {
  const navigate = useNavigate();
  // eslint-disable-next-line no-unused-vars
  const userName = localStorage.getItem('userName') || 'Bạn';

  return (
    <div className="groups-page">
      <GroupSidebar active="home" />

      <main className="groups-main" role="main">
        {/* Hero Section */}
        <section className="group-hero">
          <div className="hero-content">
            <h1 className="hero-title">Chào mừng đến với Quản lý Nhóm Chi tiêu</h1>
            <p className="hero-subtitle">
              Chia sẻ chi phí, theo dõi giao dịch và quản lý công nợ dễ dàng cùng bạn bè và gia đình.
            </p>
            <div className="hero-actions">
              <button className="hero-btn primary" onClick={() => navigate('/groups')}>
                <i className="fas fa-users"></i> Khám phá nhóm của bạn
              </button>
              <button className="hero-btn secondary" onClick={() => navigate('/friends')}>
                <i className="fas fa-user-plus"></i> Kết nối bạn bè
              </button>
            </div>
          </div>
          <div className="hero-visual">
            <div className="hero-cards-stack">
              <div className="hero-card card-1">
                <div className="card-icon"><i className="fas fa-layer-group"></i></div>
                <div className="card-text">Nhóm 1</div>
              </div>
              <div className="hero-card card-2">
                <div className="card-icon"><i className="fas fa-exchange-alt"></i></div>
                <div className="card-text">Giao dịch</div>
              </div>
              <div className="hero-card card-3">
                <div className="card-icon"><i className="fas fa-chart-pie"></i></div>
                <div className="card-text">Thống kê</div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="group-features">
          <div className="features-header">
            <h2>Tính năng chính</h2>
            <p>Khám phá các công cụ giúp bạn quản lý chi tiêu nhóm hiệu quả</p>
          </div>

          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">
                <i className="fas fa-users-cog"></i>
              </div>
              <h3>Quản lý nhóm</h3>
              <p>Tạo nhóm, thêm/xóa thành viên, và tùy chỉnh thiết kế nhóm với màu sắc gradient đẹp mắt.</p>
              <button className="feature-btn" onClick={() => navigate('/groups')}>
                <i className="fas fa-arrow-right"></i> Bắt đầu
              </button>
            </div>

            <div className="feature-card">
              <div className="feature-icon">
                <i className="fas fa-exchange-alt"></i>
              </div>
              <h3>Giao dịch nhóm</h3>
              <p>Ghi lại chi tiêu chung, phân chia chi phí công bằng và theo dõi lịch sử giao dịch chi tiết.</p>
              <button className="feature-btn" onClick={() => navigate('/groups')}>
                <i className="fas fa-arrow-right"></i> Xem giao dịch
              </button>
            </div>

            <div className="feature-card">
              <div className="feature-icon">
                <i className="fas fa-hand-holding-usd"></i>
              </div>
              <h3>Công nợ tự động</h3>
              <p>Tính toán công nợ, theo dõi ai nợ ai bao nhiêu và thanh toán dễ dàng với một click.</p>
              <button className="feature-btn" onClick={() => navigate('/groups')}>
                <i className="fas fa-arrow-right"></i> Kiểm tra công nợ
              </button>
            </div>

            <div className="feature-card">
              <div className="feature-icon">
                <i className="fas fa-chart-line"></i>
              </div>
              <h3>Biểu đồ thống kê</h3>
              <p>Xem biểu đồ giao dịch theo ngày và tỉ lệ chi tiêu của từng thành viên với giao diện trực quan.</p>
              <button className="feature-btn" onClick={() => navigate('/groups')}>
                <i className="fas fa-arrow-right"></i> Xem biểu đồ
              </button>
            </div>

            <div className="feature-card">
              <div className="feature-icon">
                <i className="fas fa-user-friends"></i>
              </div>
              <h3>Kết nối bạn bè</h3>
              <p>Gửi lời mời kết bạn, quản lý danh sách bạn bè và mời họ tham gia nhóm nhanh chóng.</p>
              <button className="feature-btn" onClick={() => navigate('/friends')}>
                <i className="fas fa-arrow-right"></i> Kết nối
              </button>
            </div>

            <div className="feature-card">
              <div className="feature-icon">
                <i className="fas fa-bell"></i>
              </div>
              <h3>Thông báo realtime</h3>
              <p>Nhận thông báo tức thời về lời mời nhóm, thanh toán và cập nhật giao dịch.</p>
              <button className="feature-btn" onClick={() => navigate('/activity')}>
                <i className="fas fa-arrow-right"></i> Xem hoạt động
              </button>
            </div>
          </div>
        </section>

        {/* Stats Section */}
        <section className="group-stats">
          <div className="stats-container">
            <div className="stat-item">
              <div className="stat-number">∞</div>
              <div className="stat-label">Nhóm có thể tạo</div>
            </div>
            <div className="stat-item">
              <div className="stat-number">∞</div>
              <div className="stat-label">Thành viên mỗi nhóm</div>
            </div>
            <div className="stat-item">
              <div className="stat-number">100%</div>
              <div className="stat-label">Miễn phí sử dụng</div>
            </div>
            <div className="stat-item">
              <div className="stat-number">24/7</div>
              <div className="stat-label">Hỗ trợ mọi lúc</div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="group-cta">
          <div className="cta-content">
            <h2>Sẵn sàng bắt đầu?</h2>
            <p>Tạo nhóm đầu tiên của bạn và trải nghiệm cách quản lý chi tiêu nhóm dễ dàng nhất.</p>
            <button className="cta-btn" onClick={() => navigate('/groups')}>
              <i className="fas fa-plus-circle"></i> Tạo nhóm ngay
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
