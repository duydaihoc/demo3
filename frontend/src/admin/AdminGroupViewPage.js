import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AdminSidebar from './AdminSidebar';
import './AdminPage.css';
import './AdminGroupViewPage.css';

function AdminGroupViewPage() {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const [group, setGroup] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('details');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const API_BASE = 'http://localhost:5000';
  const getToken = () => localStorage.getItem('token');

  // Fetch group data
  const fetchGroup = useCallback(async () => {
    if (!groupId) return;
    setLoading(true);
    setError(null);
    
    try {
      const token = getToken();
      // Try to fetch the group data
      let res = await fetch(`${API_BASE}/api/admin/groups/${groupId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!res.ok) {
        // If admin endpoint fails, try fallback to regular group endpoint
        if (res.status === 404) {
          console.log('Admin endpoint not found, trying fallback...');
          res = await fetch(`${API_BASE}/api/groups/${groupId}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
        }
        
        if (!res.ok) {
          throw new Error(res.status === 403 
            ? 'Bạn không có quyền truy cập thông tin này' 
            : `Lỗi khi tải dữ liệu: ${res.status}`);
        }
      }
      
      const data = await res.json();
      
      // Calculate active/pending members if not provided by API
      if (data && data.members && !data.activeMembers) {
        data.activeMembers = data.members.filter(m => !m.invited).length;
      }
      if (data && data.members && !data.pendingMembers) {
        data.pendingMembers = data.members.filter(m => m.invited).length;
      }
      
      setGroup(data);

      // Try to fetch transactions data
      try {
        // Try admin endpoint first
        let txRes = await fetch(`${API_BASE}/api/admin/groups/${groupId}/transactions`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        // If admin endpoint fails, try regular endpoint
        if (!txRes.ok && txRes.status === 404) {
          txRes = await fetch(`${API_BASE}/api/groups/${groupId}/transactions`, {
            headers: { Authorization: `Bearer ${token}` }
          });
        }
        
        if (txRes.ok) {
          const txData = await txRes.json();
          setTransactions(Array.isArray(txData) ? txData : []);
        } else {
          console.warn('Could not fetch transactions', txRes.status);
          setTransactions([]);
        }
      } catch (err) {
        console.warn('Could not fetch group transactions', err);
        setTransactions([]);
      }
    } catch (err) {
      console.error('Error fetching group:', err);
      setError(err.message || 'Đã xảy ra lỗi khi tải thông tin nhóm');
    } finally {
      setLoading(false);
    }
  }, [groupId, API_BASE]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('role');
    
    if (!token || role !== 'admin') {
      navigate('/login');
    } else {
      fetchGroup();
    }
  }, [navigate, fetchGroup]);

  const handleDeleteGroup = async () => {
    if (!group || !group._id) return;
    
    try {
      const token = getToken();
      const res = await fetch(`${API_BASE}/api/admin/groups/${group._id}/delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Lỗi khi xóa nhóm');
      }
      
      alert('Đã xóa nhóm thành công');
      navigate('/admin/groups');
    } catch (err) {
      console.error('Error deleting group:', err);
      alert(`Lỗi: ${err.message || 'Không thể xóa nhóm'}`);
      setConfirmDelete(false);
    }
  };

  const renderMemberStatus = (member) => {
    if (!member) return 'N/A';
    
    if (member.invited) {
      return (
        <span className="member-status pending">
          <i className="fas fa-clock"></i> Đang chờ
        </span>
      );
    }
    
    return (
      <span className="member-status active">
        <i className="fas fa-check-circle"></i> Đã tham gia
      </span>
    );
  };

  const getMemberName = (member) => {
    if (!member) return 'Unknown';
    
    if (member.user && typeof member.user === 'object') {
      return member.user.name || member.user.email || 'Không tên';
    }
    
    return member.email || 'Không tên';
  };

  const getMemberEmail = (member) => {
    if (!member) return '';
    
    if (member.user && typeof member.user === 'object') {
      return member.user.email || '';
    }
    
    return member.email || '';
  };

  const formatDate = (date) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleString('vi-VN');
  };

  // Helper to build background style based on group color data
  const getGroupBackground = () => {
    if (!group || !group.color) return {};
    
    try {
      const color = typeof group.color === 'string' ? JSON.parse(group.color) : group.color;
      const colors = color.colors || ['#2a5298', '#4ecdc4'];
      const direction = color.direction || '135deg';
      
      if (colors.length === 1) {
        return { backgroundColor: colors[0] };
      }
      
      return {
        background: `linear-gradient(${direction}, ${colors.join(', ')})`
      };
    } catch (e) {
      // Fallback if color is not parseable
      return { backgroundColor: '#2a5298' };
    }
  };

  if (loading) {
    return (
      <div className="admin-layout">
        <AdminSidebar />
        <div className="admin-main-content">
          <h2 className="admin-title">Chi tiết nhóm</h2>
          <div className="loading-indicator">
            <i className="fas fa-spinner fa-spin"></i>
            <p>Đang tải thông tin nhóm...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="admin-layout">
        <AdminSidebar />
        <div className="admin-main-content">
          <h2 className="admin-title">Chi tiết nhóm</h2>
          <div className="error-message">
            <i className="fas fa-exclamation-triangle"></i>
            <p>{error}</p>
            <button className="retry-btn" onClick={fetchGroup}>Thử lại</button>
          </div>
        </div>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="admin-layout">
        <AdminSidebar />
        <div className="admin-main-content">
          <h2 className="admin-title">Chi tiết nhóm</h2>
          <div className="error-message">
            <i className="fas fa-exclamation-triangle"></i>
            <p>Không tìm thấy thông tin nhóm</p>
            <button className="back-btn" onClick={() => navigate('/admin/groups')}>Quay lại danh sách</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <div className="admin-main-content">
        <div className="group-view-header">
          <div className="group-view-breadcrumb">
            <span onClick={() => navigate('/admin/groups')} className="breadcrumb-link">
              <i className="fas fa-users"></i> Quản lý nhóm
            </span>
            <span className="breadcrumb-separator">/</span>
            <span>Chi tiết nhóm</span>
          </div>
          
          <div className="group-actions">
            <button className="edit-group-btn" onClick={() => navigate(`/admin/groups/edit/${groupId}`)}>
              <i className="fas fa-edit"></i> Sửa
            </button>
            <button className="delete-group-btn" onClick={() => setConfirmDelete(true)}>
              <i className="fas fa-trash-alt"></i> Xóa
            </button>
          </div>
        </div>

        {/* Group Card Header */}
        <div className="group-view-card" style={getGroupBackground()}>
          <div className="group-info">
            <h1 className="group-name">{group.name}</h1>
            <div className="group-meta">
              <div className="group-meta-item">
                <i className="fas fa-calendar"></i> Tạo ngày: {formatDate(group.createdAt)}
              </div>
              <div className="group-meta-item">
                <i className="fas fa-users"></i> {group.members ? group.members.length : 0} thành viên
              </div>
            </div>
            {group.description && (
              <div className="group-description">
                {group.description}
              </div>
            )}
          </div>
        </div>

        {/* Tabs Navigation */}
        <div className="group-view-tabs">
          <div 
            className={`tab ${activeTab === 'details' ? 'active' : ''}`}
            onClick={() => setActiveTab('details')}
          >
            <i className="fas fa-info-circle"></i> Thông tin
          </div>
          <div 
            className={`tab ${activeTab === 'members' ? 'active' : ''}`}
            onClick={() => setActiveTab('members')}
          >
            <i className="fas fa-users"></i> Thành viên
          </div>
          <div 
            className={`tab ${activeTab === 'transactions' ? 'active' : ''}`}
            onClick={() => setActiveTab('transactions')}
          >
            <i className="fas fa-exchange-alt"></i> Giao dịch
          </div>
          <div 
            className={`tab ${activeTab === 'activity' ? 'active' : ''}`}
            onClick={() => setActiveTab('activity')}
          >
            <i className="fas fa-chart-line"></i> Hoạt động
          </div>
        </div>

        {/* Tab Content */}
        <div className="group-view-content">
          {activeTab === 'details' && (
            <div className="tab-content">
              <div className="details-grid">
                <div className="detail-section">
                  <h3 className="section-title">Thông tin nhóm</h3>
                  <div className="detail-item">
                    <div className="detail-label">ID:</div>
                    <div className="detail-value">{group._id}</div>
                  </div>
                  <div className="detail-item">
                    <div className="detail-label">Tên nhóm:</div>
                    <div className="detail-value">{group.name}</div>
                  </div>
                  <div className="detail-item">
                    <div className="detail-label">Mô tả:</div>
                    <div className="detail-value">{group.description || 'Không có mô tả'}</div>
                  </div>
                  <div className="detail-item">
                    <div className="detail-label">Ngày tạo:</div>
                    <div className="detail-value">{formatDate(group.createdAt)}</div>
                  </div>
                  <div className="detail-item">
                    <div className="detail-label">Cập nhật cuối:</div>
                    <div className="detail-value">{formatDate(group.updatedAt)}</div>
                  </div>
                </div>
                
                <div className="detail-section">
                  <h3 className="section-title">Thông tin chủ nhóm</h3>
                  <div className="detail-item">
                    <div className="detail-label">Tên:</div>
                    <div className="detail-value">
                      {group.ownerName || (group.owner && (group.owner.name || group.owner.email)) || 'Không xác định'}
                    </div>
                  </div>
                  <div className="detail-item">
                    <div className="detail-label">Email:</div>
                    <div className="detail-value">
                      {group.ownerEmail || (group.owner && group.owner.email) || 'Không có thông tin'}
                    </div>
                  </div>
                </div>
                
                <div className="detail-section">
                  <h3 className="section-title">Thống kê</h3>
                  <div className="stats-grid">
                    <div className="stat-card">
                      <div className="stat-value">{group.members ? group.members.length : 0}</div>
                      <div className="stat-label">Tổng thành viên</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-value">{group.activeMembers || 0}</div>
                      <div className="stat-label">Thành viên đã tham gia</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-value">{group.pendingMembers || 0}</div>
                      <div className="stat-label">Thành viên đang chờ</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-value">{transactions.length}</div>
                      <div className="stat-label">Tổng giao dịch</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'members' && (
            <div className="tab-content">
              <div className="section-header">
                <h3>Danh sách thành viên</h3>
                <div className="section-actions">
                  <button className="refresh-btn" onClick={fetchGroup}>
                    <i className="fas fa-sync"></i> Làm mới
                  </button>
                </div>
              </div>

              <div className="members-table-container">
                <table className="members-table">
                  <thead>
                    <tr>
                      <th>Tên</th>
                      <th>Email</th>
                      <th>Vai trò</th>
                      <th>Trạng thái</th>
                      <th>Ngày tham gia</th>
                      <th>Hành động</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.members && group.members.length > 0 ? (
                      group.members.map((member, index) => (
                        <tr key={index}>
                          <td className="member-name">{getMemberName(member)}</td>
                          <td className="member-email">{getMemberEmail(member)}</td>
                          <td className="member-role">
                            <span className={`role-badge ${member.role || 'member'}`}>
                              {member.role === 'owner' ? 'Chủ nhóm' : 'Thành viên'}
                            </span>
                          </td>
                          <td className="member-status-cell">
                            {renderMemberStatus(member)}
                          </td>
                          <td className="member-date">
                            {member.joinedAt ? formatDate(member.joinedAt) : 
                             member.invitedAt ? formatDate(member.invitedAt) : 'N/A'}
                          </td>
                          <td className="member-actions">
                            <button className="view-user-btn">
                              <i className="fas fa-eye"></i>
                            </button>
                            <button className="remove-member-btn">
                              <i className="fas fa-user-minus"></i>
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="6" className="no-data">Không có thành viên nào trong nhóm</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'transactions' && (
            <div className="tab-content">
              <div className="section-header">
                <h3>Giao dịch của nhóm</h3>
                <div className="section-actions">
                  <button className="refresh-btn" onClick={fetchGroup}>
                    <i className="fas fa-sync"></i> Làm mới
                  </button>
                </div>
              </div>

              <div className="transactions-table-container">
                <table className="transactions-table">
                  <thead>
                    <tr>
                      <th>Nội dung</th>
                      <th>Loại</th>
                      <th>Số tiền</th>
                      <th>Người tạo</th>
                      <th>Ngày</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions && transactions.length > 0 ? (
                      transactions.map((tx, index) => (
                        <tr key={index}>
                          <td className="tx-title">{tx.title || tx.description || 'Không có tiêu đề'}</td>
                          <td className={`tx-type ${tx.type}`}>
                            <span className="type-badge">
                              {tx.type === 'expense' ? 'Chi tiêu' : 
                               tx.type === 'income' ? 'Thu nhập' : tx.type}
                            </span>
                          </td>
                          <td className={`tx-amount ${tx.type}`}>
                            {new Intl.NumberFormat('vi-VN', { 
                              style: 'currency', 
                              currency: 'VND' 
                            }).format(tx.amount || 0)}
                          </td>
                          <td className="tx-creator">
                            {tx.createdBy && typeof tx.createdBy === 'object' ? 
                              (tx.createdBy.name || tx.createdBy.email) : 'Không xác định'}
                          </td>
                          <td className="tx-date">{formatDate(tx.date || tx.createdAt)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="5" className="no-data">Không có giao dịch nào</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'activity' && (
            <div className="tab-content">
              <div className="section-header">
                <h3>Hoạt động gần đây</h3>
              </div>
              
              <div className="activity-timeline">
                <div className="timeline-empty">
                  <i className="fas fa-chart-line"></i>
                  <p>Không có dữ liệu hoạt động</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <div className="modal-overlay">
          <div className="confirmation-modal">
            <div className="modal-header">
              <h3>Xác nhận xóa</h3>
              <button className="close-btn" onClick={() => setConfirmDelete(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <p className="confirm-message">
                Bạn có chắc chắn muốn xóa nhóm <strong>"{group.name}"</strong> không?
              </p>
              <p className="warning-message">
                <i className="fas fa-exclamation-triangle"></i> Hành động này không thể hoàn tác. 
                Tất cả dữ liệu liên quan đến nhóm này sẽ bị xóa vĩnh viễn.
              </p>
            </div>
            <div className="modal-footer">
              <button className="cancel-btn" onClick={() => setConfirmDelete(false)}>Hủy</button>
              <button className="confirm-delete-btn" onClick={handleDeleteGroup}>
                <i className="fas fa-trash-alt"></i> Xác nhận xóa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminGroupViewPage;
