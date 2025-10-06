import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminSidebar from './AdminSidebar';
import './AdminPage.css';
import './AdminGroupTransactionsPage.css';

function AdminGroupTransactionsPage() {
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [groups, setGroups] = useState([]);
  const [loadingGroups, setLoadingGroups] = useState(true);
  
  // Filters
  const [filters, setFilters] = useState({
    groupId: '',
    startDate: '',
    endDate: '',
    type: '',
    minAmount: '',
    maxAmount: '',
    searchQuery: ''
  });
  
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0
  });
  
  const [showFilters, setShowFilters] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [showDetails, setShowDetails] = useState(false);

  const API_BASE = 'http://localhost:5000';
  const getToken = () => localStorage.getItem('token');
  
  // Load groups for filter dropdown
  const fetchGroups = useCallback(async () => {
    try {
      const token = getToken();
      const res = await fetch(`${API_BASE}/api/admin/groups`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        setGroups(Array.isArray(data) ? data : []);
      } else {
        console.warn('Failed to fetch groups for filter', res.status);
        setGroups([]);
      }
    } catch (err) {
      console.error('Error fetching groups', err);
    } finally {
      setLoadingGroups(false);
    }
  }, [API_BASE]);

  // Fetch transactions with filters
  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    const token = getToken();
    if (!token) {
      setError('Authentication required');
      setLoading(false);
      return;
    }
    
    try {
      const queryParams = new URLSearchParams();
      if (filters.groupId) queryParams.append('groupId', filters.groupId);
      if (filters.startDate) queryParams.append('startDate', filters.startDate);
      if (filters.endDate) queryParams.append('endDate', filters.endDate);
      if (filters.type) queryParams.append('transactionType', filters.type);
      if (filters.minAmount) queryParams.append('minAmount', filters.minAmount);
      if (filters.maxAmount) queryParams.append('maxAmount', filters.maxAmount);
      if (filters.searchQuery) queryParams.append('q', filters.searchQuery);
      queryParams.append('page', pagination.page);
      queryParams.append('limit', pagination.limit);

      const url = `${API_BASE}/api/admin/group-transactions?${queryParams.toString()}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

      if (!res.ok) {
        if (res.status === 403) {
          setError('Bạn không có quyền xem giao dịch nhóm');
          navigate('/login');
        } else {
          setError(`Error ${res.status}: ${res.statusText}`);
        }
        setLoading(false);
        return;
      }

      const payload = await res.json();
      // Expect backend to return { total, page, limit, pages, data: [ { id,title,group,transactionType,amount,creator,participants,date } ] }
      const items = Array.isArray(payload.data) ? payload.data : (Array.isArray(payload) ? payload : []);
      setTransactions(items);
      setPagination(prev => ({
        ...prev,
        total: Number(payload.total || items.length || 0),
        page: Number(payload.page || prev.page),
        limit: Number(payload.limit || prev.limit),
        pages: Number(payload.pages || Math.ceil((payload.total || items.length || 0) / prev.limit) || 1)
      }));
    } catch (err) {
      console.error('Error fetching transactions', err);
      setError('Đã xảy ra lỗi khi tải dữ liệu');
    } finally {
      setLoading(false);
    }
  }, [API_BASE, filters, pagination.page, pagination.limit, navigate]);

  useEffect(() => {
    // Verify admin role
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('role');
    
    if (!token || role !== 'admin') {
      navigate('/login');
    } else {
      fetchGroups();
      fetchTransactions();
    }
  }, [navigate, fetchGroups, fetchTransactions]);

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const applyFilters = () => {
    setPagination(prev => ({ ...prev, page: 1 })); // Reset to first page
    fetchTransactions();
    setShowFilters(false);
  };

  const resetFilters = () => {
    setFilters({
      groupId: '',
      startDate: '',
      endDate: '',
      type: '',
      minAmount: '',
      maxAmount: '',
      searchQuery: ''
    });
    setPagination(prev => ({ ...prev, page: 1 }));
    fetchTransactions();
    setShowFilters(false);
  };

  const handlePageChange = (newPage) => {
    if (newPage < 1) return;
    const maxPage = Math.max(1, Math.ceil((pagination.total || 0) / pagination.limit || 1));
    if (newPage > maxPage) return;
    setPagination(prev => ({ ...prev, page: newPage }));
    // Immediately fetch new page
    // (ensure fetchTransactions uses updated pagination.page; call after state update)
    // we call fetchTransactions directly with updated page by temporarily building query:
    // setTimeout small to ensure state flush (or simply call fetchTransactions because it reads pagination state in closure)
    setTimeout(() => fetchTransactions(), 0);
  };

  const viewTransactionDetails = (transaction) => {
    setSelectedTransaction(transaction);
    setShowDetails(true);
  };

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(amount);
  };

  // Format date to localized string
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString('vi-VN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Get group name by ID - enhanced to handle various data formats
  const getGroupName = (group) => {
    if (!group) return 'Unknown Group';
    
    // If group is already populated as an object
    if (typeof group === 'object') {
      // Return group name if available
      if (group.name) return group.name;
      
      // Try to get name from _id or id
      const groupId = group._id || group.id;
      if (groupId) {
        // Try to find in groups state
        const foundGroup = groups.find(g => g._id === groupId || g.id === groupId);
        if (foundGroup && foundGroup.name) return foundGroup.name;
      }
    }
    
    // If group is just an ID string
    if (typeof group === 'string') {
      const foundGroup = groups.find(g => g._id === group || g.id === group);
      if (foundGroup && foundGroup.name) return foundGroup.name;
      return `Group ${group.substring(0, 8)}...`;
    }
    
    return 'Unknown Group';
  };

  // Get user name (creator) - ưu tiên creator object / creatorName / createdBy
  const getCreatorDisplayName = (transaction) => {
    if (!transaction) return 'Unknown';
    // 1) normalized backend: transaction.creator { id, name, email }
    if (transaction.creator && typeof transaction.creator === 'object') {
      return transaction.creator.name || transaction.creator.email || 'Unknown';
    }
    // 2) older backend: creatorName string
    if (transaction.creatorName) return transaction.creatorName;
    // 3) legacy: createdBy may be populated object or an id/email string
    if (transaction.createdBy) {
      if (typeof transaction.createdBy === 'object') {
        return transaction.createdBy.name || transaction.createdBy.email || 'Unknown';
      }
      const cb = String(transaction.createdBy);
      if (cb.includes('@')) return cb;
      return cb; // id fallback
    }
    return 'Unknown';
  };

  // Get transaction type (kiểu chia) - ưu tiên transactionType nếu có
  const getTransactionTypeLabel = (transaction) => {
    if (!transaction) return '';
    if (transaction.transactionType) {
      switch (transaction.transactionType) {
        case 'equal_split': return 'Chia đều';
        case 'payer_for_others': return 'Trả giúp';
        case 'percentage_split': return 'Chia phần trăm';
        case 'payer_single': return 'Trả đơn';
        default: return transaction.transactionType;
      }
    }
    // fallback: type (expense/income)
    if (transaction.type === 'expense') return 'Chi tiêu';
    if (transaction.type === 'income') return 'Thu nhập';
    return transaction.type || '';
  };

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <div className="admin-main-content">
        <h2 className="admin-title">Quản lý giao dịch nhóm</h2>
        
        <div className="group-transactions-actions">
          <div className="search-wrapper">
            <input
              type="text"
              placeholder="Tìm kiếm giao dịch..."
              name="searchQuery"
              value={filters.searchQuery}
              onChange={handleFilterChange}
              className="search-input"
            />
            <button 
              className="search-button"
              onClick={applyFilters}
            >
              <i className="fas fa-search"></i>
            </button>
          </div>
          
          <div className="action-buttons">
            <button 
              className="filter-button"
              onClick={() => setShowFilters(!showFilters)}
            >
              <i className="fas fa-filter"></i> Bộ lọc
              {Object.values(filters).some(v => v !== '') && <span className="filter-badge"></span>}
            </button>
            <button 
              className="refresh-button"
              onClick={fetchTransactions}
            >
              <i className="fas fa-sync-alt"></i> Làm mới
            </button>
          </div>
        </div>
        
        {/* Advanced filters */}
        {showFilters && (
          <div className="advanced-filters">
            <div className="filters-header">
              <h3>Bộ lọc nâng cao</h3>
              <button className="close-filters" onClick={() => setShowFilters(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            
            <div className="filters-grid">
              <div className="filter-group">
                <label>Nhóm</label>
                <select
                  name="groupId"
                  value={filters.groupId}
                  onChange={handleFilterChange}
                  disabled={loadingGroups}
                >
                  <option value="">Tất cả nhóm</option>
                  {groups.map(group => (
                    <option key={group._id || group.id} value={group._id || group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="filter-group">
                <label>Loại giao dịch</label>
                <select
                  name="type"
                  value={filters.type}
                  onChange={handleFilterChange}
                >
                  <option value="">Tất cả</option>
                  <option value="expense">Chi tiêu</option>
                  <option value="income">Thu nhập</option>
                </select>
              </div>
              
              <div className="filter-group">
                <label>Từ ngày</label>
                <input
                  type="date"
                  name="startDate"
                  value={filters.startDate}
                  onChange={handleFilterChange}
                />
              </div>
              
              <div className="filter-group">
                <label>Đến ngày</label>
                <input
                  type="date"
                  name="endDate"
                  value={filters.endDate}
                  onChange={handleFilterChange}
                />
              </div>
              
              <div className="filter-group">
                <label>Số tiền từ</label>
                <input
                  type="number"
                  name="minAmount"
                  value={filters.minAmount}
                  onChange={handleFilterChange}
                  placeholder="VNĐ"
                />
              </div>
              
              <div className="filter-group">
                <label>Số tiền đến</label>
                <input
                  type="number"
                  name="maxAmount"
                  value={filters.maxAmount}
                  onChange={handleFilterChange}
                  placeholder="VNĐ"
                />
              </div>
            </div>
            
            <div className="filters-actions">
              <button className="reset-filters" onClick={resetFilters}>
                <i className="fas fa-undo"></i> Đặt lại
              </button>
              <button className="apply-filters" onClick={applyFilters}>
                <i className="fas fa-check"></i> Áp dụng
              </button>
            </div>
          </div>
        )}
        
        {/* Main content - Transaction table */}
        <div className="group-transactions-card">
          {loading ? (
            <div className="loading-container">
              <div className="loading-spinner"></div>
              <p>Đang tải dữ liệu...</p>
            </div>
          ) : error ? (
            <div className="error-container">
              <i className="fas fa-exclamation-triangle"></i>
              <p>{error}</p>
              <button className="retry-button" onClick={fetchTransactions}>
                <i className="fas fa-redo"></i> Thử lại
              </button>
            </div>
          ) : transactions.length === 0 ? (
            <div className="empty-container">
              <i className="fas fa-search"></i>
              <p>Không tìm thấy giao dịch nào</p>
              <button className="reset-button" onClick={resetFilters}>
                Xóa bộ lọc
              </button>
            </div>
          ) : (
            <div className="transactions-table-wrapper">
              <table className="transactions-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Nhóm</th>
                    <th>Nội dung</th>
                    <th>Kiểu giao dịch</th>
                    <th>Số tiền</th>
                    <th>Người tạo</th>
                    <th>Số tham gia</th>
                    <th>Ngày</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map(transaction => (
                    <tr key={transaction._id || transaction.id}>
                      <td className="tx-id">
                        {String(transaction._id || transaction.id).substring(0, 8)}...
                      </td>
                      <td className="tx-group">
                        {getGroupName(transaction.group)}
                      </td>
                      <td className="tx-title">
                        {transaction.title || transaction.description || 'Không có tiêu đề'}
                      </td>
                      <td className="tx-type">
                        {getTransactionTypeLabel(transaction)}
                      </td>
                      <td className="tx-amount">
                        {formatCurrency(transaction.amount || 0)}
                      </td>
                      <td className="tx-creator">
                        {getCreatorDisplayName(transaction)}
                      </td>
                      <td className="tx-participants-count">
                        {typeof transaction.participantsCount !== 'undefined' ? transaction.participantsCount : (transaction.participants ? transaction.participants.length : 0)}
                      </td>
                      <td className="tx-date">
                        {formatDate(transaction.date || transaction.createdAt)}
                      </td>
                      <td className="tx-actions">
                        <button 
                          className="view-btn"
                          onClick={() => viewTransactionDetails(transaction)}
                          title="Xem chi tiết"
                        >
                          <i className="fas fa-eye"></i>
                        </button>
                        <button 
                          className="edit-btn"
                          title="Sửa giao dịch"
                        >
                          <i className="fas fa-edit"></i>
                        </button>
                        <button 
                          className="delete-btn"
                          title="Xóa giao dịch"
                        >
                          <i className="fas fa-trash-alt"></i>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          
          {/* Pagination */}
          {!loading && !error && transactions.length > 0 && (
            <div className="pagination">
              <button 
                className="pagination-button"
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={pagination.page === 1}
              >
                <i className="fas fa-chevron-left"></i>
              </button>
              
              <div className="pagination-info">
                Trang {pagination.page} / {Math.ceil(pagination.total / pagination.limit) || 1}
              </div>
              
              <button 
                className="pagination-button"
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={pagination.page >= Math.ceil(pagination.total / pagination.limit)}
              >
                <i className="fas fa-chevron-right"></i>
              </button>
            </div>
          )}
        </div>
      </div>
      
      {/* Transaction Details Modal */}
      {showDetails && selectedTransaction && (
        <div className="modal-overlay">
          <div className="transaction-details-modal">
            <div className="modal-header">
              <h3>Chi tiết giao dịch</h3>
              <button className="close-modal" onClick={() => setShowDetails(false)}><i className="fas fa-times"></i></button>
            </div>
            <div className="modal-body">
              <div className="detail-header">
                <div className={`transaction-badge ${selectedTransaction.transactionType || ''}`}>
                  {getTransactionTypeLabel(selectedTransaction)}
                </div>
                <div className="transaction-amount">{formatCurrency(selectedTransaction.amount || 0)}</div>
              </div>

              <div className="detail-content">
                <div className="detail-group">
                  <div className="detail-label">Nhóm</div>
                  <div className="detail-value">{selectedTransaction.group ? selectedTransaction.group.name : getGroupName(selectedTransaction.group)}</div>
                </div>

                <div className="detail-group">
                  <div className="detail-label">Tiêu đề</div>
                  <div className="detail-value">{selectedTransaction.title || selectedTransaction.description || 'Không có tiêu đề'}</div>
                </div>

                <div className="detail-group">
                  <div className="detail-label">Người tạo</div>
                  <div className="detail-value">{(selectedTransaction.creator && (selectedTransaction.creator.name || selectedTransaction.creator.email)) || ''}</div>
                </div>

                <div className="detail-group">
                  <div className="detail-label">Người tham gia</div>
                  <div className="detail-value">
                    {Array.isArray(selectedTransaction.allParticipants) && selectedTransaction.allParticipants.length > 0 ? (
                      <ul style={{ margin: 0, paddingLeft: 18 }}>
                        {selectedTransaction.allParticipants.map((p, i) => (
                          <li key={i} style={{ marginBottom: 6 }}>
                            <strong>{p.name || p.email || p.id || 'Unknown'}</strong>
                            {' — '}
                            {p.shareAmount ? formatCurrency(p.shareAmount) : ''}
                            {p.percentage ? ` (${p.percentage}%)` : ''}
                            {p.isCreator ? ' • Người tạo' : (p.settled ? ' • Đã thanh toán' : '')}
                          </li>
                        ))}
                      </ul>
                    ) : Array.isArray(selectedTransaction.participants) && selectedTransaction.participants.length > 0 ? (
                      <ul style={{ margin: 0, paddingLeft: 18 }}>
                        {selectedTransaction.participants.map((p, i) => (
                          <li key={i} style={{ marginBottom: 6 }}>
                            <strong>{p.name || p.email || p.id || 'Unknown'}</strong>
                            {' — '}
                            {formatCurrency(p.shareAmount || 0)}
                            {p.percentage ? ` (${p.percentage}%)` : ''}
                            {p.settled ? ' • Đã thanh toán' : ''}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div>Không có người tham gia</div>
                    )}
                  </div>
                </div>

                <div className="detail-group">
                  <div className="detail-label">Danh mục</div>
                  <div className="detail-value">
                    {selectedTransaction.raw && selectedTransaction.raw.category ? (typeof selectedTransaction.raw.category === 'object' ? selectedTransaction.raw.category.name : selectedTransaction.raw.category) : 'Không có danh mục'}
                  </div>
                </div>

                <div className="detail-group">
                  <div className="detail-label">Ngày tạo</div>
                  <div className="detail-value">{formatDate(selectedTransaction.date)}</div>
                </div>

                <div className="detail-group">
                  <div className="detail-label">ID Giao dịch</div>
                  <div className="detail-value id-value">{selectedTransaction.id || selectedTransaction._id}</div>
                </div>
              </div>

              <div className="modal-footer">
                <button className="modal-button secondary" onClick={() => setShowDetails(false)}>Đóng</button>
                <button className="modal-button primary"><i className="fas fa-edit"></i> Chỉnh sửa</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminGroupTransactionsPage;

