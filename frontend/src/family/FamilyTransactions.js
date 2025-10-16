import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
// eslint-disable-next-line no-unused-vars
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
  
  // Thêm state cho danh sách thành viên với số dư
  const [membersBalance, setMembersBalance] = useState([]);
  
  // Thêm state cho thông tin gia đình
  const [familyInfo, setFamilyInfo] = useState(null);
  
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
      
      // Lưu danh sách thành viên với số dư
      if (data.memberBalances) {
        setMembersBalance(data.memberBalances);
      }
    } catch (err) {
      console.error("Error fetching balance:", err);
    } finally {
      setLoadingBalance(false);
    }
  }, [token, selectedFamilyId, API_BASE]);

  // Lấy thông tin gia đình từ API
  const fetchFamilyInfo = useCallback(async () => {
    if (!token || !selectedFamilyId) return;
    try {
      const res = await fetch(`${API_BASE}/api/family/${selectedFamilyId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!res.ok) {
        console.error("Error fetching family info");
        return;
      }
      
      const data = await res.json();
      setFamilyInfo(data);
    } catch (err) {
      console.error("Error fetching family info:", err);
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
    fetchFamilyInfo(); // Thêm fetch family info
  }, [navigate, fetchCategories, fetchTransactions, fetchBalance, fetchFamilyInfo, getCurrentUser]);

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
        // Cải thiện kiểm tra số dư cá nhân
        const currentBalance = getCurrentUserBalance();
        if (currentBalance < amount) {
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
    
    // Chỉ kiểm tra số dư nếu là giao dịch chi tiêu và số tiền tăng
    const oldAmount = editingTransaction.amount;
    const newAmount = Number(editFormData.amount);
    const amountDifference = newAmount - oldAmount;
    
    // Chỉ kiểm tra số dư nếu là giao dịch chi tiêu VÀ số tiền mới lớn hơn số tiền cũ
    if (editFormData.type === 'expense' && amountDifference > 0) {
      if (editFormData.transactionScope === 'family') {
        if (familyBalance && familyBalance.familyBalance < amountDifference) {
          showNotification(`Số dư gia đình không đủ để tăng số tiền thêm ${formatCurrency(amountDifference)}. Hiện tại: ${formatCurrency(familyBalance.familyBalance)}`, 'error');
          return;
        }
      } else {
        // Tìm số dư cá nhân bằng cả ID và email
        const memberBalance = familyBalance?.memberBalances?.find(m => 
          (m.userId && String(m.userId) === String(currentUser.id)) || 
          (m.userEmail && m.userEmail.toLowerCase() === currentUser.email.toLowerCase())
        );
        
        // Chỉ cần đủ tiền cho phần chênh lệch tăng thêm
        if (!memberBalance || memberBalance.balance < amountDifference) {
          const currentBalance = memberBalance ? memberBalance.balance : 0;
          showNotification(`Số dư cá nhân không đủ để tăng số tiền thêm ${formatCurrency(amountDifference)}. Hiện tại: ${formatCurrency(currentBalance)}`, 'error');
          return;
        }
      }
    }
    
    setUpdating(true);
    try {
      const payload = {
        ...editFormData,
        amount: newAmount
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
    // Lọc danh mục theo loại giao dịch và chỉ lấy danh mục của system và admin
    return categories.filter(cat => 
      cat.type === type && 
      (cat.createdBy === 'system' || cat.createdBy === 'admin')
    );
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
    
    // Cải thiện việc tìm kiếm - kiểm tra cả ID và email
    const memberBalance = familyBalance.memberBalances.find(m => 
      (m.userId && String(m.userId) === String(currentUser.id)) || 
      (m.userEmail && m.userEmail.toLowerCase() === currentUser.email.toLowerCase())
    );
    
    console.log("Current User ID:", currentUser.id);
    console.log("Current User Email:", currentUser.email);
    console.log("Available Member Balances:", familyBalance.memberBalances);
    
    return memberBalance ? memberBalance.balance : 0;
  };

  // Thêm hàm kiểm tra owner
  const isOwner = useCallback(() => {
    if (!currentUser || !familyInfo) return false;
    
    // So sánh ID owner với ID người dùng hiện tại
    const ownerId = familyInfo.owner && (familyInfo.owner._id || familyInfo.owner.id || familyInfo.owner);
    return String(ownerId) === String(currentUser.id);
  }, [currentUser, familyInfo]);

  // Thêm state để quản lý chi tiết thành viên và giao dịch của thành viên
  const [selectedMember, setSelectedMember] = useState(null);
  const [memberTransactions, setMemberTransactions] = useState([]);
  const [loadingMemberTransactions, setLoadingMemberTransactions] = useState(false);
  const [showMemberDetail, setShowMemberDetail] = useState(false);

  // Thêm hàm lấy thông tin giao dịch của thành viên
  const fetchMemberTransactions = async (memberId, memberEmail) => {
    if (!token || !selectedFamilyId || (!memberId && !memberEmail)) return;
    
    setLoadingMemberTransactions(true);
    try {
      // Xây dựng query params
      const params = new URLSearchParams();
      params.append('limit', '10'); // Giới hạn số lượng giao dịch
    
      // Đảm bảo memberId là string
      const userIdStr = memberId && typeof memberId === 'object' ? (memberId._id || memberId.id || memberId) : memberId;
      if (userIdStr) params.append('userId', userIdStr);
      if (memberEmail) params.append('userEmail', memberEmail);
      params.append('transactionScope', 'personal');
    
      const res = await fetch(`${API_BASE}/api/family/${selectedFamilyId}/member-transactions?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!res.ok) {
        throw new Error('Không thể tải giao dịch của thành viên');
      }
      
      const data = await res.json();
      setMemberTransactions(data.transactions || []);
    } catch (err) {
      console.error("Error fetching member transactions:", err);
      setMemberTransactions([]);
    } finally {
      setLoadingMemberTransactions(false);
    }
  };

  // Thêm hàm xử lý khi chọn xem chi tiết một thành viên
  const handleViewMemberDetail = (member) => {
    setSelectedMember(member);
    // Đảm bảo truyền memberId dưới dạng string
    const memberId = member.userId && typeof member.userId === 'object' ? (member.userId._id || member.userId.id || member.userId) : member.userId;
    fetchMemberTransactions(memberId, member.userEmail);
    setShowMemberDetail(true);
  };

  // Hàm lấy vai trò của thành viên từ familyInfo
  const getMemberRole = (memberId, memberEmail) => {
    if (!familyInfo || !familyInfo.members) return 'Thành viên';
    
    const member = familyInfo.members.find(m => {
      // Xử lý trường hợp m.user là object hoặc string
      const userId = m.user && typeof m.user === 'object' ? (m.user._id || m.user.id || m.user) : m.user;
      const matchesUserId = userId && String(userId) === String(memberId);
      
      // Xử lý email
      const matchesEmail = m.email && memberEmail && m.email.toLowerCase() === memberEmail.toLowerCase();
      
      return matchesUserId || matchesEmail;
    });
    
    if (!member) return 'Thành viên';
    
    // Trả về vai trò từ database, nếu không có thì mặc định là 'Thành viên'
    return member.familyRole || 'Thành viên';
  };

  // Thêm state cho sidebar toggle
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="family-page">
      {/* Animated background elements */}
      <div className="ft-bg-shapes">
        <div className="ft-bg-shape"></div>
        <div className="ft-bg-shape"></div>
        <div className="ft-bg-shape"></div>
      </div>
      
      {/* Floating particles */}
      <div className="ft-particle"></div>
      <div className="ft-particle"></div>
      <div className="ft-particle"></div>
      <div className="ft-particle"></div>
      <div className="ft-particle"></div>
      
      <FamilySidebar active="transactions" collapsed={sidebarCollapsed} />
      
      <main className={`family-main ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        {/* Toggle sidebar button */}
        <button 
          className="sidebar-toggle-btn"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          title={sidebarCollapsed ? 'Mở sidebar' : 'Thu gọn sidebar'}
        >
          <i className={`fas ${sidebarCollapsed ? 'fa-bars' : 'fa-times'}`}></i>
        </button>
        
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
                                {transaction.creatorRole && (
                                  <span className="ft-creator-role">({transaction.creatorRole})</span>
                                )}
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
        
        {/* Thêm section hiển thị số dư thành viên cho owner */}
        {isOwner() && (
          <div className="ft-members-balance-section">
            <div className="ft-section-header">
              <h2><i className="fas fa-users-cog"></i> Quản lý số dư thành viên</h2>
              <p>Xem và quản lý số dư của tất cả thành viên trong gia đình</p>
            </div>
            
            <div className="ft-members-balance-grid">
              {loadingBalance ? (
                <div className="ft-loading">
                  <div className="ft-loading-spinner"></div>
                  <p>Đang tải số dư thành viên...</p>
                </div>
              ) : membersBalance.filter(member => String(member.userId) !== String(currentUser.id)).length === 0 ? (
                <div className="ft-empty-state">
                  <i className="fas fa-users-slash"></i>
                  <h3>Chưa có thành viên nào</h3>
                  <p>Gia đình chưa có thành viên nào có số dư</p>
                </div>
              ) : (
                membersBalance.filter(member => String(member.userId) !== String(currentUser.id)).map(member => (
                  <div key={member.userId || member.userEmail} className="ft-member-balance-card">
                    <div className="ft-member-info">
                      <div className="ft-member-avatar">
                        {member.userName ? member.userName.charAt(0).toUpperCase() : 'U'}
                      </div>
                      <div className="ft-member-details">
                        <div className="ft-member-name">
                          {member.userName || 'Thành viên'}
                          <span className="ft-member-role">{getMemberRole(member.userId, member.userEmail)}</span>
                        </div>
                        <div className="ft-member-email">{member.userEmail || ''}</div>
                      </div>
                    </div>
                    <div className="ft-member-balance">
                      <div className="ft-balance-label">Số dư cá nhân</div>
                      <div className={`ft-balance-amount ${member.balance >= 0 ? 'positive' : 'negative'}`}>
                        {formatCurrency(member.balance)}
                      </div>
                      <button 
                        className="ft-view-member-btn"
                        onClick={() => handleViewMemberDetail(member)}
                      >
                        <i className="fas fa-eye"></i> Xem chi tiết
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Modal chi tiết thành viên */}
        {showMemberDetail && selectedMember && (
          <div className="ft-modal-overlay">
            <div className="ft-modal ft-member-modal">
              <div className="ft-modal-header">
                <h3>
                  <i className="fas fa-user-circle"></i> 
                  {selectedMember.userName || 'Thành viên'}
                </h3>
                <button 
                  className="ft-modal-close"
                  onClick={() => setShowMemberDetail(false)}
                >
                  &times;
                </button>
              </div>
              
              <div className="ft-member-detail">
                <div className="ft-member-profile">
                  <div className="ft-member-avatar-large">
                    {selectedMember.userName ? selectedMember.userName.charAt(0).toUpperCase() : 'U'}
                  </div>
                  <div className="ft-member-info-detail">
                    <h4>{selectedMember.userName || 'Thành viên'}</h4>
                    <div className="ft-member-meta">
                      <div className="ft-member-meta-item">
                        <i className="fas fa-envelope"></i> {selectedMember.userEmail || 'Không có email'}
                      </div>
                      <div className="ft-member-meta-item">
                        <i className="fas fa-user-tag"></i> {getMemberRole(selectedMember.userId, selectedMember.userEmail)}
                      </div>
                    </div>
                    
                    <div className="ft-member-balance-detail">
                      <div className="ft-balance-row">
                        <div className="ft-balance-label">Số dư cá nhân:</div>
                        <div className={`ft-balance-value ${selectedMember.balance >= 0 ? 'positive' : 'negative'}`}>
                          {formatCurrency(selectedMember.balance)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="ft-member-transactions">
                  <h4>
                    <i className="fas fa-exchange-alt"></i> Giao dịch gần đây
                  </h4>
                  
                  {loadingMemberTransactions ? (
                    <div className="ft-loading-inline">
                      <div className="ft-loading-spinner"></div>
                      <p>Đang tải giao dịch...</p>
                    </div>
                  ) : memberTransactions.length === 0 ? (
                    <div className="ft-empty-state-small">
                      <i className="fas fa-receipt"></i>
                      <p>Chưa có giao dịch nào</p>
                    </div>
                  ) : (
                    <div className="ft-member-tx-list">
                      {memberTransactions.map(tx => {
                        const category = getCategoryInfo(tx.category);
                        return (
                          <div key={tx._id} className="ft-member-tx-item">
                            <div className="ft-member-tx-icon">
                              <i className={`fas ${tx.type === 'expense' ? 'fa-arrow-up' : 'fa-arrow-down'}`}></i>
                            </div>
                            <div className="ft-member-tx-content">
                              <div className="ft-member-tx-header">
                                <div className="ft-member-tx-title">{tx.description || 'Giao dịch'}</div>
                                <div className={`ft-member-tx-amount ${tx.type === 'expense' ? 'expense' : 'income'}`}>
                                  {tx.type === 'expense' ? '-' : '+'}{formatCurrency(tx.amount)}
                                </div>
                              </div>
                              <div className="ft-member-tx-meta">
                                <span className="ft-category-badge">
                                  {category.icon} {category.name}
                                </span>
                                <span className="ft-date">
                                  <i className="fas fa-calendar-alt"></i> {formatDate(tx.date || tx.createdAt)}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                
                <div className="ft-modal-footer">
                  <button 
                    className="ft-btn secondary"
                    onClick={() => setShowMemberDetail(false)}
                  >
                    <i className="fas fa-times"></i> Đóng
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
