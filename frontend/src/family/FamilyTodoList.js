import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import FamilySidebar from './FamilySidebar';
import './FamilyTodoList.css';
import { showNotification } from '../utils/notify';

export default function FamilyTodoList() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Dữ liệu mẫu thay vì gọi API
  const [todoItems, setTodoItems] = useState([
    {
      _id: '1',
      title: 'Mua sữa',
      description: 'Mua sữa tươi không đường',
      priority: 'medium',
      dueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0], // Ngày mai
      completed: false,
      creatorName: 'Nguyễn Văn A',
      createdAt: new Date().toISOString()
    },
    {
      _id: '2',
      title: 'Đón con từ trường',
      description: 'Đón con lúc 5 giờ chiều',
      priority: 'high',
      dueDate: new Date().toISOString().split('T')[0], // Hôm nay
      completed: true,
      creatorName: 'Trần Thị B',
      createdAt: new Date(Date.now() - 86400000).toISOString()
    },
    {
      _id: '3',
      title: 'Thanh toán hóa đơn điện',
      description: 'Thanh toán trước ngày 15',
      priority: 'high',
      dueDate: new Date(Date.now() + 172800000).toISOString().split('T')[0], // Ngày kia
      completed: false,
      creatorName: 'Lê Văn C',
      createdAt: new Date(Date.now() - 172800000).toISOString()
    }
  ]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newItem, setNewItem] = useState({ title: '', description: '', priority: 'medium', dueDate: '' });
  const [saving, setSaving] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const API_BASE = 'http://localhost:5000';
  const token = localStorage.getItem('token');
  const selectedFamilyId = localStorage.getItem('selectedFamilyId');

  // Hàm lấy thông tin người dùng hiện tại từ token
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
    
    // Không gọi API, chỉ set loading false
    setLoading(false);
  }, [navigate]);

  // Thêm item mới (mẫu)
  const handleAddItem = async (e) => {
    e.preventDefault();
    
    if (!newItem.title.trim()) {
      showNotification('Vui lòng nhập tiêu đề công việc', 'error');
      return;
    }
    
    setSaving(true);
    // Giả lập thêm item
    setTimeout(() => {
      const newItemData = {
        _id: Date.now().toString(),
        ...newItem,
        completed: false,
        creatorName: 'Bạn',
        createdAt: new Date().toISOString()
      };
      setTodoItems(prev => [newItemData, ...prev]);
      setNewItem({ title: '', description: '', priority: 'medium', dueDate: '' });
      setShowAddModal(false);
      setSaving(false);
      showNotification('Đã thêm công việc vào danh sách', 'success');
    }, 500);
  };

  // Toggle trạng thái hoàn thành (mẫu)
  const toggleItemCompleted = (itemId, currentStatus) => {
    setTodoItems(prev => prev.map(item => 
      item._id === itemId ? { ...item, completed: !currentStatus } : item
    ));
  };

  // Xóa item (mẫu)
  const deleteItem = (itemId) => {
    if (!window.confirm('Bạn có chắc muốn xóa công việc này?')) return;
    
    setTodoItems(prev => prev.filter(item => item._id !== itemId));
    showNotification('Đã xóa công việc khỏi danh sách', 'success');
  };

  // Get priority color
  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high': return '#ef4444';
      case 'medium': return '#f59e0b';
      case 'low': return '#10b981';
      default: return '#6b7280';
    }
  };

  // Get priority label
  const getPriorityLabel = (priority) => {
    switch (priority) {
      case 'high': return 'Cao';
      case 'medium': return 'Trung bình';
      case 'low': return 'Thấp';
      default: return 'Không xác định';
    }
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
          <p>Quản lý các công việc cần hoàn thành</p>
          
          <div className="ftl-actions">
            <button 
              className="ftl-btn primary"
              onClick={() => setShowAddModal(true)}
            >
              <i className="fas fa-plus"></i> Thêm công việc
            </button>
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
                    <label>Ngày đến hạn</label>
                    <input
                      type="date"
                      value={newItem.dueDate}
                      onChange={(e) => setNewItem({...newItem, dueDate: e.target.value})}
                    />
                  </div>
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
              <button onClick={() => setError('')} className="ftl-retry-btn">
                Thử lại
              </button>
            </div>
          ) : (
            <>
              {todoItems.length === 0 ? (
                <div className="ftl-empty-state">
                  <i className="fas fa-tasks"></i>
                  <h3>Danh sách việc cần làm trống</h3>
                  <p>Bắt đầu thêm công việc đầu tiên của bạn</p>
                  <button 
                    className="ftl-btn primary"
                    onClick={() => setShowAddModal(true)}
                  >
                    <i className="fas fa-plus"></i> Thêm công việc
                  </button>
                </div>
              ) : (
                <div className="ftl-items-list">
                  {todoItems.map(item => (
                    <div key={item._id} className={`ftl-item ${item.completed ? 'completed' : ''}`}>
                      <div className="ftl-item-content">
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
                              <span className="ftl-due-date">
                                <i className="fas fa-calendar-alt"></i> {new Date(item.dueDate).toLocaleDateString('vi-VN')}
                              </span>
                            )}
                          </div>
                        </div>
                        
                        {item.description && (
                          <p className="ftl-item-description">{item.description}</p>
                        )}
                        
                        <div className="ftl-item-meta">
                          <span className="ftl-item-creator">
                            <i className="fas fa-user"></i> {item.creatorName || 'Thành viên'}
                          </span>
                          <span className="ftl-item-date">
                            <i className="fas fa-clock"></i> {new Date(item.createdAt).toLocaleDateString('vi-VN')}
                          </span>
                        </div>
                      </div>
                      
                      <div className="ftl-item-actions">
                        <button 
                          className={`ftl-action-btn ${item.completed ? 'undo' : 'check'}`}
                          onClick={() => toggleItemCompleted(item._id, item.completed)}
                          title={item.completed ? 'Chưa hoàn thành' : 'Đã hoàn thành'}
                        >
                          <i className={`fas ${item.completed ? 'fa-undo' : 'fa-check'}`}></i>
                        </button>
                        <button 
                          className="ftl-action-btn delete"
                          onClick={() => deleteItem(item._id)}
                          title="Xóa"
                        >
                          <i className="fas fa-trash"></i>
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
