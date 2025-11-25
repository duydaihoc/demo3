import React, { useState } from 'react';
import './Login.css';
import { FaExclamationCircle, FaCheckCircle, FaUser, FaLock, FaSignInAlt, FaKey } from 'react-icons/fa';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [showVerification, setShowVerification] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [unverifiedEmail, setUnverifiedEmail] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const response = await fetch('http://localhost:5000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (response.ok) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('userName', data.name);
        localStorage.setItem('userId', data.userId);
        localStorage.setItem('role', data.role);
        localStorage.setItem('isNewUser', data.isNewUser);
        localStorage.setItem('hasSeenTour', data.hasSeenTour);
        setSuccess(data.message);
        setTimeout(() => {
          if (data.role === 'admin') {
            window.location.href = '/admin';
          } else {
            window.location.href = '/home';
          }
        }, 1200);
      } else {
        if (data.requiresVerification) {
          setUnverifiedEmail(data.email || email);
          setShowVerification(true);
          setError(data.message);
        } else {
          setError(data.message);
        }
      }
    } catch (err) {
      setError('Lỗi kết nối mạng');
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
        body: JSON.stringify({ email: unverifiedEmail, code: verificationCode }),
      });
      const data = await response.json();
      if (response.ok) {
        setSuccess('Xác thực thành công! Vui lòng đăng nhập lại.');
        setTimeout(() => {
          setShowVerification(false);
          setVerificationCode('');
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
        body: JSON.stringify({ email: unverifiedEmail }),
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
          <div className="auth-brand">
            <div className="logo">
              <div className="logo-icon">
                <div className="coin-stack">
                  <div className="coin coin-1"></div>
                  <div className="coin coin-2"></div>
                  <div className="coin coin-3"></div>
                </div>
                <div className="wallet"></div>
              </div>
            </div>
            <h1>MoneyWise</h1>
            <p className="tagline">Quản lý chi tiêu thông minh</p>
          </div>
          
          <div className="auth-content">
            <h2 className="auth-title">{showVerification ? 'Xác thực email' : 'Đăng nhập'}</h2>
            <p className="auth-subtitle">
              {showVerification 
                ? 'Nhập mã xác thực đã được gửi đến email của bạn' 
                : 'Vui lòng đăng nhập để tiếp tục'}
            </p>
            
            {error && (
              <div className="alert alert-danger">
                <FaExclamationCircle />
                <span>{error}</span>
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
                  <p className="email-highlight">{unverifiedEmail}</p>
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
                    ← Quay lại đăng nhập
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
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
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
              
              <div className="form-options">
                <div className="form-remember">
                  <input type="checkbox" id="remember" />
                  <label htmlFor="remember">Ghi nhớ đăng nhập</label>
                </div>
                <a href="#forgot" className="forgot-link">Quên mật khẩu?</a>
              </div>
              
              <button type="submit" className="btn-submit" disabled={loading}>
                {loading ? (
                  <span className="btn-spinner"></span>
                ) : (
                  <>
                    <FaSignInAlt /> Đăng nhập
                  </>
                )}
              </button>
            </form>
            )}
            
            <div className="auth-alt">
              <p>Chưa có tài khoản? <a href="/register">Đăng ký ngay</a></p>
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

export default Login;
