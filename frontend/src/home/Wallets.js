import React, { useState, useEffect, useCallback, useRef } from 'react';
import './Wallets.css';

function Wallets() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [wallets, setWallets] = useState([]);
  const [formData, setFormData] = useState({
    name: '',
    currency: 'VND',
    initialBalance: ''
  });
  const [loading, setLoading] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [createdWalletId, setCreatedWalletId] = useState(null);
  const [categories, setCategories] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [categoryFilter, setCategoryFilter] = useState('expense'); // 'expense' | 'income'
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryIcon, setNewCategoryIcon] = useState('🎯');
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [detailWallet, setDetailWallet] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', currency: 'VND', initialBalance: 0 });
  const [undoData, setUndoData] = useState(null);
  const undoTimerRef = useRef(null);
  const [notification, setNotification] = useState({ show: false, message: '', type: '' });
  const [confirmDelete, setConfirmDelete] = useState({ show: false, walletId: null, walletName: '' });

  const getUserInfo = useCallback(() => {
    const userId = localStorage.getItem('userId');
    const userName = localStorage.getItem('userName');
    const token = localStorage.getItem('token');
    
    return {
      userId, 
      userName,
      token,
      headers: token ? {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      } : {
        'Content-Type': 'application/json'
      }
    };
  }, []);

  // Fetch wallets khi component mount
  useEffect(() => {
    // Set a temporary user ID if none exists (for anonymous users)
    if (!localStorage.getItem('userId')) {
      const tempId = 'temp_' + Math.random().toString(36).substring(2, 15);
      localStorage.setItem('tempUserId', tempId);
    }
    
    fetchWallets();
  }, []);

  // fetchCategories ổn định bằng useCallback
  const fetchCategories = useCallback(async (ownerFilter) => {
    try {
      const response = await fetch('http://localhost:5000/api/categories');
      const data = await response.json();

      const userInfo = getUserInfo();
      const authUserId = userInfo.userId;
      const tempId = localStorage.getItem('tempUserId');
      const isAdmin = localStorage.getItem('userRole') === 'admin';
      const isObjectId = id => typeof id === 'string' && /^[0-9a-fA-F]{24}$/.test(id);

      // If ownerFilter provided, normalize to string id (could be object or string)
      const normalizeOwner = (o) => {
        if (!o) return null;
        if (typeof o === 'string') return o;
        if (o._id) return String(o._id);
        return null;
      };
      const ownerToMatch = normalizeOwner(ownerFilter);

      const filtered = (data || []).filter(cat => {
        // admin sees everything
        if (isAdmin) return true;

        // system categories created by admin are visible to all
        if (cat.createdBy === 'admin') return true;

        // public category (no owner) -> visible
        if (!cat.owner) return true;

        // normalize category owner id
        const ownerId = typeof cat.owner === 'string' ? cat.owner : (cat.owner && cat.owner._id ? String(cat.owner._id) : undefined);

        // If ownerFilter provided: show categories that are either:
        // - owned by that wallet owner (ownerToMatch), OR
        // - owned by the current auth user (so user-created categories are suggested), OR
        // - owned by tempId (anonymous)
        if (ownerToMatch) {
          if (ownerId === ownerToMatch) return true;
          if (authUserId && isObjectId(authUserId) && ownerId === authUserId) return true;
          if (tempId && ownerId === tempId) return true;
          return false;
        }

        // otherwise (no ownerFilter): show categories owned by current auth user or tempId (as before)
        if (authUserId && isObjectId(authUserId) && ownerId === authUserId) return true;
        if (tempId && ownerId === tempId) return true;

        // otherwise hide category
        return false;
      });

      setCategories(filtered || []);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  }, [getUserInfo]);

  // Lấy categories khi modal chọn danh mục mở (dependency đầy đủ để tránh cảnh báo ESLint)
  useEffect(() => {
    if (!showCategoryModal) return;
    // compute ownerToUse:
    // - if we just created a wallet, prefer that wallet owner (may be string id)
    // - otherwise use current logged userId or tempUserId
    let ownerToUse = localStorage.getItem('userId') || localStorage.getItem('tempUserId') || null;
    if (createdWalletId) {
      const w = wallets.find(x => String(x._id) === String(createdWalletId));
      if (w && (w.owner || w.owner === null)) ownerToUse = w.owner;
    }
    // always refresh categories for the modal so user-created categories are suggested
    fetchCategories(ownerToUse);
  }, [showCategoryModal, createdWalletId, wallets, fetchCategories]);

  const fetchWallets = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = {};
      
      // Add Authorization header if token exists
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch('http://localhost:5000/api/wallets', {
        headers: headers
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch wallets');
      }
      
      const data = await response.json();
      // data now includes populated categories (array of objects)
      setWallets(data);
      // notify other components (FinanceDashboard) immediately
      try { window.dispatchEvent(new CustomEvent('walletsUpdated', { detail: data })); } catch(_) {}
    } catch (error) {
      console.error('Error fetching wallets:', error);
      alert('Không thể tải danh sách ví. Vui lòng đăng nhập lại.');
    }
  };

  const handleAddWalletClick = () => {
    setShowCreateModal(true);
  };

  const handleCloseModal = () => {
    setShowCreateModal(false);
    setFormData({ name: '', currency: 'VND', initialBalance: '' });
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    // Validate name uniqueness client-side (trim & case-insensitive)
    const entered = (formData.name || '').trim();
    if (!entered) {
      showNotification('Vui lòng nhập tên ví', 'error');
      setLoading(false);
      return;
    }
    const duplicate = wallets.some(w => {
      const wName = (w && w.name) ? String(w.name).trim().toLowerCase() : '';
      return wName && wName === entered.toLowerCase();
    });
    if (duplicate) {
      showNotification('Tên ví đã tồn tại. Vui lòng nhập tên khác.', 'error');
      setLoading(false);
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const headers = {
        'Content-Type': 'application/json',
      };
      
      // Add Authorization header if token exists
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch('http://localhost:5000/api/wallets', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          name: formData.name,
          currency: formData.currency,
          initialBalance: Number(formData.initialBalance) || 0
        }),
      });

      if (response.ok) {
        const newWallet = await response.json();
        setWallets(prev => {
          const newList = [newWallet, ...prev];
          try { window.dispatchEvent(new CustomEvent('walletsUpdated', { detail: newList })); } catch(_) {}
          return newList;
        });
        setCreatedWalletId(newWallet._id);
        setShowCreateModal(false);
        setShowCategoryModal(true);
        // Preload categories and include both wallet owner categories and user's own categories
        // prefer newWallet.owner, fallback to current auth user id or tempId
        const ownerToUse = newWallet.owner || localStorage.getItem('userId') || localStorage.getItem('tempUserId');
        fetchCategories(ownerToUse);
        setSelectedCategories([]);
        // dùng notification thay vì alert
        showNotification('Tạo ví thành công! Hãy chọn danh mục cho ví.', 'success');
      } else {
        const error = await response.json();
        showNotification('Lỗi khi tạo ví: ' + (error.message || ''), 'error');
      }
    } catch (error) {
      console.error('Error creating wallet:', error);
      showNotification('Có lỗi xảy ra khi tạo ví!', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCategoryChange = (categoryId) => {
    setSelectedCategories(prev =>
      prev.includes(categoryId) ? prev.filter(id => id !== categoryId) : [...prev, categoryId]
    );
  };

  const handleSaveCategories = async () => {
    if (!createdWalletId) return;
    try {
      const token = localStorage.getItem('token');
      const headers = {
        'Content-Type': 'application/json',
      };
      
      // Add Authorization header if token exists
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`http://localhost:5000/api/wallets/${createdWalletId}`, {
        method: 'PATCH',
        headers: headers,
        body: JSON.stringify({ categories: selectedCategories })
      });
      if (!res.ok) throw new Error('Lưu danh mục thất bại');
      setShowCategoryModal(false);
      setCreatedWalletId(null);
      setSelectedCategories([]);
      fetchWallets();
      // dùng notification
      showNotification('Đã lưu danh mục cho ví!', 'success');
    } catch (error) {
      console.error(error);
      showNotification('Lỗi khi lưu danh mục cho ví!', 'error');
    }
  };

  const handleCreateCategory = async (e, ownerOverride) => {
    e.preventDefault();
    const name = (newCategoryName || '').trim();
    if (!name) {
      showNotification('Vui lòng nhập tên danh mục', 'error');
      return;
    }
    
    setCreatingCategory(true);
    try {
      const token = localStorage.getItem('token');
      const headers = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const userInfo = getUserInfo();
      const authUserId = userInfo.userId; // may be null for anonymous
      const tempId = localStorage.getItem('tempUserId');
      const userName = userInfo.userName || 'Người dùng';
      const isAdmin = localStorage.getItem('userRole') === 'admin';

      // Determine owner to send: prefer ownerOverride if provided, else prefer authUserId, else tempId
      const isObjectId = id => typeof id === 'string' && /^[0-9a-fA-F]{24}$/.test(id);
      const normalizeOwner = (o) => {
        if (!o) return undefined;
        if (typeof o === 'string') return o;
        if (o._id) return String(o._id);
        return undefined;
      };
      const overrideOwnerId = normalizeOwner(ownerOverride);
      const ownerToSend = overrideOwnerId
        ? overrideOwnerId
        : (isObjectId(authUserId) ? authUserId : (tempId ? tempId : undefined));

      const body = {
        name,
        type: categoryFilter,
        icon: newCategoryIcon || '❓',
        createdBy: isAdmin ? 'admin' : (isObjectId(authUserId) ? 'user' : 'user'),
        creatorName: userName
      };
      if (ownerToSend) body.owner = ownerToSend;

      const res = await fetch('http://localhost:5000/api/categories', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body)
      });
      
      if (!res.ok) {
        const errData = await res.json();
        console.error('Category creation error:', errData);
        throw new Error(errData.message || 'Failed to create category');
      }
      
      const created = await res.json();
      // add to local categories and select it
      setCategories(prev => [created, ...prev]);
      setSelectedCategories(prev => [...prev, created._id]);
      setNewCategoryName('');
      setNewCategoryIcon('🎯');
      showNotification('Tạo danh mục thành công!', 'success');

      // if ownerOverride was provided, optionally refresh filtered categories for that owner
      if (overrideOwnerId) {
        await fetchCategories(overrideOwnerId);
      }
    } catch (err) {
      console.error('Category creation failed:', err);
      showNotification('Lỗi khi tạo danh mục: ' + (err.message || ''), 'error');
    } finally {
      setCreatingCategory(false);
    }
  };

  // Phân loại categories thành 2 nhóm
  const expenseCats = categories.filter(c => c.type === 'expense');
  const incomeCats = categories.filter(c => c.type === 'income');

  const formatCurrency = (amount, currency) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: currency === 'VND' ? 'VND' : currency
    }).format(amount);
  };

  const handleOpenDetails = async (walletId) => {
    try {
      const token = localStorage.getItem('token');
      const headers = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch(`http://localhost:5000/api/wallets/${walletId}`, { headers });
      if (!res.ok) throw new Error('Cannot load wallet');
      const data = await res.json();
      setDetailWallet(data);
      setShowDetailModal(true);
    } catch (err) {
      console.error(err);
      alert('Không thể tải thông tin ví.');
    }
  };

  // Sửa lại: truyền đúng dữ liệu ví cho modal sửa
  const handleOpenEdit = async (wallet) => {
    try {
      const token = localStorage.getItem('token');
      const headers = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch(`http://localhost:5000/api/wallets/${wallet._id}`, { headers });
      if (!res.ok) throw new Error('Cannot load wallet');
      const data = await res.json();
      setEditForm({
        name: data.name || '',
        currency: data.currency || 'VND',
        initialBalance: data.initialBalance || 0
      });
      const catIds = (data.categories || []).map(c => (typeof c === 'string' ? c : c._id));
      setSelectedCategories(catIds);
      setShowEditModal(true);
      setDetailWallet(data);
      // Ensure categories are filtered for this wallet's owner (so we don't show other users' categories)
      const ownerIdForFilter = data.owner;
      await fetchCategories(ownerIdForFilter);
    } catch (err) {
      console.error(err);
      alert('Không thể tải thông tin ví để sửa.');
    }
  };

  // Sửa lại: cập nhật danh sách ví sau khi sửa
  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!detailWallet) return;
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch(`http://localhost:5000/api/wallets/${detailWallet._id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          name: editForm.name,
          currency: editForm.currency,
          initialBalance: Number(editForm.initialBalance) || 0,
          categories: selectedCategories
        })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Update failed');
      }
      // const updated = await res.json(); // Xóa dòng này để tránh cảnh báo
      // Cập nhật lại danh sách ví từ backend để đảm bảo đồng bộ
      await fetchWallets();
      setShowEditModal(false);
      setDetailWallet(null);
      setSelectedCategories([]);
      showNotification('Cập nhật ví thành công!', 'success');
    } catch (err) {
      console.error(err);
      showNotification('Lỗi khi cập nhật ví', 'error');
    }
  };

  const handleUndo = async () => {
    if (!undoData) return;
    try {
      // recreate wallet using deleted data (omit _id)
      const body = {
        name: undoData.name,
        currency: undoData.currency,
        initialBalance: undoData.initialBalance,
        owner: undoData.owner // optional
      };
      const res = await fetch('http://localhost:5000/api/wallets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error('Undo failed');
      const recreated = await res.json();
      setWallets(prev => {
        const newList = [recreated, ...prev];
        try { window.dispatchEvent(new CustomEvent('walletsUpdated', { detail: newList })); } catch(_) {}
        return newList;
      });
      setUndoData(null);
      if (undoTimerRef.current) {
        clearTimeout(undoTimerRef.current);
        undoTimerRef.current = null;
      }
      alert('Đã khôi phục ví');
    } catch (err) {
      console.error(err);
      alert('Không thể khôi phục ví');
    }
  };

  // Thêm hàm đóng modal chi tiết ví
  const handleCloseDetails = () => {
    setShowDetailModal(false);
    setDetailWallet(null);
  };

  // Thêm hàm xử lý thay đổi input trong modal sửa ví
  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditForm(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Hiển thị thông báo với hiệu ứng
  const showNotification = (message, type = 'success') => {
    setNotification({ show: true, message, type });
    setTimeout(() => {
      setNotification({ show: false, message: '', type: '' });
    }, 2500);
  };

  // Hiển thị hộp xác nhận xóa dạng toast
  const showConfirmDelete = (walletId, walletName) => {
    setConfirmDelete({ show: true, walletId, walletName });
  };

  const cancelConfirmDelete = () => {
    setConfirmDelete({ show: false, walletId: null, walletName: '' });
  };

  const handleDeleteConfirmed = async () => {
    const { walletId, walletName } = confirmDelete;
    if (!walletId) return;
    setConfirmDelete({ show: false, walletId: null, walletName: '' });
    try {
      const token = localStorage.getItem('token');
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`http://localhost:5000/api/wallets/${walletId}`, {
        method: 'DELETE',
        headers
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Delete failed');
      }
      await fetchWallets();
      setShowDetailModal(false);
      setDetailWallet(null);
      showNotification(`Đã xóa ví "${walletName}"`, 'success');
    } catch (err) {
      console.error(err);
      showNotification('Lỗi khi xóa ví', 'error');
    }
  };

  // NEW: palette + helpers (place near top inside component)
  const walletGradients = [
    'linear-gradient(135deg,#1e3c72,#2a5298)',
    'linear-gradient(135deg,#2a5298,#4ecdc4)',
    'linear-gradient(135deg,#283c86,#45a247)',
    'linear-gradient(135deg,#614385,#516395)',
    'linear-gradient(135deg,#0f2027,#203a43,#2c5364)',
    'linear-gradient(135deg,#141e30,#243b55)',
    'linear-gradient(135deg,#42275a,#734b6d)',
  ];
  const shortId = id => (id ? id.slice(-6).toUpperCase() : '------');

  return (
    <div className="wallets-container">
      <div className="wallets-title">Ví</div>
      <div className="wallets-sub">Quản lý các ví của bạn</div>
      <div className="wallets-list">
        {wallets.length === 0 ? (
          <div className="wallet-card wallet-empty-card">
            <div className="wallet-note">Chưa có ví nào</div>
          </div>
        ) : (
          wallets.map((wallet, idx) => {
            const gradient = walletGradients[idx % walletGradients.length];
            return (
              <div
                key={wallet._id}
                className="wallet-card wallet-card-v2"
                style={{ '--card-grad': gradient }}
              >
                <div className="wc-bg-shape wc-bg-a" />
                <div className="wc-bg-shape wc-bg-b" />

                <div className="wc-top">
                  <span className="wc-label">WALLET</span>
                  <span className="wc-id">#{shortId(wallet._id)}</span>
                </div>

                <div className="wc-balance" title="Số dư">
                  {formatCurrency(wallet.initialBalance, wallet.currency)}
                </div>

                <div className="wc-name-row">
                  <div className="wc-name" title={wallet.name}>{wallet.name}</div>
                  <div className="wc-currency">{wallet.currency}</div>
                </div>

                {wallet.categories && wallet.categories.length > 0 && (
                  <div className="wc-cats" title={`${wallet.categories.length} danh mục`}>
                    {wallet.categories.slice(0,5).map(cat => (
                      <span key={cat._id} className="wc-cat-icon" aria-label={cat.name} title={cat.name}>
                        {cat.icon}
                      </span>
                    ))}
                    {wallet.categories.length > 5 && (
                      <span className="wc-cat-more">+{wallet.categories.length - 5}</span>
                    )}
                  </div>
                )}

                <div className="wc-actions">
                  <button
                    className="wc-btn"
                    onClick={() => handleOpenDetails(wallet._id)}
                    aria-label="Chi tiết ví"
                  >
                    Chi tiết
                  </button>
                </div>
              </div>
            );
          })
        )}
        <div className="wallet-card wallet-card-v2 wallet-add-card-v2">
          <button className="wc-add-btn" onClick={handleAddWalletClick}>+ Thêm ví mới</button>
          <div className="wc-add-hint">Tạo và gán danh mục nhanh</div>
        </div>
      </div>

      {showCreateModal && (
        <div className="wallet-modal-overlay">
          <div
            className="wallet-card wallet-card-v2 create-wallet-card"
            style={{ '--card-grad': 'linear-gradient(135deg,#2a5298,#4ecdc4)' }}
            role="dialog"
            aria-modal="true"
            aria-label="Tạo ví mới"
          >
            <div className="wc-bg-shape wc-bg-a" />
            <div className="wc-bg-shape wc-bg-b" />

            <div className="wc-top" style={{ alignItems: 'center', gap: 8 }}>
              <span className="wc-label">TẠO VÍ MỚI</span>
              <button type="button" className="detail-close" onClick={handleCloseModal} aria-label="Đóng">✕</button>
            </div>

            <form className="create-wallet-form" onSubmit={handleSubmit} style={{ marginTop: 8 }}>
              <div className="wallet-modal-field">
                <label>Tên ví:</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="Ví chi tiêu cá nhân"
                  required
                />
              </div>
              <div className="wallet-modal-field">
                <label>Loại tiền:</label>
                <select
                  name="currency"
                  value={formData.currency}
                  onChange={handleInputChange}
                >
                  <option value="VND">VND</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
              <div className="wallet-modal-field">
                <label>Số tiền:</label>
                <input
                  type="number"
                  name="initialBalance"
                  value={formData.initialBalance}
                  onChange={handleInputChange}
                  placeholder="0"
                  min="0"
                />
              </div>

              <div className="wallet-modal-actions" style={{ marginTop: 6 }}>
                <button
                  type="submit"
                  className="wallet-modal-submit-btn"
                  disabled={loading}
                >
                  {loading ? 'Đang tạo...' : 'Tạo ví'}
                </button>
                <button
                  type="button"
                  className="wallet-modal-close-btn"
                  onClick={handleCloseModal}
                  disabled={loading}
                >
                  Hủy
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showCategoryModal && (
        <div className="wallet-modal-overlay">
          <div className="wallet-modal category-modal">
            <div className="category-modal-header">
              <div className="wallet-modal-title">Chọn danh mục cho ví</div>
              <div className="category-controls">
                <div className="category-filter">
                  <button
                    type="button"
                    className={`filter-btn ${categoryFilter === 'expense' ? 'active' : ''}`}
                    onClick={() => setCategoryFilter('expense')}
                  >
                    Chi tiêu
                  </button>
                  <button
                    type="button"
                    className={`filter-btn ${categoryFilter === 'income' ? 'active' : ''}`}
                    onClick={() => setCategoryFilter('income')}
                  >
                    Thu nhập
                  </button>
                </div>
                <div className="category-selected-badge">{selectedCategories.length} đã chọn</div>
              </div>
            </div>

            <div className="category-columns single-column">
              <div className="category-column">
                <div className="category-type-title">
                  {categoryFilter === 'expense' ? 'Danh mục Chi tiêu' : 'Danh mục Thu nhập'}
                </div>
                <div className="category-grid">
                  {(categoryFilter === 'expense' ? expenseCats : incomeCats).map(cat => {
                    const isSelected = selectedCategories.includes(cat._id);
                    // New logic: hide any label for system/admin categories; show "Bạn tạo" for user-created ones
                    const isSystem = cat.createdBy === 'admin' || cat.createdBy === 'system';
                    const creatorLabel = isSystem ? '' : 'Bạn tạo';
                    return (
                      <button
                        key={cat._id}
                        type="button"
                        className={`category-card ${isSelected ? 'selected' : ''}`}
                        onClick={() => handleCategoryChange(cat._id)}
                        aria-pressed={isSelected}
                      >
                        <div className="category-icon">{cat.icon}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="category-name">{cat.name}</div>
                          <div className="category-creator" title={creatorLabel ? `Tạo bởi ${creatorLabel}` : ''}>
                            {creatorLabel ? `👤 ${creatorLabel}` : ''}
                          </div>
                        </div>
                        {isSelected && <div className="category-check">✓</div>}
                      </button>
                    );
                  })}
                </div>
                {/* New category form (insert under .category-grid) */}
                <form className="new-category-form" onSubmit={handleCreateCategory}>
                  <input
                    className="new-cat-input"
                    placeholder="Tên danh mục mới"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    required
                  />
                  <input
                    className="new-cat-input icon-input"
                    placeholder="Icon (emoji) ví dụ: 🎁"
                    value={newCategoryIcon}
                    onChange={(e) => setNewCategoryIcon(e.target.value)}
                  />
                  <button className="new-cat-btn" type="submit" disabled={creatingCategory}>
                    {creatingCategory ? 'Đang tạo...' : 'Thêm danh mục mới'}
                  </button>
                </form>
              </div>
            </div>

            <div className="wallet-modal-actions" style={{ marginTop: 16 }}>
              <button
                type="button"
                className="wallet-modal-submit-btn"
                onClick={handleSaveCategories}
                disabled={selectedCategories.length === 0}
              >
                Lưu danh mục
              </button>
              <button
                type="button"
                className="wallet-modal-close-btn"
                onClick={() => {
                  setShowCategoryModal(false);
                  setCreatedWalletId(null);
                  setSelectedCategories([]);
                }}
              >
                Bỏ qua
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Details Modal - ENHANCED */}
      {showDetailModal && detailWallet && (
        <div className="wallet-modal-overlay">
          <div className="wallet-modal detail-modal enhanced-detail" role="dialog" aria-modal="true" aria-label={`Chi tiết ví ${detailWallet.name}`}>
            <div className="detail-header">
              <div className="detail-title">
                <div className="wallet-modal-title">{detailWallet.name}</div>
                <div className="wallet-subtitle">Số dư: <span className="balance-amount">{formatCurrency(detailWallet.initialBalance, detailWallet.currency)}</span></div>
              </div>
              <button className="detail-close" onClick={handleCloseDetails} aria-label="Đóng">✕</button>
            </div>

            <div className="detail-body">
              <div className="detail-columns">
                <div className="detail-col categories-col">
                  <div className="detail-section">
                    <div className="section-header">
                      <span className="type-badge expense">Chi tiêu</span>
                      <span className="section-count">{(detailWallet.categories || []).filter(c => c.type === 'expense').length} mục</span>
                    </div>
                    <div className="detail-category-grid">
                      {(detailWallet.categories || []).filter(c => c.type === 'expense').map(cat => (
                        <div key={cat._id} className="detail-category-item">
                          <div className="cat-icon">{cat.icon}</div>
                          <div className="cat-meta">
                            <div className="cat-name">{cat.name}</div>
                            <div className="cat-sub">Chi tiêu</div>
                          </div>
                        </div>
                      ))}
                      {(detailWallet.categories || []).filter(c => c.type === 'expense').length === 0 && (
                        <div className="empty-placeholder">Chưa có danh mục chi tiêu</div>
                      )}
                    </div>
                  </div>

                  <div className="detail-section" style={{ marginTop: 14 }}>
                    <div className="section-header">
                      <span className="type-badge income">Thu nhập</span>
                      <span className="section-count">{(detailWallet.categories || []).filter(c => c.type === 'income').length} mục</span>
                    </div>
                    <div className="detail-category-grid">
                      {(detailWallet.categories || []).filter(c => c.type === 'income').map(cat => (
                        <div key={cat._id} className="detail-category-item">
                          <div className="cat-icon">{cat.icon}</div>
                          <div className="cat-meta">
                            <div className="cat-name">{cat.name}</div>
                            <div className="cat-sub">Thu nhập</div>
                          </div>
                        </div>
                      ))}
                      {(detailWallet.categories || []).filter(c => c.type === 'income').length === 0 && (
                        <div className="empty-placeholder">Chưa có danh mục thu nhập</div>
                      )}
                    </div>
                  </div>
                </div>

                <aside className="detail-col info-col">
                  <div className="info-card">
                    <div className="info-row"><strong>Chủ ví:</strong> <span>{detailWallet.ownerName || '---'}</span></div>
                    <div className="info-row"><strong>Mã ví:</strong> <span className="muted">{detailWallet._id}</span></div>
                    <div className="info-row"><strong>Tổng danh mục:</strong> <span>{(detailWallet.categories || []).length}</span></div>
                  </div>

                  <div className="actions-card">
                    <button className="action-btn primary" onClick={() => handleOpenEdit(detailWallet)}>Sửa ví</button>
                    <button className="action-btn danger" onClick={() => showConfirmDelete(detailWallet._id, detailWallet.name)}>Xóa ví</button>
                    <button className="action-btn" onClick={handleCloseDetails}>Đóng</button>
                  </div>

                  <div className="visual-note">
                    <div className="sparkle" aria-hidden="true">✨</div>
                    <div className="note-text">Các danh mục được sắp theo kiểu và có màu riêng để dễ phân biệt.</div>
                  </div>
                </aside>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && (
        <div className="wallet-modal-overlay">
          <div className="wallet-modal">
            <div className="wallet-modal-title">Sửa ví</div>
            <form className="wallet-modal-form" onSubmit={handleEditSubmit}>
              <div className="wallet-modal-field">
                <label>Tên ví:</label>
                <input name="name" value={editForm.name} onChange={handleEditChange} required />
              </div>
              <div className="wallet-modal-field">
                <label>Loại tiền:</label>
                <select name="currency" value={editForm.currency} onChange={handleEditChange}>
                  <option value="VND">VND</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
              <div className="wallet-modal-field">
                <label>Số dư:</label>
                <input name="initialBalance" type="number" value={editForm.initialBalance} onChange={handleEditChange} min="0" />
              </div>
              {/* Category selector inside Edit modal */}
              <div style={{ marginTop: 10 }}>
                <div style={{ marginBottom: 8, fontWeight: 700, color: '#163a5a' }}>Chọn danh mục</div>
                <div style={{ display: 'flex', gap: 12, marginBottom: 8, alignItems: 'center' }}>
                  <div className="category-filter" style={{ padding: 4 }}>
                    <button type="button" className={`filter-btn ${categoryFilter === 'expense' ? 'active' : ''}`} onClick={() => setCategoryFilter('expense')}>Chi tiêu</button>
                    <button type="button" className={`filter-btn ${categoryFilter === 'income' ? 'active' : ''}`} onClick={() => setCategoryFilter('income')}>Thu nhập</button>
                  </div>
                  <div style={{ color: '#666' }}>{selectedCategories.length} đã chọn</div>
                </div>

                <div className="category-grid" style={{ marginBottom: 8 }}>
                  {(categoryFilter === 'expense' ? expenseCats : incomeCats).map(cat => {
                    const isSelected = selectedCategories.includes(cat._id);
                    const isSystem = cat.createdBy === 'admin' || cat.createdBy === 'system';
                    const creatorLabel = isSystem ? '' : 'Bạn tạo';
                    return (
                      <button
                        key={cat._id}
                        type="button"
                        className={`category-card ${isSelected ? 'selected' : ''}`}
                        onClick={() => handleCategoryChange(cat._id)}
                        aria-pressed={isSelected}
                        style={{ marginBottom: 8 }}
                      >
                        <div className="category-icon">{cat.icon}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="category-name">{cat.name}</div>
                          <div className="category-creator" title={creatorLabel ? `Tạo bởi ${creatorLabel}` : ''}>
                            {creatorLabel ? `👤 ${creatorLabel}` : ''}
                          </div>
                        </div>
                        {isSelected && <div className="category-check">✓</div>}
                      </button>
                    );
                  })}
                </div>

                {/* New category form inside Edit modal: create category for this wallet owner */}
                <div className="new-category-form edit-new-category" /* not a form to avoid nested form submit */>
                  <input
                    className="new-cat-input"
                    placeholder="Tên danh mục mới"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                  />
                  <input
                    className="new-cat-input icon-input"
                    placeholder="Icon (emoji) ví dụ: 🎁"
                    value={newCategoryIcon}
                    onChange={(e) => setNewCategoryIcon(e.target.value)}
                  />
                  <button
                    className="new-cat-btn"
                    type="button"
                    disabled={creatingCategory}
                    onClick={(e) => handleCreateCategory(e, detailWallet && detailWallet.owner)}
                  >
                    {creatingCategory ? 'Đang tạo...' : 'Thêm danh mục cho chủ ví này'}
                  </button>
                </div>
              </div>

              <div className="wallet-modal-actions">
                <button type="submit" className="wallet-modal-submit-btn">Lưu</button>
                <button type="button" className="wallet-modal-close-btn" onClick={() => { setShowEditModal(false); setSelectedCategories([]); }}>Hủy</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Undo banner */}
      {undoData && (
        <div className="undo-banner">
          Đã xóa ví "{undoData.name}". <button className="undo-btn" onClick={handleUndo}>Hoàn tác</button>
        </div>
      )}

      {/* Notification Toast */}
      {notification.show && (
        <div className={`wallet-toast ${notification.type}`}>
          {notification.message}
        </div>
      )}

      {/* Confirmation Toast */}
      {confirmDelete.show && (
        <div className="wallet-toast confirm">
          <div className="confirm-message">Bạn có chắc chắn muốn xóa ví "<strong>{confirmDelete.walletName}</strong>"?</div>
          <div className="confirm-actions">
            <button className="confirm-btn" onClick={cancelConfirmDelete}>Hủy</button>
            <button className="confirm-btn danger" onClick={handleDeleteConfirmed}>Xóa</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Wallets;
