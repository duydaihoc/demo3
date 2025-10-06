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
  const [transactionType, setTransactionType] = useState('equal_split'); // Kiểu giao dịch mặc định

  // Thêm state cho người dùng hiện tại
  const [currentUser, setCurrentUser] = useState(null);
  
  // Thêm state cho danh mục
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [loadingCategories, setLoadingCategories] = useState(false);
  
  // State cho thành viên và người trả dùm
  const [members, setMembers] = useState([]);
  const [selectedMembers, setSelectedMembers] = useState([]);
  // State cho chia phần trăm
  const [percentages, setPercentages] = useState([]); // [{ id?, email?, name?, percentage }]
  const [percentTotalError, setPercentTotalError] = useState('');

  // Add state for editing
  const [editingTx, setEditingTx] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editSelectedMembers, setEditSelectedMembers] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editLoading, setEditLoading] = useState(false);              // { added }
  const [editTransactionType, setEditTransactionType] = useState('equal_split'); // { added }
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
      setTxs(Array.isArray(data) ? data.map(normalizeTxForDisplay) : []);
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
      setTxs(Array.isArray(data) ? data.map(normalizeTxForDisplay) : (data ? [normalizeTxForDisplay(data)] : []));
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

  // Đồng bộ percentages khi kiểu là percentage_split hoặc khi selectedMembers thay đổi
  useEffect(() => {
    if (transactionType !== 'percentage_split') {
      setPercentages([]);
      setPercentTotalError('');
      return;
    }

    const creator = getCurrentUser();
    const partList = [
      // creator first
      { id: creator?.id, email: creator?.email, name: creator?.name || 'Bạn' },
      // other selected members
      ...selectedMembers.map(m => ({ id: m.id, email: m.email, name: m.name }))
    ];

    // If percentages already exist for same participants, keep them; otherwise initialize equal split
    const existingMap = new Map((percentages || []).map(p => [String(p.email || p.id || ''), p.percentage]));
    const totalParts = partList.length || 1;
    const base = Math.round((100 / totalParts) * 100) / 100; // rounded to 2 decimals

    const newPerc = partList.map((p, idx) => {
      const key = String(p.email || p.id || '');
      const prev = existingMap.has(key) ? existingMap.get(key) : null;
      return {
        id: p.id,
        email: p.email,
        name: p.name,
        percentage: prev !== null && typeof prev !== 'undefined' ? prev : base
      };
    });

    // Ensure sum = 100 by adjusting last entry if needed
    const sum = newPerc.reduce((s, x) => s + Number(x.percentage || 0), 0);
    if (newPerc.length > 0 && Math.abs(sum - 100) > 0.01) {
      const diff = Number((100 - sum).toFixed(2));
      newPerc[newPerc.length - 1].percentage = Number((Number(newPerc[newPerc.length - 1].percentage || 0) + diff).toFixed(2));
    }

    setPercentages(newPerc);
    setPercentTotalError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactionType, selectedMembers]);

  // Handler thay đổi phần trăm một participant
  const changePercentage = (index, value) => {
    const num = Number(value);
    setPercentages(prev => {
      const next = prev.map((p, i) => i === index ? { ...p, percentage: isNaN(num) ? 0 : num } : p);
      const sum = next.reduce((s, x) => s + Number(x.percentage || 0), 0);
      setPercentTotalError(Math.abs(sum - 100) > 0.01 ? `Tổng phần trăm hiện tại là ${sum}%, cần = 100%` : '');
      return next;
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

  // Tính số tiền mỗi người phải trả dựa trên kiểu giao dịch
  const calculatePerPersonAmount = () => {
    if (!amount) return 0;
    const numAmount = Number(amount);
    if (isNaN(numAmount)) return 0;

    if (transactionType === 'payer_for_others') {
      // Kiểu 1: Mỗi người nợ toàn bộ số tiền
      return numAmount;
    } else if (transactionType === 'equal_split') {
      // Kiểu 2: Chia đều cho tất cả người tham gia bao gồm người tạo
      return numAmount / (selectedMembers.length + 1); // +1 for creator
    } else if (transactionType === 'percentage_split') {
      // Kiểu 3: Cần phần trăm cụ thể cho từng người
      return 0; // Sẽ tính riêng cho từng người
    }

    return 0;
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
    
    let participants = buildParticipants();
    if (transactionType === 'payer_for_others') {
      // each selected participant owes the full amount (creator paid for others)
      participants = participants.map(p => ({ ...p, shareAmount: Number(amount) }));
    }

    // Nếu chọn kiểu percentage_split, kiểm tra tổng % = 100
    if (transactionType === 'percentage_split') {
      const sum = (percentages || []).reduce((s, p) => s + Number(p.percentage || 0), 0);
      if (Math.abs(sum - 100) > 0.01) {
        setCreateResult({ ok: false, message: `Tổng phần trăm phải bằng 100% (hiện ${sum}%)` });
        return;
      }
    }

    setCreating(true);
    try {
      const payload = {
        amount: Number(amount),
        transactionType,
        participants,
        title: title || '',
        description: description || '',
        category: selectedCategory || undefined
      };

      // Thêm percentages cho percentage_split
      if (transactionType === 'percentage_split') {
        // build payload.percentages from percentages state (includes creator and selectedMembers)
        payload.percentages = (percentages || []).map(p => {
          return {
            user: p.id,
            email: p.email,
            percentage: Number(p.percentage || 0)
          };
        });
      }

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
      setPercentages([]);
      setDescription('');
      setTransactionType('equal_split');
      
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

  // Helper: compute unique total participants for a transaction
  // (include creator if not already present in tx.participants)
  const getTotalParticipants = (tx) => {
    if (!tx) return 0;
    const set = new Set();
    if (Array.isArray(tx.participants)) {
      tx.participants.forEach(p => {
        if (p.user) set.add(String(p.user._id || p.user));
        else if (p.email) set.add(String((p.email || '').toLowerCase()));
      });
    }
    // include creator if it's not already in the set
    if (tx.createdBy) {
      if (typeof tx.createdBy === 'object') {
        const cid = tx.createdBy._id || tx.createdBy.id || null;
        const cemail = tx.createdBy.email || null;
        if (cid && !set.has(String(cid))) set.add(String(cid));
        else if (cemail && !set.has(String(cemail.toLowerCase()))) set.add(String(cemail.toLowerCase()));
      } else {
        const c = String(tx.createdBy);
        if (c.includes('@')) {
          if (!set.has(c.toLowerCase())) set.add(c.toLowerCase());
        } else {
          if (!set.has(c)) set.add(c);
        }
      }
    }
    // if no participants found, at least count creator (if exists) as 1, otherwise 0
    return set.size || (tx.createdBy ? 1 : 0);
  };

  // Start editing a transaction
  const handleEditTransaction = async (tx) => {
    // load latest transaction from server to ensure we have transactionType, amounts, participants count etc.
    if (!tx || !tx._id) return;
    setEditLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/groups/${groupId}/transactions/${tx._id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!res.ok) {
        // fallback to using provided tx object
        console.warn('Failed to load transaction details, using local copy');
        const local = tx;
        setEditingTx(local);
        setEditTransactionType(local.transactionType || 'equal_split');
        setEditTitle(local.title || '');
        setEditAmount(String(local.amount || ''));
        setEditDescription(local.description || '');
        setEditCategory(local.category && local.category._id ? local.category._id : (typeof local.category === 'string' ? local.category : ''));
        // Map participants but REMOVE creator (avoid duplicate creator entries)
        const mappedLocalAll = Array.isArray(local.participants) ? local.participants.map(p => ({
          id: p.user ? (p.user._id || p.user) : undefined,
          email: p.email || (p.user && p.user.email) || '',
          name: p.user ? (p.user.name || p.user.email || 'Thành viên') : (p.email || 'Thành viên'),
          settled: p.settled || false,
          shareAmount: p.shareAmount || 0
        })) : [];
        const creator = getCurrentUser();
        const mappedLocal = mappedLocalAll.filter(m => {
          if (!creator) return true;
          if (m.id && String(m.id) === String(creator.id)) return false;
          if (m.email && creator.email && String(m.email).toLowerCase() === String(creator.email).toLowerCase()) return false;
          return true;
        });
        setEditSelectedMembers(mappedLocal);
        // try to initialize percentages from tx if present
        if (Array.isArray(local.percentages) && local.percentages.length > 0) {
          setPercentages(local.percentages.map(pp => ({ id: pp.user, email: pp.email, name: pp.name, percentage: Number(pp.percentage || 0) })));
        } else {
          // build default percentages including creator
          const creator = getCurrentUser();
          const list = [{ id: creator?.id, email: creator?.email, name: creator?.name || 'Bạn' }, ...mappedLocal.map(m => ({ id: m.id, email: m.email, name: m.name }))];
          const base = Math.round((100 / (list.length || 1)) * 100) / 100;
          const newPerc = list.map((p, idx) => ({ id: p.id, email: p.email, name: p.name, percentage: base }));
          // adjust last
          const sum = newPerc.reduce((s, x) => s + Number(x.percentage || 0), 0);
          if (newPerc.length > 0 && Math.abs(sum - 100) > 0.01) {
            const diff = Number((100 - sum).toFixed(2));
            newPerc[newPerc.length - 1].percentage = Number((Number(newPerc[newPerc.length - 1].percentage || 0) + diff).toFixed(2));
          }
          setPercentages(newPerc);
        }
        setIsEditing(true);
        return;
      }
 
      const body = await res.json().catch(() => null);
      // backend may return { transaction, transactionType, amount, participantsCount } or the tx directly
      const payloadTx = (body && body.transaction) ? body.transaction : (body || tx);
 
      setEditingTx(payloadTx);
      setEditTransactionType(payloadTx.transactionType || 'equal_split');
      setEditTitle(payloadTx.title || '');
      setEditAmount(String(payloadTx.amount || ''));
      setEditDescription(payloadTx.description || '');
      setEditCategory(payloadTx.category && payloadTx.category._id ? payloadTx.category._id : (typeof payloadTx.category === 'string' ? payloadTx.category : ''));
 
      const mappedAll = Array.isArray(payloadTx.participants) ? payloadTx.participants.map(p => ({
        id: p.user ? (p.user._id || p.user) : undefined,
        email: p.email || (p.user && p.user.email) || '',
        name: p.user ? (p.user.name || p.user.email || 'Thành viên') : (p.email || 'Thành viên'),
        settled: p.settled || false,
        shareAmount: p.shareAmount || 0
      })) : [];
      // Remove creator from editSelectedMembers to avoid duplication when saving
      const creator = getCurrentUser();
      const mappedParticipants = mappedAll.filter(m => {
        if (!creator) return true;
        if (m.id && String(m.id) === String(creator.id)) return false;
        if (m.email && creator.email && String(m.email).toLowerCase() === String(creator.email).toLowerCase()) return false;
        return true;
      });
      setEditSelectedMembers(mappedParticipants);
      // set percentages from payload if available, otherwise initialize similar to create flow
      if (Array.isArray(payloadTx.percentages) && payloadTx.percentages.length > 0) {
        setPercentages(payloadTx.percentages.map(pp => ({ id: pp.user, email: pp.email, name: pp.name, percentage: Number(pp.percentage || 0) })));
      } else if (payloadTx.transactionType === 'percentage_split') {
        const creator = getCurrentUser();
        const list = [{ id: creator?.id, email: creator?.email, name: creator?.name || 'Bạn' }, ...mappedParticipants.map(m => ({ id: m.id, email: m.email, name: m.name }))];
        const base = Math.round((100 / (list.length || 1)) * 100) / 100;
        const newPerc = list.map((p, idx) => ({ id: p.id, email: p.email, name: p.name, percentage: base }));
        const sum = newPerc.reduce((s, x) => s + Number(x.percentage || 0), 0);
        if (newPerc.length > 0 && Math.abs(sum - 100) > 0.01) {
          const diff = Number((100 - sum).toFixed(2));
          newPerc[newPerc.length - 1].percentage = Number((Number(newPerc[newPerc.length - 1].percentage || 0) + diff).toFixed(2));
        }
        setPercentages(newPerc);
      } else {
        setPercentages([]); // not percentage split
      }
 
      setIsEditing(true);
    } catch (err) {
      console.error('Error fetching transaction for edit:', err);
      alert('Không thể tải dữ liệu giao dịch để sửa. Thử lại sau.');
    } finally {
      setEditLoading(false);
    }
  };

  // Toggle member selection in edit mode
  const toggleEditMemberSelection = (member) => {
    setEditSelectedMembers(prev => {
      const isSelected = prev.some(m => m.id === member.id || m.email === member.email);
      if (isSelected) {
        return prev.filter(m => !(m.id === member.id || m.email === member.email));
      } else {
        // preserve settled state if existed in original tx
        const existingTxParticipant = editingTx?.participants?.find(p =>
          (p.user && member.id && (String(p.user._id || p.user) === String(member.id))) ||
          (p.email && member.email && String(p.email).toLowerCase() === String(member.email).toLowerCase())
        );
        
        // compute initial shareAmount for the new member based on current editTransactionType and editAmount
        const prevCount = Array.isArray(prev) ? prev.length : 0; // number of already selected (excluding creator)
        const amtNum = Number(editAmount || 0);
        let initShare = 0;
        if (editTransactionType === 'payer_for_others') {
          // each participant owes the full amount (creator paid)
          initShare = amtNum;
        } else if (editTransactionType === 'equal_split') {
          // after adding, total participants = (prevCount + 1 selected members) + creator => prevCount + 2
          const totalParts = (prevCount + 2) || 1;
          initShare = Number((amtNum / totalParts).toFixed(2));
        } else if (editTransactionType === 'percentage_split') {
          // percentage split handled by percentages editor; default to 0 for new member
          initShare = 0;
        } else if (editTransactionType === 'payer_single') {
          // creator only; participants shouldn't normally be added but default to 0
          initShare = 0;
        } else {
          initShare = amtNum;
        }

        return [...prev, {
          ...member,
          settled: existingTxParticipant ? existingTxParticipant.settled : false,
          shareAmount: initShare
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

  // Add helper to normalize transaction for UI (ensure participants have shareAmount based on transactionType/percentages)
  function normalizeTxForDisplay(tx) {
	// (this helper will be used below)
	if (!tx) return tx;
	const copy = { ...tx };
	const amt = Number(copy.amount || 0);
	const parts = Array.isArray(copy.participants) ? copy.participants.map(p => ({ ...p })) : [];

	// build percentage map if present
	const percMap = new Map();
	if (Array.isArray(copy.percentages)) {
		copy.percentages.forEach(pp => {
			const key = (pp.email || pp.user || '').toString().toLowerCase();
			percMap.set(key, Number(pp.percentage || 0));
		});
	}

	// compute unique total participants (include creator if missing)
	const idSet = new Set();
	parts.forEach(p => {
		if (p.user) idSet.add(String(p.user._id || p.user));
		else if (p.email) idSet.add(String((p.email || '').toLowerCase()));
	});
	if (copy.createdBy) {
		const c = (typeof copy.createdBy === 'object') ? (copy.createdBy._id || copy.createdBy.email) : copy.createdBy;
		if (c) idSet.add(String((c || '').toString().toLowerCase()));
	}
	const totalParticipants = idSet.size || (copy.createdBy ? 1 : 0);

	// compute shareAmount based on transactionType
	if (copy.transactionType === 'percentage_split' && percMap.size > 0) {
		parts.forEach(p => {
			const key = (p.email || p.user || '').toString().toLowerCase();
			const perc = percMap.get(key) || 0;
			p.shareAmount = Number(((perc / 100) * amt).toFixed(2));
			p.percentage = perc;
		});
	} else if (copy.transactionType === 'equal_split') {
		const per = totalParticipants ? Number((amt / totalParticipants).toFixed(2)) : 0;
		parts.forEach(p => p.shareAmount = p.shareAmount ? Number(p.shareAmount) : per);
	} else if (copy.transactionType === 'payer_for_others') {
		// Creator paid for others -> each selected participant owes the full amount (not split)
		parts.forEach(p => p.shareAmount = Number(amt));
	} else if (copy.transactionType === 'payer_single') {
		// Only creator involved; participants (if any) owe nothing by default
		parts.forEach(p => p.shareAmount = p.shareAmount ? Number(p.shareAmount) : 0);
	} else {
		// fallback: divide equally among participants
		const cnt = parts.length || totalParticipants || 1;
		const per = cnt ? Number((amt / cnt).toFixed(2)) : 0;
		parts.forEach(p => p.shareAmount = p.shareAmount ? Number(p.shareAmount) : per);
	}

	copy.participants = parts;
	return copy;
}
 
  // Sync edit modal shares/percentages when type or amount or selected members change
  useEffect(() => {
	if (!isEditing) return;

	const amt = Number(editAmount || 0);

	// equal_split: every participant (including creator) pays equal share
	if (editTransactionType === 'equal_split') {
		const total = (editSelectedMembers.length + 1) || 1; // include creator
		const per = Number((amt / total).toFixed(2));
		setEditSelectedMembers(prev => prev.map(m => ({ ...m, shareAmount: per })));
		setPercentages([]); // clear percentages
		setPercentTotalError('');
		return;
	}

	// payer_for_others: creator paid full amount; selected members each owe equal part
	if (editTransactionType === 'payer_for_others') {
		// For "trả giúp" (creator pays for others) each selected member owes the FULL amount
		setEditSelectedMembers(prev => prev.map(m => ({ ...m, shareAmount: Number(amt) })));
		setPercentages([]);
		setPercentTotalError('');
		return;
	}

	// percentage_split: ensure percentages array exists for creator + selectedMembers
	if (editTransactionType === 'percentage_split') {
		const creator = getCurrentUser();
		const list = [{ id: creator?.id, email: creator?.email, name: creator?.name || 'Bạn' }, ...editSelectedMembers.map(m => ({ id: m.id, email: m.email, name: m.name }))];
		// If current percentages length matches keep them, otherwise initialize equal
		if (!Array.isArray(percentages) || percentages.length !== list.length) {
			const base = Math.round((100 / (list.length || 1)) * 100) / 100;
			let newPerc = list.map(p => ({ id: p.id, email: p.email, name: p.name, percentage: base }));
			const sum = newPerc.reduce((s, x) => s + Number(x.percentage || 0), 0);
			if (newPerc.length > 0 && Math.abs(sum - 100) > 0.01) {
				const diff = Number((100 - sum).toFixed(2));
				newPerc[newPerc.length - 1].percentage = Number((Number(newPerc[newPerc.length - 1].percentage || 0) + diff).toFixed(2));
			}
			setPercentages(newPerc);
		}
		// compute shareAmount for editSelectedMembers according to percentages
		const percMap = new Map();
		(percentages || []).forEach(pp => {
			const key = (pp.email || pp.id || '').toString().toLowerCase();
			percMap.set(key, Number(pp.percentage || 0));
		});
		setEditSelectedMembers(prev => prev.map(m => {
			const key = (m.email || m.id || '').toString().toLowerCase();
			const perc = percMap.get(key) || 0;
			return { ...m, shareAmount: Number(((perc / 100) * amt).toFixed(2)), percentage: perc };
		}));
		return;
	}

	// default: do nothing
}, [editTransactionType, editAmount, editSelectedMembers.length, isEditing]); // eslint-disable-line

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

    // Build participants from selected members
    let participants = editSelectedMembers.map(m => ({
      user: m.id,
      email: m.email,
      settled: m.settled || false,
      shareAmount: m.shareAmount || Number(editAmount),
      percentage: typeof m.percentage !== 'undefined' ? Number(m.percentage) : undefined
    }));
    
    // If payer_for_others, ensure each participant owes the full amount
    if (editTransactionType === 'payer_for_others') {
      participants = participants.map(p => ({ ...p, shareAmount: Number(editAmount) }));
    }
    
    // Build payload
    const payload = {
      title: editTitle,
      description: editDescription,
      amount: Number(editAmount),
      category: editCategory,
      transactionType: editTransactionType,
      participants,
      perPerson: true
    };
    // include percentages when editing percentage_split
    if (editTransactionType === 'percentage_split') {
      payload.percentages = (percentages || []).map(p => ({ user: p.id, email: p.email, percentage: Number(p.percentage || 0) }));
    }

    // Close modal UI while saving but keep a copy to restore on error
    setIsEditing(false);
    const prevTxs = txs;
    try {
      const res = await fetch(`${API_BASE}/api/groups/${groupId}/transactions/${editingTx._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = (body && (body.message || body.error)) || 'Lỗi khi cập nhật giao dịch';
        throw new Error(msg);
      }
      
      // backend may return { transaction: {...} } or the transaction directly
      const updatedTx = body && body.transaction ? body.transaction : (body || null);
      if (!updatedTx) {
        // fallback: refresh full list if backend didn't return updated object
        await fetchTxs();
        setGlobalMessage('Cập nhật giao dịch thành công');
        setGlobalMessageType('success');
        setTimeout(() => setGlobalMessage(''), 4000);
        return;
      }
      
      // Normalize updated transaction for UI (ensures shareAmount / percentages are correct)
      const updatedNormalized = normalizeTxForDisplay({
        ...updatedTx,
        participants: Array.isArray(updatedTx.participants) ? updatedTx.participants.map(p => ({
          ...p,
          user: p.user && (p.user._id || p.user.name) ? p.user : p.user,
          email: p.email
        })) : []
      });
      
      // Replace the transaction in local state so UI updates immediately
      setTxs(prev => prev.map(t => (String(t._id || t.id) === String(updatedNormalized._id || updatedNormalized.id) ? updatedNormalized : t)));
      
      // update editingTx (in case modal remained open elsewhere) and show success
      setEditingTx(updatedNormalized);

      setGlobalMessage('Cập nhật giao dịch thành công');
      setGlobalMessageType('success');
      setTimeout(() => setGlobalMessage(''), 4000);
    } catch (err) {
      console.error('Error updating transaction:', err);
      // restore previous list and re-open modal so user can retry
      setTxs(prevTxs);
      alert(err.message || 'Đã xảy ra lỗi khi cập nhật giao dịch');
      setIsEditing(true);
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

              {/* Dropdown chọn kiểu giao dịch */}
              <div className="gt-form-group">
                <label>Kiểu giao dịch</label>
                <select 
                  value={transactionType}
                  onChange={(e) => setTransactionType(e.target.value)}
                  required
                >
                  <option value="payer_single">Trả đơn (Chỉ tôi)</option>
                  <option value="payer_for_others">Trả giúp (Tôi trả tiền cho người khác)</option>
                  <option value="equal_split">Chia đều (Chia đều cho tất cả)</option>
                  <option value="percentage_split">Chia phần trăm (Tùy chỉnh % cho mỗi người)</option>
                </select>
              </div>

              {/* Thêm trường chọn danh mục */}
              <div className="gt-form-group">
                <label>Danh mục</label>
                <select 
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  required
                  className="category-selector"
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
                {/* Nếu là 'Trả đơn' thì không cần chọn người tham gia */}
                {transactionType !== 'payer_single' ? (
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
                ) : (
                  <div style={{ padding: 10, color: '#64748b' }}>Chọn kiểu "Trả đơn" nghĩa là giao dịch chỉ dành cho bạn; không cần chọn thành viên.</div>
                )}
                
                {amount && selectedMembers.length > 0 && (
                  <div className="gt-total-summary">
                    <div className="gt-amount-calculation">
                      {transactionType === 'payer_for_others' && (
                        <>
                          <div>Tôi trả:</div>
                          <div>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(amount) || 0)}</div>
                          <div className="gt-equals">=</div>
                        </>
                      )}
                      {transactionType === 'equal_split' && (
                        <>
                          <div>Tổng tiền:</div>
                          <div>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(amount) || 0)}</div>
                          <div>÷</div>
                          <div>{selectedMembers.length + 1} người</div>
                          <div className="gt-equals">=</div>
                        </>
                      )}
                      {transactionType === 'percentage_split' && (
                        <>
                          <div>Tổng tiền:</div>
                          <div>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(amount) || 0)}</div>
                          <div className="gt-equals">=</div>
                        </>
                      )}
                    </div>
                    <div className="gt-total-preview">
                      {transactionType === 'payer_for_others' && (
                        <>Mỗi người được chọn nợ: {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(calculatePerPersonAmount())}</>
                      )}
                      {transactionType === 'equal_split' && (
                        <>Mỗi người (bao gồm tôi): {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(calculatePerPersonAmount())}</>
                      )}
                      {transactionType === 'percentage_split' && (
                        <>Tùy chỉnh phần trăm cho mỗi người (bao gồm tôi)</>
                      )}
                    </div>
                  </div>
                )}

                {selectedMembers.length > 0 && (
                  <div className="gt-selected-count">
                    <div>
                      Đã chọn: <strong>{selectedMembers.length}</strong> người
                      {transactionType === 'equal_split' && (
                        <span className="gt-info-badge">+ Bạn = {selectedMembers.length + 1} người tham gia</span>
                      )}
                      {transactionType === 'percentage_split' && (
                        <span className="gt-info-badge">+ Bạn = {selectedMembers.length + 1} người tham gia</span>
                      )}
                    </div>
                    <button 
                      type="button" 
                      className="gt-clear-members" 
                      onClick={() => setSelectedMembers([])}
                    >
                      Xóa tất cả
                    </button>
                  </div>
                )}

                {/* Percentage split editor */}
                {transactionType === 'percentage_split' && (
                  <div className="percentage-table" style={{ marginTop: 12 }}>
                    <div className="percentage-table-header">
                      <div>Thành viên</div>
                      <div>%</div>
                      <div>Số tiền</div>
                    </div>
                    <div className="percentage-table-body">
                      {(percentages || []).map((p, idx) => (
                        <div key={String(p.email || p.id || idx)} className="percentage-table-row">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 36, height: 36, borderRadius: 8, background: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                              {(p.name || '').charAt(0).toUpperCase() || 'U'}
                            </div>
                            <div>
                              <div style={{ fontWeight: 700 }}>{p.name || p.email || 'Người dùng'}</div>
                              <div style={{ fontSize: 12, color: '#64748b' }}>{p.email || ''}</div>
                            </div>
                          </div>
                          <div>
                            <div className={`percentage-input-wrapper ${percentTotalError ? 'error' : ''}`}>
                              <input
                                className="percentage-input"
                                type="number"
                                min="0"
                                max="100"
                                step="0.01"
                                value={p.percentage}
                                onChange={(e) => changePercentage(idx, e.target.value)}
                              />
                              <span className="percentage-symbol">%</span>
                            </div>
                          </div>
                          <div style={{ textAlign: 'right', fontWeight: 700 }}>
                            {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(((Number(p.percentage || 0) / 100) * Number(amount || 0)) || 0)}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div className={`percentage-total ${percentTotalError ? 'error' : 'success'}`} style={{ padding: '6px 10px' }}>
                        Tổng: {(percentages || []).reduce((s, x) => s + Number(x.percentage || 0), 0)}%
                      </div>
                      {percentTotalError && <div style={{ color: '#b91c1c', fontSize: 13 }}>{percentTotalError}</div>}
                    </div>
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
                    setTransactionType('equal_split');
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
                    const totalParticipants = getTotalParticipants(tx);
                     const isPayer = isUserPayer(tx);
                     const isParticipant = isUserParticipant(tx);
                     const category = tx.category ? getCategoryById(tx.category._id || tx.category) : { name: 'Không có', icon: '📝' };
                     const isCreator = isUserCreator(tx);
                    
                    // determine creator id/email (handles object or id string)
                    const creatorId = tx.createdBy ? (typeof tx.createdBy === 'object' ? (tx.createdBy._id || tx.createdBy.id) : tx.createdBy) : null;
                    const creatorEmail = tx.createdBy && typeof tx.createdBy === 'object' ? (tx.createdBy.email || '') : (typeof tx.createdBy === 'string' && String(tx.createdBy).includes('@') ? String(tx.createdBy) : '');
                    
                    // raw participation record (if any) — based on original tx.participants
                    const userParticipationRaw = currentUser && Array.isArray(tx.participants) ? 
                      tx.participants.find(p => 
                        (p.user && String(p.user._id || p.user) === String(currentUser.id)) || 
                        (p.email && currentUser.email && p.email.toLowerCase() === currentUser.email.toLowerCase())
                      ) : null;
                    
                    // If the current user is the creator, do NOT treat them as a debtor/participant for debt UI
                    const userParticipation = (userParticipationRaw && creatorId && String(creatorId) === String(currentUser?.id)) 
                      ? null 
                      : userParticipationRaw;
                    const userSettled = userParticipation ? userParticipation.settled : false;
                    
                    // Build displayParticipants: clone tx.participants and for percentage_split include the creator
                    let displayParticipants = Array.isArray(tx.participants) ? tx.participants.slice() : [];

                    // helper: check if creator already present in participants (by id or email)
                    const isCreatorPresent = (() => {
                      if (!tx.createdBy) return false;
                      if (!Array.isArray(displayParticipants)) return false;
                      for (const p of displayParticipants) {
                        if (p.user && creatorId && String(p.user._id || p.user) === String(creatorId)) return true;
                        if (p.email && creatorEmail && String(p.email).toLowerCase() === String(creatorEmail).toLowerCase()) return true;
                      }
                      return false;
                    })();

                    // If percentage_split, payer_single OR payer_for_others and creator is missing, append a synthetic creator entry (read-only)
                    if ((tx.transactionType === 'percentage_split' || tx.transactionType === 'payer_single' || tx.transactionType === 'payer_for_others') && tx.createdBy && !isCreatorPresent) {
                       // try to find creator percentage from tx.percentages if present
                       let creatorPercentage = null;
                       if (Array.isArray(tx.percentages)) {
                         const found = tx.percentages.find(pp => {
                           if (pp.user && creatorId && String(pp.user) === String(creatorId)) return true;
                           if (pp.email && creatorEmail && String(pp.email).toLowerCase() === String(creatorEmail).toLowerCase()) return true;
                           return false;
                         });
                         if (found) creatorPercentage = Number(found.percentage || 0);
                       }

                       const creatorEntry = {
                         // do not try to dereference user object; keep simple structure
                         user: creatorId && !String(creatorId).includes('@') ? creatorId : undefined,
                         email: creatorEmail || undefined,
                         name: (tx.createdBy && typeof tx.createdBy === 'object' && (tx.createdBy.name || tx.createdBy.email)) ? (tx.createdBy.name || tx.createdBy.email) : 'Người tạo',
                        settled: true, // creator đã trả tiền nên xem là đã settled trong UI
                         // annotate as synthetic creator so UI can show badges and hide action buttons
                         _isCreatorSynthetic: true,
                        // For payer_single and payer_for_others, show creator paid full amount.
                        // For percentage_split, use percentage if available.
                        shareAmount:
                          tx.transactionType === 'payer_single' || tx.transactionType === 'payer_for_others'
                            ? Number(tx.amount || tx.total || 0)
                            : (creatorPercentage !== null ? ((Number(creatorPercentage) / 100) * Number(tx.amount || tx.total || 0)) : undefined)
                       };
                       displayParticipants = [creatorEntry, ...displayParticipants];
                     }

                    return (
                      <li key={tx._id || tx.id} className={`gt-item ${isPayer ? 'i-paid' : ''} ${isParticipant ? 'i-participate' : ''}`}>
                        <div className="gt-item-header">
                          <div className="gt-title-section">
                            <div className="gt-category-badge">{category.icon} {category.name}</div>
                            <div className="gt-title">{tx.title || 'Giao dịch'}</div>
                            <div className="gt-transaction-type-badge">
                              {tx.transactionType === 'payer_for_others' && <span className="gt-type-badge gt-type-payer"><i className="fas fa-hand-holding-usd"></i> Trả giúp</span>}
                              {tx.transactionType === 'equal_split' && <span className="gt-type-badge gt-type-equal"><i className="fas fa-balance-scale"></i> Chia đều</span>}
                              {tx.transactionType === 'percentage_split' && <span className="gt-type-badge gt-type-percentage"><i className="fas fa-percent"></i> Chia phần trăm</span>}
                              {tx.transactionType === 'payer_single' && <span className="gt-type-badge gt-type-single"><i className="fas fa-user"></i> Trả đơn</span>}
                              {!tx.transactionType && <span className="gt-type-badge">Giao dịch</span>}
                            </div>
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
                            
                            {/* Add transaction summary info */}
                            <div className="gt-tx-summary">
                              <div className="gt-participants-count">
                                <i className="fas fa-users"></i> 
                                {/* Tính số người tham gia dựa trên kiểu giao dịch */}
                                {tx.transactionType === 'payer_for_others' 
                                  ? `${tx.participants.length} người được trả` 
                                  : (tx.transactionType === 'payer_single' ? `1 người (chỉ bạn)` : `${totalParticipants} người tham gia`)
                                }
                              </div>
                              <div className="gt-date">
                                {new Date(tx.date || tx.createdAt || tx.created).toLocaleString()}
                              </div>
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
                          
                          {Array.isArray(tx.participants) && tx.participants.length > 0 && (
                            <div className="gt-participants">
                              <div className="gt-participants-header">
                                <div className="gt-label">
                                  <i className="fas fa-file-invoice-dollar"></i> Thông tin chi tiết giao dịch
                                </div>
                                <div className="gt-participants-info">
                                  <span className="gt-info-badge">
                                    <i className="fas fa-users"></i> 
                                    {tx.transactionType === 'payer_for_others' 
                                      ? `${tx.participants.length} người được trả` 
                                      : (tx.transactionType === 'payer_single' ? `1 người (chỉ bạn)` : `${totalParticipants} người tham gia`)
                                    }
                                  </span>
                                  
                                  {tx.transactionType === 'payer_for_others' && (
                                    <span className="gt-info-badge exclude-creator" title="Người tạo trả dùm cho những người khác">
                                      <i className="fas fa-hand-holding-usd"></i> Trả giúp
                                    </span>
                                  )}
                                  {tx.transactionType === 'equal_split' && (
                                    <span className="gt-info-badge include-creator" title="Tổng số tiền chia đều cho tất cả người tham gia">
                                      <i className="fas fa-balance-scale"></i> Chia đều: {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(tx.amount / (totalParticipants || 1))}
                                    </span>
                                  )}
                                  {tx.transactionType === 'percentage_split' && (
                                    <span className="gt-info-badge include-creator" title="Tổng số tiền chia theo phần trăm đã cài đặt">
                                      <i className="fas fa-percent"></i> Chia theo phần trăm
                                    </span>
                                  )}
                                  {tx.transactionType === 'payer_single' && (
                                    <span className="gt-info-badge include-creator" title="Giao dịch cá nhân - chỉ người tạo">
                                      <i className="fas fa-user"></i> Trả đơn (chỉ bạn)
                                    </span>
                                  )}
                                </div>
                              </div>
                              
                              {/* Transaction type explanation box */}
                              <div className="gt-transaction-explanation">
                                {tx.transactionType === 'payer_for_others' && (
                                  <div className="gt-explanation-box gt-payer-for-others-box">
                                    <i className="fas fa-info-circle"></i>
                                    <div className="gt-explanation-text">
                                      <strong>Trả giúp:</strong> {tx.payer ? (tx.payer.name || tx.payer.email || 'Người trả') : 'Người trả'} đã trả tiền cho {tx.participants.length} người khác. 
                                      Tổng số tiền: <strong>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(tx.amount)}</strong>
                                      {tx.participants.length > 0 && (
                                        <span> - Mỗi người được trả: <strong>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(tx.participants[0]?.shareAmount || (tx.amount / tx.participants.length))}</strong></span>
                                      )}
                                    </div>
                                  </div>
                                )}
                                {tx.transactionType === 'equal_split' && (
                                  <div className="gt-explanation-box gt-equal-split-box">
                                    <i className="fas fa-info-circle"></i>
                                    <div className="gt-explanation-text">
                                      <strong>Chia đều:</strong> Tổng số tiền {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(tx.amount)} được chia đều cho {tx.participants.length} người. 
                                      Mỗi người: <strong>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(tx.amount / (totalParticipants || 1))}</strong>
                                    </div>
                                  </div>
                                )}
                                {tx.transactionType === 'percentage_split' && (
                                  <div className="gt-explanation-box gt-percentage-split-box">
                                    <i className="fas fa-info-circle"></i>
                                    <div className="gt-explanation-text">
                                      <strong>Chia theo phần trăm:</strong> Tổng số tiền {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(tx.amount)} được chia theo tỷ lệ phần trăm cho {totalParticipants} người.
                                    </div>
                                  </div>
                                )}
                                {tx.transactionType === 'payer_single' && (
                                  <div className="gt-explanation-box gt-default-box">
                                    <i className="fas fa-info-circle"></i>
                                    <div className="gt-explanation-text">
                                      <strong>Trả đơn:</strong> Giao dịch này chỉ dành cho người tạo (bạn). Tổng số tiền: <strong>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(tx.amount)}</strong>
                                    </div>
                                  </div>
                                )}
                                {/* Hiển thị cho giao dịch cũ không có kiểu */}
                                {!tx.transactionType && (
                                  <div className="gt-explanation-box gt-default-box">
                                    <i className="fas fa-info-circle"></i>
                                    <div className="gt-explanation-text">
                                      <strong>Giao dịch:</strong> Tổng số tiền {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(tx.amount)} 
                                      cho {tx.participants.length} người tham gia.
                                      {tx.participants.length > 0 && (
                                        <span> Mỗi người: <strong>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(tx.participants[0]?.shareAmount || (tx.amount / tx.participants.length))}</strong></span>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                              
                              <ul className="gt-participants-list">
                                {/* Chỉ hiển thị danh sách participants, không thêm người tạo riêng */}
                                {Array.isArray(displayParticipants) && displayParticipants.map((p, i) => {
                                   const isCurrentUserParticipant = currentUser && 
                                     ((p.user && String(p.user._id || p.user) === String(currentUser.id)) || 
                                      (p.email && currentUser.email && p.email.toLowerCase() === currentUser.email.toLowerCase()));
                                   
                                   const isCreatorParticipant = Boolean(
                                     p._isCreatorSynthetic ||
                                     (tx.createdBy && p.user && (typeof tx.createdBy === 'object' ? String(p.user._id || p.user) === String(tx.createdBy._id || tx.createdBy.id) : String(p.user._id || p.user) === String(tx.createdBy))) ||
                                     (tx.createdBy && p.email && typeof tx.createdBy === 'string' && String(tx.createdBy).includes('@') && String(p.email).toLowerCase() === String(tx.createdBy).toLowerCase())
                                   );
                                   
                                   // Sử dụng shareAmount từ database hoặc tính toán dựa trên transaction type
                                   let participantAmount = 0;
                                   if (p.shareAmount && p.shareAmount > 0) {
                                     // Sử dụng shareAmount từ database
                                     participantAmount = p.shareAmount;
                                   } else {
                                     // Fallback: tính toán dựa trên kiểu giao dịch
                                     if (tx.transactionType === 'equal_split') {
                                       participantAmount = tx.amount / (totalParticipants || 1);
                                     } else if (tx.transactionType === 'payer_for_others') {
                                       participantAmount = tx.amount / (Array.isArray(tx.participants) && tx.participants.length > 0 ? tx.participants.length : 1);
                                     } else {
                                       // Default fallback cho giao dịch cũ
                                       participantAmount = tx.amount / (Array.isArray(tx.participants) && tx.participants.length > 0 ? tx.participants.length : (totalParticipants || 1));
                                     }
                                   }
                                   
                                   // If this participant IS the creator, render as creator (no pending actions)
                                   const liClass = isCreatorParticipant 
                                     ? `gt-participant creator settled ${isCurrentUserParticipant ? 'current-user' : ''}` 
                                     : `gt-participant ${p.settled ? 'settled' : 'pending'} ${isCurrentUserParticipant ? 'current-user' : ''}`;
                                   
                                   return (
                                     <li key={i} className={liClass}>
                                     <div className="gt-participant-info">
                                       <div className="gt-participant-name">
                                         <span className="gt-participant-role">
                                           {isCreatorParticipant ? 
                                             '👑 Người tạo' : 
                                             '👤 Thành viên'}
                                         </span>
                                         <div>
                                           {p.user ? (p.user.name || p.user.email) : (p.email || 'Unknown')}
                                           {isCurrentUserParticipant && <span className="gt-current-user-badge">Bạn</span>}
                                           {isCreatorParticipant && <span className="gt-creator-badge">Tạo</span>}
                                         </div>
                                       </div>
                                       <div className="gt-participant-amount">
                                         <div className="gt-amount-main">
                                           {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(participantAmount)}
                                         </div>
                                         {p.percentage && p.percentage > 0 && (
                                           <div className="gt-percentage-info">({p.percentage}% của tổng)</div>
                                         )}
                                       </div>
                                     </div>
                                     
                                     <div className="gt-participant-status">
                                       <div className="gt-status-text">
                                         {isCreatorParticipant ? (
                                           <><i className="fas fa-crown"></i> Người tạo</>
                                         ) : (
                                           p.settled ? (<><i className="fas fa-check-circle"></i> Đã thanh toán</>) : (<><i className="fas fa-clock"></i> Chưa thanh toán</>)
                                         )}
                                       </div>
                                       {/* Nếu participant là creator -> không hiển thị button trả/xác nhận */}
                                       {!isCreatorParticipant && isCurrentUserParticipant && !p.settled && (
                                        <button 
                                          className="gt-settle-btn"
                                          onClick={() => handleSettle(tx._id || tx.id, (p.user ? (p.user._id || p.user) : p.email))}
                                        >
                                          <i className="fas fa-hand-holding-usd"></i> Trả tiền
                                        </button>
                                       )}
                                       {!isCreatorParticipant && isPayer && !p.settled && !isCurrentUserParticipant && (
                                         <button 
                                           className="gt-settle-btn"
                                           onClick={() => handleSettle(tx._id || tx.id, p.user ? (p.user._id || p.user) : null)}
                                         >
                                           <i className="fas fa-check"></i> Xác nhận
                                         </button>
                                       )}
                                     </div>
                                     </li>
                                   );
                                 })}
                              </ul>
                            </div>
                          )}
                          
                          {/* Hiển thị công nợ nếu người dùng là participant (và KHÔNG phải là creator) và chưa thanh toán */}
                          {isParticipant && !userSettled && !isCreator && Array.isArray(tx.participants) && tx.participants.length > 0 && (
                             <div className="gt-debt-notice">
                               <div className="gt-debt-message">
                                {tx.transactionType === 'payer_for_others' && (
                                  <>Bạn được <strong>{tx.payer ? (tx.payer.name || tx.payer.email || 'Người trả') : 'Chưa xác định'}</strong> trả giúp: </>
                                )}
                                {tx.transactionType === 'equal_split' && (
<>Bạn nợ <strong>{tx.payer ? (tx.payer.name || tx.payer.email || 'Người trả') : 'Chưa xác định'}</strong> (chia đều): </>
                                )}
                                {tx.transactionType === 'percentage_split' && (
                                  <>Bạn nợ <strong>{tx.payer ? (tx.payer.name || tx.payer.email || 'Người trả') : 'Chưa xác định'}</strong> (phần trăm): </>
                                )}
                                {!tx.transactionType && (
                                  <>Bạn nợ <strong>{tx.payer ? (tx.payer.name || tx.payer.email || 'Người trả') : 'Chưa xác định'}</strong>: </>
                                )}
                                <span className="gt-debt-amount">
                                  {userParticipation && userParticipation.shareAmount ? 
                                    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(userParticipation.shareAmount) :
                                    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(tx.amount / (totalParticipants || 1))
                                  }
                                </span>
                                {userParticipation && userParticipation.percentage && userParticipation.percentage > 0 && (
                                   <span className="gt-percentage-info"> ({userParticipation.percentage}%)</span>
                                 )}
                               </div>
                               <button 
                                className="gt-settle-btn"
                                onClick={() => handleSettle(tx._id || tx.id, (userParticipation ? (userParticipation.user ? (userParticipation.user._id || userParticipation.user) : userParticipation.email) : currentUser?.id))}
                                disabled={userParticipation ? !!userParticipation.settled : false}
                                title={userParticipation && userParticipation.settled ? 'Bạn đã đánh dấu đã trả' : 'Đánh dấu đã trả'}
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
                {editLoading ? (
                  <div style={{ padding: 20, textAlign: 'center' }}><i className="fas fa-spinner fa-spin"></i> Đang tải...</div>
                ) : null}
                
                {/* Transaction type selector for edit */}
                <div className="gt-form-group">
                  <label>Kiểu giao dịch</label>
                  <select value={editTransactionType} onChange={(e) => setEditTransactionType(e.target.value)}>
                    <option value="payer_single">Trả đơn (Chỉ tôi)</option>
                    <option value="payer_for_others">Trả giúp (Tôi trả tiền cho người khác)</option>
                    <option value="equal_split">Chia đều (Chia đều cho tất cả)</option>
                    <option value="percentage_split">Chia phần trăm (Tùy chỉnh % cho mỗi người)</option>
                  </select>
                </div>
                
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
                  <label>Số tiền</label>
                  <input 
                    type="number" 
                    value={editAmount} 
                    onChange={e => setEditAmount(e.target.value)} 
                    placeholder="Tổng số tiền của giao dịch" 
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
                    {/* Show context-sensitive preview based on editTransactionType */}
                    {editTransactionType === 'payer_for_others' && (() => {
                      const per = Number(editAmount || 0);
                      const count = editSelectedMembers.length;
                      const totalOwed = per * count;
                      return (
                        <>
                          <div className="gt-amount-calculation">
                            <div>Bạn đã trả:</div>
                            <div>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(per)}</div>
                            <div className="gt-equals">→</div>
                          </div>
                          <div className="gt-total-preview">
                            Mỗi người nợ: {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(per)} × {count} người = <strong>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(totalOwed)}</strong>
                          </div>
                        </>
                      );
                    })()}

                    {editTransactionType === 'equal_split' && (() => {
                      const totalParts = editSelectedMembers.length + 1; // +1 for creator
                      const per = totalParts ? Number((Number(editAmount || 0) / totalParts).toFixed(2)) : 0;
                      return (
                        <>
                          <div className="gt-amount-calculation">
                            <div>Tổng tiền:</div>
                            <div>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(editAmount || 0))}</div>
                            <div>÷</div>
                            <div>{totalParts} người</div>
                            <div className="gt-equals">=</div>
                          </div>
                          <div className="gt-total-preview">
                            Mỗi người (bao gồm bạn): <strong>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(per)}</strong>
                          </div>
                        </>
                      );
                    })()}

                    {editTransactionType === 'percentage_split' && (
                      <div className="gt-total-preview">
                        Tổng tiền: <strong>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(editAmount || 0))}</strong> — Vui lòng điều chỉnh % bên dưới để xem số tiền từng người.
                      </div>
                    )}

                    {editTransactionType === 'payer_single' && (
                      <div className="gt-total-preview">
                        Trả đơn: Bạn chịu toàn bộ <strong>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(editAmount || 0))}</strong>
                      </div>
                    )}
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

                {/* Percentage editor (same as create) */}
                {editTransactionType === 'percentage_split' && (
                  <div className="percentage-table" style={{ marginTop: 12 }}>
                    <div className="percentage-table-header">
                      <div>Thành viên</div>
                      <div>%</div>
                      <div>Số tiền</div>
                    </div>
                    <div className="percentage-table-body">
                      {(percentages || []).map((p, idx) => (
                        <div key={String(p.email || p.id || idx)} className="percentage-table-row">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 36, height: 36, borderRadius: 8, background: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                              {(p.name || '').charAt(0).toUpperCase() || 'U'}
                            </div>
                            <div>
                              <div style={{ fontWeight: 700 }}>{p.name || p.email || 'Người dùng'}</div>
                              <div style={{ fontSize: 12, color: '#64748b' }}>{p.email || ''}</div>
                            </div>
                          </div>
                          <div>
                            <div className={`percentage-input-wrapper ${percentTotalError ? 'error' : ''}`}>
                              <input
                                className="percentage-input"
                                type="number"
                                min="0"
                                max="100"
                                step="0.01"
                                value={p.percentage}
                                onChange={(e) => changePercentage(idx, e.target.value)}
                              />
                              <span className="percentage-symbol">%</span>
                            </div>
                          </div>
                          <div style={{ textAlign: 'right', fontWeight: 700 }}>
                            {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(((Number(p.percentage || 0) / 100) * Number(editAmount || 0)) || 0)}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div className={`percentage-total ${percentTotalError ? 'error' : 'success'}`} style={{ padding: '6px 10px' }}>
                        Tổng: {(percentages || []).reduce((s, x) => s + Number(x.percentage || 0), 0)}%
                      </div>
                      {percentTotalError && <div style={{ color: '#b91c1c', fontSize: 13 }}>{percentTotalError}</div>}
                    </div>
                  </div>
                )}

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
                  {isDeleting ? 'Đang xóa...' : 'Xóa giao dịch'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Optimize Debt Modal */}
        {showOptimizeModal && (
          <div className="gt-modal-overlay">
            <div className="gt-optimize-modal">
              <div className="gt-modal-header">
                <h3>Tối ưu hóa thanh toán</h3>
                <button className="gt-modal-close" onClick={() => setShowOptimizeModal(false)}>×</button>
              </div>
              
              <div className="gt-modal-body">
                <div className="gt-optimize-info">
                  <p>
                    <i className="fas fa-magic"></i>
                    Tối ưu hóa thanh toán giúp giảm số lượng giao dịch cần thiết để cân bằng tất cả các khoản nợ trong nhóm.
                  </p>
                  {optimizedTransactions.length > 0 && (
                    <div className="gt-optimize-stats">
                      <div className="gt-stat">
                        <div className="gt-stat-value">{optimizedTransactions.length}</div>
                        <div className="gt-stat-label">Giao dịch tối ưu</div>
                      </div>
                    </div>
                  )}
                </div>

                {loadingOptimized ? (
                  <div className="gt-empty-message">
                    <div className="loading-spinner"></div>
                    <p>Đang tính toán tối ưu hóa...</p>
                  </div>
                ) : optimizeError ? (
                  <div className="gt-error-message">
                    <i className="fas fa-exclamation-circle"></i>
                    <p>Lỗi tối ưu hóa</p>
                    <p className="gt-sub-message">{optimizeError}</p>
                    <button className="gt-retry-btn" onClick={fetchOptimizedTransactions}>Thử lại</button>
                  </div>
                ) : optimizedTransactions.length === 0 ? (
                  <div className="gt-empty-message">
                    <i className="fas fa-check-circle"></i>
                    <p>Tất cả đã cân bằng!</p>
                    <p className="gt-sub-message">Không có khoản nợ nào cần tối ưu hóa.</p>
                  </div>
                ) : (
                  <div className="gt-optimized-list">
                    <div className="gt-optimized-header">
                      <div className="gt-check-col">
                        <input
                          type="checkbox"
                          checked={selectedOptimized.length === optimizedTransactions.length}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedOptimized(optimizedTransactions.map((_, idx) => idx));
                            else setSelectedOptimized([]);
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
                )}
              </div>
              
              <div className="gt-modal-footer">
                <button className="gt-cancel-btn" onClick={() => setShowOptimizeModal(false)}>Đóng</button>
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