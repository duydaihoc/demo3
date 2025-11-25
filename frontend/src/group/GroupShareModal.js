import React, { useState, useEffect } from 'react';
import './GroupShareModal.css';
import { showNotification } from '../utils/notify';

export default function GroupShareModal({ groupId, isOpen, onClose }) {
  const [shareSettings, setShareSettings] = useState({
    enabled: false,
    allowedData: {
      transactions: true,
      members: false,
      statistics: true,
      charts: true,
      debts: false,
      posts: false
    },
    expiresInDays: null
  });
  const [shareUrl, setShareUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isExpired, setIsExpired] = useState(false);

  const API_BASE = 'http://localhost:5000';
  const token = localStorage.getItem('token');

  // Load current share settings
  useEffect(() => {
    if (isOpen && groupId) {
      fetchShareSettings();
    }
  }, [isOpen, groupId]);

  const fetchShareSettings = async () => {
    if (!groupId || !token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/groups/${groupId}/share`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setShareSettings({
          enabled: data.shareSettings?.enabled || false,
          allowedData: data.shareSettings?.allowedData || {
            transactions: true,
            members: false,
            statistics: true,
            charts: true,
            debts: false,
            posts: false
          },
          expiresInDays: data.shareSettings?.expiresAt ? 
            Math.ceil((new Date(data.shareSettings.expiresAt) - new Date()) / (1000 * 60 * 60 * 24)) : null
        });
        setShareUrl(data.shareUrl || '');
        setIsExpired(data.isExpired || false);
      }
    } catch (err) {
      console.error('Error fetching share settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!groupId || !token) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/groups/${groupId}/share`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          enabled: shareSettings.enabled,
          allowedData: shareSettings.allowedData,
          expiresInDays: shareSettings.expiresInDays
        })
      });

      const data = await res.json();
      if (res.ok) {
        setShareUrl(data.shareUrl || '');
        showNotification('Cập nhật cấu hình chia sẻ thành công!', 'success');
      } else {
        showNotification(data.message || 'Lỗi khi cập nhật cấu hình', 'error');
      }
    } catch (err) {
      console.error('Error saving share settings:', err);
      showNotification('Lỗi mạng khi lưu cấu hình', 'error');
    } finally {
      setSaving(false);
    }
  };

  const copyShareUrl = () => {
    if (shareUrl) {
      navigator.clipboard.writeText(shareUrl);
      showNotification('Đã copy link chia sẻ!', 'success');
    }
  };

  const updateAllowedData = (key, value) => {
    setShareSettings(prev => ({
      ...prev,
      allowedData: { ...prev.allowedData, [key]: value }
    }));
  };

  if (!isOpen) return null;

  return (
    <div className="gsm-overlay">
      <div className="gsm-modal">
        <div className="gsm-header">
          <h2>
            <i className="fas fa-share-alt"></i>
            Chia sẻ nhóm công khai
          </h2>
          <button className="gsm-close" onClick={onClose}>
            <i className="fas fa-times"></i>
          </button>
        </div>

        {loading ? (
          <div className="gsm-loading">
            <i className="fas fa-spinner fa-spin"></i>
            <span>Đang tải cấu hình...</span>
          </div>
        ) : (
          <div className="gsm-content">
            {/* Toggle chia sẻ */}
            <div className="gsm-section">
              <div className="gsm-toggle-section">
                <div className="gsm-toggle-info">
                  <h3>Bật chia sẻ công khai</h3>
                  <p>Cho phép người ngoài xem thông tin nhóm qua link chia sẻ</p>
                  {isExpired && (
                    <div className="gsm-warning">
                      <i className="fas fa-exclamation-triangle"></i>
                      Link chia sẻ đã hết hạn
                    </div>
                  )}
                </div>
                <label className="gsm-switch">
                  <input
                    type="checkbox"
                    checked={shareSettings.enabled}
                    onChange={(e) => setShareSettings(prev => ({ ...prev, enabled: e.target.checked }))}
                  />
                  <span className="gsm-slider"></span>
                </label>
              </div>
            </div>

            {shareSettings.enabled && (
              <>
                {/* Thời gian hết hạn */}
                <div className="gsm-section">
                  <h3>Thời gian hết hạn</h3>
                  <select
                    value={shareSettings.expiresInDays || ''}
                    onChange={(e) => setShareSettings(prev => ({ 
                      ...prev, 
                      expiresInDays: e.target.value ? parseInt(e.target.value) : null 
                    }))}
                    className="gsm-select"
                  >
                    <option value="">Không hết hạn</option>
                    <option value="1">1 ngày</option>
                    <option value="7">7 ngày</option>
                    <option value="30">30 ngày</option>
                    <option value="90">90 ngày</option>
                  </select>
                </div>

                {/* Cấu hình dữ liệu chia sẻ */}
                <div className="gsm-section">
                  <h3>Dữ liệu được chia sẻ</h3>
                  <div className="gsm-data-options">
                    <label className="gsm-checkbox-label">
                      <input
                        type="checkbox"
                        checked={shareSettings.allowedData.transactions}
                        onChange={(e) => updateAllowedData('transactions', e.target.checked)}
                      />
                      <span className="gsm-checkbox-text">
                        <i className="fas fa-exchange-alt"></i>
                        Danh sách giao dịch (tối đa 50 giao dịch gần nhất, gồm số tiền &amp; số người tham gia)
                      </span>
                    </label>

                    <label className="gsm-checkbox-label">
                      <input
                        type="checkbox"
                        checked={shareSettings.allowedData.statistics}
                        onChange={(e) => updateAllowedData('statistics', e.target.checked)}
                      />
                      <span className="gsm-checkbox-text">
                        <i className="fas fa-chart-bar"></i>
                        Thống kê tổng quan
                      </span>
                    </label>

                    <label className="gsm-checkbox-label">
                      <input
                        type="checkbox"
                        checked={shareSettings.allowedData.charts}
                        onChange={(e) => updateAllowedData('charts', e.target.checked)}
                      />
                      <span className="gsm-checkbox-text">
                        <i className="fas fa-chart-line"></i>
                        Biểu đồ và phân tích
                      </span>
                    </label>

                    <label className="gsm-checkbox-label">
                      <input
                        type="checkbox"
                        checked={shareSettings.allowedData.members}
                        onChange={(e) => updateAllowedData('members', e.target.checked)}
                      />
                      <span className="gsm-checkbox-text">
                        <i className="fas fa-users"></i>
                        Thống kê theo thành viên (ẩn bớt tên, không hiện email)
                      </span>
                    </label>

                    <label className="gsm-checkbox-label">
                      <input
                        type="checkbox"
                        checked={shareSettings.allowedData.debts}
                        onChange={(e) => updateAllowedData('debts', e.target.checked)}
                      />
                      <span className="gsm-checkbox-text">
                        <i className="fas fa-hand-holding-usd"></i>
                        Thông tin công nợ chi tiết (ai nợ ai, số tiền cụ thể)
                      </span>
                    </label>

                    <label className="gsm-checkbox-label">
                      <input
                        type="checkbox"
                        checked={shareSettings.allowedData.posts}
                        onChange={(e) => updateAllowedData('posts', e.target.checked)}
                      />
                      <span className="gsm-checkbox-text">
                        <i className="fas fa-comment-dots"></i>
                        Bài viết và hoạt động nhóm (tối đa 20 bài viết gần nhất)
                      </span>
                    </label>
                  </div>
                </div>

                {/* Link chia sẻ */}
                {shareUrl && (
                  <div className="gsm-section">
                    <h3>Link chia sẻ</h3>
                    <div className="gsm-url-container">
                      <input
                        type="text"
                        value={shareUrl}
                        readOnly
                        className="gsm-url-input"
                      />
                      <button className="gsm-copy-btn" onClick={copyShareUrl}>
                        <i className="fas fa-copy"></i>
                        Copy
                      </button>
                    </div>
                    <div className="gsm-url-actions">
                      <a 
                        href={shareUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="gsm-preview-link"
                      >
                        <i className="fas fa-external-link-alt"></i>
                        Xem trước
                      </a>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <div className="gsm-footer">
          <button className="gsm-cancel-btn" onClick={onClose}>
            Đóng
          </button>
          <button 
            className="gsm-save-btn" 
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <>
                <i className="fas fa-spinner fa-spin"></i>
                Đang lưu...
              </>
            ) : (
              <>
                <i className="fas fa-save"></i>
                Lưu cấu hình
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
