import React, { useState, useEffect } from 'react';
import './SavingsGoals.css';
import { HexColorPicker } from 'react-colorful';
import { useTour } from '@reactour/tour';
import { savingsGoalSteps } from './savingsTourConfig';
import { showNotification as showGlobalNotification } from '../utils/notify';

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
  
  // Removed local notification state - using global notification only
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, goal: null });

  // NEW: gamification state
  const [gamification, setGamification] = useState(null);
  const [showGamifyHelp, setShowGamifyHelp] = useState(false); // NEW

  // Tour hooks for "Hướng dẫn tạo mục tiêu"
  const { setIsOpen: openTour, setSteps: setTourSteps, setCurrentStep: setTourStep } = useTour();

  const startSavingsGoalTour = () => {
    setTourSteps(savingsGoalSteps);
    setTourStep(0);
    openTour(true);
  };

  // Helper: mở chế độ tạo mục tiêu + thông báo cho tour
  const openCreateGoalMode = () => {
    setUiMode('create');
    try {
      window.dispatchEvent(new Event('savingsGoalCreateFormOpened'));
    } catch (e) {
      // ignore
    }
  };

  // Fetch goals and wallets on component mount
  useEffect(() => {
    fetchGoals();
    fetchWallets();
    fetchGamification(); // NEW
  }, []);

  // NEW: fetch gamification
  const fetchGamification = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('http://localhost:5000/api/savings/gamification', {
        headers: {
          ...(token && { 'Authorization': `Bearer ${token}` })
        }
      });
      const data = await res.json().catch(()=> ({}));
      if (res.ok && data && data.ok) {
        setGamification(data);
      }
    } catch (e) {
      // silent fail
    }
  };

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
      return showNotification('Vui lòng nhập tên mục tiêu', 'error');
    }
    
    const amount = Number(goalData.targetAmount);
    if (isNaN(amount) || amount <= 0) {
      return showNotification('Vui lòng nhập số tiền mục tiêu hợp lệ', 'error');
    }
    
    if (!goalData.targetDate) {
      return showNotification('Vui lòng chọn ngày đạt mục tiêu', 'error');
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
      fetchGamification();
      // Thông báo cho tour: đã tạo xong mục tiêu
      try {
        window.dispatchEvent(new Event('savingsGoalCreated'));
      } catch (e) {
        // ignore
      }
       
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
    if (!selectedGoal) return showNotification('Không có mục tiêu để sửa', 'error');
    if (!goalData.name || !goalData.name.trim()) return showNotification('Vui lòng nhập tên mục tiêu', 'error');
    const amount = Number(goalData.targetAmount);
    if (isNaN(amount) || amount <= 0) return showNotification('Vui lòng nhập số tiền mục tiêu hợp lệ', 'error');
    if (!goalData.targetDate) return showNotification('Vui lòng chọn ngày đạt mục tiêu', 'error');

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
      fetchGamification();
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
      fetchGamification();

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

  // Helper to show notification - chỉ dùng global notification từ notify.js
  // Wrapper function để giữ tương thích với code hiện tại
  const showNotification = (message, type = 'success') => {
    showGlobalNotification(message, type, 3000);
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
      showNotification('Đã xóa mục tiêu thành công', 'success');
      await fetchGoals();
      fetchGamification();
    } catch (err) {
      showNotification(err.message || 'Lỗi khi xóa mục tiêu', 'error');
    }
  };

  // Thêm hàm báo cáo hoàn thành mục tiêu
  const reportGoalCompletion = async (goalId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:5000/api/savings/${goalId}/report`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Không thể báo cáo mục tiêu');
      }

      showNotification('Đã báo cáo hoàn thành mục tiêu!', 'success');
      fetchGoals(); // Refresh danh sách
      fetchGamification();
      // Tải PDF báo cáo
      const pdfResponse = await fetch(`http://localhost:5000/api/savings/${goalId}/report-pdf`, {
        headers: {
          ...(token && { 'Authorization': `Bearer ${token}` })
        }
      });

      if (pdfResponse.ok) {
        const blob = await pdfResponse.blob();
        if (blob.size > 0) {
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `bao-cao-muc-tieu-${Date.now()}.pdf`;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
        } else {
          showNotification('Không thể tải PDF báo cáo - file rỗng', 'error');
        }
      } else {
        showNotification('Không thể tải PDF báo cáo', 'error');
      }
    } catch (error) {
      console.error('Error reporting goal:', error);
      showNotification(error.message || 'Có lỗi xảy ra khi báo cáo mục tiêu', 'error');
    }
  };

  // NEW: export PDF for completed / overdue goal
  const downloadGoalPdf = async (goal) => {
    if (!goal || !goal._id) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`http://localhost:5000/api/savings/${goal._id}/report-pdf`, {
        headers: { ...(token && { 'Authorization': `Bearer ${token}` }) }
      });
      if (!res.ok) throw new Error('Không thể xuất PDF');
      const blob = await res.blob();
      if (!blob.size) throw new Error('File PDF rỗng');

      // Try filename from server header first
      let filename = null;
      const cd = res.headers.get('content-disposition');
      if (cd) {
        // parse filename*=UTF-8''... or filename="..."
        const matchUtf8 = cd.match(/filename\*\=UTF-8''([^;]+)/i);
        const matchBasic = cd.match(/filename="([^"]+)"/i);
        if (matchUtf8) filename = decodeURIComponent(matchUtf8[1]);
        else if (matchBasic) filename = matchBasic[1];
      }
      // Fallback: keep Vietnamese accents, just remove illegal characters
      if (!filename) {
        const base = (goal.name || 'mục tiêu')
          .toString()
          .normalize('NFC')
          .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
          .trim()
          .replace(/\s+/g, '-')
          .slice(0, 80) || 'bao-cao-muc-tieu';
        filename = `bao-cao-muc-tieu-${base}.pdf`;
      }

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
      showNotification('Đã tải PDF thành công', 'success');
    } catch (e) {
      showNotification(e.message || 'Lỗi xuất PDF', 'error');
    }
  };

  // UI notification component removed - using global notification from notify.js only

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

  // NEW: Help modal for levels & badges
  const GamifyHelpModal = ({ open, data, onClose, goals = [] }) => {
    if (!open) return null;
    // Nếu không có data, vẫn hiển thị modal với thông báo
    if (!data) {
      return (
        <div className="sg-modal-backdrop" onClick={onClose}>
          <div className="sg-help-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sg-help-header">
              <div className="sg-help-title">Giải thích cấp độ & huy hiệu</div>
              <button className="sg-help-close" onClick={onClose}>×</button>
            </div>
            <div className="sg-help-section">
              <p className="sg-help-text">Đang tải thông tin...</p>
            </div>
          </div>
        </div>
      );
    }
    const { thresholds = [], badges = [], level, progressPct, totals } = data;

    // NEW: build dynamic details per badge
    const contributionsCount = goals.reduce((sum, g) => sum + (Array.isArray(g.contributions) ? g.contributions.length : 0), 0);
    const bigGoalReached = (min) => goals.some(g =>
      (g.status === 'completed' || g.currentAmount >= g.targetAmount) && g.targetAmount >= min
    );
    const buildBadgeDetail = (b) => {
      const remainingText = (need) => need <= 0 ? 'Đã đạt' : `Còn thiếu ${need.toLocaleString('vi-VN')}₫`;
      switch (b.key) {
        case 'starter':
          return { process: '1) Bấm "+ Thêm mục tiêu" 2) Nhập thông tin 3) Lưu', status: totals.goals >= 1 ? 'Đã tạo ≥ 1 mục tiêu' : 'Chưa có mục tiêu', missing: totals.goals >= 1 ? null : 'Tạo ít nhất 1 mục tiêu.' };
        case 'first_complete':
          return { process: 'Nạp tiền đủ 100% rồi bấm "Báo cáo hoàn thành".', status: totals.completed >= 1 ? 'Đã hoàn thành 1 mục tiêu' : 'Chưa hoàn thành mục tiêu', missing: totals.completed >= 1 ? null : 'Hoàn thành 1 mục tiêu.' };
        case 'silver_saver':
          return { process: 'Hoàn thành 3 mục tiêu (đạt 100% & báo cáo).', status: `${totals.completed}/3`, missing: totals.completed >= 3 ? null : `Còn ${3 - totals.completed} mục tiêu nữa.` };
        case 'gold_saver':
          return { process: 'Hoàn thành 5 mục tiêu.', status: `${totals.completed}/5`, missing: totals.completed >= 5 ? null : `Còn ${5 - totals.completed} mục tiêu.` };
        case 'master_spender':
          return { process: 'Hoàn thành 10 mục tiêu.', status: `${totals.completed}/10`, missing: totals.completed >= 10 ? null : `Còn ${10 - totals.completed} mục tiêu.` };
        case 'ten_million': {
          const need = 10_000_000 - totals.totalSaved;
          return { process: 'Tổng số tiền đã nạp vào các mục tiêu đạt 10.000.000₫.', status: `${totals.totalSaved.toLocaleString('vi-VN')}₫ / 10.000.000₫`, missing: need <= 0 ? null : remainingText(need) };
        }
        case 'twenty_million_total': {
          const need = 20_000_000 - totals.totalSaved;
          return { process: 'Tiết kiệm cộng dồn đạt 20.000.000₫.', status: `${totals.totalSaved.toLocaleString('vi-VN')}₫ / 20.000.000₫`, missing: need <= 0 ? null : remainingText(need) };
        }
        case 'fifty_million_total': {
          const need = 50_000_000 - totals.totalSaved;
          return { process: 'Tiết kiệm cộng dồn đạt 50.000.000₫.', status: `${totals.totalSaved.toLocaleString('vi-VN')}₫ / 50.000.000₫`, missing: need <= 0 ? null : remainingText(need) };
        }
        case 'hundred_million_total': {
          const need = 100_000_000 - totals.totalSaved;
          return { process: 'Tiết kiệm cộng dồn đạt 100.000.000₫.', status: `${totals.totalSaved.toLocaleString('vi-VN')}₫ / 100.000.000₫`, missing: need <= 0 ? null : remainingText(need) };
        }
        case 'big_goal_20m':
          return { process: 'Tạo & hoàn thành 1 mục tiêu có target ≥ 20.000.000₫.', status: bigGoalReached(20_000_000) ? 'Đã có mục tiêu ≥20M hoàn thành' : 'Chưa có', missing: bigGoalReached(20_000_000) ? null : 'Hoàn thành mục tiêu ≥20M.' };
        case 'big_goal_50m':
          return { process: 'Hoàn thành mục tiêu target ≥ 50.000.000₫.', status: bigGoalReached(50_000_000) ? 'Đã có' : 'Chưa có', missing: bigGoalReached(50_000_000) ? null : 'Hoàn thành mục tiêu ≥50M.' };
        case 'big_goal_100m':
          return { process: 'Hoàn thành mục tiêu target ≥ 100.000.000₫.', status: bigGoalReached(100_000_000) ? 'Đã có' : 'Chưa có', missing: bigGoalReached(100_000_000) ? null : 'Hoàn thành mục tiêu ≥100M.' };
        case 'fast_finisher_30d': {
          const any = goals.some(g => g.completedAt && g.startDate && (new Date(g.completedAt) - new Date(g.startDate)) / 86400000 <= 30);
          return { process: 'Hoàn thành mục tiêu trong ≤30 ngày kể từ ngày tạo.', status: any ? 'Đã đạt' : 'Chưa đạt', missing: any ? null : 'Hoàn thành nhanh một mục tiêu.' };
        }
        case 'precise_finisher': {
          const any = goals.some(g => g.status === 'completed' && Math.abs((g.currentAmount || 0) - (g.targetAmount || 0)) <= 1000);
          return { process: 'Kết thúc với số tiền đúng (±1.000₫).', status: any ? 'Đã có mục tiêu chuẩn' : 'Chưa có', missing: any ? null : 'Hoàn thành mục tiêu với số tiền chính xác.' };
        }
        case 'streak_3_months': {
          // simple recompute: months already in backend logic—show completed count
          return { process: 'Hoàn thành ít nhất 1 mục tiêu mỗi tháng trong 3 tháng liên tiếp.', status: badges.find(x => x.key === 'streak_3_months')?.unlocked ? 'Đã đạt' : 'Chưa đạt', missing: badges.find(x => x.key === 'streak_3_months')?.unlocked ? null : 'Duy trì hoàn thành mục tiêu mỗi tháng.' };
        }
        case 'contributor_10':
          return { process: 'Tổng số lần nạp (contributions) ≥ 10.', status: `${contributionsCount}/10`, missing: contributionsCount >= 10 ? null : `Còn ${10 - contributionsCount} lần nạp.` };
        case 'contributor_25':
          return { process: 'Tổng số lần nạp ≥ 25.', status: `${contributionsCount}/25`, missing: contributionsCount >= 25 ? null : `Còn ${25 - contributionsCount} lần nạp.` };
        case 'overdue_recovery': {
          const any = goals.some(g => g.status === 'completed' && g.targetDate && g.completedAt && new Date(g.completedAt) > new Date(g.targetDate));
          return { process: 'Hoàn thành mục tiêu sau khi đã quá hạn.', status: any ? 'Đã có mục tiêu quá hạn hoàn thành' : 'Chưa có', missing: any ? null : 'Hoàn thành một mục tiêu quá hạn.' };
        }
        case 'early_bird': {
            const any = goals.some(g => g.completedAt && g.targetDate && (new Date(g.targetDate) - new Date(g.completedAt)) / 86400000 >= 7);
            return { process: 'Hoàn thành ít nhất 7 ngày trước hạn.', status: any ? 'Đã có mục tiêu hoàn thành sớm' : 'Chưa có', missing: any ? null : 'Hoàn thành sớm một mục tiêu.' };
        }
        default:
          return { process: '—', status: b.unlocked ? 'Đã đạt' : 'Chưa đạt', missing: null };
      }
    };

    return (
      <div className="sg-modal-backdrop">
        <div className="sg-help-modal">
          <div className="sg-help-header">
            <div className="sg-help-title">Giải thích cấp độ & huy hiệu</div>
            <button className="sg-help-close" onClick={onClose}>×</button>
          </div>
          <div className="sg-help-section">
            <div className="sg-help-subtitle">Cấp độ tài chính</div>
            <p className="sg-help-text">
              Cấp độ dựa trên số mục tiêu hoàn thành. Bạn ở <b>Lv {level}</b> (tiến độ {progressPct}%).
            </p>
            <ul className="sg-level-list">
              {thresholds.map((t,i) => (
                <li key={i} className={totals.completed >= t ? 'reached' : ''}>
                  Lv {i} — Hoàn thành ≥ {t} mục tiêu
                </li>
              ))}
            </ul>
          </div>
          <div className="sg-help-section">
            <div className="sg-help-subtitle">Huy hiệu</div>
            <p className="sg-help-text">
              Mỗi huy hiệu có điều kiện rõ ràng. Phần "Còn thiếu" giúp biết bước tiếp theo.
            </p>
            <ul className="sg-badge-list">
              {badges.map(b => {
                const detail = buildBadgeDetail(b);
                return (
                  <li key={b.key} className={`badge-row ${b.unlocked ? 'unlocked' : 'locked'}`}>
                    <span className="badge-name">{b.name}</span>
                    <span className="badge-desc">{b.description}</span>
                    <span className="badge-state">{b.unlocked ? '✓' : '—'}</span>
                  </li>
                );
              })}
            </ul>
          </div>
          {/* NEW: detailed process table */}
          <div className="sg-help-section">
            <div className="sg-help-subtitle">Quy trình đạt huy hiệu</div>
            <div className="sg-badge-detail-table">
              {badges.map(b => {
                const d = buildBadgeDetail(b);
                return (
                  <div key={b.key} className={`bd-row ${b.unlocked ? 'done' : ''}`}>
                    <div className="bd-left">
                      <div className="bd-title">{b.name}</div>
                      <div className="bd-process">{d.process}</div>
                    </div>
                    <div className="bd-mid">
                      <span className="bd-status">{d.status}</span>
                      {d.missing && !b.unlocked && <span className="bd-missing">{d.missing}</span>}
                    </div>
                    <div className="bd-right">
                      {b.unlocked ? <span className="bd-badge-ok">✓</span> : <span className="bd-badge-pending">... </span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Render gamification card
  const GamificationCard = () => {
    if (!gamification) return null;
    const level = gamification.level ?? 0;
    const progress = gamification.progressPct ?? 0;
    const badges = Array.isArray(gamification.badges) ? gamification.badges : [];
    const completed = gamification.totals?.completed || 0;
    const totalSaved = gamification.totals?.totalSaved || 0;
    // NEW: guidance fields
    const levelNote = gamification.levelNote || '';
    const levelGuides = Array.isArray(gamification.levelGuides) ? gamification.levelGuides : [];

    return (
      <div className="sg-gamify-card">
        <div className="sg-gamify-left">
          {/* NEW: place help button inside level frame only */}
          <button
            type="button"
            className="sg-help-btn"
            aria-label="Giải thích cấp độ & huy hiệu"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              console.log('Help button clicked, current showGamifyHelp:', showGamifyHelp, 'gamification:', gamification);
              setShowGamifyHelp(true);
            }}
          >?</button>

          <div className="sg-level">Cấp độ tài chính: <b>Lv {level}</b></div>
          <div className="sg-progress-wrap" aria-label="Tiến độ lên cấp">
            <div className="sg-progress-bar">
              <div className="sg-progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <div className="sg-progress-meta">
              <span>Tiến độ: {progress}%</span>
              <span>Hoàn thành: {completed} mục tiêu</span>
              <span>Đã tiết kiệm: {new Intl.NumberFormat('vi-VN').format(totalSaved)}₫</span>
            </div>
          </div>

          {/* NEW: level guidance note + guides */}
          {levelNote ? <div className="sg-level-note">{levelNote}</div> : null}
          {levelGuides.length > 0 && (
            <div className="sg-guides">
              {levelGuides.map(g => (
                <div key={g.level} className={`sg-guide ${g.level <= level ? 'unlocked' : ''}`}>
                  <b>Lv {g.level}</b> — {g.note}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="sg-gamify-right">
          <div className="sg-badges-title">Huy hiệu</div>
          <div className="sg-badges">
            {badges.map(b => (
              <div key={b.key} className={`sg-badge ${b.unlocked ? 'unlocked' : 'locked'}`} title={b.description}>
                <div className="sg-badge-icon"></div>
                <div className="sg-badge-name">{b.name}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // Display the add goal button for empty state
  if (uiMode === 'list' && goals.length === 0) {
    return (
      <div className="savings-container tour-goals-component">
        {/* Notification removed - using global notification from notify.js only */}
        <DeleteConfirmModal
          open={deleteConfirm.open}
          goal={deleteConfirm.goal}
          onCancel={() => setDeleteConfirm({ open: false, goal: null })}
          onConfirm={handleDeleteGoal}
        />
        <div className="savings-header">
          <div className="savings-title-wrap">
            <h2 className="savings-title">Mục tiêu tiết kiệm</h2>
            <button
              type="button"
              className="sg-tour-btn"
              title="Hướng dẫn tạo mục tiêu"
              onClick={startSavingsGoalTour}
            >
              <i className="fas fa-question-circle" />
            </button>
          </div>
        </div>
        <GamificationCard />
        <GamifyHelpModal
          open={showGamifyHelp}
          data={gamification}
          goals={goals}
          onClose={() => setShowGamifyHelp(false)}
        />
        <div className="empty-goals-container">
          <div className="add-goal-card" onClick={openCreateGoalMode}>
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
        {/* Notification removed - using global notification from notify.js only */}
        <DeleteConfirmModal
          open={deleteConfirm.open}
          goal={deleteConfirm.goal}
          onCancel={() => setDeleteConfirm({ open: false, goal: null })}
          onConfirm={handleDeleteGoal}
        />
        <GamifyHelpModal
          open={showGamifyHelp}
          data={gamification}
          goals={goals}
          onClose={() => setShowGamifyHelp(false)}
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
        {/* Notification removed - using global notification from notify.js only */}
        <DeleteConfirmModal
          open={deleteConfirm.open}
          goal={deleteConfirm.goal}
          onCancel={() => setDeleteConfirm({ open: false, goal: null })}
          onConfirm={handleDeleteGoal}
        />
        <GamifyHelpModal
          open={showGamifyHelp}
          data={gamification}
          goals={goals}
          onClose={() => setShowGamifyHelp(false)}
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
        {/* Notification removed - using global notification from notify.js only */}
        <DeleteConfirmModal
          open={deleteConfirm.open}
          goal={deleteConfirm.goal}
          onCancel={() => setDeleteConfirm({ open: false, goal: null })}
          onConfirm={handleDeleteGoal}
        />
        <GamifyHelpModal
          open={showGamifyHelp}
          data={gamification}
          goals={goals}
          onClose={() => setShowGamifyHelp(false)}
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
    <div className="savings-container tour-goals-component">
        {/* Notification removed - using global notification from notify.js only */}
      <DeleteConfirmModal
        open={deleteConfirm.open}
        goal={deleteConfirm.goal}
        onCancel={() => setDeleteConfirm({ open: false, goal: null })}
        onConfirm={handleDeleteGoal}
      />
      <div className="savings-header">
        <div className="savings-title-wrap">
          <h2 className="savings-title">Mục tiêu tiết kiệm</h2>
          <button
            type="button"
            className="sg-tour-btn"
            title="Hướng dẫn tạo mục tiêu"
            onClick={startSavingsGoalTour}
          >
            <i className="fas fa-question-circle" />
          </button>
        </div>
        <button className="add-goal-btn" onClick={openCreateGoalMode}>Thêm mục tiêu</button>
      </div>

      <GamificationCard />
      <GamifyHelpModal
        open={showGamifyHelp}
        data={gamification}
        goals={goals}              // NEW pass goals
        onClose={() => setShowGamifyHelp(false)}
      />

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
              className={`goal-card ${goal.status === 'completed' ? 'completed' : goal.status === 'overdue' ? 'overdue' : ''}`}
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

              {/* Hiển thị thông báo nếu có */}
              {goal.notification && (
                <div className={`goal-notification ${goal.notification.type}`}>
                  <div className="notification-icon">
                  </div>
                  <div className="notification-content">
                    <div className="notification-message">{goal.notification.message}</div>
                    <button 
                      className="notification-action-btn"
                      onClick={() => reportGoalCompletion(goal._id)}
                    >
                      Báo cáo hoàn thành
                    </button>
                  </div>
                </div>
              )}

              <div className="goal-card-actions">
                {goal.status !== 'completed' && (
                  <>
                    <button className="goal-action-btn deposit" onClick={() => openDepositForm(goal)}>Nạp tiền</button>
                    <button className="goal-action-btn edit" onClick={() => openEditForm(goal)}>Sửa</button>
                  </>
                )}
                {(goal.status === 'completed' || goal.status === 'overdue') && (
                  <button
                    className="goal-action-btn pdf"
                    onClick={() => downloadGoalPdf(goal)}
                  >
                    PDF
                  </button>
                )}
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





