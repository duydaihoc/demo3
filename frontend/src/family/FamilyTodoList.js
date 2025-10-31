import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import FamilySidebar from './FamilySidebar';
import './FamilyTodoList.css';
import { showNotification } from '../utils/notify';

export default function FamilyTodoList() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [todoItems, setTodoItems] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newItem, setNewItem] = useState({ 
    title: '', 
    description: '', 
    priority: 'medium', 
    dueDate: '',
    assignedTo: []
  });
  const [saving, setSaving] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [familyInfo, setFamilyInfo] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({ 
    title: '', 
    description: '', 
    priority: 'medium', 
    dueDate: '',
    assignedTo: []
  });
  const [editingSaving, setEditingSaving] = useState(false);

  // New: dashboard controls
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all'); // all | completed | pending | overdue
  const [filterPriority, setFilterPriority] = useState('all'); // all | high | medium | low
  const [sortBy, setSortBy] = useState('newest'); // newest | oldest | priority | due-date
  const [viewMode, setViewMode] = useState('note'); // note | table

  const API_BASE = 'http://localhost:5000';
  const token = localStorage.getItem('token');
  const selectedFamilyId = localStorage.getItem('selectedFamilyId');

  // FETCH family info để có danh sách thành viên
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

  // Fetch todo list từ API
  const fetchTodoList = useCallback(async () => {
    if (!token || !selectedFamilyId) return;
    setLoading(true);
    setError('');
    try {
      console.log('Fetching todo list for family:', selectedFamilyId);
      const res = await fetch(`${API_BASE}/api/family/${selectedFamilyId}/todo-list`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: Không thể tải danh sách việc cần làm`);
      }
      
      const data = await res.json();
      console.log('Todo list data:', data);
      setTodoItems(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error fetching todo list:", err);
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
    fetchFamilyInfo();
    fetchTodoList();
  }, [navigate, fetchFamilyInfo, fetchTodoList]);

  // Thêm item mới với API
  const handleAddItem = async (e) => {
    e.preventDefault();
    
    if (!newItem.title.trim()) {
      showNotification('Vui lòng nhập tiêu đề công việc', 'error');
      return;
    }
    
    setSaving(true);
    try {
      console.log('Creating new todo item:', newItem);
      const payload = {
        title: newItem.title.trim(),
        description: newItem.description?.trim() || '',
        priority: newItem.priority || 'medium',
        dueDate: newItem.dueDate || null,
        assignedTo: newItem.assignedTo || null
      };
      
      const res = await fetch(`${API_BASE}/api/family/${selectedFamilyId}/todo-list`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || `HTTP ${res.status}: Không thể thêm công việc`);
      }
      
      const responseData = await res.json();
      console.log('Todo item created successfully:', responseData);
      
      showNotification('Đã thêm công việc vào danh sách', 'success');
      setNewItem({ 
        title: '', 
        description: '', 
        priority: 'medium', 
        dueDate: '',
        assignedTo: []
      });
      setShowAddModal(false);
      
      // Refresh danh sách
      await fetchTodoList();
    } catch (err) {
      console.error("Error adding todo item:", err);
      showNotification(err.message || 'Đã xảy ra lỗi khi thêm công việc', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Toggle trạng thái hoàn thành cá nhân với API mới
  const toggleItemCompleted = async (itemId, currentStatus) => {
    try {
      console.log('Toggling personal completion status for item:', itemId);
      const res = await fetch(`${API_BASE}/api/family/${selectedFamilyId}/todo-list/${itemId}/toggle-completion`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Không thể cập nhật trạng thái');
      }
      
      showNotification('Đã cập nhật trạng thái hoàn thành', 'success');
      
      // Refresh danh sách
      await fetchTodoList();
    } catch (err) {
      console.error("Error updating todo item:", err);
      showNotification('Không thể cập nhật trạng thái công việc', 'error');
    }
  };

  // Xóa item với API
  const deleteItem = async (itemId) => {
    if (!window.confirm('Bạn có chắc muốn xóa công việc này?')) return;
    
    try {
      console.log('Deleting todo item:', itemId);
      const res = await fetch(`${API_BASE}/api/family/${selectedFamilyId}/todo-list/${itemId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Không thể xóa công việc');
      }
      
      showNotification('Đã xóa công việc khỏi danh sách', 'success');
      
      // Refresh danh sách
      await fetchTodoList();
    } catch (err) {
      console.error("Error deleting todo item:", err);
      showNotification('Không thể xóa công việc', 'error');
    }
  };

  // Helper: kiểm tra owner và người tạo
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

  const isItemCreator = (item) => {
    if (!currentUser || !item.createdBy) return false;
    
    if (typeof item.createdBy === 'object' && item.createdBy._id) {
      return String(item.createdBy._id) === String(currentUser.id);
    }
    
    if (typeof item.createdBy === 'string') {
      return String(item.createdBy) === String(currentUser.id);
    }
    
    return false;
  };

  const canEditItem = (item) => {
    return isOwner || isItemCreator(item);
  };

  const canToggleStatus = (item) => {
    if (!currentUser) return false;
    
    // Owner và người tạo luôn có thể toggle
    if (isOwner || isItemCreator(item)) return true;
    
    // Người được phân công cũng có thể toggle trạng thái
    if (item.assignedTo && Array.isArray(item.assignedTo)) {
      return item.assignedTo.some(assignee => 
        String(assignee._id || assignee) === String(currentUser.id)
      );
    }
    
    return false;
  };

  // Open edit modal
  const openEditModal = (item) => {
    if (!canEditItem(item)) return;
    setEditingItem(item);
    setEditForm({
      title: item.title || '',
      description: item.description || '',
      priority: item.priority || 'medium',
      dueDate: item.dueDate ? new Date(item.dueDate).toISOString().split('T')[0] : '',
      assignedTo: item.assignedTo ? item.assignedTo.map(assignee => assignee._id || assignee) : []
    });
    setShowEditModal(true);
  };

  // Submit edit
  const submitEdit = async (e) => {
    e.preventDefault();
    if (!editingItem) return;
    if (!editForm.title.trim()) {
      showNotification('Tiêu đề công việc không thể rỗng', 'error');
      return;
    }
    setEditingSaving(true);
    try {
      const payload = {
        title: editForm.title.trim(),
        description: editForm.description?.trim() || '',
        priority: editForm.priority || 'medium',
        dueDate: editForm.dueDate || null,
        assignedTo: editForm.assignedTo || null
      };
      const res = await fetch(`${API_BASE}/api/family/${selectedFamilyId}/todo-list/${editingItem._id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Không thể cập nhật công việc');
      }
      showNotification('Cập nhật công việc thành công', 'success');
      setShowEditModal(false);
      setEditingItem(null);
      await fetchTodoList();
    } catch (err) {
      console.error('Error updating todo item:', err);
      showNotification(err.message || 'Lỗi khi cập nhật công việc', 'error');
    } finally {
      setEditingSaving(false);
    }
  };

  // Helper: kiểm tra item đã quá hạn theo quy tắc "quá hạn từ ngày sau dueDate"
  const isItemExpired = (item) => {
    // nếu backend đã set flag isExpired => tôn trọng
    if (item?.isExpired) return true;
    if (!item?.dueDate) return false;
    try {
      const now = new Date();
      const due = new Date(item.dueDate);
      const effectiveDue = new Date(due.getTime() + 24 * 60 * 60 * 1000); // due + 1 ngày
      return effectiveDue < now;
    } catch (e) {
      return false;
    }
  };

  // Compute stats for dashboard (sử dụng isItemExpired)
  const stats = React.useMemo(() => {
    const total = todoItems.length;
    const completed = todoItems.filter(i => i.allCompleted).length;
    const pending = total - completed;
    const overdue = todoItems.filter(i => {
      if (!i.dueDate || i.allCompleted) return false;
      return isItemExpired(i);
    }).length;
    const highPriority = todoItems.filter(i => i.priority === 'high').length;
    return { total, completed, pending, overdue, highPriority };
  }, [todoItems]);

  // Filtered and sorted items
  const filteredItems = React.useMemo(() => {
    let items = (todoItems || []).slice();

    // Filter by status
    if (filterStatus === 'completed') items = items.filter(i => i.allCompleted);
    if (filterStatus === 'pending') items = items.filter(i => !i.allCompleted);
    if (filterStatus === 'overdue') {
      items = items.filter(i => {
        if (!i.dueDate || i.allCompleted) return false;
        return isItemExpired(i);
      });
    }

    // Filter by priority
    if (filterPriority !== 'all') {
      items = items.filter(i => i.priority === filterPriority);
    }

    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      items = items.filter(i => 
        (i.title || '').toLowerCase().includes(q) ||
        (i.description || '').toLowerCase().includes(q) ||
        (i.creatorName || '').toLowerCase().includes(q) ||
        (i.assignedToNames && i.assignedToNames.some(name => name.toLowerCase().includes(q)))
      );
    }

    // Sort
    if (sortBy === 'newest') items.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (sortBy === 'oldest') items.sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
    if (sortBy === 'priority') {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      items.sort((a,b) => priorityOrder[b.priority] - priorityOrder[a.priority]);
    }
    if (sortBy === 'due-date') {
      items.sort((a,b) => {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate) - new Date(b.dueDate);
      });
    }

    return items;
  }, [todoItems, filterStatus, filterPriority, searchQuery, sortBy]);

  // Helper functions
  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high': return '#ef4444';
      case 'medium': return '#f59e0b';
      case 'low': return '#10b981';
      default: return '#6b7280';
    }
  };

  const getPriorityLabel = (priority) => {
    switch (priority) {
      case 'high': return 'Cao';
      case 'medium': return 'Trung bình';
      case 'low': return 'Thấp';
      default: return 'Không xác định';
    }
  };

  // Helper: lấy danh sách công việc quá hạn cho owner
  const getOverdueTasks = React.useMemo(() => {
    if (!isOwner) return [];
    return todoItems.filter(item => {
      if (item.allCompleted) return false;
      if (!item.dueDate) return false;
      return isItemExpired(item);
    });
  }, [todoItems, isOwner]);

  // Helper: lấy danh sách công việc sắp đến hạn
  const getNearDeadlineTasks = React.useMemo(() => {
    if (!isOwner) return [];
    return todoItems.filter(item => {
      if (item.allCompleted) return false;
      if (!item.dueDate) return false;
      const now = new Date();
      const due = new Date(item.dueDate);
      const effectiveDue = new Date(due.getTime() + 24 * 60 * 60 * 1000);
      const hoursDiff = (effectiveDue - now) / (1000 * 3600);
      return hoursDiff > 0 && hoursDiff <= 24;
    });
  }, [todoItems, isOwner]);

  return (
    <div className="family-page">
      <FamilySidebar active="todo-list" collapsed={sidebarCollapsed} />
      
      <main className={`family-main ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        {/* Toggle sidebar button */}
        <button 
          className="sidebar-toggle-btn"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          title={sidebarCollapsed ? 'Mở sidebar' : 'Thu gọn sidebar'}
        >
          <i className={`fas ${sidebarCollapsed ? 'fa-bars' : 'fa-times'}`}></i>
        </button>
        
        {/* Header với dashboard style */}
        <header className="ftl-header">
          <div className="ftl-header-main">
            <h1><i className="fas fa-tasks"></i> Danh sách việc cần làm</h1>
            <p>Quản lý công việc gia đình và phân công nhiệm vụ</p>
          </div>
        </header>

        {/* CẢNH BÁO QUÁ HẠN - chỉ hiển thị cho owner */}
        {isOwner && (getOverdueTasks.length > 0 || getNearDeadlineTasks.length > 0) && (
          <div className="ftl-alerts-section">
            {getOverdueTasks.length > 0 && (
              <div className="ftl-alert ftl-overdue-alert">
                <div className="ftl-alert-icon">
                  <i className="fas fa-exclamation-triangle"></i>
                </div>
                <div className="ftl-alert-content">
                  <h4>Có {getOverdueTasks.length} công việc đã quá hạn!</h4>
                  <p>Cần chú ý và xử lý ngay để tránh ảnh hưởng đến tiến độ gia đình.</p>
                  <div className="ftl-alert-tasks">
                    {getOverdueTasks.slice(0, 3).map(task => (
                      <span key={task._id} className="ftl-alert-task-item">
                        {task.title}
                      </span>
                    ))}
                    {getOverdueTasks.length > 3 && (
                      <span className="ftl-alert-more">+{getOverdueTasks.length - 3} công việc khác</span>
                    )}
                  </div>
                </div>
                <button className="ftl-alert-close" onClick={() => {/* Có thể thêm logic để ẩn cảnh báo */}}>
                  <i className="fas fa-times"></i>
                </button>
              </div>
            )}
            
            {getNearDeadlineTasks.length > 0 && getOverdueTasks.length === 0 && (
              <div className="ftl-alert ftl-deadline-alert">
                <div className="ftl-alert-icon">
                  <i className="fas fa-clock"></i>
                </div>
                <div className="ftl-alert-content">
                  <h4>Có {getNearDeadlineTasks.length} công việc sắp đến hạn!</h4>
                  <p>Còn ít hơn 24 giờ để hoàn thành. Hãy theo dõi tiến độ.</p>
                  <div className="ftl-alert-tasks">
                    {getNearDeadlineTasks.slice(0, 3).map(task => (
                      <span key={task._id} className="ftl-alert-task-item">
                        {task.title}
                      </span>
                    ))}
                    {getNearDeadlineTasks.length > 3 && (
                      <span className="ftl-alert-more">+{getNearDeadlineTasks.length - 3} công việc khác</span>
                    )}
                  </div>
                </div>
                <button className="ftl-alert-close" onClick={() => {/* Có thể thêm logic để ẩn cảnh báo */}}>
                  <i className="fas fa-times"></i>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Dashboard Stats */}
        <div className="ftl-dashboard">
          <div className="ftl-stats-cards">
            <div className="ftl-stat-card total">
              <div className="ftl-stat-icon">
                <i className="fas fa-list-check"></i>
              </div>
              <div className="ftl-stat-content">
                <div className="ftl-stat-number">{stats.total}</div>
                <div className="ftl-stat-label">Tổng công việc</div>
                <div className="ftl-stat-sub">Đã tạo</div>
              </div>
            </div>

            <div className="ftl-stat-card completed">
              <div className="ftl-stat-icon">
                <i className="fas fa-check-circle"></i>
              </div>
              <div className="ftl-stat-content">
                <div className="ftl-stat-number">{stats.completed}</div>
                <div className="ftl-stat-label">Đã hoàn thành</div>
                <div className="ftl-stat-sub">Hoàn tất</div>
              </div>
            </div>

            <div className="ftl-stat-card pending">
              <div className="ftl-stat-icon">
                <i className="fas fa-clock"></i>
              </div>
              <div className="ftl-stat-content">
                <div className="ftl-stat-number">{stats.pending}</div>
                <div className="ftl-stat-label">Đang thực hiện</div>
                <div className="ftl-stat-sub">Chưa xong</div>
              </div>
            </div>

            <div className="ftl-stat-card overdue">
              <div className="ftl-stat-icon">
                <i className="fas fa-exclamation-triangle"></i>
              </div>
              <div className="ftl-stat-content">
                <div className="ftl-stat-number">{stats.overdue}</div>
                <div className="ftl-stat-label">Quá hạn</div>
                <div className="ftl-stat-sub">Cần chú ý</div>
              </div>
            </div>
          </div>

          {/* Controls Row */}
          <div className="ftl-controls">
            <div className="ftl-search-controls">
              <div className="ftl-search-box">
                <i className="fas fa-search"></i>
                <input 
                  className="ftl-search-input" 
                  placeholder="Tìm công việc hoặc người phân công..." 
                  value={searchQuery} 
                  onChange={e => setSearchQuery(e.target.value)} 
                />
              </div>
              
              <select className="ftl-filter-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                <option value="all">Tất cả trạng thái</option>
                <option value="pending">Đang thực hiện</option>
                <option value="completed">Đã hoàn thành</option>
                <option value="overdue">Quá hạn</option>
              </select>
              
              <select className="ftl-priority-select" value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
                <option value="all">Tất cả ưu tiên</option>
                <option value="high">Ưu tiên cao</option>
                <option value="medium">Ưu tiên trung bình</option>
                <option value="low">Ưu tiên thấp</option>
              </select>
              
              <select className="ftl-sort-select" value={sortBy} onChange={e => setSortBy(e.target.value)}>
                <option value="newest">Mới nhất</option>
                <option value="oldest">Cũ nhất</option>
                <option value="priority">Theo ưu tiên</option>
                <option value="due-date">Theo hạn</option>
              </select>
            </div>

            <div className="ftl-action-controls">
              <div className="ftl-view-toggle">
                <button 
                  className={`ftl-view-btn ${viewMode === 'note' ? 'active' : ''}`} 
                  onClick={() => setViewMode('note')}
                  title="Giao diện giấy note"
                >
                  <i className="fas fa-sticky-note"></i>
                  Giấy note
                </button>
                <button 
                  className={`ftl-view-btn ${viewMode === 'table' ? 'active' : ''}`} 
                  onClick={() => setViewMode('table')}
                  title="Giao diện bảng"
                >
                  <i className="fas fa-table"></i>
                  Bảng
                </button>
              </div>

              {isOwner && (
                <button className="ftl-add-btn" onClick={() => setShowAddModal(true)} aria-label="Thêm công việc mới">
                  <i className="fas fa-plus"></i>
                  <span className="ftl-add-text">Thêm công việc</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Todo List Content */}
        <div className="ftl-content">
          {loading ? (
            <div className="ftl-loading">
              <div className="ftl-loading-spinner"></div>
              <p>Đang tải danh sách việc cần làm...</p>
            </div>
          ) : error ? (
            <div className="ftl-error">
              <i className="fas fa-exclamation-triangle"></i>
              <p>{error}</p>
              <button onClick={fetchTodoList} className="ftl-retry-btn">
                Thử lại
              </button>
            </div>
          ) : (
            <>
              {filteredItems.length === 0 ? (
                <div className="ftl-empty-state">
                  <i className="fas fa-tasks"></i>
                  <h3>Danh sách việc cần làm trống</h3>
                  <p>Thử điều chỉnh bộ lọc hoặc thêm công việc mới</p>
                  {isOwner && (
                    <button 
                      className="ftl-add-btn"
                      onClick={() => setShowAddModal(true)}
                      aria-label="Thêm công việc mới"
                    >
                      <i className="fas fa-plus"></i> <span className="ftl-add-text">Thêm công việc mới</span>
                    </button>
                  )}
                </div>
              ) : viewMode === 'table' ? (
                <div className="ftl-table-container">
                  <table className="ftl-todo-table">
                    <thead>
                      <tr>
                        <th>Công việc</th>
                        <th>Ưu tiên</th>
                        <th>Phân công</th>
                        <th>Hạn</th>
                        <th>Tiến độ</th>
                        <th>Trạng thái</th>
                        <th>Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredItems.map(item => (
                        <tr key={item._id} className={`ftl-table-row ${item.allCompleted ? 'completed' : ''}`}>
                          <td>
                            <div className="ftl-table-task">
                              <div className="ftl-table-title">{item.title}</div>
                              {item.description && <div className="ftl-table-desc">{item.description}</div>}
                            </div>
                          </td>
                          <td>
                            <span className="ftl-priority-badge" style={{ backgroundColor: getPriorityColor(item.priority) }}>
                              {getPriorityLabel(item.priority)}
                            </span>
                          </td>
                          <td>
                            {item.assignedToNames && item.assignedToNames.length > 0 
                              ? item.assignedToNames.join(', ') 
                              : '—'
                            }
                          </td>
                          <td>
                            {item.dueDate ? new Date(item.dueDate).toLocaleDateString('vi-VN') : '—'}
                          </td>
                          <td>
                            <span className="ftl-progress-badge">
                              {item.completedCount}/{item.totalAssigned} ({item.completionPercentage}%)
                            </span>
                          </td>
                          <td>
                            <span className={`ftl-status-badge ${item.allCompleted ? 'completed' : 'pending'}`}>
                              {item.allCompleted ? 'Hoàn thành' : 'Đang thực hiện'}
                            </span>
                          </td>
                          <td>
                            <div className="ftl-table-actions">
                              {canEditItem(item) && (
                                <button className="ftl-action-btn edit" onClick={() => openEditModal(item)}>
                                  <i className="fas fa-edit"></i> Sửa
                                </button>
                              )}
                              {canToggleStatus(item) && !item.allCompleted && !isItemExpired(item) && (
                                <button 
                                  className={`ftl-action-btn ${item.allCompleted ? 'undo' : 'check'}`} 
                                  onClick={() => toggleItemCompleted(item._id, item.completed)}
                                >
                                  <i className={`fas ${item.allCompleted ? 'fa-undo' : 'fa-check'}`}></i>
                                  {item.allCompleted ? 'Chưa xong' : 'Hoàn thành'}
                                </button>
                              )}
                              {/* Nếu quá hạn và không thể hoàn thành, vẫn có thể hiển thị trạng thái expired nếu cần */}
                              {isItemExpired(item) && !item.allCompleted && (
                                <span className="ftl-expired-note" title="Đã quá hạn, không thể hoàn thành">Đã quá hạn</span>
                              )}
                              {canEditItem(item) && (
                                <button className="ftl-action-btn delete" onClick={() => deleteItem(item._id)}>
                                  <i className="fas fa-trash"></i> Xóa
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
                <div className="ftl-notes-container">
                  {filteredItems.map(item => (
                    <div key={item._id} className={`ftl-note-item ${item.allCompleted ? 'completed' : ''}`}>
                      <div className="ftl-note-header">
                        <div className="ftl-note-title">
                          <h4>{item.title}</h4>
                          <div className="ftl-note-badges">
                            <span 
                              className="ftl-priority-badge"
                              style={{ backgroundColor: getPriorityColor(item.priority) }}
                            >
                              {getPriorityLabel(item.priority)}
                            </span>
                            {item.dueDate && (
                              <span className={`ftl-due-badge ${(() => {
                                const now = new Date();
                                const due = new Date(item.dueDate);
                                // sử dụng effectiveDue để phân loại overdue / near-deadline
                                const effectiveDue = new Date(due.getTime() + 24 * 60 * 60 * 1000);
                                if (effectiveDue < now) return 'overdue';
                                const hoursDiff = (effectiveDue - now) / (1000 * 3600);
                                if (hoursDiff <= 24) return 'near-deadline';
                                return '';
                              })()}`}>
                                <i className="fas fa-calendar-alt"></i> 
                                {new Date(item.dueDate).toLocaleDateString('vi-VN')}
                              </span>
                            )}
                          </div>
                        </div>
                        {item.allCompleted && (
                          <div className="ftl-note-completed">
                            <i className="fas fa-check-circle"></i>
                            Hoàn thành
                          </div>
                        )}
                      </div>

                      {/* THÊM: CẢNH BÁO QUÁ HẠN VÀ THỜI GIAN CÒN LẠI */}
                      {item.dueDate && !item.allCompleted && (() => {
                        const now = new Date();
                        const due = new Date(item.dueDate);
                        // THÊM: Cộng thêm 1 ngày vào dueDate để công việc quá hạn từ ngày sau hạn
                        const effectiveDue = new Date(due.getTime() + 24 * 60 * 60 * 1000);
                        const timeDiff = effectiveDue.getTime() - now.getTime();
                        const hoursDiff = timeDiff / (1000 * 3600);
                        const daysDiff = Math.floor(hoursDiff / 24);
                        const remainingHours = Math.floor(hoursDiff % 24);
                        
                        if (hoursDiff < 0) {
                          // Quá hạn - hiển thị thông báo và ẩn nút hoàn thành
                          const overdueHours = Math.abs(Math.floor(hoursDiff));
                          const overdueDays = Math.floor(overdueHours / 24);
                          return (
                            <div className="ftl-note-alert ftl-overdue-alert ftl-expired">
                              <i className="fas fa-exclamation-triangle"></i>
                              <span>
                                Đã quá hạn {overdueDays > 0 ? `${overdueDays} ngày ${overdueHours % 24}h` : `${overdueHours}h`} - không thể hoàn thành nữa!
                              </span>
                            </div>
                          );
                        } else if (hoursDiff <= 24) {
                          // Còn dưới 24h
                          return (
                            <div className="ftl-note-alert ftl-deadline-alert">
                              <i className="fas fa-clock"></i>
                              <span>
                                Còn {daysDiff > 0 ? `${daysDiff} ngày ${remainingHours}h` : `${Math.floor(hoursDiff)}h`} nữa!
                              </span>
                            </div>
                          );
                        }
                        return null;
                      })()}

                      {item.description && (
                        <div className="ftl-note-description">
                          <i className="fas fa-sticky-note"></i>
                          {item.description}
                        </div>
                      )}

                      {item.assignedToNames && item.assignedToNames.length > 0 && (
                        <div className="ftl-note-assigned">
                          <i className="fas fa-user-tag"></i>
                          Phân công: {item.assignedToNames.join(', ')}
                        </div>
                      )}

                      <div className="ftl-note-progress">
                        <div className="ftl-progress-bar">
                          <div 
                            className="ftl-progress-fill"
                            style={{ width: `${item.completionPercentage}%` }}
                          ></div>
                        </div>
                        <span className="ftl-progress-text">
                          {item.completedCount}/{item.totalAssigned} hoàn thành ({item.completionPercentage}%)
                        </span>
                      </div>

                      <div className="ftl-note-meta">
                        <span className="ftl-note-creator">
                          <i className="fas fa-user"></i> {item.creatorName || 'Thành viên'}
                        </span>
                        <span className="ftl-note-date">
                          <i className="fas fa-calendar-alt"></i> {new Date(item.createdAt).toLocaleDateString('vi-VN')}
                        </span>
                      </div>

                      <div className="ftl-note-actions">
                        {canEditItem(item) && (
                          <button className="ftl-note-btn edit" onClick={() => openEditModal(item)}>
                            <i className="fas fa-edit"></i>
                            Sửa
                          </button>
                        )}
                        {/* ẨN NÚT HOÀN THÀNH NẾU QUÁ HẠN */}
                        {canToggleStatus(item) && !item.allCompleted && (!item.dueDate || !isItemExpired(item)) && (
                          <button 
                            className={`ftl-note-btn ${item.allCompleted ? 'undo' : 'check'}`} 
                            onClick={() => toggleItemCompleted(item._id, item.completed)}
                          >
                            <i className={`fas ${item.allCompleted ? 'fa-undo' : 'fa-check'}`}></i>
                            {item.allCompleted ? 'Chưa xong' : 'Hoàn thành'}
                          </button>
                        )}
                        {canEditItem(item) && (
                          <button className="ftl-note-btn delete" onClick={() => deleteItem(item._id)}>
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
        <div className="ftl-modal-overlay">
          <div className="ftl-modal">
            <div className="ftl-modal-header">
              <h3>Thêm công việc mới</h3>
              <button 
                className="ftl-modal-close"
                onClick={() => setShowAddModal(false)}
              >
                &times;
              </button>
            </div>
            
            <form onSubmit={handleAddItem} className="ftl-form">
              <div className="ftl-form-group">
                <label>Tiêu đề *</label>
                <input
                  type="text"
                  value={newItem.title}
                  onChange={(e) => setNewItem({...newItem, title: e.target.value})}
                  placeholder="Nhập tiêu đề công việc"
                  required
                />
              </div>
              
              <div className="ftl-form-group">
                <label>Mô tả</label>
                <textarea
                  value={newItem.description}
                  onChange={(e) => setNewItem({...newItem, description: e.target.value})}
                  placeholder="Mô tả chi tiết công việc (tùy chọn)"
                  rows={3}
                />
              </div>
              
              <div className="ftl-form-row">
                <div className="ftl-form-group">
                  <label>Độ ưu tiên</label>
                  <select
                    value={newItem.priority}
                    onChange={(e) => setNewItem({...newItem, priority: e.target.value})}
                  >
                    <option value="low">Thấp</option>
                    <option value="medium">Trung bình</option>
                    <option value="high">Cao</option>
                  </select>
                </div>
                
                <div className="ftl-form-group">
                  <label>Phân công cho</label>
                  <select
                    multiple
                    value={newItem.assignedTo}
                    onChange={(e) => {
                      const selectedValues = Array.from(e.target.selectedOptions, option => option.value);
                      setNewItem({...newItem, assignedTo: selectedValues});
                    }}
                    style={{ minHeight: '100px' }}
                  >
                    {familyInfo?.members?.map(member => (
                      <option key={member.user._id} value={member.user._id}>
                        {member.user.name} {member.user._id === currentUser?.id ? '(Bạn)' : ''}
                      </option>
                    ))}
                  </select>
                  <small style={{ color: '#94a3b8', fontSize: '12px', marginTop: '4px' }}>
                    Giữ Ctrl (Windows) hoặc Cmd (Mac) để chọn nhiều người. Bỏ chọn tất cả để không phân công cho ai.
                  </small>
                </div>
              </div>

              <div className="ftl-form-group">
                <label>Ngày đến hạn</label>
                <input
                  type="date"
                  value={newItem.dueDate}
                  onChange={(e) => setNewItem({...newItem, dueDate: e.target.value})}
                />
              </div>
              
              <div className="ftl-form-actions">
                <button 
                  type="button" 
                  className="ftl-btn secondary"
                  onClick={() => setShowAddModal(false)}
                  disabled={saving}
                >
                  Hủy
                </button>
                <button 
                  type="submit" 
                  className="ftl-btn primary"
                  disabled={saving}
                >
                  {saving ? (
                    <>
                      <i className="fas fa-spinner fa-spin"></i> Đang lưu...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-save"></i> Thêm công việc
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Item Modal */}
      {showEditModal && editingItem && (
        <div className="ftl-modal-overlay">
          <div className="ftl-modal">
            <div className="ftl-modal-header">
              <h3>Chỉnh sửa công việc</h3>
              <button className="ftl-modal-close" onClick={() => { setShowEditModal(false); setEditingItem(null); }}>
                &times;
              </button>
            </div>

            <form onSubmit={submitEdit} className="ftl-form">
              <div className="ftl-form-group">
                <label>Tiêu đề *</label>
                <input
                  type="text"
                  value={editForm.title}
                  onChange={(e) => setEditForm({...editForm, title: e.target.value})}
                  required
                />
              </div>

              <div className="ftl-form-group">
                <label>Mô tả</label>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm({...editForm, description: e.target.value})}
                  rows={3}
                />
              </div>

              <div className="ftl-form-row">
                <div className="ftl-form-group">
                  <label>Độ ưu tiên</label>
                  <select
                    value={editForm.priority}
                    onChange={(e) => setEditForm({...editForm, priority: e.target.value})}
                  >
                    <option value="low">Thấp</option>
                    <option value="medium">Trung bình</option>
                    <option value="high">Cao</option>
                  </select>
                </div>
                
                <div className="ftl-form-group">
                  <label>Phân công cho</label>
                  <select
                    multiple
                    value={editForm.assignedTo}
                    onChange={(e) => {
                      const selectedValues = Array.from(e.target.selectedOptions, option => option.value);
                      setEditForm({...editForm, assignedTo: selectedValues});
                    }}
                    style={{ minHeight: '100px' }}
                  >
                    {familyInfo?.members?.map(member => (
                      <option key={member.user._id} value={member.user._id}>
                        {member.user.name} {member.user._id === currentUser?.id ? '(Bạn)' : ''}
                      </option>
                    ))}
                  </select>
                  <small style={{ color: '#94a3b8', fontSize: '12px', marginTop: '4px' }}>
                    Giữ Ctrl (Windows) hoặc Cmd (Mac) để chọn nhiều người. Bỏ chọn tất cả để không phân công cho ai.
                  </small>
                </div>
              </div>

              <div className="ftl-form-group">
                <label>Ngày đến hạn</label>
                <input
                  type="date"
                  value={editForm.dueDate}
                  onChange={(e) => setEditForm({...editForm, dueDate: e.target.value})}
                />
              </div>

              <div className="ftl-form-actions">
                <button type="button" className="ftl-btn secondary" onClick={() => { setShowEditModal(false); setEditingItem(null); }} disabled={editingSaving}>Hủy</button>
                <button type="submit" className="ftl-btn primary" disabled={editingSaving}>
                  {editingSaving ? <><i className="fas fa-spinner fa-spin"></i> Đang lưu...</> : <><i className="fas fa-save"></i> Lưu</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
