import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import FamilySidebar from './FamilySidebar';
import './FamilyMembersPage.css';

export default function FamilyMembersPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [family, setFamily] = useState(null);
  const [members, setMembers] = useState([]);
  const [friends, setFriends] = useState([]);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteTab, setInviteTab] = useState('friends'); // 'friends' or 'email'
  const [selectedFriends, setSelectedFriends] = useState([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  // Thêm state cho kiểm tra email
  const [emailExists, setEmailExists] = useState(null); // null: chưa kiểm tra, true: tồn tại, false: không tồn tại
  const [checkingEmail, setCheckingEmail] = useState(false);
  // Thêm state cho lời mời
  const [invitations, setInvitations] = useState([]);
  const [loadingInvitations, setLoadingInvitations] = useState(false);
  const [cancellingInvitationId, setCancellingInvitationId] = useState(null);
  // Thêm state cho người dùng hiện tại
  const [currentUser, setCurrentUser] = useState(null);
  // State cho modal xóa thành viên
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [memberToDelete, setMemberToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

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

  // Lấy thông tin gia đình và thành viên
  const fetchFamilyData = useCallback(async () => {
    if (!token || !selectedFamilyId) {
      navigate('/family-selector');
      return;
    }

    try {
      setLoading(true);
      
      // Lấy thông tin gia đình
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

      const familyData = await familyRes.json();
      setFamily(familyData);
      setMembers(familyData.members || []);

      // Kiểm tra xem user hiện tại có còn là thành viên không
      const isCurrentUserMember = familyData.members?.some(member => {
        const memberUserId = member.user && (member.user._id || member.user);
        return memberUserId && String(memberUserId) === String(getCurrentUser()?.id);
      });

      if (!isCurrentUserMember) {
        // Người dùng không còn là thành viên
        setError('Bạn đã bị xóa khỏi gia đình này. Vui lòng liên hệ chủ gia đình để được thêm lại.');
        setFamily(null);
        setMembers([]);
        return;
      }

    } catch (err) {
      console.error('Error fetching family data:', err);
      setError('Không thể tải dữ liệu gia đình');
    } finally {
      setLoading(false);
    }
  }, [token, selectedFamilyId, navigate, API_BASE, getCurrentUser]);

  // Lấy danh sách bạn bè
  const fetchFriends = useCallback(async () => {
    if (!token) return;

    try {
      const res = await fetch(`${API_BASE}/api/friends/list`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.ok) {
        const friendsData = await res.json();
        const friendsList = Array.isArray(friendsData) ? friendsData : (friendsData.data || []);
        
        // Lọc bạn bè chưa là thành viên gia đình
        const existingMemberEmails = new Set(members.map(m => (m.email || '').toLowerCase().trim()));
        const nonMemberFriends = friendsList.filter(friend => 
          !existingMemberEmails.has((friend.email || '').toLowerCase().trim())
        );
        
        setFriends(nonMemberFriends);
      }
    } catch (err) {
      console.error('Error fetching friends:', err);
    }
  }, [token, members, API_BASE]);

  // Lấy danh sách lời mời
  const fetchInvitations = useCallback(async () => {
    if (!token || !selectedFamilyId) return;

    setLoadingInvitations(true);
    try {
      const res = await fetch(`${API_BASE}/api/family/${selectedFamilyId}/invitations`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.ok) {
        const invitationsData = await res.json();
        setInvitations(invitationsData);
      }
    } catch (err) {
      console.error('Error fetching invitations:', err);
    } finally {
      setLoadingInvitations(false);
    }
  }, [token, selectedFamilyId, API_BASE]);

  // Lấy thông tin owner
  const getOwnerInfo = useCallback(() => {
    if (!family || !family.owner) return null;
    return family.owner;
  }, [family]);

  // Kiểm tra xem user hiện tại có phải là owner không
  const isOwner = useCallback(() => {
    if (!currentUser || !family) return false;
    const owner = getOwnerInfo();
    if (!owner) return false;
    
    const ownerId = owner._id || owner.id || owner;
    return String(ownerId) === String(currentUser.id);
  }, [currentUser, family, getOwnerInfo]);

  // Kiểm tra xem một member có phải là người dùng hiện tại không
  const isCurrentUser = useCallback((member) => {
    if (!currentUser || !member) return false;
    const memberUserId = member.user && (member.user._id || member.user);
    return String(memberUserId) === String(currentUser.id);
  }, [currentUser]);

  // Refresh invitations định kỳ để cập nhật trạng thái
  useEffect(() => {
    if (!isOwner()) return;

    const interval = setInterval(() => {
      fetchInvitations();
    }, 30000); // Refresh mỗi 30 giây

    return () => clearInterval(interval);
  }, [isOwner, fetchInvitations]);

  useEffect(() => {
    setCurrentUser(getCurrentUser());
    fetchFamilyData();
  }, [fetchFamilyData, getCurrentUser]);

  useEffect(() => {
    if (members.length > 0) {
      fetchFriends();
      fetchInvitations();
    }
  }, [members, fetchFriends, fetchInvitations]);

  // Kiểm tra email có tồn tại trong hệ thống không
  const checkEmailExists = useCallback(async (email) => {
    if (!email || !email.trim()) {
      setEmailExists(null);
      return;
    }

    setCheckingEmail(true);
    try {
      const res = await fetch(`${API_BASE}/api/groups/search-users?email=${encodeURIComponent(email.trim())}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });

      if (!res.ok) {
        setEmailExists(false);
        return;
      }

      const users = await res.json().catch(() => []);
      const exists = Array.isArray(users) && users.length > 0;
      setEmailExists(exists);
    } catch (err) {
      console.error('Error checking email:', err);
      setEmailExists(false);
    } finally {
      setCheckingEmail(false);
    }
  }, [token, API_BASE]);

  // Debounce kiểm tra email khi user nhập
  useEffect(() => {
    if (inviteTab !== 'email' || !inviteEmail.trim()) {
      setEmailExists(null);
      setCheckingEmail(false);
      return;
    }

    const timeoutId = setTimeout(() => {
      checkEmailExists(inviteEmail);
    }, 500); // Đợi 500ms sau khi user ngừng nhập

    return () => clearTimeout(timeoutId);
  }, [inviteEmail, inviteTab, checkEmailExists]);

  // Mời thành viên qua email
  const handleInviteByEmail = async () => {
    if (!inviteEmail.trim()) {
      setError('Vui lòng nhập email');
      return;
    }

    if (emailExists !== true) {
      setError('Email không tồn tại trong hệ thống');
      return;
    }

    if (!token || !selectedFamilyId) return;

    setInviting(true);
    setError('');
    setSuccessMessage('');

    try {
      const res = await fetch(`${API_BASE}/api/family/${selectedFamilyId}/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ email: inviteEmail.trim() })
      });

      if (res.status === 401) {
        localStorage.removeItem('token');
        navigate('/login');
        return;
      }

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || 'Không thể gửi lời mời');
      }

      // Thành công
      setInviteEmail('');
      setShowInviteModal(false);
      setEmailExists(null); // Reset trạng thái
      setSuccessMessage('Lời mời đã được gửi thành công!');
      fetchFamilyData(); // Refresh danh sách thành viên
      
      // Tự động ẩn thông báo sau 5 giây
      setTimeout(() => setSuccessMessage(''), 5000);
      
    } catch (err) {
      console.error('Error inviting by email:', err);
      setError(err.message || 'Lỗi khi gửi lời mời');
    } finally {
      setInviting(false);
    }
  };

  // Mời nhiều bạn bè
  const handleInviteFriends = async () => {
    if (selectedFriends.length === 0) {
      setError('Vui lòng chọn ít nhất một bạn bè');
      return;
    }

    if (!token || !selectedFamilyId) return;

    setInviting(true);
    setError('');
    setSuccessMessage('');

    try {
      const results = [];
      
      for (const friend of selectedFriends) {
        try {
          const res = await fetch(`${API_BASE}/api/family/${selectedFamilyId}/invite`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ email: friend.email })
          });
          
          results.push({ email: friend.email, success: res.ok });
        } catch (err) {
          results.push({ email: friend.email, success: false });
        }
      }

      const successCount = results.filter(r => r.success).length;
      
      if (successCount > 0) {
        setSelectedFriends([]);
        setShowInviteModal(false);
        setSuccessMessage(`Đã gửi lời mời thành công đến ${successCount}/${results.length} người!`);
        fetchFamilyData(); // Refresh danh sách thành viên
        
        // Tự động ẩn thông báo sau 5 giây
        setTimeout(() => setSuccessMessage(''), 5000);
      } else {
        setError('Không thể gửi lời mời đến bất kỳ bạn bè nào');
      }
      
    } catch (err) {
      console.error('Error inviting friends:', err);
      setError('Lỗi khi gửi lời mời');
    } finally {
      setInviting(false);
    }
  };

  // Mở modal xóa thành viên
  const openDeleteModal = (member) => {
    if (!member) {
      console.error('Member is null or undefined');
      return;
    }
    console.log('Opening delete modal for member:', member);
    setMemberToDelete(member);
    setShowDeleteModal(true);
  };

  // Đóng modal xóa thành viên
  const closeDeleteModal = () => {
    setShowDeleteModal(false);
    setMemberToDelete(null);
  };

  // Xóa thành viên
  const handleRemoveMember = async () => {
    if (!memberToDelete) return;
    
    const memberId = memberToDelete.user && (memberToDelete.user._id || memberToDelete.user);
    if (!token || !selectedFamilyId || !memberId) return;

    setDeleting(true);

    try {
      const res = await fetch(`${API_BASE}/api/family/${selectedFamilyId}/remove-member`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ memberId })
      });

      if (res.status === 401) {
        localStorage.removeItem('token');
        navigate('/login');
        return;
      }

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        setError(err?.message || 'Không thể xóa thành viên');
        setTimeout(() => setError(''), 5000);
        return;
      }

      // Thành công
      setSuccessMessage('Đã xóa thành viên thành công');
      setTimeout(() => setSuccessMessage(''), 5000);
      closeDeleteModal();
      fetchFamilyData(); // Refresh danh sách thành viên
      
    } catch (err) {
      console.error('Error removing member:', err);
      setError('Lỗi khi xóa thành viên');
      setTimeout(() => setError(''), 5000);
    } finally {
      setDeleting(false);
    }
  };

  // Hủy lời mời
  const handleCancelInvitation = async (invitationId) => {
    if (!token || !selectedFamilyId || !invitationId) return;

    setCancellingInvitationId(invitationId);

    try {
      const res = await fetch(`${API_BASE}/api/family/${selectedFamilyId}/invitations/${invitationId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.status === 401) {
        localStorage.removeItem('token');
        navigate('/login');
        return;
      }

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        alert(err?.message || 'Không thể hủy lời mời');
        return;
      }

      // Thành công
      fetchInvitations(); // Refresh danh sách lời mời
      
    } catch (err) {
      console.error('Error cancelling invitation:', err);
      alert('Lỗi khi hủy lời mời');
    } finally {
      setCancellingInvitationId(null);
    }
  };

  // Toggle chọn bạn bè
  const toggleFriendSelection = (friend) => {
    setSelectedFriends(prev => {
      const isSelected = prev.some(f => f.email === friend.email);
      if (isSelected) {
        return prev.filter(f => f.email !== friend.email);
      } else {
        return [...prev, friend];
      }
    });
  };

  if (loading) {
    return (
      <div className="family-members-page">
        <FamilySidebar />
        <main className="fm-main">
          <div className="fm-loading">
            <div className="fm-loading-spinner"></div>
            <p>Đang tải thông tin thành viên...</p>
          </div>
        </main>
      </div>
    );
  }

  if (error && !family) {
    return (
      <div className="family-members-page">
        <FamilySidebar />
        <main className="fm-main">
          <div className="fm-error">
            <i className="fas fa-exclamation-triangle"></i>
            <p>{error}</p>
            <button onClick={() => navigate('/family-selector')}>Quay lại danh sách gia đình</button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="family-members-page">
      <FamilySidebar />
      
      <main className="fm-main">
        <div className="fm-header">
          <div className="fm-title-section">
            <h1><i className="fas fa-users"></i> Thành viên gia đình</h1>
            <p>Quản lý thành viên trong gia đình {family?.name || ''}</p>
          </div>
          
          <div className="fm-actions">
            <button 
              className="fm-btn primary"
              onClick={() => setShowInviteModal(true)}
            >
              <i className="fas fa-user-plus"></i> Mời thành viên
            </button>
          </div>
        </div>

        <div className="fm-content">
          {error && (
            <div className="fm-error-message">
              <i className="fas fa-exclamation-circle"></i>
              <p>{error}</p>
            </div>
          )}
          
          {successMessage && (
            <div className="fm-success-message">
              <i className="fas fa-check-circle"></i>
              <p>{successMessage}</p>
            </div>
          )}

          {/* Danh sách thành viên */}
          <div className="fm-members-section">
            <h2>Danh sách thành viên ({members.length})</h2>
            
            {members.length === 0 ? (
              <div className="fm-empty-state">
                <i className="fas fa-users-slash"></i>
                <p>Chưa có thành viên nào trong gia đình</p>
              </div>
            ) : (
              <div className="fm-members-grid">
                {members.map(member => {
                  const memberUserId = member.user && (member.user._id || member.user);
                  const isMemberOwner = memberUserId && getOwnerInfo() && 
                    (memberUserId === getOwnerInfo()._id || memberUserId === getOwnerInfo().id);
                  const isUserCurrent = isCurrentUser(member);
                  
                  return (
                    <div key={memberUserId || member.email} className="fm-member-card">
                      <div className="fm-member-avatar">
                        {member.name ? member.name.charAt(0).toUpperCase() : 
                         member.email ? member.email.charAt(0).toUpperCase() : 'U'}
                      </div>
                      
                      <div className="fm-member-info">
                        <div className="fm-member-name">
                          {member.name || member.email || 'Thành viên'}
                          {isMemberOwner && (
                            <span className="fm-owner-badge">
                              <i className="fas fa-crown"></i> Chủ gia đình
                            </span>
                          )}
                          {isUserCurrent && !isMemberOwner && (
                            <span className="fm-current-user-badge">
                              <i className="fas fa-user"></i> Bạn
                            </span>
                          )}
                        </div>
                        <div className="fm-member-email">
                          {member.email && <i className="fas fa-envelope"></i>} {member.email}
                        </div>
                        <div className="fm-member-role">
                          {member.role === 'owner' ? 'Quản trị viên' : 'Thành viên'}
                        </div>
                      </div>
                      
                      {/* Chỉ owner mới có thể xóa thành viên khác (không phải chính mình) */}
                      {isOwner() && !isMemberOwner && !isUserCurrent && (
                        <div className="fm-member-actions">
                          <button
                            className="fm-btn danger sm"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              console.log('Delete button clicked for member:', member);
                              openDeleteModal(member);
                            }}
                            type="button"
                          >
                            <i className="fas fa-user-minus"></i> Xóa
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Danh sách lời mời - tất cả member đều thấy lời mời của họ */}
          <div className="fm-invitations-section">
            <h2>Lời mời của bạn ({invitations.filter(inv => inv.invitedBy && String(inv.invitedBy._id || inv.invitedBy) === String(currentUser?.id)).filter(inv => inv.status === 'pending').length})</h2>
            
            {loadingInvitations ? (
              <div className="fm-loading-invitations">
                <i className="fas fa-spinner fa-spin"></i>
                <p>Đang tải lời mời...</p>
              </div>
            ) : invitations.filter(inv => inv.invitedBy && String(inv.invitedBy._id || inv.invitedBy) === String(currentUser?.id)).filter(inv => inv.status === 'pending').length === 0 ? (
              <div className="fm-empty-state">
                <i className="fas fa-envelope-open"></i>
                <p>Bạn chưa mời ai tham gia gia đình</p>
              </div>
            ) : (
              <div className="fm-invitations-grid">
                {invitations.filter(inv => inv.invitedBy && String(inv.invitedBy._id || inv.invitedBy) === String(currentUser?.id)).filter(inv => inv.status === 'pending').map(invitation => {
                  const isExpired = invitation.expiresAt && new Date(invitation.expiresAt) < new Date();

                  return (
                    <div key={invitation._id} className="fm-invitation-card">
                      <div className="fm-invitation-avatar">
                        {invitation.email ? invitation.email.charAt(0).toUpperCase() : 'U'}
                      </div>
                      
                      <div className="fm-invitation-info">
                        <div className="fm-invitation-email">
                          <i className="fas fa-envelope"></i> {invitation.email}
                        </div>
                        <div className="fm-invitation-meta">
                          <span className="fm-invitation-date">
                            <i className="fas fa-calendar"></i> {new Date(invitation.createdAt).toLocaleDateString('vi-VN')}
                          </span>
                        </div>
                        <div className="fm-invitation-status pending">
                          <i className="fas fa-clock"></i>
                          Đang chờ
                          {isExpired && (
                            <span className="fm-expired-note">(Đã hết hạn)</span>
                          )}
                        </div>
                      </div>
                      
                      <div className="fm-invitation-actions">
                        <button
                          className="fm-btn danger sm"
                          onClick={() => handleCancelInvitation(invitation._id)}
                          disabled={cancellingInvitationId === invitation._id}
                        >
                          {cancellingInvitationId === invitation._id ? (
                            <><i className="fas fa-spinner fa-spin"></i> Đang hủy</>
                          ) : (
                            <><i className="fas fa-times"></i> Hủy lời mời</>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            
            {invitations.filter(inv => inv.invitedBy && String(inv.invitedBy._id || inv.invitedBy) === String(currentUser?.id)).filter(inv => inv.status !== 'pending').length > 0 && (
              <div className="fm-processed-invitations">
                <details>
                  <summary>
                    <i className="fas fa-history"></i> 
                    Lời mời đã xử lý ({invitations.filter(inv => inv.invitedBy && String(inv.invitedBy._id || inv.invitedBy) === String(currentUser?.id)).filter(inv => inv.status !== 'pending').length})
                  </summary>
                  <div className="fm-processed-list">
                    {invitations.filter(inv => inv.invitedBy && String(inv.invitedBy._id || inv.invitedBy) === String(currentUser?.id)).filter(inv => inv.status !== 'pending').map(invitation => {
                      const statusText = {
                        accepted: 'Đã chấp nhận',
                        declined: 'Đã từ chối',
                        expired: 'Đã hết hạn'
                      }[invitation.status] || invitation.status;

                      const statusClass = {
                        accepted: 'accepted',
                        declined: 'declined',
                        expired: 'expired'
                      }[invitation.status] || '';

                      return (
                        <div key={invitation._id} className="fm-processed-invitation">
                          <div className="fm-processed-info">
                            <span className="fm-processed-email">{invitation.email}</span>
                            <span className={`fm-processed-status ${statusClass}`}>
                              <i className={`fas ${
                                invitation.status === 'accepted' ? 'fa-check-circle' :
                                invitation.status === 'declined' ? 'fa-times-circle' :
                                'fa-exclamation-triangle'
                              }`}></i>
                              {statusText}
                            </span>
                          </div>
                          <div className="fm-processed-date">
                            {new Date(invitation.updatedAt || invitation.createdAt).toLocaleDateString('vi-VN')}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </details>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Modal mời thành viên - tất cả member đều thấy */}
      {showInviteModal && (
        <div className="fm-modal-overlay">
          <div className="fm-invite-modal">
            <div className="fm-modal-header">
              <h3><i className="fas fa-user-plus"></i> Mời thành viên mới</h3>
              <button className="fm-modal-close" onClick={() => setShowInviteModal(false)}>×</button>
            </div>
            
            <div className="fm-modal-body">
              {/* Tabs */}
              <div className="fm-invite-tabs">
                <button 
                  className={`fm-tab-btn ${inviteTab === 'friends' ? 'active' : ''}`}
                  onClick={() => setInviteTab('friends')}
                >
                  <i className="fas fa-user-friends"></i> Mời bạn bè
                </button>
                <button 
                  className={`fm-tab-btn ${inviteTab === 'email' ? 'active' : ''}`}
                  onClick={() => setInviteTab('email')}
                >
                  <i className="fas fa-envelope"></i> Mời qua email
                </button>
              </div>

              {/* Tab content */}
              {inviteTab === 'friends' && (
                <div className="fm-friends-tab">
                  <h4>Chọn bạn bè để mời</h4>
                  
                  {friends.length === 0 ? (
                    <div className="fm-empty-friends">
                      <i className="fas fa-user-friends"></i>
                      <p>Tất cả bạn bè của bạn đã là thành viên hoặc bạn chưa có bạn bè nào</p>
                    </div>
                  ) : (
                    <>
                      <div className="fm-friends-list">
                        {friends.map(friend => {
                          const isSelected = selectedFriends.some(f => f.email === friend.email);
                          
                          return (
                            <div 
                              key={friend.id || friend.email} 
                              className={`fm-friend-item ${isSelected ? 'selected' : ''}`}
                              onClick={() => toggleFriendSelection(friend)}
                            >
                              <div className="fm-friend-avatar">
                                {friend.name ? friend.name.charAt(0).toUpperCase() : 
                                 friend.email ? friend.email.charAt(0).toUpperCase() : 'U'}
                              </div>
                              
                              <div className="fm-friend-info">
                                <div className="fm-friend-name">{friend.name || 'Người dùng'}</div>
                                <div className="fm-friend-email">{friend.email}</div>
                              </div>
                              
                              <div className="fm-friend-checkbox">
                                <input 
                                  type="checkbox" 
                                  checked={isSelected}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    toggleFriendSelection(friend);
                                  }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      
                      {selectedFriends.length > 0 && (
                        <div className="fm-selected-summary">
                          <p>Đã chọn {selectedFriends.length} bạn bè</p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {inviteTab === 'email' && (
                <div className="fm-email-tab">
                  <h4>Nhập email để mời</h4>
                  
                  <div className="fm-email-form">
                    <div className="fm-email-input-wrapper">
                      <input
                        type="email"
                        placeholder="Nhập email của người muốn mời..."
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        className="fm-email-input"
                      />
                      {checkingEmail && (
                        <div className="fm-email-checking">
                          <i className="fas fa-spinner fa-spin"></i>
                        </div>
                      )}
                      {!checkingEmail && emailExists === true && (
                        <div className="fm-email-status exists">
                          <i className="fas fa-check-circle"></i>
                        </div>
                      )}
                      {!checkingEmail && emailExists === false && (
                        <div className="fm-email-status not-exists">
                          <i className="fas fa-times-circle"></i>
                        </div>
                      )}
                    </div>
                    
                    {emailExists === true && (
                      <p className="fm-email-note success">
                        <i className="fas fa-check-circle"></i> 
                        Email hợp lệ - có thể gửi lời mời
                      </p>
                    )}
                    
                    {emailExists === false && (
                      <p className="fm-email-note error">
                        <i className="fas fa-exclamation-circle"></i> 
                        Email không tồn tại trong hệ thống
                      </p>
                    )}
                    
                    {!emailExists && !checkingEmail && inviteEmail.trim() && (
                      <p className="fm-email-note">
                        <i className="fas fa-info-circle"></i> 
                        Nhập email để kiểm tra
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
            
            <div className="fm-modal-footer">
              <button 
                className="fm-btn secondary" 
                onClick={() => {
                  setShowInviteModal(false);
                  setEmailExists(null);
                  setInviteEmail('');
                }}
                disabled={inviting}
              >
                Hủy
              </button>
              
              {inviteTab === 'friends' ? (
                <button 
                  className="fm-btn primary" 
                  onClick={handleInviteFriends}
                  disabled={inviting || selectedFriends.length === 0}
                >
                  {inviting ? (
                    <><i className="fas fa-spinner fa-spin"></i> Đang mời...</>
                  ) : (
                    <><i className="fas fa-paper-plane"></i> Mời {selectedFriends.length} người</>
                  )}
                </button>
              ) : (
                <button 
                  className="fm-btn primary" 
                  onClick={handleInviteByEmail}
                  disabled={inviting || !inviteEmail.trim() || emailExists !== true}
                >
                  {inviting ? (
                    <><i className="fas fa-spinner fa-spin"></i> Đang gửi...</>
                  ) : (
                    <><i className="fas fa-paper-plane"></i> Gửi lời mời</>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal xóa thành viên */}
      {showDeleteModal && memberToDelete && (
        <div 
          className="fm-modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              closeDeleteModal();
            }
          }}
        >
          <div 
            className="fm-invite-modal fm-delete-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="fm-modal-header">
              <h3>
                <i className="fas fa-exclamation-triangle"></i>
                Xác nhận xóa thành viên
              </h3>
              <button 
                className="fm-modal-close" 
                onClick={closeDeleteModal}
                disabled={deleting}
              >
                ×
              </button>
            </div>
            
            <div className="fm-modal-body">
              <div className="fm-delete-warning">
                <div className="fm-delete-warning-icon">
                  <i className="fas fa-exclamation-triangle"></i>
                </div>
                <h4>Bạn có chắc chắn muốn xóa thành viên này?</h4>
                <p>Hành động này không thể hoàn tác!</p>
                
                <div className="fm-delete-member-preview">
                  <div className="fm-delete-member-preview-label">Thông tin thành viên:</div>
                  <div className="fm-delete-member-preview-avatar">
                    <div className="fm-member-avatar" style={{ width: '80px', height: '80px', fontSize: '32px' }}>
                      {memberToDelete.name ? memberToDelete.name.charAt(0).toUpperCase() : 
                       memberToDelete.email ? memberToDelete.email.charAt(0).toUpperCase() : 'U'}
                    </div>
                  </div>
                  <div className="fm-delete-member-preview-name">
                    {memberToDelete.name || memberToDelete.email || 'Thành viên'}
                  </div>
                  {memberToDelete.email && (
                    <div className="fm-delete-member-preview-email">
                      <strong>Email:</strong> {memberToDelete.email}
                    </div>
                  )}
                  {memberToDelete.role && (
                    <div className="fm-delete-member-preview-role">
                      <strong>Vai trò:</strong> {memberToDelete.role === 'owner' ? 'Quản trị viên' : 'Thành viên'}
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="fm-modal-footer">
              <button 
                className="fm-btn secondary" 
                onClick={closeDeleteModal}
                disabled={deleting}
              >
                Hủy
              </button>
              <button 
                className="fm-btn danger" 
                onClick={handleRemoveMember}
                disabled={deleting}
              >
                {deleting ? (
                  <>
                    <i className="fas fa-spinner fa-spin"></i>
                    Đang xóa...
                  </>
                ) : (
                  <>
                    <i className="fas fa-user-minus"></i>
                    Xác nhận xóa
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
