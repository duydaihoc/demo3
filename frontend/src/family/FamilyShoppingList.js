import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import FamilySidebar from './FamilySidebar';
import './FamilyShoppingList.css';
import { showNotification } from '../utils/notify';

export default function FamilyShoppingList() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [shoppingItems, setShoppingItems] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newItem, setNewItem] = useState({ name: '', quantity: 1, notes: '', category: '' });
  const [saving, setSaving] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [categories, setCategories] = useState([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [familyInfo, setFamilyInfo] = useState(null); // THÊM: family info để kiểm tra owner
  const [editingItem, setEditingItem] = useState(null); // THÊM: item đang edit
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', quantity: 1, notes: '', category: '' });
  const [editingSaving, setEditingSaving] = useState(false);

  const API_BASE = 'http://localhost:5000';
  const token = localStorage.getItem('token');
  const selectedFamilyId = localStorage.getItem('selectedFamilyId');

  // FETCH family info để xác định owner
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

  // Fetch categories từ API
  const fetchCategories = useCallback(async () => {
    if (!token) return;
    setLoadingCategories(true);
    try {
      const res = await fetch(`${API_BASE}/api/categories`, { 
        headers: { Authorization: `Bearer ${token}` } 
      });
      if (!res.ok) return;
      const data = await res.json();
      // Lọc chỉ lấy danh mục chi tiêu hoặc tất cả
      setCategories(data.filter(c => c.type === 'expense' || !c.type));
    } catch (err) {
      console.error("Error fetching categories:", err);
    } finally {
      setLoadingCategories(false);
    }
  }, [token, API_BASE]);

  // Fetch shopping list từ API THẬT
  const fetchShoppingList = useCallback(async () => {
    if (!token || !selectedFamilyId) return;
    setLoading(true);
    setError('');
    try {
      console.log('Fetching shopping list for family:', selectedFamilyId);
      const res = await fetch(`${API_BASE}/api/family/${selectedFamilyId}/shopping-list`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: Không thể tải danh sách mua sắm`);
      }
      
      const data = await res.json();
      console.log('Shopping list data:', data);
      setShoppingItems(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error fetching shopping list:", err);
      setError(err.message);
    } finally {
      setLoading(false);
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
    
    console.log('Component mounted, fetching data...');
    fetchCategories();
    fetchShoppingList();
    fetchFamilyInfo(); // THÊM: load family info
  }, [navigate, fetchCategories, fetchShoppingList, fetchFamilyInfo]);

  // Thêm item mới với API THẬT
  const handleAddItem = async (e) => {
    e.preventDefault();
    
    if (!newItem.name.trim()) {
      showNotification('Vui lòng nhập tên sản phẩm', 'error');
      return;
    }
    
    setSaving(true);
    try {
      console.log('Creating new item:', newItem);
      const payload = {
        name: newItem.name.trim(),
        quantity: Number(newItem.quantity) || 1,
        notes: newItem.notes?.trim() || '',
        category: newItem.category || null
      };
      
      const res = await fetch(`${API_BASE}/api/family/${selectedFamilyId}/shopping-list`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || `HTTP ${res.status}: Không thể thêm sản phẩm`);
      }
      
      const responseData = await res.json();
      console.log('Item created successfully:', responseData);
      
      showNotification('Đã thêm sản phẩm vào danh sách', 'success');
      setNewItem({ name: '', quantity: 1, notes: '', category: '' });
      setShowAddModal(false);
      
      // Refresh danh sách
      await fetchShoppingList();
    } catch (err) {
      console.error("Error adding item:", err);
      showNotification(err.message || 'Đã xảy ra lỗi khi thêm sản phẩm', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Toggle trạng thái mua với API THẬT
  const toggleItemPurchased = async (itemId, currentStatus) => {
    try {
      console.log('Toggling purchase status for item:', itemId, 'current:', currentStatus);
      const res = await fetch(`${API_BASE}/api/family/${selectedFamilyId}/shopping-list/${itemId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ purchased: !currentStatus })
      });
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Không thể cập nhật trạng thái');
      }
      
      showNotification(
        !currentStatus ? 'Đã đánh dấu sản phẩm đã mua' : 'Đã đánh dấu sản phẩm chưa mua', 
        'success'
      );
      
      // Refresh danh sách
      await fetchShoppingList();
    } catch (err) {
      console.error("Error updating item:", err);
      showNotification('Không thể cập nhật trạng thái sản phẩm', 'error');
    }
  };

  // Xóa item với API THẬT
  const deleteItem = async (itemId) => {
    if (!window.confirm('Bạn có chắc muốn xóa sản phẩm này?')) return;
    
    try {
      console.log('Deleting item:', itemId);
      const res = await fetch(`${API_BASE}/api/family/${selectedFamilyId}/shopping-list/${itemId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Không thể xóa sản phẩm');
      }
      
      showNotification('Đã xóa sản phẩm khỏi danh sách', 'success');
      
      // Refresh danh sách
      await fetchShoppingList();
    } catch (err) {
      console.error("Error deleting item:", err);
      showNotification('Không thể xóa sản phẩm', 'error');
    }
  };

  // Helper: kiểm tra owner
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

  const currentUser = getCurrentUser();
  const isOwner = !!(familyInfo && currentUser && (String(familyInfo.owner?._id || familyInfo.owner) === String(currentUser.id)));

  // Open edit modal (owner only)
  const openEditModal = (item) => {
    if (!isOwner) return;
    setEditingItem(item);
    setEditForm({
      name: item.name || '',
      quantity: item.quantity || 1,
      notes: item.notes || '',
      category: item.categoryInfo ? item.categoryInfo._id : (item.category || '')
    });
    setShowEditModal(true);
  };

  // Submit edit -> PATCH API
  const submitEdit = async (e) => {
    e.preventDefault();
    if (!editingItem) return;
    if (!editForm.name.trim()) {
      showNotification('Tên sản phẩm không thể rỗng', 'error');
      return;
    }
    setEditingSaving(true);
    try {
      const payload = {
        name: editForm.name.trim(),
        quantity: Number(editForm.quantity) || 1,
        notes: editForm.notes?.trim() || '',
        category: editForm.category || null
      };
      const res = await fetch(`${API_BASE}/api/family/${selectedFamilyId}/shopping-list/${editingItem._id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Không thể cập nhật sản phẩm');
      }
      showNotification('Cập nhật sản phẩm thành công', 'success');
      setShowEditModal(false);
      setEditingItem(null);
      await fetchShoppingList();
    } catch (err) {
      console.error('Error updating item:', err);
      showNotification(err.message || 'Lỗi khi cập nhật sản phẩm', 'error');
    } finally {
      setEditingSaving(false);
    }
  };

  // THÊM: Hàm xuất danh sách mục chưa mua
  const exportShoppingList = () => {
    // Lọc các mục chưa mua
    const unpurchasedItems = shoppingItems.filter(item => !item.purchased);
    
    if (unpurchasedItems.length === 0) {
      showNotification('Không có mục nào cần mua để xuất', 'info');
      return;
    }

    // Tạo nội dung file
    const content = generateExportContent(unpurchasedItems);
    
    // Tạo và tải file
    downloadFile(content, `danh-sach-mua-sam-${new Date().toISOString().split('T')[0]}.txt`, 'text/plain');
    
    showNotification(`Đã xuất ${unpurchasedItems.length} mục cần mua`, 'success');
  };

  // THÊM: Hàm tạo nội dung file xuất
  const generateExportContent = (items) => {
    const familyName = familyInfo?.name || 'Gia đình';
    const exportDate = new Date().toLocaleDateString('vi-VN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    
    let content = `═══════════════════════════════════════════════════════════════
                    DANH SÁCH MUA SẮM
                        ${familyName}
═══════════════════════════════════════════════════════════════

📅 Ngày xuất: ${exportDate}
📦 Tổng số mục cần mua: ${items.length}

═══════════════════════════════════════════════════════════════

`;

    // Nhóm theo danh mục
    const itemsByCategory = {};
    items.forEach(item => {
      const categoryName = item.categoryInfo?.name || 'Không phân loại';
      if (!itemsByCategory[categoryName]) {
        itemsByCategory[categoryName] = [];
      }
      itemsByCategory[categoryName].push(item);
    });

    // Xuất từng danh mục
    Object.keys(itemsByCategory).forEach((categoryName, index) => {
      const categoryItems = itemsByCategory[categoryName];
      const categoryIcon = categoryItems[0]?.categoryInfo?.icon || '📝';
      
      content += `${categoryIcon} ${categoryName.toUpperCase()}\n`;
      content += '─'.repeat(50) + '\n';
      
      categoryItems.forEach((item, itemIndex) => {
        content += `${itemIndex + 1}. ${item.name}`;
        if (item.quantity > 1) {
          content += ` (x${item.quantity})`;
        }
        if (item.notes) {
          content += `\n   💬 ${item.notes}`;
        }
        content += '\n';
      });
      
      content += '\n';
    });

    content += `═══════════════════════════════════════════════════════════════

📋 DANH SÁCH KIỂM TRA
`;

    // Danh sách checkbox cho người dùng tick
    items.forEach((item, index) => {
      content += `\n☐ ${item.name}`;
      if (item.quantity > 1) {
        content += ` (x${item.quantity})`;
      }
    });

    content += `

═══════════════════════════════════════════════════════════════
🏠 Được tạo từ ứng dụng quản lý gia đình
📱 ${window.location.origin}
`;

    return content;
  };

  // THÊM: Hàm xuất định dạng PDF đơn giản (text format)
  const exportToPDF = () => {
    const unpurchasedItems = shoppingItems.filter(item => !item.purchased);
    
    if (unpurchasedItems.length === 0) {
      showNotification('Không có mục nào cần mua để xuất', 'info');
      return;
    }

    // Tạo HTML content cho PDF
    const htmlContent = generatePDFContent(unpurchasedItems);
    
    // Tạo file HTML có thể in thành PDF
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    
    // Mở trong tab mới để người dùng có thể in hoặc lưu PDF
    const newWindow = window.open(url, '_blank');
    if (newWindow) {
      newWindow.onload = () => {
        // Tự động mở hộp thoại in
        setTimeout(() => {
          newWindow.print();
        }, 1000);
      };
    }
    
    showNotification('Đã mở danh sách để in hoặc lưu PDF', 'success');
  };

  // THÊM: Hàm tạo HTML content cho PDF
  const generatePDFContent = (items) => {
    const familyName = familyInfo?.name || 'Gia đình';
    const exportDate = new Date().toLocaleDateString('vi-VN');
    
    let html = `
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Danh sách mua sắm - ${familyName}</title>
    <style>
        body {
            font-family: 'Arial', sans-serif;
            line-height: 1.6;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            color: #333;
        }
        .header {
            text-align: center;
            border-bottom: 3px solid #4ecdc4;
            padding-bottom: 20px;
            margin-bottom: 30px;
        }
        .header h1 {
            color: #2a5298;
            margin: 0;
            font-size: 28px;
        }
        .header h2 {
            color: #4ecdc4;
            margin: 5px 0;
            font-size: 20px;
        }
        .info {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 25px;
            border-left: 4px solid #4ecdc4;
        }
        .category {
            margin-bottom: 25px;
        }
        .category-title {
            background: #4ecdc4;
            color: white;
            padding: 10px 15px;
            margin: 0;
            font-size: 18px;
            border-radius: 5px;
        }
        .items {
            padding: 15px;
            background: #fff;
            border: 1px solid #dee2e6;
            border-top: none;
            border-radius: 0 0 5px 5px;
        }
        .item {
            display: flex;
            align-items: center;
            padding: 8px 0;
            border-bottom: 1px solid #eee;
        }
        .item:last-child {
            border-bottom: none;
        }
        .checkbox {
            width: 20px;
            height: 20px;
            border: 2px solid #4ecdc4;
            margin-right: 15px;
            border-radius: 3px;
            flex-shrink: 0;
        }
        .item-name {
            font-weight: bold;
            flex: 1;
        }
        .item-quantity {
            color: #666;
            margin-left: 10px;
        }
        .item-notes {
            font-style: italic;
            color: #666;
            font-size: 14px;
            margin-left: 35px;
            margin-top: 5px;
        }
        .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 2px solid #eee;
            text-align: center;
            color: #666;
            font-size: 14px;
        }
        @media print {
            body { margin: 0; padding: 15px; }
            .header { page-break-after: avoid; }
            .category { page-break-inside: avoid; }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🛒 DANH SÁCH MUA SẮM</h1>
        <h2>${familyName}</h2>
    </div>
    
    <div class="info">
        <strong>📅 Ngày xuất:</strong> ${exportDate}<br>
        <strong>📦 Tổng số mục cần mua:</strong> ${items.length}
    </div>
`;

    // Nhóm theo danh mục
    const itemsByCategory = {};
    items.forEach(item => {
      const categoryName = item.categoryInfo?.name || 'Không phân loại';
      if (!itemsByCategory[categoryName]) {
        itemsByCategory[categoryName] = [];
      }
      itemsByCategory[categoryName].push(item);
    });

    // Tạo HTML cho từng danh mục
    Object.keys(itemsByCategory).forEach((categoryName) => {
      const categoryItems = itemsByCategory[categoryName];
      const categoryIcon = categoryItems[0]?.categoryInfo?.icon || '📝';
      
      html += `
    <div class="category">
        <h3 class="category-title">${categoryIcon} ${categoryName}</h3>
        <div class="items">`;
      
      categoryItems.forEach((item) => {
        html += `
            <div class="item">
                <div class="checkbox"></div>
                <div class="item-name">${item.name}</div>`;
        
        if (item.quantity > 1) {
          html += `<div class="item-quantity">x${item.quantity}</div>`;
        }
        
        html += `</div>`;
        
        if (item.notes) {
          html += `<div class="item-notes">💬 ${item.notes}</div>`;
        }
      });
      
      html += `
        </div>
    </div>`;
    });

    html += `
    <div class="footer">
        <p>🏠 Được tạo từ ứng dụng quản lý gia đình</p>
        <p>📱 ${window.location.origin}</p>
    </div>
</body>
</html>`;

    return html;
  };

  // THÊM: Hàm tải file
  const downloadFile = (content, filename, contentType) => {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // THÊM: Hàm xuất CSV
  const exportToCSV = () => {
    const unpurchasedItems = shoppingItems.filter(item => !item.purchased);
    
    if (unpurchasedItems.length === 0) {
      showNotification('Không có mục nào cần mua để xuất', 'info');
      return;
    }

    // Tạo CSV content
    let csvContent = '\uFEFF'; // UTF-8 BOM for Excel compatibility
    csvContent += 'STT,Tên sản phẩm,Số lượng,Danh mục,Ghi chú,Người tạo,Ngày tạo\n';
    
    unpurchasedItems.forEach((item, index) => {
      const row = [
        index + 1,
        `"${item.name}"`,
        item.quantity,
        `"${item.categoryInfo?.name || 'Không phân loại'}"`,
        `"${item.notes || ''}"`,
        `"${item.creatorName || 'Thành viên'}"`,
        `"${new Date(item.createdAt).toLocaleDateString('vi-VN')}"`
      ].join(',');
      csvContent += row + '\n';
    });
    
    downloadFile(csvContent, `danh-sach-mua-sam-${new Date().toISOString().split('T')[0]}.csv`, 'text/csv');
    showNotification(`Đã xuất ${unpurchasedItems.length} mục ra file CSV`, 'success');
  };

  return (
    <div className="family-page">
      <FamilySidebar active="shopping-list" collapsed={sidebarCollapsed} />
      
      <main className={`family-main ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        {/* Toggle sidebar button */}
        <button 
          className="sidebar-toggle-btn"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          title={sidebarCollapsed ? 'Mở sidebar' : 'Thu gọn sidebar'}
        >
          <i className={`fas ${sidebarCollapsed ? 'fa-bars' : 'fa-times'}`}></i>
        </button>
        
        <header className="fsl-header">
          <h1>Danh sách mua sắm</h1>
          <p>Quản lý danh sách sản phẩm cần mua</p>
          
          <div className="fsl-actions">
            {/* THÊM: Nút xuất danh sách với dropdown */}
            <div className="fsl-export-dropdown">
              <button 
                className="fsl-btn secondary fsl-export-btn"
                onClick={() => {
                  const dropdown = document.querySelector('.fsl-export-menu');
                  dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
                }}
              >
                <i className="fas fa-download"></i> Xuất danh sách
                <i className="fas fa-chevron-down" style={{marginLeft: '8px', fontSize: '12px'}}></i>
              </button>
              
              <div className="fsl-export-menu" style={{display: 'none'}}>
                <button onClick={exportShoppingList}>
                  <i className="fas fa-file-alt"></i> Xuất file Text
                </button>
                <button onClick={exportToPDF}>
                  <i className="fas fa-file-pdf"></i> Xuất PDF (In)
                </button>
                <button onClick={exportToCSV}>
                  <i className="fas fa-file-csv"></i> Xuất file CSV
                </button>
              </div>
            </div>
            
            <button 
              className="fsl-btn primary"
              onClick={() => setShowAddModal(true)}
            >
              <i className="fas fa-plus"></i> Thêm sản phẩm
            </button>
          </div>
        </header>

        {/* Add Item Modal */}
        {showAddModal && (
          <div className="fsl-modal-overlay">
            <div className="fsl-modal">
              <div className="fsl-modal-header">
                <h3>Thêm sản phẩm mới</h3>
                <button 
                  className="fsl-modal-close"
                  onClick={() => setShowAddModal(false)}
                >
                  &times;
                </button>
              </div>
              
              <form onSubmit={handleAddItem} className="fsl-form">
                <div className="fsl-form-group">
                  <label>Tên sản phẩm *</label>
                  <input
                    type="text"
                    value={newItem.name}
                    onChange={(e) => setNewItem({...newItem, name: e.target.value})}
                    placeholder="Nhập tên sản phẩm"
                    required
                  />
                </div>
                
                <div className="fsl-form-group">
                  <label>Số lượng</label>
                  <input
                    type="number"
                    value={newItem.quantity}
                    onChange={(e) => setNewItem({...newItem, quantity: e.target.value})}
                    min="1"
                    placeholder="1"
                  />
                </div>

                <div className="fsl-form-group">
                  <label>Danh mục</label>
                  <select
                    value={newItem.category}
                    onChange={(e) => setNewItem({...newItem, category: e.target.value})}
                    disabled={loadingCategories}
                  >
                    <option value="">-- Chọn danh mục (tùy chọn) --</option>
                    {categories.map(cat => (
                      <option key={cat._id} value={cat._id}>
                        {cat.icon} {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div className="fsl-form-group">
                  <label>Ghi chú</label>
                  <textarea
                    value={newItem.notes}
                    onChange={(e) => setNewItem({...newItem, notes: e.target.value})}
                    placeholder="Ghi chú thêm (tùy chọn)"
                    rows={3}
                  />
                </div>
                
                <div className="fsl-form-actions">
                  <button 
                    type="button" 
                    className="fsl-btn secondary"
                    onClick={() => setShowAddModal(false)}
                    disabled={saving}
                  >
                    Hủy
                  </button>
                  <button 
                    type="submit" 
                    className="fsl-btn primary"
                    disabled={saving}
                  >
                    {saving ? (
                      <>
                        <i className="fas fa-spinner fa-spin"></i> Đang lưu...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-save"></i> Thêm sản phẩm
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Item Modal (owner only) */}
        {showEditModal && editingItem && (
          <div className="fsl-modal-overlay">
            <div className="fsl-modal">
              <div className="fsl-modal-header">
                <h3>Chỉnh sửa sản phẩm</h3>
                <button className="fsl-modal-close" onClick={() => { setShowEditModal(false); setEditingItem(null); }}>
                  &times;
                </button>
              </div>

              <form onSubmit={submitEdit} className="fsl-form">
                <div className="fsl-form-group">
                  <label>Tên sản phẩm *</label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                    required
                  />
                </div>

                <div className="fsl-form-group">
                  <label>Số lượng</label>
                  <input
                    type="number"
                    value={editForm.quantity}
                    onChange={(e) => setEditForm({...editForm, quantity: e.target.value})}
                    min="1"
                  />
                </div>

                <div className="fsl-form-group">
                  <label>Danh mục</label>
                  <select
                    value={editForm.category || ''}
                    onChange={(e) => setEditForm({...editForm, category: e.target.value})}
                    disabled={loadingCategories}
                  >
                    <option value="">-- Không chọn --</option>
                    {categories.map(cat => (
                      <option key={cat._id} value={cat._id}>
                        {cat.icon} {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="fsl-form-group">
                  <label>Ghi chú</label>
                  <textarea
                    value={editForm.notes}
                    onChange={(e) => setEditForm({...editForm, notes: e.target.value})}
                    rows={3}
                  />
                </div>

                <div className="fsl-form-actions">
                  <button type="button" className="fsl-btn secondary" onClick={() => { setShowEditModal(false); setEditingItem(null); }} disabled={editingSaving}>Hủy</button>
                  <button type="submit" className="fsl-btn primary" disabled={editingSaving}>
                    {editingSaving ? <><i className="fas fa-spinner fa-spin"></i> Đang lưu...</> : <><i className="fas fa-save"></i> Lưu</>}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Shopping List Content */}
        <div className="fsl-content">
          {loading ? (
            <div className="fsl-loading">
              <div className="fsl-loading-spinner"></div>
              <p>Đang tải danh sách mua sắm...</p>
            </div>
          ) : error ? (
            <div className="fsl-error">
              <i className="fas fa-exclamation-triangle"></i>
              <p>{error}</p>
              <button onClick={fetchShoppingList} className="fsl-retry-btn">
                Thử lại
              </button>
            </div>
          ) : (
            <>
              {shoppingItems.length === 0 ? (
                <div className="fsl-empty-state">
                  <i className="fas fa-shopping-cart"></i>
                  <h3>Danh sách mua sắm trống</h3>
                  <p>Bắt đầu thêm sản phẩm đầu tiên của bạn</p>
                  <button 
                    className="fsl-btn primary"
                    onClick={() => setShowAddModal(true)}
                  >
                    <i className="fas fa-plus"></i> Thêm sản phẩm
                  </button>
                </div>
              ) : (
                <div className="fsl-items-list">
                  {shoppingItems.map(item => (
                    <div key={item._id} className={`fsl-item ${item.purchased ? 'purchased' : ''}`}>
                      <div className="fsl-item-content">
                        <div className="fsl-item-header">
                          <h4 className="fsl-item-name">{item.name}</h4>
                          <span className="fsl-item-quantity">x{item.quantity}</span>
                        </div>
                        
                        {/* Hiển thị danh mục nếu có */}
                        {item.categoryInfo && (
                          <div className="fsl-item-category">
                            <i className={item.categoryInfo.icon || 'fas fa-tag'}></i>
                            <span>{item.categoryInfo.name}</span>
                          </div>
                        )}
                        
                        {item.notes && (
                          <p className="fsl-item-notes">{item.notes}</p>
                        )}
                        
                        <div className="fsl-item-meta">
                          <span className="fsl-item-creator">
                            <i className="fas fa-user"></i> {item.creatorName || 'Thành viên'}
                          </span>
                          <span className="fsl-item-date">
                            <i className="fas fa-calendar-alt"></i> {new Date(item.createdAt).toLocaleDateString('vi-VN')}
                          </span>
                        </div>
                      </div>
                      
                      <div className="fsl-item-actions">
                        {isOwner && (
                          <button
                            className="fsl-action-btn edit"
                            onClick={() => openEditModal(item)}
                            title="Chỉnh sửa"
                          >
                            <i className="fas fa-edit"></i>
                            <span> Sửa</span>
                          </button>
                        )}
                        <button
                          className={`fsl-action-btn ${item.purchased ? 'undo' : 'check'}`}
                          onClick={() => toggleItemPurchased(item._id, item.purchased)}
                          title={item.purchased ? 'Chưa mua' : 'Đã mua'}
                        >
                          <i className={`fas ${item.purchased ? 'fa-undo' : 'fa-check'}`}></i>
                          <span>{item.purchased ? ' Chưa mua' : ' Đã mua'}</span>
                        </button>
                        <button
                          className="fsl-action-btn delete"
                          onClick={() => deleteItem(item._id)}
                          title="Xóa"
                        >
                          <i className="fas fa-trash"></i>
                          <span> Xóa</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
