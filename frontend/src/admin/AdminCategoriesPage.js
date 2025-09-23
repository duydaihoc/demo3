import React, { useState, useEffect } from 'react';
import AdminSidebar from './AdminSidebar';
import './AdminCategories.css';

function AdminCategoriesPage() {
  const [systemCategories, setSystemCategories] = useState([]);
  const [userCategories, setUserCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [currentCategory, setCurrentCategory] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    type: 'expense',
    icon: '❓'
  });

  // Fetch categories on component mount
  useEffect(() => {
    fetchCategories();
  }, []);

  // Fetch categories from API and separate them into system and user categories
  const fetchCategories = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:5000/api/categories');
      if (!response.ok) {
        throw new Error('Failed to fetch categories');
      }
      const data = await response.json();
      
      // Separate categories into system and user categories
      // System categories include both system-created and admin-created categories
      const systemCats = data.filter(cat => cat.createdBy === 'system' || cat.createdBy === 'admin');
      let userCats = data.filter(cat => cat.createdBy === 'user');
      
      // For admin view: fetch users to map owner id -> owner name
      // so we can show creator name instead of raw id.
      let userMap = {};
      if (token) {
        try {
          const usersRes = await fetch('http://localhost:5000/api/admin/users', {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (usersRes.ok) {
            const usersData = await usersRes.json();
            userMap = (usersData || []).reduce((m, u) => {
              m[String(u._id)] = u.name || u.email || 'Người dùng';
              return m;
            }, {});
          }
        } catch (err) {
          console.warn('Could not fetch users for owner name mapping', err);
        }
      }

      // Attach ownerName to user categories for display
      userCats = userCats.map(cat => {
        const ownerId = cat.owner && (typeof cat.owner === 'string' ? cat.owner : (cat.owner._id || cat.owner.id));
        const ownerName = ownerId ? (userMap[ownerId] || (ownerId.substring ? ownerId.substring(0,10) + '...' : ownerId)) : (cat.creatorName || 'Người dùng');
        return { ...cat, ownerName, ownerId };
      });
      
      setSystemCategories(systemCats);
      setUserCategories(userCats);
      setError(null);
    } catch (err) {
      console.error('Error fetching categories:', err);
      setError('Không thể tải danh mục. Vui lòng thử lại sau.');
    } finally {
      setLoading(false);
    }
  };

  // Handle form input change
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Open add category modal
  const handleAddClick = () => {
    setFormData({
      name: '',
      description: '',
      type: 'expense',
      icon: '❓'
    });
    setShowAddModal(true);
  };

  // Open edit category modal
  const handleEditClick = (category) => {
    setCurrentCategory(category);
    setFormData({
      name: category.name,
      description: category.description || '',
      type: category.type,
      icon: category.icon
    });
    setShowEditModal(true);
  };

  // Add category
  const handleAddSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch('http://localhost:5000/api/categories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          owner: null, // Ensure system category
          createdBy: 'admin', // Mark as created by admin
          creatorName: 'Quản trị viên' // Correct admin name
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to add category');
      }

      setShowAddModal(false);
      fetchCategories(); // Refresh categories
      alert('Danh mục đã được thêm thành công');
    } catch (err) {
      console.error('Error adding category:', err);
      alert(`Lỗi: ${err.message}`);
    }
  };

  // Edit category
  const handleEditSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`http://localhost:5000/api/categories/${currentCategory._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update category');
      }

      setShowEditModal(false);
      fetchCategories(); // Refresh categories
      alert('Danh mục đã được cập nhật thành công');
    } catch (err) {
      console.error('Error updating category:', err);
      alert(`Lỗi: ${err.message}`);
    }
  };

  // Delete category
  const handleDelete = async (categoryId) => {
    if (!window.confirm('Bạn có chắc muốn xóa danh mục này không?')) {
      return;
    }
    
    try {
      const response = await fetch(`http://localhost:5000/api/categories/${categoryId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to delete category');
      }

      fetchCategories(); // Refresh categories
      alert('Danh mục đã được xóa thành công');
    } catch (err) {
      console.error('Error deleting category:', err);
      alert(`Lỗi: ${err.message}`);
    }
  };

  // Modal close handler
  const handleCloseModal = () => {
    setShowAddModal(false);
    setShowEditModal(false);
  };

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <div className="admin-content">
        <div className="admin-cat-page">
          <h1 className="admin-page-title">Quản lý danh mục</h1>
          
          {loading ? (
            <div className="admin-loading">Đang tải danh mục...</div>
          ) : error ? (
            <div className="admin-error">{error}</div>
          ) : (
            <>
              {/* System Categories Section - Updated title to reflect admin categories */}
              <div className="admin-section system-section">
                <div className="admin-section-header">
                  <div className="header-left">
                    <span className="icon-wrapper system-icon">🔧</span>
                    <h2 className="section-title">Danh mục hệ thống & quản trị viên</h2>
                    <span className="category-count">{systemCategories.length}</span>
                  </div>
                  <button className="add-btn" onClick={handleAddClick}>+ Thêm danh mục mới</button>
                </div>
                
                {systemCategories.length === 0 ? (
                  <div className="empty-state">Không có danh mục nào.</div>
                ) : (
                  <div className="table-container">
                    <table className="admin-table system-table">
                      <thead>
                        <tr>
                          <th className="icon-col">Icon</th>
                          <th className="name-col">Tên</th>
                          <th className="desc-col">Mô tả</th>
                          <th className="type-col">Loại</th>
                          <th className="creator-col">Người tạo</th>
                          <th className="actions-col">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody>
                        {systemCategories.map(category => (
                          <tr key={category._id}>
                            <td className="icon-cell">{category.icon}</td>
                            <td>{category.name}</td>
                            <td>{category.description || <span className="empty-text">Không có mô tả</span>}</td>
                            <td>
                              <span className={`type-badge ${category.type}`}>
                                {category.type === 'income' ? 'Thu nhập' : 'Chi tiêu'}
                              </span>
                            </td>
                            <td>
                              <span className={`creator-badge ${category.createdBy}`}>
                                {category.creatorName || (
                                  category.createdBy === 'admin' ? 'Quản trị viên' : 
                                  category.createdBy === 'system' ? 'Hệ thống' : 
                                  'Người dùng'
                                )}
                              </span>
                            </td>
                            <td>
                              <div className="action-buttons">
                                <button className="edit-btn" onClick={() => handleEditClick(category)}>Sửa</button>
                                <button className="delete-btn" onClick={() => handleDelete(category._id)}>Xóa</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* User Categories Section - Updated title to reflect only user categories */}
              <div className="admin-section user-section">
                <div className="admin-section-header">
                  <div className="header-left">
                    <span className="icon-wrapper user-icon">👤</span>
                    <h2 className="section-title">Danh mục người dùng tạo</h2>
                    <span className="category-count">{userCategories.length}</span>
                  </div>
                </div>
                
                {userCategories.length === 0 ? (
                  <div className="empty-state">Không có danh mục nào.</div>
                ) : (
                  <div className="table-container">
                    <table className="admin-table user-table">
                      <thead>
                        <tr>
                          <th className="icon-col">Icon</th>
                          <th className="name-col">Tên</th>
                          <th className="desc-col">Mô tả</th>
                          <th className="type-col">Loại</th>
                          <th className="creator-col">Người tạo</th>
                          <th className="user-id-col">ID người dùng</th>
                          <th className="actions-col">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody>
                        {userCategories.map(category => (
                          <tr key={category._id}>
                            <td className="icon-cell">{category.icon}</td>
                            <td>{category.name}</td>
                            <td>{category.description || <span className="empty-text">Không có mô tả</span>}</td>
                            <td>
                              <span className={`type-badge ${category.type}`}>
                                {category.type === 'income' ? 'Thu nhập' : 'Chi tiêu'}
                              </span>
                            </td>
                            <td>
                              <span className={`creator-badge ${category.createdBy}`}>
                                {category.creatorName || 'Người dùng'}
                              </span>
                            </td>
                            <td className="user-id-cell">
                              {category.owner ? (
                                <div className="user-id-wrapper">
                                  <span className="user-name">
                                    {category.ownerName || (typeof category.owner === 'object' ? (category.owner._id || '').substring(0,10) + '...' : (String(category.owner).substring(0,10) + '...'))}
                                  </span>
                                  <button
                                    className="copy-btn"
                                    onClick={() => {
                                      const idToCopy = category.ownerId || (typeof category.owner === 'object' ? (category.owner._id || category.owner.id || '') : (category.owner || ''));
                                      if (idToCopy) {
                                        navigator.clipboard.writeText(idToCopy);
                                        alert('Đã sao chép ID: ' + idToCopy);
                                      }
                                    }}
                                  >
                                    📋
                                  </button>
                                </div>
                              ) : (
                                <span className="empty-text">Hệ thống</span>
                              )}
                            </td>
                            <td>
                              <div className="action-buttons">
                                <button className="edit-btn" onClick={() => handleEditClick(category)}>Sửa</button>
                                <button className="delete-btn" onClick={() => handleDelete(category._id)}>Xóa</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Add Category Modal */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal modal-large">
            <div className="modal-header">
              <h3>Thêm danh mục mới</h3>
              <button className="close-btn" onClick={handleCloseModal}>×</button>
            </div>
            <form className="modal-body modal-grid" onSubmit={handleAddSubmit}>
              <div className="col">
                <div className="field">
                  <label>Tên danh mục</label>
                  <input type="text" name="name" value={formData.name} onChange={handleInputChange} required />
                </div>
                <div className="field">
                  <label>Mô tả</label>
                  <textarea name="description" value={formData.description} onChange={handleInputChange} rows="4" />
                </div>
                <div className="field">
                  <label>Loại</label>
                  <div className="type-toggle">
                    <button type="button" className={formData.type === 'expense' ? 'active' : ''} onClick={() => setFormData(prev => ({ ...prev, type: 'expense' }))}>Chi tiêu</button>
                    <button type="button" className={formData.type === 'income' ? 'active' : ''} onClick={() => setFormData(prev => ({ ...prev, type: 'income' }))}>Thu nhập</button>
                  </div>
                </div>
              </div>
              <div className="col">
                <div className="field">
                  <label>Icon (emoji)</label>
                  <div className="emoji-row">
                    <input type="text" name="icon" value={formData.icon} onChange={handleInputChange} maxLength="2" className="emoji-input" />
                    <div className="emoji-preview large">{formData.icon}</div>
                  </div>
                </div>
                <div className="field">
                  <label>Chọn nhanh</label>
                  <div className="emoji-picker">
                    {['💸','🍔','🚌','🏠','🎁','💼','💡','🎯','💰','⚽'].map(e => (
                      <button key={e} type="button" className="emoji-swatch" onClick={() => setFormData(prev => ({ ...prev, icon: e }))}>{e}</button>
                    ))}
                  </div>
                </div>
                <div className="modal-actions right">
                  <button type="submit" className="primary-btn">Thêm danh mục</button>
                  <button type="button" className="secondary-btn" onClick={handleCloseModal}>Hủy</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Category Modal */}
      {showEditModal && currentCategory && (
        <div className="modal-overlay">
          <div className="modal modal-large">
            <div className="modal-header">
              <h3>Chỉnh sửa danh mục</h3>
              <button className="close-btn" onClick={handleCloseModal}>×</button>
            </div>
            <form className="modal-body modal-grid" onSubmit={handleEditSubmit}>
              <div className="col">
                <div className="field">
                  <label>Tên danh mục</label>
                  <input type="text" name="name" value={formData.name} onChange={handleInputChange} required />
                </div>
                <div className="field">
                  <label>Mô tả</label>
                  <textarea name="description" value={formData.description} onChange={handleInputChange} rows="4" />
                </div>
                <div className="field">
                  <label>Loại</label>
                  <div className="type-toggle">
                    <button type="button" className={formData.type === 'expense' ? 'active' : ''} onClick={() => setFormData(prev => ({ ...prev, type: 'expense' }))}>Chi tiêu</button>
                    <button type="button" className={formData.type === 'income' ? 'active' : ''} onClick={() => setFormData(prev => ({ ...prev, type: 'income' }))}>Thu nhập</button>
                  </div>
                </div>
              </div>
              <div className="col">
                <div className="field">
                  <label>Icon (emoji)</label>
                  <div className="emoji-row">
                    <input type="text" name="icon" value={formData.icon} onChange={handleInputChange} maxLength="2" className="emoji-input" />
                    <div className="emoji-preview large">{formData.icon}</div>
                  </div>
                </div>
                <div className="field">
                  <label>Chọn nhanh</label>
                  <div className="emoji-picker">
                    {['💸','🍔','🚌','🏠','🎁','💼','💡','🎯','💰','⚽'].map(e => (
                      <button key={e} type="button" className="emoji-swatch" onClick={() => setFormData(prev => ({ ...prev, icon: e }))}>{e}</button>
                    ))}
                  </div>
                </div>
                <div className="modal-actions right">
                  <button type="submit" className="primary-btn">Cập nhật</button>
                  <button type="button" className="secondary-btn" onClick={handleCloseModal}>Hủy</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminCategoriesPage;
              