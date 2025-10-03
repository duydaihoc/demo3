import React, { useState, useEffect, useCallback } from 'react';
import GroupSidebar from './GroupSidebar';
import './GroupActivity.css';

export default function GroupActivity() {
  // Sao chép state quản lý thông báo từ GroupSidebar
  const [notifications, setNotifications] = useState([]);
  const [loadingNotifs, setLoadingNotifs] = useState(false);
  const [filters, setFilters] = useState({ showAll: true, showUnread: false });
  const [selectedNotif, setSelectedNotif] = useState(null);

  const API_BASE = 'http://localhost:5000';
  const getToken = () => localStorage.getItem('token');

  // Sao chép hàm fetchNotifications từ GroupSidebar
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
        data: n.data || {},
        raw: n
      })).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
      setNotifications(normalized);
    } catch (e) {
      console.warn('fetchNotifications activity', e);
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

  // Sao chép hàm đánh dấu đã đọc từ GroupSidebar
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

  // Lọc thông báo theo bộ lọc hiện tại
  const filteredNotifications = notifications.filter(n => {
    if (filters.showAll) return true;
    if (filters.showUnread) return !n.read;
    return true;
  });

  // Add formatTime function to fix "not defined" error
  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    // Convert to minutes, hours, days
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);
    
    // Recent times show as relative
    if (mins < 1) return 'Vừa xong';
    if (mins < 60) return `${mins} phút trước`;
    if (hours < 24) return `${hours} giờ trước`;
    if (days < 7) return `${days} ngày trước`;
    
    // Older times show the date
    return date.toLocaleDateString('vi-VN', {
      year: 'numeric',
      month: 'short', 
      day: 'numeric'
    });
  };

  // Phân loại icon theo type của thông báo - cải tiến
  const getNotificationIcon = (type) => {
    if (!type) return '📋';
    if (type.includes('friend')) return '👥';
    if (type.includes('group.transaction.debt')) return '💸';
    if (type.includes('group.transaction.settled') || type.includes('group.transaction.debt.paid')) return '✅';
    if (type.includes('group.transaction.updated')) return '🔄';
    if (type.includes('group.transaction.edited')) return '✏️'; // New icon for self-edits
    if (type.includes('group.transaction.deleted')) return '🗑️';
    if (type.includes('group.transaction')) return '💰';
    if (type.includes('group')) return '👨‍👩‍👧‍👦';
    if (type.includes('invite')) return '✉️';
    if (type.includes('response')) return '✅';
    return '🔔';
  };

  // Add new notification type checks
  const isTransactionUpdatedNotification = (type) => {
    return type && type.includes('transaction.updated');
  };

  const isTransactionDeletedNotification = (type) => {
    return type && type.includes('transaction.deleted');
  };

  // Add a handler for the new transaction edited notification type
  const isTransactionEditedNotification = (type) => {
    return type && type.includes('transaction.edited');
  };

  // Hiển thị thông báo chi tiết khi được chọn
  const handleNotificationClick = (notification) => {
    setSelectedNotif(notification);
    if (!notification.read) {
      markNotificationRead(notification._id);
    }

    // Chuyển hướng đến trang giao dịch nhóm nếu có groupId và transactionId
    if (notification.data && notification.data.groupId && notification.data.transactionId) {
      // Có thể thêm logic để mở trang giao dịch trong tab mới hoặc sau khi xác nhận
      // window.open(`/groups/${notification.data.groupId}/transactions`, '_blank');
    }
  };

  // Kiểm tra xem thông báo có phải là loại giao dịch không
  const isTransactionNotification = (type) => {
    return type && type.includes('transaction');
  };

  // Kiểm tra xem thông báo có phải là loại công nợ không
  const isDebtNotification = (type) => {
    return type && type.includes('debt');
  };

  // Kiểm tra xem thông báo có phải là loại đã thanh toán không
  const isSettledNotification = (type) => {
    return type && (type.includes('settled') || type.includes('debt.paid'));
  };

  // Format số tiền
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount || 0);
  };

  // Render thông tin giao dịch
  const renderTransactionDetails = (notification) => {
    const data = notification.data || {};
    
    if (isTransactionNotification(notification.type)) {
      // Base transaction details rendering
      const baseDetails = (
        <div className="transaction-details">
          {data.title && (
            <div className="tx-title">
              <strong>Tiêu đề:</strong> {data.title}
            </div>
          )}

          {data.description && (
            <div className="tx-description">
              <strong>Mô tả:</strong> {data.description}
            </div>
          )}

          {data.category && data.categoryName && (
            <div className="tx-category">
              <strong>Danh mục:</strong> {data.categoryName}
            </div>
          )}
          
          {/* Add special content for updated transactions */}
          {isTransactionUpdatedNotification(notification.type) && data.previousAmount && data.newAmount && (
            <div className="tx-amount-change">
              <strong>Thay đổi:</strong> 
              <div className="amount-comparison">
                <span className="old-amount">{formatCurrency(data.previousAmount)}</span>
                <span className="arrow">→</span>
                <span className={`new-amount ${data.difference > 0 ? 'increased' : data.difference < 0 ? 'decreased' : ''}`}>
                  {formatCurrency(data.newAmount)}
                </span>
              </div>
              
              {data.difference && (
                <div className={`difference ${data.difference > 0 ? 'negative' : 'positive'}`}>
                  {data.difference > 0 ? (
                    <><span className="diff-icon">▲</span> Tăng {formatCurrency(data.difference)}</>
                  ) : (
                    <><span className="diff-icon">▼</span> Giảm {formatCurrency(Math.abs(data.difference))}</>
                  )}
                </div>
              )}
              
              <div className="update-info">
                Cập nhật bởi: {data.userName || 'Người dùng'}
              </div>
            </div>
          )}
          
          {/* Add special content for deleted transactions */}
          {isTransactionDeletedNotification(notification.type) && (
            <div className="tx-deleted">
              <div className="deleted-info">
                <i className="fas fa-trash-alt"></i>
                <span>Giao dịch đã bị xóa, khoản nợ của bạn đã được hủy</span>
              </div>
              {data.amount && (
                <div className="deleted-amount">
                  <strong>Số tiền nợ đã hủy:</strong> {formatCurrency(data.amount)}
                </div>
              )}
              {data.userName && (
                <div className="deleted-by">
                  Xóa bởi: {data.userName}
                </div>
              )}
            </div>
          )}
          
          {/* Regular transaction amount display */}
          {!isTransactionDeletedNotification(notification.type) && 
           !isTransactionUpdatedNotification(notification.type) && 
           data.shareAmount && (
            <div className="tx-amount">
              <strong>{isDebtNotification(notification.type) ? "Số tiền nợ:" : "Số tiền:"}</strong> 
              <span className={isDebtNotification(notification.type) ? "debt-amount" : ""}> 
                {formatCurrency(data.shareAmount || data.amount)} 
              </span>
            </div>
          )}

          {(data.totalAmount && !data.shareAmount) && (
            <div className="tx-amount">
              <strong>Tổng tiền:</strong> {formatCurrency(data.totalAmount)}
            </div>
          )}

          {isDebtNotification(notification.type) && !isSettledNotification(notification.type) && (
            <div className="tx-status debt">
              <span className="status-badge debt">Chưa thanh toán</span>
            </div>
          )}

          {isSettledNotification(notification.type) && (
            <div className="tx-status settled">
              <span className="status-badge settled">Đã thanh toán</span>
            </div>
          )}

          <div className="tx-actions">
            <button className="action-btn view" onClick={() => window.open(`/groups/${data.groupId}/transactions`, '_blank')}>
              Xem giao dịch
            </button>
          </div>
        </div>
      );
      
      return baseDetails;
    }
    
    return null;
  };

  return (
    <div className="groups-page">
      <GroupSidebar active="activity" />
      <main className="groups-main activity-main">
        <header className="activity-header">
          <div>
            <h1>Hoạt động</h1>
            <p className="subtitle">Xem các thông báo và hoạt động gần đây</p>
          </div>
          <div className="activity-actions">
            <button className="refresh-btn" onClick={fetchNotifications}>
              <i className="fas fa-sync-alt"></i> Làm mới
            </button>
            <button className="mark-all-btn" onClick={markAllRead}>
              <i className="fas fa-check-double"></i> Đánh dấu tất cả đã đọc
            </button>
          </div>
        </header>

        <div className="activity-container">
          <aside className="activity-sidebar">
            <div className="activity-filter">
              <h3>Bộ lọc</h3>
              <div className="filter-options">
                <label className="filter-option">
                  <input 
                    type="radio" 
                    name="filter" 
                    checked={filters.showAll}
                    onChange={() => setFilters({ showAll: true, showUnread: false })} 
                  />
                  <span>Tất cả</span>
                </label>
                <label className="filter-option">
                  <input 
                    type="radio" 
                    name="filter"
                    checked={filters.showUnread} 
                    onChange={() => setFilters({ showAll: false, showUnread: true })}
                  />
                  <span>Chưa đọc ({notifications.filter(n => !n.read).length})</span>
                </label>
              </div>
              
              <div className="activity-categories">
                <h3>Phân loại</h3>
                <div className="category-list">
                  <div className="category-item">
                    <span className="category-icon">👥</span>
                    <span className="category-name">Bạn bè</span>
                  </div>
                  <div className="category-item">
                    <span className="category-icon">👨‍👩‍👧‍👦</span>
                    <span className="category-name">Nhóm</span>
                  </div>
                  <div className="category-item">
                    <span className="category-icon">💰</span>
                    <span className="category-name">Tài chính</span>
                  </div>
                </div>
              </div>
            </div>
          </aside>

          <section className="activity-feed">
            <h2 className="feed-title">
              {filters.showUnread ? 'Thông báo chưa đọc' : 'Tất cả hoạt động'}
            </h2>

            {loadingNotifs ? (
              <div className="activity-loading">
                <div className="spinner"></div>
                <p>Đang tải thông báo...</p>
              </div>
            ) : filteredNotifications.length === 0 ? (
              <div className="activity-empty">
                <div className="empty-icon">📪</div>
                <p>Không có thông báo nào {filters.showUnread ? 'chưa đọc' : ''}</p>
              </div>
            ) : (
              <div className="activity-list">
                {filteredNotifications.map(notif => (
                  <div 
                    key={notif._id} 
                    className={`activity-item ${notif.read ? '' : 'unread'} ${selectedNotif?._id === notif._id ? 'selected' : ''} 
                                ${isTransactionNotification(notif.type) ? 'transaction' : ''} 
                                ${isDebtNotification(notif.type) ? 'debt' : ''} 
                                ${isSettledNotification(notif.type) ? 'settled' : ''}
                                ${isTransactionUpdatedNotification(notif.type) ? 'updated' : ''}
                                ${isTransactionEditedNotification(notif.type) ? 'edited' : ''} 
                                ${isTransactionDeletedNotification(notif.type) ? 'deleted' : ''}`}
                    onClick={() => handleNotificationClick(notif)}
                  >
                    <div className="activity-icon">
                      {getNotificationIcon(notif.type)}
                    </div>
                    <div className="activity-content">
                      <div className="activity-message">{notif.message}</div>
                      <div className="activity-meta">
                        <span className="activity-time">{formatTime(notif.createdAt)}</span>
                        
                        {/* Show old → new amount for updates */}
                        {isTransactionUpdatedNotification(notif.type) && notif.data && (
                          <span className={`activity-amount-change ${notif.data.difference > 0 ? 'increased' : 'decreased'}`}>
                            {formatCurrency(notif.data.previousAmount || 0)} → {formatCurrency(notif.data.newAmount || 0)}
                          </span>
                        )}
                        
                        {/* Show cancelled amount for deletions */}
                        {isTransactionDeletedNotification(notif.type) && notif.data && (
                          <span className="activity-amount-cancelled">
                            <i className="fas fa-ban"></i> {formatCurrency(notif.data.amount || 0)}
                          </span>
                        )}
                        
                        {/* Regular amount display */}
                        {!isTransactionUpdatedNotification(notif.type) && 
                         !isTransactionDeletedNotification(notif.type) && 
                         notif.data && notif.data.shareAmount && (
                          <span className="activity-amount">
                            {formatCurrency(notif.data.shareAmount || notif.data.amount)}
                          </span>
                        )}
                      </div>
                    </div>
                    {!notif.read && <div className="unread-dot"></div>}
                  </div>
                ))}
              </div>
            )}
          </section>

          <aside className="activity-detail">
            {selectedNotif ? (
              <div className="notif-detail">
                <h3>Chi tiết thông báo</h3>
                <div className="detail-content">
                  <div className="detail-header">
                    <div className="detail-icon">{getNotificationIcon(selectedNotif.type)}</div>
                    <div className="detail-type">
                      {isDebtNotification(selectedNotif.type) && !isSettledNotification(selectedNotif.type) ? 'Ghi nợ' : 
                       isSettledNotification(selectedNotif.type) ? 'Thanh toán công nợ' :
                       isTransactionNotification(selectedNotif.type) ? 'Giao dịch' :
                       (selectedNotif.type || 'Thông báo')}
                    </div>
                    <div className="detail-time">{new Date(selectedNotif.createdAt).toLocaleString()}</div>
                  </div>
                  <div className="detail-message">{selectedNotif.message}</div>
                  
                  {/* Hiển thị chi tiết giao dịch */}
                  {renderTransactionDetails(selectedNotif)}
                  
                  <div className="detail-actions">
                    <button className="detail-action mark-read" onClick={() => markNotificationRead(selectedNotif._id)}>
                      Đánh dấu đã đọc
                    </button>
                    
                    {/* Nút chuyển đến trang giao dịch */}
                    {selectedNotif.data && selectedNotif.data.groupId && (
                      <button 
                        className="detail-action view-tx"
                        onClick={() => window.open(`/groups/${selectedNotif.data.groupId}/transactions`, '_blank')}
                      >
                        Xem trang giao dịch
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="detail-placeholder">
                <p>Chọn một thông báo để xem chi tiết</p>
              </div>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}
