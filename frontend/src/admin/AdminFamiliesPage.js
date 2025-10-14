import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminSidebar from './AdminSidebar';
import './AdminFamiliesPage.css';

function AdminFamiliesPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('families'); // 'families' or 'transactions'
  const [families, setFamilies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('desc');

  const API_BASE = 'http://localhost:5000';
  const token = localStorage.getItem('token');

  const fetchFamilies = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/admin/families`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        throw new Error('Không thể tải danh sách gia đình');
      }
      const data = await res.json();
      setFamilies(data);
    } catch (err) {
      console.error('Error fetching families:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token, API_BASE]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('role');
    if (!token || role !== 'admin') {
      navigate('/login');
    } else {
      if (activeTab === 'families') {
        fetchFamilies();
      }
    }
  }, [navigate, activeTab, fetchFamilies]);

  const handleDeleteFamily = async (familyId) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa gia đình này?')) return;
    
    try {
      const res = await fetch(`${API_BASE}/api/admin/families/${familyId}/delete`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        throw new Error('Không thể xóa gia đình');
      }
      // Refresh the list
      fetchFamilies();
      alert('Gia đình đã được xóa thành công');
    } catch (err) {
      console.error('Error deleting family:', err);
      alert('Lỗi khi xóa gia đình: ' + err.message);
    }
  };

  const filteredFamilies = families.filter(family => {
    const searchLower = searchTerm.toLowerCase();
    return (
      family.name?.toLowerCase().includes(searchLower) ||
      family.ownerName?.toLowerCase().includes(searchLower) ||
      family.ownerEmail?.toLowerCase().includes(searchLower)
    );
  });

  const sortedFamilies = [...filteredFamilies].sort((a, b) => {
    let aVal = a[sortBy];
    let bVal = b[sortBy];
    
    if (sortBy === 'createdAt') {
      aVal = new Date(aVal);
      bVal = new Date(bVal);
    } else if (typeof aVal === 'string') {
      aVal = aVal.toLowerCase();
      bVal = bVal.toLowerCase();
    }
    
    if (sortOrder === 'asc') {
      return aVal > bVal ? 1 : -1;
    } else {
      return aVal < bVal ? 1 : -1;
    }
  });

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('vi-VN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <div className="admin-main-content">
        <div className="admin-header">
          <h2 className="admin-title">Quản lý gia đình</h2>
          
          {/* Dropdown for tab selection */}
          <div className="admin-tab-selector">
            <select 
              value={activeTab} 
              onChange={(e) => setActiveTab(e.target.value)}
              className="admin-tab-dropdown"
            >
              <option value="families">🏠 Gia đình</option>
              <option value="transactions">💸 Giao dịch</option>
            </select>
          </div>
        </div>

        {activeTab === 'families' && (
          <div className="admin-card">
            <div className="admin-card-header">
              <h3>Danh sách gia đình</h3>
              <div className="admin-controls">
                <input
                  type="text"
                  placeholder="Tìm kiếm gia đình..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="admin-search-input"
                />
                <select 
                  value={`${sortBy}-${sortOrder}`} 
                  onChange={(e) => {
                    const [field, order] = e.target.value.split('-');
                    setSortBy(field);
                    setSortOrder(order);
                  }}
                  className="admin-sort-select"
                >
                  <option value="createdAt-desc">Mới nhất</option>
                  <option value="createdAt-asc">Cũ nhất</option>
                  <option value="name-asc">Tên A-Z</option>
                  <option value="name-desc">Tên Z-A</option>
                  <option value="memberCount-desc">Thành viên nhiều nhất</option>
                  <option value="memberCount-asc">Thành viên ít nhất</option>
                </select>
                <button onClick={fetchFamilies} className="admin-refresh-btn">
                  🔄 Làm mới
                </button>
              </div>
            </div>

            {loading ? (
              <div className="admin-loading">
                <i className="fas fa-spinner fa-spin"></i>
                <p>Đang tải danh sách gia đình...</p>
              </div>
            ) : error ? (
              <div className="admin-error">
                <i className="fas fa-exclamation-triangle"></i>
                <p>{error}</p>
                <button onClick={fetchFamilies} className="admin-retry-btn">
                  Thử lại
                </button>
              </div>
            ) : (
              <div className="admin-table-container">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Tên gia đình</th>
                      <th>Chủ sở hữu</th>
                      <th>Thành viên</th>
                      <th>Ngày tạo</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedFamilies.length === 0 ? (
                      <tr>
                        <td colSpan="5" className="admin-empty-row">
                          {searchTerm ? 'Không tìm thấy gia đình nào phù hợp' : 'Chưa có gia đình nào'}
                        </td>
                      </tr>
                    ) : (
                      sortedFamilies.map(family => (
                        <tr key={family._id}>
                          <td>
                            <div className="admin-family-name">
                              <strong>{family.name || 'Gia đình chưa đặt tên'}</strong>
                              {family.description && (
                                <div className="admin-family-description">
                                  {family.description}
                                </div>
                              )}
                            </div>
                          </td>
                          <td>
                            <div className="admin-owner-info">
                              <div>{family.ownerName}</div>
                              <div className="admin-owner-email">{family.ownerEmail}</div>
                            </div>
                          </td>
                          <td>
                            <div className="admin-member-count">
                              <span className="admin-active-members">{family.activeMembers}</span>
                              {family.pendingMembers > 0 && (
                                <span className="admin-pending-members">
                                  (+{family.pendingMembers} đang chờ)
                                </span>
                              )}
                            </div>
                          </td>
                          <td>{formatDate(family.createdAt)}</td>
                          <td>
                            <div className="admin-actions">
                              <button 
                                className="admin-view-btn"
                                onClick={() => navigate(`/admin/families/${family._id}`)}
                              >
                                👁️ Xem
                              </button>
                              <button 
                                className="admin-delete-btn"
                                onClick={() => handleDeleteFamily(family._id)}
                              >
                                🗑️ Xóa
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'transactions' && (
          <div className="admin-card">
            <h3>Giao dịch gia đình</h3>
            <p>Tính năng giao dịch gia đình sẽ được phát triển sau.</p>
            {/* Có thể thêm bảng giao dịch gia đình ở đây sau */}
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminFamiliesPage;
