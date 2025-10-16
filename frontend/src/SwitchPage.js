import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './SwitchPage.css';

export default function SwitchPage() {
  const navigate = useNavigate();

  // Optional: Add slight delay to animations to enhance UX
  useEffect(() => {
    // Nothing to do here, but kept for potential future enhancements
  }, []);

  return (
    <div className="switch-page">
      {/* Animated background elements */}
      <div className="sp-bg-shapes">
        <div className="sp-bg-shape"></div>
        <div className="sp-bg-shape"></div>
        <div className="sp-bg-shape"></div>
      </div>
      
      {/* Floating particles */}
      <div className="sp-particle"></div>
      <div className="sp-particle"></div>
      <div className="sp-particle"></div>
      <div className="sp-particle"></div>
      <div className="sp-particle"></div>
      
      {/* Decorative finance elements */}
      <div className="sp-decorative-element coin">$</div>
      <div className="sp-decorative-element coin">¥</div>
      <div className="sp-decorative-element coin">€</div>
      <div className="sp-decorative-element coin">₫</div>
      <div className="sp-decorative-element card"></div>
      <div className="sp-decorative-element card"></div>
      
      <div className="sp-container">
        <div className="sp-header">
          <div className="sp-icon">
            <i className="fas fa-wallet"></i>
          </div>
          <h1>Quản lý tài chính thông minh</h1>
          <p>Chọn phương thức quản lý tài chính phù hợp với nhu cầu của bạn</p>
        </div>

        <div className="sp-options">
          <div className="sp-option-card group" onClick={() => navigate('/group')}>
            <div className="sp-option-icon">
              <i className="fas fa-users"></i>
            </div>
            <div className="sp-option-content">
              <h2>Quản lý nhóm</h2>
              <p>Quản lý tài chính chung với nhóm bạn bè, đồng nghiệp hoặc gia đình. Chia sẻ chi tiêu, theo dõi công nợ và lên kế hoạch tài chính tập thể.</p>
              <ul className="sp-features">
                <li><i className="fas fa-check"></i> Chia sẻ chi tiêu nhóm</li>
                <li><i className="fas fa-check"></i> Theo dõi công nợ giữa các thành viên</li>
                <li><i className="fas fa-check"></i> Tối ưu hóa thanh toán</li>
                <li><i className="fas fa-check"></i> Báo cáo chi tiêu nhóm</li>
              </ul>
            </div>
            <div className="sp-option-action">
              <button className="sp-btn primary">
                <i className="fas fa-arrow-right"></i> Chọn nhóm
              </button>
            </div>
          </div>

          <div className="sp-option-card family" onClick={() => navigate('/family-selector')}>
            <div className="sp-option-icon">
              <i className="fas fa-home"></i>
            </div>
            <div className="sp-option-content">
              <h2>Quản lý gia đình</h2>
              <p>Quản lý tài chính gia đình một cách hiệu quả. Theo dõi chi tiêu, tiết kiệm và lên kế hoạch tài chính cho cả gia đình.</p>
              <ul className="sp-features">
                <li><i className="fas fa-check"></i> Quản lý chi tiêu gia đình</li>
                <li><i className="fas fa-check"></i> Theo dõi tiết kiệm và quỹ chung</li>
                <li><i className="fas fa-check"></i> Lên kế hoạch mua sắm</li>
                <li><i className="fas fa-check"></i> Quản lý công việc gia đình</li>
              </ul>
            </div>
            <div className="sp-option-action">
              <button className="sp-btn primary">
                <i className="fas fa-arrow-right"></i> Chọn gia đình
              </button>
            </div>
          </div>
        </div>

        <div className="sp-footer">
          <button 
            className="sp-btn secondary"
            onClick={() => navigate('/home')}
          >
            <i className="fas fa-arrow-left"></i> Quay lại trang chủ
          </button>
        </div>
      </div>
    </div>
  );
}
