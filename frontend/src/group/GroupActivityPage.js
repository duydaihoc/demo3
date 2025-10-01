import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import GroupSidebar from './GroupSidebar';
import './GroupActivityPage.css';

export default function GroupActivityPage() {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activities, setActivities] = useState([]);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');
  const API_BASE = 'http://localhost:5000';
  const token = localStorage.getItem('token');

  useEffect(() => {
    const fetchGroup = async () => {
      if (!groupId || !token) return;
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/api/groups/${groupId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) {
          setGroup(null);
          return;
        }
        const data = await res.json();
        setGroup(data);
      } catch (e) {
        console.warn('fetchGroup error', e);
        setGroup(null);
      } finally {
        setLoading(false);
      }
    };
    fetchGroup();
  }, [groupId, token, API_BASE]);

  useEffect(() => {
    const fetchActivities = async () => {
      if (!token || !groupId) return;
      setLoadingActivities(true);
      try {
        const res = await fetch(`${API_BASE}/api/notifications`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) { setActivities([]); return; }
        const data = await res.json();
        const arr = Array.isArray(data) ? data : (data.notifications || []);
        const filtered = arr
          .filter(n => n && n.data && String(n.data.groupId) === String(groupId))
          .map(n => {
            let category = 'other';
            let icon = 'info-circle';
            let color = '#64748b';
            
            if (n.type) {
              if (n.type.includes('invite')) {
                category = 'member';
                icon = 'user-plus';
                color = '#2563eb';
              } else if (n.type.includes('response')) {
                category = 'member';
                icon = 'user-check';
                color = '#16a34a';
              } else if (n.type.includes('remove')) {
                category = 'member';
                icon = 'user-minus';
                color = '#dc2626';
              } else if (n.type.includes('transaction')) {
                category = 'transaction';
                icon = 'money-bill-wave';
                color = '#ea580c';
              } else if (n.type.includes('update')) {
                category = 'update';
                icon = 'edit';
                color = '#7c3aed';
              }
            }
            
            return {
              id: n._id || n.id,
              type: n.type || 'notification',
              message: n.message || '',
              createdAt: n.createdAt || n.created || n.date,
              category,
              icon,
              color,
              sender: n.sender || n.data?.userId,
              raw: n
            };
          })
          .sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
          
        setActivities(filtered);
      } catch (e) {
        console.warn('fetchActivities error', e);
        setActivities([]);
      } finally {
        setLoadingActivities(false);
      }
    };
    fetchActivities();
  }, [groupId, token, API_BASE]);

  const formatRelativeTime = (dateString) => {
    if (!dateString) return '';
    
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now - date;
      const diffSec = Math.floor(diffMs / 1000);
      const diffMin = Math.floor(diffSec / 60);
      const diffHour = Math.floor(diffMin / 60);
      const diffDay = Math.floor(diffHour / 24);
      
      if (diffSec < 60) return 'Vừa xong';
      if (diffMin < 60) return `${diffMin} phút trước`;
      if (diffHour < 24) return `${diffHour} giờ trước`;
      if (diffDay < 7) return `${diffDay} ngày trước`;
      
      return date.toLocaleDateString('vi-VN', { 
        day: 'numeric', 
        month: 'numeric',
        year: 'numeric'
      });
    } catch (e) { 
      return dateString; 
    }
  };
  
  const filteredActivities = activeFilter === 'all' 
    ? activities 
    : activities.filter(activity => activity.category === activeFilter);

  const activityCounts = activities.reduce((counts, activity) => {
    const category = activity.category || 'other';
    counts[category] = (counts[category] || 0) + 1;
    return counts;
  }, {});

  // Xử lý avatar của người dùng từ email/name
  // eslint-disable-next-line no-unused-vars
  const getAvatarText = (name, email) => {
    if (name && name.length > 0) {
      return name.split(' ').map(part => part[0]).slice(0, 2).join('');
    }
    if (email && email.length > 0) {
      return email[0].toUpperCase();
    }
    return '?';
  };

  // Tính màu avatar từ user ID/email
  // eslint-disable-next-line no-unused-vars
  const getAvatarColor = (id, email) => {
    const text = id || email || 'unknown';
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = text.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = hash % 360;
    return `hsl(${h}, 70%, 50%)`;
  };

  return (
    <div className="groups-page">
      <GroupSidebar active="groups" />
      <main className="group-activity-page">
        <div className="ga-header">
          <button className="ga-back" onClick={() => navigate(-1)}>
            <i className="fas fa-arrow-left"></i> Quay lại
          </button>
          <h1>Hoạt động nhóm</h1>
        </div>

        {loading ? (
          <div className="ga-loading">
            <div className="ga-loading-spinner"></div>
            <span>Đang tải thông tin nhóm...</span>
          </div>
        ) : !group ? (
          <div className="ga-error">
            <i className="fas fa-exclamation-circle"></i>
            <span>Không tìm thấy nhóm</span>
          </div>
        ) : (
          <>
            <div className="ga-group-card">
              <div className="ga-group-content">
                <div className="ga-group-title">
                  <i className="fas fa-layer-group"></i>
                  <h2>{group.name}</h2>
                </div>
                <div className="ga-group-meta">
                  <div className="ga-meta-item">
                    <i className="fas fa-user-shield"></i>
                    <span>Người quản lý: <strong>{group.owner && (group.owner.name || group.owner.email)}</strong></span>
                  </div>
                  <div className="ga-meta-item">
                    <i className="fas fa-users"></i>
                    <span>Số thành viên: <strong>{Array.isArray(group.members) ? group.members.length : 0}</strong></span>
                  </div>
                  {group.description && (
                    <div className="ga-meta-item">
                      <i className="fas fa-info-circle"></i>
                      <span>Mô tả: <strong>{group.description}</strong></span>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="ga-stats">
                <div className="ga-stats-title">Thống kê hoạt động</div>
                <div className="ga-stats-grid">
                  <div className="ga-stat-item">
                    <div className="ga-stat-value">{activities.length}</div>
                    <div className="ga-stat-label">Tổng hoạt động</div>
                  </div>
                  <div className="ga-stat-item">
                    <div className="ga-stat-value">{activityCounts.member || 0}</div>
                    <div className="ga-stat-label">Thành viên</div>
                  </div>
                  <div className="ga-stat-item">
                    <div className="ga-stat-value">{activityCounts.transaction || 0}</div>
                    <div className="ga-stat-label">Giao dịch</div>
                  </div>
                  <div className="ga-stat-item">
                    <div className="ga-stat-value">{activityCounts.update || 0}</div>
                    <div className="ga-stat-label">Cập nhật</div>
                  </div>
                </div>
              </div>
            </div>

            <section className="ga-activities">
              <div className="ga-activities-header">
                <h2>Hoạt động gần đây</h2>
                <div className="ga-filters">
                  <button 
                    className={`ga-filter-btn ${activeFilter === 'all' ? 'active' : ''}`}
                    onClick={() => setActiveFilter('all')}
                  >
                    Tất cả
                  </button>
                  <button 
                    className={`ga-filter-btn ${activeFilter === 'member' ? 'active' : ''}`}
                    onClick={() => setActiveFilter('member')}
                  >
                    Thành viên
                  </button>
                  <button 
                    className={`ga-filter-btn ${activeFilter === 'transaction' ? 'active' : ''}`}
                    onClick={() => setActiveFilter('transaction')}
                  >
                    Giao dịch
                  </button>
                  <button 
                    className={`ga-filter-btn ${activeFilter === 'update' ? 'active' : ''}`}
                    onClick={() => setActiveFilter('update')}
                  >
                    Cập nhật
                  </button>
                </div>
              </div>
              
              {loadingActivities ? (
                <div className="ga-loading">
                  <div className="ga-loading-spinner"></div>
                  <span>Đang tải hoạt động...</span>
                </div>
              ) : filteredActivities.length === 0 ? (
                <div className="ga-empty">
                  <i className="fas fa-history"></i>
                  <p>Chưa có hoạt động nào {activeFilter !== 'all' ? 'thuộc loại này' : ''} liên quan đến nhóm.</p>
                  {activeFilter !== 'all' && (
                    <button className="ga-reset-filter" onClick={() => setActiveFilter('all')}>
                      Xem tất cả hoạt động
                    </button>
                  )}
                </div>
              ) : (
                <div className="ga-timeline">
                  {filteredActivities.map((activity, index) => {
                    const currentDate = new Date(activity.createdAt).toLocaleDateString();
                    const prevDate = index > 0 ? new Date(filteredActivities[index-1].createdAt).toLocaleDateString() : null;
                    const showDateHeader = index === 0 || currentDate !== prevDate;
                    
                    return (
                      <React.Fragment key={activity.id}>
                        {showDateHeader && (
                          <div className="ga-date-header">
                            <div className="ga-date-line"></div>
                            <div className="ga-date-text">{currentDate}</div>
                            <div className="ga-date-line"></div>
                          </div>
                        )}
                        
                        <div className="ga-activity-item">
                          <div className="ga-activity-icon" style={{backgroundColor: activity.color}}>
                            <i className={`fas fa-${activity.icon}`}></i>
                          </div>
                          
                          <div className="ga-activity-content">
                            <div className="ga-activity-msg">{activity.message}</div>
                            <div className="ga-activity-meta">
                              <span className="ga-activity-type">{activity.type}</span>
                              <span className="ga-activity-time">
                                <i className="far fa-clock"></i> {formatRelativeTime(activity.createdAt)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
