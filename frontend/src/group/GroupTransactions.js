import React, { useEffect, useState } from 'react';
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
      // Lọc lấy danh mục chi tiêu (expense)
      const expenseCategories = data.filter(cat => cat.type === 'expense');
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

  return (
    <div className="groups-page">
      <GroupSidebar active="groups" />
      <main className="group-transactions-page">
        <header className="gt-header">
          <div>
            <h1>Giao dịch nhóm</h1>
            <p className="subtitle">{group ? `Nhóm: ${group.name}` : '...'}</p>
          </div>
          <div className="gt-actions">
            <button className="gm-btn secondary" onClick={() => navigate(-1)}>← Quay lại</button>
            <button className="gm-btn primary" onClick={fetchTxs}>Làm mới</button>
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
              <label>Danh mục</label>
              <select
                value={selectedCategory}
                onChange={e => setSelectedCategory(e.target.value)}
                required
                className="gt-category-select"
                disabled={loadingCategories}
              >
                {loadingCategories ? (
                  <option value="">Đang tải...</option>
                ) : (
                  <>
                    <option value="">-- Chọn danh mục --</option>
                    {categories.map(cat => (
                      <option key={cat._id} value={cat._id}>
                        {cat.icon} {cat.name}
                      </option>
                    ))}
                  </>
                )}
              </select>

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
              <ul className="gt-list">
                {txs.map(tx => {
                  const isPayer = isUserPayer(tx);
                  const isParticipant = isUserParticipant(tx);
                  const category = tx.category ? getCategoryById(tx.category) : { name: 'Không có', icon: '📝' };
                  const isPayingFor = isPayingForOthers(tx);
                  
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
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
                        