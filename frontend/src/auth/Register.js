import React, { useState } from 'react';
import './Register.css';

function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      alert('Mật khẩu không khớp!');
      return;
    }
    // Handle register logic here
    console.log('Register:', { name, email, password });
  };

  return (
    <div className="auth-container">
      <div className="auth-form">
        <h2>Đăng ký</h2>
        <form onSubmit={handleSubmit} autoComplete="off">
          <div className="form-group">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder=" "
              autoComplete="off"
            />
            <label>Họ tên:</label>
          </div>
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
          <div className="form-group">
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              placeholder=" "
              autoComplete="new-password"
            />
            <label>Xác nhận mật khẩu:</label>
          </div>
          <button type="submit" className="auth-button">Đăng ký</button>
        </form>
        <p>Đã có tài khoản? <a href="/login">Đăng nhập</a></p>
      </div>
    </div>
  );
}

export default Register;
