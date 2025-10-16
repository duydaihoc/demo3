import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import FamilySidebar from './FamilySidebar';
import './FamilySettings.css';
import { showNotification } from '../utils/notify';

export default function FamilySettings() {
  const navigate = useNavigate();
  const [familyData, setFamilyData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  
  // State for editing
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');
  
  // State for delete/leave confirmation
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  
  // State cho chức năng đặt vai trò
  const [editingRoleMemberId, setEditingRoleMemberId] = useState(null);
  const [familyRoleText, setFamilyRoleText] = useState('');
  const [savingRole, setSavingRole] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  
  // Thêm state cho sidebar toggle
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  
  const API_BASE = 'http://localhost:5000';
  const token = localStorage.getItem('token');
  const selectedFamilyId = localStorage.getItem('selectedFamilyId');

  // Lấy thông tin người dùng hiện tại từ token
  const getCurrentUser = useCallback(() => {
    if (!token) return null;
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return {
        id: payload.id || payload._id || payload.userId || '',
        name: payload.name || '',
        email: payload.email || ''
      };
    } catch (e) {
      return null;
    }
  }, [token]);
  
  // Lấy thông tin gia đình từ API
  useEffect(() => {
    const loadData = async () => {
      if (!token) {
        navigate('/login');
        return;
      }

      if (!selectedFamilyId) {
        navigate('/family-selector');
        return;
      }

      try {
        setLoading(true);
        setCurrentUser(getCurrentUser());
        
        const familyRes = await fetch(`${API_BASE}/api/family/${selectedFamilyId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (familyRes.status === 401) {
          localStorage.removeItem('token');
          navigate('/login');
          return;
        }

        if (!familyRes.ok) {
          throw new Error('Không thể tải thông tin gia đình');
        }

        const family = await familyRes.json();
        setFamilyData(family);
        setEditName(family.name || '');
        setEditDescription(family.description || '');
      } catch (err) {
        console.error("Error fetching family data:", err);
        if (err.message.includes('401') || err.message.includes('invalid')) {
          localStorage.removeItem('token');
          navigate('/login');
          return;
        }
        setError("Không thể tải dữ liệu gia đình");
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, [token, navigate, API_BASE, selectedFamilyId, getCurrentUser]);

  // Kiểm tra xem user có phải là owner không
  const isOwner = () => {
    if (!familyData || !currentUser) return false;
    
    const ownerId = familyData.owner && (familyData.owner._id || familyData.owner.id || familyData.owner);
    return String(ownerId) === String(currentUser.id);
  };

  // Lưu thay đổi tên gia đình (cho owner)
  const handleSaveName = async (e) => {
    e.preventDefault();
    if (!editName.trim()) {
      setEditError('Vui lòng nhập tên gia đình');
      return;
    }
    
    setSaving(true);
    setEditError('');
    
    try {
      const res = await fetch(`${API_BASE}/api/family/${selectedFamilyId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ 
          name: editName,
          description: editDescription 
        })
      });
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Không thể cập nhật tên gia đình');
      }
      
      const updatedFamily = await res.json();
      setFamilyData(updatedFamily);
      showNotification('Đã cập nhật thông tin gia đình thành công', 'success');
    } catch (err) {
      console.error("Error updating family name:", err);
      setEditError(err.message || 'Đã xảy ra lỗi khi cập nhật');
    } finally {
      setSaving(false);
    }
  };
  
  // Xóa gia đình (cho owner)
  const handleDeleteFamily = async () => {
    if (deleteConfirmText !== familyData.name) {
      showNotification('Vui lòng nhập đúng tên gia đình để xác nhận', 'error');
      return;
    }
    
    setDeleteLoading(true);
    
    try {
      const res = await fetch(`${API_BASE}/api/family/${selectedFamilyId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Không thể xóa gia đình');
      }
      
      showNotification('Đã xóa gia đình thành công', 'success');
      localStorage.removeItem('selectedFamilyId');
      navigate('/family-selector');
    } catch (err) {
      console.error("Error deleting family:", err);
      showNotification(err.message || 'Đã xảy ra lỗi khi xóa gia đình', 'error');
    } finally {
      setDeleteLoading(false);
      setShowDeleteModal(false);
    }
  };
  
  // Rời khỏi gia đình (cho member)
  const handleLeaveFamily = async () => {
    if (deleteConfirmText !== 'XÁC NHẬN') {
      showNotification('Vui lòng nhập "XÁC NHẬN" để tiếp tục', 'error');
      return;
    }
    
    setDeleteLoading(true);
    
    try {
      const res = await fetch(`${API_BASE}/api/family/${selectedFamilyId}/leave`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Không thể rời gia đình');
      }
      
      showNotification('Đã rời gia đình thành công', 'success');
      localStorage.removeItem('selectedFamilyId');
      navigate('/family-selector');
    } catch (err) {
      console.error("Error leaving family:", err);
      showNotification(err.message || 'Đã xảy ra lỗi khi rời gia đình', 'error');
    } finally {
      setDeleteLoading(false);
      setShowDeleteModal(false);
    }
  };

  // Hàm xử lý mở modal chỉnh sửa vai trò
  const handleOpenRoleModal = (member) => {
    const memberUserId = member.user && (member.user._id || member.user);
    setEditingRoleMemberId(memberUserId);
    setFamilyRoleText(member.familyRole || '');
    setShowRoleModal(true);
  };
  
  // Hàm lưu vai trò thành viên
  const handleSaveMemberRole = async () => {
    if (!editingRoleMemberId || !selectedFamilyId) return;
    
    setSavingRole(true);
    try {
      const endpoint = editingRoleMemberId === currentUser?.id
        ? `${API_BASE}/api/family/${selectedFamilyId}/my-role`
        : `${API_BASE}/api/family/${selectedFamilyId}/member/${editingRoleMemberId}/role`;
        
      const res = await fetch(endpoint, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ familyRole: familyRoleText })
      });
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Không thể cập nhật vai trò');
      }
      
      const updatedFamily = await res.json();
      setFamilyData(updatedFamily);
      showNotification('Đã cập nhật vai trò thành công', 'success');
      setShowRoleModal(false);
    } catch (err) {
      console.error("Error updating member role:", err);
      showNotification(err.message || 'Đã xảy ra lỗi khi cập nhật vai trò', 'error');
    } finally {
      setSavingRole(false);
    }
  };

  return (
    <div className="family-home">
      <FamilySidebar collapsed={sidebarCollapsed} />
      
      <main className={`fh-main ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        {/* Toggle sidebar button */}
        <button 
          className="sidebar-toggle-btn"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          title={sidebarCollapsed ? 'Mở sidebar' : 'Thu gọn sidebar'}
        >
          <i className={`fas ${sidebarCollapsed ? 'fa-bars' : 'fa-times'}`}></i>
        </button>
        
        {loading ? (
          <div className="fh-loading">
            <div className="fh-loading-spinner"></div>
            <p>Đang tải dữ liệu gia đình...</p>
          </div>
        ) : error ? (
          <div className="fh-error">
            <i className="fas fa-exclamation-triangle"></i>
            <p>{error}</p>
            <button onClick={() => window.location.reload()}>Thử lại</button>
          </div>
        ) : (
          <div className="fs-content">
            <header className="fs-header">
              <h1>Cài đặt gia đình</h1>
              <p>Quản lý cài đặt cho gia đình: {familyData?.name}</p>
            </header>
            
            <div className="fs-card-grid">
              {isOwner() ? (
                // Owner Settings
                <>
                  {/* Edit Family Name Card */}
                  <div className="fs-card">
                    <div className="fs-card-header">
                      <h2><i className="fas fa-edit"></i> Thay đổi thông tin gia đình</h2>
                    </div>
                    <div className="fs-card-body">
                      <form onSubmit={handleSaveName} className="fs-form">
                        <div className="fs-form-group">
                          <label htmlFor="familyName">Tên gia đình</label>
                          <input
                            type="text"
                            id="familyName"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            placeholder="Nhập tên gia đình mới"
                            required
                          />
                        </div>
                        
                        <div className="fs-form-group">
                          <label htmlFor="familyDescription">Mô tả (không bắt buộc)</label>
                          <textarea
                            id="familyDescription"
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            placeholder="Nhập mô tả về gia đình"
                            rows={3}
                          />
                        </div>
                        
                        {editError && <div className="fs-error-message">{editError}</div>}
                        
                        <div className="fs-form-actions">
                          <button 
                            type="submit" 
                            className="fs-btn primary"
                            disabled={saving}
                          >
                            {saving ? (
                              <>
                                <i className="fas fa-spinner fa-spin"></i> Đang lưu...
                              </>
                            ) : (
                              <>
                                <i className="fas fa-save"></i> Lưu thay đổi
                              </>
                            )}
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                  
                  {/* Delete Family Card */}
                  <div className="fs-card danger-zone">
                    <div className="fs-card-header danger">
                      <h2><i className="fas fa-exclamation-triangle"></i> Vùng nguy hiểm</h2>
                    </div>
                    <div className="fs-card-body">
                      <div className="fs-danger-action">
                        <h3>Xóa gia đình</h3>
                        <p>Hành động này không thể hoàn tác. Tất cả dữ liệu của gia đình sẽ bị xóa vĩnh viễn.</p>
                        <button 
                          className="fs-btn danger" 
                          onClick={() => setShowDeleteModal(true)}
                        >
                          <i className="fas fa-trash-alt"></i> Xóa gia đình vĩnh viễn
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                // Member Settings
                <div className="fs-card danger-zone">
                  <div className="fs-card-header danger">
                    <h2><i className="fas fa-sign-out-alt"></i> Rời gia đình</h2>
                  </div>
                  <div className="fs-card-body">
                    <div className="fs-danger-action">
                      <p>Khi rời gia đình, bạn sẽ mất quyền truy cập vào tất cả dữ liệu của gia đình này.</p>
                      <p>Bạn có thể được mời lại vào gia đình trong tương lai.</p>
                      <button 
                        className="fs-btn warning" 
                        onClick={() => setShowDeleteModal(true)}
                      >
                        <i className="fas fa-sign-out-alt"></i> Rời gia đình
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            {/* Family Members Card */}
            <div className="fs-card full-width">
              <div className="fs-card-header">
                <h2><i className="fas fa-users"></i> Thành viên gia đình</h2>
                {isOwner() && (
                  <div className="fs-header-note">
                    <i className="fas fa-info-circle"></i> 
                    Bạn có thể đặt vai trò cho các thành viên
                  </div>
                )}
              </div>
              <div className="fs-card-body">
                <div className="fs-member-list">
                  {familyData?.members.map((member, index) => {
                    const memberUserId = member.user && (member.user._id || member.user);
                    const isOwnerMember = familyData.owner && (
                      String(familyData.owner._id || familyData.owner.id || familyData.owner) === String(memberUserId)
                    );
                    const isCurrentUser = currentUser && (String(memberUserId) === String(currentUser.id));
                    
                    return (
                      <div key={index} className={`fs-member-item ${isCurrentUser ? 'current-user' : ''}`}>
                        <div className="fs-member-avatar">
                          {member.name ? member.name.charAt(0).toUpperCase() : 
                          member.email ? member.email.charAt(0).toUpperCase() : 'U'}
                        </div>
                        <div className="fs-member-info">
                          <div className="fs-member-name">
                            {member.name || member.email || 'Thành viên'}
                            {isOwnerMember && (
                              <span className="fs-badge owner">
                                <i className="fas fa-crown"></i> Chủ gia đình
                              </span>
                            )}
                            {isCurrentUser && !isOwnerMember && (
                              <span className="fs-badge current">
                                <i className="fas fa-user"></i> Bạn
                              </span>
                            )}
                          </div>
                          <div className="fs-member-email">{member.email}</div>
                          {/* Hiển thị vai trò gia đình nếu có */}
                          {member.familyRole && (
                            <div className="fs-family-role">
                              <i className="fas fa-user-tag"></i> {member.familyRole}
                            </div>
                          )}
                        </div>
                        <div className="fs-member-actions">
                          {/* Nút chỉnh sửa vai trò nếu là owner */}
                          {isOwner() && (
                            <button 
                              className="fs-btn sm primary"
                              onClick={() => handleOpenRoleModal(member)}
                              title="Đặt vai trò trong gia đình"
                            >
                              <i className="fas fa-user-tag"></i> {member.familyRole ? 'Sửa vai trò' : 'Đặt vai trò'}
                            </button>
                          )}
                          
                          {/* Nút xóa thành viên cho owner */}
                          {isOwner() && !isOwnerMember && !isCurrentUser && (
                            <button className="fs-btn sm danger">
                              <i className="fas fa-user-minus"></i> Xóa
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
      
      {/* Modal đặt vai trò */}
      {showRoleModal && (
        <div className="fs-modal-overlay">
          <div className="fs-modal">
            <div className="fs-modal-header">
              <h3>
                <i className="fas fa-user-tag"></i> Đặt vai trò trong gia đình
              </h3>
              <button className="fs-modal-close" onClick={() => setShowRoleModal(false)}>
                &times;
              </button>
            </div>
            <div className="fs-modal-body">
              <p>
                Vai trò giúp xác định vị trí của thành viên trong gia đình, 
                ví dụ như: Bố, Mẹ, Chị cả, Em út,...
              </p>
              
              <div className="fs-form-group">
                <label>Vai trò trong gia đình</label>
                <input
                  type="text"
                  value={familyRoleText}
                  onChange={(e) => setFamilyRoleText(e.target.value)}
                  placeholder="Ví dụ: Bố, Mẹ, Con trai cả,..."
                  maxLength={50}
                />
                <div className="fs-form-hint">Tối đa 50 ký tự</div>
              </div>
              
              <div className="fs-role-examples">
                <p>Một số gợi ý:</p>
                <div className="fs-role-examples-grid">
                  {['Bố', 'Mẹ', 'Con trai', 'Con gái', 'Anh trai', 'Chị gái', 'Em út', 'Ông', 'Bà', 'Cô', 'Chú'].map(role => (
                    <button 
                      key={role} 
                      className="fs-role-example-btn"
                      onClick={() => setFamilyRoleText(role)}
                    >
                      {role}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="fs-modal-footer">
              <button 
                className="fs-btn secondary" 
                onClick={() => setShowRoleModal(false)}
                disabled={savingRole}
              >
                Hủy
              </button>
              <button 
                className="fs-btn primary" 
                onClick={handleSaveMemberRole}
                disabled={savingRole}
              >
                {savingRole ? (
                  <><i className="fas fa-spinner fa-spin"></i> Đang lưu...</>
                ) : (
                  <><i className="fas fa-save"></i> Lưu vai trò</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Confirmation Modal */}
      {showDeleteModal && (
        <div className="fs-modal-overlay">
          <div className="fs-modal">
            <div className="fs-modal-header">
              <h3>
                {isOwner() ? 'Xác nhận xóa gia đình' : 'Xác nhận rời gia đình'}
              </h3>
              <button className="fs-modal-close" onClick={() => setShowDeleteModal(false)}>
                &times;
              </button>
            </div>
            <div className="fs-modal-body">
              {isOwner() ? (
                <>
                  <p>Bạn sắp xóa gia đình <strong>{familyData?.name}</strong>.</p>
                  <p className="fs-warning-text">
                    <i className="fas fa-exclamation-triangle"></i>
                    Hành động này không thể hoàn tác. Tất cả dữ liệu sẽ bị xóa vĩnh viễn.
                  </p>
                  <div className="fs-form-group">
                    <label>Nhập tên gia đình để xác nhận: <strong>{familyData?.name}</strong></label>
                    <input
                      type="text"
                      value={deleteConfirmText}
                      onChange={(e) => setDeleteConfirmText(e.target.value)}
                      placeholder={`Nhập "${familyData?.name}" để xác nhận`}
                    />
                  </div>
                </>
              ) : (
                <>
                  <p>Bạn sắp rời khỏi gia đình <strong>{familyData?.name}</strong>.</p>
                  <p>Bạn sẽ mất quyền truy cập vào tất cả dữ liệu của gia đình này.</p>
                  <div className="fs-form-group">
                    <label>Nhập "XÁC NHẬN" để tiếp tục</label>
                    <input
                      type="text"
                      value={deleteConfirmText}
                      onChange={(e) => setDeleteConfirmText(e.target.value)}
                      placeholder='Nhập "XÁC NHẬN"'
                    />
                  </div>
                </>
              )}
            </div>
            <div className="fs-modal-footer">
              <button 
                className="fs-btn secondary" 
                onClick={() => setShowDeleteModal(false)}
                disabled={deleteLoading}
              >
                Hủy
              </button>
              <button 
                className="fs-btn danger" 
                onClick={isOwner() ? handleDeleteFamily : handleLeaveFamily}
                disabled={deleteLoading}
              >
                {deleteLoading ? (
                  <><i className="fas fa-spinner fa-spin"></i> Đang xử lý...</>
                ) : isOwner() ? (
                  <><i className="fas fa-trash-alt"></i> Xóa vĩnh viễn</>
                ) : (
                  <><i className="fas fa-sign-out-alt"></i> Rời gia đình</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
