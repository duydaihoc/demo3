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
  FaCheck
} from 'react-icons/fa';
import { showNotification } from '../utils/notify';

function SettingsGeneral() {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const appVersion = '1.0.0';
  const userName = localStorage.getItem('userName') || 'Tên người dùng';
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

  const handleContribute = () => {
    showNotification('🤝 Cảm ơn bạn đã quan tâm đóng góp! Vui lòng liên hệ với chúng tôi qua email.', 'info');
  };

  const handleFeatureRequest = () => {
    const email = 'duytran.tk4@gmail.com';
    const subject = encodeURIComponent('Yêu cầu tính năng mới');
    const body = encodeURIComponent('Xin chào MoneyWise,\n\nTôi muốn đề xuất tính năng:\n\n[Vui lòng mô tả tính năng bạn muốn]\n\nCảm ơn!');
    window.open(`mailto:${email}?subject=${subject}&body=${body}`, '_blank');
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

        {/* Đóng góp */}
        <div className="sg-card">
          <div className="sg-card-header">
            <FaHandHoldingHeart className="sg-icon contribute-icon" />
            <h2 className="sg-card-title">Đóng góp cho chúng tôi</h2>
          </div>
          <p className="sg-card-description">
            Bạn muốn đóng góp code, báo lỗi hoặc cải thiện ứng dụng? Chúng tôi rất hoan nghênh!
          </p>
          <button className="sg-action-btn contribute-btn" onClick={handleContribute}>
            <FaHandHoldingHeart /> Tìm hiểu cách đóng góp
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
    </div>
  );
}

export default SettingsGeneral;

