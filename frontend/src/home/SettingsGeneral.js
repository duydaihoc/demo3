import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import './SettingsGeneral.css';
import { 
  FaHeart, 
  FaHandHoldingHeart, 
  FaLightbulb, 
  FaStar, 
  FaInfoCircle, 
  FaEnvelope, 
  FaCreditCard,
  FaExternalLinkAlt,
  FaCopy,
  FaCheck,
  FaTimes
} from 'react-icons/fa';
import { showNotification } from '../utils/notify';

function SettingsGeneral() {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [showFeatureModal, setShowFeatureModal] = useState(false);
  const [supportForm, setSupportForm] = useState({
    email: '',
    name: '',
    message: '',
    personalInfo: {
      usageTime: '',
      purpose: ''
    }
  });
  const [featureForm, setFeatureForm] = useState({
    email: '',
    name: '',
    message: '',
    featureCategories: [] // Mảng các mục đã chọn
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmittingFeature, setIsSubmittingFeature] = useState(false);
  
  const featureCategories = [
    { id: 'wallet', label: 'Ví', icon: '💼' },
    { id: 'transaction', label: 'Giao dịch', icon: '💸' },
    { id: 'category', label: 'Danh mục', icon: '🗂️' },
    { id: 'family', label: 'Gia đình', icon: '🏠' },
    { id: 'group', label: 'Nhóm', icon: '👥' },
    { id: 'goal', label: 'Mục tiêu', icon: '🎯' },
    { id: 'integration', label: 'Khả năng liên kết', icon: '🔗' }
  ];
  const appVersion = '1.0.0';
  const userName = localStorage.getItem('userName') || 'Tên người dùng';
  const userEmail = localStorage.getItem('userEmail') || '';
  // Mã QR mặc định của người tạo web
  const qrCodeUrl = '/images/qr-support.jpg';

  const handleCopy = (text, label) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      showNotification(`✅ Đã sao chép ${label}`, 'success');
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      showNotification('❌ Không thể sao chép', 'error');
    });
  };

  const handleSupport = () => {
    showNotification('💝 Cảm ơn bạn đã ủng hộ MoneyWise!', 'success');
    // Có thể mở link thanh toán hoặc modal ủng hộ
  };

  const handleSupportClick = () => {
    // Điền thông tin từ localStorage nếu có
    setSupportForm({
      email: userEmail || '',
      name: userName || '',
      message: '',
      personalInfo: {
        usageTime: '',
        purpose: ''
      }
    });
    setShowSupportModal(true);
  };

  const handleCloseSupportModal = () => {
    setShowSupportModal(false);
    setSupportForm({
      email: '',
      name: '',
      message: '',
      personalInfo: {
        usageTime: '',
        purpose: ''
      }
    });
  };

  const handleSupportInputChange = (e) => {
    const { name, value } = e.target;
    if (name.startsWith('personalInfo.')) {
      const field = name.split('.')[1];
      setSupportForm(prev => ({
        ...prev,
        personalInfo: {
          ...prev.personalInfo,
          [field]: value
        }
      }));
    } else {
      setSupportForm(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  const handleSupportSubmit = async (e) => {
    e.preventDefault();
    
    if (!supportForm.email || !supportForm.email.trim()) {
      showNotification('❌ Vui lòng nhập email', 'error');
      return;
    }

    if (!supportForm.name || !supportForm.name.trim()) {
      showNotification('❌ Vui lòng nhập tên người dùng', 'error');
      return;
    }

    setIsSubmitting(true);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:5000/api/support', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({
          email: supportForm.email.trim(),
          name: supportForm.name.trim(),
          message: supportForm.message.trim() || '',
          personalInfo: supportForm.personalInfo
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        showNotification('✅ ' + data.message, 'success');
        handleCloseSupportModal();
      } else {
        showNotification('❌ ' + (data.message || 'Đã xảy ra lỗi'), 'error');
      }
    } catch (error) {
      console.error('Error submitting support:', error);
      showNotification('❌ Không thể gửi hỗ trợ. Vui lòng thử lại sau.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFeatureRequest = () => {
    // Điền thông tin từ localStorage nếu có
    setFeatureForm({
      email: userEmail || '',
      name: userName || '',
      message: '',
      featureCategories: []
    });
    setShowFeatureModal(true);
  };

  const handleCloseFeatureModal = () => {
    setShowFeatureModal(false);
    setFeatureForm({
      email: '',
      name: '',
      message: '',
      featureCategories: []
    });
  };

  const handleFeatureCategoryToggle = (categoryId) => {
    setFeatureForm(prev => {
      const categories = prev.featureCategories.includes(categoryId)
        ? prev.featureCategories.filter(id => id !== categoryId)
        : [...prev.featureCategories, categoryId];
      return {
        ...prev,
        featureCategories: categories
      };
    });
  };

  const handleFeatureInputChange = (e) => {
    const { name, value } = e.target;
    setFeatureForm(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleFeatureSubmit = async (e) => {
    e.preventDefault();
    
    if (!featureForm.email || !featureForm.email.trim()) {
      showNotification('❌ Vui lòng nhập email', 'error');
      return;
    }

    if (!featureForm.name || !featureForm.name.trim()) {
      showNotification('❌ Vui lòng nhập tên người dùng', 'error');
      return;
    }

    if (featureForm.featureCategories.length === 0) {
      showNotification('❌ Vui lòng chọn ít nhất một mục', 'error');
      return;
    }

    setIsSubmittingFeature(true);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:5000/api/support', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({
          email: featureForm.email.trim(),
          name: featureForm.name.trim(),
          message: featureForm.message.trim() || '',
          type: 'feature-request',
          featureCategories: featureForm.featureCategories
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        showNotification('✅ ' + data.message, 'success');
        handleCloseFeatureModal();
      } else {
        showNotification('❌ ' + (data.message || 'Đã xảy ra lỗi'), 'error');
      }
    } catch (error) {
      console.error('Error submitting feature request:', error);
      showNotification('❌ Không thể gửi yêu cầu tính năng. Vui lòng thử lại sau.', 'error');
    } finally {
      setIsSubmittingFeature(false);
    }
  };

  const handleRate = () => {
    showNotification('⭐ Cảm ơn bạn đã sử dụng MoneyWise! Đánh giá của bạn rất quan trọng với chúng tôi.', 'success');
    // Có thể mở link đến store hoặc form đánh giá
  };

  const handleContact = () => {
    const email = 'duytran.tk4@gmail.com';
    const subject = encodeURIComponent('Liên hệ với MoneyWise');
    const body = encodeURIComponent('Xin chào MoneyWise,\n\n');
    window.open(`mailto:${email}?subject=${subject}&body=${body}`, '_blank');
  };

  const handleOpenCard = (bankName, bankUrl) => {
    window.open(bankUrl, '_blank');
  };

  const banks = [
    { name: 'Vietcombank', url: 'https://www.vietcombank.com.vn/vi/personal/cards/debit-cards' },
    { name: 'BIDV', url: 'https://www.bidv.com.vn/vi/ca-nhan/the-ghi-no' },
    { name: 'VietinBank', url: 'https://www.vietinbank.vn/web/home/vn/personal/cards/debit-card' },
    { name: 'Techcombank', url: 'https://www.techcombank.com.vn/ca-nhan/the-ghi-no' },
    { name: 'ACB', url: 'https://www.acb.com.vn/vi/ca-nhan/the-ghi-no' },
    { name: 'TPBank', url: 'https://tpb.vn/ca-nhan/the-ghi-no' },
    { name: 'VPBank', url: 'https://www.vpbank.com.vn/ca-nhan/the-ghi-no' },
    { name: 'MBBank', url: 'https://www.mbbank.com.vn/ca-nhan/the-ghi-no' },
  ];



  return (
    <div className="settings-general-wrapper">
      <Sidebar userName={userName} />
      <div className="settings-general-container">
        <div className="sg-header">
          <h1 className="sg-title">Cài đặt chung</h1>
        </div>

      <div className="sg-content">
        {/* Ủng hộ */}
        <div className="sg-card">
          <div className="sg-card-header">
            <FaHeart className="sg-icon support-icon" />
            <h2 className="sg-card-title">Ủng hộ</h2>
          </div>
          <p className="sg-card-description">
            Nếu bạn thấy MoneyWise hữu ích, hãy quét mã QR để ủng hộ chúng tôi!
          </p>
          
          <div className="sg-qr-container">
            <div className="sg-qr-wrapper">
              <img src={qrCodeUrl} alt="Mã QR ủng hộ" className="sg-qr-image" />
            </div>
            <div className="sg-qr-info">
              <p className="sg-qr-hint">Quét mã QR để ủng hộ MoneyWise</p>
            </div>
          </div>
        </div>

        {/* Hỗ trợ */}
        <div className="sg-card">
          <div className="sg-card-header">
            <FaHandHoldingHeart className="sg-icon support-icon" />
            <h2 className="sg-card-title">Hỗ trợ chúng tôi</h2>
          </div>
          <p className="sg-card-description">
            Bạn muốn hỗ trợ code, báo lỗi hoặc cải thiện ứng dụng? Chúng tôi rất hoan nghênh!
          </p>
          <button className="sg-action-btn support-btn" onClick={handleSupportClick}>
            <FaHandHoldingHeart /> Tìm hiểu cách hỗ trợ
          </button>
        </div>

        {/* Yêu cầu tính năng */}
        <div className="sg-card">
          <div className="sg-card-header">
            <FaLightbulb className="sg-icon feature-icon" />
            <h2 className="sg-card-title">Yêu cầu tính năng</h2>
          </div>
          <p className="sg-card-description">
            Có tính năng nào bạn muốn thêm vào MoneyWise? Hãy cho chúng tôi biết!
          </p>
          <button className="sg-action-btn feature-btn" onClick={handleFeatureRequest}>
            <FaLightbulb /> Gửi yêu cầu tính năng
          </button>
        </div>

        {/* Đánh giá */}
        <div className="sg-card">
          <div className="sg-card-header">
            <FaStar className="sg-icon rate-icon" />
            <h2 className="sg-card-title">Đánh giá chúng tôi</h2>
          </div>
          <p className="sg-card-description">
            Đánh giá của bạn giúp chúng tôi cải thiện và hỗ trợ người dùng khác tìm thấy MoneyWise.
          </p>
          <button className="sg-action-btn rate-btn" onClick={handleRate}>
            <FaStar /> Đánh giá MoneyWise
          </button>
        </div>

        {/* Phiên bản ứng dụng */}
        <div className="sg-card">
          <div className="sg-card-header">
            <FaInfoCircle className="sg-icon version-icon" />
            <h2 className="sg-card-title">Phiên bản ứng dụng</h2>
          </div>
          <div className="sg-version-info">
            <div className="sg-version-item">
              <span className="sg-version-label">Phiên bản hiện tại:</span>
              <span className="sg-version-value">{appVersion}</span>
            </div>
            <div className="sg-version-item">
              <span className="sg-version-label">Ngày phát hành:</span>
              <span className="sg-version-value">{new Date().toLocaleDateString('vi-VN')}</span>
            </div>
          </div>
        </div>

        {/* Liên hệ */}
        <div className="sg-card">
          <div className="sg-card-header">
            <FaEnvelope className="sg-icon contact-icon" />
            <h2 className="sg-card-title">Liên hệ với chúng tôi</h2>
          </div>
          <p className="sg-card-description">
            Có câu hỏi, góp ý hoặc cần hỗ trợ? Chúng tôi luôn sẵn sàng lắng nghe!
          </p>
          <div className="sg-contact-info">
            <div className="sg-contact-item">
              <span className="sg-contact-label">Email:</span>
              <div className="sg-contact-value">
                <span>duytran.tk4@gmail.com</span>
                <button 
                  className="sg-copy-btn" 
                  onClick={() => handleCopy('duytran.tk4@gmail.com', 'email')}
                  title="Sao chép email"
                >
                  {copied ? <FaCheck /> : <FaCopy />}
                </button>
              </div>
            </div>
          </div>
          <button className="sg-action-btn contact-btn" onClick={handleContact}>
            <FaEnvelope /> Gửi email cho chúng tôi
          </button>
        </div>

        {/* Mở thẻ */}
        <div className="sg-card">
          <div className="sg-card-header">
            <FaCreditCard className="sg-icon card-icon" />
            <h2 className="sg-card-title">Mở thẻ ngân hàng</h2>
          </div>
          <p className="sg-card-description">
            Hướng dẫn mở thẻ ghi nợ/thanh toán tại các ngân hàng Việt Nam:
          </p>
          <div className="sg-banks-grid">
            {banks.map((bank, index) => (
              <button
                key={index}
                className="sg-bank-btn"
                onClick={() => handleOpenCard(bank.name, bank.url)}
              >
                <span>{bank.name}</span>
                <FaExternalLinkAlt className="sg-external-icon" />
              </button>
            ))}
          </div>
        </div>
      </div>
      </div>

      {/* Modal Hỗ trợ */}
      {showSupportModal && (
        <div className="sg-support-modal" onClick={handleCloseSupportModal}>
          <div className="sg-support-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="sg-support-modal-header">
              <h3>🤝 Hỗ trợ MoneyWise</h3>
              <button 
                className="sg-support-modal-close" 
                onClick={handleCloseSupportModal}
                aria-label="Đóng"
              >
                <FaTimes />
              </button>
            </div>
            
            <form onSubmit={handleSupportSubmit} className="sg-support-form">
              <div className="sg-support-section">
                <h4 className="sg-support-section-title">Thông tin cơ bản</h4>
                
                <div className="sg-support-form-group">
                  <label htmlFor="support-email">
                    📧 Email <span className="required">*</span>
                  </label>
                  <input
                    type="email"
                    id="support-email"
                    name="email"
                    value={supportForm.email}
                    onChange={handleSupportInputChange}
                    placeholder="email@example.com"
                    required
                    disabled={isSubmitting}
                  />
                </div>

                <div className="sg-support-form-group">
                  <label htmlFor="support-name">
                    👤 Tên người dùng <span className="required">*</span>
                  </label>
                  <input
                    type="text"
                    id="support-name"
                    name="name"
                    value={supportForm.name}
                    onChange={handleSupportInputChange}
                    placeholder="Nhập tên của bạn"
                    required
                    disabled={isSubmitting}
                  />
                </div>

                <div className="sg-support-form-group">
                  <label htmlFor="support-message">
                    💬 Nội dung hỗ trợ
                  </label>
                  <textarea
                    id="support-message"
                    name="message"
                    value={supportForm.message}
                    onChange={handleSupportInputChange}
                    placeholder="Bạn muốn hỗ trợ gì? (code, báo lỗi, cải thiện ứng dụng...)"
                    rows="4"
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <div className="sg-support-section">
                <h4 className="sg-support-section-title">Thông tin cá nhân</h4>
                
                <div className="sg-support-form-group">
                  <label htmlFor="support-usage-time">⏰ Thời gian sử dụng</label>
                  <select
                    id="support-usage-time"
                    name="personalInfo.usageTime"
                    value={supportForm.personalInfo.usageTime}
                    onChange={handleSupportInputChange}
                    disabled={isSubmitting}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: '2px solid #e5e7eb',
                      borderRadius: '10px',
                      fontSize: '15px',
                      fontFamily: 'Poppins, sans-serif',
                      cursor: isSubmitting ? 'not-allowed' : 'pointer',
                      backgroundColor: isSubmitting ? '#f3f4f6' : 'white'
                    }}
                  >
                    <option value="">Chọn thời gian sử dụng</option>
                    <option value="less-than-1-month">Dưới 1 tháng</option>
                    <option value="1-3-months">1 - 3 tháng</option>
                    <option value="3-6-months">3 - 6 tháng</option>
                    <option value="6-12-months">6 - 12 tháng</option>
                    <option value="more-than-1-year">Trên 1 năm</option>
                  </select>
                </div>

                <div className="sg-support-form-group">
                  <label htmlFor="support-purpose">🎯 Sử dụng web của chúng tôi cho mục đích gì?</label>
                  <textarea
                    id="support-purpose"
                    name="personalInfo.purpose"
                    value={supportForm.personalInfo.purpose}
                    onChange={handleSupportInputChange}
                    placeholder="Ví dụ: Quản lý chi tiêu cá nhân, theo dõi thu nhập, quản lý ngân sách gia đình..."
                    rows="4"
                    disabled={isSubmitting}
                  />
                </div>

                <div className="sg-support-quick-contact">
                  <div className="sg-support-quick-contact-header">
                    <span className="sg-support-quick-contact-icon">💬</span>
                    <strong>Liên hệ hỗ trợ nhanh</strong>
                  </div>
                  <p className="sg-support-quick-contact-text">
                    Bạn cần hỗ trợ ngay? Hãy liên hệ với chúng tôi qua Facebook!
                  </p>
                  <a
                    href="https://web.facebook.com/duy.tran.871645/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="sg-support-facebook-btn"
                  >
                    <span>📘</span> Liên hệ qua Facebook
                  </a>
                </div>
              </div>

              <div className="sg-support-form-actions">
                <button
                  type="button"
                  className="sg-support-btn-cancel"
                  onClick={handleCloseSupportModal}
                  disabled={isSubmitting}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="sg-support-btn-submit"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Đang gửi...' : 'Gửi hỗ trợ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Yêu cầu tính năng */}
      {showFeatureModal && (
        <div className="sg-support-modal" onClick={handleCloseFeatureModal}>
          <div className="sg-support-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="sg-support-modal-header" style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' }}>
              <h3>💡 Yêu cầu tính năng mới</h3>
              <button 
                className="sg-support-modal-close" 
                onClick={handleCloseFeatureModal}
                aria-label="Đóng"
              >
                <FaTimes />
              </button>
            </div>
            
            <form onSubmit={handleFeatureSubmit} className="sg-support-form">
              <div className="sg-support-section">
                <h4 className="sg-support-section-title">Thông tin cơ bản</h4>
                
                <div className="sg-support-form-group">
                  <label htmlFor="feature-email">
                    📧 Email <span className="required">*</span>
                  </label>
                  <input
                    type="email"
                    id="feature-email"
                    name="email"
                    value={featureForm.email}
                    onChange={handleFeatureInputChange}
                    placeholder="email@example.com"
                    required
                    disabled={isSubmittingFeature}
                  />
                </div>

                <div className="sg-support-form-group">
                  <label htmlFor="feature-name">
                    👤 Tên người dùng <span className="required">*</span>
                  </label>
                  <input
                    type="text"
                    id="feature-name"
                    name="name"
                    value={featureForm.name}
                    onChange={handleFeatureInputChange}
                    placeholder="Nhập tên của bạn"
                    required
                    disabled={isSubmittingFeature}
                  />
                </div>

                <div className="sg-support-form-group">
                  <label htmlFor="feature-message">
                    💬 Mô tả tính năng
                  </label>
                  <textarea
                    id="feature-message"
                    name="message"
                    value={featureForm.message}
                    onChange={handleFeatureInputChange}
                    placeholder="Mô tả chi tiết tính năng bạn muốn thêm vào..."
                    rows="4"
                    disabled={isSubmittingFeature}
                  />
                </div>
              </div>

              <div className="sg-support-section">
                <h4 className="sg-support-section-title">Chọn mục yêu cầu tính năng <span className="required">*</span></h4>
                
                <div className="sg-feature-categories-grid">
                  {featureCategories.map((category) => (
                    <label
                      key={category.id}
                      className={`sg-feature-category-item ${
                        featureForm.featureCategories.includes(category.id) ? 'selected' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={featureForm.featureCategories.includes(category.id)}
                        onChange={() => handleFeatureCategoryToggle(category.id)}
                        disabled={isSubmittingFeature}
                        style={{ display: 'none' }}
                      />
                      <div className="sg-feature-category-icon">{category.icon}</div>
                      <div className="sg-feature-category-label">{category.label}</div>
                      {featureForm.featureCategories.includes(category.id) && (
                        <div className="sg-feature-category-check">✓</div>
                      )}
                    </label>
                  ))}
                </div>
              </div>

              <div className="sg-support-form-actions">
                <button
                  type="button"
                  className="sg-support-btn-cancel"
                  onClick={handleCloseFeatureModal}
                  disabled={isSubmittingFeature}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="sg-support-btn-submit"
                  disabled={isSubmittingFeature}
                  style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' }}
                >
                  {isSubmittingFeature ? 'Đang gửi...' : 'Gửi yêu cầu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default SettingsGeneral;

