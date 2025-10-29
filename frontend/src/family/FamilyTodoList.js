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
    assignedTo: [] // THAY ĐỔI: khởi tạo là mảng rỗng
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
    assignedTo: [] // THAY ĐỔI: khởi tạo là mảng rỗng
  });
  const [editingSaving, setEditingSaving] = useState(false);

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
        assignedTo: [] // THAY ĐỔI: reset về mảng rỗng
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
    // THAY ĐỔI: Sử dụng thông tin từ API nếu có, fallback về logic cũ
    if (item.canEdit !== undefined) {
      return item.canEdit;
    }
    return isOwner || isItemCreator(item);
  };

  // THÊM: Helper để kiểm tra có thể toggle trạng thái không
  const canToggleStatus = (item) => {
    if (!currentUser) return false;
    
    // Owner và người tạo luôn có thể toggle
    if (isOwner || isItemCreator(item)) return true;
    
    // THAY ĐỔI: Người được phân công cũng có thể toggle trạng thái (kiểm tra mảng)
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
      // THAY ĐỔI: assignedTo là mảng
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

  // Helper: kiểm tra cảnh báo quá hạn cho thành viên được giao
  const isOverdueForAssigned = (item) => {
    if (!item || !item.dueDate || item.allCompleted) return false;
    if (!item.assignedTo || !Array.isArray(item.assignedTo)) return false;
    if (!currentUser) return false;
    
    // Kiểm tra currentUser có trong danh sách được phân công không
    const isAssigned = item.assignedTo.some(assignee => 
      String(assignee._id || assignee) === String(currentUser.id)
    );
    if (!isAssigned) return false;
    
    // Kiểm tra currentUser đã hoàn thành chưa
    const userCompletion = item.completionDetails?.find(detail => 
      String(detail.user?._id || detail.user) === String(currentUser.id)
    );
    
    // Nếu user đã hoàn thành thì không hiển thị cảnh báo
    if (userCompletion && userCompletion.completed) return false;
    
    // Kiểm tra đã quá hạn chưa
    const now = new Date();
    const due = new Date(item.dueDate);
    return now > due;
  };

  // THÊM: Helper kiểm tra cảnh báo sắp đến hạn (còn 1 ngày)
  const isNearDeadlineForAssigned = (item) => {
    if (!item || !item.dueDate || item.allCompleted) return false;
    if (!item.assignedTo || !Array.isArray(item.assignedTo)) return false;
    if (!currentUser) return false;
    
    // Kiểm tra currentUser có trong danh sách được phân công không
    const isAssigned = item.assignedTo.some(assignee => 
      String(assignee._id || assignee) === String(currentUser.id)
    );
    if (!isAssigned) return false;
    
    // Kiểm tra currentUser đã hoàn thành chưa
    const userCompletion = item.completionDetails?.find(detail => 
      String(detail.user?._id || detail.user) === String(currentUser.id)
    );
    
    // Nếu user đã hoàn thành thì không hiển thị cảnh báo
    if (userCompletion && userCompletion.completed) return false;
    
    // Kiểm tra còn <= 24 giờ
    const now = new Date();
    const due = new Date(item.dueDate);
    const timeDiff = due.getTime() - now.getTime();
    const hoursDiff = timeDiff / (1000 * 3600);
    
    return hoursDiff > 0 && hoursDiff <= 24;
  };

  // THÊM: Helper để lấy danh sách những người chưa hoàn thành và đã quá hạn
  const getOverdueMembers = (item) => {
    if (!item || !item.dueDate || item.allCompleted) return [];
    if (!item.completionDetails || !Array.isArray(item.completionDetails)) return [];
    
    const now = new Date();
    const due = new Date(item.dueDate);
    
    // Chỉ hiển thị nếu đã quá hạn
    if (now <= due) return [];
    
    // Lấy danh sách những người chưa hoàn thành
    return item.completionDetails
      .filter(detail => !detail.completed && detail.user)
      .map(detail => detail.user.name || 'Thành viên');
  };

  // THÊM: Helper để lấy danh sách những người sắp đến hạn (còn 1 ngày)
  const getNearDeadlineMembers = (item) => {
    if (!item || !item.dueDate || item.allCompleted) return [];
    if (!item.completionDetails || !Array.isArray(item.completionDetails)) return [];
    
    const now = new Date();
    const due = new Date(item.dueDate);
    const timeDiff = due.getTime() - now.getTime();
    const hoursDiff = timeDiff / (1000 * 3600);
    
    // Chỉ hiển thị nếu còn <= 24 giờ và > 0
    if (hoursDiff <= 0 || hoursDiff > 24) return [];
    
    // Lấy danh sách những người chưa hoàn thành
    return item.completionDetails
      .filter(detail => !detail.completed && detail.user)
      .map(detail => detail.user.name || 'Thành viên');
  };

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
        
        <header className="ftl-header">
          <h1>Danh sách việc cần làm</h1>
          <p>
            {isOwner 
              ? 'Quản lý các công việc cần hoàn thành' 
              : 'Các công việc được phân công cho bạn'
            }
          </p>
          
          <div className="ftl-actions">
            {/* THAY ĐỔI: Chỉ hiển thị nút thêm cho owner */}
            {isOwner && (
              <button 
                className="ftl-btn primary"
                onClick={() => setShowAddModal(true)}
              >
                <i className="fas fa-plus"></i> Thêm công việc
              </button>
            )}
          </div>
        </header>

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
              {todoItems.length === 0 ? (
                <div className="ftl-empty-state">
                  <i className="fas fa-tasks"></i>
                  <h3>
                    {isOwner 
                      ? 'Danh sách việc cần làm trống' 
                      : 'Chưa có công việc nào được phân công cho bạn'
                    }
                  </h3>
                  <p>
                    {isOwner 
                      ? 'Bắt đầu thêm công việc đầu tiên của bạn'
                      : 'Chủ gia đình sẽ phân công công việc cho bạn'
                    }
                  </p>
                  {/* THAY ĐỔI: Chỉ hiển thị nút thêm cho owner */}
                  {isOwner && (
                    <button 
                      className="ftl-btn primary"
                      onClick={() => setShowAddModal(true)}
                    >
                      <i className="fas fa-plus"></i> Thêm công việc
                    </button>
                  )}
                </div>
              ) : (
                <div className="ftl-items-list">
                  {todoItems.map(item => (
                    <div key={item._id} className={`ftl-item ${item.allCompleted ? 'completed' : ''}`}>
                      <div className="ftl-item-content">
                        {/* THÊM: Hiển thị cảnh báo quá hạn cho thành viên được giao (cá nhân) */}
                        {isOverdueForAssigned(item) && (
                          <div className="ftl-warning-banner ftl-overdue-personal">
                            <i className="fas fa-exclamation-triangle"></i>
                            <strong>Bạn đã quá hạn!</strong> Công việc này đã đến hạn nhưng bạn chưa hoàn thành.
                          </div>
                        )}

                        {/* THÊM: Hiển thị cảnh báo sắp đến hạn cho thành viên được giao (cá nhân) */}
                        {isNearDeadlineForAssigned(item) && (
                          <div className="ftl-warning-banner ftl-near-deadline-personal">
                            <i className="fas fa-clock"></i>
                            <strong>Sắp đến hạn!</strong> Còn ít hơn 24 giờ để hoàn thành công việc này.
                          </div>
                        )}

                        {/* THÊM: Hiển thị cảnh báo tổng thể cho owner về thành viên quá hạn */}
                        {isOwner && (() => {
                          const overdueMembers = getOverdueMembers(item);
                          const nearDeadlineMembers = getNearDeadlineMembers(item);
                          
                          return (
                            <>
                              {overdueMembers.length > 0 && (
                                <div className="ftl-warning-banner ftl-overdue-members">
                                  <i className="fas fa-exclamation-triangle"></i>
                                  <strong>Có thành viên quá hạn!</strong> 
                                  <div className="ftl-overdue-list">
                                    {overdueMembers.join(', ')} chưa hoàn thành công việc đã quá hạn.
                                  </div>
                                </div>
                              )}
                              
                              {nearDeadlineMembers.length > 0 && overdueMembers.length === 0 && (
                                <div className="ftl-warning-banner ftl-near-deadline-members">
                                  <i className="fas fa-clock"></i>
                                  <strong>Có thành viên sắp đến hạn!</strong>
                                  <div className="ftl-near-deadline-list">
                                    {nearDeadlineMembers.join(', ')} cần hoàn thành trong 24 giờ tới.
                                  </div>
                                </div>
                              )}
                            </>
                          );
                        })()}
                        
                        <div className="ftl-item-header">
                          <h4 className="ftl-item-title">{item.title}</h4>
                          <div className="ftl-item-badges">
                            <span 
                              className="ftl-priority-badge"
                              style={{ backgroundColor: getPriorityColor(item.priority) }}
                            >
                              {getPriorityLabel(item.priority)}
                            </span>
                            {item.dueDate && (
                              <span className={`ftl-due-date ${(() => {
                                const now = new Date();
                                const due = new Date(item.dueDate);
                                const timeDiff = due.getTime() - now.getTime();
                                const hoursDiff = timeDiff / (1000 * 3600);
                                
                                if (hoursDiff < 0) return 'overdue';
                                if (hoursDiff <= 24) return 'near-deadline';
                                return '';
                              })()}`}>
                                <i className="fas fa-calendar-alt"></i> 
                                Hạn: {new Date(item.dueDate).toLocaleDateString('vi-VN')}
                                {(() => {
                                  const now = new Date();
                                  const due = new Date(item.dueDate);
                                  const timeDiff = due.getTime() - now.getTime();
                                  const hoursDiff = timeDiff / (1000 * 3600);
                                  
                                  if (hoursDiff < 0) {
                                    const daysPast = Math.ceil(Math.abs(hoursDiff) / 24);
                                    return ` (Quá ${daysPast} ngày)`;
                                  }
                                  if (hoursDiff <= 24) {
                                    const hoursLeft = Math.floor(hoursDiff);
                                    return ` (Còn ${hoursLeft}h)`;
                                  }
                                  return '';
                                })()}
                              </span>
                            )}
                            {/* THÊM: Badge hiển thị tiến độ hoàn thành với trạng thái màu sắc */}
                            {item.totalAssigned > 0 && (
                              <span className={`ftl-completion-badge ${(() => {
                                if (item.allCompleted) return 'completed';
                                if (item.completedCount > 0) return 'in-progress';
                                
                                // Kiểm tra trạng thái deadline
                                if (item.dueDate) {
                                  const now = new Date();
                                  const due = new Date(item.dueDate);
                                  const timeDiff = due.getTime() - now.getTime();
                                  const hoursDiff = timeDiff / (1000 * 3600);
                                  
                                  if (hoursDiff < 0) return 'overdue';
                                  if (hoursDiff <= 24) return 'near-deadline';
                                }
                                
                                return 'not-started';
                              })()}`}>
                                {item.completedCount}/{item.totalAssigned} hoàn thành ({item.completionPercentage}%)
                              </span>
                            )}
                          </div>
                        </div>
                        
                        {item.description && (
                          <p className="ftl-item-description">{item.description}</p>
                        )}

                        {/* OWNER: Hiển thị danh sách đã hoàn thành/chưa hoàn thành */}
                        {isOwner && (
                          <div className="ftl-completion-details" style={{
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            borderRadius: '8px',
                            padding: '12px',
                            marginBottom: '12px'
                          }}>
                            <div style={{ fontWeight: '600', fontSize: '13px', color: '#475569', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <i className="fas fa-users"></i>
                              Trạng thái từng người:
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                              <span style={{ fontWeight: '500', color: '#166534' }}>
                                Đã hoàn thành: {item.completedNames && item.completedNames.length > 0 ? item.completedNames.join(', ') : '—'}
                              </span>
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                              <span style={{ fontWeight: '500', color: '#991b1b' }}>
                                Chưa hoàn thành: {item.notCompletedNames && item.notCompletedNames.length > 0 ? item.notCompletedNames.join(', ') : '—'}
                              </span>
                            </div>
                          </div>
                        )}

                        {/* MEMBER: Hiển thị các thành viên được phân công cùng mình */}
                        {!isOwner && item.assignedPeers && item.assignedPeers.length > 0 && (
                          <div className="ftl-item-assigned" style={{ background: '#e0e7ff', color: '#3730a3', border: '1px solid #a5b4fc' }}>
                            <i className="fas fa-user-friends"></i>
                            Thành viên cùng phân công: {item.assignedPeers.join(', ')}
                          </div>
                        )}

                        {/* THÊM: Hiển thị chi tiết trạng thái hoàn thành cho owner */}
                        {isOwner && item.completionDetails && item.completionDetails.length > 0 && (
                          <div className="ftl-completion-details" style={{
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            borderRadius: '8px',
                            padding: '12px',
                            marginBottom: '12px'
                          }}>
                            <div style={{ 
                              fontWeight: '600', 
                              fontSize: '13px', 
                              color: '#475569',
                              marginBottom: '8px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px'
                            }}>
                              <i className="fas fa-users"></i>
                              Trạng thái từng người:
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                              {item.completionDetails.map((detail, index) => (
                                <div key={index} style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  padding: '4px 8px',
                                  background: detail.completed ? '#dcfce7' : '#fef2f2',
                                  color: detail.completed ? '#166534' : '#991b1b',
                                  borderRadius: '12px',
                                  fontSize: '12px',
                                  fontWeight: '500',
                                  border: `1px solid ${detail.completed ? '#bbf7d0' : '#fecaca'}`
                                }}>
                                  <i className={`fas ${detail.completed ? 'fa-check-circle' : 'fa-clock'}`}></i>
                                  {detail.user?.name || 'Thành viên'}
                                  {detail.completed && detail.completedAt && (
                                    <span style={{ 
                                      fontSize: '10px', 
                                      opacity: 0.8,
                                      marginLeft: '4px'
                                    }}>
                                      ({new Date(detail.completedAt).toLocaleDateString('vi-VN')})
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Hiển thị người được phân công (cho member) */}
                        {!isOwner && item.assignedToNames && item.assignedToNames.length > 0 && (
                          <div className="ftl-item-assigned">
                            <i className="fas fa-user-tag"></i>
                            Phân công: {item.assignedToNames.join(', ')}
                          </div>
                        )}
                        
                        <div className="ftl-item-meta">
                          <span className="ftl-item-creator">
                            <i className="fas fa-user">người tạo:</i> {item.creatorName || 'Thành viên'}
                          </span>
                          
                          {/* THÊM: Hiển thị ngày hoàn thành nếu đã hoàn thành */}
                          {item.completed && item.completedAt && (
                            <span className="ftl-item-completed">
                              <i className="fas fa-check-circle"></i> Hoàn thành: {new Date(item.completedAt).toLocaleDateString('vi-VN')}
                            </span>
                          )}
                          {/* THÊM: Hiển thị người hoàn thành nếu khác người tạo */}
                          {item.completed && item.completedByName && item.completedByName !== item.creatorName && (
                            <span className="ftl-item-completed-by">
                              <i className="fas fa-user-check"></i> Bởi: {item.completedByName}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      <div className="ftl-item-actions">
                        {canEditItem(item) && (
                          <button
                            className="ftl-action-btn edit"
                            onClick={() => openEditModal(item)}
                            title="Chỉnh sửa"
                          >
                            <i className="fas fa-edit"></i>
                            <span> Sửa</span>
                          </button>
                        )}
                        {/* THAY ĐỔI: Sử dụng canToggleStatus thay vì luôn hiển thị */}
                        {canToggleStatus(item) && (
                          <button 
                            className={`ftl-action-btn ${item.allCompleted ? 'undo' : 'check'}`}
                            onClick={() => toggleItemCompleted(item._id, item.completed)}
                            title={(() => {
                              const userCompletion = item.completionDetails?.find(detail => 
                                String(detail.user?._id || detail.user) === String(currentUser?.id)
                              );
                              if (userCompletion) {
                                return userCompletion.completed ? 'Đánh dấu chưa hoàn thành' : 'Đánh dấu đã hoàn thành';
                              }
                              return item.allCompleted ? 'Chưa hoàn thành' : 'Đã hoàn thành';
                            })()}
                          >
                            <i className={`fas ${(() => {
                              const userCompletion = item.completionDetails?.find(detail => 
                                String(detail.user?._id || detail.user) === String(currentUser?.id)
                              );
                              return userCompletion?.completed ? 'fa-undo' : 'fa-check';
                            })()}`}></i>
                            <span>
                              {(() => {
                                const userCompletion = item.completionDetails?.find(detail => 
                                  String(detail.user?._id || detail.user) === String(currentUser?.id)
                                );
                                if (userCompletion) {
                                  return userCompletion.completed ? ' Chưa hoàn thành' : ' Đã hoàn thành';
                                }
                                return item.allCompleted ? ' Chưa hoàn thành' : ' Đã hoàn thành';
                              })()}
                            </span>
                          </button>
                        )}
                        
                        {canEditItem(item) && (
                          <button 
                            className="ftl-action-btn delete"
                            onClick={() => deleteItem(item._id)}
                            title="Xóa"
                          >
                            <i className="fas fa-trash"></i>
                            <span> Xóa</span>
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
    </div>
  );
}
