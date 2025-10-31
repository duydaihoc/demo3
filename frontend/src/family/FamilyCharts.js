import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import FamilySidebar from './FamilySidebar';
import './FamilyCharts.css';
import { showNotification } from '../utils/notify';

export default function FamilyCharts() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [familyInfo, setFamilyInfo] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

  // Chart data states
  const [monthlyData, setMonthlyData] = useState([]);
  const [categoryData, setCategoryData] = useState([]);
  const [budgetData, setBudgetData] = useState([]);
  const [activityData, setActivityData] = useState([]);
  const [topTransactions, setTopTransactions] = useState([]);

  const API_BASE = 'http://localhost:5000';
  const token = localStorage.getItem('token');
  const selectedFamilyId = localStorage.getItem('selectedFamilyId');

  // Get current user
  const getCurrentUser = useCallback(() => {
    try {
      const t = token;
      if (!t) return null;
      const payload = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return {
        id: payload.id || payload._id || payload.userId || '',
        name: payload.name || '',
        email: payload.email || ''
      };
    } catch (e) { return null; }
  }, [token]);

  // Fetch family info
  const fetchFamilyInfo = useCallback(async () => {
    if (!token || !selectedFamilyId) return;
    try {
      const res = await fetch(`${API_BASE}/api/family/${selectedFamilyId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) return;
      const data = await res.json();
      setFamilyInfo(data);
    } catch (err) {
      console.error('Error fetching family info:', err);
    }
  }, [token, selectedFamilyId, API_BASE]);

  // Fetch chart data
  const fetchChartData = useCallback(async () => {
    if (!token || !selectedFamilyId) return;
    setLoading(true);
    setError('');
    
    try {
      // Monthly transactions data
      const monthlyRes = await fetch(`${API_BASE}/api/family/${selectedFamilyId}/transactions/monthly`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (monthlyRes.ok) {
        const monthly = await monthlyRes.json();
        setMonthlyData(monthly);
      }

      // Category breakdown
      const categoryRes = await fetch(`${API_BASE}/api/family/${selectedFamilyId}/transactions/categories`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (categoryRes.ok) {
        const categories = await categoryRes.json();
        setCategoryData(categories);
      }

      // Budget data
      const budgetRes = await fetch(`${API_BASE}/api/family/${selectedFamilyId}/budget`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (budgetRes.ok) {
        const budgets = await budgetRes.json();
        // Tính spent cho mỗi budget
        const budgetsWithSpent = await Promise.all(budgets.map(async (budget) => {
          const progressRes = await fetch(`${API_BASE}/api/family/${selectedFamilyId}/budget-progress`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (progressRes.ok) {
            const progress = await progressRes.json();
            const categoryId = budget.category?._id || budget.category;
            return {
              ...budget,
              spent: progress[categoryId] || 0
            };
          }
          return { ...budget, spent: 0 };
        }));
        setBudgetData(budgetsWithSpent);
      }

      // Activity data (deposits/withdrawals)
      const activityRes = await fetch(`${API_BASE}/api/family/${selectedFamilyId}/transactions/activity`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (activityRes.ok) {
        const activities = await activityRes.json();
        setActivityData(activities);
      }

      // Top transactions
      const topRes = await fetch(`${API_BASE}/api/family/${selectedFamilyId}/transactions/top?limit=5`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (topRes.ok) {
        const top = await topRes.json();
        setTopTransactions(top);
      }
    } catch (err) {
      console.error('Error fetching chart data:', err);
      setError('Không thể tải dữ liệu biểu đồ');
    } finally {
      setLoading(false);
    }
  }, [token, selectedFamilyId, API_BASE]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const selectedFamilyId = localStorage.getItem('selectedFamilyId');
    
    if (!token) {
      navigate('/login');
      return;
    }
    
    if (!selectedFamilyId) {
      navigate('/family-selector');
      return;
    }
    
    setCurrentUser(getCurrentUser());
    fetchFamilyInfo();
    fetchChartData();
    setLoading(false);
  }, [navigate, getCurrentUser, fetchFamilyInfo, fetchChartData]);

  // Colors for charts
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };

  // Calculate budget completion rate
  const getBudgetCompletionRate = () => {
    if (budgetData.length === 0) return 0;
    const totalBudget = budgetData.reduce((sum, b) => sum + (b.amount || 0), 0);
    const totalSpent = budgetData.reduce((sum, b) => sum + (b.spent || 0), 0);
    return totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;
  };

  // Sửa lại SimpleLineChart để đẹp hơn
  const SimpleLineChart = ({ data }) => {
    if (!data || data.length === 0) {
      return <div className="fc-empty-chart">Chưa có dữ liệu giao dịch</div>;
    }
    
    const maxValue = Math.max(...data.map(d => Math.max(d.income || 0, d.expense || 0)), 100000);
    
    return (
      <div className="fc-line-chart-wrapper">
        <div className="fc-line-chart-legend">
          <div className="fc-legend-item income">
            <span className="fc-legend-dot"></span>
            <span className="fc-legend-text">Thu nhập</span>
          </div>
          <div className="fc-legend-item expense">
            <span className="fc-legend-dot"></span>
            <span className="fc-legend-text">Chi tiêu</span>
          </div>
        </div>
        <div className="simple-line-chart">
          {data.map((item, index) => (
            <div key={index} className="chart-bar-group">
              <div className="chart-bars-pair">
                <div 
                  className="chart-bar income" 
                  style={{
                    height: `${maxValue > 0 ? Math.max((item.income / maxValue) * 160, item.income > 0 ? 4 : 0) : 0}px`
                  }}
                  title={`Thu nhập: ${formatCurrency(item.income)}`}
                >
                  {item.income > 0 && (
                    <div className="chart-bar-tooltip">
                      {formatCurrency(item.income)}
                    </div>
                  )}
                </div>
                <div 
                  className="chart-bar expense" 
                  style={{
                    height: `${maxValue > 0 ? Math.max((item.expense / maxValue) * 160, item.expense > 0 ? 4 : 0) : 0}px`
                  }}
                  title={`Chi tiêu: ${formatCurrency(item.expense)}`}
                >
                  {item.expense > 0 && (
                    <div className="chart-bar-tooltip">
                      {formatCurrency(item.expense)}
                    </div>
                  )}
                </div>
              </div>
              <span className="chart-label">{item.month}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const SimplePieChart = ({ data }) => {
    if (!data || data.length === 0) {
      return (
        <div className="fc-empty-chart">
          <i className="fas fa-chart-pie"></i>
          <p>Chưa có giao dịch chi tiêu nào</p>
          <small>Hãy thêm giao dịch chi tiêu để xem phân bổ theo danh mục</small>
        </div>
      );
    }
    
    const total = data.reduce((sum, item) => sum + item.value, 0);
    
    return (
      <div className="simple-pie-list">
        {data.map((item, index) => {
          const percentage = total > 0 ? Math.round((item.value / total) * 100) : 0;
          return (
            <div key={index} className="pie-item">
              <div className="pie-color" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
              <span className="pie-name">{item.name}</span>
              <div className="pie-values">
                <span className="pie-value">{formatCurrency(item.value)}</span>
                <span className="pie-percent">({percentage}%)</span>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // Sửa SimpleBarChart tương tự (nén dải để 1 ngày lớn không đè bẹp ngày khác)
  const SimpleBarChart = ({ data }) => {
    if (!data || data.length === 0) {
      return (
        <div className="fc-empty-chart">
          <i className="fas fa-exchange-alt"></i>
          <p>Chưa có hoạt động nạp/rút</p>
          <small>Hoạt động nạp rút tiền sẽ được hiển thị tại đây</small>
        </div>
      );
    }
    
    const maxValue = Math.max(...data.map(d => Math.max(d.deposits || 0, d.withdrawals || 0)), 100000);
    
    return (
      <div className="fc-bar-chart-wrapper">
        <div className="fc-bar-chart-legend">
          <div className="fc-legend-item deposits">
            <span className="fc-legend-dot"></span>
            <span className="fc-legend-text">Nạp tiền</span>
          </div>
          <div className="fc-legend-item withdrawals">
            <span className="fc-legend-dot"></span>
            <span className="fc-legend-text">Rút tiền</span>
          </div>
        </div>
        <div className="simple-bar-chart">
          {data.map((item, index) => (
            <div key={index} className="bar-group">
              <div className="bar-pair">
                <div 
                  className="bar-fill deposits" 
                  style={{
                    height: `${maxValue > 0 ? Math.max((item.deposits / maxValue) * 160, item.deposits > 0 ? 4 : 0) : 0}px`
                  }}
                  title={`Nạp: ${formatCurrency(item.deposits)}`}
                >
                  {item.deposits > 0 && (
                    <div className="bar-tooltip">
                      {formatCurrency(item.deposits)}
                    </div>
                  )}
                </div>
                <div 
                  className="bar-fill withdrawals" 
                  style={{
                    height: `${maxValue > 0 ? Math.max((item.withdrawals / maxValue) * 160, item.withdrawals > 0 ? 4 : 0) : 0}px`
                  }}
                  title={`Rút: ${formatCurrency(item.withdrawals)}`}
                >
                  {item.withdrawals > 0 && (
                    <div className="bar-tooltip">
                      {formatCurrency(item.withdrawals)}
                    </div>
                  )}
                </div>
              </div>
              <span className="bar-label">{item.name}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="family-page">
      <FamilySidebar active="charts" collapsed={sidebarCollapsed} />
      
      <main className={`family-main ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        {/* Toggle sidebar button */}
        <button 
          className="sidebar-toggle-btn"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          title={sidebarCollapsed ? 'Mở sidebar' : 'Thu gọn sidebar'}
        >
          <i className={`fas ${sidebarCollapsed ? 'fa-bars' : 'fa-times'}`}></i>
        </button>
        
        <header className="fc-header">
          <div className="fc-header-main">
            <h1><i className="fas fa-chart-bar"></i> Biểu đồ Gia đình</h1>
            <p>Phân tích tài chính và hoạt động gia đình</p>
          </div>
        </header>

        <div className="fc-content">
          {loading ? (
            <div className="fc-loading">
              <div className="fc-loading-spinner"></div>
              <p>Đang tải dữ liệu biểu đồ...</p>
            </div>
          ) : error ? (
            <div className="fc-error">
              <i className="fas fa-exclamation-triangle"></i>
              <p>{error}</p>
              <button onClick={fetchChartData} className="fc-retry-btn">
                Thử lại
              </button>
            </div>
          ) : (
            <div className="fc-charts-grid">
              {/* Monthly Transactions Chart */}
              <div className="fc-chart-card">
                <div className="fc-chart-header">
                  <h3><i className="fas fa-calendar-alt"></i> Giao dịch theo tháng</h3>
                  <span className="fc-chart-badge">Line Chart</span>
                </div>
                <div className="fc-chart-content">
                  <SimpleLineChart data={monthlyData} />
                </div>
              </div>

              {/* Category Breakdown */}
              <div className="fc-chart-card">
                <div className="fc-chart-header">
                  <h3><i className="fas fa-pie-chart"></i> Giao dịch tiêu biểu</h3>
                  <span className="fc-chart-badge">Pie Chart</span>
                </div>
                <div className="fc-chart-content">
                  <SimplePieChart data={categoryData} />
                </div>
              </div>

              {/* Budget Progress */}
              <div className="fc-chart-card">
                <div className="fc-chart-header">
                  <h3><i className="fas fa-wallet"></i> Ngân sách hiện tại</h3>
                  <span className="fc-chart-badge">Progress</span>
                </div>
                <div className="fc-chart-content">
                  <div className="fc-budget-list">
                    {budgetData.slice(0, 5).map((budget, index) => {
                      const percentage = budget.amount > 0 ? Math.round((budget.spent / budget.amount) * 100) : 0;
                      const status = percentage >= 100 ? 'over' : percentage >= 80 ? 'warning' : 'good';
                      
                      return (
                        <div key={index} className="fc-budget-item">
                          <div className="fc-budget-info">
                            <span className="fc-budget-name">{budget.category?.name || 'Danh mục'}</span>
                            <span className="fc-budget-amount">
                              {formatCurrency(budget.spent)} / {formatCurrency(budget.amount)}
                            </span>
                          </div>
                          <div className="fc-budget-bar">
                            <div 
                              className={`fc-budget-fill ${status}`}
                              style={{ width: `${Math.min(percentage, 100)}%` }}
                            ></div>
                          </div>
                          <span className={`fc-budget-percentage ${status}`}>{percentage}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Budget Completion Gauge */}
              <div className="fc-chart-card">
                <div className="fc-chart-header">
                  <h3><i className="fas fa-tachometer-alt"></i> Tốc độ hoàn thành ngân sách</h3>
                  <span className="fc-chart-badge">Gauge</span>
                </div>
                <div className="fc-chart-content">
                  <div className="fc-gauge-container">
                    <div className="fc-gauge">
                      <div className="fc-gauge-circle">
                        <div 
                          className="fc-gauge-fill"
                          style={{ 
                            background: `conic-gradient(#00C49F 0deg, #00C49F ${getBudgetCompletionRate() * 3.6}deg, #e2e8f0 ${getBudgetCompletionRate() * 3.6}deg, #e2e8f0 360deg)` 
                          }}
                        ></div>
                        <div className="fc-gauge-center">
                          <span className="fc-gauge-value">{getBudgetCompletionRate()}%</span>
                          <span className="fc-gauge-label">Hoàn thành</span>
                        </div>
                      </div>
                    </div>
                    <div className="fc-gauge-legend">
                      <div className="fc-gauge-legend-item">
                        <span className="fc-gauge-dot good"></span>
                        <span>Tốt (&lt;80%)</span>
                      </div>
                      <div className="fc-gauge-legend-item">
                        <span className="fc-gauge-dot warning"></span>
                        <span>Cảnh báo (80-99%)</span>
                      </div>
                      <div className="fc-gauge-legend-item">
                        <span className="fc-gauge-dot over"></span>
                        <span>Vượt quá (≥100%)</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Activity Chart */}
              <div className="fc-chart-card">
                <div className="fc-chart-header">
                  <h3><i className="fas fa-exchange-alt"></i> Hoạt động nạp rút</h3>
                  <span className="fc-chart-badge">Bar Chart</span>
                </div>
                <div className="fc-chart-content">
                  <SimpleBarChart data={activityData} />
                </div>
              </div>

              {/* Top Transactions List */}
              <div className="fc-chart-card">
                <div className="fc-chart-header">
                  <h3><i className="fas fa-star"></i> Giao dịch hàng đầu</h3>
                  <span className="fc-chart-badge">List</span>
                </div>
                <div className="fc-chart-content">
                  <div className="fc-top-list">
                    {topTransactions.slice(0, 5).map((transaction, index) => (
                      <div key={index} className="fc-top-item">
                        <div className="fc-top-rank">#{index + 1}</div>
                        <div className="fc-top-info">
                          <div className="fc-top-description">{transaction.description}</div>
                          <div className="fc-top-meta">
                            <span className="fc-top-category">{transaction.category?.name}</span>
                            <span className="fc-top-date">{new Date(transaction.date).toLocaleDateString('vi-VN')}</span>
                          </div>
                        </div>
                        <div className={`fc-top-amount ${transaction.type}`}>
                          {transaction.type === 'expense' ? '-' : '+'}{formatCurrency(transaction.amount)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
