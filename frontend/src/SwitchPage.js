import React from 'react';
import { useNavigate } from 'react-router-dom';
import './SwitchPage.css';

export default function SwitchPage() {
  const navigate = useNavigate();

  return (
    <div className="switch-page">
      <div className="sp-container">
        <div className="sp-header">
          <div className="sp-icon">
            <i className="fas fa-layer-group"></i>
          </div>
          <h1>Chọn chế độ quản lý</h1>
          <p>Chọn loại quản lý tài chính phù hợp với bạn</p>
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
                <li><i className="fas fa-check"></i> Theo dõi công nợ</li>
                <li><i className="fas fa-check"></i> Tối ưu hóa thanh toán</li>
                <li><i className="fas fa-check"></i> Báo cáo nhóm</li>
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
                <li><i className="fas fa-check"></i> Theo dõi tiết kiệm</li>
                <li><i className="fas fa-check"></i> Lên kế hoạch mua sắm</li>
                <li><i className="fas fa-check"></i> Quản lý công việc</li>
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
