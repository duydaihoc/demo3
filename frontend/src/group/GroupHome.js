import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import './GroupHome.css';
import GroupSidebar from './GroupSidebar';

export default function GroupHome() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState([]);
  const [allTransactions, setAllTransactions] = useState([]);
  const [stats, setStats] = useState({
    totalGroups: 0,
    totalTransactions: 0,
    totalAmount: 0
  });
  const [recentGroups, setRecentGroups] = useState([]);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [error, setError] = useState(null);
  const [groupsPage, setGroupsPage] = useState(1);
  const [transactionsPage, setTransactionsPage] = useState(1);
  const [allGroups, setAllGroups] = useState([]);
  const [allUserTransactions, setAllUserTransactions] = useState([]);

  const API_BASE = 'http://localhost:5000';
  const token = localStorage.getItem('token');

  // Get current user ID from token
  const getCurrentUserId = useCallback(() => {
    if (!token) return null;
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return payload.id || payload._id || payload.userId || null;
    } catch (e) {
      return null;
    }
  }, [token]);

  // Format currency helper
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };

  // Fetch groups
  const fetchGroups = useCallback(async () => {
    if (!token) return [];
    try {
      const res = await fetch(`${API_BASE}/api/groups`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Không thể tải danh sách nhóm');
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch (err) {
      console.error('Error fetching groups:', err);
      return [];
    }
  }, [token, API_BASE]);

  // Fetch transactions for a group
  const fetchGroupTransactions = useCallback(async (groupId) => {
    if (!token || !groupId) return [];
    try {
      const res = await fetch(`${API_BASE}/api/groups/${groupId}/transactions`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch (err) {
      console.error(`Error fetching transactions for group ${groupId}:`, err);
      return [];
    }
  }, [token, API_BASE]);

  // Load all data
  useEffect(() => {
    const loadData = async () => {
      if (!token) {
        navigate('/login');
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Get current user ID
        const currentUserId = getCurrentUserId();
        if (!currentUserId) {
          setError('Không thể xác định người dùng');
          setLoading(false);
          return;
        }

        // Fetch groups - API trả về các nhóm mà user là owner hoặc member
        const groupsData = await fetchGroups();
        setGroups(groupsData);

        // Filter groups where user is owner (for total amount calculation)
        const ownedGroups = groupsData.filter(group => {
          const ownerId = group.owner?._id || group.owner;
          return String(ownerId) === String(currentUserId);
        });

        // Fetch transactions for all groups
        const allTxs = [];
        // Tạo map để tra cứu thông tin nhóm nhanh
        const groupMap = new Map();
        groupsData.forEach(group => {
          const groupId = String(group._id || group.id);
          groupMap.set(groupId, {
            id: groupId,
            name: group.name,
            color: group.color,
            ownerId: group.owner?._id || group.owner
          });
        });

        for (const group of groupsData) {
          const groupId = group._id || group.id;
          const txs = await fetchGroupTransactions(groupId);
          // Add group info to each transaction
          txs.forEach(tx => {
            // Đảm bảo groupInfo luôn được thêm vào
            const txGroupId = String(tx.groupId || tx.group || groupId);
            const groupInfo = groupMap.get(txGroupId) || {
              id: String(groupId),
              name: group.name,
              color: group.color,
              ownerId: group.owner?._id || group.owner
            };
            tx.groupInfo = groupInfo;
            // Đảm bảo groupId luôn có trong transaction
            tx.groupId = txGroupId;
          });
          allTxs.push(...txs);
        }

        // Filter transactions chỉ theo createdBy = user hiện tại
        const userCreatedTransactions = allTxs.filter(tx => {
          const createdById = tx.createdBy?._id || tx.createdBy;
          return createdById && String(createdById) === String(currentUserId);
        });

        // Sort user-created transactions by date (newest first)
        userCreatedTransactions.sort((a, b) => {
          const dateA = new Date(a.date || a.createdAt || 0);
          const dateB = new Date(b.date || b.createdAt || 0);
          return dateB - dateA;
        });

        setAllTransactions(userCreatedTransactions);
        setAllUserTransactions(userCreatedTransactions);

        // Calculate stats
        const totalGroups = groupsData.length;
        const totalTransactions = userCreatedTransactions.length;
        const totalAmount = userCreatedTransactions.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);

        setStats({
          totalGroups,
          totalTransactions,
          totalAmount
        });

        // Sort groups by date (newest first)
        const sortedGroups = [...groupsData].sort((a, b) => {
          const dateA = new Date(a.updatedAt || a.createdAt || 0);
          const dateB = new Date(b.updatedAt || b.createdAt || 0);
          return dateB - dateA;
        });
        setAllGroups(sortedGroups);
        
        // Reset to page 1 and set initial page data (3 groups, 4 transactions)
        setGroupsPage(1);
        setTransactionsPage(1);
        setRecentGroups(sortedGroups.slice(0, 3));
        setRecentTransactions(userCreatedTransactions.slice(0, 4));

      } catch (err) {
        console.error('Error loading data:', err);
        setError('Không thể tải dữ liệu. Vui lòng thử lại.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [token, navigate, fetchGroups, fetchGroupTransactions, getCurrentUserId]);

  // Parse color (can be string or object)
  const parseColor = (color) => {
    if (!color) return { colors: ['#2a5298', '#4ecdc4'], direction: '135deg' };
    if (typeof color === 'string') {
      try {
        return JSON.parse(color);
      } catch {
        return { colors: [color, color], direction: '135deg' };
      }
    }
    return color;
  };

  // Get group color gradient
  const getGroupGradient = (group) => {
    const colorData = parseColor(group.color);
    const colors = colorData.colors || ['#2a5298', '#4ecdc4'];
    const direction = colorData.direction || '135deg';
    return `linear-gradient(${direction}, ${colors[0]}, ${colors[1] || colors[0]})`;
  };

  // Pagination handlers
  const handleGroupsPageChange = (newPage) => {
    setGroupsPage(newPage);
    const itemsPerPage = 3;
    const startIndex = (newPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    setRecentGroups(allGroups.slice(startIndex, endIndex));
  };

  const handleTransactionsPageChange = (newPage) => {
    setTransactionsPage(newPage);
    const itemsPerPage = 4;
    const startIndex = (newPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    setRecentTransactions(allUserTransactions.slice(startIndex, endIndex));
  };

  // Calculate total pages
  const totalGroupsPages = Math.ceil(allGroups.length / 3);
  const totalTransactionsPages = Math.ceil(allUserTransactions.length / 4);

  if (loading) {
    return (
      <div className="groups-page">
        <GroupSidebar active="home" />
        <main className="groups-main">
          <div className="gh-loading">
            <div className="gh-loading-spinner"></div>
            <p>Đang tải dữ liệu nhóm...</p>
          </div>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="groups-page">
        <GroupSidebar active="home" />
        <main className="groups-main">
          <div className="gh-error">
            <i className="fas fa-exclamation-triangle"></i>
            <p>{error}</p>
            <button onClick={() => window.location.reload()}>Thử lại</button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="groups-page">
      <GroupSidebar active="home" />
      <main className="groups-main">
        {/* Header Section */}
        <header className="gh-header">
          <div className="gh-title-area">
            <h1>Trang chủ Nhóm Chi tiêu</h1>
            <p>Quản lý và theo dõi tất cả nhóm của bạn</p>
          </div>
          <div className="gh-actions">
            <button className="gh-btn secondary" onClick={() => navigate('/groups')}>
              <i className="fas fa-users"></i> Quản lý nhóm
            </button>
            <button className="gh-btn primary" onClick={() => navigate('/groups')}>
              <i className="fas fa-plus"></i> Tạo nhóm mới
            </button>
          </div>
        </header>

        {/* Stats Cards */}
        <section className="gh-stats-overview">
          <div className="gh-stat-card total-groups">
            <div className="gh-stat-icon">
              <i className="fas fa-users"></i>
            </div>
            <div className="gh-stat-content">
              <div className="gh-stat-label">Tổng số nhóm</div>
              <div className="gh-stat-value">{stats.totalGroups}</div>
            </div>
          </div>

          <div className="gh-stat-card total-transactions">
            <div className="gh-stat-icon">
              <i className="fas fa-exchange-alt"></i>
            </div>
            <div className="gh-stat-content">
              <div className="gh-stat-label">Tổng giao dịch</div>
              <div className="gh-stat-value">{stats.totalTransactions}</div>
            </div>
          </div>

          <div className="gh-stat-card total-amount">
            <div className="gh-stat-icon">
              <i className="fas fa-wallet"></i>
            </div>
            <div className="gh-stat-content">
              <div className="gh-stat-label">Tổng số tiền (nhóm đã tạo)</div>
              <div className="gh-stat-value">{formatCurrency(stats.totalAmount)}</div>
            </div>
          </div>
        </section>

        {/* Main Grid */}
        <div className="gh-grid">
          {/* Recent Groups */}
          <section className="gh-recent-groups">
            <div className="gh-section-header">
              <h2><i className="fas fa-layer-group"></i> Nhóm gần đây</h2>
            </div>

            <div className="gh-section-content">
            {recentGroups.length === 0 ? (
              <div className="gh-empty-state">
                <i className="fas fa-users"></i>
                <p>Chưa có nhóm nào</p>
                <button className="gh-btn primary" onClick={() => navigate('/groups')}>
                  Tạo nhóm đầu tiên
                </button>
              </div>
            ) : (
              <div className="gh-groups-list">
                {recentGroups.map(group => {
                  const groupId = group._id || group.id;
                  const groupTxs = allTransactions.filter(tx => 
                    (tx.groupInfo?.id === groupId) || 
                    (tx.group === groupId) || 
                    (tx.groupId === groupId)
                  );
                  const groupTotal = groupTxs.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
                  const memberCount = group.members?.length || 0;

                  return (
                    <div 
                      key={groupId} 
                      className="gh-group-card"
                      onClick={() => navigate(`/groups/${groupId}/transactions`)}
                      style={{ 
                        background: getGroupGradient(group),
                        cursor: 'pointer'
                      }}
                    >
                      <div className="gh-group-card-header">
                        <h3>{group.name || 'Nhóm không tên'}</h3>
                        <span className="gh-group-badge">
                          <i className="fas fa-users"></i> {memberCount} thành viên
                        </span>
                      </div>
                      <div className="gh-group-card-stats">
                        <div className="gh-group-stat">
                          <i className="fas fa-exchange-alt"></i>
                          <span>{groupTxs.length} giao dịch</span>
                        </div>
                        <div className="gh-group-stat">
                          <i className="fas fa-wallet"></i>
                          <span>{formatCurrency(groupTotal)}</span>
                        </div>
                      </div>
                      {group.description && (
                        <p className="gh-group-description">{group.description}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
              
              {allGroups.length > 3 && (
                <div className="gh-pagination">
                  <button 
                    className="gh-pagination-btn"
                    onClick={() => handleGroupsPageChange(groupsPage - 1)}
                    disabled={groupsPage === 1}
                  >
                    <i className="fas fa-chevron-left"></i> Trước
                  </button>
                  <span className="gh-pagination-info">
                    Trang {groupsPage} / {totalGroupsPages}
                  </span>
                  <button 
                    className="gh-pagination-btn"
                    onClick={() => handleGroupsPageChange(groupsPage + 1)}
                    disabled={groupsPage >= totalGroupsPages}
                  >
                    Sau <i className="fas fa-chevron-right"></i>
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* Recent Transactions */}
          <section className="gh-recent-transactions">
            <div className="gh-section-header">
              <h2><i className="fas fa-exchange-alt"></i> Giao dịch nhóm gần đây của bạn</h2>
            </div>

            <div className="gh-section-content">
            {recentTransactions.length === 0 ? (
              <div className="gh-empty-state">
                <i className="fas fa-receipt"></i>
                <p>Chưa có giao dịch nào</p>
              </div>
            ) : (
              <div className="gh-transactions-list">
                {recentTransactions.map(tx => {
                  // Lấy thông tin nhóm từ nhiều nguồn để đảm bảo có dữ liệu
                  let groupInfo = tx.groupInfo;
                  
                  // Nếu không có groupInfo, thử lấy từ groupsData
                  if (!groupInfo && tx.groupId) {
                    const foundGroup = groups.find(g => 
                      String(g._id || g.id) === String(tx.groupId || tx.group)
                    );
                    if (foundGroup) {
                      groupInfo = {
                        id: String(foundGroup._id || foundGroup.id),
                        name: foundGroup.name,
                        color: foundGroup.color,
                        ownerId: foundGroup.owner?._id || foundGroup.owner
                      };
                    }
                  }
                  
                  const payerName = tx.payer?.name || tx.payer?.email || 'Người tạo';
                  const categoryName = tx.category?.name || 'Chưa phân loại';
                  const categoryIcon = tx.category?.icon || '';
                  const groupName = groupInfo?.name || 'Nhóm không xác định';

                  return (
                    <div 
                      key={tx._id || tx.id} 
                      className="gh-transaction-item"
                      onClick={() => {
                        if (groupInfo?.id) {
                          navigate(`/groups/${groupInfo.id}/transactions`);
                        }
                      }}
                      style={{ cursor: groupInfo?.id ? 'pointer' : 'default' }}
                    >
                      <div className="gh-transaction-date">
                        {new Date(tx.date || tx.createdAt).toLocaleDateString('vi-VN', { 
                          day: '2-digit', 
                          month: '2-digit' 
                        })}
                      </div>
                      <div className="gh-transaction-content">
                        <div className="gh-transaction-title">{tx.title || 'Giao dịch nhóm'}</div>
                        <div className="gh-transaction-meta">
                          <span className="gh-transaction-group" style={{ 
                            background: groupInfo ? getGroupGradient({ color: groupInfo.color }) : 'linear-gradient(135deg, #64748b, #94a3b8)'
                          }}>
                            <i className="fas fa-users"></i> {groupName}
                          </span>
                          <span className="gh-transaction-separator">•</span>
                          <span className="gh-transaction-category">
                            {categoryIcon && <span className="gh-category-icon">{categoryIcon}</span>}
                            <span>{categoryName}</span>
                          </span>
                          <span className="gh-transaction-separator">•</span>
                          <span className="gh-transaction-payer">
                            <i className="fas fa-user"></i> {payerName}
                          </span>
                        </div>
                      </div>
                      <div className="gh-transaction-amount">
                        {formatCurrency(tx.amount || 0)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
              
              {allUserTransactions.length > 4 && (
                <div className="gh-pagination">
                  <button 
                    className="gh-pagination-btn"
                    onClick={() => handleTransactionsPageChange(transactionsPage - 1)}
                    disabled={transactionsPage === 1}
                  >
                    <i className="fas fa-chevron-left"></i> Trước
                  </button>
                  <span className="gh-pagination-info">
                    Trang {transactionsPage} / {totalTransactionsPages}
                  </span>
                  <button 
                    className="gh-pagination-btn"
                    onClick={() => handleTransactionsPageChange(transactionsPage + 1)}
                    disabled={transactionsPage >= totalTransactionsPages}
                  >
                    Sau <i className="fas fa-chevron-right"></i>
                  </button>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Quick Actions */}
        <section className="gh-quick-actions">
          <div className="gh-section-header">
            <h2><i className="fas fa-bolt"></i> Truy cập nhanh</h2>
          </div>
          <div className="gh-actions-grid">
            <button className="gh-action-card" onClick={() => navigate('/groups')}>
              <div className="gh-action-icon">
                <i className="fas fa-users-cog"></i>
              </div>
              <div className="gh-action-title">Quản lý nhóm</div>
            </button>

            <button className="gh-action-card" onClick={() => navigate('/friends')}>
              <div className="gh-action-icon">
                <i className="fas fa-user-plus"></i>
              </div>
              <div className="gh-action-title">Kết nối bạn bè</div>
            </button>

            <button className="gh-action-card" onClick={() => navigate('/activity')}>
              <div className="gh-action-icon">
                <i className="fas fa-bell"></i>
              </div>
              <div className="gh-action-title">Hoạt động</div>
            </button>

            <button className="gh-action-card" onClick={() => navigate('/groups')}>
              <div className="gh-action-icon">
                <i className="fas fa-chart-pie"></i>
              </div>
              <div className="gh-action-title">Thống kê</div>
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
