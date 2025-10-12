import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import FamilySidebar from './FamilySidebar';
import './FamilyHome.css';

export default function FamilyHome() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [familyData, setFamilyData] = useState(null);
  const [budgets, setBudgets] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [error, setError] = useState(null);
  
  const API_BASE = 'http://localhost:5000';
  const token = localStorage.getItem('token');
  const selectedFamilyId = localStorage.getItem('selectedFamilyId');
  
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

        // Tạo dữ liệu giao dịch mẫu (sẽ thay thế bằng API thật sau)
        const sampleTransactions = [
          { id: "1", date: "2023-10-05", description: "Đi chợ", amount: 500000, category: "Ăn uống", member: family.owner?.name || "Thành viên" },
          { id: "2", date: "2023-10-04", description: "Tiền điện", amount: 800000, category: "Tiện ích", member: family.owner?.name || "Thành viên" },
          { id: "3", date: "2023-10-03", description: "Xăng xe", amount: 300000, category: "Đi lại", member: family.owner?.name || "Thành viên" },
          { id: "4", date: "2023-10-01", description: "Xem phim", amount: 400000, category: "Giải trí", member: family.owner?.name || "Thành viên" }
        ];
        setTransactions(sampleTransactions);
        
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
  }, [token, navigate, API_BASE, selectedFamilyId]);
  
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

  return (
    <div className="family-page">
      <FamilySidebar active="home" />
      
      <main className="family-main">
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
                  <span>Số dư</span>
                </div>
                <div className="fh-card-amount">{formatCurrency(familyData?.balance || 0)}</div>
              </div>
              
              <div className="fh-card income">
                <div className="fh-card-header">
                  <i className="fas fa-arrow-down"></i>
                  <span>Thu nhập</span>
                </div>
                <div className="fh-card-amount">{formatCurrency(familyData?.income || 0)}</div>
              </div>
              
              <div className="fh-card expense">
                <div className="fh-card-header">
                  <i className="fas fa-arrow-up"></i>
                  <span>Chi tiêu</span>
                </div>
                <div className="fh-card-amount">{formatCurrency(familyData?.expenses || 0)}</div>
              </div>
              
              <div className="fh-card savings">
                <div className="fh-card-header">
                  <i className="fas fa-piggy-bank"></i>
                  <span>Tiết kiệm</span>
                </div>
                <div className="fh-card-amount">{formatCurrency(familyData?.savings || 0)}</div>
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
                  <h2><i className="fas fa-exchange-alt"></i> Giao dịch gần đây</h2>
                  <button className="fh-btn-link" onClick={() => navigate('/family/expenses')}>
                    Xem tất cả <i className="fas fa-chevron-right"></i>
                  </button>
                </div>
                
                <div className="fh-transactions-list">
                  {transactions.map(transaction => (
                    <div key={transaction.id} className="fh-transaction-item">
                      <div className="fh-transaction-date">
                        {new Date(transaction.date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}
                      </div>
                      
                      <div className="fh-transaction-content">
                        <div className="fh-transaction-title">{transaction.description}</div>
                        <div className="fh-transaction-meta">
                          <span className="fh-transaction-category">{transaction.category}</span>
                          <span className="fh-transaction-separator">•</span>
                          <span className="fh-transaction-member">{transaction.member}</span>
                        </div>
                      </div>
                      
                      <div className="fh-transaction-amount">
                        {formatCurrency(transaction.amount)}
                      </div>
                    </div>
                  ))}
                </div>
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
                  {familyData?.members.map(member => (
                    <div key={member.id} className="fh-member-item">
                      <div className="fh-member-avatar">
                        {member.name ? member.name.charAt(0).toUpperCase() : '?'}
                      </div>
                      <div className="fh-member-info">
                        <div className="fh-member-name">{member.name || 'Thành viên'}</div>
                        <div className="fh-member-role">{member.role || 'Thành viên'}</div>
                      </div>
                    </div>
                  ))}
                  
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
