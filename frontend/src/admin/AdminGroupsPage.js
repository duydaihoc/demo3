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

  const API_BASE = 'http://localhost:5000';
  const getToken = () => localStorage.getItem('token');
  const getUserId = () => localStorage.getItem('userId');

  const normalize = (arr) => {
    if (!arr) return [];
    if (Array.isArray(arr)) return arr;
    if (arr.data && Array.isArray(arr.data)) return arr.data;
    if (arr.groups && Array.isArray(arr.groups)) return arr.groups;
    return [];
  };

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    setError(null);
    const token = getToken();
    if (!token) { setError('Token not found'); setLoading(false); return; }

    // try admin endpoint first, then try groups created by current user, then generic groups
    const userId = getUserId();
    const endpoints = [
      `${API_BASE}/api/admin/groups`,
      ...(userId ? [`${API_BASE}/api/groups?owner=${encodeURIComponent(userId)}`] : []),
      `${API_BASE}/api/groups`
    ];

    let lastErr = null;
    for (const url of endpoints) {
      try {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) {
          lastErr = new Error(`HTTP ${res.status}`);
          continue;
        }
        const data = await res.json().catch(() => null);
        const arr = normalize(data);
        // normalize each group for owner and members
        const normalized = arr.map(g => {
          const owner = (g.owner && (typeof g.owner === 'object')) ? (g.owner.name || g.owner.email || g.owner._id) : (g.owner || g.createdBy || null);
          const membersCount = Array.isArray(g.members) ? g.members.length : (g.memberCount || 0);
          return {
            _id: g._id || g.id,
            name: g.name || 'Không tên',
            owner,
            membersCount,
            createdAt: g.createdAt || g.created || g.updatedAt || null,
            raw: g
          };
        });
        setGroups(normalized);
        setLoading(false);
        return;
      } catch (e) {
        lastErr = e;
      }
    }

    setError(lastErr ? String(lastErr.message || lastErr) : 'Không thể lấy dữ liệu');
    setLoading(false);
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

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <div className="admin-main-content">
        <h2 className="admin-title">Quản lý nhóm</h2>
        {/* .admin-card is full-width via AdminPage.css changes */}
        <div className="admin-card">
          <header className="admin-groups-header">
            <h1>Tất cả nhóm</h1>
            <div className="admin-groups-actions">
              <button onClick={fetchGroups} className="refresh-btn">Làm mới</button>
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
                    <th>Số thành viên</th>
                    <th>Ngày tạo</th>
                    <th>Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.length === 0 && (
                    <tr><td colSpan="5" className="muted">Chưa có nhóm nào</td></tr>
                  )}
                  {groups.map(g => (
                    <tr key={g._id}>
                      <td className="g-name">{g.name}</td>
                      <td className="g-owner">{g.owner || 'Không xác định'}</td>
                      <td className="g-members">{g.membersCount}</td>
                      <td className="g-created">{g.createdAt ? new Date(g.createdAt).toLocaleString() : '-'}</td>
                      <td className="g-actions">
                        <button className="view-btn" onClick={() => alert('Xem nhóm: ' + g.name)}>Xem</button>
                        <button className="manage-btn" onClick={() => alert('Quản lý nhóm: ' + g.name)}>Quản lý</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AdminGroupsPage;
