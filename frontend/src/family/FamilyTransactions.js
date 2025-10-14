import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import FamilySidebar from './FamilySidebar';
import './FamilyTransactions.css';
import { showNotification } from '../utils/notify';

export default function FamilyTransactions() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('expense'); // 'income' or 'expense'
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [categories, setCategories] = useState([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  
  // Form state
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    type: 'expense', // 'income' or 'expense'
    amount: '',
    category: '',
    description: '',
    transactionScope: 'personal', // 'personal' or 'family'
    date: new Date().toISOString().split('T')[0]
  });
  const [saving, setSaving] = useState(false);
  
  // Edit state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [editFormData, setEditFormData] = useState({
    type: '',
    amount: '',
    category: '',
    description: '',
    transactionScope: '',
    date: ''
  });
  const [updating, setUpdating] = useState(false);
  
  // Delete state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingTransaction, setDeletingTransaction] = useState(null);
  const [deleting, setDeleting] = useState(false);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [pageSize] = useState(10);
  
  const API_BASE = 'http://localhost:5000';
  const token = localStorage.getItem('token');
  const selectedFamilyId = localStorage.getItem('selectedFamilyId');

  // Hàm lấy thông tin người dùng hiện tại từ token
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

  // Thêm state cho currentUser
  const [currentUser, setCurrentUser] = useState(null);

  // Thêm state cho số dư
  const [familyBalance, setFamilyBalance] = useState(null);
  const [loadingBalance, setLoadingBalance] = useState(false);
  
  // Lấy danh mục từ API
  const fetchCategories = useCallback(async () => {
    if (!token) return;
    setLoadingCategories(true);
    try {
      const res = await fetch(`${API_BASE}/api/categories`, { 
        headers: { Authorization: `Bearer ${token}` } 
      });
      if (!res.ok) return;
      const data = await res.json();
      setCategories(data);
    } catch (err) {
      console.error("Error fetching categories:", err);
    } finally {
      setLoadingCategories(false);
    }
  }, [token, API_BASE]);

  // Lấy giao dịch từ API với API mới
  const fetchTransactions = useCallback(async () => {
    if (!token || !selectedFamilyId) return;
    setLoading(true);
    setError('');
    try {
      // Sử dụng API mới với phân trang và filter theo loại
      const res = await fetch(`${API_BASE}/api/family/${selectedFamilyId}/transactions?type=${activeTab}&page=${currentPage}&limit=${pageSize}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!res.ok) {
        throw new Error('Không thể tải giao dịch');
      }
      
      const data = await res.json();
      
      // Xử lý dữ liệu phân trang từ API mới
      if (data && data.transactions) {
        setTransactions(data.transactions);
        if (data.pagination) {
          setTotalPages(data.pagination.totalPages || 1);
          setTotalItems(data.pagination.totalItems || 0);
        }
      } else {
        setTransactions(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error("Error fetching transactions:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token, selectedFamilyId, API_BASE, activeTab, currentPage, pageSize]);

  // Lấy số dư từ API
  const fetchBalance = useCallback(async () => {
    if (!token || !selectedFamilyId) return;
    setLoadingBalance(true);
    try {
      const res = await fetch(`${API_BASE}/api/family/${selectedFamilyId}/balance`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!res.ok) {
        throw new Error('Không thể tải số dư');
      }
      
      const data = await res.json();
      setFamilyBalance(data);
    } catch (err) {
      console.error("Error fetching balance:", err);
    } finally {
      setLoadingBalance(false);
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
    
    // Set current user
    setCurrentUser(getCurrentUser());
    
    fetchCategories();
    fetchTransactions();
    fetchBalance(); // Thêm fetch balance
  }, [navigate, fetchCategories, fetchTransactions, fetchBalance, getCurrentUser]);

  // Cập nhật tab và reset trang
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setCurrentPage(1); // Reset về trang đầu tiên khi chuyển tab
    setFormData(prev => ({ ...prev, type: tab }));
  };

  // Tạo giao dịch mới với API mới và cập nhật số dư
  const handleCreateTransaction = async (e) => {
    e.preventDefault();
    
    if (!formData.amount || Number(formData.amount) <= 0) {
      showNotification('Vui lòng nhập số tiền hợp lệ', 'error');
      return;
    }
    
    if (!formData.category) {
      showNotification('Vui lòng chọn danh mục', 'error');
      return;
    }
    
    // Kiểm tra số dư nếu là chi tiêu
    if (activeTab === 'expense') {
      const amount = Number(formData.amount);
      if (formData.transactionScope === 'family') {
        if (familyBalance && familyBalance.familyBalance < amount) {
          showNotification(`Số dư gia đình không đủ. Hiện tại: ${formatCurrency(familyBalance.familyBalance)}`, 'error');
          return;
        }
      } else {
        const memberBalance = familyBalance?.memberBalances?.find(m => 
          currentUser && m.userId === currentUser.id
        );
        if (!memberBalance || memberBalance.balance < amount) {
          const currentBalance = memberBalance ? memberBalance.balance : 0;
          showNotification(`Số dư cá nhân không đủ. Hiện tại: ${formatCurrency(currentBalance)}`, 'error');
          return;
        }
      }
    }
    
    setSaving(true);
    try {
      const payload = {
        ...formData,
        amount: Number(formData.amount),
        familyId: selectedFamilyId,
        type: activeTab
      };
      
      const res = await fetch(`${API_BASE}/api/family/transactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Không thể tạo giao dịch');
      }
      
      showNotification('Giao dịch đã được tạo thành công', 'success');
      
      // Reset form
      setFormData({
        type: activeTab,
        amount: '',
        category: '',
        description: '',
        transactionScope: 'personal',
        date: new Date().toISOString().split('T')[0]
      });
      setShowForm(false);
      
      // Refresh transactions và số dư
      fetchTransactions();
      fetchBalance();
    } catch (err) {
      console.error("Error creating transaction:", err);
      showNotification(err.message || 'Đã xảy ra lỗi khi tạo giao dịch', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Mở modal chỉnh sửa giao dịch
  const handleOpenEditModal = (transaction) => {
    setEditingTransaction(transaction);
    setEditFormData({
      type: transaction.type || activeTab,
      amount: transaction.amount || '',
      category: transaction.category?._id || transaction.category || '',
      description: transaction.description || '',
      transactionScope: transaction.transactionScope || 'personal',
      date: transaction.date ? new Date(transaction.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
    });
    setShowEditModal(true);
  };

  // Cập nhật giao dịch với API mới và cập nhật số dư
  const handleUpdateTransaction = async (e) => {
    e.preventDefault();
    
    if (!editingTransaction?._id) {
      showNotification('Không tìm thấy thông tin giao dịch cần cập nhật', 'error');
      return;
    }
    
    if (!editFormData.amount || Number(editFormData.amount) <= 0) {
      showNotification('Vui lòng nhập số tiền hợp lệ', 'error');
      return;
    }
    
    // Kiểm tra số dư nếu là chi tiêu
    if (editFormData.type === 'expense') {
      const amount = Number(editFormData.amount);
      if (editFormData.transactionScope === 'family') {
        if (familyBalance && familyBalance.familyBalance < amount) {
          showNotification(`Số dư gia đình không đủ. Hiện tại: ${formatCurrency(familyBalance.familyBalance)}`, 'error');
          return;
        }
      } else {
        const memberBalance = familyBalance?.memberBalances?.find(m => 
          currentUser && m.userId === currentUser.id
        );
        if (!memberBalance || memberBalance.balance < amount) {
          const currentBalance = memberBalance ? memberBalance.balance : 0;
          showNotification(`Số dư cá nhân không đủ. Hiện tại: ${formatCurrency(currentBalance)}`, 'error');
          return;
        }
      }
    }
    
    setUpdating(true);
    try {
      const payload = {
        ...editFormData,
        amount: Number(editFormData.amount)
      };
      
      const res = await fetch(`${API_BASE}/api/family/transactions/${editingTransaction._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Không thể cập nhật giao dịch');
      }
      
      showNotification('Giao dịch đã được cập nhật thành công', 'success');
      setShowEditModal(false);
      
      // Refresh transactions và số dư
      fetchTransactions();
      fetchBalance();
    } catch (err) {
      console.error("Error updating transaction:", err);
      showNotification(err.message || 'Đã xảy ra lỗi khi cập nhật giao dịch', 'error');
    } finally {
      setUpdating(false);
    }
  };

  // Mở modal xác nhận xóa giao dịch
  const handleOpenDeleteModal = (transaction) => {
    setDeletingTransaction(transaction);
    setShowDeleteModal(true);
  };

  // Xóa giao dịch với API mới và cập nhật số dư
  const handleDeleteTransaction = async () => {
    if (!deletingTransaction?._id) {
      showNotification('Không tìm thấy thông tin giao dịch cần xóa', 'error');
      return;
    }
    
    setDeleting(true);
    try {
      const res = await fetch(`${API_BASE}/api/family/transactions/${deletingTransaction._id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Không thể xóa giao dịch');
      }
      
      showNotification('Giao dịch đã được xóa thành công', 'success');
      setShowDeleteModal(false);
      
      // Refresh transactions và số dư
      fetchTransactions();
      fetchBalance();
    } catch (err) {
      console.error("Error deleting transaction:", err);
      showNotification(err.message || 'Đã xảy ra lỗi khi xóa giao dịch', 'error');
    } finally {
      setDeleting(false);
    }
  };

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };

  // Get category info
  const getCategoryInfo = (categoryId) => {
    if (typeof categoryId === 'object' && categoryId !== null) {
      return { 
        name: categoryId.name || 'Không có tên', 
        icon: categoryId.icon || '📝' 
      };
    }
    const cat = categories.find(c => c._id === categoryId);
    return cat || { name: 'Không có', icon: '📝' };
  };

  // Get filtered categories based on transaction type
  const getFilteredCategories = (type = activeTab) => {
    return categories.filter(cat => cat.type === type);
  };

  // Xử lý chuyển trang
  const handlePageChange = (page) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
  };

  // Format date
  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    
    return date.toLocaleDateString('vi-VN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // Tìm số dư cá nhân của người dùng hiện tại
  const getCurrentUserBalance = () => {
    if (!familyBalance || !currentUser) return 0;
    
    const memberBalance = familyBalance.memberBalances.find(m => 
      m.userId === currentUser.id || (m.userEmail && m.userEmail === currentUser.email)
    );
    
    return memberBalance ? memberBalance.balance : 0;
  };

  return (
    <div className="family-page">
      <FamilySidebar active="transactions" />
      
      <main className="family-main">
        <header className="ft-header">
          <h1>Giao dịch gia đình</h1>
          <p>Quản lý thu nhập và chi tiêu của gia đình</p>
          
          <div className="ft-actions">
            <button 
              className="ft-btn primary"
              onClick={() => setShowForm(true)}
            >
              <i className="fas fa-plus"></i> Thêm giao dịch
            </button>
          </div>
        </header>

        {/* Thêm card hiển thị số dư */}
        <div className="ft-balance-cards">
          <div className="ft-balance-card family">
            <div className="ft-balance-icon">
              <i className="fas fa-home"></i>
            </div>
            <div className="ft-balance-info">
              <div className="ft-balance-label">Số dư gia đình</div>
              <div className="ft-balance-amount">
                {loadingBalance ? (
                  <div className="ft-loading-spinner small"></div>
                ) : (
                  formatCurrency(familyBalance?.familyBalance || 0)
                )}
              </div>
            </div>
          </div>
          
          <div className="ft-balance-card personal">
            <div className="ft-balance-icon">
              <i className="fas fa-user"></i>
            </div>
            <div className="ft-balance-info">
              <div className="ft-balance-label">Số dư cá nhân</div>
              <div className="ft-balance-amount">
                {loadingBalance ? (
                  <div className="ft-loading-spinner small"></div>
                ) : (
                  formatCurrency(getCurrentUserBalance())
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Transaction Type Tabs */}
        <div className="ft-tabs">
          <button 
            className={`ft-tab ${activeTab === 'expense' ? 'active' : ''}`}
            onClick={() => handleTabChange('expense')}
          >
            <i className="fas fa-arrow-up"></i> Chi tiêu
          </button>
          <button 
            className={`ft-tab ${activeTab === 'income' ? 'active' : ''}`}
            onClick={() => handleTabChange('income')}
          >
            <i className="fas fa-arrow-down"></i> Thu nhập
          </button>
        </div>

        {/* Transaction Form Modal */}
        {showForm && (
          <div className="ft-modal-overlay">
            <div className="ft-modal">
              <div className="ft-modal-header">
                <h3>Thêm giao dịch {activeTab === 'expense' ? 'chi tiêu' : 'thu nhập'}</h3>
                <button 
                  className="ft-modal-close"
                  onClick={() => setShowForm(false)}
                >
                  &times;
                </button>
              </div>
              
              <form onSubmit={handleCreateTransaction} className="ft-form">
                <div className="ft-form-row">
                  <div className="ft-form-group">
                    <label>Số tiền *</label>
                    <input
                      type="number"
                      value={formData.amount}
                      onChange={(e) => setFormData({...formData, amount: e.target.value})}
                      placeholder="Nhập số tiền"
                      required
                      min="0"
                      step="1000"
                    />
                  </div>
                  
                  <div className="ft-form-group">
                    <label>Danh mục *</label>
                    <select
                      value={formData.category}
                      onChange={(e) => setFormData({...formData, category: e.target.value})}
                      required
                      disabled={loadingCategories}
                    >
                      <option value="">-- Chọn danh mục --</option>
                      {getFilteredCategories().map(cat => (
                        <option key={cat._id} value={cat._id}>
                          {cat.icon} {cat.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                
                <div className="ft-form-row">
                  <div className="ft-form-group">
                    <label>Ngày *</label>
                    <input
                      type="date"
                      value={formData.date}
                      onChange={(e) => setFormData({...formData, date: e.target.value})}
                      required
                    />
                  </div>
                  
                  <div className="ft-form-group">
                    <label>Loại giao dịch</label>
                    <select
                      value={formData.transactionScope}
                      onChange={(e) => setFormData({...formData, transactionScope: e.target.value})}
                    >
                      <option value="personal">Cá nhân</option>
                      <option value="family">Gia đình</option>
                    </select>
                  </div>
                </div>
                
                <div className="ft-form-group">
                  <label>Mô tả</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    placeholder="Nhập mô tả chi tiết (tùy chọn)"
                    rows={3}
                  />
                </div>
                
                <div className="ft-form-actions">
                  <button 
                    type="button" 
                    className="ft-btn secondary"
                    onClick={() => setShowForm(false)}
                    disabled={saving}
                  >
                    Hủy
                  </button>
                  <button 
                    type="submit" 
                    className="ft-btn primary"
                    disabled={saving}
                  >
                    {saving ? (
                      <>
                        <i className="fas fa-spinner fa-spin"></i> Đang lưu...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-save"></i> Tạo giao dịch
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Transaction Modal */}
        {showEditModal && (
          <div className="ft-modal-overlay">
            <div className="ft-modal">
              <div className="ft-modal-header">
                <h3>Chỉnh sửa giao dịch</h3>
                <button 
                  className="ft-modal-close"
                  onClick={() => setShowEditModal(false)}
                >
                  &times;
                </button>
              </div>
              
              <form onSubmit={handleUpdateTransaction} className="ft-form">
                <div className="ft-form-row">
                  <div className="ft-form-group">
                    <label>Số tiền *</label>
                    <input
                      type="number"
                      value={editFormData.amount}
                      onChange={(e) => setEditFormData({...editFormData, amount: e.target.value})}
                      placeholder="Nhập số tiền"
                      required
                      min="0"
                      step="1000"
                    />
                  </div>
                  
                  <div className="ft-form-group">
                    <label>Danh mục *</label>
                    <select
                      value={editFormData.category}
                      onChange={(e) => setEditFormData({...editFormData, category: e.target.value})}
                      required
                      disabled={loadingCategories}
                    >
                      <option value="">-- Chọn danh mục --</option>
                      {getFilteredCategories(editFormData.type).map(cat => (
                        <option key={cat._id} value={cat._id}>
                          {cat.icon} {cat.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                
                <div className="ft-form-row">
                  <div className="ft-form-group">
                    <label>Ngày *</label>
                    <input
                      type="date"
                      value={editFormData.date}
                      onChange={(e) => setEditFormData({...editFormData, date: e.target.value})}
                      required
                    />
                  </div>
                  
                  <div className="ft-form-group">
                    <label>Loại giao dịch</label>
                    <select
                      value={editFormData.transactionScope}
                      onChange={(e) => setEditFormData({...editFormData, transactionScope: e.target.value})}
                    >
                      <option value="personal">Cá nhân</option>
                      <option value="family">Gia đình</option>
                    </select>
                  </div>
                </div>
                
                <div className="ft-form-group">
                  <label>Mô tả</label>
                  <textarea
                    value={editFormData.description}
                    onChange={(e) => setEditFormData({...editFormData, description: e.target.value})}
                    placeholder="Nhập mô tả chi tiết (tùy chọn)"
                    rows={3}
                  />
                </div>
                
                <div className="ft-form-actions">
                  <button 
                    type="button" 
                    className="ft-btn secondary"
                    onClick={() => setShowEditModal(false)}
                    disabled={updating}
                  >
                    Hủy
                  </button>
                  <button 
                    type="submit" 
                    className="ft-btn primary"
                    disabled={updating}
                  >
                    {updating ? (
                      <>
                        <i className="fas fa-spinner fa-spin"></i> Đang cập nhật...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-save"></i> Lưu thay đổi
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteModal && (
          <div className="ft-modal-overlay">
            <div className="ft-modal">
              <div className="ft-modal-header">
                <h3>Xác nhận xóa giao dịch</h3>
                <button 
                  className="ft-modal-close"
                  onClick={() => setShowDeleteModal(false)}
                >
                  &times;
                </button>
              </div>
              
              <div className="ft-form">
                <div className="ft-delete-confirmation">
                  <i className="fas fa-exclamation-triangle"></i>
                  <p>Bạn có chắc chắn muốn xóa giao dịch này?</p>
                  <div className="ft-transaction-preview">
                    <div className="ft-preview-label">Mô tả:</div>
                    <div className="ft-preview-value">{deletingTransaction?.description || 'Giao dịch không có mô tả'}</div>
                    <div className="ft-preview-label">Số tiền:</div>
                    <div className="ft-preview-value">{formatCurrency(deletingTransaction?.amount || 0)}</div>
                    <div className="ft-preview-label">Ngày:</div>
                    <div className="ft-preview-value">{formatDate(deletingTransaction?.date || deletingTransaction?.createdAt)}</div>
                  </div>
                  <p className="ft-delete-warning">Lưu ý: Hành động này không thể hoàn tác!</p>
                </div>
                
                <div className="ft-form-actions">
                  <button 
                    type="button" 
                    className="ft-btn secondary"
                    onClick={() => setShowDeleteModal(false)}
                    disabled={deleting}
                  >
                    Hủy
                  </button>
                  <button 
                    type="button" 
                    className="ft-btn danger"
                    onClick={handleDeleteTransaction}
                    disabled={deleting}
                  >
                    {deleting ? (
                      <>
                        <i className="fas fa-spinner fa-spin"></i> Đang xóa...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-trash-alt"></i> Xác nhận xóa
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Transactions List */}
        <div className="ft-content">
          {loading ? (
            <div className="ft-loading">
              <div className="ft-loading-spinner"></div>
              <p>Đang tải giao dịch...</p>
            </div>
          ) : error ? (
            <div className="ft-error">
              <i className="fas fa-exclamation-triangle"></i>
              <p>{error}</p>
              <button onClick={fetchTransactions} className="ft-retry-btn">
                Thử lại
              </button>
            </div>
          ) : (
            <>
              <div className="ft-transactions-list">
                {transactions.length === 0 ? (
                  <div className="ft-empty-state">
                    <i className={`fas ${activeTab === 'expense' ? 'fa-receipt' : 'fa-money-bill-wave'}`}></i>
                    <h3>Chưa có giao dịch {activeTab === 'expense' ? 'chi tiêu' : 'thu nhập'}</h3>
                    <p>Bắt đầu thêm giao dịch đầu tiên của bạn</p>
                    <button 
                      className="ft-btn primary"
                      onClick={() => setShowForm(true)}
                    >
                      <i className="fas fa-plus"></i> Thêm giao dịch
                    </button>
                  </div>
                ) : (
                  transactions.map(transaction => {
                    const category = getCategoryInfo(transaction.category);
                    return (
                      <div key={transaction._id} className="ft-transaction-item">
                        <div className="ft-transaction-icon">
                          <i className={`fas ${transaction.type === 'expense' ? 'fa-arrow-up' : 'fa-arrow-down'}`}></i>
                        </div>
                        
                        <div className="ft-transaction-content">
                          <div className="ft-transaction-header">
                            <div className="ft-transaction-title">
                              {transaction.description || 'Giao dịch'}
                            </div>
                            <div className={`ft-transaction-amount ${transaction.type === 'expense' ? 'expense' : 'income'}`}>
                              {transaction.type === 'expense' ? '-' : '+'}{formatCurrency(transaction.amount)}
                            </div>
                          </div>
                          
                          <div className="ft-transaction-meta">
                            <span className="ft-category-badge">
                              {category.icon} {category.name}
                            </span>
                            <span className="ft-scope-badge">
                              {transaction.transactionScope === 'family' ? '🏠 Gia đình' : '👤 Cá nhân'}
                            </span>
                            <span className="ft-date">
                              <i className="fas fa-calendar-alt"></i> {formatDate(transaction.date || transaction.createdAt)}
                            </span>
                            {transaction.creatorName && (
                              <span className="ft-creator">
                                <i className="fas fa-user"></i> {transaction.creatorName}
                              </span>
                            )}
                          </div>
                        </div>
                        
                        <div className="ft-transaction-actions">
                          {/* Chỉ hiện nút sửa/xóa nếu người dùng hiện tại là người tạo */}
                          {currentUser && transaction.createdBy && 
                           (transaction.createdBy._id || transaction.createdBy.id || transaction.createdBy) === currentUser.id && (
                            <>
                              <button 
                                className="ft-action-btn edit"
                                onClick={() => handleOpenEditModal(transaction)}
                                title="Chỉnh sửa giao dịch"
                              >
                                <i className="fas fa-edit"></i> Sửa
                              </button>
                              <button 
                                className="ft-action-btn delete"
                                onClick={() => handleOpenDeleteModal(transaction)}
                                title="Xóa giao dịch"
                              >
                                <i className="fas fa-trash"></i> Xóa
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              
              {/* Pagination */}
              {totalPages > 1 && (
                <div className="ft-pagination">
                  <button 
                    className="ft-pagination-btn"
                    onClick={() => handlePageChange(1)}
                    disabled={currentPage === 1}
                  >
                    <i className="fas fa-angle-double-left"></i>
                  </button>
                  <button 
                    className="ft-pagination-btn"
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                  >
                    <i className="fas fa-angle-left"></i>
                  </button>
                  
                  <div className="ft-pagination-info">
                    Trang {currentPage} / {totalPages}
                  </div>
                  
                  <button 
                    className="ft-pagination-btn"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                  >
                    <i className="fas fa-angle-right"></i>
                  </button>
                  <button 
                    className="ft-pagination-btn"
                    onClick={() => handlePageChange(totalPages)}
                    disabled={currentPage === totalPages}
                  >
                    <i className="fas fa-angle-double-right"></i>
                  </button>
                </div>
              )}
              
              {/* Transaction count summary */}
              <div className="ft-summary">
                Hiển thị {transactions.length} trong tổng số {totalItems} giao dịch {activeTab === 'expense' ? 'chi tiêu' : 'thu nhập'}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
