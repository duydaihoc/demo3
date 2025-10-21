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
  const [txStats, setTxStats] = useState(null);
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
      if (data && Array.isArray(data.members)) {
        // accurate active members (joined)
        const joined = data.members.filter(m => !m.invited);
        data.activeMembers = joined.length;
        // remove/ignore pendingMembers from stats (we don't expose it)
        // but keep members array as-is for listing
      }

      setGroup(data);

      // Try to fetch transactions data with stats
      try {
        // Try admin endpoint first (returns detailed stats)
        let txRes = await fetch(`${API_BASE}/api/admin/groups/${groupId}/transactions`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (txRes.ok) {
          const txData = await txRes.json();
          // Admin endpoint returns { transactions, stats }
          if (txData.transactions) {
            setTransactions(txData.transactions);
            setTxStats(txData.stats);
          } else {
            // Fallback for old format
            const normalizedTxs = Array.isArray(txData) ? txData : [txData];
            setTransactions(normalizedTxs);
          }
        } else if (txRes.status === 404) {
          // Fallback to regular endpoint
          txRes = await fetch(`${API_BASE}/api/groups/${groupId}/transactions`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          
          if (txRes.ok) {
            const txData = await txRes.json();
            // Normalize transactions
            const membersList = Array.isArray(data.members) ? data.members : [];
            const normalizeTx = (t) => {
              const tx = { ...t };
              let creatorName = '';
              if (tx.creator && typeof tx.creator === 'object') {
                creatorName = tx.creator.name || tx.creator.email || '';
              } else if (tx.creatorName) {
                creatorName = tx.creatorName;
              } else if (tx.createdBy && typeof tx.createdBy === 'object') {
                creatorName = tx.createdBy.name || tx.createdBy.email || '';
              } else if (tx.createdBy) {
                const cb = String(tx.createdBy);
                const found = membersList.find(m => {
                  const mid = m.user && (m.user._id || m.user) ? String(m.user._id || m.user) : null;
                  const memEmail = (m.email || '').toLowerCase();
                  if (mid && String(mid) === cb) return true;
                  if (cb.includes('@') && memEmail && memEmail === cb.toLowerCase()) return true;
                  return false;
                });
                if (found) creatorName = (found.user && (found.user.name || found.user.email)) || found.name || found.email || cb;
                else creatorName = cb;
              }
              return { ...tx, creatorName };
            };
            
            const normalizedTxs = Array.isArray(txData) ? txData.map(normalizeTx) : [normalizeTx(txData)];
            setTransactions(normalizedTxs);
          } else {
            console.warn('Could not fetch transactions', txRes.status);
            setTransactions([]);
          }
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
    // Always show "Đã tham gia" for members list per requirement
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
                  <h3 className="section-title">Thống kê giao dịch</h3>
                  <div className="stats-grid">
                    <div className="stat-card">
                      <div className="stat-icon"><i className="fas fa-exchange-alt"></i></div>
                      <div className="stat-value">{txStats?.totalTransactions || transactions.length || 0}</div>
                      <div className="stat-label">Tổng giao dịch</div>
                    </div>
                    <div className="stat-card success">
                      <div className="stat-icon"><i className="fas fa-money-bill-wave"></i></div>
                      <div className="stat-value">
                        {txStats?.totalAmount ? 
                          `${(txStats.totalAmount / 1000000).toFixed(1)}tr` : 
                          '0₫'}
                      </div>
                      <div className="stat-label">Tổng số tiền</div>
                    </div>
                    <div className="stat-card info">
                      <div className="stat-icon"><i className="fas fa-users"></i></div>
                      <div className="stat-value">{txStats?.totalParticipants || group.members?.length || 0}</div>
                      <div className="stat-label">Người tham gia</div>
                    </div>
                    <div className="stat-card warning">
                      <div className="stat-icon"><i className="fas fa-hourglass-half"></i></div>
                      <div className="stat-value">
                        {txStats?.totalDebt ? 
                          `${(txStats.totalDebt / 1000).toFixed(0)}k` : 
                          '0₫'}
                      </div>
                      <div className="stat-label">Nợ chưa trả</div>
                    </div>
                    <div className="stat-card success">
                      <div className="stat-icon"><i className="fas fa-check-circle"></i></div>
                      <div className="stat-value">
                        {txStats?.totalPaid ? 
                          `${(txStats.totalPaid / 1000).toFixed(0)}k` : 
                          '0₫'}
                      </div>
                      <div className="stat-label">Đã trả nợ</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-icon"><i className="fas fa-tasks"></i></div>
                      <div className="stat-value">
                        {txStats?.settledTransactions || 0}/{txStats?.totalTransactions || 0}
                      </div>
                      <div className="stat-label">Hoàn thành</div>
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
                      <th>Người trả</th>
                      <th>Số tiền</th>
                      <th>Người tham gia</th>
                      <th>Đã trả / Chưa trả</th>
                      <th>Trạng thái</th>
                      <th>Ngày tạo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions && transactions.length > 0 ? (
                      transactions.map((tx, index) => (
                        <tr key={index}>
                          <td className="tx-title">
                            <div className="tx-title-content">
                              <strong>{tx.title || 'Giao dịch nhóm'}</strong>
                              {tx.description && <small>{tx.description}</small>}
                            </div>
                          </td>
                          <td className="tx-payer">
                            <div className="payer-info">
                              <i className="fas fa-user-circle"></i>
                              {tx.payerName || 'Không xác định'}
                            </div>
                          </td>
                          <td className={`tx-amount`}>
                            <strong>
                              {new Intl.NumberFormat('vi-VN', { 
                                style: 'currency', 
                                currency: 'VND' 
                              }).format(tx.amount || 0)}
                            </strong>
                          </td>
                          <td className="tx-participants">
                            <span className="participant-count">
                              <i className="fas fa-users"></i> {tx.participantCount || 0} người
                            </span>
                          </td>
                          <td className="tx-settlement">
                            <div className="settlement-stats">
                              <span className="settled-count">
                                <i className="fas fa-check-circle" style={{color: '#27ae60'}}></i> 
                                {tx.settledCount || 0}
                              </span>
                              <span className="pending-count">
                                <i className="fas fa-clock" style={{color: '#f39c12'}}></i> 
                                {tx.pendingCount || 0}
                              </span>
                            </div>
                          </td>
                          <td className="tx-status">
                            {tx.pendingCount === 0 ? (
                              <span className="status-badge completed">
                                <i className="fas fa-check-double"></i> Hoàn thành
                              </span>
                            ) : (
                              <span className="status-badge pending">
                                <i className="fas fa-hourglass-half"></i> Còn nợ
                              </span>
                            )}
                          </td>
                          <td className="tx-date">{formatDate(tx.date || tx.createdAt)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="7" className="no-data">Không có giao dịch nào</td>
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
