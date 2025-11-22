import React, { useState, useEffect, useCallback, useRef } from 'react';
import './Wallets.css';
import { showNotification } from '../utils/notify';

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
  const [newCategoryIcon, setNewCategoryIcon] = useState('');
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
      showNotification('Không thể tải danh sách ví. Vui lòng đăng nhập lại.', 'error');
    }
  };

  const handleAddWalletClick = () => {
    setShowCreateModal(true);
    try { window.dispatchEvent(new CustomEvent('walletAddModalOpened')); } catch(_) {}
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
        try { window.dispatchEvent(new CustomEvent('walletCreated',{detail:{walletId:newWallet._id}})); } catch(_) {}
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
    setSelectedCategories(prev => {
      const wasSelected = prev.includes(categoryId);
      const next = wasSelected ? prev.filter(id => id !== categoryId) : [...prev, categoryId];

      if (!wasSelected) {
        if (categoryFilter === 'expense') {
          const expenseCount = next.filter(id => expenseCats.some(c => c._id === id)).length;
          if (expenseCount === 1) {
            try { window.dispatchEvent(new CustomEvent('walletExpenseCategoryChosen')); } catch(_) {}
          }
        }
        if (categoryFilter === 'income') {
          const incomeCount = next.filter(id => incomeCats.some(c => c._id === id)).length;
          if (incomeCount === 1) {
            try { window.dispatchEvent(new CustomEvent('walletIncomeCategoryChosen')); } catch(_) {}
          }
        }
      }
      return next;
    });
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
      try { window.dispatchEvent(new CustomEvent('walletCategoriesSaved')); } catch(_) {}
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
        const errText = await res.text().catch(() => 'Tạo danh mục thất bại');
        // Try to parse as JSON, if fails use text directly
        let errorMessage = errText;
        try {
          const errData = JSON.parse(errText);
          errorMessage = errData.message || errText;
        } catch {
          // Not JSON, use text directly
          errorMessage = errText || 'Tạo danh mục thất bại';
        }
        throw new Error(errorMessage);
      }
      
      const created = await res.json();
      // add to local categories and select it
      setCategories(prev => [created, ...prev]);
      setSelectedCategories(prev => [...prev, created._id]);
      setNewCategoryName('');
      setNewCategoryIcon('');
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
      showNotification('Không thể tải thông tin ví.', 'error');
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
      showNotification('Không thể tải thông tin ví để sửa.', 'error');
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
      showNotification('Đã khôi phục ví thành công', 'success');
    } catch (err) {
      console.error(err);
      showNotification('Không thể khôi phục ví', 'error');
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

  // Hiển thị thông báo với hiệu ứng (giữ lại cho toast local, nhưng cũng dùng global notification)
  const showLocalNotification = (message, type = 'success') => {
    setNotification({ show: true, message, type });
    setTimeout(() => {
      setNotification({ show: false, message: '', type: '' });
    }, 2500);
    // Cũng gọi global notification
    showNotification(message, type);
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

  // Thêm confirm toast rendering gần Notification Toast
  return (
    <div className="wallets-container tour-wallets-component">
      <div className="wallets-title">Ví</div>
      <div className="wallets-sub">Quản lý các ví của bạn</div>
      <div className="wallets-list">
        {wallets.length === 0 ? (
          <div className="wallet-card-v2 wallet-empty-card">
            <div className="wallet-note">Chưa có ví nào</div>
          </div>
        ) : (
          wallets.map(wallet => (
            <div key={wallet._id} className="wallet-card-v2">
              {/* Holographic effect overlay */}
              <div className="wc-holographic"></div>
              
              {/* Chip */}
              <div className="wc-chip">
                <div className="wc-chip-lines"></div>
              </div>
              
              {/* Brand/Logo area */}
              <div className="wc-brand">
                <div className="wc-brand-circle"></div>
                <div className="wc-brand-text">WALLET</div>
              </div>
              
              {/* Card number (wallet ID) */}
              <div className="wc-card-number">
                {(() => {
                  const id = wallet._id.substring(wallet._id.length - 16);
                  return id.match(/.{1,4}/g)?.join(' ') || id;
                })()}
              </div>
              
              {/* Card holder name */}
              <div className="wc-card-holder">
                <div className="wc-card-holder-label">CHỦ THẺ</div>
                <div className="wc-card-holder-name">{wallet.name.toUpperCase()}</div>
              </div>
              
              {/* Expiry and balance */}
              <div className="wc-card-footer">
                <div className="wc-expiry">
                  <div className="wc-expiry-label">VALID</div>
                  <div className="wc-expiry-date">THRU</div>
                </div>
                <div className="wc-balance-card">
                  <div className="wc-balance-amount">{formatCurrency(wallet.initialBalance, wallet.currency)}</div>
                  <div className="wc-currency-badge">{wallet.currency}</div>
                </div>
              </div>
              
              {/* Categories as small icons at bottom */}
              {wallet.categories && wallet.categories.length > 0 && (
                <div className="wc-categories-mini">
                  {wallet.categories.slice(0, 6).map(cat => (
                    <span
                      key={cat._id}
                      className="wc-cat-mini"
                      title={`${cat.name} (${cat.type === 'expense' ? 'Chi tiêu' : 'Thu nhập'})`}
                    >
                      {cat.icon}
                    </span>
                  ))}
                  {wallet.categories.length > 6 && (
                    <span className="wc-cat-mini-more">+{wallet.categories.length - 6}</span>
                  )}
                </div>
              )}
              
              {/* Click overlay for details */}
              <div className="wc-click-overlay" onClick={() => handleOpenDetails(wallet._id)}></div>
            </div>
          ))
        )}
        <div className="wallet-card-v2 wallet-add-card-v2" onClick={handleAddWalletClick}>
          <div className="wc-add-icon">➕</div>
          <div className="wc-add-btn">Thêm ví mới</div>
          <div className="wc-add-hint">Tạo ví để quản lý tài chính</div>
          <div className="wc-add-subhint">Nhấn để bắt đầu</div>
        </div>
      </div>
      {showCreateModal && (
        <div className="wallet-modal-overlay">
          <div className="wallet-modal create-modal-enhanced">
            <div className="create-modal-close-btn" onClick={handleCloseModal} title="Đóng" disabled={loading}>
              ✕
            </div>
            <form className="wallet-modal-form" onSubmit={handleSubmit}>
              <div className="wallet-modal-header">
                <div className="wallet-modal-icon-wrapper">
                  <div className="wallet-modal-icon"></div>
                </div>
                <div className="wallet-modal-title">Tạo ví mới</div>
                <div className="wallet-modal-subtitle">Thiết lập ví để quản lý tài chính của bạn một cách hiệu quả</div>
              </div>

              <div className="create-form-content">
                  <div className="create-form-section">
                  <div className="section-divider">
                    <span className="section-divider-icon"></span>
                    <span className="section-divider-text">Thông tin cơ bản</span>
                  </div>

                  <div className="wallet-modal-field">
                    <label>
                      <span className="field-icon"></span>
                      <span>Tên ví</span>
                      <span className="field-hint">(Bắt buộc)</span>
                    </label>
                    <input
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleInputChange}
                      placeholder="Ví dụ: Ví tiền mặt, VCB lương, Tiết kiệm..."
                      required
                    />
                    <div className="field-help">Đặt tên rõ ràng để dễ nhận biết khi xem báo cáo</div>
                  </div>

                  <div className="wallet-modal-field-row">
                    <div className="wallet-modal-field half-width">
                      <label>
                        <span className="field-icon"></span>
                        <span>Loại tiền tệ</span>
                      </label>
                      <select
                        name="currency"
                        value={formData.currency}
                        onChange={handleInputChange}
                      >
                        <option value="VND">VND - Đồng Việt Nam</option>
                        <option value="USD">USD - Đô la Mỹ</option>
                        <option value="EUR">EUR - Euro</option>
                      </select>
                      <div className="field-help">Loại tiền tệ</div>
                    </div>

                    <div className="wallet-modal-field half-width">
                      <label>
                        <span className="field-icon"></span>
                        <span>Số dư ban đầu</span>
                      </label>
                      <input
                        type="number"
                        name="initialBalance"
                        value={formData.initialBalance}
                        onChange={handleInputChange}
                        placeholder="0"
                        min="0"
                      />
                      <div className="field-help">Số dư hiện tại</div>
                    </div>
                  </div>

                  <div className="create-tip-box">
                    <div className="tip-icon-small"></div>
                    <div className="tip-text-small">
                      <strong>Mẹo:</strong> Bạn có thể để số dư là 0 nếu mới bắt đầu. Sau đó có thể cập nhật số dư khi cần.
                    </div>
                  </div>
                </div>
              </div>

              <div className="wallet-modal-actions create-modal-actions">
                <button
                  type="button"
                  className="wallet-modal-close-btn"
                  onClick={handleCloseModal}
                  disabled={loading}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="wallet-modal-submit-btn"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <span className="btn-icon"></span>
                      <span>Đang tạo...</span>
                    </>
                  ) : (
                    <>
                      <span className="btn-icon"></span>
                      <span>Tạo ví</span>
                    </>
                  )}
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
                    onClick={() => {
                      setCategoryFilter('expense');
                      try { window.dispatchEvent(new CustomEvent('walletCategoryFilterChanged',{detail:{filter:'expense'}})); } catch(_) {}
                    }}
                  >
                    Chi tiêu
                  </button>
                  <button
                    type="button"
                    className={`filter-btn ${categoryFilter === 'income' ? 'active' : ''}`}
                    onClick={() => {
                      setCategoryFilter('income');
                      try { window.dispatchEvent(new CustomEvent('walletIncomeTabSelected')); } catch(_) {}
                      try { window.dispatchEvent(new CustomEvent('walletCategoryFilterChanged',{detail:{filter:'income'}})); } catch(_) {}
                    }}
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
                            {creatorLabel ? creatorLabel : ''}
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
                    placeholder="Icon (emoji)"
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
            {/* Header Section */}
            <div className="detail-header-section">
              <div className="detail-header-content">
                <div className="detail-header-left">
                  <div className="detail-wallet-icon-wrapper">
                    <div className="detail-wallet-icon"></div>
                  </div>
                  <div className="detail-header-text">
                    <h2 className="detail-wallet-name">{detailWallet.name}</h2>
                    <div className="detail-wallet-balance">
                      <span className="balance-label-text">Số dư</span>
                      <span className="balance-value">{formatCurrency(detailWallet.initialBalance, detailWallet.currency)}</span>
                    </div>
                  </div>
                </div>
                <button className="detail-close-btn" onClick={handleCloseDetails} aria-label="Đóng" title="Đóng">
                  <span>✕</span>
                </button>
              </div>
            </div>

            {/* Main Content */}
            <div className="detail-body">
              <div className="detail-columns">
                {/* Categories Column */}
                <div className="detail-col categories-col">
                  {/* Expense Categories */}
                  <div className="detail-section">
                    <div className="detail-section-header">
                      <div className="section-title-wrapper">
                        <span className="section-icon-badge expense-icon"></span>
                        <div>
                          <h3 className="section-title">Chi tiêu</h3>
                          <p className="section-subtitle">{(detailWallet.categories || []).filter(c => c.type === 'expense').length} danh mục</p>
                        </div>
                      </div>
                    </div>
                    <div className="detail-category-grid">
                      {(detailWallet.categories || []).filter(c => c.type === 'expense').map(cat => (
                        <div key={cat._id} className="detail-category-item">
                          <div className="cat-icon-wrapper">
                            <div className="cat-icon">{cat.icon}</div>
                          </div>
                          <div className="cat-meta">
                            <div className="cat-name">{cat.name}</div>
                            <div className="cat-type-badge expense-badge">Chi tiêu</div>
                          </div>
                        </div>
                      ))}
                      {(detailWallet.categories || []).filter(c => c.type === 'expense').length === 0 && (
                        <div className="empty-placeholder">
                          <span className="empty-icon"></span>
                          <span>Chưa có danh mục chi tiêu</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Income Categories */}
                  <div className="detail-section income-section">
                    <div className="detail-section-header">
                      <div className="section-title-wrapper">
                        <span className="section-icon-badge income-icon"></span>
                        <div>
                          <h3 className="section-title">Thu nhập</h3>
                          <p className="section-subtitle">{(detailWallet.categories || []).filter(c => c.type === 'income').length} danh mục</p>
                        </div>
                      </div>
                    </div>
                    <div className="detail-category-grid">
                      {(detailWallet.categories || []).filter(c => c.type === 'income').map(cat => (
                        <div key={cat._id} className="detail-category-item">
                          <div className="cat-icon-wrapper">
                            <div className="cat-icon">{cat.icon}</div>
                          </div>
                          <div className="cat-meta">
                            <div className="cat-name">{cat.name}</div>
                            <div className="cat-type-badge income-badge">Thu nhập</div>
                          </div>
                        </div>
                      ))}
                      {(detailWallet.categories || []).filter(c => c.type === 'income').length === 0 && (
                        <div className="empty-placeholder">
                          <span className="empty-icon"></span>
                          <span>Chưa có danh mục thu nhập</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Info & Actions Column */}
                <aside className="detail-col info-col">
                  {/* Info Card */}
                  <div className="info-card">
                    <div className="info-card-header-section">
                      <div className="info-card-icon"></div>
                      <h3 className="info-card-title">Thông tin ví</h3>
                    </div>
                    <div className="info-card-content">
                      <div className="info-item">
                        <div className="info-item-label">
                          <span className="info-icon"></span>
                          <span>Mã ví</span>
                        </div>
                        <div className="info-item-value" title={detailWallet._id}>
                          {detailWallet._id.substring(0, 12)}...
                        </div>
                      </div>
                      <div className="info-item highlight-item">
                        <div className="info-item-label">
                          <span className="info-icon"></span>
                          <span>Tổng danh mục</span>
                        </div>
                        <div className="info-item-value highlight-value">
                          {(detailWallet.categories || []).length}
                        </div>
                      </div>
                      <div className="info-item">
                        <div className="info-item-label">
                          <span className="info-icon"></span>
                          <span>Loại tiền</span>
                        </div>
                        <div className="info-item-value">
                          {detailWallet.currency === 'VND' ? 'VND' : detailWallet.currency === 'USD' ? 'USD' : 'EUR'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions Card */}
                  <div className="actions-card">
                    <div className="actions-card-header">
                      <div className="actions-card-icon"></div>
                      <h3 className="actions-card-title">Thao tác</h3>
                    </div>
                    <div className="actions-card-content">
                      <button className="action-btn primary-btn" onClick={() => handleOpenEdit(detailWallet)} title="Sửa thông tin ví">
                        <span className="btn-icon"></span>
                        <span>Sửa ví</span>
                      </button>
                      <button className="action-btn danger-btn" onClick={() => showConfirmDelete(detailWallet._id, detailWallet.name)} title="Xóa ví này">
                        <span className="btn-icon"></span>
                        <span>Xóa ví</span>
                      </button>
                      <button className="action-btn secondary-btn" onClick={handleCloseDetails} title="Đóng cửa sổ">
                        <span className="btn-icon">✕</span>
                        <span>Đóng</span>
                      </button>
                    </div>
                  </div>

                  {/* Tip Card */}
                  <div className="tip-card">
                    <div className="tip-icon"></div>
                    <div className="tip-text">
                      <strong>Mẹo:</strong> Các danh mục được phân loại theo màu để bạn dễ nhận biết.
                    </div>
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
          <div className="wallet-modal edit-modal-enhanced">
            <div className="edit-modal-close-btn" onClick={() => { setShowEditModal(false); setSelectedCategories([]); }} title="Đóng">
              ✕
            </div>
            <form className="wallet-modal-form" onSubmit={handleEditSubmit}>
              <div className="wallet-modal-header">
                <div className="wallet-modal-icon-wrapper">
                  <div className="wallet-modal-icon"></div>
                </div>
                <div className="wallet-modal-title">Sửa thông tin ví</div>
                <div className="wallet-modal-subtitle">Cập nhật thông tin và danh mục cho ví của bạn</div>
              </div>

              <div className="edit-form-sections">
                {/* Basic Info Section */}
                <div className="edit-form-section">
                  <div className="section-divider">
                    <span className="section-divider-icon"></span>
                    <span className="section-divider-text">Thông tin cơ bản</span>
                  </div>
                  
                  <div className="wallet-modal-field">
                    <label>
                      <span className="field-icon"></span>
                      <span>Tên ví</span>
                      <span className="field-hint">(Bắt buộc)</span>
                    </label>
                    <input name="name" value={editForm.name} onChange={handleEditChange} placeholder="Nhập tên ví" required />
                    <div className="field-help">Tên ví sẽ hiển thị trên thẻ và báo cáo</div>
                  </div>
                  
                  <div className="wallet-modal-field-row">
                    <div className="wallet-modal-field half-width">
                      <label>
                        <span className="field-icon"></span>
                        <span>Loại tiền tệ</span>
                      </label>
                      <select name="currency" value={editForm.currency} onChange={handleEditChange}>
                        <option value="VND">VND - Đồng Việt Nam</option>
                        <option value="USD">USD - Đô la Mỹ</option>
                        <option value="EUR">EUR - Euro</option>
                      </select>
                      <div className="field-help">Loại tiền tệ</div>
                    </div>
                    
                    <div className="wallet-modal-field half-width">
                      <label>
                        <span className="field-icon"></span>
                        <span>Số dư hiện tại</span>
                      </label>
                      <input name="initialBalance" type="number" value={editForm.initialBalance} onChange={handleEditChange} min="0" placeholder="0" />
                      <div className="field-help">Số dư hiện tại</div>
                    </div>
                  </div>
                </div>

                {/* Category Section */}
                <div className="edit-form-section">
                  <div className="section-divider">
                    <span className="section-divider-icon"></span>
                    <span className="section-divider-text">Danh mục</span>
                  </div>
                  
                  <div className="edit-category-hint">Chọn các danh mục bạn muốn sử dụng với ví này</div>
                  
                  <div className="edit-category-controls">
                    <div className="category-filter">
                      <button type="button" className={`filter-btn ${categoryFilter === 'expense' ? 'active' : ''}`} onClick={() => {
                        setCategoryFilter('expense');
                        try { window.dispatchEvent(new CustomEvent('walletCategoryFilterChanged',{detail:{filter:'expense'}})); } catch(_) {}
                      }}>
                        <span className="filter-icon"></span>
                        <span>Chi tiêu</span>
                      </button>
                      <button type="button" className={`filter-btn ${categoryFilter === 'income' ? 'active' : ''}`} onClick={() => {
                        setCategoryFilter('income');
                        try { window.dispatchEvent(new CustomEvent('walletIncomeTabSelected')); } catch(_) {}
                        try { window.dispatchEvent(new CustomEvent('walletCategoryFilterChanged',{detail:{filter:'income'}})); } catch(_) {}
                      }}>
                        <span className="filter-icon"></span>
                        <span>Thu nhập</span>
                      </button>
                    </div>
                    <div className="category-selected-count">
                      <span className="count-number">{selectedCategories.length}</span>
                      <span className="count-label">đã chọn</span>
                    </div>
                  </div>

                  <div className="category-grid edit-category-grid">
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
                        >
                          <div className="category-icon">{cat.icon}</div>
                          <div className="category-info">
                            <div className="category-name">{cat.name}</div>
                            {creatorLabel && (
                              <div className="category-creator" title={`Tạo bởi ${creatorLabel}`}>
                                {creatorLabel}
                              </div>
                            )}
                          </div>
                          {isSelected && <div className="category-check">✓</div>}
                        </button>
                      );
                    })}
                  </div>

                  {/* New category form */}
                  <div className="new-category-form edit-new-category">
                    <div className="new-category-header">
                      <span className="new-category-icon"></span>
                      <span>Tạo danh mục mới</span>
                    </div>
                    <div className="new-category-inputs">
                      <input
                        className="new-cat-input"
                        placeholder="Tên danh mục mới"
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                      />
                      <input
                        className="new-cat-input icon-input"
                        placeholder="Icon (emoji)"
                        value={newCategoryIcon}
                        onChange={(e) => setNewCategoryIcon(e.target.value)}
                        maxLength="2"
                      />
                      <button
                        className="new-cat-btn"
                        type="button"
                        disabled={creatingCategory}
                        onClick={(e) => handleCreateCategory(e, detailWallet && detailWallet.owner)}
                      >
                        {creatingCategory ? 'Đang tạo...' : 'Thêm'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="wallet-modal-actions edit-modal-actions">
                <button type="button" className="wallet-modal-close-btn" onClick={() => { setShowEditModal(false); setSelectedCategories([]); }}>
                  Hủy
                </button>
                <button type="submit" className="wallet-modal-submit-btn">
                  <span className="btn-icon"></span>
                  <span>Lưu thay đổi</span>
                </button>
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
