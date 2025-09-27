import React from 'react';
import Sidebar from './Sidebar';
import Wallets from './Wallets';
import './HomePage.css';
import FinanceDashboard from './FinanceDashboard'; // new component
import SavingsGoals from './SavingsGoals'; // import the new component

import { useNavigate } from 'react-router-dom';

function HomePage() {
  const userName = localStorage.getItem('userName') || 'Tên người dùng'; // Get from localStorage with fallback
  const navigate = useNavigate();

  return (
    <div>
      <Sidebar userName={userName} />
      <main className="home-main" style={{ marginLeft: 220 }}>
        <div className="home-header">
          <span className="home-title">Trang chủ</span>
          <div className="home-actions">
            <button onClick={() => navigate('/transactions')}>+ Ghi chép</button>
          </div>
        </div>
        <div className="home-content">
          <section className="home-left">
            {/* FinanceDashboard renders the composition + daily stats table now */}
            <FinanceDashboard />
            {/* <div className="home-stat-table">
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
            </div> */}
          </section>
          <aside className="home-right">
            {/* Đưa Wallets sang bên phải */}
            <Wallets />
            {/* Add the new SavingsGoals component */}
            <SavingsGoals />
            
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

