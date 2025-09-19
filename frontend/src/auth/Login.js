import React, { useState } from 'react';
import './Login.css';

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
      <div className="auth-form">
        <h2>Đăng nhập</h2>
        <form onSubmit={handleSubmit} autoComplete="off">
          <div className="form-group">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder=" "
              autoComplete="off"
            />
            <label>Email:</label>
          </div>
          <div className="form-group">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder=" "
              autoComplete="new-password"
            />
            <label>Mật khẩu:</label>
          </div>
          {error && <p className="error-message">{error}</p>}
          {success && <p className="success-message">{success}</p>}
          <button type="submit" className="auth-button" disabled={loading}>
            {loading ? 'Đang xử lý...' : 'Đăng nhập'}
          </button>
        </form>
        <p>Chưa có tài khoản? <a href="/register">Đăng ký</a></p>
      </div>
    </div>
  );
}

export default Login;
