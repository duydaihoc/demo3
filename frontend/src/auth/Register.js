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
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Họ tên:</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label>Email:</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label>Mật khẩu:</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label>Xác nhận mật khẩu:</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="auth-button">Đăng ký</button>
        </form>
        <p>Đã có tài khoản? <a href="/login">Đăng nhập</a></p>
      </div>
    </div>
  );
}

export default Register;
