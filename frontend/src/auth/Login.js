import React, { useState } from 'react';
import './Login.css';
import { FaExclamationCircle, FaCheckCircle, FaUser, FaLock, FaSignInAlt } from 'react-icons/fa';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');

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
        localStorage.setItem('role', data.role); // Save role
        setSuccess(data.message); // Show success message
        setTimeout(() => {
          if (data.role === 'admin') {
            window.location.href = '/admin';
          } else {
            window.location.href = '/home';
          }
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
            <h2 className="auth-title">Đăng nhập</h2>
            <p className="auth-subtitle">Vui lòng đăng nhập để tiếp tục</p>
            
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
