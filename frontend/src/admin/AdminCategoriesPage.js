import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminSidebar from './AdminSidebar';
import './AdminCategories.css';

function AdminCategoriesPage() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [currentCategory, setCurrentCategory] = useState(null);
  
  // Form states
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formType, setFormType] = useState('expense');
  const [formIcon, setFormIcon] = useState('💰');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  
  // Filters
  const [typeFilter, setTypeFilter] = useState('all');
  const [creatorFilter, setCreatorFilter] = useState('all');

  const API_BASE = 'http://localhost:5000';
  const token = localStorage.getItem('token');

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const res = await fetch(`${API_BASE}/api/categories`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!res.ok) {
        throw new Error(`HTTP error ${res.status}`);
      }
      
      const data = await res.json();
      setCategories(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching categories:', err);
      setError('Không thể tải danh sách danh mục');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const role = localStorage.getItem('role');
    if (!token || role !== 'admin') {
      navigate('/login');
      return;
    }
    
    fetchCategories();
    
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
  }, [navigate, fetchCategories, token]);

  const handleAddCategory = async (e) => {
    e.preventDefault();
    if (!formName.trim()) {
      setFormError('Tên danh mục không được để trống');
      return;
    }
    
    setSaving(true);
    setFormError('');
    
    try {
      const res = await fetch(`${API_BASE}/api/categories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: formName.trim(),
          description: formDescription.trim(),
          type: formType,
          icon: formIcon
        })
      });
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || `HTTP error ${res.status}`);
      }
      
      await fetchCategories();
      setShowAddModal(false);
      resetForm();
    } catch (err) {
      setFormError(err.message || 'Lỗi khi tạo danh mục');
    } finally {
      setSaving(false);
    }
  };

  const handleEditCategory = async (e) => {
    e.preventDefault();
    if (!formName.trim() || !currentCategory) {
      setFormError('Tên danh mục không được để trống');
      return;
    }
    
    setSaving(true);
    setFormError('');
    
    try {
      const res = await fetch(`${API_BASE}/api/categories/${currentCategory._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: formName.trim(),
          description: formDescription.trim(),
          type: formType,
          icon: formIcon
        })
      });
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || `HTTP error ${res.status}`);
      }
      
      await fetchCategories();
      setShowEditModal(false);
      resetForm();
    } catch (err) {
      setFormError(err.message || 'Lỗi khi cập nhật danh mục');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCategory = async (id) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa danh mục này?')) {
      return;
    }
    
    try {
      const res = await fetch(`${API_BASE}/api/categories/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || `HTTP error ${res.status}`);
      }
      
      await fetchCategories();
    } catch (err) {
      alert(err.message || 'Lỗi khi xóa danh mục');
    }
  };

  const openEditModal = (category) => {
    setCurrentCategory(category);
    setFormName(category.name || '');
    setFormDescription(category.description || '');
    setFormType(category.type || 'expense');
    setFormIcon(category.icon || '💰');
    setFormError('');
    setShowEditModal(true);
  };

  const resetForm = () => {
    setFormName('');
    setFormDescription('');
    setFormType('expense');
    setFormIcon('💰');
    setFormError('');
    setCurrentCategory(null);
  };

  const handleOpenAddModal = () => {
    resetForm();
    setShowAddModal(true);
  };

  const emojiOptions = ['💰', '🍔', '🚗', '📝', '🛍️', '🎮', '💊', '📚', '🏠', '🐱', '🎁', '💵', '🏆', '📈', '🏷️', '🎫', '📋', '🏦', '💻', '🔑'];

  // Filter categories
  const filteredCategories = categories.filter(cat => {
    if (typeFilter !== 'all' && cat.type !== typeFilter) return false;
    
    if (creatorFilter === 'system' && cat.createdBy !== 'system') return false;
    if (creatorFilter === 'admin' && cat.createdBy !== 'admin') return false;
    if (creatorFilter === 'user' && cat.createdBy !== 'user') return false;
    
    return true;
  });

  // Group categories by system and user
  const systemCategories = filteredCategories.filter(cat => cat.createdBy === 'system');
  const userCategories = filteredCategories.filter(cat => cat.createdBy !== 'system');

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <div className="admin-content">
        <div className="admin-cat-page">
          <h1 className="admin-page-title">Quản lý danh mục</h1>

          {/* Filters and actions */}
          <div className="admin-section">
            <div className="admin-section-header">
              <div className="header-left">
                <div className="icon-wrapper" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: '#fff' }}>
                  <i className="fas fa-filter"></i>
                </div>
                <h2 className="section-title">Bộ lọc</h2>
              </div>
              <button className="add-btn" onClick={handleOpenAddModal}>
                <i className="fas fa-plus"></i> Thêm danh mục
              </button>
            </div>

            <div style={{ display: 'flex', gap: '20px', marginTop: '20px', flexWrap: 'wrap' }}>
              <div className="form-group" style={{ marginBottom: 0, minWidth: '200px' }}>
                <label style={{ marginBottom: '8px', fontWeight: '600', color: '#2d3748' }}>Loại:</label>
                <select 
                  className="admin-select"
                  value={typeFilter} 
                  onChange={(e) => setTypeFilter(e.target.value)}
                >
                  <option value="all">Tất cả</option>
                  <option value="expense">Chi tiêu</option>
                  <option value="income">Thu nhập</option>
                </select>
              </div>
              
              <div className="form-group" style={{ marginBottom: 0, minWidth: '200px' }}>
                <label style={{ marginBottom: '8px', fontWeight: '600', color: '#2d3748' }}>Người tạo:</label>
                <select 
                  className="admin-select"
                  value={creatorFilter} 
                  onChange={(e) => setCreatorFilter(e.target.value)}
                >
                  <option value="all">Tất cả</option>
                  <option value="system">Hệ thống</option>
                  <option value="admin">Quản trị viên</option>
                  <option value="user">Người dùng</option>
                </select>
              </div>
            </div>
          </div>

          {/* System Categories */}
          <div className="admin-section system-section">
            <div className="admin-section-header">
              <div className="header-left">
                <div className="icon-wrapper system-icon">
                  <i className="fas fa-cog"></i>
                </div>
                <h2 className="section-title">Danh mục hệ thống</h2>
                <span className="category-count">{systemCategories.length}</span>
              </div>
            </div>

            {loading ? (
              <div className="admin-loading">
                <i className="fas fa-spinner fa-spin"></i> Đang tải...
              </div>
            ) : error ? (
              <div className="admin-error">{error}</div>
            ) : (
              <div className="table-container">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Icon</th>
                      <th>Tên</th>
                      <th>Loại</th>
                      <th>Mô tả</th>
                      <th>Hành động</th>
                    </tr>
                  </thead>
                  <tbody>
                    {systemCategories.length === 0 ? (
                      <tr>
                        <td colSpan="5" className="empty-text">Không có danh mục hệ thống nào</td>
                      </tr>
                    ) : (
                      systemCategories.map(category => (
                        <tr key={category._id}>
                          <td className="icon-cell">{category.icon || '💰'}</td>
                          <td>{category.name}</td>
                          <td>
                            <span className={`type-badge ${category.type}`}>
                              {category.type === 'expense' ? 'Chi tiêu' : 'Thu nhập'}
                            </span>
                          </td>
                          <td>{category.description || '-'}</td>
                          <td className="action-buttons">
                            <button className="edit-btn" onClick={() => openEditModal(category)}>
                              <i className="fas fa-edit"></i> Sửa
                            </button>
                            <button 
                              className="delete-btn" 
                              onClick={() => handleDeleteCategory(category._id)}
                              disabled={category.createdBy === 'system'}
                              title={category.createdBy === 'system' ? "Không thể xóa danh mục hệ thống" : ""}
                              style={category.createdBy === 'system' ? {opacity: 0.5, cursor: 'not-allowed'} : {}}
                            >
                              <i className="fas fa-trash-alt"></i> Xóa
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* User Categories */}
          <div className="admin-section user-section">
            <div className="admin-section-header">
              <div className="header-left">
                <div className="icon-wrapper user-icon">
                  <i className="fas fa-user"></i>
                </div>
                <h2 className="section-title">Danh mục người dùng</h2>
                <span className="category-count">{userCategories.length}</span>
              </div>
            </div>

            {loading ? (
              <div className="admin-loading">
                <i className="fas fa-spinner fa-spin"></i> Đang tải...
              </div>
            ) : error ? (
              <div className="admin-error">{error}</div>
            ) : (
              <div className="table-container">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Icon</th>
                      <th>Tên</th>
                      <th>Loại</th>
                      <th>Người tạo</th>
                      <th>Mô tả</th>
                      <th>Hành động</th>
                    </tr>
                  </thead>
                  <tbody>
                    {userCategories.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="empty-text">Không có danh mục người dùng nào</td>
                      </tr>
                    ) : (
                      userCategories.map(category => (
                        <tr key={category._id}>
                          <td className="icon-cell">{category.icon || '💰'}</td>
                          <td>{category.name}</td>
                          <td>
                            <span className={`type-badge ${category.type}`}>
                              {category.type === 'expense' ? 'Chi tiêu' : 'Thu nhập'}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <span className={`creator-badge ${category.createdBy || 'user'}`}>
                                {category.createdBy === 'admin' ? 'Quản trị viên' : 
                                 category.createdBy === 'system' ? 'Hệ thống' : 'Người dùng'}
                              </span>
                              {category.createdBy !== 'system' && (
                                <span style={{ 
                                  fontSize: '12px', 
                                  color: '#666',
                                  fontStyle: 'italic'
                                }}>
                                  {category.ownerName || 
                                   (category.owner && typeof category.owner === 'object' && category.owner.name) || 
                                   category.creatorName || 
                                   'Người dùng'}
                                </span>
                              )}
                            </div>
                          </td>
                          <td>{category.description || '-'}</td>
                          <td className="action-buttons">
                            <button className="edit-btn" onClick={() => openEditModal(category)}>
                              <i className="fas fa-edit"></i> Sửa
                            </button>
                            <button className="delete-btn" onClick={() => handleDeleteCategory(category._id)}>
                              <i className="fas fa-trash-alt"></i> Xóa
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Add Category Modal */}
          {showAddModal && (
            <div className="modal-overlay">
              <div className="modal">
                <div className="modal-header">
                  <h3>Thêm danh mục mới</h3>
                  <button className="close-btn" onClick={() => setShowAddModal(false)}>&times;</button>
                </div>
                
                <form className="modal-form" onSubmit={handleAddCategory}>
                  {formError && <div style={{color: 'red', marginBottom: '15px'}}>{formError}</div>}
                  
                  <div className="form-group">
                    <label>Tên danh mục</label>
                    <input 
                      type="text" 
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="Nhập tên danh mục"
                      required
                    />
                  </div>
                  
                  <div className="form-group">
                    <label>Mô tả</label>
                    <input 
                      type="text" 
                      value={formDescription}
                      onChange={(e) => setFormDescription(e.target.value)}
                      placeholder="Nhập mô tả (tùy chọn)"
                    />
                  </div>
                  
                  <div className="form-group">
                    <label>Loại</label>
                    <select 
                      value={formType}
                      onChange={(e) => setFormType(e.target.value)}
                    >
                      <option value="expense">Chi tiêu</option>
                      <option value="income">Thu nhập</option>
                    </select>
                  </div>
                  
                  <div className="form-group">
                    <label>Biểu tượng</label>
                    <input 
                      type="text"
                      className="emoji-input"
                      value={formIcon}
                      onChange={(e) => setFormIcon(e.target.value)}
                      maxLength="2"
                    />
                    <div className="emoji-preview">{formIcon}</div>
                    
                    <div className="emoji-picker">
                      {emojiOptions.map(emoji => (
                        <button
                          key={emoji}
                          type="button"
                          className="emoji-swatch"
                          onClick={() => setFormIcon(emoji)}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  <div className="modal-actions">
                    <button type="button" className="cancel-btn" onClick={() => setShowAddModal(false)}>Hủy</button>
                    <button type="submit" className="submit-btn" disabled={saving}>
                      {saving ? 'Đang lưu...' : 'Thêm danh mục'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Edit Category Modal */}
          {showEditModal && (
            <div className="modal-overlay">
              <div className="modal">
                <div className="modal-header">
                  <h3>Chỉnh sửa danh mục</h3>
                  <button className="close-btn" onClick={() => setShowEditModal(false)}>&times;</button>
                </div>
                
                <form className="modal-form" onSubmit={handleEditCategory}>
                  {formError && <div style={{color: 'red', marginBottom: '15px'}}>{formError}</div>}
                  
                  <div className="form-group">
                    <label>Tên danh mục</label>
                    <input 
                      type="text" 
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="Nhập tên danh mục"
                      required
                    />
                  </div>
                  
                  <div className="form-group">
                    <label>Mô tả</label>
                    <input 
                      type="text" 
                      value={formDescription}
                      onChange={(e) => setFormDescription(e.target.value)}
                      placeholder="Nhập mô tả (tùy chọn)"
                    />
                  </div>
                  
                  <div className="form-group">
                    <label>Loại</label>
                    <select 
                      value={formType}
                      onChange={(e) => setFormType(e.target.value)}
                      disabled={currentCategory?.createdBy === 'system'}
                    >
                      <option value="expense">Chi tiêu</option>
                      <option value="income">Thu nhập</option>
                    </select>
                  </div>
                  
                  <div className="form-group">
                    <label>Biểu tượng</label>
                    <input 
                      type="text"
                      className="emoji-input"
                      value={formIcon}
                      onChange={(e) => setFormIcon(e.target.value)}
                      maxLength="2"
                    />
                    <div className="emoji-preview">{formIcon}</div>
                    
                    <div className="emoji-picker">
                      {emojiOptions.map(emoji => (
                        <button
                          key={emoji}
                          type="button"
                          className="emoji-swatch"
                          onClick={() => setFormIcon(emoji)}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  <div className="modal-actions">
                    <button type="button" className="cancel-btn" onClick={() => setShowEditModal(false)}>Hủy</button>
                    <button type="submit" className="submit-btn" disabled={saving}>
                      {saving ? 'Đang lưu...' : 'Cập nhật'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AdminCategoriesPage;
