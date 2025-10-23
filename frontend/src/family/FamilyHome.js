import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import FamilySidebar from './FamilySidebar';
import './FamilyHome.css';

export default function FamilyHome() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [familyData, setFamilyData] = useState(null);
  const [budgets, setBudgets] = useState([]);
  const [error, setError] = useState(null);
  // Thêm state cho người dùng hiện tại
  const [currentUser, setCurrentUser] = useState(null);
  // Thêm state mới
  const [familyBalance, setFamilyBalance] = useState(null);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  
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

  // Thêm hàm để lấy số dư gia đình
  const fetchFamilyBalance = useCallback(async () => {
    if (!token || !selectedFamilyId) return;
    
    setLoadingBalance(true);
    try {
      // Thêm timestamp để tránh cache
      const timestamp = new Date().getTime();
      const res = await fetch(`${API_BASE}/api/family/${selectedFamilyId}/balance?_t=${timestamp}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!res.ok) {
        throw new Error('Không thể tải số dư gia đình');
      }
      
      const data = await res.json();
      console.log('Family balance data:', data); // Để debug
      setFamilyBalance(data);
    } catch (err) {
      console.error("Error fetching family balance:", err);
    } finally {
      setLoadingBalance(false);
    }
  }, [token, selectedFamilyId, API_BASE]);

  // Thêm hàm để lấy các giao dịch gần đây của gia đình
  const fetchRecentTransactions = useCallback(async () => {
    if (!token || !selectedFamilyId) return;
    
    setLoadingTransactions(true);
    try {
      // Chỉ lấy giao dịch gia đình (transactionScope=family)
      // thêm excludeActivities=true để loại trừ các hoạt động nạp/rút (tag 'transfer')
      const res = await fetch(`${API_BASE}/api/family/${selectedFamilyId}/transactions?limit=5&sort=date&order=desc&transactionScope=family&excludeActivities=true`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!res.ok) {
        throw new Error('Không thể tải giao dịch gần đây');
      }
      
      const data = await res.json();
      setRecentTransactions(data.transactions || []);
    } catch (err) {
      console.error("Error fetching recent transactions:", err);
    } finally {
      setLoadingTransactions(false);
    }
  }, [token, selectedFamilyId, API_BASE]);

  // Lấy thông tin gia đình từ API thật
  useEffect(() => {
    const loadData = async () => {
      if (!token) {
        navigate('/login');
        return;
      }

      if (!selectedFamilyId) {
        navigate('/family-selector');
        return;
      }

      try {
        setLoading(true);
        
        // Lấy thông tin người dùng hiện tại
        setCurrentUser(getCurrentUser());
        
        // Lấy thông tin gia đình cụ thể
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

        const family = await familyRes.json();
        setFamilyData(family);

        // Tạo dữ liệu ngân sách mẫu (sẽ thay thế bằng API thật sau)
        const sampleBudgets = [
          { id: "1", category: "Ăn uống", allocated: 5000000, spent: 3500000, icon: "fas fa-utensils" },
          { id: "2", category: "Tiện ích", allocated: 2000000, spent: 1800000, icon: "fas fa-lightbulb" },
          { id: "3", category: "Đi lại", allocated: 1500000, spent: 800000, icon: "fas fa-car" },
          { id: "4", category: "Giải trí", allocated: 1000000, spent: 600000, icon: "fas fa-film" }
        ];
        setBudgets(sampleBudgets);
        
        // Gọi các API mới
        await Promise.all([
          fetchFamilyBalance(),
          fetchRecentTransactions()
        ]);
        
      } catch (err) {
        console.error("Error fetching family data:", err);
        if (err.message.includes('401') || err.message.includes('invalid')) {
          localStorage.removeItem('token');
          navigate('/login');
          return;
        }
        setError("Không thể tải dữ liệu gia đình");
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, [token, navigate, API_BASE, selectedFamilyId, getCurrentUser, fetchFamilyBalance, fetchRecentTransactions]);
  
  // Format currency helper
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };
  
  // Calculate budget percentage
  const calculatePercentage = (spent, allocated) => {
    return Math.min(Math.round((spent / allocated) * 100), 100);
  };

  // Nếu không có dữ liệu gia đình và không loading, hiển thị lỗi
  if (!loading && !familyData && !error) {
    return (
      <div className="family-page">
        <FamilySidebar active="home" />
        <main className="family-main">
          <div className="fh-error">
            <i className="fas fa-exclamation-triangle"></i>
            <p>Bạn chưa tham gia gia đình nào</p>
            <button onClick={() => navigate('/family-switch')}>Tạo hoặc tham gia gia đình</button>
          </div>
        </main>
      </div>
    );
  }

  // Lấy thông tin owner
  const getOwnerInfo = () => {
    if (!familyData || !familyData.owner) return null;
    return familyData.owner;
  };

  // Kiểm tra xem một member có phải là owner không
  const isMemberOwner = (member) => {
    const owner = getOwnerInfo();
    if (!owner) return false;
    
    const ownerId = owner._id || owner.id || owner;
    const memberUserId = member.user && (member.user._id || member.user);
    return String(ownerId) === String(memberUserId);
  };

  // Kiểm tra xem một member có phải là người dùng hiện tại không
  const isCurrentUser = (member) => {
    if (!currentUser || !member) return false;
    const memberUserId = member.user && (member.user._id || member.user);
    return String(memberUserId) === String(currentUser.id);
  };

  return (
    <div className="family-home">
      <FamilySidebar />
      
      <main className="fh-main">
        {loading ? (
          <div className="fh-loading">
            <div className="fh-loading-spinner"></div>
            <p>Đang tải dữ liệu gia đình...</p>
          </div>
        ) : error ? (
          <div className="fh-error">
            <i className="fas fa-exclamation-triangle"></i>
            <p>{error}</p>
            <button onClick={() => window.location.reload()}>Thử lại</button>
          </div>
        ) : (
          <>
            {/* Header Section */}
            <header className="fh-header">
              <div className="fh-title-area">
                <h1>{familyData?.name || "Gia đình của tôi"}</h1>
                <p>Quản lý tài chính cho cả gia đình</p>
              </div>
              
              <div className="fh-actions">
                <button className="fh-btn secondary" onClick={() => navigate('/family/expenses')}>
                  <i className="fas fa-receipt"></i> Thêm chi tiêu
                </button>
                <button className="fh-btn primary" onClick={() => navigate('/family/budget')}>
                  <i className="fas fa-wallet"></i> Quản lý ngân sách
                </button>
              </div>
            </header>
            
            {/* Financial Overview */}
            <section className="fh-financial-overview">
              <div className="fh-card balance">
                <div className="fh-card-header">
                  <i className="fas fa-wallet"></i>
                  <span>Số dư gia đình</span>
                </div>
                <div className="fh-card-amount">
                  {loadingBalance ? (
                    <div className="fh-loading-spinner small"></div>
                  ) : (
                    formatCurrency(familyBalance?.familyBalance || 0)
                  )}
                </div>
              </div>
              
              <div className="fh-card income">
                <div className="fh-card-header">
                  <i className="fas fa-arrow-down"></i>
                  <span>Thu nhập gia đình</span>
                </div>
                <div className="fh-card-amount">
                  {loadingBalance ? (
                    <div className="fh-loading-spinner small"></div>
                  ) : (
                    formatCurrency(familyBalance?.familyIncome || 0)
                  )}
                </div>
              </div>
              
              <div className="fh-card expense">
                <div className="fh-card-header">
                  <i className="fas fa-arrow-up"></i>
                  <span>Chi tiêu gia đình</span>
                </div>
                <div className="fh-card-amount">
                  {loadingBalance ? (
                    <div className="fh-loading-spinner small"></div>
                  ) : (
                    formatCurrency(familyBalance?.familyExpense || 0)
                  )}
                </div>
              </div>
              
              <div className="fh-card savings">
                <div className="fh-card-header">
                  <i className="fas fa-piggy-bank"></i>
                  <span>Tổng giao dịch gia đình</span>
                </div>
                <div className="fh-card-amount">
                  {loadingTransactions ? (
                    <div className="fh-loading-spinner small"></div>
                  ) : (
                    recentTransactions.length
                  )}
                </div>
              </div>
            </section>
            
            {/* Main Grid Layout */}
            <div className="fh-grid">
              {/* Budget Overview */}
              <section className="fh-budget-overview">
                <div className="fh-section-header">
                  <h2><i className="fas fa-chart-pie"></i> Ngân sách tháng này</h2>
                  <button className="fh-btn-link" onClick={() => navigate('/family/budget')}>
                    Xem tất cả <i className="fas fa-chevron-right"></i>
                  </button>
                </div>
                
                <div className="fh-budget-list">
                  {budgets.map(budget => {
                    const percentage = calculatePercentage(budget.spent, budget.allocated);
                    const status = percentage >= 90 ? 'danger' : percentage >= 70 ? 'warning' : 'good';
                    
                    return (
                      <div key={budget.id} className="fh-budget-item">
                        <div className="fh-budget-icon">
                          <i className={budget.icon}></i>
                        </div>
                        
                        <div className="fh-budget-content">
                          <div className="fh-budget-title">{budget.category}</div>
                          
                          <div className="fh-budget-bar-container">
                            <div 
                              className={`fh-budget-bar ${status}`} 
                              style={{ width: `${percentage}%` }}
                            ></div>
                          </div>
                          
                          <div className="fh-budget-details">
                            <div className="fh-budget-spent">
                              {formatCurrency(budget.spent)} / {formatCurrency(budget.allocated)}
                            </div>
                            <div className={`fh-budget-percentage ${status}`}>{percentage}%</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
              
              {/* Recent Transactions */}
              <section className="fh-recent-transactions">
                <div className="fh-section-header">
                  <h2><i className="fas fa-exchange-alt"></i> Giao dịch gia đình gần đây</h2>
                  <button className="fh-btn-link" onClick={() => navigate('/family/transactions')}>
                    Xem tất cả <i className="fas fa-chevron-right"></i>
                  </button>
                </div>
                
                {loadingTransactions ? (
                  <div className="fh-loading-inline">
                    <div className="fh-loading-spinner"></div>
                    <p>Đang tải giao dịch gia đình...</p>
                  </div>
                ) : recentTransactions.length === 0 ? (
                  <div className="fh-empty-state">
                    <i className="fas fa-receipt"></i>
                    <p>Chưa có giao dịch gia đình nào</p>
                  </div>
                ) : (
                  <div className="fh-transactions-list">
                    {recentTransactions.map(tx => {
                      const categoryInfo = tx.category && typeof tx.category === 'object' 
                        ? { name: tx.category.name, icon: tx.category.icon }
                        : { name: 'Không có', icon: 'fa-receipt' };
                        
                      const creatorName = tx.creatorName || (tx.createdBy && tx.createdBy.name) || 'Thành viên';
                      
                      return (
                        <div key={tx._id} className="fh-transaction-item">
                          <div className="fh-transaction-date">
                            {new Date(tx.date || tx.createdAt).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}
                          </div>
                          
                          <div className="fh-transaction-content">
                            <div className="fh-transaction-title">{tx.description || 'Giao dịch gia đình'}</div>
                            <div className="fh-transaction-meta">
                              <span className="fh-transaction-category">{categoryInfo.name}</span>
                              <span className="fh-transaction-separator">•</span>
                              <span className="fh-transaction-member">{creatorName}</span>
                              <span className="fh-transaction-separator">•</span>
                              <span className={`fh-transaction-type ${tx.type}`}>
                                {tx.type === 'income' ? 'Thu nhập' : 'Chi tiêu'}
                              </span>
                            </div>
                          </div>
                          
                          <div className={`fh-transaction-amount ${tx.type === 'expense' ? 'expense' : 'income'}`}>
                            {tx.type === 'expense' ? '-' : '+'}{formatCurrency(tx.amount)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
              
              {/* Family Members */}
              <section className="fh-family-members">
                <div className="fh-section-header">
                  <h2><i className="fas fa-users"></i> Thành viên gia đình</h2>
                  <button className="fh-btn-link" onClick={() => navigate('/family/members')}>
                    Quản lý <i className="fas fa-chevron-right"></i>
                  </button>
                </div>
                
                <div className="fh-members-list">
                  {familyData?.members.map(member => {
                    const memberUserId = member.user && (member.user._id || member.user);
                    const isOwner = isMemberOwner(member);
                    const isUserCurrent = isCurrentUser(member);
                    
                    // Tạo biến tên hiển thị - ưu tiên hiển thị tên thật
                    const displayName = member.name || 
                                       (member.user && member.user.name) || 
                                       'Thành viên';
                    
                    return (
                      <div 
                        key={memberUserId || member.email} 
                        className={`fh-member-item ${isUserCurrent ? 'current-user' : ''}`}
                      >
                        <div className="fh-member-avatar">
                          {displayName.charAt(0).toUpperCase()}
                        </div>
                        <div className="fh-member-info">
                          <div className="fh-member-name">
                            {displayName}
                            {isOwner && (
                              <span className="fh-owner-badge">
                                <i className="fas fa-crown"></i> Chủ gia đình
                              </span>
                            )}
                            {isUserCurrent && !isOwner && (
                              <span className="fh-current-user-badge">
                                <i className="fas fa-user"></i> Bạn
                              </span>
                            )}
                          </div>
                          <div className="fh-member-role">
                            {member.email}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  
                  <button className="fh-add-member" onClick={() => navigate('/family/members')}>
                    <i className="fas fa-plus"></i>
                    <div>Thêm thành viên</div>
                  </button>
                </div>
              </section>
              
              {/* Quick Actions */}
              <section className="fh-quick-actions">
                <div className="fh-section-header">
                  <h2><i className="fas fa-bolt"></i> Truy cập nhanh</h2>
                </div>
                
                <div className="fh-actions-grid">
                  <button className="fh-action-card" onClick={() => navigate('/family/expenses')}>
                    <div className="fh-action-icon">
                      <i className="fas fa-receipt"></i>
                    </div>
                    <div className="fh-action-title">Thêm chi tiêu</div>
                  </button>
                  
                  <button className="fh-action-card" onClick={() => navigate('/family/budget')}>
                    <div className="fh-action-icon">
                      <i className="fas fa-wallet"></i>
                    </div>
                    <div className="fh-action-title">Tạo ngân sách</div>
                  </button>
                  
                  <button className="fh-action-card" onClick={() => navigate('/family/savings')}>
                    <div className="fh-action-icon">
                      <i className="fas fa-piggy-bank"></i>
                    </div>
                    <div className="fh-action-title">Mục tiêu tiết kiệm</div>
                  </button>
                  
                  <button className="fh-action-card" onClick={() => navigate('/family/bills')}>
                    <div className="fh-action-icon">
                      <i className="fas fa-file-invoice-dollar"></i>
                    </div>
                    <div className="fh-action-title">Hóa đơn định kỳ</div>
                  </button>
                </div>
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
