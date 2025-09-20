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
    if (!localStorage.getItem('userId') && !localStorage.getItem('tempUserId')) {
      const tempId = 'temp_' + Math.random().toString(36).substring(2, 15);
      localStorage.setItem('tempUserId', tempId);
    }
    
    fetchWallets();
  }, []);

  // fetchCategories ổn định bằng useCallback
  const fetchCategories = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:5000/api/categories');
      const data = await response.json();
      setCategories(data || []);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  }, []);

  // Lấy categories khi modal chọn danh mục mở (dependency đầy đủ để tránh cảnh báo ESLint)
  useEffect(() => {
    if (showCategoryModal && categories.length === 0) {
      fetchCategories();
    }
  }, [showCategoryModal, categories.length, fetchCategories]);

  const fetchWallets = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/wallets');
      const data = await response.json();
      // data now includes populated categories (array of objects)
      setWallets(data);
    } catch (error) {
      console.error('Error fetching wallets:', error);
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

    try {
      const response = await fetch('http://localhost:5000/api/wallets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name,
          currency: formData.currency,
          initialBalance: Number(formData.initialBalance) || 0
        }),
      });

      if (response.ok) {
        const newWallet = await response.json();
        setWallets(prev => [newWallet, ...prev]);
        setCreatedWalletId(newWallet._id);
        setShowCreateModal(false);
        setShowCategoryModal(true);
        fetchCategories();
        setSelectedCategories([]);
        alert('Tạo ví thành công! Hãy chọn danh mục cho ví.');
      } else {
        const error = await response.json();
        alert('Lỗi: ' + error.message);
      }
    } catch (error) {
      console.error('Error creating wallet:', error);
      alert('Có lỗi xảy ra khi tạo ví!');
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
      const res = await fetch(`http://localhost:5000/api/wallets/${createdWalletId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categories: selectedCategories })
      });
      if (!res.ok) throw new Error('Lưu danh mục thất bại');
      setShowCategoryModal(false);
      setCreatedWalletId(null);
      setSelectedCategories([]);
      fetchWallets();
      alert('Đã lưu danh mục cho ví!');
    } catch (error) {
      console.error(error);
      alert('Lỗi khi lưu danh mục cho ví!');
    }
  };

  const handleCreateCategory = async (e) => {
    e.preventDefault();
    const name = (newCategoryName || '').trim();
    if (!name) {
      alert('Vui lòng nhập tên danh mục');
      return;
    }
    
    setCreatingCategory(true);
    try {
      // Get complete user info with username
      const userInfo = getUserInfo();
      const userId = userInfo.userId || localStorage.getItem('tempUserId');
      const userName = userInfo.userName || 'Người dùng';
      const isAdmin = localStorage.getItem('userRole') === 'admin';
      
      console.log('Creating category with owner:', userId, 'name:', userName);
      
      const res = await fetch('http://localhost:5000/api/categories', {
        method: 'POST',
        headers: userInfo.headers,
        body: JSON.stringify({ 
          name, 
          type: categoryFilter, 
          icon: newCategoryIcon || '❓',
          owner: userId,
          createdBy: isAdmin ? 'admin' : 'user',  // Set proper creator type
          creatorName: userName  // Send the actual userName
        })
      });
      
      if (!res.ok) {
        const errData = await res.json();
        console.error('Category creation error:', errData);
        throw new Error(errData.message || 'Failed to create category');
      }
      
      const created = await res.json();
      console.log('Created category:', created);
      
      setCategories(prev => [created, ...prev]);
      setSelectedCategories(prev => [...prev, created._id]);
      setNewCategoryName('');
      setNewCategoryIcon('🎯');
    } catch (err) {
      console.error('Category creation failed:', err);
      alert('Lỗi khi tạo danh mục: ' + (err.message || ''));
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
      const res = await fetch(`http://localhost:5000/api/wallets/${walletId}`);
      if (!res.ok) throw new Error('Cannot load wallet');
      const data = await res.json();
      setDetailWallet(data);
      setShowDetailModal(true);
    } catch (err) {
      console.error(err);
      alert('Không thể tải thông tin ví.');
    }
  };

  const handleCloseDetails = () => {
    setShowDetailModal(false);
    setDetailWallet(null);
  };

  // Khi mở modal Sửa từ chi tiết hoặc danh sách
  const handleOpenEdit = (wallet) => {
    setEditForm({
      name: wallet.name || '',
      currency: wallet.currency || 'VND',
      initialBalance: wallet.initialBalance || 0
    });
    // set selected categories from wallet (may be populated objects or ids)
    const catIds = (wallet.categories || []).map(c => (typeof c === 'string' ? c : c._id));
    setSelectedCategories(catIds);
    setShowEditModal(true);
    setDetailWallet(wallet);
    // ensure categories available for selection
    if (categories.length === 0) fetchCategories();
  };

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditForm(prev => ({ ...prev, [name]: value }));
  };

  // Khi submit sửa, gửi categories cùng các trường khác
  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!detailWallet) return;
    try {
      const res = await fetch(`http://localhost:5000/api/wallets/${detailWallet._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editForm.name,
          currency: editForm.currency,
          initialBalance: Number(editForm.initialBalance) || 0,
          categories: selectedCategories // gửi mảng id
        })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Update failed');
      }
      const updated = await res.json();
      // update local lists
      setWallets(prev => prev.map(w => w._id === updated._id ? updated : w));
      setShowEditModal(false);
      setDetailWallet(null);
      setSelectedCategories([]);
      alert('Cập nhật ví thành công');
    } catch (err) {
      console.error(err);
      alert('Lỗi khi cập nhật ví');
    }
  };

  const handleDelete = async (walletId) => {
    if (!window.confirm('Xác nhận xóa ví này?')) return;
    try {
      const res = await fetch(`http://localhost:5000/api/wallets/${walletId}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Delete failed');
      }
      const result = await res.json();
      // remove from UI
      setWallets(prev => prev.filter(w => w._id !== walletId));
      // save undo data and start timer
      setUndoData(result.wallet);
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      undoTimerRef.current = setTimeout(() => {
        setUndoData(null);
        undoTimerRef.current = null;
      }, 8000); // 8s to undo
    } catch (err) {
      console.error(err);
      alert('Lỗi khi xóa ví');
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
      setWallets(prev => [recreated, ...prev]);
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
          wallets.map(wallet => (
            <div key={wallet._id} className="wallet-card">
              <div className="wallet-name">{wallet.name}</div>
              <div className="wallet-balance">
                {formatCurrency(wallet.initialBalance, wallet.currency)}
              </div>

              {/* Hiển thị các icon danh mục đã gán (nhiều nhất 4, còn lại +n) */}
              {wallet.categories && wallet.categories.length > 0 && (
                <div className="wallet-cat-list" title={`${wallet.categories.length} danh mục`}>
                  {wallet.categories.slice(0,4).map(cat => (
                    <span
                      key={cat._id}
                      className="wallet-cat-icon"
                      title={cat.name}            // hiển thị tên danh mục khi hover
                      aria-label={cat.name}       // accessibility
                      role="img"
                    >
                      {cat.icon}
                    </span>
                  ))}
                  {wallet.categories.length > 4 && (
                    <span className="wallet-cat-more">+{wallet.categories.length - 4}</span>
                  )}
                </div>
              )}

              <button className="wallet-action-btn" onClick={() => handleOpenDetails(wallet._id)}>Chi tiết</button>
            </div>
          ))
        )
        }
        <div className="wallet-card wallet-add-card">
          <button className="wallet-add-btn" onClick={handleAddWalletClick}>
            + Thêm ví mới
          </button>
        </div>
      </div>
      {showCreateModal && (
        <div className="wallet-modal-overlay">
          <div className="wallet-modal">
            <div className="wallet-modal-title">Tạo ví mới</div>
            <form className="wallet-modal-form" onSubmit={handleSubmit}>
              <div className="wallet-modal-field">
                <label>Tên ví:</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="Nhập tên ví"
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
                  placeholder="Nhập số tiền"
                  min="0"
                />
              </div>
              <div className="wallet-modal-actions">
                <button
                  type="submit"
                  className="wallet-modal-submit-btn"
                  disabled={loading}
                >
                  {loading ? 'Đang tạo...' : 'Tạo'}
                </button>
                <button
                  type="button"
                  className="wallet-modal-close-btn"
                  onClick={handleCloseModal}
                  disabled={loading}
                >
                  Đóng
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
                    return (
                      <button
                        key={cat._id}
                        type="button"
                        className={`category-card ${isSelected ? 'selected' : ''}`}
                        onClick={() => handleCategoryChange(cat._id)}
                        aria-pressed={isSelected}
                      >
                        <div className="category-icon">{cat.icon}</div>
                        <div className="category-name">{cat.name}</div>
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

      {/* Details Modal */}
      {showDetailModal && detailWallet && (
        <div className="wallet-modal-overlay">
          <div className="wallet-modal detail-modal">
            <div className="wallet-modal-title">{detailWallet.name}</div>
            <div style={{ marginBottom: 12 }}>
              <strong>Số dư:</strong> {formatCurrency(detailWallet.initialBalance, detailWallet.currency)}
            </div>
            <div style={{ marginBottom: 8 }}>
              <strong>Danh mục:</strong>
              <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                {(detailWallet.categories || []).map(c => (
                  <div key={c._id} className="category-chip">{c.icon} {c.name}</div>
                ))}
                {(detailWallet.categories || []).length === 0 && <span style={{ color: '#666' }}>Chưa có danh mục</span>}
              </div>
            </div>

            <div className="wallet-modal-actions" style={{ marginTop: 16 }}>
              <button className="wallet-modal-submit-btn" onClick={() => handleOpenEdit(detailWallet)}>Sửa</button>
              <button className="wallet-modal-close-btn" onClick={() => { handleDelete(detailWallet._id); setShowDetailModal(false); }}>Xóa</button>
              <button className="wallet-modal-close-btn" onClick={handleCloseDetails}>Đóng</button>
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
                        <div className="category-name">{cat.name}</div>
                        {isSelected && <div className="category-check">✓</div>}
                      </button>
                    );
                  })}
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
    </div>
  );
}

export default Wallets;

