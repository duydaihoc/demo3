import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import GroupSidebar from './GroupSidebar';
import './GroupTransactions.css';

export default function GroupTransactions() {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const API_BASE = 'http://localhost:5000';
  const token = localStorage.getItem('token');

  // State data
  const [group, setGroup] = useState(null);
  const [txs, setTxs] = useState([]);
  const [loadingTxs, setLoadingTxs] = useState(false);
  const [error, setError] = useState('');

  // Form state
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [createResult, setCreateResult] = useState(null);
  
  // Thêm state cho người dùng hiện tại
  const [currentUser, setCurrentUser] = useState(null);
  
  // Thêm state cho danh mục
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [loadingCategories, setLoadingCategories] = useState(false);
  
  // State cho thành viên và người trả dùm
  const [members, setMembers] = useState([]);
  const [selectedMembers, setSelectedMembers] = useState([]);

  // Add state for editing
  const [editingTx, setEditingTx] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editSelectedMembers, setEditSelectedMembers] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [txToDelete, setTxToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Add state for optimized debts
  const [showOptimizeModal, setShowOptimizeModal] = useState(false);
  const [optimizedTransactions, setOptimizedTransactions] = useState([]);
  const [loadingOptimized, setLoadingOptimized] = useState(false);
  const [optimizeError, setOptimizeError] = useState(null);
  const [settlingOptimized, setSettlingOptimized] = useState(false);
  const [selectedOptimized, setSelectedOptimized] = useState([]);

  // Add these state variables at the beginning with other useState declarations
  const [globalMessage, setGlobalMessage] = useState('');
  const [globalMessageType, setGlobalMessageType] = useState('info');

  // Lấy thông tin người dùng hiện tại
  const getCurrentUser = () => {
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
  };

  const fetchGroup = async () => {
    if (!groupId || !token) return;
    try {
      const res = await fetch(`${API_BASE}/api/groups/${groupId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      setGroup(data);
      
      // Xử lý danh sách thành viên
      if (data && Array.isArray(data.members)) {
        // Normalize members data
        const normalizedMembers = data.members.map(member => ({
          id: member.user ? (member.user._id || member.user) : null,
          email: member.email || (member.user && member.user.email) || '',
          name: member.name || (member.user && member.user.name) || member.email || 'Thành viên'
        })).filter(m => m.email || m.id); 
        
        setMembers(normalizedMembers);
      }
    } catch (e) { 
      console.error("Error fetching group:", e);
    }
  };

  // Fetch danh mục từ backend
  const fetchCategories = async () => {
    if (!token) return;
    setLoadingCategories(true);
    try {
      const res = await fetch(`${API_BASE}/api/categories`, { 
        headers: { Authorization: `Bearer ${token}` } 
      });
      if (!res.ok) return;
      const data = await res.json();
      // Lọc lấy danh mục chi tiêu (expense) VÀ chỉ lấy danh mục của hệ thống và admin
      const expenseCategories = data.filter(cat => 
        cat.type === 'expense' && 
        (cat.createdBy === 'system' || cat.createdBy === 'admin')
      );
      setCategories(expenseCategories);
      // Chọn danh mục đầu tiên mặc định
      if (expenseCategories.length > 0) {
        setSelectedCategory(expenseCategories[0]._id);
      }
    } catch (e) {
      console.error("Error fetching categories:", e);
    } finally {
      setLoadingCategories(false);
    }
  };

  const fetchTxs = async () => {
    if (!groupId || !token) return;
    setLoadingTxs(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/groups/${groupId}/transactions`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { setTxs([]); return; }
      const data = await res.json().catch(() => []);
      setTxs(Array.isArray(data) ? data : []);
    } catch (e) {
      setError('Lỗi khi tải giao dịch');
      setTxs([]);
    } finally {
      setLoadingTxs(false);
    }
  };

  // Function to fetch optimized transactions
  const fetchOptimizedTransactions = async () => {
    setLoadingOptimized(true);
    setOptimizeError(null);
    try {
      const res = await fetch(`${API_BASE}/api/groups/${groupId}/optimize-debts`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Failed to optimize debts');
      }
      
      const data = await res.json();
      setOptimizedTransactions(data.optimizedTransactions || []);
      
      // Auto-select all optimized transactions
      setSelectedOptimized(data.optimizedTransactions.map((_, idx) => idx));
    } catch (err) {
      console.error('Error fetching optimized transactions:', err);
      setOptimizeError(err.message || 'Failed to optimize debts');
      setOptimizedTransactions([]);
    } finally {
      setLoadingOptimized(false);
    }
  };

  // Add fetchTransactions function if it doesn't exist
  const fetchTransactions = useCallback(async () => {
    if (!groupId) return;
    
    setLoadingTxs(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/groups/${groupId}/transactions`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Failed to fetch transactions');
      }
      
      const data = await res.json();
      setTxs(data || []);
    } catch (err) {
      console.error('Error fetching transactions:', err);
      setError(err.message || 'Failed to fetch transactions');
    } finally {
      setLoadingTxs(false);
    }
  }, [groupId, token, API_BASE]);

  // Add useEffect to fetch transactions on mount and when groupId changes
  useEffect(() => {
    setCurrentUser(getCurrentUser());
    fetchGroup();
    fetchTxs();
    fetchCategories();
    // eslint-disable-next-line
  }, [groupId, token]);

  // Toggle chọn/bỏ chọn thành viên
  const toggleMemberSelection = (member) => {
    setSelectedMembers(prev => {
      const isSelected = prev.some(m => m.id === member.id || m.email === member.email);
      
      if (isSelected) {
        return prev.filter(m => !(m.id === member.id || m.email === member.email));
      } else {
        return [...prev, member];
      }
    });
  };

  // Tạo danh sách participants từ thành viên đã chọn
  const buildParticipants = () => {
    return selectedMembers.map(member => {
      if (member.id) {
        return { user: member.id };
      } else if (member.email) {
        return { email: member.email };
      }
      return null;
    }).filter(Boolean);
  };

  // Tính tổng tiền dựa trên số người được chọn
  const calculateTotal = () => {
    if (!amount) return 0;
    const numAmount = Number(amount);
    if (isNaN(numAmount)) return 0;
    
    // Nếu có người trả dùm, nhân với số người
    if (selectedMembers.length > 0) {
      return numAmount * selectedMembers.length;
    }
    
    // Nếu không chọn ai - đây là chi tiêu cá nhân
    return numAmount;
  };

  // Chuyển đổi để sử dụng perPerson=true cho logic trả dùm
  const handleCreate = async (e) => {
    e && e.preventDefault();
    setCreateResult(null);
    
    if (!amount || Number(amount) <= 0) {
      setCreateResult({ ok: false, message: 'Vui lòng nhập số tiền hợp lệ' });
      return;
    }
    
    if (!title.trim()) {
      setCreateResult({ ok: false, message: 'Vui lòng nhập tiêu đề' });
      return;
    }
    
    if (!selectedCategory) {
      setCreateResult({ ok: false, message: 'Vui lòng chọn danh mục' });
      return;
    }
    
    if (!groupId || !token) {
      setCreateResult({ ok: false, message: 'Thiếu context hoặc chưa đăng nhập' });
      return;
    }
    
    const participants = buildParticipants();
    const hasParticipants = participants.length > 0;
    
    setCreating(true);
    try {
      const payload = {
        amount: Number(amount),
        perPerson: hasParticipants, // Bật tính năng trả dùm khi có người được chọn
        participants,
        title: title || '',
        description: description || '',
        category: selectedCategory || undefined
      };
      
      const res = await fetch(`${API_BASE}/api/groups/${groupId}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      
      const body = await res.json().catch(() => null);
      
      if (!res.ok) {
        setCreateResult({ ok: false, message: (body && (body.message || body.error)) || 'Server error' });
        return;
      }
      
      setCreateResult({ ok: true, message: 'Tạo giao dịch thành công' });
      
      // reset form
      setTitle('');
      setAmount('');
      setSelectedMembers([]);
      setDescription('');
      
      // refresh list
      await fetchTxs();
    } catch (err) {
      setCreateResult({ ok: false, message: 'Lỗi mạng' });
    } finally {
      setCreating(false);
    }
  };

  // Kiểm tra xem user có phải là người trả tiền trong giao dịch không
  const isUserPayer = (transaction) => {
    if (!currentUser || !transaction || !transaction.payer) return false;
    return String(transaction.payer._id || transaction.payer) === String(currentUser.id);
  };

  // Kiểm tra xem user có là participant trong giao dịch không
  const isUserParticipant = (transaction) => {
    if (!currentUser || !transaction || !Array.isArray(transaction.participants)) return false;
    
    return transaction.participants.some(p => {
      if (p.user && (String(p.user._id || p.user) === String(currentUser.id))) return true;
      if (p.email && currentUser.email && p.email.toLowerCase() === currentUser.email.toLowerCase()) return true;
      return false;
    });
  };

  // Kiểm tra xem giao dịch có phải loại "trả dùm" không
  const isPayingForOthers = (transaction) => {
    return transaction && transaction.perPerson && Array.isArray(transaction.participants) && transaction.participants.length > 0;
  };

  // Đánh dấu đã thanh toán cho một giao dịch (gọi API)
  const handleSettle = async (txId, userId) => {
    if (!token || !txId) return;
    
    try {
      const res = await fetch(`${API_BASE}/api/groups/${groupId}/transactions/${txId}/settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId: userId || currentUser?.id })
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        alert(errorData.message || 'Lỗi khi đánh dấu đã thanh toán');
        return;
      }
      
      // Refresh transactions list
      fetchTxs();
      
    } catch (err) {
      console.error("Error settling transaction:", err);
      alert('Đã xảy ra lỗi khi thực hiện thanh toán');
    }
  };

  // Tìm danh mục theo ID
  const getCategoryById = (categoryId) => {
    return categories.find(c => c._id === categoryId) || { name: 'Không có', icon: '📝' };
  };

  // Determine if the current user is the creator of a transaction
  const isUserCreator = (transaction) => {
    if (!currentUser || !transaction || !transaction.createdBy) return false;
    
    // Check if createdBy is a string (ID) or object with _id
    if (typeof transaction.createdBy === 'object' && transaction.createdBy !== null) {
      return String(transaction.createdBy._id || transaction.createdBy.id || '') === String(currentUser.id);
    }
    
    return String(transaction.createdBy) === String(currentUser.id);
  };

  // Start editing a transaction
  const handleEditTransaction = (tx) => {
    setEditingTx(tx);
    setEditTitle(tx.title || '');
    setEditAmount(tx.perPerson && tx.participants && tx.participants.length > 0 
      ? String(tx.amount / tx.participants.length) 
      : String(tx.amount || ''));
    setEditDescription(tx.description || '');
    setEditCategory(tx.category && tx.category._id ? tx.category._id : (typeof tx.category === 'string' ? tx.category : ''));
    
    // Map participants to the format expected by our UI
    if (tx.participants && Array.isArray(tx.participants)) {
      const mappedParticipants = tx.participants.map(p => ({
        id: p.user ? (p.user._id || p.user) : undefined,
        email: p.email || (p.user && p.user.email) || '',
        name: p.user ? (p.user.name || p.user.email || 'Thành viên') : (p.email || 'Thành viên'),
        settled: p.settled || false,
        shareAmount: p.shareAmount || 0
      }));
      setEditSelectedMembers(mappedParticipants);
    } else {
      setEditSelectedMembers([]);
    }
    
    // Show edit modal
    setIsEditing(true);
  };

  // Toggle member selection in edit mode
  const toggleEditMemberSelection = (member) => {
    setEditSelectedMembers(prev => {
      const isSelected = prev.some(m => m.id === member.id || m.email === member.email);
      
      if (isSelected) {
        return prev.filter(m => !(m.id === member.id || m.email === member.email));
      } else {
        // When adding a member, check if they were in the original transaction
        // and preserve their settled status if so
        const existingTxParticipant = editingTx?.participants?.find(p => 
          (p.user && member.id && (p.user._id === member.id || p.user === member.id)) ||
          (p.email && member.email && p.email.toLowerCase() === member.email.toLowerCase())
        );
        
        return [...prev, { 
          ...member, 
          settled: existingTxParticipant ? existingTxParticipant.settled : false,
          shareAmount: editAmount ? Number(editAmount) : 0 // Use current edit amount
        }];
      }
    });
  };

  // Toggle settled status of a participant in edit mode
  const toggleParticipantSettled = (participantIndex) => {
    setEditSelectedMembers(prev => {
      return prev.map((member, idx) => 
        idx === participantIndex 
          ? { ...member, settled: !member.settled }
          : member
      );
    });
  };

  // Save edited transaction
  const handleSaveEdit = async () => {
    if (!editingTx || !editingTx._id) return;
    
    if (!editTitle.trim()) {
      alert('Vui lòng nhập tiêu đề');
      return;
    }
    
    if (!editAmount || Number(editAmount) <= 0) {
      alert('Vui lòng nhập số tiền hợp lệ');
      return;
    }
    
    if (!editCategory) {
      alert('Vui lòng chọn danh mục');
      return;
    }

    try {
      // Build participants from selected members
      const participants = editSelectedMembers.map(m => ({
        user: m.id,
        email: m.email,
        settled: m.settled || false,
        shareAmount: m.shareAmount || Number(editAmount)
      }));
      
      const payload = {
        title: editTitle,
        description: editDescription,
        amount: Number(editAmount),
        category: editCategory,
        participants,
        perPerson: true // We're using per person amount in the edit form
      };
      
      setIsEditing(false); // Close modal during fetch
      
      const res = await fetch(`${API_BASE}/api/groups/${groupId}/transactions/${editingTx._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Lỗi khi cập nhật giao dịch');
      }
      
      // Success - refresh transactions list
      fetchTxs();
      alert('Cập nhật giao dịch thành công');
    } catch (err) {
      console.error("Error updating transaction:", err);
      alert(err.message || 'Đã xảy ra lỗi khi cập nhật giao dịch');
      setIsEditing(true); // Re-open modal to fix issues
    }
  };

  // Start delete process
  const handleDeleteClick = (tx) => {
    setTxToDelete(tx);
    setShowDeleteConfirm(true);
  };

  // Confirm and execute deletion
  const confirmDelete = async () => {
    if (!txToDelete || !txToDelete._id) return;
    
    try {
      setIsDeleting(true);
      
      const res = await fetch(`${API_BASE}/api/groups/${groupId}/transactions/${txToDelete._id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Lỗi khi xóa giao dịch');
      }
      
      // Success - refresh transactions list
      fetchTxs();
      alert('Đã xóa giao dịch thành công');
      
    } catch (err) {
      console.error("Error deleting transaction:", err);
      alert(err.message || 'Đã xảy ra lỗi khi xóa giao dịch');
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
      setTxToDelete(null);
    }
  };

  // Function to toggle selection of an optimized transaction
  const toggleOptimizedSelection = (index) => {
    setSelectedOptimized(prev => {
      if (prev.includes(index)) {
        return prev.filter(idx => idx !== index);
      } else {
        return [...prev, index];
      }
    });
  };

  // Function to settle selected optimized transactions
  const settleSelectedOptimized = async () => {
    if (selectedOptimized.length === 0) return;
    
    setSettlingOptimized(true);
    try {
      const transactions = selectedOptimized.map(idx => optimizedTransactions[idx]);
      
      const res = await fetch(`${API_BASE}/api/groups/${groupId}/settle-optimized`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ transactions })
      });
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Failed to settle optimized transactions');
      }
      
      const data = await res.json();
      
      // Close modal and refresh transactions
      setShowOptimizeModal(false);
      fetchTransactions();
      
      // Show success message with the new state setter
      setGlobalMessage(`Đã thanh toán ${data.settledCount || 0} giao dịch`);
      setGlobalMessageType('success');
      
      // Auto-hide message after a few seconds
      setTimeout(() => {
        setGlobalMessage('');
      }, 5000);
    } catch (err) {
      console.error('Error settling optimized transactions:', err);
      setOptimizeError(err.message || 'Failed to settle optimized transactions');
    } finally {
      setSettlingOptimized(false);
    }
  };
  
  return (
    <div className="groups-page">
      <GroupSidebar active="groups" />
      <main className="group-transactions-page">
        {/* Global message display */}
        {globalMessage && (
          <div className={`gt-global-message ${globalMessageType}`}>
            {globalMessageType === 'success' && <i className="fas fa-check-circle"></i>}
            {globalMessageType === 'error' && <i className="fas fa-exclamation-circle"></i>}
            {globalMessage}
            <button className="gt-message-close" onClick={() => setGlobalMessage('')}>
              <i className="fas fa-times"></i>
            </button>
          </div>
        )}
        
        <header className="gt-header">
          <div>
            <h1>Giao dịch nhóm</h1>
            <p className="subtitle">{group ? `Nhóm: ${group.name}` : '...'}</p>
          </div>
          <div className="gt-header-actions">
            <button className="gm-btn secondary" onClick={() => navigate(-1)}>← Quay lại</button>
            <button className="gm-btn primary" onClick={fetchTxs}>Làm mới</button>
            
            <button
              className="gt-optimize-btn"
              onClick={() => {
                setShowOptimizeModal(true);
                fetchOptimizedTransactions();
              }}
              title="Tối ưu hóa thanh toán"
            >
              <i className="fas fa-magic"></i> Tối ưu hóa thanh toán
            </button>
          </div>
        </header>

        <div className="gt-grid">
          <section className="gt-form-card">
            <h2>Tạo giao dịch mới</h2>
            <form onSubmit={handleCreate} className="gt-form">
              <label>Tiêu đề</label>
              <input 
                type="text"
                value={title} 
                onChange={e => setTitle(e.target.value)} 
                placeholder="Ví dụ: Ăn tối"
                required
              />

              <label>Số tiền</label>
              <input 
                type="number" 
                value={amount} 
                onChange={e => setAmount(e.target.value)} 
                placeholder="Số tiền (VD: 100000)" 
                required
              />

              {/* Thêm trường chọn danh mục */}
              <div className="gt-form-group">
                <label>Danh mục</label>
                <select 
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  required
                  className="category-selector" // Thêm class này để áp dụng style cuộn
                  disabled={loadingCategories}
                >
                  <option value="">-- Chọn danh mục --</option>
                  {categories.map(cat => (
                    <option key={cat._id} value={cat._id}>
                      {cat.icon} {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="gt-paying-for-section">
                <label>Bạn trả dùm cho ai?</label>
                <div className="gt-members-list">
                  {members.length === 0 ? (
                    <div className="gt-no-members">Không có thành viên trong nhóm</div>
                  ) : (
                    <div className="gt-members-grid">
                      {members.map(member => {
                        // Không hiển thị bản thân trong danh sách trả dùm
                        if (currentUser && (member.id === currentUser.id || member.email === currentUser.email)) {
                          return null;
                        }

                        const isSelected = selectedMembers.some(m => m.id === member.id || m.email === member.email);
                        return (
                          <div 
                            key={member.id || member.email} 
                            className={`gt-member-item ${isSelected ? 'selected' : ''}`}
                            onClick={() => toggleMemberSelection(member)}
                          >
                            <input 
                              type="checkbox" 
                              checked={isSelected}
                              onChange={() => toggleMemberSelection(member)}
                              id={`member-${member.id || member.email}`}
                            />
                            <div className="gt-member-info">
                              <label htmlFor={`member-${member.id || member.email}`}>
                                <div className="gt-member-name">{member.name}</div>
                                <div className="gt-member-email">{member.email}</div>
                              </label>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                
                {amount && selectedMembers.length > 0 && (
                  <div className="gt-total-summary">
                    <div className="gt-amount-calculation">
                      <div>Mỗi người: {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(amount) || 0)}</div>
                      <div>×</div>
                      <div>{selectedMembers.length} người</div>
                      <div>=</div>
                    </div>
                    <div className="gt-total-preview">
                      Thành tiền: {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(calculateTotal())}
                    </div>
                  </div>
                )}

                {selectedMembers.length > 0 && (
                  <div className="gt-selected-count">
                    <div>Đã chọn: <strong>{selectedMembers.length}</strong> người</div>
                    <button 
                      type="button" 
                      className="gt-clear-members" 
                      onClick={() => setSelectedMembers([])}
                    >
                      Xóa tất cả
                    </button>
                  </div>
                )}
              </div>

              <label>Mô tả</label>
              <textarea 
                value={description} 
                onChange={e => setDescription(e.target.value)} 
                rows={3} 
                placeholder="Thêm mô tả chi tiết (tùy chọn)"
              />

              <div className="gt-form-actions">
                <button 
                  type="button" 
                  className="gm-btn secondary" 
                  onClick={() => { 
                    setTitle(''); 
                    setAmount(''); 
                    setSelectedMembers([]); 
                    setDescription(''); 
                  }}
                >
                  Xóa
                </button>
                <button 
                  type="submit" 
                  className="gm-btn success" 
                  disabled={creating}
                >
                  {creating ? 'Đang tạo...' : 'Tạo giao dịch'}
                </button>
              </div>

              {createResult && (
                <div className={`gt-create-result ${createResult.ok ? 'ok' : 'err'}`}>
                  {createResult.message}
                </div>
              )}
            </form>
          </section>

          <section className="gt-list-card">
            <h2>Danh sách giao dịch</h2>
            {loadingTxs ? (
              <div className="gm-loading">Đang tải giao dịch...</div>
            ) : error ? (
              <div className="gm-error">{error}</div>
            ) : txs.length === 0 ? (
              <div className="gm-empty-state">Chưa có giao dịch</div>
            ) : (
              <div className="gt-list-container">
                <ul className="gt-list">
                  {txs.map(tx => {
                    const isPayer = isUserPayer(tx);
                    const isParticipant = isUserParticipant(tx);
                    const category = tx.category ? getCategoryById(tx.category._id || tx.category) : { name: 'Không có', icon: '📝' };
                    const isPayingFor = isPayingForOthers(tx);
                    const isCreator = isUserCreator(tx);
                    
                    // Kiểm tra xem người dùng đang đăng nhập có phải là người đã nhận được "trả dùm" không
                    const userParticipation = currentUser && tx.participants ? 
                      tx.participants.find(p => 
                        (p.user && String(p.user._id || p.user) === String(currentUser.id)) || 
                        (p.email && currentUser.email && p.email.toLowerCase() === currentUser.email.toLowerCase())
                      ) : null;
                    
                    const userSettled = userParticipation ? userParticipation.settled : false;
                    
                    return (
                      <li key={tx._id || tx.id} className={`gt-item ${isPayer ? 'i-paid' : ''} ${isParticipant ? 'i-participate' : ''}`}>
                        <div className="gt-item-header">
                          <div className="gt-title-section">
                            <div className="gt-category-badge">{category.icon} {category.name}</div>
                            <div className="gt-title">{tx.title || 'Giao dịch'}</div>
                          </div>
                          <div className="gt-amount">{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(tx.amount || 0)}</div>
                        </div>

                        <div className="gt-item-body">
                          <div className="gt-meta">
                            <div className="gt-payer">
                              <span className="gt-label">Người trả:</span> 
                              <strong>{tx.payer ? (tx.payer.name || tx.payer.email || 'Người trả') : 'Chưa xác định'}</strong>
                              {isPayer && <span className="gt-current-user-badge">Bạn</span>}
                            </div>
                            
                            <div className="gt-date">
                              {new Date(tx.date || tx.createdAt || tx.created).toLocaleString()}
                            </div>
                          </div>
                          
                          {/* Add edit/delete buttons for transaction creator */}
                          {isCreator && (
                            <div className="gt-creator-actions">
                              <button 
                                className="gt-edit-btn"
                                onClick={() => handleEditTransaction(tx)}
                                title="Sửa giao dịch"
                              >
                                <i className="fas fa-edit"></i> Sửa
                              </button>
                              <button 
                                className="gt-delete-btn"
                                onClick={() => handleDeleteClick(tx)}
                                title="Xóa giao dịch"
                              >
                                <i className="fas fa-trash-alt"></i> Xóa
                              </button>
                            </div>
                          )}
                          
                          {tx.description && (
                            <div className="gt-description">{tx.description}</div>
                          )}
                          
                          {isPayingFor && (
                            <div className="gt-participants">
                              <div className="gt-participants-header">
                                <div className="gt-label">Trả dùm cho:</div>
                                {isPayer && <div className="gt-per-person-badge">Mỗi người: {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format((tx.participants && tx.participants.length > 0) ? (tx.amount / tx.participants.length) : 0)}</div>}
                              </div>
                              <ul className="gt-participants-list">
                                {Array.isArray(tx.participants) && tx.participants.map((p, i) => {
                                  const isCurrentUserParticipant = currentUser && 
                                    ((p.user && String(p.user._id || p.user) === String(currentUser.id)) || 
                                     (p.email && currentUser.email && p.email.toLowerCase() === currentUser.email.toLowerCase()));
                                  
                                  return (
                                    <li key={i} className={`gt-participant ${p.settled ? 'settled' : 'pending'} ${isCurrentUserParticipant ? 'current-user' : ''}`}>
                                      <div className="gt-participant-info">
                                        <div className="gt-participant-name">
                                          {p.user ? (p.user.name || p.user.email) : (p.email || 'Unknown')}
                                          {isCurrentUserParticipant && <span className="gt-current-user-badge">Bạn</span>}
                                        </div>
                                        <div className="gt-participant-amount">
                                          {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(p.shareAmount || 0)}
                                        </div>
                                      </div>
                                      
                                      <div className={`gt-participant-status ${p.settled ? 'settled' : 'pending'}`}>
                                        {p.settled ? (
                                          <span className="gt-status-settled">Đã thanh toán</span>
                                        ) : isCurrentUserParticipant ? (
                                          <button 
                                            className="gt-settle-btn"
                                            onClick={() => handleSettle(tx._id || tx.id)}
                                          >
                                            Đánh dấu đã trả
                                          </button>
                                        ) : isPayer ? (
                                          <button 
                                            className="gt-settle-btn"
                                            onClick={() => handleSettle(tx._id || tx.id, p.user ? (p.user._id || p.user) : null)}
                                          >
                                            Đánh dấu đã nhận
                                          </button>
                                        ) : (
                                          <span className="gt-status-pending">Chưa thanh toán</span>
                                        )}
                                      </div>
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          )}
                          
                          {/* Hiển thị công nợ nếu người dùng là participant */}
                          {isParticipant && !userSettled && (
                            <div className="gt-debt-notice">
                              <div className="gt-debt-message">
                                Bạn nợ <strong>{tx.payer ? (tx.payer.name || tx.payer.email || 'Người trả') : 'Chưa xác định'}</strong>: 
                                <span className="gt-debt-amount">{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(userParticipation ? userParticipation.shareAmount : 0)}</span>
                              </div>
                              <button 
                                className="gt-settle-btn"
                                onClick={() => handleSettle(tx._id || tx.id)}
                              >
                                Đánh dấu đã trả
                              </button>
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </section>
        </div>
        
        {/* Edit Transaction Modal */}
        {isEditing && editingTx && (
          <div className="gt-modal-overlay">
            <div className="gt-edit-modal">
              <div className="gt-modal-header">
                <h3>Sửa giao dịch</h3>
                <button className="gt-modal-close" onClick={() => setIsEditing(false)}>×</button>
              </div>
              
              <div className="gt-modal-body">
                <div className="gt-form-group">
                  <label>Tiêu đề</label>
                  <input 
                    type="text"
                    value={editTitle} 
                    onChange={e => setEditTitle(e.target.value)} 
                    placeholder="Ví dụ: Ăn tối"
                    required
                  />
                </div>
                
                <div className="gt-form-group">
                  <label>Số tiền (mỗi người)</label>
                  <input 
                    type="number" 
                    value={editAmount} 
                    onChange={e => setEditAmount(e.target.value)} 
                    placeholder="Số tiền cho mỗi người" 
                    required
                  />
                </div>

                <div className="gt-form-group">
                  <label>Danh mục</label>
                  <select 
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    required
                    disabled={loadingCategories}
                  >
                    <option value="">-- Chọn danh mục --</option>
                    {categories.map(cat => (
                      <option key={cat._id} value={cat._id}>
                        {cat.icon} {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="gt-form-group">
                  <label>Trả dùm cho ai?</label>
                  <div className="gt-members-list">
                    {members.length === 0 ? (
                      <div className="gt-no-members">Không có thành viên trong nhóm</div>
                    ) : (
                      <div className="gt-members-grid">
                        {members.map(member => {
                          // Không hiển thị bản thân trong danh sách trả dùm
                          if (currentUser && (member.id === currentUser.id || member.email === currentUser.email)) {
                            return null;
                          }

                          const isSelected = editSelectedMembers.some(m => m.id === member.id || m.email === member.email);
                          return (
                            <div 
                              key={member.id || member.email} 
                              className={`gt-member-item ${isSelected ? 'selected' : ''}`}
                              onClick={() => toggleEditMemberSelection(member)}
                            >
                              <input 
                                type="checkbox" 
                                checked={isSelected}
                                onChange={() => toggleEditMemberSelection(member)}
                                id={`edit-member-${member.id || member.email}`}
                              />
                              <div className="gt-member-info">
                                <label htmlFor={`edit-member-${member.id || member.email}`}>
                                  <div className="gt-member-name">{member.name}</div>
                                  <div className="gt-member-email">{member.email}</div>
                                </label>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {editAmount && editSelectedMembers.length > 0 && (
                  <div className="gt-total-summary">
                    <div className="gt-amount-calculation">
                      <div>Mỗi người: {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(editAmount) || 0)}</div>
                      <div>×</div>
                      <div>{editSelectedMembers.length} người</div>
                      <div>=</div>
                    </div>
                    <div className="gt-total-preview">
                      Thành tiền: {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format((Number(editAmount) || 0) * editSelectedMembers.length)}
                    </div>
                  </div>
                )}

                <div className="gt-form-group">
                  <label>Mô tả</label>
                  <textarea 
                    value={editDescription} 
                    onChange={e => setEditDescription(e.target.value)} 
                    rows={3} 
                    placeholder="Thêm mô tả chi tiết (tùy chọn)"
                  />
                </div>

                {/* New section to show selected members and allow toggling their settled status */}
                {editSelectedMembers.length > 0 && (
                  <div className="gt-form-group">
                    <label>Thành viên đã chọn</label>
                    <div className="gt-selected-members-list">
                      {editSelectedMembers.map((member, idx) => (
                        <div key={idx} className="gt-selected-member">
                          <div className="gt-selected-member-info">
                            <div className="gt-selected-member-name">{member.name || member.email}</div>
                            <div className="gt-selected-member-amount">
                              {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(editAmount || 0)}
                            </div>
                          </div>
                          <div className="gt-selected-member-actions">
                            <button
                              type="button"
                              className={`gt-toggle-settled ${member.settled ? 'settled' : 'unsettled'}`}
                              onClick={() => toggleParticipantSettled(idx)}
                              title={member.settled ? 'Đánh dấu chưa thanh toán' : 'Đánh dấu đã thanh toán'}
                            >
                              {member.settled ? 'Đã thanh toán' : 'Chưa thanh toán'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              
              <div className="gt-modal-footer">
                <button className="gt-cancel-btn" onClick={() => setIsEditing(false)}>Hủy</button>
                <button className="gt-save-btn" onClick={handleSaveEdit}>Lưu thay đổi</button>
              </div>
            </div>
          </div>
        )}
        
        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && txToDelete && (
          <div className="gt-modal-overlay">
            <div className="gt-confirm-modal">
              <div className="gt-modal-header">
                <h3>Xác nhận xóa giao dịch</h3>
                <button className="gt-modal-close" onClick={() => setShowDeleteConfirm(false)}>×</button>
              </div>
              
              <div className="gt-modal-body">
                <p className="gt-confirm-message">Bạn có chắc chắn muốn xóa giao dịch <strong>"{txToDelete.title || 'Không tiêu đề'}"</strong> này không?</p>
                <div className="gt-warning">
                  <i className="fas fa-exclamation-triangle"></i>
                  <div>
                    <p>Lưu ý:</p>
                    <ul>
                      <li>Tất cả thông tin giao dịch sẽ bị xóa vĩnh viễn</li>
                      <li>Các khoản nợ liên quan sẽ được hủy</li>
                      <li>Thao tác này không thể hoàn tác</li>
                    </ul>
                  </div>
                </div>
              </div>
              
              <div className="gt-modal-footer">
                <button className="gt-cancel-btn" onClick={() => setShowDeleteConfirm(false)}>Hủy</button>
                <button 
                  className="gt-confirm-delete-btn" 
                  onClick={confirmDelete}
                  disabled={isDeleting}
                >
                  {isDeleting ? 'Đang xóa...' : 'Xác nhận xóa'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Optimize Transactions Modal */}
        {showOptimizeModal && (
          <div className="gt-modal-overlay">
            <div className="gt-modal gt-optimize-modal">
              <div className="gt-modal-header">
                <h3>Tối ưu hóa thanh toán</h3>
                <button className="gt-modal-close" onClick={() => setShowOptimizeModal(false)}>
                  <i className="fas fa-times"></i>
                </button>
              </div>
              
              <div className="gt-modal-content">
                {loadingOptimized ? (
                  <div className="gt-loading-container">
                    <div className="gt-spinner"></div>
                    <p>Đang tối ưu hóa thanh toán...</p>
                  </div>
                ) : optimizeError ? (
                  <div className="gt-error-message">
                    <i className="fas fa-exclamation-triangle"></i>
                    <p>{optimizeError}</p>
                    <button className="gt-retry-btn" onClick={fetchOptimizedTransactions}>
                      Thử lại
                    </button>
                  </div>
                ) : optimizedTransactions.length === 0 ? (
                  <div className="gt-empty-message">
                    <i className="fas fa-check-circle"></i>
                    <p>Không có khoản thanh toán nào cần tối ưu hóa!</p>
                    <p className="gt-sub-message">Tất cả các khoản nợ đã được thanh toán hoặc không có khoản nợ nào.</p>
                  </div>
                ) : (
                  <>
                    <div className="gt-optimize-info">
                      <p>
                        <i className="fas fa-info-circle"></i> Hệ thống đã tối ưu hóa các khoản thanh toán trong nhóm.
                        Thay vì thanh toán riêng lẻ từng giao dịch, bạn có thể sử dụng danh sách tối ưu dưới đây để 
                        thanh toán với số giao dịch tối thiểu.
                      </p>
                      <div className="gt-optimize-stats">
                        <div className="gt-stat">
                          <span className="gt-stat-value">{optimizedTransactions.length}</span>
                          <span className="gt-stat-label">Giao dịch tối ưu</span>
                        </div>
                        <div className="gt-stat">
                          <span className="gt-stat-value">{selectedOptimized.length}</span>
                          <span className="gt-stat-label">Đã chọn</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="gt-optimized-list">
                      <div className="gt-optimized-header">
                        <div className="gt-check-col">
                          <input 
                            type="checkbox" 
                            checked={selectedOptimized.length === optimizedTransactions.length}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedOptimized(optimizedTransactions.map((_, idx) => idx));
                              } else {
                                setSelectedOptimized([]);
                              }
                            }}
                          />
                        </div>
                        <div className="gt-from-col">Người trả</div>
                        <div className="gt-to-col">Người nhận</div>
                        <div className="gt-amount-col">Số tiền</div>
                      </div>
                      
                      {optimizedTransactions.map((tx, idx) => (
                        <div 
                          key={idx} 
                          className={`gt-optimized-item ${selectedOptimized.includes(idx) ? 'selected' : ''}`}
                          onClick={() => toggleOptimizedSelection(idx)}
                        >
                          <div className="gt-check-col">
                            <input 
                              type="checkbox" 
                              checked={selectedOptimized.includes(idx)}
                              onChange={(e) => {
                                e.stopPropagation();
                                toggleOptimizedSelection(idx);
                              }}
                            />
                          </div>
                          <div className="gt-from-col">
                            <div className="gt-user-name">{tx.from.name || 'Người dùng'}</div>
                            {tx.from.email && <div className="gt-user-email">{tx.from.email}</div>}
                          </div>
                          <div className="gt-to-col">
                            <div className="gt-user-name">{tx.to.name || 'Người dùng'}</div>
                            {tx.to.email && <div className="gt-user-email">{tx.to.email}</div>}
                          </div>
                          <div className="gt-amount-col">
                            {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(tx.amount)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
              
              <div className="gt-modal-footer">
                <button className="gt-cancel-btn" onClick={() => setShowOptimizeModal(false)}>
                  Đóng
                </button>
                
                {optimizedTransactions.length > 0 && (
                  <button
                    className="gt-settle-btn"
                    onClick={settleSelectedOptimized}
                    disabled={settlingOptimized || selectedOptimized.length === 0}
                  >
                    {settlingOptimized ? (
                      <>
                        <i className="fas fa-spinner fa-spin"></i> Đang xử lý...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-check-circle"></i> Thanh toán {selectedOptimized.length} giao dịch
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

