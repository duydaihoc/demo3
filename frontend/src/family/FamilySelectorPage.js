import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import './FamilySelectorPage.css';

export default function FamilySelectorPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [families, setFamilies] = useState({ owned: [], joined: [] });
  const [invitations, setInvitations] = useState([]); // THÊM: state cho lời mời
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false); // THÊM: state cho joining
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [familyName, setFamilyName] = useState('');
  const [familyDescription, setFamilyDescription] = useState('');
  const [familyColor, setFamilyColor] = useState('#10b981');

  const API_BASE = 'http://localhost:5000';
  const token = localStorage.getItem('token');

  // Lấy danh sách gia đình của user
  const fetchFamilies = useCallback(async () => {
    if (!token) {
      navigate('/login');
      return;
    }

    try {
      setLoading(true);
      
      // THÊM: Lấy lời mời song song với danh sách gia đình
      const [familiesRes, invitationsRes] = await Promise.all([
        fetch(`${API_BASE}/api/family/my-families`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${API_BASE}/api/family/invitations`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      if (familiesRes.status === 401 || invitationsRes.status === 401) {
        localStorage.removeItem('token');
        navigate('/login');
        return;
      }

      if (!familiesRes.ok) {
        throw new Error('Không thể tải danh sách gia đình');
      }

      const familiesData = await familiesRes.json();
      setFamilies(familiesData);

      // THÊM: Xử lý lời mời
      let invitationsData = []; // THÊM: Khai báo biến
      if (invitationsRes.ok) {
        invitationsData = await invitationsRes.json();
        setInvitations(invitationsData || []);
      }

      // Nếu không có gia đình và không có lời mời, chuyển đến trang tạo gia đình
      if (familiesData.total === 0 && (!invitationsData || invitationsData.length === 0)) {
        navigate('/family-switch');
        return;
      }

    } catch (err) {
      console.error('Error fetching families:', err);
      setError('Không thể tải danh sách gia đình');
    } finally {
      setLoading(false);
    }
  }, [token, navigate, API_BASE]);

  useEffect(() => {
    fetchFamilies();
  }, [fetchFamilies]);

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

      // Tạo gia đình thành công, đóng modal và refresh danh sách
      setShowCreateModal(false);
      await fetchFamilies(); // Refresh danh sách gia đình
      
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

  // Chọn gia đình để vào
  const handleSelectFamily = (family) => {
    // Lưu gia đình đã chọn vào localStorage
    localStorage.setItem('selectedFamilyId', family._id);
    // Chuyển đến trang gia đình
    navigate('/family');
  };

  // THÊM: Handler cho việc tham gia gia đình từ lời mời
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

      // Tham gia thành công, refresh danh sách
      await fetchFamilies();
      
    } catch (err) {
      console.error('Error joining family:', err);
      setError(err.message || 'Lỗi khi tham gia gia đình');
    } finally {
      setJoining(false);
    }
  };

  // THÊM: Handler cho việc từ chối lời mời
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
      <div className="family-selector-page">
        <div className="fs-loading">
          <div className="fs-loading-spinner"></div>
          <p>Đang tải danh sách gia đình...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="family-selector-page">
        <div className="fs-error">
          <i className="fas fa-exclamation-circle"></i>
          <p>{error}</p>
          <button onClick={() => window.location.reload()}>Thử lại</button>
        </div>
      </div>
    );
  }

  return (
    <div className="family-selector-page">
      <div className="fs-container">
        <div className="fs-header">
          <div className="fs-icon">
            <i className="fas fa-home"></i>
          </div>
          <h1>Chọn gia đình</h1>
          <p>Chọn gia đình bạn muốn quản lý</p>
        </div>

        <div className="fs-content">
          {/* THÊM: Lời mời tham gia gia đình */}
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

          {/* Gia đình đã tạo */}
          {families.owned.length > 0 && (
            <div className="fs-section">
              <h2><i className="fas fa-crown"></i> Gia đình đã tạo ({families.owned.length})</h2>
              <div className="fs-family-grid">
                {families.owned.map(family => (
                  <div key={family._id} className="fs-family-card owned">
                    <div className="fs-family-header">
                      <div 
                        className="fs-family-avatar"
                        style={{
                          background: family.color && family.color.colors ? 
                            `linear-gradient(135deg, ${family.color.colors.join(', ')})` : 
                            'linear-gradient(135deg, #10b981, #3b82f6)'
                        }}
                      >
                        {family.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="fs-family-badge owned">
                        <i className="fas fa-crown"></i> Chủ sở hữu
                      </div>
                    </div>
                    
                    <div className="fs-family-info">
                      <h3>{family.name}</h3>
                      {family.description && <p>{family.description}</p>}
                      <div className="fs-family-stats">
                        <span><i className="fas fa-users"></i> {family.members?.length || 0} thành viên</span>
                        <span><i className="fas fa-calendar"></i> {new Date(family.createdAt).toLocaleDateString('vi-VN')}</span>
                      </div>
                    </div>
                    
                    <div className="fs-family-actions">
                      <button 
                        className="fs-btn primary"
                        onClick={() => handleSelectFamily(family)}
                      >
                        <i className="fas fa-sign-in-alt"></i> Vào gia đình
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Gia đình đã tham gia */}
          {families.joined.length > 0 && (
            <div className="fs-section">
              <h2><i className="fas fa-user-friends"></i> Gia đình đã tham gia ({families.joined.length})</h2>
              <div className="fs-family-grid">
                {families.joined.map(family => (
                  <div key={family._id} className="fs-family-card joined">
                    <div className="fs-family-header">
                      <div 
                        className="fs-family-avatar"
                        style={{
                          background: family.color && family.color.colors ? 
                            `linear-gradient(135deg, ${family.color.colors.join(', ')})` : 
                            'linear-gradient(135deg, #3b82f6, #10b981)'
                        }}
                      >
                        {family.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="fs-family-badge joined">
                        <i className="fas fa-user"></i> Thành viên
                      </div>
                    </div>
                    
                    <div className="fs-family-info">
                      <h3>{family.name}</h3>
                      {family.description && <p>{family.description}</p>}
                      <div className="fs-family-stats">
                        <span><i className="fas fa-users"></i> {family.members?.length || 0} thành viên</span>
                        <span><i className="fas fa-user-shield"></i> Chủ: {family.owner?.name || 'N/A'}</span>
                      </div>
                    </div>
                    
                    <div className="fs-family-actions">
                      <button 
                        className="fs-btn primary"
                        onClick={() => handleSelectFamily(family)}
                      >
                        <i className="fas fa-sign-in-alt"></i> Vào gia đình
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tạo gia đình mới */}
          <div className="fs-section">
            <h2><i className="fas fa-plus-circle"></i> Tạo gia đình mới</h2>
            <div className="fs-create-new">
              <div className="fs-create-info">
                <h3><i className="fas fa-plus-circle"></i> Tạo gia đình mới</h3>
                <p>Bạn có thể tạo thêm gia đình mới để quản lý nhiều nhóm khác nhau.</p>
              </div>
              <button 
                className="fs-btn secondary"
                onClick={handleOpenCreateModal}
              >
                <i className="fas fa-plus"></i> Tạo gia đình mới
              </button>
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
