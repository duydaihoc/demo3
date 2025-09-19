import React from 'react';
import Sidebar from './Sidebar';
import './TransactionsPage.css';

function TransactionsPage() {
  const userName = localStorage.getItem('userName') || 'Tên người dùng'; // Get from localStorage with fallback

  return (
    <div>
      <Sidebar userName={userName} />
      <main className="transactions-main" style={{ marginLeft: 220 }}>
        <div className="transactions-header">
          <span className="transactions-title">Giao dịch</span>
          <div className="transactions-date">
            <button className="date-btn">September 2025</button>
          </div>
        </div>
        <div className="transactions-summary">
          <div className="wallet-card">
            <div className="wallet-title">Tất cả ví</div>
            <div className="wallet-balance">0 VND</div>
            <div className="wallet-note">Chưa có ví nào</div>
          </div>
          <div className="summary-item">
            <div className="summary-label">Tổng số dư</div>
            <div className="summary-value">0₫</div>
          </div>
          <div className="summary-item">
            <div className="summary-label">Thu nhập tháng này</div>
            <div className="summary-value" style={{ color: '#27ae60' }}>0₫</div>
          </div>
          <div className="summary-item">
            <div className="summary-label">Chi phí tháng này</div>
            <div className="summary-value" style={{ color: '#e74c3c' }}>0₫</div>
          </div>
        </div>
        <div className="transactions-form-section">
          <div className="transactions-form-title">Thêm giao dịch</div>
          <form className="transactions-form">
            <select><option>Tất cả ví (không thể ghi chép)</option></select>
            <input type="text" placeholder="Tên giao dịch" />
            <select>
              <option>Chi tiêu</option>
              <option>Thu nhập</option>
            </select>
            <select>
              <option>-- Chọn danh mục --</option>
            </select>
            <input type="number" placeholder="Số tiền" />
            <input type="date" value="2025-09-15" />
            <input type="text" placeholder="Ghi chú" style={{ gridColumn: '1 / span 3' }} />
            <button className="save-btn">Đang lưu...</button>
          </form>
        </div>
        <div className="transactions-list-section">
          <div className="transactions-list-title">Danh sách giao dịch</div>
          <table className="transactions-table">
            <thead>
              <tr>
                <th>Ngày</th>
                <th>Tên</th>
                <th>Loại</th>
                <th>Danh mục</th>
                <th>Số tiền</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', color: '#888' }}>
                  (Chưa có giao dịch)
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

export default TransactionsPage;
