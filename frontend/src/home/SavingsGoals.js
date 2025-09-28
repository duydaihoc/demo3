import React, { useState, useEffect } from 'react';
import './SavingsGoals.css';
import { HexColorPicker } from 'react-colorful';

function SavingsGoals() {
  const [goals, setGoals] = useState([]);
  const [wallets, setWallets] = useState([]);
  const [uiMode, setUiMode] = useState('list'); // 'list', 'create', 'edit', 'deposit'
  const [selectedGoal, setSelectedGoal] = useState(null);
  const [loading, setLoading] = useState({ goals: false, wallets: false });
  const [error, setError] = useState({ goals: null, wallets: null });
  
  // Form data states
  const [goalData, setGoalData] = useState({
    name: '',
    targetAmount: '',
    currentAmount: '0',
    targetDate: '',
    color: '#2a5298'
  });
  
  // Add state for color picker visibility
  const [showColorPicker, setShowColorPicker] = useState(false);
  
  const [depositData, setDepositData] = useState({
    amount: '',
    walletId: '',
    note: ''
  });
  
  const [notification, setNotification] = useState({ message: '', type: '' }); // type: 'success' | 'error'
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, goal: null });

  // Fetch goals and wallets on component mount
  useEffect(() => {
    fetchGoals();
    fetchWallets();
  }, []);

  // Handler functions
  const handleGoalInputChange = (e) => {
    const { name, value } = e.target;
    setGoalData(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  // New function to handle color change from the color picker
  const handleColorChange = (newColor) => {
    setGoalData(prev => ({
      ...prev,
      color: newColor
    }));
  };
  
  // New function to handle predefined color selection
  const selectPredefinedColor = (colorValue) => {
    setGoalData(prev => ({
      ...prev,
      color: colorValue
    }));
    setShowColorPicker(false);
  };
  
  const handleDepositInputChange = (e) => {
    const { name, value } = e.target;
    setDepositData(prev => ({
      ...prev,
      [name]: value
    }));
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
      
      // Reset form and fetch updated goals
      setGoalData({
        name: '',
        targetAmount: '',
        currentAmount: '0',
        targetDate: '',
        color: '#2a5298'
      });
      
      setUiMode('list');
      await fetchGoals();
      showNotification('Đã tạo mục tiêu thành công!', 'success');
       
    } catch (error) {
      console.error('Error creating goal:', error);
      showNotification(error.message || 'Không thể kết nối đến máy chủ. Vui lòng thử lại sau.', 'error');
    } finally {
      setLoading(prev => ({ ...prev, goals: false }));
    }
  };
  
  const fetchGoals = async () => {
    try {
      setLoading(prev => ({ ...prev, goals: true }));
      setError(prev => ({ ...prev, goals: null }));
      
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:5000/api/savings', {
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

  const openDepositForm = (goal) => {
    setSelectedGoal(goal);
    setUiMode('deposit');
    // Reset deposit form
    setDepositData({
      amount: '',
      walletId: '',
      note: ''
    });
  };

  const openEditForm = (goal) => {
    setSelectedGoal(goal);
    setGoalData({
      name: goal.name || '',
      targetAmount: goal.targetAmount || '',
      currentAmount: goal.currentAmount || 0,
      targetDate: goal.targetDate ? new Date(goal.targetDate).toISOString().slice(0,10) : '',
      color: goal.color || '#2a5298'
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
      showNotification('Cập nhật mục tiêu thành công', 'success');
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

  const handleDepositSubmit = async (e) => {
    e.preventDefault();

    if (!depositData.walletId) {
      showNotification('Vui lòng chọn ví để rút tiền.', 'error');
      return;
    }

    const amount = Number(depositData.amount);
    if (isNaN(amount) || amount <= 0) {
      showNotification('Vui lòng nhập số tiền hợp lệ (> 0).', 'error');
      return;
    }

    try {
      const token = localStorage.getItem('token');

      // Check wallet balance
      const selectedWallet = wallets.find(w => w._id === depositData.walletId);
      if (!selectedWallet) {
        showNotification('Không tìm thấy thông tin ví.', 'error');
        return;
      }

      const walletBalance = selectedWallet.balance || selectedWallet.initialBalance || 0;
      if (walletBalance < amount) {
        showNotification(`Số dư trong ví không đủ. Số dư hiện có: ${formatCurrency(walletBalance)}`, 'error');
        return;
      }

      // Không hỏi xác nhận, thực hiện luôn
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

      // Thông báo thành công bằng toast
      showNotification('Nạp tiền thành công!', 'success');
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

  // Color options for the goal - expanded with more options
  const colorOptions = [
    { value: '#2a5298', label: 'Xanh đậm' },
    { value: '#4ecdc4', label: 'Xanh lá' },
    { value: '#ff6b6b', label: 'Đỏ' },
    { value: '#ffa502', label: 'Cam' },
    { value: '#6c5ce7', label: 'Tím' },
    { value: '#1abc9c', label: 'Xanh ngọc' },
    { value: '#3498db', label: 'Xanh dương' },
    { value: '#9b59b6', label: 'Tím hoa cà' },
    { value: '#f1c40f', label: 'Vàng' },
    { value: '#e67e22', label: 'Cam đậm' },
    { value: '#e74c3c', label: 'Đỏ tươi' },
    { value: '#2c3e50', label: 'Xám đậm' },
    { value: '#27ae60', label: 'Lá cây' },
    { value: '#16a085', label: 'Xanh rêu' }
  ];

  // Helper to show notification
  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification({ message: '', type: '' }), 2500);
  };

  const handleDeleteGoal = async () => {
    const goal = deleteConfirm.goal;
    if (!goal || !goal._id) return;
    setDeleteConfirm({ open: false, goal: null });
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
      showNotification('Đã xóa mục tiêu', 'success');
      await fetchGoals();
    } catch (err) {
      showNotification(err.message || 'Lỗi khi xóa mục tiêu', 'error');
    }
  };

  // UI notification component
  const Notification = ({ message, type }) => (
    message ? (
      <div className={`sg-toast ${type}`}>{message}</div>
    ) : null
  );

  // Delete confirmation modal
  const DeleteConfirmModal = ({ open, goal, onCancel, onConfirm }) => (
    open ? (
      <div className="sg-modal-backdrop">
        <div className="sg-modal">
          <div className="sg-modal-title">Xác nhận xóa</div>
          <div className="sg-modal-content">
            Bạn có chắc chắn muốn xóa mục tiêu <b>{goal?.name}</b>?
          </div>
          <div className="sg-modal-actions">
            <button className="cancel-btn" onClick={onCancel}>Hủy</button>
            <button className="delete-btn" onClick={onConfirm}>Xóa</button>
          </div>
        </div>
      </div>
    ) : null
  );

  // Display the add goal button for empty state
  if (uiMode === 'list' && goals.length === 0) {
    return (
      <div className="savings-container">
        <Notification {...notification} />
        <DeleteConfirmModal
          open={deleteConfirm.open}
          goal={deleteConfirm.goal}
          onCancel={() => setDeleteConfirm({ open: false, goal: null })}
          onConfirm={handleDeleteGoal}
        />
        <div className="savings-header">
          <h2 className="savings-title">Mục tiêu tiết kiệm</h2>
        </div>
        <div className="empty-goals-container">
          <div className="add-goal-card" onClick={() => setUiMode('create')}>
            <div className="add-goal-icon">+</div>
            <div className="add-goal-text">Thêm mục tiêu mới</div>
            <div className="add-goal-subtext">Tạo và theo dõi mục tiêu tiết kiệm</div>
          </div>
        </div>
      </div>
    );
  }

  // Display the goal creation form
  if (uiMode === 'create') {
    return (
      <div className="savings-container">
        <Notification {...notification} />
        <DeleteConfirmModal
          open={deleteConfirm.open}
          goal={deleteConfirm.goal}
          onCancel={() => setDeleteConfirm({ open: false, goal: null })}
          onConfirm={handleDeleteGoal}
        />
        <div className="savings-header">
          <h2 className="savings-title">Tạo mục tiêu tiết kiệm</h2>
        </div>
        <div className="goal-creation-container">
          <div className="goal-creation-header">
            <h2>Tạo mục tiêu mới</h2>
            <button className="close-btn" onClick={() => setUiMode('list')}>×</button>
          </div>
          
          <form onSubmit={handleGoalSubmit} className="goal-form">
            <div className="form-preview">
              <div className="goal-card-preview" style={{background: `linear-gradient(135deg, ${goalData.color} 0%, rgba(0, 0, 0, 0.6) 100%)`}}>
                <div className="goal-card-chip"></div>
                <div className="goal-card-header">
                  <h3>{goalData.name || 'Tên mục tiêu'}</h3>
                  <div className="goal-card-bank">SAVINGS GOAL</div>
                </div>

                <div className="goal-card-balance">
                  <div className="goal-target">
                    {goalData.targetAmount 
                      ? formatCurrency(goalData.targetAmount)
                      : '0₫'}
                  </div>
                </div>

                <div className="goal-progress-container">
                  <div className="goal-progress-bar" style={{ width: '0%' }}></div>
                </div>
                
                <div className="goal-card-footer">
                  <div>0%</div>
                  <div>
                    {goalData.targetDate 
                      ? `${getDaysRemaining(goalData.targetDate)} ngày`
                      : 'Chưa đặt ngày'}
                  </div>
                </div>
              </div>
            </div>
            
            <div className="form-fields">
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
                />
              </div>
              
              <div className="form-group">
                <label>Màu sắc</label>
                
                {/* Color selector interface */}
                <div className="color-selector">
                  <div 
                    className="color-preview" 
                    style={{ backgroundColor: goalData.color }}
                    onClick={() => setShowColorPicker(!showColorPicker)}
                  >
                    <span className="color-hex">{goalData.color}</span>
                  </div>
                  
                  {/* Predefined color palette */}
                  <div className="color-palette">
                    {colorOptions.map((color) => (
                      <div 
                        key={color.value} 
                        className={`color-option ${goalData.color === color.value ? 'selected' : ''}`}
                        style={{ backgroundColor: color.value }}
                        onClick={() => selectPredefinedColor(color.value)}
                        title={color.label}
                      />
                    ))}
                    <div 
                      className="color-option custom-color"
                      onClick={() => setShowColorPicker(!showColorPicker)}
                      title="Tùy chỉnh màu"
                    >
                      <span>+</span>
                    </div>
                  </div>
                  
                  {/* Custom color picker */}
                  {showColorPicker && (
                    <div className="color-picker-container">
                      <HexColorPicker 
                        color={goalData.color} 
                        onChange={handleColorChange} 
                        className="color-picker"
                      />
                      <button 
                        type="button" 
                        className="close-picker-btn"
                        onClick={() => setShowColorPicker(false)}
                      >
                        Đồng ý
                      </button>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="form-actions">
                <button type="button" className="cancel-btn" onClick={() => setUiMode('list')}>Hủy</button>
                <button type="submit" className="submit-goal-btn" disabled={loading.goals}>
                  {loading.goals ? 'Đang xử lý...' : 'Tạo mục tiêu'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // Edit form: similar to create form but for editing
  if (uiMode === 'edit' && selectedGoal) {
    return (
      <div className="savings-container">
        <Notification {...notification} />
        <DeleteConfirmModal
          open={deleteConfirm.open}
          goal={deleteConfirm.goal}
          onCancel={() => setDeleteConfirm({ open: false, goal: null })}
          onConfirm={handleDeleteGoal}
        />
        <div className="savings-header">
          <h2 className="savings-title">Chỉnh sửa mục tiêu</h2>
        </div>
        <div className="goal-creation-container">
          <div className="goal-creation-header">
            <h2>Sửa mục tiêu</h2>
            <button className="close-btn" onClick={() => { setUiMode('list'); setSelectedGoal(null); }}>×</button>
          </div>
          
          <form onSubmit={handleEditSubmit} className="goal-form">
            <div className="form-preview">
              <div className="goal-card-preview" style={{background: `linear-gradient(135deg, ${goalData.color} 0%, rgba(0, 0, 0, 0.6) 100%)`}}>
                <div className="goal-card-chip"></div>
                <div className="goal-card-header">
                  <h3>{goalData.name || 'Tên mục tiêu'}</h3>
                  <div className="goal-card-bank">SAVINGS GOAL</div>
                </div>

                <div className="goal-card-balance">
                  <div className="goal-target">
                    {goalData.targetAmount 
                      ? formatCurrency(goalData.targetAmount)
                      : '0₫'}
                  </div>
                </div>

                <div className="goal-progress-container">
                  <div 
                    className="goal-progress-bar" 
                    style={{ width: `${calculateProgress(goalData.currentAmount, goalData.targetAmount)}%` }}
                  ></div>
                </div>
                
                <div className="goal-card-footer">
                  <div>{calculateProgress(goalData.currentAmount, goalData.targetAmount)}%</div>
                  <div>
                    {goalData.targetDate 
                      ? `${getDaysRemaining(goalData.targetDate)} ngày`
                      : 'Chưa đặt ngày'}
                  </div>
                </div>
              </div>
            </div>
            
            <div className="form-fields">
              <div className="form-group">
                <label htmlFor="name">Tên mục tiêu</label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={goalData.name}
                  onChange={handleGoalInputChange}
                  required
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
                />
              </div>
              
              <div className="form-group">
                <label>Màu sắc</label>
                
                {/* Color selector interface */}
                <div className="color-selector">
                  <div 
                    className="color-preview" 
                    style={{ backgroundColor: goalData.color }}
                    onClick={() => setShowColorPicker(!showColorPicker)}
                  >
                    <span className="color-hex">{goalData.color}</span>
                  </div>
                  
                  {/* Predefined color palette */}
                  <div className="color-palette">
                    {colorOptions.map((color) => (
                      <div 
                        key={color.value} 
                        className={`color-option ${goalData.color === color.value ? 'selected' : ''}`}
                        style={{ backgroundColor: color.value }}
                        onClick={() => selectPredefinedColor(color.value)}
                        title={color.label}
                      />
                    ))}
                    <div 
                      className="color-option custom-color"
                      onClick={() => setShowColorPicker(!showColorPicker)}
                      title="Tùy chỉnh màu"
                    >
                      <span>+</span>
                    </div>
                  </div>
                  
                  {/* Custom color picker */}
                  {showColorPicker && (
                    <div className="color-picker-container">
                      <HexColorPicker 
                        color={goalData.color} 
                        onChange={handleColorChange} 
                        className="color-picker"
                      />
                      <button 
                        type="button" 
                        className="close-picker-btn"
                        onClick={() => setShowColorPicker(false)}
                      >
                        Đồng ý
                      </button>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="form-actions">
                <button type="button" className="cancel-btn" onClick={() => { setUiMode('list'); setSelectedGoal(null); }}>Hủy</button>
                <button type="submit" className="submit-goal-btn" disabled={loading.goals}>
                  {loading.goals ? 'Đang xử lý...' : 'Lưu thay đổi'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // Deposit form: for depositing money into a goal
  if (uiMode === 'deposit' && selectedGoal) {
    const remainingAmount = Math.max(0, (selectedGoal.targetAmount || 0) - (selectedGoal.currentAmount || 0));
    return (
      <div className="savings-container">
        <Notification {...notification} />
        <DeleteConfirmModal
          open={deleteConfirm.open}
          goal={deleteConfirm.goal}
          onCancel={() => setDeleteConfirm({ open: false, goal: null })}
          onConfirm={handleDeleteGoal}
        />
        <div className="savings-header">
          <h2 className="savings-title">Nạp tiền vào mục tiêu</h2>
        </div>
        <div className="goal-deposit-container">
          <div className="deposit-card" style={{background: `linear-gradient(135deg, ${selectedGoal.color || '#2a5298'} 0%, rgba(0, 0, 0, 0.6) 100%)`}}>
            <div className="deposit-card-content">
              <div className="deposit-card-chip"></div>
              <div className="deposit-title">{selectedGoal.name}</div>
              <div className="deposit-amount">{formatCurrency(selectedGoal.currentAmount || 0)} / {formatCurrency(selectedGoal.targetAmount || 0)}</div>
              <div className="deposit-progress">
                <div className="deposit-progress-bar" style={{ width: `${calculateProgress(selectedGoal.currentAmount, selectedGoal.targetAmount)}%` }}></div>
              </div>
              <div className="deposit-meta">
                <div>{calculateProgress(selectedGoal.currentAmount, selectedGoal.targetAmount)}% hoàn thành</div>
                <div>Còn {getDaysRemaining(selectedGoal.targetDate)} ngày</div>
              </div>
            </div>
          </div>

          <div className="deposit-form-card">
            <h3>Nạp tiền vào mục tiêu</h3>
            
            {error.wallets ? (
              <div className="error-message">
                <p>{error.wallets}</p>
                <button onClick={fetchWallets} disabled={loading.wallets} className="retry-button">
                  {loading.wallets ? 'Đang tải...' : 'Thử lại'}
                </button>
              </div>
            ) : loading.wallets ? (
              <div className="loading-message">Đang tải danh sách ví...</div>
            ) : (
              <form onSubmit={handleDepositSubmit} className="deposit-form">
                <div className="form-group">
                  <label htmlFor="walletId">Chọn ví để rút tiền</label>
                  <select 
                    id="walletId" 
                    name="walletId" 
                    value={depositData.walletId} 
                    onChange={handleDepositInputChange} 
                    required
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
                  />
                  <div className="currency-hint">VND</div>
                  
                  <div className="suggested-amounts">
                    <button type="button" onClick={() => setDepositData(prev => ({ ...prev, amount: 50000 }))}>50.000</button>
                    <button type="button" onClick={() => setDepositData(prev => ({ ...prev, amount: 100000 }))}>100.000</button>
                    <button type="button" onClick={() => setDepositData(prev => ({ ...prev, amount: 500000 }))}>500.000</button>
                    <button type="button" onClick={() => setDepositData(prev => ({ ...prev, amount: remainingAmount }))}>Nạp đủ</button>
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="note">Ghi chú (tùy chọn)</label>
                  <textarea 
                    id="note" 
                    name="note" 
                    value={depositData.note} 
                    onChange={handleDepositInputChange} 
                    rows="2" 
                    placeholder="Ghi chú cho giao dịch này"
                  ></textarea>
                </div>

                <div className="form-actions">
                  <button 
                    type="button" 
                    className="cancel-btn" 
                    onClick={() => { setUiMode('list'); setSelectedGoal(null); }}
                  >
                    Hủy
                  </button>
                  <button 
                    type="submit" 
                    className="submit-deposit-btn" 
                    disabled={!depositData.walletId || !depositData.amount}
                  >
                    Nạp tiền
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Display the goals list (default view)
  return (
    <div className="savings-container">
      <Notification {...notification} />
      <DeleteConfirmModal
        open={deleteConfirm.open}
        goal={deleteConfirm.goal}
        onCancel={() => setDeleteConfirm({ open: false, goal: null })}
        onConfirm={handleDeleteGoal}
      />
      <div className="savings-header">
        <h2 className="savings-title">Mục tiêu tiết kiệm</h2>
        <button className="add-goal-btn" onClick={() => setUiMode('create')}>+ Thêm mục tiêu</button>
      </div>
      
      {loading.goals ? (
        <div className="loading-container">Đang tải mục tiêu...</div>
      ) : error.goals ? (
        <div className="error-container">
          {error.goals}
          <button onClick={fetchGoals}>Tải lại</button>
        </div>
      ) : (
        <div className="goals-grid">
          {goals.map(goal => (
            <div 
              className="goal-card" 
              key={goal._id}
              style={{
                background: goal.color ? 
                  `linear-gradient(135deg, ${goal.color} 0%, rgba(0, 0, 0, 0.6) 100%)` :
                  'linear-gradient(135deg, #2a5298 0%, rgba(0, 0, 0, 0.6) 100%)'
              }}
            >
              <div className="goal-card-chip"></div>
              <div className="goal-card-header">
                <h3>{goal.name}</h3>
                <div className="goal-card-bank">SAVINGS GOAL</div>
              </div>

              <div className="goal-card-balance">
                <div className="goal-target">
                  {formatCurrency(goal.currentAmount || 0)} / {formatCurrency(goal.targetAmount || 0)}
                </div>
                <div className="goal-percentage">{calculateProgress(goal.currentAmount, goal.targetAmount)}%</div>
              </div>

              <div className="goal-progress-container">
                <div 
                  className="goal-progress-bar" 
                  style={{ width: `${calculateProgress(goal.currentAmount, goal.targetAmount)}%` }}
                ></div>
              </div>
              
              <div className="goal-card-footer">
                <div className="goal-days">{getDaysRemaining(goal.targetDate)} ngày còn lại</div>
              </div>

              <div className="goal-card-actions">
                <button className="goal-action-btn deposit" onClick={() => openDepositForm(goal)}>Nạp tiền</button>
                <button className="goal-action-btn edit" onClick={() => openEditForm(goal)}>Sửa</button>
                <button className="goal-action-btn delete" onClick={() => setDeleteConfirm({ open: true, goal })}>Xóa</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default SavingsGoals;





