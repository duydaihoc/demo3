import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminSidebar from './AdminSidebar';
import './AdminPage.css';
import './AdminGroupsPage.css';

function AdminGroupsPage() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(null);

  const API_BASE = 'http://localhost:5000';
  const getToken = () => localStorage.getItem('token');

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    const token = getToken();
    if (!token) {
      setError('Token not found');
      setLoading(false);
      return;
    }

    try {
      // Use the dedicated admin endpoint
      const res = await fetch(`${API_BASE}/api/admin/groups`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!res.ok) {
        if (res.status === 403) {
          setError('You do not have admin permissions');
        } else {
          setError(`Error: ${res.status}`);
        }
        setLoading(false);
        return;
      }
      
      const data = await res.json();
      setGroups(data || []);
    } catch (err) {
      console.error('fetchGroups error', err);
      setError(err.message || 'Error fetching groups');
    } finally {
      setLoading(false);
    }
  }, [API_BASE]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('role');
    if (!token || role !== 'admin') {
      navigate('/login');
    } else {
      fetchGroups();
    }
  }, [navigate, fetchGroups]);

  const handleDeleteGroup = async (groupId) => {
    if (!groupId) return;
    
    try {
      const token = getToken();
      const res = await fetch(`${API_BASE}/api/admin/groups/${groupId}/delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        alert(errorData.message || 'Error deleting group');
        return;
      }
      
      // Success - refresh the list
      alert('Group deleted successfully');
      fetchGroups();
    } catch (err) {
      console.error('Error deleting group', err);
      alert('Failed to delete group');
    }
  };

  const openDeleteConfirm = (group) => {
    setSelectedGroup(group);
    setShowConfirmDelete(true);
  };

  const confirmDelete = () => {
    if (selectedGroup) {
      handleDeleteGroup(selectedGroup._id);
      setShowConfirmDelete(false);
      setSelectedGroup(null);
    }
  };

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <div className="admin-main-content">
        <h2 className="admin-title">Quản lý nhóm</h2>
        <div className="admin-card">
          <header className="admin-groups-header">
            <h1>Tất cả nhóm</h1>
            <div className="admin-groups-actions">
              <button onClick={fetchGroups} className="refresh-btn">
                <i className="fas fa-sync"></i> Làm mới
              </button>
            </div>
          </header>

          {loading && <div className="admin-groups-loading">Đang tải danh sách nhóm...</div>}
          {error && <div className="admin-groups-error">Lỗi: {error}</div>}

          {!loading && !error && (
            <div className="admin-groups-table-wrap">
              <table className="admin-groups-table">
                <thead>
                  <tr>
                    <th>Tên nhóm</th>
                    <th>Người tạo</th>
                    <th>Chủ sở hữu</th>
                    <th>Thành viên</th>
                    <th>Đã tham gia</th>
                    <th>Chờ xác nhận</th>
                    <th>Ngày tạo</th>
                    <th>Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.length === 0 && (
                    <tr><td colSpan="8" className="muted">Chưa có nhóm nào</td></tr>
                  )}
                  {groups.map(g => (
                    <tr key={g._id}>
                      <td className="g-name">{g.name}</td>
                      <td className="g-creator">{g.creatorName || 'Không xác định'}</td>
                      <td className="g-owner">{g.ownerName || 'Không xác định'}</td>
                      <td className="g-members">{g.memberCount || 0}</td>
                      <td className="g-active-members">{g.activeMembers || 0}</td>
                      <td className="g-pending-members">{g.pendingMembers || 0}</td>
                      <td className="g-created">{g.createdAt ? new Date(g.createdAt).toLocaleString() : '-'}</td>
                      <td className="g-actions">
                        <button 
                          className="view-btn" 
                          onClick={() => navigate(`/admin/groups/view/${g._id}`)}
                          title="Xem chi tiết nhóm"
                        >
                          <i className="fas fa-eye"></i> Xem
                        </button>
                        <button 
                          className="edit-btn" 
                          onClick={() => navigate(`/admin/groups/edit/${g._id}`)}
                          title="Chỉnh sửa nhóm"
                        >
                          <i className="fas fa-edit"></i> Sửa
                        </button>
                        <button 
                          className="delete-btn" 
                          onClick={() => openDeleteConfirm(g)}
                          title="Xóa nhóm này"
                        >
                          <i className="fas fa-trash-alt"></i> Xóa
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Confirm Delete Modal */}
      {showConfirmDelete && selectedGroup && (
        <div className="admin-confirm-modal">
          <div className="admin-confirm-content">
            <h3>Xóa nhóm</h3>
            <p>Bạn có chắc chắn muốn xóa nhóm "{selectedGroup.name}"?</p>
            <p className="warning-text">Hành động này không thể hoàn tác và sẽ xóa tất cả dữ liệu của nhóm.</p>
            <div className="confirm-actions">
              <button className="cancel-btn" onClick={() => setShowConfirmDelete(false)}>Hủy</button>
              <button className="confirm-btn confirm-delete" onClick={confirmDelete}>Xác nhận xóa</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminGroupsPage;
