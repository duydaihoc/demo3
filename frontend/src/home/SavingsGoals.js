import React, { useState, useEffect } from 'react';
import './SavingsGoals.css';

function SavingsGoals() {
  const [goals, setGoals] = useState([]);
  const [wallets, setWallets] = useState([]);
  const [uiMode, setUiMode] = useState('list'); // 'list', 'create', 'deposit'
  const [selectedGoal, setSelectedGoal] = useState(null);
  const [loading, setLoading] = useState({ goals: false, wallets: false });
  const [error, setError] = useState({ goals: null, wallets: null });
  
  // Form data states
  const [goalData, setGoalData] = useState({
    name: '',
    targetAmount: '',
    currentAmount: '0',
    targetDate: '',
    color: '#4CAF50'
  });
  
  const [depositData, setDepositData] = useState({
    amount: '',
    walletId: '',
    note: ''
  });
  
  // Handler functions
  const handleGoalInputChange = (e) => {
    const { name, value } = e.target;
    setGoalData(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  const handleDepositInputChange = (e) => {
    const { name, value } = e.target;
    setDepositData(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  // Add notification system
  const [notification, setNotification] = useState({ show: false, message: '', type: '' });
  // Add confirmation dialog state
  const [confirmDelete, setConfirmDelete] = useState({ show: false, goal: null });

  // Show notification with auto-hide
  const showNotification = (message, type = 'success') => {
    setNotification({ show: true, message, type });
    setTimeout(() => {
      setNotification({ show: false, message: '', type: '' });
    }, 3000);
  };

  const handleGoalSubmit = async (e) => {
    e.preventDefault();
    
    // Validation
    if (!goalData.name || !goalData.name.trim()) {
      return alert('Vui lòng nhập tên mục tiêu');
    }
    
    const amount = Number(goalData.targetAmount);
    if (isNaN(amount) || amount <= 0) {
      return alert('Vui lòng nhập số tiền mục tiêu hợp lệ');
    }
    
    if (!goalData.targetDate) {
      return alert('Vui lòng chọn ngày đạt mục tiêu');
    }
    
    try {
      setLoading(prev => ({ ...prev, goals: true }));
      const token = localStorage.getItem('token');
      if (!token) throw new Error('Vui lòng đăng nhập lại');

      console.log('Sending request to create goal with data:', {
        name: goalData.name.trim(),
        targetAmount: amount,
        targetDate: goalData.targetDate,
        color: goalData.color
      });
      
      const response = await fetch('http://localhost:5000/api/savings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: goalData.name.trim(),
          targetAmount: amount,
          targetDate: goalData.targetDate,
          color: goalData.color
        })
      });
      
      // network errors will be caught below
       
      if (!response.ok) {
        let errorMessage = 'Lỗi khi tạo mục tiêu';
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorMessage;
        } catch (e) {
          console.error('Failed to parse error response:', e);
        }
        throw new Error(errorMessage);
      }
      
      const result = await response.json();
      console.log('Goal created successfully:', result);
      
      // Reset form and fetch updated goals
      setGoalData({
        name: '',
        targetAmount: '',
        currentAmount: '0',
        targetDate: '',
        color: '#4CAF50'
      });
      
      setUiMode('list');
      await fetchGoals();
      
      // Add notification
      showNotification('Tạo mục tiêu thành công!');
       
     } catch (error) {
      console.error('Error creating goal:', error);
      showNotification(`Lỗi: ${error.message || 'Không thể kết nối đến máy chủ. Vui lòng thử lại sau.'}`, 'error');
     } finally {
       setLoading(prev => ({ ...prev, goals: false }));
     }
   };
  
  useEffect(() => {
    const loadData = async () => {
      setLoading({ goals: true, wallets: true });
      try {
        await Promise.all([fetchGoals(), fetchWallets()]);
      } catch (error) {
        setError({ goals: error.message || 'Không thể tải danh sách mục tiêu', wallets: error.message || 'Không thể tải danh sách ví' });
      } finally {
        setLoading({ goals: false, wallets: false });
      }
    };
    
    loadData();
  }, []);

  const fetchGoals = async () => {
    try {
      setLoading(prev => ({ ...prev, goals: true }));
      setError(prev => ({ ...prev, goals: null }));
      
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:5000/api/savings', {
        method: 'GET',
        headers: { 
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(()=>({}));
        throw new Error(errorData.message || 'Failed to fetch goals');
      }
      
      const data = await response.json();
      setGoals(data);
    } catch (error) {
      console.error('Error fetching goals:', error);
      setError(prev => ({ ...prev, goals: error.message || 'Không thể tải danh sách mục tiêu' }));
    } finally {
      setLoading(prev => ({ ...prev, goals: false }));
    }
  };

  const fetchWallets = async () => {
    try {
      setLoading(prev => ({ ...prev, wallets: true }));
      setError(prev => ({ ...prev, wallets: null }));
      
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:5000/api/wallets', {
        method: 'GET',
        headers: { 
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(()=>({}));
        throw new Error(errorData.message || 'Failed to fetch wallets');
      }
      
      const data = await response.json();
      setWallets(data);
    } catch (error) {
      console.error('Error fetching wallets:', error);
      setError(prev => ({ ...prev, wallets: error.message || 'Không thể tải danh sách ví' }));
    } finally {
      setLoading(prev => ({ ...prev, wallets: false }));
    }
  };

  // Handle deposit submission
  const handleDepositSubmit = async (e) => {
    e.preventDefault();
    
    if (!depositData.walletId) {
      return alert('Vui lòng chọn ví để rút tiền.');
    }
    
    const amount = Number(depositData.amount);
    if (isNaN(amount) || amount <= 0) {
      return alert('Vui lòng nhập số tiền hợp lệ (> 0).');
    }

    try {
      const token = localStorage.getItem('token');
      
      // Check wallet balance
      const selectedWallet = wallets.find(w => w._id === depositData.walletId);
      if (!selectedWallet) {
        return alert('Không tìm thấy thông tin ví.');
      }
      
      const walletBalance = selectedWallet.balance || selectedWallet.initialBalance || 0;
      if (walletBalance < amount) {
        return alert(`Số dư trong ví không đủ. Số dư hiện có: ${formatCurrency(walletBalance)}`);
      }

      // Confirm deposit
      if (!window.confirm(`Xác nhận nạp ${formatCurrency(amount)} vào mục tiêu ${selectedGoal.name}?`)) {
        return;
      }

      // Make deposit request
      const response = await fetch(`http://localhost:5000/api/savings/${selectedGoal._id}/deposit`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        body: JSON.stringify({
          amount: amount,
          walletId: depositData.walletId,
          note: depositData.note || `Nạp tiền vào mục tiêu ${selectedGoal.name}`
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Không thể thực hiện giao dịch');
      }

      // Update UI
      showNotification('Nạp tiền thành công!');
      setDepositData({ amount: '', walletId: '', note: '' });
      setUiMode('list');
      setSelectedGoal(null);
      
      // Refresh data
      fetchGoals();
      fetchWallets();
      
    } catch (error) {
      console.error('Deposit error:', error);
      showNotification(error.message || 'Có lỗi xảy ra khi nạp tiền', 'error');
    }
  };

  const openDepositForm = (goal) => {
    setSelectedGoal(goal);
    setUiMode('deposit');
    // If goal has associated wallet, preselect it
    if (goal.walletId) {
      setDepositData({
        ...depositData,
        walletId: goal.walletId._id || goal.walletId
      });
    }
  };

  // add edit mode handling
  const openEditForm = (goal) => {
    setSelectedGoal(goal);
    setGoalData({
      name: goal.name || '',
      targetAmount: goal.targetAmount || '',
      currentAmount: goal.currentAmount || 0,
      targetDate: goal.targetDate ? new Date(goal.targetDate).toISOString().slice(0,10) : '',
      color: goal.color || '#4CAF50'
    });
    setUiMode('edit');
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!selectedGoal) return alert('Không có mục tiêu để sửa');
    if (!goalData.name || !goalData.name.trim()) return alert('Vui lòng nhập tên mục tiêu');
    const amount = Number(goalData.targetAmount);
    if (isNaN(amount) || amount <= 0) return alert('Vui lòng nhập số tiền mục tiêu hợp lệ');
    if (!goalData.targetDate) return alert('Vui lòng chọn ngày đạt mục tiêu');

    try {
      setLoading(prev => ({ ...prev, goals: true }));
      const token = localStorage.getItem('token');
      if (!token) throw new Error('Vui lòng đăng nhập lại');

      const res = await fetch(`http://localhost:5000/api/savings/${selectedGoal._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: goalData.name.trim(),
          targetAmount: amount,
          targetDate: goalData.targetDate,
          color: goalData.color
        })
      });

      const body = await res.json().catch(()=> ({}));
      if (!res.ok) {
        throw new Error(body.message || 'Lỗi khi cập nhật mục tiêu');
      }

      // success -> refresh
      showNotification('Cập nhật mục tiêu thành công');
      setUiMode('list');
      setSelectedGoal(null);
      await fetchGoals();
    } catch (err) {
      console.error('Update error:', err);
      showNotification(err.message || 'Lỗi khi cập nhật mục tiêu', 'error');
    } finally {
      setLoading(prev => ({ ...prev, goals: false }));
    }
  };

  // Modify deleteGoal to show confirmation instead of window.confirm
  const promptDeleteGoal = (goal) => {
    if (!goal || !goal._id) return;
    setConfirmDelete({ show: true, goal });
  };

  // New function to handle actual deletion after confirmation
  const handleDeleteGoal = async () => {
    const goal = confirmDelete.goal;
    if (!goal || !goal._id) return;
    
    setConfirmDelete({ show: false, goal: null });
    
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`http://localhost:5000/api/savings/${goal._id}`, {
        method: 'DELETE',
        headers: {
          ...(token && { 'Authorization': `Bearer ${token}` })
        }
      });
      const body = await res.json().catch(()=> ({}));
      if (!res.ok) throw new Error(body.message || 'Xóa thất bại');
      
      showNotification('Đã xóa mục tiêu thành công');
      await fetchGoals();
    } catch (err) {
      console.error('Delete error:', err);
      showNotification(err.message || 'Lỗi khi xóa mục tiêu', 'error');
    }
  };

  // Format currency in Vietnamese format
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };

  // Calculate percentage (safe when target is zero)
  const calculateProgress = (current, target) => {
    const c = Number(current) || 0;
    const t = Number(target) || 0;
    if (!t) return 0;
    return Math.max(0, Math.min(100, Math.round((c / t) * 100)));
  };

  // Calculate days remaining
  const getDaysRemaining = (targetDate) => {
    if (!targetDate) return 0;
    const today = new Date();
    const target = new Date(targetDate);
    const diffTime = target - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
  };

  // Color options for the goal
  const colorOptions = [
    { value: '#4CAF50', label: 'Xanh lá' },
    { value: '#2196F3', label: 'Xanh dương' },
    { value: '#FF9800', label: 'Cam' },
    { value: '#E91E63', label: 'Hồng' },
    { value: '#9C27B0', label: 'Tím' }
  ];

  // Display the add goal button similar to the image
  if (uiMode === 'list' && goals.length === 0) {
    return (
      <div className="empty-goals-container">
        <div className="bank-card add-goal-bank-card" onClick={() => setUiMode('create')}>
          <div className="card-chip"></div>
          <div className="card-logo">THÊM MỤC TIÊU</div>
          <div className="card-content">
            <div className="card-icon">+</div>
            <div className="card-title">Thêm mục tiêu mới</div>
            <div className="card-subtitle">Tạo và gắn mục tiêu tiết kiệm</div>
          </div>
          <div className="card-footer">
            <div className="card-issuer">MY FINANCE</div>
          </div>
        </div>
        
        {/* Notification toast */}
        {notification.show && (
          <div className={`toast-notification ${notification.type}`}>
            {notification.message}
          </div>
        )}
      </div>
    );
  }

  // Display the goal creation form with bank card styling
  if (uiMode === 'create') {
    return (
      <div className="goal-creation-container bank-style">
        <div className="goal-creation-header">
          <h2>Tạo mục tiêu tiết kiệm mới</h2>
          <button className="close-btn" onClick={() => setUiMode('list')}>×</button>
        </div>
        
        <div className="goal-card-form bank-style">
          <div className="bank-card preview-card">
            <div className="bank-card-chip"></div>
            <div className="bank-card-logo">SAVINGS GOAL</div>
            
            <div className="bank-card-body">
              <div className="card-title">{goalData.name || 'Tên mục tiêu'}</div>
              <div className="card-amount">
                {goalData.targetAmount 
                  ? formatCurrency(goalData.targetAmount)
                  : '0₫'}
              </div>
              <div className="card-date">
                {goalData.targetDate 
                  ? `Đến: ${new Date(goalData.targetDate).toLocaleDateString('vi-VN')}`
                  : 'Chưa đặt ngày'}
              </div>
            </div>
            
            <div className="bank-card-footer">
              <div className="card-holder">MY FINANCE APP</div>
              <div className="card-expiry" style={{backgroundColor: goalData.color}}></div>
            </div>
          </div>
          
          <form onSubmit={handleGoalSubmit} className="goal-form">
            <div className="form-group">
              <label htmlFor="name">Tên mục tiêu</label>
              <input
                type="text"
                id="name"
                name="name"
                value={goalData.name}
                onChange={handleGoalInputChange}
                placeholder="Ví dụ: Du lịch Đà Lạt"
                required
                className="bank-input"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="targetAmount">Số tiền mục tiêu</label>
              <input
                type="number"
                id="targetAmount"
                name="targetAmount"
                value={goalData.targetAmount}
                onChange={handleGoalInputChange}
                placeholder="Nhập số tiền mục tiêu"
                required
                className="bank-input"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="targetDate">Ngày đạt mục tiêu</label>
              <input
                type="date"
                id="targetDate"
                name="targetDate"
                value={goalData.targetDate}
                onChange={handleGoalInputChange}
                required
                className="bank-input"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="color">Màu sắc</label>
              <div className="color-options">
                {colorOptions.map((color) => (
                  <div 
                    key={color.value}
                    className={`color-option ${goalData.color === color.value ? 'selected' : ''}`}
                    style={{ backgroundColor: color.value }}
                    onClick={() => setGoalData(prev => ({ ...prev, color: color.value }))}
                  ></div>
                ))}
              </div>
            </div>
            
            <div className="form-actions bank-style">
              <button type="button" className="cancel-btn" onClick={() => setUiMode('list')}>Hủy</button>
              <button type="submit" className="submit-btn">Tạo mục tiêu</button>
            </div>
          </form>
        </div>
        
        {/* Notification toast */}
        {notification.show && (
          <div className={`toast-notification ${notification.type}`}>
            {notification.message}
          </div>
        )}
      </div>
    );
  }

  // Deposit form: render when user clicks "Nạp" - styled as bank deposit interface
  if (uiMode === 'deposit' && selectedGoal) {
    const remainingAmount = Math.max(0, (selectedGoal.targetAmount || 0) - (selectedGoal.currentAmount || 0));
    return (
      <div className="goal-deposit-container bank-style">
        <div className="goal-deposit-header">
          <h2>Nạp tiền vào mục tiêu</h2>
          <button className="close-btn" onClick={() => { setUiMode('list'); setSelectedGoal(null); }}>×</button>
        </div>

        <div className="deposit-card-container">
          {/* Left side: bank card representing the goal */}
          <div className="deposit-card" style={{ 
            background: selectedGoal.color ? 
              `linear-gradient(135deg, ${selectedGoal.color} 0%, rgba(0, 0, 0, 0.7) 100%)` :
              'linear-gradient(135deg, #1a2a6c 0%, #b21f1f 100%)'
          }}>
            <div className="deposit-card-chip"></div>
            <div className="deposit-card-logo">SAVINGS GOAL</div>
            <div className="deposit-card-title">{selectedGoal.name}</div>
            <div className="deposit-card-balance">
              <span>Hiện tại:</span>
              <span>{formatCurrency(selectedGoal.currentAmount || 0)}</span>
            </div>
            <div className="deposit-card-target">
              <span>Mục tiêu:</span>
              <span>{formatCurrency(selectedGoal.targetAmount || 0)}</span>
            </div>
            <div className="deposit-card-remaining">
              <span>Còn thiếu:</span>
              <span>{formatCurrency(remainingAmount)}</span>
            </div>
            
            <div className="deposit-progress">
              <div className="deposit-progress-bar" style={{ 
                width: `${calculateProgress(selectedGoal.currentAmount, selectedGoal.targetAmount)}%`
              }}></div>
            </div>
            <div className="deposit-progress-text">
              {calculateProgress(selectedGoal.currentAmount, selectedGoal.targetAmount)}% hoàn thành
              {remainingAmount > 0 && (<span> • Còn {getDaysRemaining(selectedGoal.targetDate)} ngày</span>)}
            </div>
            <div className="deposit-card-footer">
              <div className="card-holder">MY FINANCE</div>
            </div>
          </div>

          {/* Right side: deposit form */}
          <div className="deposit-form-container">
            { error.wallets ? (
              <div className="error-message">
                <p>{error.wallets}</p>
                <button onClick={fetchWallets} disabled={loading.wallets} className="retry-button">
                  {loading.wallets ? 'Đang tải...' : 'Thử lại'}
                </button>
              </div>
            ) : loading.wallets ? (
              <div className="loading-message">Đang tải danh sách ví...</div>
            ) : (
              <form onSubmit={handleDepositSubmit} className="deposit-form bank-style">
                <div className="form-group">
                  <label htmlFor="walletId">Chọn ví để rút tiền</label>
                  <select 
                    id="walletId" 
                    name="walletId" 
                    value={depositData.walletId} 
                    onChange={handleDepositInputChange} 
                    required
                    className="bank-input"
                  >
                    <option value="">-- Chọn ví --</option>
                    {wallets.map(w => (
                      <option key={w._id} value={w._id}>
                        {w.name} ({formatCurrency(w.balance || w.initialBalance || 0)})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="amount">Số tiền nạp</label>
                  <input 
                    id="amount" 
                    name="amount" 
                    type="number" 
                    value={depositData.amount} 
                    onChange={handleDepositInputChange} 
                    placeholder="Nhập số tiền cần nạp" 
                    min="1" 
                    required
                    className="bank-input"
                  />
                  <div className="quick-amount-options">
                    <button type="button" className="quick-amount-btn" onClick={() => setDepositData(prev => ({ ...prev, amount: 50000 }))}>50K</button>
                    <button type="button" className="quick-amount-btn" onClick={() => setDepositData(prev => ({ ...prev, amount: 100000 }))}>100K</button>
                    <button type="button" className="quick-amount-btn" onClick={() => setDepositData(prev => ({ ...prev, amount: 200000 }))}>200K</button>
                    <button type="button" className="quick-amount-btn" onClick={() => setDepositData(prev => ({ ...prev, amount: 500000 }))}>500K</button>
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="note">Ghi chú (tùy chọn)</label>
                  <textarea 
                    id="note" 
                    name="note" 
                    value={depositData.note} 
                    onChange={handleDepositInputChange} 
                    rows="3" 
                    placeholder="Ghi chú"
                    className="bank-input"
                  ></textarea>
                </div>

                <div className="form-actions bank-style">
                  <button type="button" className="cancel-btn" onClick={() => { setUiMode('list'); setSelectedGoal(null); }} disabled={loading.wallets}>Hủy</button>
                  <button 
                    type="submit" 
                    className="submit-btn" 
                    disabled={!depositData.walletId || !depositData.amount || loading.wallets}
                  >
                    {loading.wallets ? 'Đang xử lý...' : 'Nạp tiền'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
        
        {/* Notification toast */}
        {notification.show && (
          <div className={`toast-notification ${notification.type}`}>
            {notification.message}
          </div>
        )}
      </div>
    );
  }

  // Edit form with bank card styling
  if (uiMode === 'edit' && selectedGoal) {
    return (
      <div className="goal-creation-container bank-style">
        <div className="goal-creation-header">
          <h2>Sửa mục tiêu</h2>
          <button className="close-btn" onClick={() => { setUiMode('list'); setSelectedGoal(null); }}>×</button>
        </div>
        
        <div className="goal-card-form bank-style">
          <div className="bank-card preview-card" style={{
            background: goalData.color ? 
              `linear-gradient(135deg, ${goalData.color} 0%, rgba(0, 0, 0, 0.7) 100%)` :
              'linear-gradient(135deg, #1a2a6c 0%, #b21f1f 100%)'
          }}>
            <div className="bank-card-chip"></div>
            <div className="bank-card-logo">SAVINGS GOAL</div>
            
            <div className="bank-card-body">
              <div className="card-title">{goalData.name || 'Tên mục tiêu'}</div>
              <div className="card-amount">
                {goalData.targetAmount 
                  ? formatCurrency(goalData.targetAmount)
                  : '0₫'}
              </div>
              <div className="card-date">
                {goalData.targetDate 
                  ? `Đến: ${new Date(goalData.targetDate).toLocaleDateString('vi-VN')}`
                  : 'Chưa đặt ngày'}
              </div>
              
              {/* Add current progress display */}
              <div className="card-progress">
                <div className="card-progress-bar" style={{ 
                  width: `${calculateProgress(goalData.currentAmount, goalData.targetAmount)}%`
                }}></div>
              </div>
              <div className="card-progress-text">
                {calculateProgress(goalData.currentAmount, goalData.targetAmount)}% hoàn thành
              </div>
            </div>
            
            <div className="bank-card-footer">
              <div className="card-holder">MY FINANCE APP</div>
              <div className="card-expiry" style={{backgroundColor: goalData.color}}></div>
            </div>
          </div>
          
          <form onSubmit={handleEditSubmit} className="goal-form">
            <div className="form-group">
              <label htmlFor="name">Tên mục tiêu</label>
              <input 
                type="text" 
                id="name" 
                name="name" 
                value={goalData.name} 
                onChange={handleGoalInputChange} 
                required
                className="bank-input"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="targetAmount">Số tiền mục tiêu</label>
              <input 
                type="number" 
                id="targetAmount" 
                name="targetAmount" 
                value={goalData.targetAmount} 
                onChange={handleGoalInputChange} 
                required
                className="bank-input"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="targetDate">Ngày đạt mục tiêu</label>
              <input 
                type="date" 
                id="targetDate" 
                name="targetDate" 
                value={goalData.targetDate} 
                onChange={handleGoalInputChange} 
                required
                className="bank-input"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="color">Màu sắc</label>
              <div className="color-options">
                {colorOptions.map(c => (
                  <div 
                    key={c.value}
                    className={`color-option ${goalData.color === c.value ? 'selected' : ''}`}
                    style={{ backgroundColor: c.value }}
                    onClick={() => setGoalData(prev => ({ ...prev, color: c.value }))}
                  ></div>
                ))}
              </div>
            </div>
            
            <div className="form-actions bank-style">
              <button type="button" className="cancel-btn" onClick={() => { setUiMode('list'); setSelectedGoal(null); }}>Hủy</button>
              <button type="submit" className="submit-btn">Lưu thay đổi</button>
            </div>
          </form>
        </div>
        
        {/* Notification toast */}
        {notification.show && (
          <div className={`toast-notification ${notification.type}`}>
            {notification.message}
          </div>
        )}
      </div>
    );
  }

  // Display the goals list with enhanced bank card UI
  return (
    <div className="savings-goals-container">
      <div className="savings-goals-header">
        <h2>Mục tiêu tiết kiệm</h2>
        <button className="add-goal-btn" onClick={() => setUiMode('create')}>+ Thêm mục tiêu</button>
      </div>
      
      <div className="goals-cards bank-style">
        {goals.map(goal => (
          <div 
            className="bank-goal-card" 
            key={goal._id}
            style={{
              background: goal.color ? 
                `linear-gradient(135deg, ${goal.color} 0%, rgba(0, 0, 0, 0.7) 100%)` :
                'linear-gradient(135deg, #1a2a6c 0%, #b21f1f 100%)'
            }}
          >
            <div className="bank-card-chip"></div>
            <div className="bank-card-logo">SAVINGS GOAL</div>
            <div className="bank-card-title">{goal.name}</div>
            <div className="bank-card-amount">{formatCurrency(goal.targetAmount)}</div>
            <div className="bank-card-current">Đã tiết kiệm: {formatCurrency(goal.currentAmount)}</div>
            
            <div className="bank-card-progress">
              <div className="bank-card-progress-bar" style={{ 
                width: `${calculateProgress(goal.currentAmount, goal.targetAmount)}%` 
              }}></div>
            </div>
            <div className="bank-card-progress-text">
              {calculateProgress(goal.currentAmount, goal.targetAmount)}% • Còn {getDaysRemaining(goal.targetDate)} ngày
            </div>
            
            <div className="bank-card-actions">
              <button className="bank-card-action-btn deposit" onClick={() => openDepositForm(goal)}>Nạp</button>
              <button className="bank-card-action-btn edit" onClick={() => openEditForm(goal)}>Sửa</button>
              <button className="bank-card-action-btn delete" onClick={() => promptDeleteGoal(goal)}>Xóa</button>
            </div>
            
            <div className="bank-card-footer">
              <div className="card-holder">MY FINANCE</div>
              <div className="bank-card-number">•••• {goal._id.slice(-4)}</div>
            </div>
          </div>
        ))}
        
        {/* Add goal card (bank card style) */}
        <div className="bank-goal-card add-goal" onClick={() => setUiMode('create')}>
          <div className="bank-card-chip"></div>
          <div className="bank-card-logo">NEW GOAL</div>
          <div className="add-goal-content">
            <div className="add-icon">+</div>
            <div className="add-text">Thêm mục tiêu mới</div>
            <div className="add-subtext">Tạo và theo dõi tiến độ tiết kiệm</div>
          </div>
          <div className="bank-card-footer">
            <div className="card-holder">MY FINANCE</div>
          </div>
        </div>
      </div>
      
      {/* Notification toast */}
      {notification.show && (
        <div className={`toast-notification ${notification.type}`}>
          {notification.message}
        </div>
      )}
      
      {/* Confirmation dialog for deletion */}
      {confirmDelete.show && (
        <div className="confirm-delete-overlay">
          <div className="confirm-delete-dialog">
            <h3>Xác nhận xóa</h3>
            <p>Bạn có chắc chắn muốn xóa mục tiêu "{confirmDelete.goal?.name}"?</p>
            <div className="confirm-actions">
              <button className="cancel-btn" onClick={() => setConfirmDelete({ show: false, goal: null })}>Hủy</button>
              <button className="delete-btn" onClick={handleDeleteGoal}>Xóa</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SavingsGoals;



