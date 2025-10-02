import React, { useState } from 'react';
import './Register.css';
import { FaUser, FaEnvelope, FaLock, FaUserPlus, FaExclamationCircle, FaCheckCircle } from 'react-icons/fa';

function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Mật khẩu không khớp!');
      return;
    }
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const response = await fetch('http://localhost:5000/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await response.json();
      if (response.ok) {
        setSuccess(data.message); // Show success message
        setName('');
        setEmail('');
        setPassword('');
        setConfirmPassword('');
        setTimeout(() => {
          window.location.href = '/login';
        }, 1200); // Delay redirect to show message
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('Network error');
    }
    setLoading(false);
  };

  return (
    <div className="auth-container">
      <div className="auth-wrapper">
        <div className="auth-card">
          <div className="auth-content">
            <h2 className="auth-title">Tạo tài khoản</h2>
            <p className="auth-subtitle">Đăng ký để bắt đầu quản lý tài chính của bạn</p>
            
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
