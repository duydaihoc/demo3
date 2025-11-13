import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import './FamilySwitchPage.css';

export default function FamilySwitchPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [invitations, setInvitations] = useState([]);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  // Thêm state cho modal tạo gia đình
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [familyName, setFamilyName] = useState('');
  const [familyDescription, setFamilyDescription] = useState('');
  const [familyColor, setFamilyColor] = useState('#10b981');

  const API_BASE = 'http://localhost:5000';
  const token = localStorage.getItem('token');

  // Kiểm tra trạng thái gia đình của user
  const checkFamilyStatus = useCallback(async () => {
    if (!token) {
      setError('Chưa đăng nhập');
      setLoading(false);
      return;
    }

    try {
      // Khai báo biến invites trước để có thể dùng trong toàn bộ try block
      let invites = [];
      
      // THAY ĐỔI: Luôn kiểm tra lời mời trước, không quan tâm đã có gia đình hay chưa
      const inviteRes = await fetch(`${API_BASE}/api/family/invitations`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (inviteRes.ok) {
        invites = await inviteRes.json();
        setInvitations(invites || []);
      } else if (inviteRes.status === 401) {
        localStorage.removeItem('token');
        navigate('/login');
        return;
      }

      // Kiểm tra gia đình hiện tại - KHÔNG tự động chuyển hướng nữa
      const familyRes = await fetch(`${API_BASE}/api/family/my-family`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      // Nếu không có lời mời và đã có gia đình, mới chuyển hướng
      if (familyRes.ok && (!invites || invites.length === 0)) {
        navigate('/family');
        return;
      }

    } catch (err) {
      console.error('Error checking family status:', err);
      if (err.message.includes('401') || err.message.includes('invalid')) {
        localStorage.removeItem('token');
        navigate('/login');
        return;
      }
      setError('Không thể kiểm tra trạng thái gia đình');
    } finally {
      setLoading(false);
    }
  }, [token, navigate, API_BASE]);

  useEffect(() => {
    checkFamilyStatus();
  }, [checkFamilyStatus]);

  // Mở modal tạo gia đình
  const handleOpenCreateModal = () => {
    setShowCreateModal(true);
    setFamilyName('');
    setFamilyDescription('');
    setFamilyColor('#10b981');
    setError('');
  };

  // Đóng modal tạo gia đình
  const handleCloseCreateModal = () => {
    setShowCreateModal(false);
    setFamilyName('');
    setFamilyDescription('');
    setFamilyColor('#10b981');
    setError('');
  };

  // Tạo gia đình mới với thông tin chi tiết
  const handleCreateFamily = async () => {
    if (!familyName.trim()) {
      setError('Vui lòng nhập tên gia đình');
      return;
    }

    if (!token) {
      setError('Chưa đăng nhập');
      localStorage.removeItem('token');
      navigate('/login');
      return;
    }

    setCreating(true);
    setError('');

    try {
      const res = await fetch(`${API_BASE}/api/family/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: familyName.trim(),
          description: familyDescription.trim(),
          color: familyColor
        })
      });

      if (res.status === 401) {
        // Token không hợp lệ
        localStorage.removeItem('token');
        navigate('/login');
        return;
      }

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || 'Không thể tạo gia đình');
      }

      // Tạo gia đình thành công, chuyển đến trang gia đình
      setShowCreateModal(false);
      navigate('/family');
      
    } catch (err) {
      console.error('Error creating family:', err);
      if (err.message.includes('401') || err.message.includes('invalid')) {
        localStorage.removeItem('token');
        navigate('/login');
        return;
      }
      setError(err.message || 'Lỗi khi tạo gia đình');
    } finally {
      setCreating(false);
    }
  };

  // Tham gia gia đình từ lời mời
  const handleJoinFamily = async (invitationId) => {
    if (!token) {
      localStorage.removeItem('token');
      navigate('/login');
      return;
    }

    setJoining(true);
    setError('');

    try {
      const res = await fetch(`${API_BASE}/api/family/join/${invitationId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.status === 401) {
        localStorage.removeItem('token');
        navigate('/login');
        return;
      }

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || 'Không thể tham gia gia đình');
      }

      // Tham gia gia đình thành công, chuyển đến trang gia đình
      navigate('/family');
      
    } catch (err) {
      console.error('Error joining family:', err);
      if (err.message.includes('401') || err.message.includes('invalid')) {
        localStorage.removeItem('token');
        navigate('/login');
        return;
      }
      setError(err.message || 'Lỗi khi tham gia gia đình');
    } finally {
      setJoining(false);
    }
  };

  // Từ chối lời mời
  const handleDeclineInvitation = async (invitationId) => {
    try {
      const res = await fetch(`${API_BASE}/api/family/invitations/${invitationId}/decline`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.status === 401) {
        localStorage.removeItem('token');
        navigate('/login');
        return;
      }
      
      // Cập nhật danh sách lời mời
      setInvitations(prev => prev.filter(inv => inv._id !== invitationId));
      
    } catch (err) {
      console.error('Error declining invitation:', err);
    }
  };

  if (loading) {
    return (
      <div className="family-switch-page">
        <div className="fs-loading">
          <div className="fs-loading-spinner"></div>
          <p>Đang kiểm tra trạng thái gia đình...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="family-switch-page">
      <div className="fs-container">
        <div className="fs-header">
          <div className="fs-icon">
            <i className="fas fa-home"></i>
          </div>
          <h1>Chào mừng đến với Quản lý Gia đình</h1>
          <p>Quản lý tài chính và cuộc sống gia đình một cách thông minh</p>
        </div>

        <div className="fs-content">
          {error && (
            <div className="fs-error">
              <i className="fas fa-exclamation-circle"></i>
              <p>{error}</p>
            </div>
          )}

          {/* Lời mời tham gia gia đình */}
          {invitations.length > 0 && (
            <div className="fs-section">
              <h2><i className="fas fa-envelope"></i> Lời mời tham gia gia đình ({invitations.length})</h2>
              <div className="fs-invitations">
                {invitations.map(invitation => (
                  <div key={invitation._id} className="fs-invitation-card">
                    <div className="fs-invitation-info">
                      <div className="fs-invitation-name">
                        {invitation.family?.name || 'Gia đình'}
                      </div>
                      <div className="fs-invitation-sender">
                        Mời bởi: {invitation.invitedBy?.name || invitation.invitedBy?.email || 'Người dùng'}
                      </div>
                      <div className="fs-invitation-date">
                        {new Date(invitation.createdAt).toLocaleDateString('vi-VN')}
                      </div>
                    </div>
                    <div className="fs-invitation-actions">
                      <button 
                        className="fs-btn primary"
                        onClick={() => handleJoinFamily(invitation._id)}
                        disabled={joining}
                      >
                        {joining ? 'Đang tham gia...' : 'Tham gia'}
                      </button>
                      <button 
                        className="fs-btn secondary"
                        onClick={() => handleDeclineInvitation(invitation._id)}
                      >
                        Từ chối
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tùy chọn tạo gia đình mới */}
          <div className="fs-section">
            <h2><i className="fas fa-plus-circle"></i> Tạo gia đình mới</h2>
            <div className="fs-create-card">
              <div className="fs-create-info">
                <h3>Bắt đầu quản lý gia đình</h3>
                <p>Tạo gia đình của bạn để bắt đầu quản lý tài chính, công việc và cuộc sống gia đình một cách hiệu quả.</p>
                <ul className="fs-features">
                  <li><i className="fas fa-check"></i> Quản lý chi tiêu gia đình</li>
                  <li><i className="fas fa-check"></i> Theo dõi công nợ thành viên</li>
                  <li><i className="fas fa-check"></i> Lên kế hoạch mua sắm</li>
                  <li><i className="fas fa-check"></i> Quản lý công việc gia đình</li>
                </ul>
              </div>
              <div className="fs-create-actions">
                <button 
                  className="fs-btn primary large"
                  onClick={handleOpenCreateModal}
                >
                  <i className="fas fa-home"></i> Tạo gia đình
                </button>
              </div>
            </div>
          </div>

          {/* Quay lại */}
          <div className="fs-footer">
            <button 
              className="fs-btn secondary"
              onClick={() => navigate('/group')}
            >
              <i className="fas fa-arrow-left"></i> Quay lại Nhóm
            </button>
          </div>
        </div>
      </div>

      {/* Modal tạo gia đình */}
      {showCreateModal && (
        <div className="fs-modal-overlay">
          <div className="fs-create-modal">
            <div className="fs-modal-header">
              <h3><i className="fas fa-home"></i> Tạo gia đình mới</h3>
              <button className="fs-modal-close" onClick={handleCloseCreateModal}>×</button>
            </div>
            
            <div className="fs-modal-body">
              {error && (
                <div className="fs-error">
                  <i className="fas fa-exclamation-circle"></i>
                  <p>{error}</p>
                </div>
              )}
              
              <div className="fs-form-group">
                <label htmlFor="family-name">Tên gia đình *</label>
                <input
                  type="text"
                  id="family-name"
                  value={familyName}
                  onChange={(e) => setFamilyName(e.target.value)}
                  placeholder="Ví dụ: Gia đình Nguyễn"
                  required
                />
              </div>
              
              <div className="fs-form-group">
                <label htmlFor="family-description">Mô tả (tùy chọn)</label>
                <textarea
                  id="family-description"
                  value={familyDescription}
                  onChange={(e) => setFamilyDescription(e.target.value)}
                  placeholder="Mô tả về gia đình của bạn..."
                  rows={3}
                />
              </div>
              
              <div className="fs-form-group">
                <label>Màu sắc gia đình</label>
                <div className="fs-color-picker">
                  {['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#84cc16', '#f97316'].map(color => (
                    <button
                      key={color}
                      type="button"
                      className={`fs-color-option ${familyColor === color ? 'selected' : ''}`}
                      style={{ backgroundColor: color }}
                      onClick={() => setFamilyColor(color)}
                    />
                  ))}
                </div>
              </div>
              
              {/* Preview gia đình */}
              <div className="fs-family-preview">
                <div 
                  className="fs-preview-avatar"
                  style={{ backgroundColor: familyColor }}
                >
                  {familyName.charAt(0).toUpperCase() || 'G'}
                </div>
                <div className="fs-preview-info">
                  <div className="fs-preview-name">{familyName || 'Tên gia đình'}</div>
                  <div className="fs-preview-desc">{familyDescription || 'Mô tả gia đình'}</div>
                </div>
              </div>
            </div>
            
            <div className="fs-modal-footer">
              <button 
                className="fs-btn secondary" 
                onClick={handleCloseCreateModal}
                disabled={creating}
              >
                Hủy
              </button>
              <button 
                className="fs-btn primary" 
                onClick={handleCreateFamily}
                disabled={creating || !familyName.trim()}
              >
                {creating ? (
                  <>
                    <i className="fas fa-spinner fa-spin"></i> Đang tạo...
                  </>
                ) : (
                  <>
                    <i className="fas fa-home"></i> Tạo gia đình
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
