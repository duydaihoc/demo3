import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import FamilySidebar from './FamilySidebar';
import './FamilyHome.css';

export default function FamilyHome() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [familyData, setFamilyData] = useState(null);
  const [budgets, setBudgets] = useState([]);
  const [error, setError] = useState(null);
  // Thêm state cho người dùng hiện tại
  const [currentUser, setCurrentUser] = useState(null);
  // Thêm state mới
  const [familyBalance, setFamilyBalance] = useState(null);
  const [loadingBalance, setLoadingBalance] = useState(false);
  // State cho modal ngân sách
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [budgetList, setBudgetList] = useState([]);
  const [loadingBudgets, setLoadingBudgets] = useState(false);
  const [showAddBudget, setShowAddBudget] = useState(false);
  const [addBudgetForm, setAddBudgetForm] = useState({ category: '', amount: '', date: '', note: '' });
  const [addBudgetLoading, setAddBudgetLoading] = useState(false);
  const [addBudgetError, setAddBudgetError] = useState('');
  const [categories, setCategories] = useState([]);
  // State cho edit budget
  const [editBudgetModal, setEditBudgetModal] = useState({ show: false, budget: null });
  const [editBudgetForm, setEditBudgetForm] = useState({ amount: '', date: '' });
  const [editBudgetLoading, setEditBudgetLoading] = useState(false);
  const [editBudgetError, setEditBudgetError] = useState('');
  // State cho delete budget
  const [deleteBudgetModal, setDeleteBudgetModal] = useState({ show: false, budget: null });
  const [deleteBudgetLoading, setDeleteBudgetLoading] = useState(false);
  // State cho tiến độ ngân sách
  const [budgetProgress, setBudgetProgress] = useState({});
  const [loadingProgress, setLoadingProgress] = useState(false);
  // State cho modal chi tiết ngân sách
  const [budgetDetailModal, setBudgetDetailModal] = useState({ show: false, budget: null, transactions: [] });
  const [budgetDetailLoading, setBudgetDetailLoading] = useState(false);
  // State + handlers for "Xem tất cả" family transactions modal
  const [showAllFamilyTxModal, setShowAllFamilyTxModal] = useState(false);
  const [familyTransactionsAll, setFamilyTransactionsAll] = useState([]);
  const [loadingFamilyTxAll, setLoadingFamilyTxAll] = useState(false);
  const [familyTxsError, setFamilyTxsError] = useState(null);
  // NEW: state cho tổng số lượng giao dịch gia đình (để hiển thị ở card)
  const [totalFamilyTxCount, setTotalFamilyTxCount] = useState(0);
  // NEW: State cho lịch sử ngân sách
  const [budgetHistoryModal, setBudgetHistoryModal] = useState({ show: false, categoryId: null, categoryName: '' });
  const [budgetHistory, setBudgetHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  // NEW: State cho reset budget
  const [resetBudgetModal, setResetBudgetModal] = useState({ show: false, budget: null });
  const [resetBudgetLoading, setResetBudgetLoading] = useState(false);

  const API_BASE = 'http://localhost:5000';
  const token = localStorage.getItem('token');
  const selectedFamilyId = localStorage.getItem('selectedFamilyId');

  // Lấy thông tin người dùng hiện tại từ token
  const getCurrentUser = useCallback(() => {
    if (!token) return null;
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return {
        id: payload.id || payload._id || payload.userId || '',
        name: payload.name || '',
        email: payload.email || ''
      };
    } catch (e) {
      return null;
    }
  }, [token]);

  // Lấy danh sách ngân sách thực tế từ API
  const fetchBudgets = useCallback(async () => {
    if (!token || !selectedFamilyId) return;
    setLoadingBudgets(true);
    try {
      const res = await fetch(`${API_BASE}/api/family/${selectedFamilyId}/budget`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Không thể tải ngân sách');
      let data = await res.json();
      // Đảm bảo luôn là mảng, nếu không thì set []
      if (!Array.isArray(data)) data = [];
      setBudgetList(data);
    } catch (err) {
      setBudgetList([]);
    } finally {
      setLoadingBudgets(false);
    }
  }, [token, selectedFamilyId, API_BASE]);

  // Thêm hàm để lấy số dư gia đình
  const fetchFamilyBalance = useCallback(async () => {
    if (!token || !selectedFamilyId) return;
    
    setLoadingBalance(true);
    try {
      // Thêm timestamp để tránh cache
      const timestamp = new Date().getTime();
      const res = await fetch(`${API_BASE}/api/family/${selectedFamilyId}/balance?_t=${timestamp}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!res.ok) {
        throw new Error('Không thể tải số dư gia đình');
      }
      
      const data = await res.json();
      console.log('Family balance data:', data); // Để debug
      setFamilyBalance(data);
    } catch (err) {
      console.error("Error fetching family balance:", err);
    } finally {
      setLoadingBalance(false);
    }
  }, [token, selectedFamilyId, API_BASE]);

  // Thêm hàm fetchBudgetProgress
  const fetchBudgetProgress = useCallback(async () => {
    if (!token || !selectedFamilyId) return;
    setLoadingProgress(true);
    try {
      const res = await fetch(`${API_BASE}/api/family/${selectedFamilyId}/budget-progress`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setBudgetProgress(data);
    } catch (err) {
      setBudgetProgress({});
    } finally {
      setLoadingProgress(false);
    }
  }, [token, selectedFamilyId, API_BASE]);

  // Thêm hàm fetchTotalFamilyTxCount
  const fetchTotalFamilyTxCount = useCallback(async () => {
    if (!token || !selectedFamilyId) return;
    try {
      const res = await fetch(`${API_BASE}/api/family/${selectedFamilyId}/transactions?limit=1&excludeActivities=true`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) return;
      const data = await res.json();
      setTotalFamilyTxCount(data.pagination?.totalItems || 0);
    } catch (err) {
      setTotalFamilyTxCount(0);
    }
  }, [token, selectedFamilyId, API_BASE]);

  // Lấy thông tin gia đình từ API thật
  useEffect(() => {
    const loadData = async () => {
      if (!token) {
        navigate('/login');
        return;
      }

      if (!selectedFamilyId) {
        navigate('/family-selector');
        return;
      }

      try {
        setLoading(true);
        
        // Lấy thông tin người dùng hiện tại
        setCurrentUser(getCurrentUser());
        
        // Lấy thông tin gia đình cụ thể
        const familyRes = await fetch(`${API_BASE}/api/family/${selectedFamilyId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (familyRes.status === 401) {
          localStorage.removeItem('token');
          navigate('/login');
          return;
        }

        if (!familyRes.ok) {
          throw new Error('Không thể tải thông tin gia đình');
        }

        const family = await familyRes.json();
        setFamilyData(family);

        // Load ngân sách thực tế
        await fetchBudgets();
        
        // Gọi các API mới (bao gồm fetchTotalFamilyTxCount)
        await Promise.all([
          fetchFamilyBalance(),
          fetchBudgetProgress(),
          fetchTotalFamilyTxCount()
        ]);
        
      } catch (err) {
        console.error("Error fetching family data:", err);
        if (err.message.includes('401') || err.message.includes('invalid')) {
          localStorage.removeItem('token');
          navigate('/login');
          return;
        }
        setError("Không thể tải dữ liệu gia đình");
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, [token, navigate, API_BASE, selectedFamilyId, getCurrentUser, fetchFamilyBalance, fetchBudgets, fetchBudgetProgress, fetchTotalFamilyTxCount]);
  
  // Reload budget progress khi budgetList thay đổi (sau khi thêm giao dịch)
  useEffect(() => {
    if (budgetList.length > 0 && selectedFamilyId && token) {
      fetchBudgetProgress();
    }
  }, [budgetList.length, selectedFamilyId, token, fetchBudgetProgress]);

  // Lấy danh mục chi tiêu (cho form thêm ngân sách)
  const fetchCategories = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/categories`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setCategories(data.filter(c => c.type === 'expense'));
    } catch (err) {
      setCategories([]);
    }
  }, [token, API_BASE]);

  // Khi mở modal ngân sách thì load ngân sách và danh mục
  useEffect(() => {
    if (showBudgetModal) {
      fetchBudgets();
      fetchCategories();
    }
  }, [showBudgetModal, fetchBudgets, fetchCategories]);

  // Thêm ngân sách mới
  const handleAddBudget = async (e) => {
    e && e.preventDefault();
    setAddBudgetError('');
    if (!addBudgetForm.category || !addBudgetForm.amount || !addBudgetForm.date) {
      setAddBudgetError('Vui lòng nhập đủ thông tin');
      return;
    }
    setAddBudgetLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/family/${selectedFamilyId}/budget`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(addBudgetForm)
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Không thể thêm ngân sách');
      }
      setShowAddBudget(false);
      setAddBudgetForm({ category: '', amount: '', date: '', note: '' });
      // Reload ngân sách trước, sau đó reload progress để đảm bảo tính toán đúng
      await fetchBudgets();
      // Thêm timeout nhỏ để đảm bảo budgets đã được set state trước khi fetch progress
      setTimeout(async () => {
        await fetchBudgetProgress();
      }, 100);
    } catch (err) {
      setAddBudgetError(err.message || 'Lỗi khi thêm ngân sách');
    } finally {
      setAddBudgetLoading(false);
    }
  };

  // Mở modal sửa ngân sách
  const openEditBudget = (budget) => {
    setEditBudgetForm({
      amount: budget.amount || '',
      date: budget.date ? new Date(budget.date).toISOString().slice(0, 10) : ''
    });
    setEditBudgetModal({ show: true, budget });
    setEditBudgetError('');
  };

  // Sửa ngân sách
  const handleEditBudget = async (e) => {
    e && e.preventDefault();
    setEditBudgetError('');
    if (!editBudgetForm.amount || !editBudgetForm.date) {
      setEditBudgetError('Vui lòng nhập đủ thông tin');
      return;
    }
    setEditBudgetLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/family/${selectedFamilyId}/budget/${editBudgetModal.budget._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(editBudgetForm)
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Không thể sửa ngân sách');
      }
      setEditBudgetModal({ show: false, budget: null });
      // Reload budgets, sau đó force reload progress để tính lại % với số tiền mới
      await fetchBudgets();
      // Clear progress cũ trước khi fetch mới để trigger re-render
      setBudgetProgress({});
      setTimeout(async () => {
        await fetchBudgetProgress();
      }, 100);
    } catch (err) {
      setEditBudgetError(err.message || 'Lỗi khi sửa ngân sách');
    } finally {
      setEditBudgetLoading(false);
    }
  };

  // Mở modal xóa ngân sách
  const openDeleteBudget = (budget) => {
    setDeleteBudgetModal({ show: true, budget });
  };

  // Xóa ngân sách
  const handleDeleteBudget = async () => {
    setDeleteBudgetLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/family/${selectedFamilyId}/budget/${deleteBudgetModal.budget._id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Không thể xóa ngân sách');
      }
      setDeleteBudgetModal({ show: false, budget: null });
      // Reload budgets và progress
      await fetchBudgets();
      setBudgetProgress({});
      setTimeout(async () => {
        await fetchBudgetProgress();
      }, 100);
    } catch (err) {
      alert(err.message || 'Lỗi khi xóa ngân sách');
    } finally {
      setDeleteBudgetLoading(false);
    }
  };

  // Format currency helper
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };
  
  // Calculate budget percentage
  const calculatePercentage = (spent, allocated) => {
    // Trả về % với 1 chữ số thập phân, tối đa 100%
    return Math.min(Number(((spent / allocated) * 100).toFixed(1)), 100);
  };

  // Kiểm tra user có phải owner không - PHẢI ĐỊNH NGHĨA TRƯỚC CÁC RETURN SỚM
  const isOwner = useCallback(() => {
    if (!familyData || !currentUser) return false;
    const ownerId = familyData.owner?._id || familyData.owner;
    return String(ownerId) === String(currentUser.id);
  }, [familyData, currentUser]);

  // Helper: sort transactions newest-first by createdAt OR date
  const sortTransactions = (arr = []) => {
    return (Array.isArray(arr) ? arr.slice() : []).sort((a, b) => {
      const aTs = Date.parse(a?.createdAt || a?.date || 0) || 0;
      const bTs = Date.parse(b?.createdAt || b?.date || 0) || 0;
      return bTs - aTs;
    });
  };

  // Lấy giao dịch liên quan tới 1 ngân sách (category + tháng của budget.date)
  const fetchBudgetTransactions = useCallback(async (budget) => {
    if (!token || !selectedFamilyId || !budget) return [];
    setBudgetDetailLoading(true);
    try {
      // nếu backend đã trả kèm transactions trong budget object, dùng luôn
      if (Array.isArray(budget.transactions)) {
        return sortTransactions(budget.transactions);
      }

      const categoryId = budget.category?._id || budget.category;
      const d = budget.date ? new Date(budget.date) : new Date();
      const start = new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();

      const url = new URL(`${API_BASE}/api/family/${selectedFamilyId}/transactions`);
      url.searchParams.set('category', categoryId);
      url.searchParams.set('startDate', start);
      url.searchParams.set('endDate', end);
      url.searchParams.set('excludeActivities', 'true'); // loại trừ transfer

      const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Không thể tải giao dịch ngân sách');
      const data = await res.json();
      return sortTransactions(data.transactions || []);
    } catch (err) {
      console.error('Error fetching budget transactions:', err);
      return [];
    } finally {
      setBudgetDetailLoading(false);
    }
  }, [token, selectedFamilyId, API_BASE]);

  // Mở modal chi tiết ngân sách
  const openBudgetDetail = async (budget) => {
    if (!budget) return;
    setBudgetDetailModal({ show: true, budget, transactions: [] });
    // fetch transactions (will return immediately if budget already contains .transactions)
    const txs = await fetchBudgetTransactions(budget);
    setBudgetDetailModal({ show: true, budget, transactions: sortTransactions(txs) });
  };

  const closeBudgetDetail = () => {
    setBudgetDetailModal({ show: false, budget: null, transactions: [] });
  };

  // Mở modal xem tất cả giao dịch gia đình
  const openAllFamilyTransactions = async () => {
    setShowAllFamilyTxModal(true);
    await fetchAllFamilyTransactions();
  };

  const closeAllFamilyTransactions = () => {
    setShowAllFamilyTxModal(false);
    setFamilyTransactionsAll([]);
    setFamilyTxsError(null);
  };

  // Fetch all family transactions (limit optional)
  const fetchAllFamilyTransactions = useCallback(async (opts = {}) => {
    if (!token || !selectedFamilyId) return;
    setLoadingFamilyTxAll(true);
    setFamilyTxsError(null);
    try {
      const limit = opts.limit || 200;
      const res = await fetch(`${API_BASE}/api/family/${selectedFamilyId}/transactions?limit=${limit}&sort=date&order=desc&excludeActivities=true`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Không thể tải giao dịch gia đình');
      }
      const data = await res.json();
      const list = Array.isArray(data.transactions) ? data.transactions : (Array.isArray(data) ? data : []);
      setFamilyTransactionsAll(sortTransactions(list));
    } catch (err) {
      setFamilyTxsError(err.message || 'Lỗi khi tải giao dịch');
      setFamilyTransactionsAll([]);
    } finally {
      setLoadingFamilyTxAll(false);
    }
  }, [token, selectedFamilyId, API_BASE]);

  // Tự động fetch tất cả giao dịch khi vào trang chủ (không cần bấm "Xem tất cả")
  useEffect(() => {
    if (token && selectedFamilyId) {
      fetchAllFamilyTransactions();
    }
  }, [token, selectedFamilyId, fetchAllFamilyTransactions]);

  // Lấy thông tin owner
  const getOwnerInfo = () => {
    if (!familyData || !familyData.owner) return null;
    return familyData.owner;
  };

  // Kiểm tra xem một member có phải là owner không
  const isMemberOwner = (member) => {
    const owner = getOwnerInfo();
    if (!owner) return false;
    
    const ownerId = owner._id || owner.id || owner;
    const memberUserId = member.user && (member.user._id || member.user);
    return String(ownerId) === String(memberUserId);
  };

  // Kiểm tra xem một member có phải là người dùng hiện tại không
  const isCurrentUser = (member) => {
    if (!currentUser || !member) return false;
    const memberUserId = member.user && (member.user._id || member.user);
    return String(memberUserId) === String(currentUser.id);
  };

  // NEW: Hàm kiểm tra ngân sách đã hết hạn - KIỂM TRA THEO NGÀY CỤ THỂ
  const isBudgetExpired = useCallback((budgetDate) => {
    if (!budgetDate) return false;
    const bDate = new Date(budgetDate);
    // Set giờ về 00:00:00 để so sánh chỉ theo ngày
    bDate.setHours(0, 0, 0, 0);
    
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    
    // Kiểm tra: nếu hôm nay > ngày trong budget.date → đã hết hạn
    return now > bDate;
  }, []);

  // NEW: Fetch lịch sử ngân sách
  const fetchBudgetHistory = useCallback(async (categoryId, categoryName) => {
    if (!token || !selectedFamilyId) return;
    setLoadingHistory(true);
    try {
      const url = `${API_BASE}/api/family/${selectedFamilyId}/budget-history?categoryId=${categoryId}&limit=20`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Không thể tải lịch sử ngân sách');
      const data = await res.json();
      setBudgetHistory(Array.isArray(data) ? data : []);
      setBudgetHistoryModal({ show: true, categoryId, categoryName });
    } catch (err) {
      console.error('Error fetching budget history:', err);
      setBudgetHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }, [token, selectedFamilyId, API_BASE]);

  // NEW: Reset ngân sách
  const handleResetBudget = async () => {
    if (!resetBudgetModal.budget) return;
    setResetBudgetLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/family/${selectedFamilyId}/budget/${resetBudgetModal.budget._id}/reset`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Không thể reset ngân sách');
      }
      const result = await res.json();
      
      // Thông báo thành công với thông tin kỳ mới
      const startStr = new Date(result.nextPeriod.startDate).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const endStr = new Date(result.nextPeriod.endDate).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
      
      alert(
        `✅ ${result.message}\n\n` +
        `📅 Kỳ mới: ${startStr} - ${endStr}\n` +
        `💰 Ngân sách: ${formatCurrency(result.budget.amount)}\n` +
        `📊 Tiến độ: 0% (mới bắt đầu)\n\n` +
        `Ngân sách đã được giữ lại và bắt đầu kỳ mới!`
      );
      
      setResetBudgetModal({ show: false, budget: null });
      
      // Reload budgets và progress
      await fetchBudgets();
      setBudgetProgress({});
      setTimeout(async () => {
        await fetchBudgetProgress();
      }, 100);
    } catch (err) {
      alert('❌ ' + (err.message || 'Lỗi khi reset ngân sách'));
    } finally {
      setResetBudgetLoading(false);
    }
  };

  return (
    <div className="family-home">
      <FamilySidebar />
      <main className="fh-main">
        {loading ? (
          <div className="fh-loading">
            <div className="fh-loading-spinner"></div>
            <p>Đang tải dữ liệu gia đình...</p>
          </div>
        ) : error ? (
          <div className="fh-error">
            <i className="fas fa-exclamation-triangle"></i>
            <p>{error}</p>
            <button onClick={() => window.location.reload()}>Thử lại</button>
          </div>
        ) : (
          <>
            {/* Header Section */}
            <header className="fh-header">
              <div className="fh-title-area">
                <h1>{familyData?.name || "Gia đình của tôi"}</h1>
                <p>Quản lý tài chính cho cả gia đình</p>
              </div>
              
              <div className="fh-actions">
                <button className="fh-btn secondary" onClick={() => navigate('/family/expenses')}>
                  <i className="fas fa-receipt"></i> Thêm chi tiêu
                </button>
                <button className="fh-btn primary" onClick={() => setShowBudgetModal(true)}>
                  <i className="fas fa-wallet"></i> Quản lý ngân sách
                </button>
              </div>
            </header>
            
            {/* Financial Overview */}
            <section className="fh-financial-overview">
              <div className="fh-card balance">
                <div className="fh-card-header">
                  <i className="fas fa-wallet"></i>
                  <span>Số dư gia đình</span>
                </div>
                <div className="fh-card-amount">
                  {loadingBalance ? (
                    <div className="fh-loading-spinner small"></div>
                  ) : (
                    formatCurrency(familyBalance?.familyBalance || 0)
                  )}
                </div>
              </div>
              
              <div className="fh-card income">
                <div className="fh-card-header">
                  <i className="fas fa-arrow-down"></i>
                  <span>Thu nhập gia đình</span>
                </div>
                <div className="fh-card-amount">
                  {loadingBalance ? (
                    <div className="fh-loading-spinner small"></div>
                  ) : (
                    formatCurrency(familyBalance?.familyIncome || 0)
                  )}
                </div>
              </div>
              
              <div className="fh-card expense">
                <div className="fh-card-header">
                  <i className="fas fa-arrow-up"></i>
                  <span>Chi tiêu gia đình</span>
                </div>
                <div className="fh-card-amount">
                  {loadingBalance ? (
                    <div className="fh-loading-spinner small"></div>
                  ) : (
                    formatCurrency(familyBalance?.familyExpense || 0)
                  )}
                </div>
              </div>
              
              <div className="fh-card savings">
                <div className="fh-card-header">
                  <i className="fas fa-piggy-bank"></i>
                  <span>Tổng giao dịch gia đình</span>
                </div>
                <div className="fh-card-amount">
                  {loadingFamilyTxAll ? (
                    <div className="fh-loading-spinner small"></div>
                  ) : (
                    // Hiển thị tổng số giao dịch thực tế (không bị giới hạn bởi limit=5 của recent)
                    totalFamilyTxCount
                  )}
                </div>
              </div>
            </section>
            
            {/* Main Grid Layout */}
            <div className="fh-grid">
              {/* Budget Overview */}
              <section className="fh-budget-overview">
                <div className="fh-section-header">
                  <h2><i className="fas fa-chart-pie"></i> Ngân sách của gia đình</h2>
                  <button className="fh-btn-link" onClick={() => setShowBudgetModal(true)}>
                    Xem tất cả <i className="fas fa-chevron-right"></i>
                  </button>
                </div>
                
                <div className="fh-budget-list">
                  {(() => {
                    // THAY ĐỔI: Không lọc theo tháng nữa, hiển thị tất cả ngân sách
                    const currentMonth = new Date().getMonth();
                    const currentYear = new Date().getFullYear();
                    
                    if (budgetList.length === 0) {
                      return (
                        <div className="fh-empty-state">
                          <i className="fas fa-calendar-alt"></i>
                          <p>Chưa có ngân sách nào</p>
                        </div>
                      );
                    }
                    
                    // Sort theo date mới nhất
                    const sortedBudgets = [...budgetList].sort((a, b) => 
                      new Date(b.date) - new Date(a.date)
                    );
                    
                    return sortedBudgets.map(budget => {
                      const categoryId = budget.category?._id || budget.category;
                      const categoryIdStr = String(categoryId);
                      const spent = budgetProgress[categoryIdStr] || 0;
                      const percentage = calculatePercentage(spent, budget.amount);
                      const status = percentage >= 90 ? 'danger' : percentage >= 70 ? 'warning' : 'good';
                      const isExpired = isBudgetExpired(budget.date);
                      
                      // Kiểm tra xem ngân sách này có phải của tháng hiện tại không
                      const budgetDate = new Date(budget.date);
                      const isCurrentMonth = budgetDate.getMonth() === currentMonth && 
                                           budgetDate.getFullYear() === currentYear;
                      
                      return (
                        <div 
                          key={budget._id || budget.id} 
                          className={`fh-budget-item ${isExpired ? 'expired' : ''} ${isCurrentMonth ? 'current-month' : 'future-month'}`}
                        >
                          <div className="fh-budget-icon">
                            <i className={budget.category?.icon || 'fas fa-tag'}></i>
                          </div>
                          
                          <div className="fh-budget-content">
                            <div className="fh-budget-title-row">
                              <div className="fh-budget-title">
                                {budget.category?.name || 'Danh mục'}
                                {/* Hiển thị tháng/năm của ngân sách */}
                                <span className="fh-budget-period">
                                  {budgetDate.toLocaleDateString('vi-VN', { month: 'short', year: 'numeric' })}
                                </span>
                              </div>
                              {isExpired && (
                                <span className="fh-budget-expired-badge">
                                  <i className="fas fa-exclamation-circle"></i> Đã hết hạn
                                </span>
                              )}
                              {!isExpired && !isCurrentMonth && (
                                <span className="fh-budget-future-badge">
                                  <i className="fas fa-clock"></i> Kỳ tới
                                </span>
                              )}
                            </div>
                            
                            <div className="fh-budget-bar-container">
                              <div 
                                className={`fh-budget-bar ${status}`} 
                                style={{ width: `${percentage}%` }}
                              ></div>
                            </div>
                            
                            <div className="fh-budget-details">
                              <div className="fh-budget-spent">
                                {formatCurrency(spent)} / {formatCurrency(budget.amount)}
                              </div>
                              <div className={`fh-budget-percentage ${status}`}>{percentage}%</div>
                            </div>
                            
                            <div className="fh-budget-actions">
                              <button 
                                className="fh-budget-action-btn"
                                onClick={(e) => { e.stopPropagation(); openBudgetDetail(budget); }}
                                title="Xem chi tiết"
                              >
                                <i className="fas fa-eye">xem chi tiết</i>
                              </button>
                              <button 
                                className="fh-budget-action-btn"
                                onClick={(e) => { e.stopPropagation(); fetchBudgetHistory(categoryIdStr, budget.category?.name); }}
                                title="Xem lịch sử"
                              >
                                <i className="fas fa-history">xem lịch sử</i>
                              </button>
                              {isExpired && isOwner() && (
                                <button 
                                  className="fh-budget-action-btn reset"
                                  onClick={(e) => { e.stopPropagation(); setResetBudgetModal({ show: true, budget }); }}
                                  title="Reset ngân sách"
                                >
                                  <i className="fas fa-redo"></i> Reset
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </section>
              
              {/* Recent Transactions */}
              <section className="fh-recent-transactions">
                <div className="fh-section-header">
                  <h2><i className="fas fa-exchange-alt"></i> Giao dịch gia đình gần đây</h2>
                  <button className="fh-btn-link" onClick={openAllFamilyTransactions}>
                    Xem tất cả <i className="fas fa-chevron-right"></i>
                  </button>
                </div>
                
                {loadingFamilyTxAll && showAllFamilyTxModal ? (
                  <div className="fh-loading-inline">
                    <div className="fh-loading-spinner"></div>
                    <p>Đang tải giao dịch gia đình...</p>
                  </div>
                ) : familyTransactionsAll.length === 0 ? (
                  <div className="fh-empty-state">
                    <i className="fas fa-receipt"></i>
                    <p>Chưa có giao dịch gia đình nào</p>
                  </div>
                ) : (
                  <div className="fh-transactions-list">
                    {familyTransactionsAll.slice(0, 5).map(tx => {
                      const categoryInfo = tx.category && typeof tx.category === 'object' 
                        ? { name: tx.category.name, icon: tx.category.icon }
                        : { name: 'Không có', icon: 'fa-receipt' };
                      const creatorName = tx.creatorName || (tx.createdBy && tx.createdBy.name) || 'Thành viên';
                      return (
                        <div key={tx._id} className="fh-transaction-item">
                          <div className="fh-transaction-date">
                            {new Date(tx.date || tx.createdAt).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}
                          </div>
                          <div className="fh-transaction-content">
                            <div className="fh-transaction-title">{tx.description || 'Giao dịch gia đình'}</div>
                            <div className="fh-transaction-meta">
                              <span className="fh-transaction-category">{categoryInfo.name}</span>
                              <span className="fh-transaction-separator">•</span>
                              <span className="fh-transaction-member">{creatorName}</span>
                              <span className="fh-transaction-separator">•</span>
                              <span className={`fh-transaction-type ${tx.type}`}>
                                {tx.type === 'income' ? 'Thu nhập' : 'Chi tiêu'}
                              </span>
                            </div>
                          </div>
                          <div className={`fh-transaction-amount ${tx.type === 'expense' ? 'expense' : 'income'}`}>
                            {tx.type === 'expense' ? '-' : '+'}{formatCurrency(tx.amount)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
              
              {/* Family Members */}
              <section className="fh-family-members">
                <div className="fh-section-header">
                  <h2><i className="fas fa-users"></i> Thành viên gia đình</h2>
                  <button className="fh-btn-link" onClick={() => navigate('/family/members')}>
                    Quản lý <i className="fas fa-chevron-right"></i>
                  </button>
                </div>
                
                <div className="fh-members-list">
                  {familyData?.members.map(member => {
                    const memberUserId = member.user && (member.user._id || member.user);
                    const isOwner = isMemberOwner(member);
                    const isUserCurrent = isCurrentUser(member);
                    
                    // Tạo biến tên hiển thị - ưu tiên hiển thị tên thật
                    const displayName = member.name || 
                                       (member.user && member.user.name) || 
                                       'Thành viên';
                    
                    return (
                      <div 
                        key={memberUserId || member.email} 
                        className={`fh-member-item ${isUserCurrent ? 'current-user' : ''}`}
                      >
                        <div className="fh-member-avatar">
                          {displayName.charAt(0).toUpperCase()}
                        </div>
                        <div className="fh-member-info">
                          <div className="fh-member-name">
                            {displayName}
                            {isOwner && (
                              <span className="fh-owner-badge">
                                <i className="fas fa-crown"></i> Chủ gia đình
                              </span>
                            )}
                            {isUserCurrent && !isOwner && (
                              <span className="fh-current-user-badge">
                                <i className="fas fa-user"></i> Bạn
                              </span>
                            )}
                          </div>
                          <div className="fh-member-role">
                            {member.email}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  
                  <button className="fh-add-member" onClick={() => navigate('/family/members')}>
                    <i className="fas fa-plus"></i>
                    <div>Thêm thành viên</div>
                  </button>
                </div>
              </section>
              
              {/* Quick Actions */}
              <section className="fh-quick-actions">
                <div className="fh-section-header">
                  <h2><i className="fas fa-bolt"></i> Truy cập nhanh</h2>
                </div>
                
                <div className="fh-actions-grid">
                  <button className="fh-action-card" onClick={() => navigate('/family/expenses')}>
                    <div className="fh-action-icon">
                      <i className="fas fa-receipt"></i>
                    </div>
                    <div className="fh-action-title">Thêm chi tiêu</div>
                  </button>
                  
                  <button className="fh-action-card" onClick={() => navigate('/family/budget')}>
                    <div className="fh-action-icon">
                      <i className="fas fa-wallet"></i>
                    </div>
                    <div className="fh-action-title">Tạo ngân sách</div>
                  </button>
                  
                  <button className="fh-action-card" onClick={() => navigate('/family/savings')}>
                    <div className="fh-action-icon">
                      <i className="fas fa-piggy-bank"></i>
                    </div>
                    <div className="fh-action-title">Mục tiêu tiết kiệm</div>
                  </button>
                  
                  <button className="fh-action-card" onClick={() => navigate('/family/bills')}>
                    <div className="fh-action-icon">
                      <i className="fas fa-file-invoice-dollar"></i>
                    </div>
                    <div className="fh-action-title">Hóa đơn định kỳ</div>
                  </button>
                </div>
              </section>
            </div>
          </>
        )}
      </main>
      {/* MODAL: Bảng ngân sách */}
      {showBudgetModal && (
        <div className="fh-modal-overlay" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div className="fh-modal" style={{
            background: '#fff', borderRadius: 12, padding: 32, minWidth: 340, maxWidth: 680, width: '100%', maxHeight: '90vh', overflowY: 'auto', position: 'relative'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h2 style={{ margin: 0, fontSize: 22, color: '#2a5298' }}><i className="fas fa-wallet"></i> Bảng ngân sách</h2>
              <button onClick={() => setShowBudgetModal(false)} style={{ background: 'none', border: 'none', fontSize: 26, color: '#888', cursor: 'pointer' }}>&times;</button>
            </div>
            {/* Chỉ owner mới thấy nút thêm ngân sách */}
            {isOwner() && (
              <div style={{ marginBottom: 18 }}>
                <button className="fh-btn primary" onClick={() => setShowAddBudget(true)}>
                  <i className="fas fa-plus"></i> Thêm ngân sách
                </button>
              </div>
            )}
            {loadingBudgets ? (
              <div style={{ textAlign: 'center', padding: 24 }}>Đang tải...</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 18 }}>
                <thead>
                  <tr style={{ background: '#f1f5f9' }}>
                    <th style={{ padding: 8, textAlign: 'left' }}>Danh mục</th>
                    <th style={{ padding: 8, textAlign: 'right' }}>Số tiền</th>
                    <th style={{ padding: 8, textAlign: 'center' }}>Ngày</th>
                    <th style={{ padding: 8, textAlign: 'left' }}>Ghi chú</th>
                    {isOwner() && <th style={{ padding: 8, textAlign: 'center' }}>Thao tác</th>}
                  </tr>
                </thead>
                <tbody>
                  {budgetList.length === 0 ? (
                    <tr><td colSpan={isOwner() ? 5 : 4} style={{ textAlign: 'center', color: '#888', padding: 18 }}>Chưa có ngân sách</td></tr>
                  ) : budgetList.map(b => (
                    <tr key={b._id || b.id}>
                      <td style={{ padding: 8 }}>
                        {b.category && typeof b.category === 'object'
                          ? (<><i className={b.category.icon || 'fas fa-tag'} style={{ marginRight: 6 }}></i> {b.category.name}</>)
                          : '—'}
                      </td>
                      <td style={{ padding: 8, textAlign: 'right', fontWeight: 600 }}>{formatCurrency(b.amount)}</td>
                      <td style={{ padding: 8, textAlign: 'center' }}>{b.date ? new Date(b.date).toLocaleDateString('vi-VN') : ''}</td>
                      <td style={{ padding: 8 }}>{b.note || ''}</td>
                      {/* Chỉ owner mới thấy nút Sửa/Xóa */}
                      {isOwner() && (
                        <td style={{ padding: 8, textAlign: 'center' }}>
                          <button onClick={() => openEditBudget(b)} style={{ padding: '4px 10px', marginRight: 6, background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
                            <i className="fas fa-edit"></i> Sửa
                          </button>
                          <button onClick={() => openDeleteBudget(b)} style={{ padding: '4px 10px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
                            <i className="fas fa-trash"></i> Xóa
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {/* Form thêm ngân sách */}
            {showAddBudget && (
              <form onSubmit={handleAddBudget} style={{ background: '#f8fafc', borderRadius: 8, padding: 18, marginBottom: 12 }}>
                <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
                  <select
                    value={addBudgetForm.category}
                    onChange={e => setAddBudgetForm(f => ({ ...f, category: e.target.value }))}
                    required
                    style={{ flex: 1, padding: 8, borderRadius: 6, border: '1px solid #d1d5db' }}
                  >
                    <option value="">-- Chọn danh mục --</option>
                    {categories.map(c => (
                      <option key={c._id} value={c._id}>{c.icon ? `${c.icon} ` : ''}{c.name}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    placeholder="Số tiền"
                    value={addBudgetForm.amount}
                    onChange={e => setAddBudgetForm(f => ({ ...f, amount: e.target.value }))}
                    required
                    min={0}
                    style={{ width: 120, padding: 8, borderRadius: 6, border: '1px solid #d1d5db' }}
                  />
                  <input
                    type="date"
                    value={addBudgetForm.date}
                    onChange={e => setAddBudgetForm(f => ({ ...f, date: e.target.value }))}
                    required
                    style={{ width: 140, padding: 8, borderRadius: 6, border: '1px solid #d1d5db' }}
                  />
                </div>
                <input
                  type="text"
                  placeholder="Ghi chú (không bắt buộc)"
                  value={addBudgetForm.note}
                  onChange={e => setAddBudgetForm(f => ({ ...f, note: e.target.value }))}
                  style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #d1d5db', marginBottom: 8 }}
                />
                {addBudgetError && <div style={{ color: '#b91c1c', marginBottom: 8 }}>{addBudgetError}</div>}
                <div style={{ display: 'flex', gap: 10 }}>
                  <button type="button" className="fh-btn secondary" onClick={() => { setShowAddBudget(false); setAddBudgetError(''); }}>Hủy</button>
                  <button type="submit" className="fh-btn primary" disabled={addBudgetLoading}>
                    {addBudgetLoading ? 'Đang lưu...' : 'Lưu ngân sách'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
      
      {/* MODAL: Chi tiết ngân sách + giao dịch */}
      {budgetDetailModal.show && (
        <div className="fh-modal-overlay" style={{ position: 'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.6)', zIndex:1100, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div className="fh-modal" style={{ background:'#fff', borderRadius:12, padding:24, minWidth:360, maxWidth:800, width:'100%', maxHeight:'85vh', overflowY:'auto', position:'relative' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
              <h3 style={{ margin:0 }}>{budgetDetailModal.budget?.category?.name || 'Chi tiết ngân sách'}</h3>
              <button onClick={closeBudgetDetail} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer' }}>&times;</button>
            </div>
            
            <div style={{ marginBottom:12, display:'flex', justifyContent:'space-between', alignItems:'center', gap:12 }}>
              <div>
                <div style={{ color:'#6b7280', fontSize:13 }}>Ngân sách</div>
                <div style={{ fontWeight:700, fontSize:18 }}>{formatCurrency(budgetDetailModal.budget?.amount || 0)}</div>
                <div style={{ color:'#6b7280', marginTop:6 }}>{budgetDetailModal.budget?.date ? new Date(budgetDetailModal.budget.date).toLocaleDateString('vi-VN') : ''}</div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ color:'#6b7280', fontSize:13 }}>Đã chi</div>
                <div style={{ fontWeight:700, fontSize:18 }}>{formatCurrency(budgetDetailModal.transactions.reduce((s,t)=>s+(t.amount||0),0) || 0)}</div>
                <div style={{ color:'#6b7280', marginTop:6 }}>{calculatePercentage(budgetDetailModal.transactions.reduce((s,t)=>s+(t.amount||0),0) || 0, budgetDetailModal.budget?.amount || 1)}%</div>
              </div>
            </div>
            
            <div style={{ marginBottom:12 }}>
              <h4 style={{ margin:'8px 0' }}>Giao dịch liên quan</h4>
              {budgetDetailLoading ? (
                <div style={{ padding:18, textAlign:'center' }}><div className="fh-loading-spinner small"></div> Đang tải giao dịch...</div>
              ) : budgetDetailModal.transactions.length === 0 ? (
                <div style={{ padding:18, color:'#6b7280' }}>Chưa có giao dịch liên quan cho ngân sách này.</div>
              ) : (
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead>
                    <tr style={{ background:'#f1f5f9' }}>
                      <th style={{ textAlign:'left', padding:8 }}>Ngày</th>
                      <th style={{ textAlign:'left', padding:8 }}>Mô tả</th>
                      <th style={{ textAlign:'right', padding:8 }}>Số tiền</th>
                      <th style={{ textAlign:'left', padding:8 }}>Người tạo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {budgetDetailModal.transactions.map(tx => (
                      <tr key={tx._id}>
                        <td style={{ padding:8 }}>{new Date(tx.date || tx.createdAt).toLocaleDateString('vi-VN')}</td>
                        <td style={{ padding:8 }}>{tx.description || (tx.category && tx.category.name) || '—'}</td>
                        <td style={{ padding:8, textAlign:'right' }}>{tx.type === 'expense' ? '-' : '+'}{formatCurrency(tx.amount)}</td>
                        <td style={{ padding:8 }}>{tx.creatorName || (tx.createdBy && tx.createdBy.name) || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
              <button className="fh-btn secondary" onClick={closeBudgetDetail}>Đóng</button>
            </div>
          </div>
        </div>
      )}
      
      {/* MODAL: All Family Transactions */}
      {showAllFamilyTxModal && (
        <div className="fh-modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex:1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="fh-modal" style={{ background:'#fff', borderRadius: 12, padding: 20, minWidth: 360, maxWidth: 1000, width:'95%', maxHeight: '85vh', overflowY: 'auto', position: 'relative' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
              <h3 style={{ margin:0 }}>Tất cả giao dịch gia đình</h3>
              <button onClick={closeAllFamilyTransactions} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer' }}>&times;</button>
            </div>
            
            {loadingFamilyTxAll ? (
              <div style={{ padding:24, textAlign:'center' }}>
                <div className="fh-loading-spinner small"></div>
                <div style={{ marginTop:8, color: '#64748b' }}>Đang tải giao dịch...</div>
              </div>
            ) : familyTxsError ? (
              <div style={{ padding:24, textAlign:'center', color:'#b91c1c' }}>{familyTxsError}</div>
            ) : familyTransactionsAll.length === 0 ? (
              <div style={{ padding:24, textAlign:'center', color:'#64748b' }}>Chưa có giao dịch gia đình</div>
            ) : (
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead>
                    <tr style={{ background:'#f1f5f9' }}>
                      <th style={{ padding:8, textAlign:'left' }}>Ngày</th>
                      <th style={{ padding:8, textAlign:'left' }}>Mô tả</th>
                      <th style={{ padding:8, textAlign:'left' }}>Danh mục</th>
                      <th style={{ padding:8, textAlign:'right' }}>Số tiền</th>
                      <th style={{ padding:8, textAlign:'left' }}>Người tạo</th>
                      <th style={{ padding:8, textAlign:'left' }}>Phạm vi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {familyTransactionsAll.map(tx => (
                      <tr key={tx._id || tx.id} style={{ borderBottom:'1px solid #f3f4f6' }}>
                        <td style={{ padding:8 }}>{new Date(tx.date || tx.createdAt).toLocaleDateString('vi-VN')}</td>
                        <td style={{ padding:8 }}>{tx.description || tx.title || '—'}</td>
                        <td style={{ padding:8 }}>{tx.category && (tx.category.name || tx.category) || '—'}</td>
                        <td style={{ padding:8, textAlign:'right' }}>{tx.type === 'expense' ? '-' : '+'}{formatCurrency(tx.amount)}</td>
                        <td style={{ padding:8 }}>{tx.creatorName || (tx.createdBy && tx.createdBy.name) || '—'}</td>
                        <td style={{ padding:8 }}>{tx.transactionScope || tx.scope || 'family'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            
            <div style={{ display:'flex', justifyContent:'flex-end', marginTop:12 }}>
              <button className="fh-btn secondary" onClick={closeAllFamilyTransactions}>Đóng</button>
            </div>
          </div>
        </div>
      )}
      
      {/* MODAL: Sửa ngân sách */}
      {editBudgetModal.show && (
        <div className="fh-modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1001, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="fh-modal" style={{ background: '#fff', borderRadius: 12, padding: 32, minWidth: 340, maxWidth: 480, width: '100%', position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h2 style={{ margin: 0, fontSize: 20, color: '#2a5298' }}><i className="fas fa-edit"></i> Sửa ngân sách</h2>
              <button onClick={() => setEditBudgetModal({ show: false, budget: null })} style={{ background: 'none', border: 'none', fontSize: 24, color: '#888', cursor: 'pointer' }}>&times;</button>
            </div>
            <form onSubmit={handleEditBudget}>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, color: '#374151' }}>Danh mục (không thể sửa)</label>
                <div style={{ padding: 8, background: '#f3f4f6', borderRadius: 6, color: '#6b7280' }}>
                  {editBudgetModal.budget?.category?.icon && <i className={editBudgetModal.budget.category.icon} style={{ marginRight: 6 }}></i>}
                  {editBudgetModal.budget?.category?.name || '—'}
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, color: '#374151' }}>Số tiền</label>
                <input
                  type="number"
                  value={editBudgetForm.amount}
                  onChange={e => setEditBudgetForm(f => ({ ...f, amount: e.target.value }))}
                  required
                  min={0}
                  style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #d1d5db' }}
                />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, color: '#374151' }}>Ngày</label>
                <input
                  type="date"
                  value={editBudgetForm.date}
                  onChange={e => setEditBudgetForm(f => ({ ...f, date: e.target.value }))}
                  required
                  style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #d1d5db' }}
                />
              </div>
              {editBudgetError && <div style={{ color: '#b91c1c', marginBottom: 12 }}>{editBudgetError}</div>}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" className="fh-btn secondary" onClick={() => setEditBudgetModal({ show: false, budget: null })}>Hủy</button>
                <button type="submit" className="fh-btn primary" disabled={editBudgetLoading}>
                  {editBudgetLoading ? 'Đang lưu...' : 'Lưu thay đổi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      {/* MODAL: Xác nhận xóa ngân sách */}
      {deleteBudgetModal.show && (
        <div className="fh-modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1001, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="fh-modal" style={{ background: '#fff', borderRadius: 12, padding: 32, minWidth: 340, maxWidth: 420, width: '100%', position: 'relative', textAlign: 'center' }}>
            <i className="fas fa-exclamation-triangle" style={{ fontSize: 48, color: '#ef4444', marginBottom: 16 }}></i>
            <h2 style={{ margin: '0 0 12px 0', fontSize: 20, color: '#1f2937' }}>Xác nhận xóa ngân sách</h2>
            <p style={{ margin: '0 0 20px 0', color: '#6b7280' }}>
              Bạn có chắc chắn muốn xóa ngân sách cho danh mục <strong>{deleteBudgetModal.budget?.category?.name || '—'}</strong> không?
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button className="fh-btn secondary" onClick={() => setDeleteBudgetModal({ show: false, budget: null })}>Hủy</button>
              <button className="fh-btn danger" onClick={handleDeleteBudget} disabled={deleteBudgetLoading}>
                {deleteBudgetLoading ? 'Đang xóa...' : 'Xóa ngân sách'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* MODAL: Lịch sử ngân sách */}
      {budgetHistoryModal.show && (
        <div className="fh-modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="fh-modal" style={{ background: '#fff', borderRadius: 12, padding: 24, minWidth: 360, maxWidth: 900, width: '95%', maxHeight: '85vh', overflowY: 'auto', position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>
                <i className="fas fa-history"></i> Lịch sử ngân sách - {budgetHistoryModal.categoryName}
              </h3>
              <button onClick={() => setBudgetHistoryModal({ show: false, categoryId: null, categoryName: '' })} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer' }}>&times;</button>
            </div>
            
            {loadingHistory ? (
              <div style={{ padding: 24, textAlign: 'center' }}>
                <div className="fh-loading-spinner small"></div>
                <div style={{ marginTop: 8, color: '#64748b' }}>Đang tải lịch sử...</div>
              </div>
            ) : budgetHistory.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>
                <i className="fas fa-inbox" style={{ fontSize: 48, marginBottom: 12, opacity: 0.5 }}></i>
                <p>Chưa có lịch sử ngân sách</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9' }}>
                      <th style={{ padding: 10, textAlign: 'left' }}>Kỳ</th>
                      <th style={{ padding: 10, textAlign: 'right' }}>Ngân sách</th>
                      <th style={{ padding: 10, textAlign: 'right' }}>Đã chi</th>
                      <th style={{ padding: 10, textAlign: 'center' }}>%</th>
                      <th style={{ padding: 10, textAlign: 'left' }}>Ghi chú</th>
                      <th style={{ padding: 10, textAlign: 'center' }}>Reset lúc</th>
                    </tr>
                  </thead>
                  <tbody>
                    {budgetHistory.map((h, idx) => {
                      const percentage = calculatePercentage(h.spent || 0, h.amount || 1);
                      const status = percentage >= 90 ? 'danger' : percentage >= 70 ? 'warning' : 'good';
                      return (
                        <tr key={h._id || idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ padding: 10 }}>
                            {new Date(h.startDate).toLocaleDateString('vi-VN', { month: 'short', year: 'numeric' })}
                          </td>
                          <td style={{ padding: 10, textAlign: 'right', fontWeight: 600 }}>{formatCurrency(h.amount)}</td>
                          <td style={{ padding: 10, textAlign: 'right' }}>{formatCurrency(h.spent || 0)}</td>
                          <td style={{ padding: 10, textAlign: 'center' }}>
                            <span className={`fh-budget-percentage ${status}`} style={{ fontSize: '0.875rem', padding: '2px 8px', borderRadius: 12 }}>
                              {percentage}%
                            </span>
                          </td>
                          <td style={{ padding: 10 }}>{h.note || '—'}</td>
                          <td style={{ padding: 10, textAlign: 'center', fontSize: '0.813rem', color: '#64748b' }}>
                            {new Date(h.resetAt).toLocaleString('vi-VN')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="fh-btn secondary" onClick={() => setBudgetHistoryModal({ show: false, categoryId: null, categoryName: '' })}>Đóng</button>
            </div>
          </div>
        </div>
      )}
      
      {/* MODAL: Xác nhận reset ngân sách */}
      {resetBudgetModal.show && (
        <div className="fh-modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1101, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="fh-modal" style={{ background: '#fff', borderRadius: 12, padding: 32, minWidth: 340, maxWidth: 480, width: '100%', textAlign: 'center' }}>
            <i className="fas fa-sync-alt" style={{ fontSize: 48, color: '#3b82f6', marginBottom: 16 }}></i>
            <h2 style={{ margin: '0 0 12px 0', fontSize: 20, color: '#1f2937' }}>Reset ngân sách</h2>
            <p style={{ margin: '0 0 8px 0', color: '#6b7280' }}>
              Bạn có chắc chắn muốn reset ngân sách <strong>{resetBudgetModal.budget?.category?.name}</strong>?
            </p>
            <p style={{ margin: '0 0 20px 0', fontSize: '0.875rem', color: '#9ca3af' }}>
              Dữ liệu kỳ hiện tại sẽ được lưu vào lịch sử và ngân sách sẽ bắt đầu kỳ mới (tháng tiếp theo).
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button className="fh-btn secondary" onClick={() => setResetBudgetModal({ show: false, budget: null })}>Hủy</button>
              <button className="fh-btn primary" onClick={handleResetBudget} disabled={resetBudgetLoading}>
                {resetBudgetLoading ? 'Đang reset...' : 'Xác nhận reset'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
