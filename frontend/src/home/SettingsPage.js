import React from 'react';
import Sidebar from './Sidebar';
import './SettingsPage.css';

function SettingsPage() {
  const userName = localStorage.getItem('userName') || 'Tên người dùng'; // Get from localStorage with fallback

  return (
    <div>
      <Sidebar userName={userName} />
      <main className="settings-main" style={{ marginLeft: 220 }}>
        <div className="settings-header">
          <span className="settings-title">Cài đặt tài khoản</span>
        </div>
        <div className="settings-content">
          <section className="settings-card">
            <div className="settings-card-title">Thông tin hồ sơ</div>
            <form className="settings-form">
              <div className="settings-form-group">
                <label>Tên hiển thị</label>
                <input type="text" value="dung1" readOnly />
              </div>
              <div className="settings-form-group">
                <label>Email</label>
                <input type="email" value="dung1@gmail.com" readOnly />
              </div>
              <div className="settings-form-row">
                <div className="settings-form-group">
                  <label>Tiền tệ</label>
                  <select>
                    <option>VND</option>
                  </select>
                </div>
                <div className="settings-form-group">
                  <label>Ngôn ngữ</label>
                  <select>
                    <option>Tiếng Việt</option>
                  </select>
                </div>
                <div className="settings-form-group">
                  <label>Chủ đề</label>
                  <select>
                    <option>Sáng</option>
                  </select>
                </div>
              </div>
              <button className="settings-save-btn">Lưu thay đổi</button>
            </form>
          </section>
          <section className="settings-card">
            <div className="settings-card-title">Bảo mật</div>
            <form className="settings-form">
              <div className="settings-form-group">
                <label>Mật khẩu hiện tại</label>
                <input type="password" value="********" readOnly />
              </div>
              <div className="settings-form-row">
                <div className="settings-form-group">
                  <label>Mật khẩu mới</label>
                  <input type="password" placeholder="Mật khẩu mới" />
                </div>
                <div className="settings-form-group">
                  <label>Nhập lại mật khẩu</label>
                  <input type="password" placeholder="Nhập lại mật khẩu" />
                </div>
              </div>
              <button className="settings-change-btn">Đổi mật khẩu</button>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}

export default SettingsPage;
