import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import CategorySettings from './CategorySettings';
import './SettingsPage.css';
import './CategorySettings.css';

function SettingsPage() {
  const userName = localStorage.getItem('userName') || 'Tên người dùng';
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const initialTab = params.get('tab') === 'categories' ? 'categories' : 'account';
  const [activeTab, setActiveTab] = useState(initialTab);

  // Profile state
  const [profile, setProfile] = useState({ name: '', email: '' });
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);

  // Password state
  const [passwords, setPasswords] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [passwordSaving, setPasswordSaving] = useState(false);

  // Notification state
  const [notification, setNotification] = useState({ show: false, message: '', type: '' });

  const token = localStorage.getItem('token');

  useEffect(() => {
    const p = new URLSearchParams(location.search);
    setActiveTab(p.get('tab') === 'categories' ? 'categories' : 'account');
  }, [location.search]);

  // Fetch user profile
  useEffect(() => {
    if (activeTab === 'account' && token) {
      fetchProfile();
    }
  }, [activeTab, token]);

  const fetchProfile = async () => {
    try {
      const res = await fetch('http://localhost:5000/api/users/profile', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Không thể tải thông tin người dùng');
      const data = await res.json();
      setProfile({ name: data.name || '', email: data.email || '' });
    } catch (err) {
      console.error(err);
      showNotification('Không thể tải thông tin người dùng', 'error');
    } finally {
      setProfileLoading(false);
    }
  };

  const showNotification = (message, type = 'success') => {
    setNotification({ show: true, message, type });
    setTimeout(() => setNotification({ show: false, message: '', type: '' }), 4000);
  };

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    if (!profile.name.trim() || !profile.email.trim()) {
      showNotification('Vui lòng điền đầy đủ thông tin', 'error');
      return;
    }

    setProfileSaving(true);
    try {
      const res = await fetch('http://localhost:5000/api/users/profile', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(profile)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Cập nhật thất bại');

      // Update localStorage if name changed
      localStorage.setItem('userName', data.name);
      showNotification('Cập nhật thông tin thành công!', 'success');
      
      // Reload to update sidebar name
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      console.error(err);
      showNotification(err.message || 'Lỗi khi cập nhật thông tin', 'error');
    } finally {
      setProfileSaving(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    const { currentPassword, newPassword, confirmPassword } = passwords;

    if (!currentPassword || !newPassword || !confirmPassword) {
      showNotification('Vui lòng điền đầy đủ thông tin', 'error');
      return;
    }

    if (newPassword !== confirmPassword) {
      showNotification('Mật khẩu mới không khớp', 'error');
      return;
    }

    setPasswordSaving(true);
    try {
      const res = await fetch('http://localhost:5000/api/users/change-password', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(passwords)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Đổi mật khẩu thất bại');

      showNotification('Đổi mật khẩu thành công!', 'success');
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      console.error(err);
      showNotification(err.message || 'Lỗi khi đổi mật khẩu', 'error');
    } finally {
      setPasswordSaving(false);
    }
  };

  return (
    <div>
      <Sidebar userName={userName} />
      <main className="settings-main" style={{ marginLeft: 220 }}>
        {notification.show && (
          <div className={`settings-notification ${notification.type}`}>
            {notification.message}
          </div>
        )}
        
        <div className="settings-header">
          <div className="settings-title-row">
            <h2 className="settings-title">Cài đặt tài khoản</h2>
          </div>
        </div>
        
        <div className="settings-content">
          {activeTab === 'account' ? (
            <>
            <section className="settings-card">
              <div className="settings-card-title">👤 Thông tin hồ sơ</div>
              {profileLoading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#2a5298' }}>
                  <div style={{ fontSize: '2rem', marginBottom: '12px' }}>⏳</div>
                  Đang tải thông tin...
                </div>
              ) : (
                <form className="settings-form" onSubmit={handleProfileSubmit}>
                  <div className="settings-form-group">
                    <label>Tên hiển thị</label>
                    <input 
                      type="text" 
                      value={profile.name}
                      onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                      placeholder="Nhập tên hiển thị của bạn"
                      disabled={profileSaving}
                    />
                  </div>
                  <div className="settings-form-group">
                    <label>Email</label>
                    <input 
                      type="email" 
                      value={profile.email}
                      onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                      placeholder="Nhập địa chỉ email"
                      disabled={profileSaving}
                    />
                  </div>
                  <div className="settings-form-row">
                    <div className="settings-form-group">
                      <label>Tiền tệ</label>
                      <select disabled={profileSaving}>
                        <option>🇻🇳 VND - Việt Nam Đồng</option>
                        <option>🇺🇸 USD - US Dollar</option>
                        <option>🇪🇺 EUR - Euro</option>
                      </select>
                    </div>
                    <div className="settings-form-group">
                      <label>Ngôn ngữ</label>
                      <select disabled={profileSaving}>
                        <option>🇻🇳 Tiếng Việt</option>
                        <option>🇬🇧 English</option>
                      </select>
                    </div>
                    <div className="settings-form-group">
                      <label>Chủ đề</label>
                      <select disabled={profileSaving}>
                        <option>☀️ Sáng</option>
                        <option>🌙 Tối</option>
                        <option>🎨 Tự động</option>
                      </select>
                    </div>
                  </div>
                  <button type="submit" className="settings-save-btn" disabled={profileSaving}>
                    {profileSaving ? '⏳ Đang lưu...' : '💾 Lưu thay đổi'}
                  </button>
                </form>
              )}
            </section>
            
            <section className="settings-card">
              <div className="settings-card-title">🔒 Bảo mật</div>
              <form className="settings-form" onSubmit={handlePasswordSubmit}>
                <div className="settings-form-group">
                  <label>Mật khẩu hiện tại</label>
                  <input 
                    type="password" 
                    value={passwords.currentPassword}
                    onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })}
                    placeholder="Nhập mật khẩu hiện tại của bạn"
                    disabled={passwordSaving}
                  />
                </div>
                <div className="settings-form-row">
                  <div className="settings-form-group">
                    <label>Mật khẩu mới</label>
                    <input 
                      type="password" 
                      value={passwords.newPassword}
                      onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })}
                      placeholder="Nhập mật khẩu mới"
                      disabled={passwordSaving}
                    />
                  </div>
                  <div className="settings-form-group">
                    <label>Nhập lại mật khẩu</label>
                    <input 
                      type="password" 
                      value={passwords.confirmPassword}
                      onChange={(e) => setPasswords({ ...passwords, confirmPassword: e.target.value })}
                      placeholder="Xác nhận mật khẩu mới"
                      disabled={passwordSaving}
                    />
                  </div>
                </div>
                <button type="submit" className="settings-change-btn" disabled={passwordSaving}>
                  {passwordSaving ? '⏳ Đang đổi...' : '🔑 Đổi mật khẩu'}
                </button>
              </form>
            </section>
            </>
          ) : (
            <CategorySettings token={token} />
          )}
        </div>
      </main>
    </div>
  );
}

export default SettingsPage;

