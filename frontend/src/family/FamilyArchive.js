import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import FamilySidebar from './FamilySidebar';
import './FamilyArchive.css';
import { showNotification } from '../utils/notify';

export default function FamilyArchive() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('receipts'); // 'receipts', 'budget-history'
  
  // Archive data states
  const [receiptImages, setReceiptImages] = useState([]);
  const [budgetHistory, setBudgetHistory] = useState([]);
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [pageSize] = useState(20);
  
  // Filter states
  const [filters, setFilters] = useState({
    isVerified: '',
    category: '',
    startDate: '',
    endDate: '',
    minAmount: '',
    maxAmount: ''
  });
  
  // Family info
  const [familyInfo, setFamilyInfo] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [categories, setCategories] = useState([]);
  
  // Sidebar state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  
  // Upload modal states
  const [uploadModal, setUploadModal] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    file: null,
    description: '',
    amount: '',
    date: new Date().toISOString().slice(0, 10),
    category: '',
    linkedTransactionId: ''
  });
  const [uploading, setUploading] = useState(false);
  const [transactions, setTransactions] = useState([]);

  // Thêm state cho modal xem chi tiết ảnh hóa đơn
  const [showReceiptDetailModal, setShowReceiptDetailModal] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [linkedTransaction, setLinkedTransaction] = useState(null);
  const [loadingLinkedTx, setLoadingLinkedTx] = useState(false);

  const API_BASE = 'http://localhost:5000';
  const token = localStorage.getItem('token');
  const selectedFamilyId = localStorage.getItem('selectedFamilyId');

  // Get current user info
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

  // Fetch categories
  const fetchCategories = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/categories`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCategories(data);
      }
    } catch (err) {
      console.error('Error fetching categories:', err);
    }
  }, [token, API_BASE]);

  // Fetch receipt images
  const fetchReceiptImages = useCallback(async () => {
    if (!token || !selectedFamilyId) return;
    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: pageSize.toString()
      });
      
      // Add filters to params
      if (filters.isVerified !== '') params.append('isVerified', filters.isVerified);
      if (filters.category) params.append('category', filters.category);
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      
      const res = await fetch(`${API_BASE}/api/family/${selectedFamilyId}/receipt-images?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        setReceiptImages(data.receiptImages || []);
        if (data.pagination) {
          setTotalPages(data.pagination.totalPages || 1);
          setTotalItems(data.pagination.totalItems || 0);
        }
      } else {
        throw new Error('Không thể tải hình ảnh hóa đơn');
      }
    } catch (err) {
      console.error('Error fetching receipt images:', err);
      setReceiptImages([]);
      setError('Không thể tải hình ảnh hóa đơn');
    }
  }, [token, selectedFamilyId, API_BASE, currentPage, pageSize, filters]);

  // Fetch budget history
  const fetchBudgetHistory = useCallback(async () => {
    if (!token || !selectedFamilyId) return;
    try {
      const res = await fetch(`${API_BASE}/api/family/${selectedFamilyId}/budget-history?limit=50`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        setBudgetHistory(data || []);
      } else {
        setBudgetHistory([]);
      }
    } catch (err) {
      console.error('Error fetching budget history:', err);
      setBudgetHistory([]);
    }
  }, [token, selectedFamilyId, API_BASE]);

  // Search receipt images
  const searchReceiptImages = useCallback(async () => {
    if (!token || !selectedFamilyId) return;
    try {
      const params = new URLSearchParams();
      
      if (filters.minAmount) params.append('minAmount', filters.minAmount);
      if (filters.maxAmount) params.append('maxAmount', filters.maxAmount);
      if (filters.isVerified !== '') params.append('isVerified', filters.isVerified);
      
      const res = await fetch(`${API_BASE}/api/family/${selectedFamilyId}/receipt-images/search?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        setReceiptImages(data.receiptImages || []);
        setTotalItems(data.totalResults || 0);
        setTotalPages(1); // Search không có pagination
      }
    } catch (err) {
      console.error('Error searching receipt images:', err);
      setReceiptImages([]);
    }
  }, [token, selectedFamilyId, API_BASE, filters]);

  // Fetch transactions for linking
  const fetchTransactions = useCallback(async () => {
    if (!token || !selectedFamilyId) return;
    try {
      // Thêm filter để chỉ lấy giao dịch chi tiêu gia đình, loại trừ hoạt động transfer
      const params = new URLSearchParams({
        limit: '50',
        type: 'expense', // Chỉ lấy giao dịch chi tiêu
        transactionScope: 'family', // Chỉ lấy giao dịch gia đình
        excludeActivities: 'true' // Loại trừ các hoạt động nạp/rút (tag 'transfer')
      });
      
      const res = await fetch(`${API_BASE}/api/family/${selectedFamilyId}/transactions?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTransactions(data.transactions || []);
      }
    } catch (err) {
      console.error('Error fetching transactions:', err);
    }
  }, [token, selectedFamilyId, API_BASE]);

  // Initial load
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
    fetchCategories();
  }, [navigate, getCurrentUser, fetchFamilyInfo, fetchCategories]);

  // Load data when tab changes
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError('');
      try {
        if (activeTab === 'receipts') {
          await fetchReceiptImages();
        } else if (activeTab === 'budget-history') {
          await fetchBudgetHistory();
        }
      } catch (err) {
        setError('Không thể tải dữ liệu');
      } finally {
        setLoading(false);
      }
    };
    
    if (token && selectedFamilyId) {
      loadData();
    }
  }, [activeTab, token, selectedFamilyId, fetchReceiptImages, fetchBudgetHistory]);

  // Load data when filters change
  useEffect(() => {
    if (activeTab === 'receipts' && (filters.minAmount || filters.maxAmount)) {
      searchReceiptImages();
    } else if (activeTab === 'receipts') {
      fetchReceiptImages();
    }
  }, [activeTab, filters, fetchReceiptImages, searchReceiptImages]);

  // Load transactions when component mounts
  useEffect(() => {
    if (token && selectedFamilyId) {
      fetchTransactions();
    }
  }, [fetchTransactions]);

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
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

  // Get category info
  const getCategoryInfo = (categoryObj) => {
    if (typeof categoryObj === 'object' && categoryObj !== null) {
      return { 
        name: categoryObj.name || 'Không có tên', 
        icon: categoryObj.icon || '📝' 
      };
    }
    return { name: 'Không có', icon: '📝' };
  };

  // Handle tab change
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setCurrentPage(1);
    setError('');
  };

  // Handle page change
  const handlePageChange = (page) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
  };

  // Handle filter change
  const handleFilterChange = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
    setCurrentPage(1);
  };

  // Clear filters
  const clearFilters = () => {
    setFilters({
      isVerified: '',
      category: '',
      startDate: '',
      endDate: '',
      minAmount: '',
      maxAmount: ''
    });
    setCurrentPage(1);
  };

  // Check if user is owner
  const isOwner = useCallback(() => {
    if (!currentUser || !familyInfo) return false;
    const ownerId = familyInfo.owner && (familyInfo.owner._id || familyInfo.owner.id || familyInfo.owner);
    return String(ownerId) === String(currentUser.id);
  }, [currentUser, familyInfo]);

  // Verify receipt image (owner only)
  const verifyReceiptImage = async (imageId, isVerified) => {
    if (!isOwner()) return;
    
    try {
      const res = await fetch(`${API_BASE}/api/family/${selectedFamilyId}/receipt-images/${imageId}/verify`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ isVerified })
      });
      
      if (res.ok) {
        showNotification(`Hình ảnh đã được ${isVerified ? 'xác minh' : 'bỏ xác minh'}`, 'success');
        fetchReceiptImages(); // Refresh list
      } else {
        throw new Error('Không thể cập nhật trạng thái xác minh');
      }
    } catch (err) {
      console.error('Error verifying receipt:', err);
      showNotification('Không thể cập nhật trạng thái xác minh', 'error');
    }
  };

  // Delete receipt image
  const deleteReceiptImage = async (imageId) => {
    if (!window.confirm('Bạn có chắc muốn xóa hình ảnh này?')) return;
    
    try {
      const res = await fetch(`${API_BASE}/api/family/${selectedFamilyId}/receipt-images/${imageId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.ok) {
        showNotification('Đã xóa hình ảnh hóa đơn', 'success');
        fetchReceiptImages(); // Refresh list
      } else {
        throw new Error('Không thể xóa hình ảnh');
      }
    } catch (err) {
      console.error('Error deleting receipt:', err);
      showNotification('Không thể xóa hình ảnh', 'error');
    }
  };

  // Handle upload form changes
  const handleUploadFormChange = (key, value) => {
    setUploadForm(prev => ({
      ...prev,
      [key]: value
    }));
  };

  // Handle file selection
  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (file) {
      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        showNotification('Chỉ cho phép upload file hình ảnh (JPEG, PNG, GIF, WebP)', 'error');
        return;
      }
      
      // Validate file size (10MB max)
      if (file.size > 10 * 1024 * 1024) {
        showNotification('Kích thước file không được vượt quá 10MB', 'error');
        return;
      }
      
      setUploadForm(prev => ({
        ...prev,
        file: file
      }));
    }
  };

  // Upload receipt image
  const uploadReceiptImage = async () => {
    if (!uploadForm.file) {
      showNotification('Vui lòng chọn file hình ảnh', 'error');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('receiptImage', uploadForm.file);
      formData.append('description', uploadForm.description);
      if (uploadForm.amount) formData.append('amount', uploadForm.amount);
      if (uploadForm.date) formData.append('date', uploadForm.date);
      if (uploadForm.category) formData.append('category', uploadForm.category);
      if (uploadForm.linkedTransactionId) formData.append('linkedTransactionId', uploadForm.linkedTransactionId);

      const res = await fetch(`${API_BASE}/api/family/${selectedFamilyId}/receipt-images`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: formData
      });

      if (res.ok) {
        showNotification('Upload hình ảnh hóa đơn thành công', 'success');
        setUploadModal(false);
        setUploadForm({
          file: null,
          description: '',
          amount: '',
          date: new Date().toISOString().slice(0, 10),
          category: '',
          linkedTransactionId: ''
        });
        // Refresh receipt images list
        if (activeTab === 'receipts') {
          await fetchReceiptImages();
        }
      } else {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Upload thất bại');
      }
    } catch (err) {
      console.error('Error uploading receipt:', err);
      showNotification(err.message || 'Không thể upload hình ảnh', 'error');
    } finally {
      setUploading(false);
    }
  };

  // Open upload modal
  const openUploadModal = () => {
    setUploadModal(true);
  };

  // Close upload modal
  const closeUploadModal = () => {
    setUploadModal(false);
    setUploadForm({
      file: null,
      description: '',
      amount: '',
      date: new Date().toISOString().slice(0, 10),
      category: '',
      linkedTransactionId: ''
    });
  };

  // Thêm useEffect để tự động điền thông tin khi chọn liên kết giao dịch
  useEffect(() => {
    if (!uploadModal) return;
    if (!uploadForm.linkedTransactionId) return;

    // Tìm giao dịch được chọn
    const tx = transactions.find(t => t._id === uploadForm.linkedTransactionId);
    if (tx) {
      setUploadForm(prev => ({
        ...prev,
        description: tx.description || '',
        amount: tx.amount || '',
        category: tx.category?._id || tx.category || ''
      }));
    }
    // Nếu chọn "-- Không liên kết --", không tự động điền lại
  }, [uploadForm.linkedTransactionId, transactions, uploadModal]);

  // Hàm mở modal xem chi tiết ảnh hóa đơn
  const handleViewReceiptDetail = async (receipt) => {
    setSelectedReceipt(receipt);
    setShowReceiptDetailModal(true);
    setLinkedTransaction(null);

    // Lấy id giao dịch liên kết từ nhiều trường (object hoặc string)
    let linkedTxId = '';
    if (receipt.linkedTransaction) {
      if (typeof receipt.linkedTransaction === 'object' && receipt.linkedTransaction._id) {
        linkedTxId = receipt.linkedTransaction._id;
      } else {
        linkedTxId = receipt.linkedTransaction;
      }
    } else if (receipt.linkedTransactionId) {
      linkedTxId = receipt.linkedTransactionId;
    }

    if (linkedTxId) {
      setLoadingLinkedTx(true);
      try {
        const res = await fetch(`${API_BASE}/api/family/transactions/${linkedTxId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const tx = await res.json();
          setLinkedTransaction(tx);
        } else {
          setLinkedTransaction(null);
        }
      } catch (err) {
        setLinkedTransaction(null);
      } finally {
        setLoadingLinkedTx(false);
      }
    }
  };

  return (
    <div className="family-page">
      <FamilySidebar active="archive" collapsed={sidebarCollapsed} />
      
      <main className={`family-main ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        {/* Toggle sidebar button */}
        <button 
          className="sidebar-toggle-btn"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          title={sidebarCollapsed ? 'Mở sidebar' : 'Thu gọn sidebar'}
        >
          <i className={`fas ${sidebarCollapsed ? 'fa-bars' : 'fa-times'}`}></i>
        </button>
        
        <header className="fa-header">
          <div>
            <h1>
              <i className="fas fa-archive"></i>
              Lưu trữ gia đình
            </h1>
            <p>Xem lại hình ảnh hóa đơn và lịch sử ngân sách</p>
          </div>
          
          {/* Add Upload Button */}
          <div className="fa-header-actions">
            <button 
              className="fa-btn primary"
              onClick={openUploadModal}
              title="Upload hình ảnh hóa đơn"
            >
              <i className="fas fa-cloud-upload-alt"></i>
              Upload hóa đơn
            </button>
          </div>
        </header>

        {/* Archive Type Tabs */}
        <div className="fa-tabs">
          <button 
            className={`fa-tab ${activeTab === 'receipts' ? 'active' : ''}`}
            onClick={() => handleTabChange('receipts')}
          >
            <i className="fas fa-receipt"></i> Hình ảnh hóa đơn
          </button>
          <button 
            className={`fa-tab ${activeTab === 'budget-history' ? 'active' : ''}`}
            onClick={() => handleTabChange('budget-history')}
          >
            <i className="fas fa-chart-pie"></i> Lịch sử ngân sách
          </button>
        </div>

        {/* Filters */}
        {activeTab === 'receipts' && (
          <div className="fa-filters">
            <div className="fa-filter-row">
              <select 
                value={filters.isVerified} 
                onChange={(e) => handleFilterChange('isVerified', e.target.value)}
              >
                <option value="">Tất cả trạng thái</option>
                <option value="true">Đã xác minh</option>
                <option value="false">Chưa xác minh</option>
              </select>
              
              <select 
                value={filters.category} 
                onChange={(e) => handleFilterChange('category', e.target.value)}
              >
                <option value="">Tất cả danh mục</option>
                {categories.map(cat => (
                  <option key={cat._id} value={cat._id}>
                    {cat.icon} {cat.name}
                  </option>
                ))}
              </select>
              
              <input
                type="date"
                placeholder="Từ ngày"
                value={filters.startDate}
                onChange={(e) => handleFilterChange('startDate', e.target.value)}
              />
              
              <input
                type="date"
                placeholder="Đến ngày"
                value={filters.endDate}
                onChange={(e) => handleFilterChange('endDate', e.target.value)}
              />
              
              <input
                type="number"
                placeholder="Số tiền tối thiểu"
                value={filters.minAmount}
                onChange={(e) => handleFilterChange('minAmount', e.target.value)}
              />
              
              <input
                type="number"
                placeholder="Số tiền tối đa"
                value={filters.maxAmount}
                onChange={(e) => handleFilterChange('maxAmount', e.target.value)}
              />
              
              <button onClick={clearFilters} className="fa-clear-filters-btn">
                <i className="fas fa-times"></i> Xóa bộ lọc
              </button>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="fa-content">
          {loading ? (
            <div className="fa-loading">
              <div className="fa-loading-spinner"></div>
              <p>Đang tải dữ liệu...</p>
            </div>
          ) : error ? (
            <div className="fa-error">
              <i className="fas fa-exclamation-triangle"></i>
              <p>{error}</p>
              <button onClick={() => window.location.reload()} className="fa-retry-btn">
                Thử lại
              </button>
            </div>
          ) : (
            <>
              {/* Receipt Images */}
              {activeTab === 'receipts' && (
                <div className="fa-section">
                  <div className="fa-section-header">
                    <h2>Hình ảnh hóa đơn</h2>
                    <p>Tổng cộng {totalItems} hình ảnh đã lưu trữ</p>
                  </div>
                  
                  {receiptImages.length === 0 ? (
                    <div className="fa-empty-state">
                      <i className="fas fa-receipt"></i>
                      <h3>Chưa có hình ảnh hóa đơn nào</h3>
                      <p>Hình ảnh hóa đơn sẽ được lưu trữ tại đây</p>
                    </div>
                  ) : (
                    <div className="fa-receipts-grid">
                      {receiptImages.map(receipt => {
                        const category = receipt.categoryInfo ? getCategoryInfo(receipt.categoryInfo) : { name: 'Không có', icon: '📝' };
                        return (
                          <div key={receipt._id} className="fa-receipt-card">
                            <div className="fa-receipt-image">
                              <img 
                                src={receipt.imageUrl} 
                                alt={receipt.originalName}
                                loading="lazy"
                                onError={(e) => {
                                  e.target.style.display = 'none';
                                  e.target.nextSibling.style.display = 'flex';
                                }}
                                onLoad={(e) => {
                                  e.target.style.display = 'block';
                                  if (e.target.nextSibling) {
                                    e.target.nextSibling.style.display = 'none';
                                  }
                                }}
                              />
                              {/* Fallback khi không load được ảnh */}
                              <div 
                                className="fa-image-fallback"
                                style={{ 
                                  display: 'none',
                                  width: '100%', 
                                  height: '100%', 
                                  background: '#f1f5f9', 
                                  alignItems: 'center', 
                                  justifyContent: 'center',
                                  color: '#64748b',
                                  fontSize: '14px'
                                }}
                              >
                                <div style={{ textAlign: 'center' }}>
                                  <i className="fas fa-image" style={{ fontSize: '24px', marginBottom: '8px', display: 'block' }}></i>
                                  Không thể hiển thị ảnh
                                </div>
                              </div>
                              {receipt.isVerified && (
                                <div className="fa-verified-badge">
                                  <i className="fas fa-check-circle"></i>
                                </div>
                              )}
                            </div>
                            
                            <div className="fa-receipt-info">
                              <div className="fa-receipt-header">
                                <h4>{receipt.description || receipt.originalName}</h4>
                                {receipt.amount && (
                                  <span className="fa-receipt-amount">
                                    {formatCurrency(receipt.amount)}
                                  </span>
                                )}
                              </div>
                              
                              <div className="fa-receipt-meta">
                                <span className="fa-meta-badge category">
                                  {category.icon} {category.name}
                                </span>
                                <span className="fa-meta-badge date">
                                  <i className="fas fa-calendar-alt"></i> {formatDate(receipt.date)}
                                </span>
                                <span className="fa-meta-badge uploader">
                                  <i className="fas fa-user"></i> {receipt.uploaderName}
                                </span>
                              </div>
                              
                              <div className="fa-receipt-actions">
                                <button
                                  className="fa-action-btn view"
                                  onClick={() => handleViewReceiptDetail(receipt)}
                                >
                                  <i className="fas fa-eye"></i> Xem
                                </button>
                                
                                {isOwner() && (
                                  <button
                                    className={`fa-action-btn verify ${receipt.isVerified ? 'verified' : ''}`}
                                    onClick={() => verifyReceiptImage(receipt._id, !receipt.isVerified)}
                                  >
                                    <i className={`fas ${receipt.isVerified ? 'fa-times' : 'fa-check'}`}></i>
                                    {receipt.isVerified ? 'Bỏ xác minh' : 'Xác minh'}
                                  </button>
                                )}
                                
                                {(isOwner() || receipt.uploadedBy === currentUser?.id) && (
                                  <button
                                    className="fa-action-btn delete"
                                    onClick={() => deleteReceiptImage(receipt._id)}
                                  >
                                    <i className="fas fa-trash"></i> Xóa
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Budget History */}
              {activeTab === 'budget-history' && (
                <div className="fa-section">
                  <div className="fa-section-header">
                    <h2>Lịch sử ngân sách</h2>
                    <p>Các kỳ ngân sách đã kết thúc</p>
                  </div>
                  
                  {budgetHistory.length === 0 ? (
                    <div className="fa-empty-state">
                      <i className="fas fa-chart-pie"></i>
                      <h3>Chưa có lịch sử ngân sách</h3>
                      <p>Các kỳ ngân sách đã kết thúc sẽ được lưu trữ tại đây</p>
                    </div>
                  ) : (
                    <div className="fa-budget-history">
                      {budgetHistory.map(budget => {
                        const category = getCategoryInfo(budget.category);
                        const percentage = budget.amount > 0 ? Math.round((budget.spent / budget.amount) * 100) : 0;
                        const statusClass = percentage >= 100 ? 'over' : percentage >= 80 ? 'warning' : 'good';
                        
                        return (
                          <div key={budget._id} className="fa-budget-item">
                            <div className="fa-budget-header">
                              <div className="fa-budget-category">
                                <span className="fa-category-icon">{category.icon}</span>
                                <span className="fa-category-name">{category.name}</span>
                              </div>
                              <div className="fa-budget-period">
                                {formatDate(budget.startDate)} - {formatDate(budget.endDate)}
                              </div>
                            </div>
                            
                            <div className="fa-budget-progress">
                              <div className="fa-budget-bar-container">
                                <div 
                                  className={`fa-budget-bar ${statusClass}`}
                                  style={{ width: `${Math.min(percentage, 100)}%` }}
                                ></div>
                              </div>
                              <div className="fa-budget-stats">
                                <span className="fa-budget-spent">
                                  Chi: {formatCurrency(budget.spent)}
                                </span>
                                <span className="fa-budget-total">
                                  / {formatCurrency(budget.amount)}
                                </span>
                                <span className={`fa-budget-percentage ${statusClass}`}>
                                  ({percentage}%)
                                </span>
                              </div>
                            </div>
                            
                            <div className="fa-budget-footer">
                              <span className="fa-budget-reset">
                                <i className="fas fa-archive"></i> Reset: {formatDate(budget.resetAt)}
                              </span>
                              {percentage >= 100 && (
                                <span className="fa-budget-over">
                                  <i className="fas fa-exclamation-triangle"></i> 
                                  Vượt ngân sách {formatCurrency(budget.spent - budget.amount)}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Pagination */}
              {activeTab === 'receipts' && totalPages > 1 && (
                <div className="fa-pagination">
                  <button 
                    className="fa-pagination-btn"
                    onClick={() => handlePageChange(1)}
                    disabled={currentPage === 1}
                  >
                    <i className="fas fa-angle-double-left"></i>
                  </button>
                  <button 
                    className="fa-pagination-btn"
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                  >
                    <i className="fas fa-angle-left"></i>
                  </button>
                  
                  <div className="fa-pagination-info">
                    Trang {currentPage} / {totalPages}
                  </div>
                  
                  <button 
                    className="fa-pagination-btn"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                  >
                    <i className="fas fa-angle-right"></i>
                  </button>
                  <button 
                    className="fa-pagination-btn"
                    onClick={() => handlePageChange(totalPages)}
                    disabled={currentPage === totalPages}
                  >
                    <i className="fas fa-angle-double-right"></i>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* Upload Receipt Modal */}
      {uploadModal && (
        <div className="fa-modal-overlay">
          <div className="fa-modal">
            <div className="fa-modal-header">
              <h3>
                <i className="fas fa-cloud-upload-alt"></i>
                Upload hình ảnh hóa đơn
              </h3>
              <button className="fa-modal-close" onClick={closeUploadModal}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            
            <div className="fa-modal-body">
              <div className="fa-upload-form">
                {/* File Upload */}
                <div className="fa-form-group">
                  <label>Chọn hình ảnh hóa đơn <span className="required">*</span></label>
                  <div className="fa-file-upload">
                    <input
                      type="file"
                      id="receiptFile"
                      accept="image/*"
                      onChange={handleFileSelect}
                      style={{ display: 'none' }}
                    />
                    <label htmlFor="receiptFile" className="fa-file-upload-btn">
                      <i className="fas fa-image"></i>
                      {uploadForm.file ? uploadForm.file.name : 'Chọn file hình ảnh'}
                    </label>
                    <small>Chấp nhận: JPEG, PNG, GIF, WebP. Tối đa 10MB</small>
                  </div>
                </div>

                {/* Preview */}
                {uploadForm.file && (
                  <div className="fa-form-group">
                    <label>Xem trước</label>
                    <div className="fa-image-preview">
                      <img 
                        src={URL.createObjectURL(uploadForm.file)} 
                        alt="Preview"
                        style={{ maxWidth: '100%', maxHeight: '200px', borderRadius: '8px' }}
                      />
                    </div>
                  </div>
                )}

                {/* Description */}
                <div className="fa-form-group">
                  <label>Mô tả hóa đơn</label>
                  <textarea
                    value={uploadForm.description}
                    onChange={(e) => handleUploadFormChange('description', e.target.value)}
                    placeholder="Mô tả chi tiết về hóa đơn này..."
                    rows={3}
                  />
                </div>

                {/* Amount */}
                <div className="fa-form-group">
                  <label>Số tiền (tùy chọn)</label>
                  <input
                    type="number"
                    value={uploadForm.amount}
                    onChange={(e) => handleUploadFormChange('amount', e.target.value)}
                    placeholder="Nhập số tiền trên hóa đơn"
                    min="0"
                  />
                </div>

                {/* Date */}
                <div className="fa-form-group">
                  <label>Ngày hóa đơn</label>
                  <input
                    type="date"
                    value={uploadForm.date}
                    onChange={(e) => handleUploadFormChange('date', e.target.value)}
                  />
                </div>

                {/* Category */}
                <div className="fa-form-group">
                  <label>Danh mục (tùy chọn)</label>
                  <select
                    value={uploadForm.category}
                    onChange={(e) => handleUploadFormChange('category', e.target.value)}
                  >
                    <option value="">-- Chọn danh mục --</option>
                    {categories.map(cat => (
                      <option key={cat._id} value={cat._id}>
                        {cat.icon} {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Link to Transaction */}
                <div className="fa-form-group">
                  <label>Liên kết với giao dịch (tùy chọn)</label>
                  <select
                    value={uploadForm.linkedTransactionId}
                    onChange={(e) => handleUploadFormChange('linkedTransactionId', e.target.value)}
                  >
                    <option value="">-- Không liên kết --</option>
                    {transactions.map(tx => (
                      <option key={tx._id} value={tx._id}>
                        {formatDate(tx.date)} - {tx.description || 'Giao dịch'} - {formatCurrency(tx.amount)}
                        {tx.category && ` (${tx.category.name || tx.category})`}
                      </option>
                    ))}
                  </select>
                  <small>Liên kết hóa đơn này với một giao dịch chi tiêu gia đình</small>
                </div>
              </div>
            </div>
            
            <div className="fa-modal-footer">
              <button 
                className="fa-btn secondary" 
                onClick={closeUploadModal}
                disabled={uploading}
              >
                Hủy
              </button>
              <button 
                className="fa-btn primary" 
                onClick={uploadReceiptImage}
                disabled={uploading || !uploadForm.file}
              >
                {uploading ? (
                  <>
                    <i className="fas fa-spinner fa-spin"></i>
                    Đang upload...
                  </>
                ) : (
                  <>
                    <i className="fas fa-cloud-upload-alt"></i>
                    Upload
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal xem chi tiết ảnh hóa đơn */}
      {showReceiptDetailModal && selectedReceipt && (
        <div className="fa-modal-overlay">
          <div className="fa-modal" style={{ maxWidth: 700 }}>
            <div className="fa-modal-header">
              <h3>
                <i className="fas fa-image"></i> Chi tiết ảnh hóa đơn
              </h3>
              <button className="fa-modal-close" onClick={() => setShowReceiptDetailModal(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="fa-modal-body" style={{ padding: 24 }}>
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                <div style={{ flex: '0 0 260px', textAlign: 'center' }}>
                  <img
                    src={selectedReceipt.imageUrl}
                    alt={selectedReceipt.originalName || 'Ảnh hóa đơn'}
                    style={{ width: '100%', maxWidth: 240, maxHeight: 320, borderRadius: 12, background: '#f1f5f9', marginBottom: 12 }}
                  />
                  <div style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>
                    {selectedReceipt.description || selectedReceipt.originalName}
                  </div>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>
                    {selectedReceipt.uploaderName}
                  </div>
                  {selectedReceipt.isVerified && (
                    <div style={{ marginTop: 8, color: '#10b981', fontWeight: 600 }}>
                      <i className="fas fa-check-circle"></i> Đã xác minh
                    </div>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 220 }}>
                  {/* Sửa lỗi: khai báo biến category tại đây */}
                  {(() => {
                    const category = selectedReceipt.categoryInfo
                      ? getCategoryInfo(selectedReceipt.categoryInfo)
                      : { name: 'Không có', icon: '📝' };
                    return (
                      <>
                        <div style={{ marginBottom: 12 }}>
                          <strong>Mô tả:</strong> {selectedReceipt.description || selectedReceipt.originalName}
                        </div>
                        {selectedReceipt.amount && (
                          <div style={{ marginBottom: 12 }}>
                            <strong>Số tiền:</strong> {formatCurrency(selectedReceipt.amount)}
                          </div>
                        )}
                        <div style={{ marginBottom: 12 }}>
                          <strong>Ngày hóa đơn:</strong> {formatDate(selectedReceipt.date)}
                        </div>
                        <div style={{ marginBottom: 12 }}>
                          <strong>Danh mục:</strong> {category.icon} {category.name}
                        </div>
                        <div style={{ marginBottom: 12 }}>
                          <strong>Người upload:</strong> {selectedReceipt.uploaderName}
                        </div>
                        {/* Nếu có liên kết giao dịch thì hiển thị */}
                        {selectedReceipt.linkedTransaction && (
                          <div style={{ marginTop: 18, paddingTop: 12, borderTop: '1px solid #e5e7eb' }}>
                            <strong>Giao dịch liên kết:</strong>
                            {loadingLinkedTx ? (
                              <div style={{ marginTop: 8, color: '#64748b' }}>
                                <i className="fas fa-spinner fa-spin"></i> Đang tải thông tin giao dịch...
                              </div>
                            ) : linkedTransaction ? (
                              <div style={{ marginTop: 8 }}>
                                <div><strong>Mô tả:</strong> {linkedTransaction.description || '—'}</div>
                                <div>
                                  <strong>Số tiền:</strong> {formatCurrency(linkedTransaction.amount)}
                                  <span style={{ marginLeft: 8, color: linkedTransaction.type === 'expense' ? '#ef4444' : '#10b981' }}>
                                    {linkedTransaction.type === 'expense' ? 'Chi tiêu' : 'Thu nhập'}
                                  </span>
                                </div>
                                <div><strong>Ngày:</strong> {formatDate(linkedTransaction.date || linkedTransaction.createdAt)}</div>
                                <div>
                                  <strong>Danh mục:</strong> {linkedTransaction.category?.icon} {linkedTransaction.category?.name}
                                </div>
                                <div>
                                  <strong>Người tạo:</strong> {linkedTransaction.creatorName || (linkedTransaction.createdBy && (linkedTransaction.createdBy.name || linkedTransaction.createdBy.email)) || '—'}
                                </div>
                              </div>
                            ) : (
                              <div style={{ marginTop: 8, color: '#ef4444' }}>
                                Không tìm thấy thông tin giao dịch liên kết
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
            <div className="fa-modal-footer">
              <button className="fa-btn secondary" onClick={() => setShowReceiptDetailModal(false)}>
                <i className="fas fa-times"></i> Đóng
              </button>
              <button className="fa-btn primary" onClick={() => window.open(selectedReceipt.imageUrl, '_blank')}>
                <i className="fas fa-external-link-alt"></i> Xem ảnh lớn
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
