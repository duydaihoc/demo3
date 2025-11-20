import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import CategorySettings from './CategorySettings';
import { showNotification } from '../utils/notify';
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

  // Removed local notification state - using global notification from notify.js only

  // THÊM: Statistics state
  const [statistics, setStatistics] = useState(null);
  const [statisticsLoading, setStatisticsLoading] = useState(true);

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

  // THÊM: Fetch statistics
  useEffect(() => {
    if (activeTab === 'account' && token) {
      fetchProfile();
      fetchStatistics(); // THÊM: Fetch statistics
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

  // THÊM: Fetch statistics function
  const fetchStatistics = async () => {
    try {
      const res = await fetch('http://localhost:5000/api/users/statistics', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Không thể tải thống kê');
      const data = await res.json();
      setStatistics(data);
    } catch (err) {
      console.error(err);
      showNotification('❌ Không thể tải thống kê', 'error');
    } finally {
      setStatisticsLoading(false);
    }
  };

  // Using global showNotification from notify.js - no local wrapper needed

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    if (!profile.name.trim() || !profile.email.trim()) {
      showNotification('❌ Vui lòng điền đầy đủ thông tin', 'error');
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
      showNotification('✅ Cập nhật thông tin thành công!', 'success');
      
      // Reload to update sidebar name
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      console.error(err);
      showNotification('❌ ' + (err.message || 'Lỗi khi cập nhật thông tin'), 'error');
    } finally {
      setProfileSaving(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    const { currentPassword, newPassword, confirmPassword } = passwords;

    if (!currentPassword || !newPassword || !confirmPassword) {
      showNotification('❌ Vui lòng điền đầy đủ thông tin', 'error');
      return;
    }

    if (newPassword !== confirmPassword) {
      showNotification('❌ Mật khẩu mới không khớp', 'error');
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

      showNotification('✅ Đổi mật khẩu thành công!', 'success');
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      console.error(err);
      showNotification('❌ ' + (err.message || 'Lỗi khi đổi mật khẩu'), 'error');
    } finally {
      setPasswordSaving(false);
    }
  };

  return (
    <div>
      <Sidebar userName={userName} />
      <main className="settings-main" style={{ marginLeft: 220 }}>
        {/* Notification removed - using global notification from notify.js only */}
        
        <div className="settings-header">
          <div className="settings-title-row">
            <h2 className="settings-title">Cài đặt tài khoản</h2>
          </div>
        </div>
        
        <div className="settings-content">
          {activeTab === 'account' ? (
            <>
            {/* 1. THÔNG TIN HỒ SƠ - ĐẨY LÊN ĐẦU */}
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
            
            {/* 2. BẢO MẬT - Ở VỊ TRÍ THỨ 2 */}
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

            {/* 3. THỐNG KÊ TÀI KHOẢN - ĐẨY XUỐNG DƯỚI CÙNG */}
            <section className="settings-card statistics-card">
              <div className="settings-card-title">📊 Thống kê tài khoản</div>
              {statisticsLoading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#2a5298' }}>
                  <div style={{ fontSize: '2rem', marginBottom: '12px' }}>⏳</div>
                  Đang tải thống kê...
                </div>
              ) : statistics ? (
                <div className="statistics-grid">
                  {/* THÊM: Thông tin tài khoản */}
                  <div className="stat-item account-info">
                    <div className="stat-icon">👤</div>
                    <div className="stat-content">
                      <div className="stat-value">{statistics.account.age}</div>
                      <div className="stat-label">Ngày đã tham gia</div>
                      <div className="stat-detail">
                        Từ ngày: {new Date(statistics.account.createdAt).toLocaleDateString('vi-VN', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </div>
                    </div>
                  </div>

                  {/* THÊM: Số bạn bè */}
                  <div className="stat-item friends-info">
                    <div className="stat-icon">👥</div>
                    <div className="stat-content">
                      <div className="stat-value">{statistics.account.friends}</div>
                      <div className="stat-label">Bạn bè</div>
                    </div>
                  </div>

                  {/* Ví */}
                  <div className="stat-item">
                    <div className="stat-icon">💳</div>
                    <div className="stat-content">
                      <div className="stat-value">{statistics.wallets}</div>
                      <div className="stat-label">Ví cá nhân</div>
                    </div>
                  </div>

                  {/* Nhóm */}
                  <div className="stat-item">
                    <div className="stat-icon">👥</div>
                    <div className="stat-content">
                      <div className="stat-value">{statistics.groups.total}</div>
                      <div className="stat-label">Nhóm</div>
                      <div className="stat-detail">
                        Tạo: {statistics.groups.created} | Tham gia: {statistics.groups.joined}
                      </div>
                    </div>
                  </div>

                  {/* Gia đình */}
                  <div className="stat-item">
                    <div className="stat-icon">🏠</div>
                    <div className="stat-content">
                      <div className="stat-value">{statistics.families.total}</div>
                      <div className="stat-label">Gia đình</div>
                      <div className="stat-detail">
                        Tạo: {statistics.families.created} | Tham gia: {statistics.families.joined}
                      </div>
                    </div>
                  </div>

                  {/* Giao dịch cá nhân */}
                  <div className="stat-item">
                    <div className="stat-icon">💰</div>
                    <div className="stat-content">
                      <div className="stat-value">{statistics.transactions.personal}</div>
                      <div className="stat-label">Giao dịch cá nhân</div>
                    </div>
                  </div>

                  {/* Giao dịch nhóm */}
                  <div className="stat-item">
                    <div className="stat-icon">👫</div>
                    <div className="stat-content">
                      <div className="stat-value">{statistics.transactions.group}</div>
                      <div className="stat-label">Giao dịch nhóm</div>
                      {/* THÊM: Hiển thị chi tiết theo loại nếu có */}
                      {statistics.transactions.groupByType && (
                        <div className="stat-detail-list">
                          {statistics.transactions.groupByType.payer_single > 0 && (
                            <div className="detail-row">
                              <span className="detail-icon">💳</span>
                              <span>Trả đơn: {statistics.transactions.groupByType.payer_single}</span>
                            </div>
                          )}
                          {statistics.transactions.groupByType.payer_for_others > 0 && (
                            <div className="detail-row">
                              <span className="detail-icon">🤝</span>
                              <span>Trả giúp: {statistics.transactions.groupByType.payer_for_others}</span>
                            </div>
                          )}
                          {statistics.transactions.groupByType.equal_split > 0 && (
                            <div className="detail-row">
                              <span className="detail-icon">⚖️</span>
                              <span>Chia đều: {statistics.transactions.groupByType.equal_split}</span>
                            </div>
                          )}
                          {statistics.transactions.groupByType.percentage_split > 0 && (
                            <div className="detail-row">
                              <span className="detail-icon">📊</span>
                              <span>Chia %: {statistics.transactions.groupByType.percentage_split}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Giao dịch gia đình */}
                  <div className="stat-item family-transactions">
                    <div className="stat-icon">🏡</div>
                    <div className="stat-content">
                      <div className="stat-value">{statistics.transactions.family.total}</div>
                      <div className="stat-label">Giao dịch gia đình</div>
                      <div className="stat-detail-list">
                        <div className="detail-row">
                          <span className="detail-icon">🔄</span>
                          <span>Nạp/Rút quỹ: {statistics.transactions.family.transfer}</span>
                        </div>
                        <div className="detail-row">
                          <span className="detail-icon">👤</span>
                          <span>Chi tiêu cá nhân: {statistics.transactions.family.personal}</span>
                        </div>
                        <div className="detail-row">
                          <span className="detail-icon">💰</span>
                          <span>Chi tiêu quỹ GĐ: {statistics.transactions.family.fund}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Tổng giao dịch */}
                  <div className="stat-item total-transactions">
                    <div className="stat-icon">📈</div>
                    <div className="stat-content">
                      <div className="stat-value">{statistics.transactions.total}</div>
                      <div className="stat-label">Tổng giao dịch</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '40px', textAlign: 'center', color: '#999' }}>
                  Không có dữ liệu thống kê
                </div>
              )}
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

