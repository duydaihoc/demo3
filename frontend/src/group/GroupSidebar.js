import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import './GroupSidebar.css';

export default function GroupSidebar({ active = 'overview' }) {
  const navigate = useNavigate();
  const [selected, setSelected] = useState(active);

  // Notifications in sidebar
  const [notifications, setNotifications] = useState([]);
  const [loadingNotifs, setLoadingNotifs] = useState(false);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);

  const API_BASE = 'http://localhost:5000';
  const getToken = () => localStorage.getItem('token');

  const fetchNotifications = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setLoadingNotifs(true);
    try {
      const res = await fetch(`${API_BASE}/api/notifications`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) { setNotifications([]); return; }
      const data = await res.json().catch(() => []);
      const arr = Array.isArray(data) ? data : (Array.isArray(data.notifications) ? data.notifications : []);
      const normalized = arr.map(n => ({
        _id: n._id || n.id,
        type: n.type,
        message: n.message || n.text || '',
        createdAt: n.createdAt || n.created || n.date,
        read: !!n.read,
        raw: n
      })).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
      setNotifications(normalized);
    } catch (e) {
      console.warn('fetchNotifications sidebar', e);
      setNotifications([]);
    } finally {
      setLoadingNotifs(false);
    }
  }, [API_BASE]);

  useEffect(() => {
    fetchNotifications();
    const iv = setInterval(fetchNotifications, 8000);
    return () => clearInterval(iv);
  }, [fetchNotifications]);

  const markNotificationRead = async (id) => {
    const token = getToken();
    if (!token || !id) return;
    setNotifications(prev => prev.map(n => n._id === id ? { ...n, read: true } : n));
    try {
      await fetch(`${API_BASE}/api/notifications/${encodeURIComponent(id)}/mark-read`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (e) { /* ignore */ }
  };

  const markAllRead = async () => {
    const token = getToken();
    if (!token) return;
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    try {
      await fetch(`${API_BASE}/api/notifications/mark-all-read`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (e) { /* ignore */ }
  };

  const items = [
    { id: 'home', label: 'Trang chủ', route: '/group' },
    { id: 'groups', label: 'Nhóm', route: '/groups' },
    { id: 'friends', label: 'Bạn bè', route: '/friends' }, // mới
    { id: 'activity', label: 'Hoạt động', route: '/activity' },
    { id: 'settings', label: 'Cài đặt', route: '/settings' },
  ];

  return (
    <aside className="group-sidebar" aria-label="Sidebar nhóm">
      <div className="gs-header">
        <div className="gs-logo">NHÓM</div>
        <div className="gs-sub">Quản lý nhóm</div>

        {/* Notification bell in sidebar */}
        <div className="gs-notif" aria-hidden>
          <button
            className="gs-notif-bell"
            onClick={() => { setShowNotifDropdown(v => !v); if (!showNotifDropdown) fetchNotifications(); }}
            aria-label="Thông báo nhóm"
            title="Thông báo"
          >
            🔔
            {notifications && notifications.filter(n => !n.read).length > 0 && (
              <span className="gs-notif-badge">{notifications.filter(n => !n.read).length}</span>
            )}
          </button>

          {showNotifDropdown && (
            <div className="gs-notif-dropdown" role="menu" aria-label="Notifications">
              <div className="gs-notif-header">
                <strong>Thông báo</strong>
                <div>
                  <button className="gs-notif-action" onClick={markAllRead}>Đánh dấu đã đọc</button>
                  <button className="gs-notif-action" onClick={fetchNotifications}>Làm mới</button>
                </div>
              </div>
              <div className="gs-notif-list">
                {loadingNotifs ? <div className="gs-notif-empty">Đang tải...</div> :
                  (notifications.length === 0 ? <div className="gs-notif-empty">Không có thông báo</div> :
                    notifications.map(n => (
                      <div key={n._id || n.id} className={`gs-notif-item ${n.read ? '' : 'unread'}`} onClick={() => markNotificationRead(n._id)}>
                        <div className="gs-notif-msg">{n.message}</div>
                        <div className="gs-notif-time">{new Date(n.createdAt || n.created || n.date).toLocaleString()}</div>
                      </div>
                    ))
                  )
                }
              </div>
            </div>
          )}
        </div>
      </div>

      <nav className="gs-nav" role="navigation">
        <ul className="sidebar-menu">
          {items.map(it => (
            <li key={it.id}>
              <button
                className={`gs-item ${selected === it.id ? 'active' : ''}`}
                onClick={() => {
                  setSelected(it.id);
                  if (it.route) navigate(it.route);
                }}
                aria-pressed={selected === it.id}
                aria-label={it.label}
              >
                {it.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="gs-footer">
        <button className="gs-back" onClick={() => navigate('/home')}>← Về Trang chủ</button>
      </div>
    </aside>
  );
}

