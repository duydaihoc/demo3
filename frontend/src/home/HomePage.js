import React from 'react';
import Sidebar from './Sidebar';
import Wallets from './Wallets';
import './HomePage.css';

function HomePage() {
  const userName = localStorage.getItem('userName') || 'Tên người dùng'; // Get from localStorage with fallback

  return (
    <div>
      <Sidebar userName={userName} />
      <main className="home-main" style={{ marginLeft: 220 }}>
        <div className="home-header">
          <span className="home-title">Trang chủ</span>
          <div className="home-actions">
            <button>+ Ghi chép</button>
            <button className="report-btn">Xuất báo cáo</button>
          </div>
        </div>
        <div className="home-content">
          <section className="home-left">
            <div className="home-card">
              <div className="home-card-title">Cơ cấu chi tiêu</div>
              <div className="home-card-value">0₫</div>
              <div className="home-card-sub">Không có chi tiêu trong tháng này</div>
            </div>
            <div className="home-card">
              <div className="home-card-title">Bảng điều khiển tài chính</div>
              <div className="home-card-sub">Theo dõi chi tiêu & thu nhập mỗi ngày để đạt mục tiêu nhanh hơn 🚀</div>
              <div style={{ display: 'flex', gap: '30px', marginTop: '18px' }}>
                <div>
                  <div className="home-card-title" style={{ fontSize: '1rem' }}>Tổng số dư</div>
                  <div className="home-card-value" style={{ color: '#2a5298' }}>0₫</div>
                </div>
                <div>
                  <div className="home-card-title" style={{ fontSize: '1rem' }}>Thu nhập tháng này</div>
                  <div className="home-card-value" style={{ color: '#4ecdc4' }}>0₫</div>
                </div>
                <div>
                  <div className="home-card-title" style={{ fontSize: '1rem' }}>Chi phí tháng này</div>
                  <div className="home-card-value" style={{ color: '#ff6b6b' }}>0₫</div>
                </div>
              </div>
            </div>
            <div className="home-stat-table">
              <div className="home-stat-title">Bảng thống kê giao dịch trong ngày</div>
              <table>
                <thead>
                  <tr>
                    <th>Ví</th>
                    <th>Thu</th>
                    <th>Chi</th>
                    <th>Net</th>
                    <th>Giao dịch</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Tổng</td>
                    <td>0₫</td>
                    <td>0₫</td>
                    <td>0₫</td>
                    <td>0</td>
                  </tr>
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', color: '#888' }}>Không có giao dịch trong ngày.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
          <aside className="home-right">
            {/* Đưa Wallets sang bên phải */}
            <Wallets />
            <div className="home-reminder">
              <div className="home-reminder-title">Ghi chú / Nhắc nhở</div>
              <ul className="home-reminder-list">
                <li>💡 Quản lý nhiều ví để tách rõ loại chi tiêu.</li>
                <li>🎯 Đặt mục tiêu tiết kiệm cho từng ví.</li>
                <li>📝 Cập nhật danh mục cho chính xác hơn.</li>
              </ul>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

export default HomePage;

