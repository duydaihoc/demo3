import React, { useState } from 'react';
import './Register.css';
import { FaUser, FaEnvelope, FaLock, FaUserPlus, FaExclamationCircle, FaCheckCircle, FaKey } from 'react-icons/fa';

function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [showVerification, setShowVerification] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [registeredEmail, setRegisteredEmail] = useState('');
  const [emailExists, setEmailExists] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate email format trước khi gửi
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Email không đúng định dạng. Vui lòng nhập email hợp lệ (ví dụ: example@gmail.com)');
      return;
    }
    
    if (password !== confirmPassword) {
      setError('Mật khẩu không khớp!');
      return;
    }
    
    setLoading(true);
    setError('');
    setSuccess('');
    setEmailExists(false);
    try {
      const response = await fetch('http://localhost:5000/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await response.json();
      if (response.ok) {
        if (data.requiresVerification) {
          setSuccess(data.message);
          setRegisteredEmail(email);
          setShowVerification(true);
          setName('');
          setPassword('');
          setConfirmPassword('');
        } else {
          setSuccess(data.message);
          localStorage.setItem('justRegistered', 'true');
          setTimeout(() => {
            window.location.href = '/login';
          }, 1200);
        }
      } else {
        // Hiển thị lỗi cụ thể
        if (data.emailExists) {
          // Email đã tồn tại
          setEmailExists(true);
          setError(data.message || 'Email này đã được sử dụng. Vui lòng sử dụng email khác hoặc đăng nhập.');
          setEmail(''); // Reset email field để user nhập lại
        } else {
          setEmailExists(false);
        if (data.emailError) {
          // Lỗi email không tồn tại hoặc không hợp lệ
          setError(data.message);
            setEmail(''); // Reset email field
        } else if (data.configError) {
          setError(data.message);
        } else {
            setError(data.message || 'Đăng ký thất bại. Vui lòng thử lại.');
        }
        }
      }
    } catch (err) {
      setError('Lỗi kết nối mạng. Vui lòng kiểm tra kết nối internet của bạn.');
    }
    setLoading(false);
  };

  const handleVerification = async (e) => {
    e.preventDefault();
    if (!verificationCode || verificationCode.length !== 6) {
      setError('Vui lòng nhập mã xác thực 6 số');
      return;
    }
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const response = await fetch('http://localhost:5000/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: registeredEmail, code: verificationCode }),
      });
      const data = await response.json();
      if (response.ok) {
        setSuccess('Xác thực thành công! Đang chuyển đến trang đăng nhập...');
        localStorage.setItem('justRegistered', 'true');
        setTimeout(() => {
          window.location.href = '/login';
        }, 1500);
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('Lỗi kết nối mạng');
    }
    setLoading(false);
  };

  const handleResendCode = async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const response = await fetch('http://localhost:5000/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: registeredEmail }),
      });
      const data = await response.json();
      if (response.ok) {
        setSuccess('Mã xác thực mới đã được gửi đến email của bạn!');
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('Lỗi kết nối mạng');
    }
    setLoading(false);
  };

  return (
    <div className="auth-container">
      <div className="auth-wrapper">
        <div className="auth-card">
          <div className="auth-content">
            <h2 className="auth-title">{showVerification ? 'Xác thực email' : 'Tạo tài khoản'}</h2>
            <p className="auth-subtitle">
              {showVerification 
                ? 'Nhập mã xác thực đã được gửi đến email của bạn' 
                : 'Đăng ký để bắt đầu quản lý tài chính của bạn'}
            </p>
            
            {error && (
              <div className="alert alert-danger">
                <FaExclamationCircle />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span>{error}</span>
                  {emailExists && (
                    <div style={{ marginTop: '8px', fontSize: '14px' }}>
                      <a href="/login" style={{ color: '#fff', textDecoration: 'underline', fontWeight: 600 }}>
                        → Đăng nhập ngay nếu đây là tài khoản của bạn
                      </a>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {success && (
              <div className="alert alert-success">
                <FaCheckCircle />
                <span>{success}</span>
              </div>
            )}
            
            {showVerification ? (
              <form onSubmit={handleVerification} className="auth-form">
                <div className="verification-info">
                  <p>📧 Mã xác thực đã được gửi đến:</p>
                  <p className="email-highlight">{registeredEmail}</p>
                  <div className="verification-note">
                    <p>⏱️ Không nhận được email sau 2 phút?</p>
                    <ul>
                      <li>Kiểm tra thư mục <strong>Spam/Junk</strong></li>
                      <li>Đảm bảo email của bạn <strong>chính xác</strong></li>
                      <li>Click "Gửi lại mã" bên dưới</li>
                    </ul>
                  </div>
                </div>
                
                <div className="form-group">
                  <div className="input-icon">
                    <FaKey />
                  </div>
                  <input
                    type="text"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    required
                    placeholder="Nhập mã 6 số"
                    className="form-control verification-input"
                    maxLength="6"
                  />
                </div>
                
                <button type="submit" className="btn-submit" disabled={loading}>
                  {loading ? (
                    <span className="btn-spinner"></span>
                  ) : (
                    <>
                      <FaCheckCircle /> Xác thực
                    </>
                  )}
                </button>
                
                <div className="resend-section">
                  <p>Không nhận được mã?</p>
                  <button 
                    type="button" 
                    onClick={handleResendCode} 
                    className="btn-link"
                    disabled={loading}
                  >
                    Gửi lại mã
                  </button>
                </div>
                
                <div className="back-section">
                  <button 
                    type="button" 
                    onClick={() => {
                      setShowVerification(false);
                      setVerificationCode('');
                      setError('');
                      setSuccess('');
                    }} 
                    className="btn-link"
                  >
                    ← Quay lại đăng ký
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleSubmit} className="auth-form">
              <div className="form-group">
                <div className="input-icon">
                  <FaUser />
                </div>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="Họ tên"
                  className="form-control"
                />
              </div>
              
              <div className="form-group">
                <div className="input-icon">
                  <FaEnvelope />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (emailExists) {
                      setEmailExists(false);
                      setError('');
                    }
                  }}
                  required
                  placeholder="Email"
                  className="form-control"
                />
              </div>
              
              <div className="form-group">
                <div className="input-icon">
                  <FaLock />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="Mật khẩu"
                  className="form-control"
                />
              </div>
              
              <div className="form-group">
                <div className="input-icon">
                  <FaLock />
                </div>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  placeholder="Xác nhận mật khẩu"
                  className="form-control"
                />
              </div>
              
              <div className="form-terms">
                <input type="checkbox" id="terms" required />
                <label htmlFor="terms">Tôi đồng ý với <a href="#terms">điều khoản dịch vụ</a> và <a href="#privacy">chính sách bảo mật</a></label>
              </div>
              
              <button type="submit" className="btn-submit" disabled={loading}>
                {loading ? (
                  <span className="btn-spinner"></span>
                ) : (
                  <>
                    <FaUserPlus /> Đăng ký
                  </>
                )}
              </button>
            </form>
            )}
            
            <div className="auth-alt">
              <p>Đã có tài khoản? <a href="/login">Đăng nhập</a></p>
            </div>
          </div>
          
          <div className="auth-brand">
            <div className="auth-features">
              <h3>Quản lý chi tiêu thông minh</h3>
              <ul className="features-list">
                <li>
                  <div className="feature-icon">
                    <i className="fas fa-chart-pie"></i>
                  </div>
                  <div className="feature-text">
                    <h4>Theo dõi chi tiêu</h4>
                    <p>Ghi lại và phân loại mọi khoản chi tiêu</p>
                  </div>
                </li>
                <li>
                  <div className="feature-icon">
                    <i className="fas fa-bullseye"></i>
                  </div>
                  <div className="feature-text">
                    <h4>Đặt mục tiêu tài chính</h4>
                    <p>Lập kế hoạch tiết kiệm và theo dõi tiến độ</p>
                  </div>
                </li>
                <li>
                  <div className="feature-icon">
                    <i className="fas fa-users"></i>
                  </div>
                  <div className="feature-text">
                    <h4>Quản lý nhóm chi tiêu</h4>
                    <p>Dễ dàng chia sẻ chi phí với bạn bè và gia đình</p>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </div>
        
        <div className="auth-footer">
          <p>&copy; {new Date().getFullYear()} MoneyWise. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}

export default Register;
