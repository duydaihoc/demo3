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
  const [categories, setCategories] = useState([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [familyInfo, setFamilyInfo] = useState(null); // THÊM: family info để kiểm tra owner
  const [editingItem, setEditingItem] = useState(null); // THÊM: item đang edit
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', quantity: 1, notes: '', category: '' });
  const [editingSaving, setEditingSaving] = useState(false);
  
  // Delete modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // MỚI: controls & ui state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all'); // all | purchased | unpurchased
  const [sortBy, setSortBy] = useState('newest'); // newest | oldest | qty-desc | qty-asc
  const [exportOpen, setExportOpen] = useState(false);
  const [viewMode, setViewMode] = useState('note'); // note | table

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

  // Mở modal xóa
  const openDeleteModal = (item) => {
    setItemToDelete(item);
    setShowDeleteModal(true);
  };

  // Xóa item với API THẬT
  const deleteItem = async () => {
    if (!itemToDelete) return;
    
    setDeleting(true);
    try {
      console.log('Deleting item:', itemToDelete._id);
      const res = await fetch(`${API_BASE}/api/family/${selectedFamilyId}/shopping-list/${itemToDelete._id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Không thể xóa sản phẩm');
      }
      
      showNotification('Đã xóa sản phẩm khỏi danh sách', 'success');
      
      // Đóng modal và refresh danh sách
      setShowDeleteModal(false);
      setItemToDelete(null);
      await fetchShoppingList();
    } catch (err) {
      console.error("Error deleting item:", err);
      showNotification('Không thể xóa sản phẩm', 'error');
    } finally {
      setDeleting(false);
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

  // THÊM: Helper kiểm tra người dùng có phải là người tạo item không
  const isItemCreator = (item) => {
    if (!currentUser || !item.createdBy) return false;
    
    // Kiểm tra theo ID nếu createdBy là object
    if (typeof item.createdBy === 'object' && item.createdBy._id) {
      return String(item.createdBy._id) === String(currentUser.id);
    }
    
    // Kiểm tra theo ID nếu createdBy là string
    if (typeof item.createdBy === 'string') {
      return String(item.createdBy) === String(currentUser.id);
    }
    
    return false;
  };

  // THÊM: Helper kiểm tra có thể sửa item không (owner hoặc người tạo)
  const canEditItem = (item) => {
    return isOwner || isItemCreator(item);
  };

  // THÊM: Helper kiểm tra có thể xóa item không (owner hoặc người tạo)
  const canDeleteItem = (item) => {
    return isOwner || isItemCreator(item);
  };

  // Open edit modal (owner hoặc người tạo item)
  const openEditModal = (item) => {
    if (!canEditItem(item)) return;
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
    try {
      // Lọc các mục chưa mua
      const unpurchasedItems = (shoppingItems || []).filter(item => !item.purchased);
      
      if (unpurchasedItems.length === 0) {
        showNotification('Không có mục nào cần mua để xuất', 'info');
        return;
      }

      // Tạo nội dung file
      const content = generateExportContent(unpurchasedItems);
      
      // Tạo và tải file
      downloadFile(content, `danh-sach-mua-sam-${new Date().toISOString().split('T')[0]}.txt`, 'text/plain');
      
      showNotification(`Đã xuất ${unpurchasedItems.length} mục cần mua`, 'success');
    } catch (error) {
      console.error('Error exporting shopping list:', error);
      showNotification('Đã xảy ra lỗi khi xuất file: ' + error.message, 'error');
    }
  };

  // THÊM: Hàm tạo nội dung file xuất
  const generateExportContent = (items) => {
    try {
      if (!items || items.length === 0) {
        return 'Danh sách mua sắm trống';
      }

      const familyName = (familyInfo && familyInfo.name) ? familyInfo.name : 'Gia đình';
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
        if (!item) return;
        const categoryName = (item.categoryInfo && item.categoryInfo.name) ? item.categoryInfo.name : 'Không phân loại';
        if (!itemsByCategory[categoryName]) {
          itemsByCategory[categoryName] = [];
        }
        itemsByCategory[categoryName].push(item);
      });

      // Xuất từng danh mục
      Object.keys(itemsByCategory).forEach((categoryName, index) => {
        const categoryItems = itemsByCategory[categoryName];
        if (!categoryItems || categoryItems.length === 0) return;
        
        const categoryIcon = (categoryItems[0] && categoryItems[0].categoryInfo && categoryItems[0].categoryInfo.icon) 
          ? categoryItems[0].categoryInfo.icon 
          : '📝';
        
        content += `${categoryIcon} ${categoryName.toUpperCase()}\n`;
        content += '─'.repeat(50) + '\n';
        
        categoryItems.forEach((item, itemIndex) => {
          if (!item || !item.name) return;
          content += `${itemIndex + 1}. ${item.name || 'Không có tên'}`;
          if (item.quantity && item.quantity > 1) {
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
        if (!item || !item.name) return;
        content += `\n☐ ${item.name}`;
        if (item.quantity && item.quantity > 1) {
          content += ` (x${item.quantity})`;
        }
      });

      content += `

═══════════════════════════════════════════════════════════════
🏠 Được tạo từ ứng dụng quản lý gia đình
📱 ${window.location.origin}
`;

      return content;
    } catch (error) {
      console.error('Error generating export content:', error);
      return `Lỗi khi tạo nội dung xuất file: ${error.message}`;
    }
  };

  // THÊM: Hàm xuất định dạng PDF đơn giản (text format)
  const exportToPDF = () => {
    try {
      const unpurchasedItems = (shoppingItems || []).filter(item => !item.purchased);
      
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
      } else {
        showNotification('Không thể mở cửa sổ mới. Vui lòng cho phép popup.', 'error');
      }
      
      showNotification('Đã mở danh sách để in hoặc lưu PDF', 'success');
    } catch (error) {
      console.error('Error exporting to PDF:', error);
      showNotification('Đã xảy ra lỗi khi xuất PDF: ' + error.message, 'error');
    }
  };

  // THÊM: Hàm tạo HTML content cho PDF
  const generatePDFContent = (items) => {
    try {
      if (!items || items.length === 0) {
        return '<html><body><p>Danh sách mua sắm trống</p></body></html>';
      }

      const familyName = (familyInfo && familyInfo.name) ? familyInfo.name : 'Gia đình';
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
        if (!item) return;
        const categoryName = (item.categoryInfo && item.categoryInfo.name) 
          ? item.categoryInfo.name 
          : 'Không phân loại';
        if (!itemsByCategory[categoryName]) {
          itemsByCategory[categoryName] = [];
        }
        itemsByCategory[categoryName].push(item);
      });

      // Tạo HTML cho từng danh mục
      Object.keys(itemsByCategory).forEach((categoryName) => {
        const categoryItems = itemsByCategory[categoryName];
        if (!categoryItems || categoryItems.length === 0) return;
        
        const categoryIcon = (categoryItems[0] && categoryItems[0].categoryInfo && categoryItems[0].categoryInfo.icon)
          ? categoryItems[0].categoryInfo.icon
          : '📝';
        
        // Escape HTML để tránh XSS
        const safeCategoryName = categoryName.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        
        html += `
    <div class="category">
        <h3 class="category-title">${categoryIcon} ${safeCategoryName}</h3>
        <div class="items">`;
        
        categoryItems.forEach((item) => {
          if (!item || !item.name) return;
          
          // Escape HTML
          const safeItemName = item.name.replace(/</g, '&lt;').replace(/>/g, '&gt;');
          
          html += `
            <div class="item">
                <div class="checkbox"></div>
                <div class="item-name">${safeItemName}</div>`;
          
          if (item.quantity && item.quantity > 1) {
            html += `<div class="item-quantity">x${item.quantity}</div>`;
          }
          
          html += `</div>`;
          
          if (item.notes) {
            const safeNotes = item.notes.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            html += `<div class="item-notes">💬 ${safeNotes}</div>`;
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
    } catch (error) {
      console.error('Error generating PDF content:', error);
      return `<html><body><p>Lỗi khi tạo nội dung PDF: ${error.message}</p></body></html>`;
    }
  };

  // THÊM: Hàm tải file
  const downloadFile = (content, filename, contentType) => {
    try {
      if (!content) {
        throw new Error('Nội dung file trống');
      }
      
      const blob = new Blob([content], { type: contentType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      
      // Cleanup sau một chút thời gian
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 100);
    } catch (error) {
      console.error('Error downloading file:', error);
      showNotification('Đã xảy ra lỗi khi tải file: ' + error.message, 'error');
      throw error;
    }
  };

  // THÊM: Hàm xuất CSV
  const exportToCSV = () => {
    try {
      const unpurchasedItems = (shoppingItems || []).filter(item => !item.purchased);
      
      if (unpurchasedItems.length === 0) {
        showNotification('Không có mục nào cần mua để xuất', 'info');
        return;
      }

      // Tạo CSV content
      let csvContent = '\uFEFF'; // UTF-8 BOM for Excel compatibility
      csvContent += 'STT,Tên sản phẩm,Số lượng,Danh mục,Ghi chú,Người tạo,Ngày tạo\n';
      
      unpurchasedItems.forEach((item, index) => {
        if (!item) return;
        const row = [
          index + 1,
          `"${(item.name || '').replace(/"/g, '""')}"`,
          item.quantity || 1,
          `"${((item.categoryInfo && item.categoryInfo.name) ? item.categoryInfo.name : 'Không phân loại').replace(/"/g, '""')}"`,
          `"${(item.notes || '').replace(/"/g, '""')}"`,
          `"${(item.creatorName || 'Thành viên').replace(/"/g, '""')}"`,
          `"${item.createdAt ? new Date(item.createdAt).toLocaleDateString('vi-VN') : ''}"`
        ].join(',');
        csvContent += row + '\n';
      });
      
      downloadFile(csvContent, `danh-sach-mua-sam-${new Date().toISOString().split('T')[0]}.csv`, 'text/csv');
      showNotification(`Đã xuất ${unpurchasedItems.length} mục ra file CSV`, 'success');
    } catch (error) {
      console.error('Error exporting to CSV:', error);
      showNotification('Đã xảy ra lỗi khi xuất CSV: ' + error.message, 'error');
    }
  };

  // MỚI: stats và filtered list
  const stats = React.useMemo(() => {
    const total = shoppingItems.length;
    const purchased = shoppingItems.filter(i => i.purchased).length;
    const unpurchased = total - purchased;
    const totalQty = shoppingItems.reduce((s, it) => s + (Number(it.quantity) || 0), 0);
    return { total, purchased, unpurchased, totalQty };
  }, [shoppingItems]);

  const filteredItems = React.useMemo(() => {
    let items = (shoppingItems || []).slice();

    if (filterStatus === 'purchased') items = items.filter(i => i.purchased);
    if (filterStatus === 'unpurchased') items = items.filter(i => !i.purchased);

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      items = items.filter(i => (i.name || '').toLowerCase().includes(q) || (i.notes || '').toLowerCase().includes(q) || (i.creatorName || '').toLowerCase().includes(q));
    }

    if (sortBy === 'newest') items.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (sortBy === 'oldest') items.sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
    if (sortBy === 'qty-desc') items.sort((a,b) => (Number(b.quantity)||0) - (Number(a.quantity)||0));
    if (sortBy === 'qty-asc') items.sort((a,b) => (Number(a.quantity)||0) - (Number(b.quantity)||0));

    return items;
  }, [shoppingItems, filterStatus, searchQuery, sortBy]);

  // Debug: log state changes
  useEffect(() => {
    console.log('showAddModal state:', showAddModal);
  }, [showAddModal]);

  return (
    <div className="family-page">
      <FamilySidebar active="shopping-list" />
      
      <main className="family-main">
        {/* Header với dashboard style */}
        <header className="fsl-header">
          <div className="fsl-header-main">
            <h1><i className="fas fa-shopping-cart"></i> Danh sách mua sắm</h1>
            <p>Quản lý danh sách sản phẩm cần mua cho gia đình</p>
          </div>
        </header>

        {/* Dashboard Stats */}
        <div className="fsl-dashboard">
          <div className="fsl-stats-cards">
            <div className="fsl-stat-card total">
              <div className="fsl-stat-icon">
                <i className="fas fa-list"></i>
              </div>
              <div className="fsl-stat-content">
                <div className="fsl-stat-number">{stats.total}</div>
                <div className="fsl-stat-label">Tổng sản phẩm</div>
                <div className="fsl-stat-sub">Số lượng: {stats.totalQty}</div>
              </div>
            </div>

            <div className="fsl-stat-card purchased">
              <div className="fsl-stat-icon">
                <i className="fas fa-check-circle"></i>
              </div>
              <div className="fsl-stat-content">
                <div className="fsl-stat-number">{stats.purchased}</div>
                <div className="fsl-stat-label">Đã mua</div>
                <div className="fsl-stat-sub">Hoàn thành</div>
              </div>
            </div>

            <div className="fsl-stat-card pending">
              <div className="fsl-stat-icon">
                <i className="fas fa-shopping-basket"></i>
              </div>
              <div className="fsl-stat-content">
                <div className="fsl-stat-number">{stats.unpurchased}</div>
                <div className="fsl-stat-label">Cần mua</div>
                <div className="fsl-stat-sub">Còn lại</div>
              </div>
            </div>

            <div className="fsl-stat-card actions">
              <div className="fsl-stat-icon">
                <i className="fas fa-plus"></i>
              </div>
              <div className="fsl-stat-content">
                <button 
                  className="fsl-add-btn" 
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('Add button clicked, setting showAddModal to true');
                    setShowAddModal(true);
                  }} 
                  aria-label="Thêm sản phẩm mới"
                  type="button"
                >
                  <i className="fas fa-plus"></i>
                  <span className="fsl-add-text">Thêm sản phẩm mới</span>
                </button>
                 <div className="fsl-stat-sub">Thêm mới</div>
               </div>
             </div>
           </div>
 
           {/* Controls Row */}
           <div className="fsl-controls">
             <div className="fsl-search-controls">
               <div className="fsl-search-box">
                 <i className="fas fa-search"></i>
                 <input 
                   className="fsl-search-input" 
                   placeholder="Tìm sản phẩm hoặc người tạo..." 
                   value={searchQuery} 
                   onChange={e => setSearchQuery(e.target.value)} 
                 />
               </div>
               
               <select className="fsl-filter-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                 <option value="all">Tất cả trạng thái</option>
                 <option value="unpurchased">Chưa mua</option>
                 <option value="purchased">Đã mua</option>
               </select>
               
               <select className="fsl-sort-select" value={sortBy} onChange={e => setSortBy(e.target.value)}>
                 <option value="newest">Mới nhất</option>
                 <option value="oldest">Cũ nhất</option>
                 <option value="qty-desc">Số lượng lớn → nhỏ</option>
                 <option value="qty-asc">Số lượng nhỏ → lớn</option>
               </select>
             </div>

             <div className="fsl-action-controls">
               <div className="fsl-view-toggle">
                 <button 
                   className={`fsl-view-btn ${viewMode === 'note' ? 'active' : ''}`} 
                   onClick={() => setViewMode('note')}
                   title="Giao diện giấy note"
                 >
                   <i className="fas fa-sticky-note"></i>
                   Giấy note
                 </button>
                 <button 
                   className={`fsl-view-btn ${viewMode === 'table' ? 'active' : ''}`} 
                   onClick={() => setViewMode('table')}
                   title="Giao diện bảng"
                 >
                   <i className="fas fa-table"></i>
                   Bảng
                 </button>
               </div>

               <div className="fsl-export-dropdown">
                 <button className="fsl-export-btn" onClick={() => setExportOpen(!exportOpen)}>
                   <i className="fas fa-download"></i> Xuất file
                   <i className="fas fa-chevron-down"></i>
                 </button>
                 {exportOpen && (
                   <div className="fsl-export-menu">
                     <button onClick={() => { exportShoppingList(); setExportOpen(false); }}>
                       <i className="fas fa-file-alt"></i> File Text
                     </button>
                     <button onClick={() => { exportToPDF(); setExportOpen(false); }}>
                       <i className="fas fa-file-pdf"></i> PDF (In)
                     </button>
                     <button onClick={() => { exportToCSV(); setExportOpen(false); }}>
                       <i className="fas fa-file-csv"></i> File CSV
                     </button>
                   </div>
                 )}
               </div>
             </div>
           </div>
         </div>

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
              {filteredItems.length === 0 ? (
                <div className="fsl-empty-state">
                  <i className="fas fa-shopping-cart"></i>
                  <h3>Danh sách mua sắm trống</h3>
                  <p>Thử điều chỉnh bộ lọc hoặc thêm sản phẩm mới</p>
                  <button 
                    className="fsl-add-btn"
                    onClick={() => setShowAddModal(true)}
                    aria-label="Thêm sản phẩm mới"
                  >
                    <i className="fas fa-plus"></i> <span className="fsl-add-text">Thêm sản phẩm mới</span>
                  </button>
                </div>
              ) : viewMode === 'table' ? (
                <div className="fsl-table-container">
                  <table className="fsl-shopping-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Sản phẩm</th>
                        <th>Số lượng</th>
                        <th>Danh mục</th>
                        <th>Người tạo</th>
                        <th>Ngày tạo</th>
                        <th>Trạng thái</th>
                        <th>Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredItems.map((item, idx) => (
                        <tr key={item._id} className={`fsl-table-row ${item.purchased ? 'purchased' : ''}`}>
                          <td>{idx + 1}</td>
                          <td>
                            <div className="fsl-product-cell">
                              <div className="fsl-product-name">{item.name}</div>
                              {item.notes && <div className="fsl-product-notes">{item.notes}</div>}
                            </div>
                          </td>
                          <td>
                            <span className="fsl-quantity-badge">x{item.quantity}</span>
                          </td>
                          <td>
                            {item.categoryInfo ? (
                              <span className="fsl-category-tag">
                                <i className={item.categoryInfo.icon || 'fas fa-tag'}></i>
                                {item.categoryInfo.name}
                              </span>
                            ) : '—'}
                          </td>
                          <td>{item.creatorName || 'Thành viên'}</td>
                          <td>{new Date(item.createdAt).toLocaleDateString('vi-VN')}</td>
                          <td>
                            <span className={`fsl-status-badge ${item.purchased ? 'purchased' : 'pending'}`}>
                              {item.purchased ? 'Đã mua' : 'Chưa mua'}
                            </span>
                          </td>
                          <td>
                            <div className="fsl-table-actions">
                              {canEditItem(item) && (
                                <button className="fsl-action-btn edit" onClick={() => openEditModal(item)}>
                                  <i className="fas fa-edit"></i> <span className="btn-text">Sửa</span>
                                </button>
                              )}
                              <button 
                                className={`fsl-action-btn ${item.purchased ? 'undo' : 'check'}`} 
                                onClick={() => toggleItemPurchased(item._id, item.purchased)}
                              >
                                <i className={`fas ${item.purchased ? 'fa-undo' : 'fa-check'}`}></i>
                                <span className="btn-text">{item.purchased ? 'Chưa mua' : 'Đã mua'}</span>
                              </button>
                              {canDeleteItem(item) && (
                                <button className="fsl-action-btn delete" onClick={() => openDeleteModal(item)}>
                                  <i className="fas fa-trash"></i> <span className="btn-text">Xóa</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="fsl-notes-container">
                  {filteredItems.map(item => (
                    <div key={item._id} className={`fsl-note-item ${item.purchased ? 'purchased' : ''}`}>
                      <div className="fsl-note-header">
                        <div className="fsl-note-title">
                          <h4>{item.name}</h4>
                          <span className="fsl-note-quantity">x{item.quantity}</span>
                        </div>
                        {item.purchased && (
                          <div className="fsl-note-purchased">
                            <i className="fas fa-check-circle"></i>
                            Đã mua
                          </div>
                        )}
                      </div>

                      {item.categoryInfo && (
                        <div className="fsl-note-category">
                          <i className={item.categoryInfo.icon || 'fas fa-tag'}></i>
                          <span>{item.categoryInfo.name}</span>
                        </div>
                      )}

                      {item.notes && (
                        <div className="fsl-note-description">
                          <i className="fas fa-sticky-note"></i>
                          {item.notes}
                        </div>
                      )}

                      <div className="fsl-note-meta">
                        <span className="fsl-note-creator">
                          <i className="fas fa-user"></i>
                          {item.creatorName || 'Thành viên'}
                        </span>
                        <span className="fsl-note-date">
                          <i className="fas fa-calendar-alt"></i>
                          {new Date(item.createdAt).toLocaleDateString('vi-VN')}
                        </span>
                      </div>

                      <div className="fsl-note-actions">
                        {canEditItem(item) && (
                          <button className="fsl-note-btn edit" onClick={() => openEditModal(item)}>
                            <i className="fas fa-edit"></i>
                            Sửa
                          </button>
                        )}
                        <button 
                          className={`fsl-note-btn ${item.purchased ? 'undo' : 'check'}`} 
                          onClick={() => toggleItemPurchased(item._id, item.purchased)}
                        >
                          <i className={`fas ${item.purchased ? 'fa-undo' : 'fa-check'}`}></i>
                          {item.purchased ? 'Chưa mua' : 'Đã mua'}
                        </button>
                        {canDeleteItem(item) && (
                          <button className="fsl-note-btn delete" onClick={() => openDeleteModal(item)}>
                            <i className="fas fa-trash"></i>
                            Xóa
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* Add Item Modal */}
      {showAddModal && (
        <div 
          className="fsl-modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowAddModal(false);
            }
          }}
        >
          <div className="fsl-modal" onClick={(e) => e.stopPropagation()}>
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
                  <i className="fas fa-times"></i> Hủy
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
                      <i className="fas fa-plus-circle"></i> Thêm sản phẩm
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
                <button 
                  type="button" 
                  className="fsl-btn secondary" 
                  onClick={() => { setShowEditModal(false); setEditingItem(null); }} 
                  disabled={editingSaving}
                >
                  <i className="fas fa-times"></i> Hủy
                </button>
                <button 
                  type="submit" 
                  className="fsl-btn primary" 
                  disabled={editingSaving}
                >
                  {editingSaving ? (
                    <>
                      <i className="fas fa-spinner fa-spin"></i> Đang lưu...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-check-circle"></i> Lưu thay đổi
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && itemToDelete && (
        <div className="fsl-modal-overlay">
          <div className="fsl-modal fsl-delete-modal">
            <div className="fsl-modal-header">
              <h3>
                <i className="fas fa-exclamation-triangle"></i> Xác nhận xóa sản phẩm
              </h3>
              <button 
                className="fsl-modal-close"
                onClick={() => {
                  setShowDeleteModal(false);
                  setItemToDelete(null);
                }}
                disabled={deleting}
              >
                &times;
              </button>
            </div>
            
            <div className="fsl-form">
              <div className="fsl-delete-warning">
                <div className="fsl-delete-warning-icon">
                  <i className="fas fa-exclamation-triangle"></i>
                </div>
                <h4>Bạn có chắc chắn muốn xóa sản phẩm này?</h4>
                <p>Hành động này không thể hoàn tác!</p>
                
                <div className="fsl-delete-item-preview">
                  <div className="fsl-delete-item-preview-label">Thông tin sản phẩm:</div>
                  <div className="fsl-delete-item-preview-title">{itemToDelete.name}</div>
                  {itemToDelete.notes && (
                    <div className="fsl-delete-item-preview-desc">{itemToDelete.notes}</div>
                  )}
                  <div className="fsl-delete-item-preview-badges">
                    <span className="fsl-quantity-badge" style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '4px 12px',
                      background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                      color: 'white',
                      borderRadius: '12px',
                      fontSize: '12px',
                      fontWeight: 600
                    }}>
                      <i className="fas fa-box"></i>
                      Số lượng: x{itemToDelete.quantity}
                    </span>
                    {itemToDelete.categoryInfo && (
                      <span className="fsl-category-tag" style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '4px 12px',
                        background: 'linear-gradient(135deg, rgba(42, 82, 152, 0.1) 0%, rgba(78, 205, 196, 0.1) 100%)',
                        border: '1px solid rgba(42, 82, 152, 0.2)',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#2a5298'
                      }}>
                        <i className={itemToDelete.categoryInfo.icon || 'fas fa-tag'}></i>
                        {itemToDelete.categoryInfo.name}
                      </span>
                    )}
                    {itemToDelete.creatorName && (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '4px 12px',
                        background: '#e3f2fd',
                        color: '#1976d2',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: 500
                      }}>
                        <i className="fas fa-user"></i>
                        {itemToDelete.creatorName}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="fsl-form-actions">
                <button 
                  type="button" 
                  className="fsl-btn secondary"
                  onClick={() => {
                    setShowDeleteModal(false);
                    setItemToDelete(null);
                  }}
                  disabled={deleting}
                >
                  <i className="fas fa-times"></i> Hủy
                </button>
                <button 
                  type="button" 
                  className="fsl-btn danger"
                  onClick={deleteItem}
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
    </div>
  );
}
