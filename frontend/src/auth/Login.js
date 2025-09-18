import React, { useState } from 'react';
import './Login.css';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    // Handle login logic here
    console.log('Login:', { email, password });
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
          <button type="submit" className="auth-button">Đăng nhập</button>
        </form>
        <p>Chưa có tài khoản? <a href="/register">Đăng ký</a></p>
      </div>
    </div>
  );
}

export default Login;
