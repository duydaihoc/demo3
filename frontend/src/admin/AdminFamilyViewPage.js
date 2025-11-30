import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AdminSidebar from './AdminSidebar';
import './AdminFamiliesPage.css';
import './AdminFamilyViewPage.css';

function AdminFamilyViewPage() {
  const { familyId } = useParams();
  const navigate = useNavigate();
  const [family, setFamily] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [transferActivities, setTransferActivities] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [receiptImages, setReceiptImages] = useState([]);
  const [todoList, setTodoList] = useState([]);
  const [shoppingList, setShoppingList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('transactions');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  const API_BASE = 'http://localhost:5000';
  const token = localStorage.getItem('token');

  // Fetch family data
  const fetchFamily = useCallback(async () => {
    if (!familyId) return;
    setLoading(true);
    setError(null);
    
    try {
      // Try admin endpoint first, fallback to regular endpoint
      let res = await fetch(`${API_BASE}/api/admin/families/${familyId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!res.ok && res.status === 404) {
        // Fallback to regular endpoint
        res = await fetch(`${API_BASE}/api/family/${familyId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }
      
      if (!res.ok) {
        throw new Error(`Lỗi khi tải dữ liệu: ${res.status}`);
      }
      
      const data = await res.json();
      
      // Enhance data with calculated fields
      const enhancedData = {
        ...data,
        ownerName: data.owner?.name || data.ownerName || 'N/A',
        ownerEmail: data.owner?.email || data.ownerEmail || '',
        activeMembers: data.activeMembers || (data.members ? data.members.filter(m => !m.invited).length : 0),
        pendingMembers: data.pendingMembers || (data.members ? data.members.filter(m => m.invited).length : 0)
      };
      
      setFamily(enhancedData);
    } catch (err) {
      console.error('Error fetching family:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [familyId, token]);

  // Fetch transactions
  const fetchTransactions = useCallback(async () => {
    if (!familyId) return;
    
    try {
      const res = await fetch(`${API_BASE}/api/admin/family-transactions?familyId=${familyId}&limit=1000`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        setTransactions(Array.isArray(data.data) ? data.data : []);
      }
    } catch (err) {
      console.error('Error fetching transactions:', err);
    }
  }, [familyId, token]);

  // Fetch transfer activities (deposit/withdrawal)
  const fetchTransferActivities = useCallback(async () => {
    if (!familyId) return;
    
    try {
      const res = await fetch(`${API_BASE}/api/admin/families/${familyId}/transfer-activities?limit=1000`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        setTransferActivities(Array.isArray(data.data) ? data.data : []);
      }
    } catch (err) {
      console.error('Error fetching transfer activities:', err);
    }
  }, [familyId, token]);

  // Fetch budgets
  const fetchBudgets = useCallback(async () => {
    if (!familyId) return;
    
    try {
      const res = await fetch(`${API_BASE}/api/admin/families/${familyId}/budgets`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        setBudgets(Array.isArray(data) ? data : []);
      } else {
        console.error('Failed to fetch budgets:', res.status, res.statusText);
        const errorData = await res.json().catch(() => ({}));
        console.error('Error details:', errorData);
      }
    } catch (err) {
      console.error('Error fetching budgets:', err);
    }
  }, [familyId, token, API_BASE]);

  // Fetch receipt images
  const fetchReceiptImages = useCallback(async () => {
    if (!familyId) return;
    
    try {
      const res = await fetch(`${API_BASE}/api/admin/families/${familyId}/receipt-images?limit=50`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        setReceiptImages(Array.isArray(data.receiptImages) ? data.receiptImages : []);
      } else {
        console.error('Failed to fetch receipt images:', res.status, res.statusText);
        const errorData = await res.json().catch(() => ({}));
        console.error('Error details:', errorData);
      }
    } catch (err) {
      console.error('Error fetching receipt images:', err);
    }
  }, [familyId, token, API_BASE]);

  // Fetch todo list
  const fetchTodoList = useCallback(async () => {
    if (!familyId) return;
    
    try {
      const res = await fetch(`${API_BASE}/api/admin/families/${familyId}/todo-list`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        setTodoList(Array.isArray(data) ? data : []);
      } else {
        console.error('Failed to fetch todo list:', res.status, res.statusText);
        const errorData = await res.json().catch(() => ({}));
        console.error('Error details:', errorData);
      }
    } catch (err) {
      console.error('Error fetching todo list:', err);
    }
  }, [familyId, token, API_BASE]);

  // Fetch shopping list
  const fetchShoppingList = useCallback(async () => {
    if (!familyId) return;
    
    try {
      const res = await fetch(`${API_BASE}/api/admin/families/${familyId}/shopping-list`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        setShoppingList(Array.isArray(data) ? data : []);
      } else {
        console.error('Failed to fetch shopping list:', res.status, res.statusText);
        const errorData = await res.json().catch(() => ({}));
        console.error('Error details:', errorData);
      }
    } catch (err) {
      console.error('Error fetching shopping list:', err);
    }
  }, [familyId, token, API_BASE]);

  useEffect(() => {
    const role = localStorage.getItem('role');
    if (!token || role !== 'admin') {
      navigate('/login');
      return;
    }
    
    fetchFamily();
    
    // Enable scrolling for admin pages
    const body = document.body;
    const html = document.documentElement;
    
    // Store original styles
    const originalBodyOverflow = body.style.overflow;
    const originalHtmlOverflow = html.style.overflow;
    const originalBodyHeight = body.style.height;
    const originalHtmlHeight = html.style.height;
    
    body.classList.add('admin-page-active');
    html.classList.add('admin-page-active');
    
    // Force override with inline styles (highest priority)
    body.style.setProperty('overflow-y', 'auto', 'important');
    body.style.setProperty('overflow-x', 'hidden', 'important');
    body.style.setProperty('height', 'auto', 'important');
    html.style.setProperty('overflow-y', 'auto', 'important');
    html.style.setProperty('overflow-x', 'hidden', 'important');
    html.style.setProperty('height', 'auto', 'important');
    
    return () => {
      // Cleanup on unmount - restore original styles
      body.classList.remove('admin-page-active');
      html.classList.remove('admin-page-active');
      body.style.overflow = originalBodyOverflow;
      html.style.overflow = originalHtmlOverflow;
      body.style.height = originalBodyHeight;
      html.style.height = originalHtmlHeight;
    };
  }, [navigate, fetchFamily, token]);

  useEffect(() => {
    if (family) {
      fetchBudgets();
      fetchReceiptImages();
      fetchTodoList();
      fetchShoppingList();
      fetchTransferActivities();
    }
  }, [family, fetchBudgets, fetchReceiptImages, fetchTodoList, fetchShoppingList, fetchTransferActivities]);

  useEffect(() => {
    if (family && activeTab === 'transactions') {
      fetchTransactions();
    }
    if (family && activeTab === 'transfers') {
      fetchTransferActivities();
    }
    // Reset to page 1 when switching tabs
    setCurrentPage(1);
  }, [family, activeTab, fetchTransactions, fetchTransferActivities]);

  // Reset to page 1 if current page is out of bounds
  useEffect(() => {
    if (activeTab === 'transactions' && transactions.length > 0) {
      const maxPage = Math.ceil(transactions.length / itemsPerPage);
      if (currentPage > maxPage) {
        setCurrentPage(1);
      }
    }
  }, [transactions.length, activeTab, currentPage]);

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

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };

  const getCategoryInfo = (category) => {
    if (typeof category === 'object' && category !== null) {
      return { name: category.name || 'Không có', icon: category.icon || '📝' };
    }
    return { name: 'Không có', icon: '📝' };
  };

  // Pagination calculations for transactions
  const totalPages = Math.ceil(transactions.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedTransactions = transactions.slice(startIndex, endIndex);

  const handlePageChange = (page) => {
    setCurrentPage(page);
    // Don't scroll automatically - let user stay at current scroll position
    // Only scroll if user is at the bottom of the page
    setTimeout(() => {
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      
      // Only scroll if user is near the bottom (within 200px)
      if (scrollTop + windowHeight >= documentHeight - 200) {
        const cardHeader = document.querySelector('.admin-card-header');
        if (cardHeader) {
          cardHeader.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }
    }, 50);
  };

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      handlePageChange(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      handlePageChange(currentPage + 1);
    }
  };

  if (loading) {
    return (
      <div className="admin-layout">
        <AdminSidebar />
        <div className="admin-main-content">
          <div className="admin-loading">
            <i className="fas fa-spinner fa-spin"></i>
            <p>Đang tải thông tin gia đình...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !family) {
    return (
      <div className="admin-layout">
        <AdminSidebar />
        <div className="admin-main-content">
          <div className="admin-error">
            <i className="fas fa-exclamation-triangle"></i>
            <p>{error || 'Không tìm thấy gia đình'}</p>
            <button onClick={() => navigate('/admin/families')} className="admin-retry-btn">
              Quay lại danh sách
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <div className="admin-main-content">
        <div className="admin-header">
          <div>
            <button 
              onClick={() => navigate('/admin/families')} 
              className="admin-back-btn"
              style={{ marginBottom: '16px', padding: '8px 16px', background: '#667eea', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
            >
              ← Quay lại
            </button>
            <h2 className="admin-title">{family.name || 'Gia đình chưa đặt tên'}</h2>
            {family.description && (
              <p style={{ marginTop: '8px', color: '#718096' }}>{family.description}</p>
            )}
          </div>
        </div>

        {/* Family Info Card */}
        <div className="admin-card family-info-card" style={{ marginBottom: '24px', textAlign: 'left' }}>
          <h3 style={{ marginBottom: '16px', textAlign: 'left', width: '100%' }}>Thông tin gia đình</h3>
          <div className="family-info-grid">
            <div className="family-info-item">
              <strong>Chủ sở hữu:</strong>
              <div>{family.ownerName || 'N/A'}</div>
              <div style={{ fontSize: '0.9rem', color: '#718096', textAlign: 'left' }}>{family.ownerEmail || ''}</div>
            </div>
            <div className="family-info-item">
              <strong>Thành viên:</strong>
              <div>{family.activeMembers || 0} thành viên</div>
              {family.pendingMembers > 0 && (
                <div style={{ fontSize: '0.9rem', color: '#f59e0b', textAlign: 'left' }}>
                  {family.pendingMembers} đang chờ
                </div>
              )}
            </div>
            <div className="family-info-item">
              <strong>Ngày tạo:</strong>
              <div>{formatDate(family.createdAt)}</div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="admin-tabs">
          <button 
            className={`admin-tab ${activeTab === 'transactions' ? 'active' : ''}`}
            onClick={() => setActiveTab('transactions')}
          >
            💸 Giao dịch ({transactions.length})
          </button>
          <button 
            className={`admin-tab ${activeTab === 'transfers' ? 'active' : ''}`}
            onClick={() => setActiveTab('transfers')}
          >
            💳 Nạp/Rút quỹ ({transferActivities.length})
          </button>
          <button 
            className={`admin-tab ${activeTab === 'budgets' ? 'active' : ''}`}
            onClick={() => setActiveTab('budgets')}
          >
            💰 Ngân sách ({budgets.length})
          </button>
          <button 
            className={`admin-tab ${activeTab === 'receipts' ? 'active' : ''}`}
            onClick={() => setActiveTab('receipts')}
          >
            📄 Lưu trữ ({receiptImages.length})
          </button>
          <button 
            className={`admin-tab ${activeTab === 'todos' ? 'active' : ''}`}
            onClick={() => setActiveTab('todos')}
          >
            ✅ Việc cần làm ({todoList.length})
          </button>
          <button 
            className={`admin-tab ${activeTab === 'shopping' ? 'active' : ''}`}
            onClick={() => setActiveTab('shopping')}
          >
            🛍️ Shopping ({shoppingList.length})
          </button>
        </div>

        {/* Transfer Activities Tab */}
        {activeTab === 'transfers' && (
          <div className="admin-card">
            <div className="admin-card-header">
              <h3>Hoạt động nạp/rút quỹ gia đình</h3>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <span style={{ fontSize: '0.9rem', color: '#718096' }}>
                  Tổng: {transferActivities.length} hoạt động
                </span>
                <button onClick={fetchTransferActivities} className="admin-refresh-btn">
                  🔄 Làm mới
                </button>
              </div>
            </div>
            <div className="admin-table-container">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Loại</th>
                    <th>Mô tả</th>
                    <th>Số tiền</th>
                    <th>Người thực hiện</th>
                    <th>Ngày</th>
                  </tr>
                </thead>
                <tbody>
                  {transferActivities.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="admin-empty-row">
                        Không có hoạt động nạp/rút nào
                      </td>
                    </tr>
                  ) : (
                    transferActivities.map(activity => {
                      const isDeposit = activity.activityType === 'deposit';
                      return (
                        <tr key={activity._id}>
                          <td>
                            <span className={`admin-transaction-type ${isDeposit ? 'income' : 'expense'}`}>
                              {isDeposit ? '💰 Nạp vào' : '💸 Rút ra'}
                            </span>
                          </td>
                          <td>{activity.description || 'Không có mô tả'}</td>
                          <td className={`admin-amount ${isDeposit ? 'income' : 'expense'}`}>
                            {isDeposit ? '+' : '-'}{formatCurrency(activity.amount)}
                          </td>
                          <td>
                            <div className="admin-creator-info">
                              <div>{activity.creatorName || 'N/A'}</div>
                              {activity.creatorRole && (
                                <div className="admin-creator-role">({activity.creatorRole})</div>
                              )}
                            </div>
                          </td>
                          <td>{formatDate(activity.date || activity.createdAt)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Transactions Tab */}
        {activeTab === 'transactions' && (
          <div className="admin-card">
            <div className="admin-card-header">
              <h3>Giao dịch gia đình</h3>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <span style={{ fontSize: '0.9rem', color: '#718096' }}>
                  Tổng: {transactions.length} giao dịch
                </span>
                <button onClick={fetchTransactions} className="admin-refresh-btn">
                  🔄 Làm mới
                </button>
              </div>
            </div>
            <div className="admin-table-container" key={`transactions-table-${currentPage}`}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Loại</th>
                    <th>Phạm vi</th>
                    <th>Mô tả</th>
                    <th>Số tiền</th>
                    <th>Danh mục</th>
                    <th>Người tạo</th>
                    <th>Ngày</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="admin-empty-row">
                        Không có giao dịch nào
                      </td>
                    </tr>
                  ) : (
                    paginatedTransactions.map(transaction => {
                      const category = getCategoryInfo(transaction.category);
                      return (
                        <tr key={transaction._id}>
                          <td>
                            <span className={`admin-transaction-type ${transaction.type}`}>
                              {transaction.type === 'income' ? '💰 Thu nhập' : '💸 Chi tiêu'}
                            </span>
                          </td>
                          <td>
                            <span className={`admin-scope-badge ${transaction.transactionScope}`}>
                              {transaction.transactionScope === 'family' ? '🏠 Gia đình' : '👤 Cá nhân'}
                            </span>
                          </td>
                          <td>{transaction.description || 'Không có mô tả'}</td>
                          <td className={`admin-amount ${transaction.type}`}>
                            {transaction.type === 'expense' ? '-' : '+'}{formatCurrency(transaction.amount)}
                          </td>
                          <td>
                            <span className="admin-category">
                              {category.icon} {category.name}
                            </span>
                          </td>
                          <td>
                            <div className="admin-creator-info">
                              <div>{transaction.creatorName || 'N/A'}</div>
                              {transaction.creatorRole && (
                                <div className="admin-creator-role">({transaction.creatorRole})</div>
                              )}
                            </div>
                          </td>
                          <td>{formatDate(transaction.date || transaction.createdAt)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {/* Pagination */}
            {transactions.length > 0 && (
              <div className="admin-pagination">
                <div className="admin-pagination-info">
                  Hiển thị {startIndex + 1}-{Math.min(endIndex, transactions.length)} trong tổng số {transactions.length} giao dịch
                </div>
                <div className="admin-pagination-controls">
                  <button
                    className="admin-pagination-btn"
                    onClick={handlePreviousPage}
                    disabled={currentPage === 1}
                  >
                    ← Trước
                  </button>
                  <div className="admin-pagination-pages">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                      <button
                        key={page}
                        className={`admin-pagination-page ${currentPage === page ? 'active' : ''}`}
                        onClick={() => handlePageChange(page)}
                      >
                        {page}
                      </button>
                    ))}
                  </div>
                  <button
                    className="admin-pagination-btn"
                    onClick={handleNextPage}
                    disabled={currentPage === totalPages}
                  >
                    Sau →
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Budgets Tab */}
        {activeTab === 'budgets' && (
          <div className="admin-card">
            <div className="admin-card-header">
              <h3>Ngân sách gia đình</h3>
              <button onClick={fetchBudgets} className="admin-refresh-btn">
                🔄 Làm mới
              </button>
            </div>
            <div className="admin-table-container">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Danh mục</th>
                    <th>Số tiền</th>
                    <th>Đã chi</th>
                    <th>Còn lại</th>
                    <th>Tháng</th>
                    <th>Giao dịch liên quan</th>
                  </tr>
                </thead>
                <tbody>
                  {budgets.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="admin-empty-row">
                        Không có ngân sách nào
                      </td>
                    </tr>
                  ) : (
                    budgets.map(budget => {
                      const category = getCategoryInfo(budget.category);
                      const spent = budget.transactions?.reduce((sum, tx) => sum + (tx.amount || 0), 0) || 0;
                      const remaining = budget.amount - spent;
                      const budgetDate = new Date(budget.date || Date.now());
                      const monthYear = budgetDate.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' });
                      
                      return (
                        <tr key={budget._id}>
                          <td>
                            <span className="admin-category">
                              {category.icon} {category.name}
                            </span>
                          </td>
                          <td>{formatCurrency(budget.amount)}</td>
                          <td style={{ color: spent > budget.amount ? '#ef4444' : '#10b981' }}>
                            {formatCurrency(spent)}
                          </td>
                          <td style={{ color: remaining < 0 ? '#ef4444' : '#10b981', fontWeight: '700' }}>
                            {formatCurrency(remaining)}
                          </td>
                          <td>{monthYear}</td>
                          <td>{budget.transactions?.length || 0} giao dịch</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Receipt Images Tab */}
        {activeTab === 'receipts' && (
          <div className="admin-card">
            <div className="admin-card-header">
              <h3>Lưu trữ hóa đơn</h3>
              <button onClick={fetchReceiptImages} className="admin-refresh-btn">
                🔄 Làm mới
              </button>
            </div>
            <div className="receipt-grid">
              {receiptImages.length === 0 ? (
                <div className="admin-empty-row">Không có hình ảnh hóa đơn nào</div>
              ) : (
                receiptImages.map(receipt => (
                  <div key={receipt._id} className="receipt-card">
                    {receipt.imageUrl && (
                      <img 
                        src={receipt.imageUrl} 
                        alt={receipt.description || 'Hóa đơn'}
                        className="receipt-image"
                        onError={(e) => {
                          e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23ddd" width="200" height="200"/%3E%3Ctext fill="%23999" font-family="sans-serif" font-size="14" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3EKhông có hình ảnh%3C/text%3E%3C/svg%3E';
                        }}
                      />
                    )}
                    <div className="receipt-info">
                      <div><strong>{receipt.description || 'Không có mô tả'}</strong></div>
                      {receipt.amount && (
                        <div style={{ color: '#10b981', fontWeight: '700' }}>
                          {formatCurrency(receipt.amount)}
                        </div>
                      )}
                      {receipt.categoryInfo && (
                        <div>
                          <span className="admin-category">
                            {receipt.categoryInfo.icon} {receipt.categoryInfo.name}
                          </span>
                        </div>
                      )}
                      <div style={{ fontSize: '0.85rem', color: '#718096' }}>
                        {formatDate(receipt.uploadedAt || receipt.date)}
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#718096' }}>
                        Upload bởi: {receipt.uploaderName || 'N/A'}
                      </div>
                      {receipt.isVerified && (
                        <div style={{ color: '#10b981', fontSize: '0.85rem', marginTop: '4px' }}>
                          ✓ Đã xác minh
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Todo List Tab */}
        {activeTab === 'todos' && (
          <div className="admin-card">
            <div className="admin-card-header">
              <h3>Danh sách việc cần làm</h3>
              <button onClick={fetchTodoList} className="admin-refresh-btn">
                🔄 Làm mới
              </button>
            </div>
            <div className="admin-table-container">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Tiêu đề</th>
                    <th>Mô tả</th>
                    <th>Ưu tiên</th>
                    <th>Phân công</th>
                    <th>Tiến độ</th>
                    <th>Hạn chót</th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {todoList.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="admin-empty-row">
                        Không có việc cần làm nào
                      </td>
                    </tr>
                  ) : (
                    todoList.map(todo => (
                      <tr key={todo._id}>
                        <td><strong>{todo.title}</strong></td>
                        <td>{todo.description || '-'}</td>
                        <td>
                          <span className={`priority-badge ${todo.priority || 'medium'}`}>
                            {todo.priority === 'high' ? '🔴 Cao' : 
                             todo.priority === 'medium' ? '🟡 Trung bình' : '🟢 Thấp'}
                          </span>
                        </td>
                        <td>
                          {todo.assignedToNames?.length > 0 
                            ? todo.assignedToNames.join(', ')
                            : 'Chưa phân công'}
                        </td>
                        <td>
                          {todo.totalAssigned > 0 ? (
                            <div>
                              <div>{todo.completedCount || 0}/{todo.totalAssigned} hoàn thành</div>
                              <div style={{ fontSize: '0.85rem', color: '#718096' }}>
                                {todo.completionPercentage || 0}%
                              </div>
                            </div>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td>{todo.dueDate ? formatDate(todo.dueDate) : '-'}</td>
                        <td>
                          {todo.allCompleted ? (
                            <span style={{ color: '#10b981', fontWeight: '700' }}>✓ Hoàn thành</span>
                          ) : (
                            <span style={{ color: '#f59e0b' }}>Đang làm</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Shopping List Tab */}
        {activeTab === 'shopping' && (
          <div className="admin-card">
            <div className="admin-card-header">
              <h3>Danh sách mua sắm</h3>
              <button onClick={fetchShoppingList} className="admin-refresh-btn">
                🔄 Làm mới
              </button>
            </div>
            <div className="admin-table-container">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Tên sản phẩm</th>
                    <th>Số lượng</th>
                    <th>Danh mục</th>
                    <th>Ghi chú</th>
                    <th>Người tạo</th>
                    <th>Trạng thái</th>
                    <th>Ngày tạo</th>
                  </tr>
                </thead>
                <tbody>
                  {shoppingList.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="admin-empty-row">
                        Không có sản phẩm nào trong danh sách mua sắm
                      </td>
                    </tr>
                  ) : (
                    shoppingList.map(item => (
                      <tr key={item._id}>
                        <td><strong>{item.name}</strong></td>
                        <td>{item.quantity || 1}</td>
                        <td>
                          {item.categoryInfo ? (
                            <span className="admin-category">
                              {item.categoryInfo.icon} {item.categoryInfo.name}
                            </span>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td>{item.notes || '-'}</td>
                        <td>{item.creatorName || 'N/A'}</td>
                        <td>
                          {item.purchased ? (
                            <span style={{ color: '#10b981', fontWeight: '700' }}>✓ Đã mua</span>
                          ) : (
                            <span style={{ color: '#f59e0b' }}>Chưa mua</span>
                          )}
                        </td>
                        <td>{formatDate(item.createdAt)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminFamilyViewPage;

