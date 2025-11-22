import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
// eslint-disable-next-line no-unused-vars
import FamilySidebar from './FamilySidebar';
import './FamilyTransactions.css';
import { showNotification } from '../utils/notify';

export default function FamilyTransactions() {
	const navigate = useNavigate();
	const [activeTab, setActiveTab] = useState('expense'); // 'income' or 'expense'
	const [transactions, setTransactions] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [categories, setCategories] = useState([]);
	const [loadingCategories, setLoadingCategories] = useState(false);
	
	// Form state
	const [showForm, setShowForm] = useState(false);
	const [formData, setFormData] = useState({
		type: 'expense', // 'income' or 'expense'
		amount: '',
		category: '',
		description: '',
		transactionScope: 'personal', // 'personal' or 'family'
		date: new Date().toISOString().split('T')[0]
	});
	const [saving, setSaving] = useState(false);
	
	// Edit state
	const [showEditModal, setShowEditModal] = useState(false);
	const [editingTransaction, setEditingTransaction] = useState(null);
	const [editFormData, setEditFormData] = useState({
		type: '',
		amount: '',
		category: '',
		description: '',
		transactionScope: '',
		date: ''
	});
	const [updating, setUpdating] = useState(false);
	
	// Delete state
	const [showDeleteModal, setShowDeleteModal] = useState(false);
	const [deletingTransaction, setDeletingTransaction] = useState(null);
	const [deleting, setDeleting] = useState(false);
	
	// Pagination state
	const [currentPage, setCurrentPage] = useState(1);
	const [totalPages, setTotalPages] = useState(1);
	const [totalItems, setTotalItems] = useState(0);
	const [pageSize] = useState(5); // Hiển thị 5 giao dịch mới nhất mỗi trang
	
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

	// Thêm state cho currentUser
	const [currentUser, setCurrentUser] = useState(null);

	// Thêm state cho số dư
	const [familyBalance, setFamilyBalance] = useState(null);
	const [loadingBalance, setLoadingBalance] = useState(false);
	
	// Thêm state cho danh sách thành viên với số dư
	const [membersBalance, setMembersBalance] = useState([]);
	
	// Thêm state cho thông tin gia đình
	const [familyInfo, setFamilyInfo] = useState(null);
	
	// Lấy danh mục từ API
	const fetchCategories = useCallback(async () => {
		if (!token) return;
		setLoadingCategories(true);
		try {
			const res = await fetch(`${API_BASE}/api/categories`, { 
				headers: { Authorization: `Bearer ${token}` } 
			});
			if (!res.ok) return;
			const data = await res.json();
			setCategories(data);
		} catch (err) {
			console.error("Error fetching categories:", err);
		} finally {
			setLoadingCategories(false);
		}
	}, [token, API_BASE]);

	// Lấy giao dịch từ API với API mới
	const fetchTransactions = useCallback(async () => {
		if (!token || !selectedFamilyId) return;
		setLoading(true);
		setError('');
		try {
			// Sử dụng API mới với phân trang và filter theo loại
			// thêm excludeActivities=true để bỏ các hoạt động nạp/rút (tag 'transfer')
			const res = await fetch(`${API_BASE}/api/family/${selectedFamilyId}/transactions?type=${activeTab}&page=${currentPage}&limit=${pageSize}&excludeActivities=true`, {
				headers: { Authorization: `Bearer ${token}` }
			});
			
			if (!res.ok) {
				throw new Error('Không thể tải giao dịch');
			}
			
			const data = await res.json();
			
			// Xử lý dữ liệu phân trang từ API mới
			if (data && data.transactions) {
				setTransactions(data.transactions);
				if (data.pagination) {
					setTotalPages(data.pagination.totalPages || 1);
					setTotalItems(data.pagination.totalItems || 0);
				}
			} else {
				setTransactions(Array.isArray(data) ? data : []);
			}
		} catch (err) {
			console.error("Error fetching transactions:", err);
			setError(err.message);
		} finally {
			setLoading(false);
		}
	}, [token, selectedFamilyId, API_BASE, activeTab, currentPage, pageSize]);

	// Lấy số dư từ API
	const fetchBalance = useCallback(async () => {
		if (!token || !selectedFamilyId) return;
		setLoadingBalance(true);
		try {
			const res = await fetch(`${API_BASE}/api/family/${selectedFamilyId}/balance`, {
				headers: { Authorization: `Bearer ${token}` }
			});
			
			if (!res.ok) {
				throw new Error('Không thể tải số dư');
			}
			
			const data = await res.json();
			setFamilyBalance(data);
			
			// Lưu danh sách thành viên với số dư
			if (data.memberBalances) {
				setMembersBalance(data.memberBalances);
			}
		} catch (err) {
			console.error("Error fetching balance:", err);
		} finally {
			setLoadingBalance(false);
		}
	}, [token, selectedFamilyId, API_BASE]);

	// Lấy thông tin gia đình từ API
	const fetchFamilyInfo = useCallback(async () => {
		if (!token || !selectedFamilyId) return;
		try {
			const res = await fetch(`${API_BASE}/api/family/${selectedFamilyId}`, {
				headers: { Authorization: `Bearer ${token}` }
			});
			
			if (!res.ok) {
				console.error("Error fetching family info");
				return;
			}
			
			const data = await res.json();
			setFamilyInfo(data);
		} catch (err) {
			console.error("Error fetching family info:", err);
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
		
		// Set current user
		setCurrentUser(getCurrentUser());
		
		fetchCategories();
		fetchTransactions();
		fetchBalance(); // Thêm fetch balance
		fetchFamilyInfo(); // Thêm fetch family info
	}, [navigate, fetchCategories, fetchTransactions, fetchBalance, fetchFamilyInfo, getCurrentUser]);

	// Cập nhật tab và reset trang
	const handleTabChange = (tab) => {
		setActiveTab(tab);
		setCurrentPage(1); // Reset về trang đầu tiên khi chuyển tab
		setFormData(prev => ({ ...prev, type: tab }));
	};

	// Tạo giao dịch mới với API mới và cập nhật số dư
	const handleCreateTransaction = async (e) => {
		e.preventDefault();
		
		if (!formData.amount || Number(formData.amount) <= 0) {
			showNotification('Vui lòng nhập số tiền hợp lệ', 'error');
			return;
		}
		
		if (!formData.category) {
			showNotification('Vui lòng chọn danh mục', 'error');
			return;
		}
		
		// Kiểm tra ví cho giao dịch cá nhân
		if (formData.transactionScope === 'personal') {
			if (!autoLinkEnabled || !defaultWallet) {
				showNotification('Vui lòng chọn ví liên kết trước khi tạo giao dịch cá nhân', 'error');
				return;
			}
		}
		
		// Kiểm tra số dư nếu là chi tiêu
		if (activeTab === 'expense') {
			const amount = Number(formData.amount);
			if (formData.transactionScope === 'family') {
				if (familyBalance && familyBalance.familyBalance < amount) {
					showNotification(`Số dư gia đình không đủ. Hiện tại: ${formatCurrency(familyBalance.familyBalance)}`, 'error');
					return;
				}
			} else {
				// Kiểm tra số dư ví thực tế
				if (defaultWallet && defaultWallet.currentBalance < amount) {
					showNotification(`Số dư ví không đủ. Hiện tại: ${formatCurrency(defaultWallet.currentBalance)}`, 'error');
					return;
				}
			}
		}
		
		setSaving(true);
		try {
			const payload = {
				...formData,
				amount: Number(formData.amount),
				familyId: selectedFamilyId,
				type: activeTab
			};
			
			// Thêm walletId nếu là giao dịch personal và có wallet được chọn
			if (formData.transactionScope === 'personal' && autoLinkEnabled && defaultWallet) {
				payload.walletId = defaultWallet._id;
			}
			
			const res = await fetch(`${API_BASE}/api/family/transactions`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`
				},
				body: JSON.stringify(payload)
			});
			
			if (!res.ok) {
				const errData = await res.json().catch(() => ({}));
				throw new Error(errData.message || 'Không thể tạo giao dịch');
			}
			
			const newTransaction = await res.json();
			
			showNotification('Giao dịch đã được tạo thành công', 'success');
			
			// Reset form
			setFormData({
				type: activeTab,
				amount: '',
				category: '',
				description: '',
				transactionScope: 'personal',
				date: new Date().toISOString().split('T')[0]
			});
			setShowForm(false);
			
			// Refresh transactions và số dư
			fetchTransactions();
			fetchBalance();
		} catch (err) {
			console.error("Error creating transaction:", err);
			showNotification(err.message || 'Đã xảy ra lỗi khi tạo giao dịch', 'error');
		} finally {
			setSaving(false);
		}
	};

	// Mở modal chỉnh sửa giao dịch
	const handleOpenEditModal = (transaction) => {
		setEditingTransaction(transaction);
		setEditFormData({
			type: transaction.type || activeTab,
			amount: transaction.amount || '',
			category: transaction.category?._id || transaction.category || '',
			description: transaction.description || '',
			transactionScope: transaction.transactionScope || 'personal',
			date: transaction.date ? new Date(transaction.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
		});
		setShowEditModal(true);
	};

	// Cập nhật giao dịch với API mới và cập nhật số dư
	const handleUpdateTransaction = async (e) => {
		e.preventDefault();
		
		if (!editingTransaction?._id) {
			showNotification('Không tìm thấy thông tin giao dịch cần cập nhật', 'error');
			return;
		}
		
		if (!editFormData.amount || Number(editFormData.amount) <= 0) {
			showNotification('Vui lòng nhập số tiền hợp lệ', 'error');
			return;
		}
		
		// Chỉ kiểm tra số dư nếu là giao dịch chi tiêu và số tiền tăng
		const oldAmount = editingTransaction.amount;
		const newAmount = Number(editFormData.amount);
		const amountDifference = newAmount - oldAmount;
		
		// Chỉ kiểm tra số dư nếu là giao dịch chi tiêu VÀ số tiền mới lớn hơn số tiền cũ
		if (editFormData.type === 'expense' && amountDifference > 0) {
			if (editFormData.transactionScope === 'family') {
				if (familyBalance && familyBalance.familyBalance < amountDifference) {
					showNotification(`Số dư gia đình không đủ để tăng số tiền thêm ${formatCurrency(amountDifference)}. Hiện tại: ${formatCurrency(familyBalance.familyBalance)}`, 'error');
					return;
				}
			} else {
				// Tìm số dư cá nhân bằng cả ID và email
				const memberBalance = familyBalance?.memberBalances?.find(m => 
					(m.userId && String(m.userId) === String(currentUser.id)) || 
					(m.userEmail && m.userEmail.toLowerCase() === currentUser.email.toLowerCase())
				);
				
				// Chỉ cần đủ tiền cho phần chênh lệch tăng thêm
				if (!memberBalance || memberBalance.balance < amountDifference) {
					const currentBalance = memberBalance ? memberBalance.balance : 0;
					showNotification(`Số dư cá nhân không đủ để tăng số tiền thêm ${formatCurrency(amountDifference)}. Hiện tại: ${formatCurrency(currentBalance)}`, 'error');
					return;
				}
			}
		}
		
		setUpdating(true);
		try {
			const payload = {
				...editFormData,
				amount: newAmount
			};
			
			const res = await fetch(`${API_BASE}/api/family/transactions/${editingTransaction._id}`, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`
				},
				body: JSON.stringify(payload)
			});
			
			if (!res.ok) {
				const errData = await res.json().catch(() => ({}));
				throw new Error(errData.message || 'Không thể cập nhật giao dịch');
			}
			
			showNotification('Giao dịch đã được cập nhật thành công', 'success');
			setShowEditModal(false);
			
			// Refresh transactions và số dư
			fetchTransactions();
			fetchBalance();
		} catch (err) {
			console.error("Error updating transaction:", err);
			showNotification(err.message || 'Đã xảy ra lỗi khi cập nhật giao dịch', 'error');
		} finally {
			setUpdating(false);
		}
	};

	// Mở modal xác nhận xóa giao dịch
	const handleOpenDeleteModal = (transaction) => {
		setDeletingTransaction(transaction);
		setShowDeleteModal(true);
	};

	// Xóa giao dịch với API mới và cập nhật số dư
	const handleDeleteTransaction = async () => {
		if (!deletingTransaction?._id) {
			showNotification('Không tìm thấy thông tin giao dịch cần xóa', 'error');
			return;
		}
		
		setDeleting(true);
		try {
			const res = await fetch(`${API_BASE}/api/family/transactions/${deletingTransaction._id}`, {
				method: 'DELETE',
				headers: {
					Authorization: `Bearer ${token}`
				}
			});
			
			if (!res.ok) {
				const errData = await res.json().catch(() => ({}));
				throw new Error(errData.message || 'Không thể xóa giao dịch');
			}
			
			showNotification('Giao dịch đã được xóa thành công', 'success');
			setShowDeleteModal(false);
			
			// Refresh transactions và số dư
			fetchTransactions();
			fetchBalance();
		} catch (err) {
			console.error("Error deleting transaction:", err);
			showNotification(err.message || 'Đã xảy ra lỗi khi xóa giao dịch', 'error');
		} finally {
			setDeleting(false);
		}
	};

	// Format currency
	const formatCurrency = (amount) => {
		return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
	};

	// Get category info
	const getCategoryInfo = (categoryId) => {
		if (typeof categoryId === 'object' && categoryId !== null) {
			return { 
				name: categoryId.name || 'Không có tên', 
				icon: categoryId.icon || '📝' 
			};
		}
		const cat = categories.find(c => c._id === categoryId);
		return cat || { name: 'Không có', icon: '📝' };
	};

	// Render transaction item component
	const renderTransactionItem = (transaction) => {
		const category = getCategoryInfo(transaction.category);
		const hasVerifiedReceipts = receiptCounts[transaction._id] > 0;
		return (
			<div key={transaction._id} className="ft-transaction-item">
				<div className="ft-transaction-icon">
					<i className={`fas ${transaction.type === 'expense' ? 'fa-arrow-up' : 'fa-arrow-down'}`}></i>
				</div>
				
				<div className="ft-transaction-content">
					<div className="ft-transaction-header">
						<div className="ft-transaction-title">
							{transaction.description || 'Giao dịch'}
						</div>
						<div className={`ft-transaction-amount ${transaction.type === 'expense' ? 'expense' : 'income'}`}>
							{transaction.type === 'expense' ? '-' : '+'}{formatCurrency(transaction.amount)}
						</div>
					</div>
					
					<div className="ft-transaction-meta">
						<span className="ft-category-badge">
							{category.icon} {category.name}
						</span>
						<span className="ft-date">
							<i className="fas fa-calendar-alt"></i> {formatDate(transaction.date || transaction.createdAt)}
						</span>
						{transaction.creatorName && (
							<span className="ft-creator">
								<i className="fas fa-user"></i> {transaction.creatorName}
								{transaction.creatorRole && (
									<span className="ft-creator-role">({transaction.creatorRole})</span>
								)}
							</span>
						)}
					</div>
				</div>
				
				<div className="ft-transaction-actions">
					{/* Chỉ hiện nút Ảnh hóa đơn nếu có ảnh liên kết đã xác minh */}
					{transaction.type === 'expense' && hasVerifiedReceipts && (
						<button
							className="ft-action-btn link"
							title="Xem ảnh hóa đơn"
							onClick={() => fetchLinkedReceipts(transaction)}
							style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
						>
							<i className="fas fa-image"></i> Ảnh hóa đơn
						</button>
					)}
					{/* Chỉ hiện nút sửa/xóa nếu người dùng hiện tại là người tạo */}
					{currentUser && transaction.createdBy &&
					 (transaction.createdBy._id || transaction.createdBy.id || transaction.createdBy) === currentUser.id && (
						<>
							<button 
								className="ft-action-btn edit"
								onClick={() => handleOpenEditModal(transaction)}
								title="Chỉnh sửa giao dịch"
							>
								<i className="fas fa-edit"></i> Sửa
							</button>
							<button 
								className="ft-action-btn delete"
								onClick={() => handleOpenDeleteModal(transaction)}
								title="Xóa giao dịch"
							>
								<i className="fas fa-trash"></i> Xóa
							</button>
						</>
					)}
				</div>
			</div>
		);
	};

	// Get filtered categories based on transaction type
	const getFilteredCategories = (type = activeTab) => {
		// Lọc danh mục theo loại giao dịch và chỉ lấy danh mục của system và admin
		return categories.filter(cat => 
			cat.type === type && 
			(cat.createdBy === 'system' || cat.createdBy === 'admin')
		);
	};

	// Xử lý chuyển trang
	const handlePageChange = (page) => {
		if (page < 1 || page > totalPages) return;
		setCurrentPage(page);
	};

	// Format date
	const formatDate = (dateString) => {
		if (!dateString) return '';
		const date = new Date(dateString);
		if (isNaN(date.getTime())) return '';
		
		return date.toLocaleDateString('vi-VN', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	};

	// Tìm số dư cá nhân của người dùng hiện tại
	const getCurrentUserBalance = () => {
		if (!familyBalance || !currentUser) return 0;
		
		// Cải thiện việc tìm kiếm - kiểm tra cả ID và email
		const memberBalance = familyBalance.memberBalances.find(m => 
			(m.userId && String(m.userId) === String(currentUser.id)) || 
			(m.userEmail && m.userEmail.toLowerCase() === currentUser.email.toLowerCase())
		);
		
		console.log("Current User ID:", currentUser.id);
		console.log("Current User Email:", currentUser.email);
		console.log("Available Member Balances:", familyBalance.memberBalances);
		
		return memberBalance ? memberBalance.balance : 0;
	};

	// Thêm hàm kiểm tra owner
	const isOwner = useCallback(() => {
		if (!currentUser || !familyInfo) return false;
		
		// So sánh ID owner với ID người dùng hiện tại
		const ownerId = familyInfo.owner && (familyInfo.owner._id || familyInfo.owner.id || familyInfo.owner);
		return String(ownerId) === String(currentUser.id);
	}, [currentUser, familyInfo]);

	// Thêm state để quản lý chi tiết thành viên và giao dịch của thành viên
	const [selectedMember, setSelectedMember] = useState(null);
	const [memberTransactions, setMemberTransactions] = useState([]);
	const [loadingMemberTransactions, setLoadingMemberTransactions] = useState(false);
	const [showMemberDetail, setShowMemberDetail] = useState(false);

	// Thêm hàm lấy thông tin giao dịch của thành viên
	const fetchMemberTransactions = async (memberId, memberEmail) => {
		if (!token || !selectedFamilyId || (!memberId && !memberEmail)) return;
		
		setLoadingMemberTransactions(true);
		try {
			// Xây dựng query params
			const params = new URLSearchParams();
			params.append('limit', '10'); // Giới hạn số lượng giao dịch
		
			// Đảm bảo memberId là string
			const userIdStr = memberId && typeof memberId === 'object' ? (memberId._id || memberId.id || memberId) : memberId;
			if (userIdStr) params.append('userId', userIdStr);
			if (memberEmail) params.append('userEmail', memberEmail);
			params.append('transactionScope', 'personal');
		
			const res = await fetch(`${API_BASE}/api/family/${selectedFamilyId}/member-transactions?${params}`, {
				headers: { Authorization: `Bearer ${token}` }
			});
			
			if (!res.ok) {
				throw new Error('Không thể tải giao dịch của thành viên');
			}
			
			const data = await res.json();
			setMemberTransactions(data.transactions || []);
		} catch (err) {
			console.error("Error fetching member transactions:", err);
			setMemberTransactions([]);
		} finally {
			setLoadingMemberTransactions(false);
		}
	};

	// Thêm hàm xử lý khi chọn xem chi tiết một thành viên
	const handleViewMemberDetail = (member) => {
		setSelectedMember(member);
		// Đảm bảo truyền memberId dưới dạng string
		const memberId = member.userId && typeof member.userId === 'object' ? (member.userId._id || member.userId.id || member.userId) : member.userId;
		fetchMemberTransactions(memberId, member.userEmail);
		setShowMemberDetail(true);
	};

	// Hàm lấy vai trò của thành viên từ familyInfo
	const getMemberRole = (memberId, memberEmail) => {
		if (!familyInfo || !familyInfo.members) return 'Thành viên';
		
		const member = familyInfo.members.find(m => {
			// Xử lý trường hợp m.user là object hoặc string
			const userId = m.user && typeof m.user === 'object' ? (m.user._id || m.user.id || m.user) : m.user;
			const matchesUserId = userId && String(userId) === String(memberId);
			
			// Xử lý email
			const matchesEmail = m.email && memberEmail && m.email.toLowerCase() === memberEmail.toLowerCase();
			
			return matchesUserId || matchesEmail;
		});
		
		if (!member) return 'Thành viên';
		
		// Trả về vai trò từ database, nếu không có thì mặc định là 'Thành viên'
		return member.familyRole || 'Thành viên';
	};


	// Wallet linking state
	const [userWallets, setUserWallets] = useState([]);
	const [loadingWallets, setLoadingWallets] = useState(false);
	
	// Auto-link wallet state
	const [showAutoLinkModal, setShowAutoLinkModal] = useState(false);
	const [defaultWallet, setDefaultWallet] = useState(null);
	const [autoLinkEnabled, setAutoLinkEnabled] = useState(false);
	
	// Transfer to family state
	const [showTransferModal, setShowTransferModal] = useState(false);
	const [transferAmount, setTransferAmount] = useState('');
	const [transferDescription, setTransferDescription] = useState('');
	const [isTransferring, setIsTransferring] = useState(false);
	
	// Transfer from family state
	const [showTransferFromModal, setShowTransferFromModal] = useState(false);
	const [transferFromAmount, setTransferFromAmount] = useState('');
	const [transferFromDescription, setTransferFromDescription] = useState('');
	const [isTransferringFrom, setIsTransferringFrom] = useState(false);

	// Load auto-link settings from localStorage - FIX: Lưu theo cả userId để mỗi người có ví riêng
	useEffect(() => {
		if (!selectedFamilyId || !currentUser?.id) return;
		
		// Lưu theo cả familyId và userId để mỗi người có ví riêng
		const walletKey = `family_${selectedFamilyId}_user_${currentUser.id}_defaultWallet`;
		const enabledKey = `family_${selectedFamilyId}_user_${currentUser.id}_autoLink`;
		
		const savedWallet = localStorage.getItem(walletKey);
		const savedEnabled = localStorage.getItem(enabledKey);
		
		if (savedWallet) {
			try {
				setDefaultWallet(JSON.parse(savedWallet));
			} catch (e) {
				console.error('Error parsing saved wallet:', e);
			}
		}
		
		if (savedEnabled) {
			setAutoLinkEnabled(savedEnabled === 'true');
		}
	}, [selectedFamilyId, currentUser?.id]);

	// Save auto-link settings - FIX: Lưu theo cả userId để mỗi người có ví riêng
	const saveAutoLinkSettings = (wallet, enabled) => {
		if (!selectedFamilyId || !currentUser?.id) return;
		
		// Lưu theo cả familyId và userId để mỗi người có ví riêng
		const walletKey = `family_${selectedFamilyId}_user_${currentUser.id}_defaultWallet`;
		const enabledKey = `family_${selectedFamilyId}_user_${currentUser.id}_autoLink`;
		
		if (wallet) {
			localStorage.setItem(walletKey, JSON.stringify(wallet));
		} else {
			localStorage.removeItem(walletKey);
		}
		
		localStorage.setItem(enabledKey, String(enabled));
		setDefaultWallet(wallet);
		setAutoLinkEnabled(enabled);
	};

	// Open auto-link setup modal
	const handleOpenAutoLinkModal = () => {
		setShowAutoLinkModal(true);
		fetchUserWallets();
	};

	// Reset member balance to 0
	const resetMemberBalance = async () => {
		if (!selectedFamilyId) return;
		
		try {
			const res = await fetch(`${API_BASE}/api/family/${selectedFamilyId}/reset-member-balance`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`
				}
			});
			
			if (!res.ok) {
				throw new Error('Không thể reset số dư');
			}
			
			const data = await res.json();
			
			// Refresh balance
			fetchBalance();
			
			return data;
		} catch (err) {
			console.error('Error resetting member balance:', err);
			showNotification('Không thể reset số dư cá nhân', 'error');
		}
	};

	// Sync wallet balance to family
	const syncWalletBalance = async (walletId) => {
		if (!selectedFamilyId || !walletId) return;
		
		try {
			const res = await fetch(`${API_BASE}/api/family/${selectedFamilyId}/sync-wallet-balance`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`
				},
				body: JSON.stringify({ walletId })
			});
			
			if (!res.ok) {
				throw new Error('Không thể đồng bộ số dư');
			}
			
			const data = await res.json();
			
			// Refresh balance
			fetchBalance();
			
			return data;
		} catch (err) {
			console.error('Error syncing wallet balance:', err);
			showNotification('Không thể đồng bộ số dư từ ví', 'error');
		}
	};

	// Set default wallet for auto-linking
	const handleSetDefaultWallet = async (wallet) => {
		saveAutoLinkSettings(wallet, true);
		
		// Auto sync balance when setting default wallet
		await syncWalletBalance(wallet._id);
		
		setShowAutoLinkModal(false);
		showNotification(`Đã cài đặt ví mặc định: ${wallet.name} và đồng bộ số dư`, 'success');
	};

	// Disconnect wallet
	const handleDisconnectWallet = async () => {
		if (!window.confirm('Bạn có chắc muốn ngắt kết nối với ví này? Số dư cá nhân sẽ được reset về 0.')) {
			return;
		}
		
		// Reset balance về 0
		await resetMemberBalance();
		
		// Xóa cài đặt
		saveAutoLinkSettings(null, false);
		
		showNotification('Đã ngắt kết nối ví và reset số dư về 0', 'info');
	};

	// Fetch user wallets
	const fetchUserWallets = useCallback(async () => {
		if (!token) return;
		setLoadingWallets(true);
		try {
			const res = await fetch(`${API_BASE}/api/family/wallets/user`, {
				headers: { Authorization: `Bearer ${token}` }
			});
			
			if (!res.ok) {
				throw new Error('Không thể tải danh sách ví');
			}
			
			const data = await res.json();
			setUserWallets(data);
			
			// Cập nhật defaultWallet nếu nó có trong danh sách - FIX: Lưu theo userId
			if (defaultWallet && currentUser?.id) {
				const updatedWallet = data.find(w => w._id === defaultWallet._id);
				if (updatedWallet) {
					setDefaultWallet(updatedWallet);
					// Cập nhật localStorage với key bao gồm userId
					const walletKey = `family_${selectedFamilyId}_user_${currentUser.id}_defaultWallet`;
					localStorage.setItem(walletKey, JSON.stringify(updatedWallet));
				}
			}
		} catch (err) {
			console.error("Error fetching user wallets:", err);
			showNotification('Không thể tải danh sách ví', 'error');
		} finally {
			setLoadingWallets(false);
		}
	}, [token, API_BASE, defaultWallet, selectedFamilyId]);

	// Handle transfer to family
	const handleTransferToFamily = async (e) => {
		e.preventDefault();
		
		if (!transferAmount || Number(transferAmount) <= 0) {
			showNotification('Vui lòng nhập số tiền hợp lệ', 'error');
			return;
		}
		
		if (!defaultWallet) {
			showNotification('Vui lòng chọn ví trước', 'error');
			return;
		}
		
		const amount = Number(transferAmount);
		if (defaultWallet.currentBalance < amount) {
			showNotification(`Số dư ví không đủ. Hiện tại: ${formatCurrency(defaultWallet.currentBalance)}`, 'error');
			return;
		}
		
		setIsTransferring(true);
		try {
			const res = await fetch(`${API_BASE}/api/family/${selectedFamilyId}/transfer-to-family`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`
				},
				body: JSON.stringify({
					amount,
					walletId: defaultWallet._id,
					description: transferDescription || 'Chuyển tiền vào quỹ gia đình'
				})
			});
			
			if (!res.ok) {
				const errData = await res.json().catch(() => ({}));
				throw new Error(errData.message || 'Không thể chuyển tiền');
			}
			
			const data = await res.json();
			
			showNotification(`Đã chuyển ${formatCurrency(amount)} vào quỹ gia đình`, 'success');
			
			// Reset form
			setTransferAmount('');
			setTransferDescription('');
			setShowTransferModal(false);
			
			// Refresh data
			await Promise.all([
				fetchBalance(),
				fetchUserWallets(), // Đây sẽ tự động cập nhật defaultWallet
				fetchTransactions()
			]);
		} catch (err) {
			console.error("Error transferring to family:", err);
			showNotification(err.message || 'Đã xảy ra lỗi khi chuyển tiền', 'error');
		} finally {
			setIsTransferring(false);
		}
	};

	// Handle transfer from family
	const handleTransferFromFamily = async (e) => {
		e.preventDefault();
		
		if (!transferFromAmount || Number(transferFromAmount) <= 0) {
			showNotification('Vui lòng nhập số tiền hợp lệ', 'error');
			return;
		}
		
		if (!defaultWallet) {
			showNotification('Vui lòng chọn ví trước', 'error');
			return;
		}
		
		const amount = Number(transferFromAmount);
		if (familyBalance && familyBalance.familyBalance < amount) {
			showNotification(`Số dư quỹ gia đình không đủ. Hiện tại: ${formatCurrency(familyBalance.familyBalance)}`, 'error');
			return;
		}
		
		setIsTransferringFrom(true);
		try {
			const res = await fetch(`${API_BASE}/api/family/${selectedFamilyId}/transfer-from-family`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`
				},
				body: JSON.stringify({
					amount,
					walletId: defaultWallet._id,
					description: transferFromDescription || 'Nhận tiền từ quỹ gia đình'
				})
			});
			
			if (!res.ok) {
				const errData = await res.json().catch(() => ({}));
				throw new Error(errData.message || 'Không thể chuyển tiền');
			}
			
			const data = await res.json();
			
			showNotification(`Đã nhận ${formatCurrency(amount)} từ quỹ gia đình`, 'success');
			
			// Reset form
			setTransferFromAmount('');
			setTransferFromDescription('');
			setShowTransferFromModal(false);
			
			// Refresh data
			await Promise.all([
				fetchBalance(),
				fetchUserWallets(), // Đây sẽ tự động cập nhật defaultWallet
				fetchTransactions()
			]);
		} catch (err) {
			console.error("Error transferring from family:", err);
			showNotification(err.message || 'Đã xảy ra lỗi khi chuyển tiền', 'error');
		} finally {
			setIsTransferringFrom(false);
		}
	};

	// Activities state (activity table modal)
	const [showActivityModal, setShowActivityModal] = useState(false);
	const [activities, setActivities] = useState([]);
	const [loadingActivities, setLoadingActivities] = useState(false);

	// View single transaction modal
	const [viewTransaction, setViewTransaction] = useState(null);
	const [showViewModal, setShowViewModal] = useState(false);

	// Fetch family-scope activities (for activity table)
	const fetchActivities = useCallback(async () => {
		if (!token || !selectedFamilyId) return;
		setLoadingActivities(true);
		try {
			// request only transfer activities (nạp/rút) for the family
			const res = await fetch(`${API_BASE}/api/family/${selectedFamilyId}/transactions?transactionScope=family&includeActivities=true&limit=200&page=1`, {
				headers: { Authorization: `Bearer ${token}` }
			});
			if (!res.ok) throw new Error('Không thể tải hoạt động');
			const data = await res.json();
			// API trả về { transactions: [...] } theo route hiện tại
			setActivities(data.transactions || data || []);
		} catch (err) {
			console.error("Error fetching activities:", err);
			showNotification(err.message || 'Lỗi khi tải hoạt động', 'error');
			setActivities([]);
		} finally {
			setLoadingActivities(false);
		}
	}, [token, selectedFamilyId, API_BASE]);

	// Open activity modal and load activities
	const openActivityModal = async () => {
		setShowActivityModal(true);
		await fetchActivities();
	};

	// View transaction details
	const handleViewTransaction = (tx) => {
		setViewTransaction(tx);
		setShowViewModal(true);
	};

	// Thêm state cho modal ảnh hóa đơn liên kết
	const [showReceiptsModal, setShowReceiptsModal] = useState(false);
	const [linkedReceipts, setLinkedReceipts] = useState([]);
	const [loadingReceipts, setLoadingReceipts] = useState(false);

	// Hàm lấy ảnh hóa đơn liên kết với giao dịch
	const fetchLinkedReceipts = async (transaction) => {
		if (!token || !selectedFamilyId || !transaction?._id) return;
		setLoadingReceipts(true);
		try {
			const res = await fetch(`${API_BASE}/api/family/${selectedFamilyId}/transactions/${transaction._id}/receipts`, {
				headers: { Authorization: `Bearer ${token}` }
			});
			if (!res.ok) throw new Error('Không thể tải ảnh hóa đơn');
			const data = await res.json();
			setLinkedReceipts(data.receiptImages || []);
			setShowReceiptsModal(true);
		} catch (err) {
			console.error('Error fetching linked receipts:', err);
			setLinkedReceipts([]);
			setShowReceiptsModal(true);
		} finally {
			setLoadingReceipts(false);
		}
	};

	// Thêm state lưu số lượng ảnh hóa đơn liên kết cho từng transaction
	const [receiptCounts, setReceiptCounts] = useState({});

	// Hàm lấy số lượng ảnh hóa đơn liên kết đã xác minh cho các giao dịch chi tiêu
	const fetchReceiptCounts = useCallback(async (transactionsList) => {
		const counts = {};
		const promises = transactionsList
			.filter(tx => tx.type === 'expense')
			.map(async tx => {
				try {
					const res = await fetch(`${API_BASE}/api/family/${selectedFamilyId}/transactions/${tx._id}/receipts`, {
						headers: { Authorization: `Bearer ${token}` }
					});
					if (!res.ok) return;
					const data = await res.json();
					// Chỉ đếm ảnh đã xác minh
					const verifiedCount = Array.isArray(data.receiptImages)
						? data.receiptImages.filter(img => img.isVerified).length
						: 0;
					counts[tx._id] = verifiedCount;
				} catch {
					counts[tx._id] = 0;
				}
			});
		await Promise.all(promises);
		setReceiptCounts(counts);
	}, [API_BASE, selectedFamilyId, token]);

	// Khi danh sách transactions thay đổi, gọi fetchReceiptCounts
	useEffect(() => {
		if (transactions && transactions.length > 0) {
			fetchReceiptCounts(transactions);
		} else {
			setReceiptCounts({});
		}
	}, [transactions, fetchReceiptCounts]);

	return (
		<div className="family-page">
			<FamilySidebar active="transactions" />
			
			<main className="family-main">
				<header className="ft-header">
					<h1>Giao dịch gia đình</h1>
					<p>Quản lý thu nhập và chi tiêu của gia đình</p>
					
					<div className="ft-actions">
						{/* Wallet connection status */}
						{defaultWallet && autoLinkEnabled ? (
							<div className="ft-wallet-status">
								<i className="fas fa-wallet"></i>
								<span>Đang kết nối với ví: <strong>{defaultWallet.name}</strong></span>
								<button 
									className="ft-btn-icon"
									onClick={handleOpenAutoLinkModal}
									title="Thay đổi ví"
								>
									<i className="fas fa-cog"></i>
								</button>
							</div>
						) : (
							<button 
								className="ft-btn secondary"
								onClick={handleOpenAutoLinkModal}
							>
								<i className="fas fa-wallet"></i> Chọn ví liên kết
							</button>
						)}
						
						{autoLinkEnabled && defaultWallet && (
							<>
								<button 
									className="ft-btn secondary"
									onClick={() => setShowTransferModal(true)}
								>
									<i className="fas fa-arrow-up"></i> Nạp vào quỹ
								</button>
								<button 
									className="ft-btn secondary"
									onClick={() => setShowTransferFromModal(true)}
								>
									<i className="fas fa-arrow-down"></i> Rút về ví
								</button>
							</>
						)}
						
						<button 
							className="ft-btn primary"
							onClick={() => setShowForm(true)}
						>
							<i className="fas fa-plus"></i> Thêm giao dịch
						</button>
					</div>
				</header>

				{/* Thêm card hiển thị số dư */}
				<div className="ft-balance-cards">
					<div className="ft-balance-card family">
						<div className="ft-balance-icon">
							<i className="fas fa-home"></i>
						</div>
						<div className="ft-balance-info">
							<div className="ft-balance-label">Số dư gia đình</div>
							<div className="ft-balance-amount">
								{loadingBalance ? (
									<div className="ft-loading-spinner small"></div>
								) : (
									formatCurrency(familyBalance?.familyBalance || 0)
								)}
							</div>
						</div>

						{/* nút Hoạt động */}
						<div style={{ marginLeft: 16 }}>
							<button
								className="ft-btn secondary"
								onClick={openActivityModal}
							>
								<i className="fas fa-list"></i> Hoạt động
							</button>
						</div>
					</div>
					
					<div className="ft-balance-card personal">
						<div className="ft-balance-icon">
							<i className="fas fa-user"></i>
						</div>
						<div className="ft-balance-info">
							<div className="ft-balance-label">Số dư cá nhân</div>
							<div className="ft-balance-amount">
								{loadingBalance ? (
									<div className="ft-loading-spinner small"></div>
								) : (
									formatCurrency(getCurrentUserBalance())
								)}
							</div>
						</div>
					</div>
				</div>

				{/* Main Content Layout - 2 columns for owner, 1 column for members */}
				<div className={`ft-main-layout ${isOwner() ? 'has-sidebar' : ''}`}>
					{/* Left Sidebar - Members Balance (Owner only) */}
					{isOwner() && (
						<div className="ft-members-sidebar">
							<div className="ft-members-balance-section">
								<div className="ft-section-header">
									<h2><i className="fas fa-users-cog"></i> Quản lý số dư</h2>
									<p>Xem số dư của thành viên</p>
								</div>
								
								<div className="ft-members-balance-list">
									{loadingBalance ? (
										<div className="ft-loading">
											<div className="ft-loading-spinner"></div>
											<p>Đang tải...</p>
										</div>
									) : membersBalance.filter(member => String(member.userId) !== String(currentUser.id)).length === 0 ? (
										<div className="ft-empty-state-small">
											<i className="fas fa-users-slash"></i>
											<p>Chưa có thành viên</p>
										</div>
									) : (
										membersBalance.filter(member => String(member.userId) !== String(currentUser.id)).map(member => (
											<div key={member.userId || member.userEmail} className="ft-member-balance-card">
												<div className="ft-member-info">
													<div className="ft-member-avatar">
														{member.userName ? member.userName.charAt(0).toUpperCase() : 'U'}
													</div>
													<div className="ft-member-details">
														<div className="ft-member-name">
															{member.userName || 'Thành viên'}
															<span className="ft-member-role">{getMemberRole(member.userId, member.userEmail)}</span>
														</div>
														<div className="ft-member-email">{member.userEmail || ''}</div>
													</div>
												</div>
												<div className="ft-member-balance">
													<div className="ft-balance-label">Số dư</div>
													<div className={`ft-balance-amount ${member.balance >= 0 ? 'positive' : 'negative'}`}>
														{formatCurrency(member.balance)}
													</div>
													<button 
														className="ft-view-member-btn"
														onClick={() => handleViewMemberDetail(member)}
													>
														<i className="fas fa-eye"></i> Chi tiết
													</button>
												</div>
											</div>
										))
									)}
								</div>
							</div>
						</div>
					)}

					{/* Right Content - Transaction List */}
					<div className="ft-content-wrapper">
						{/* Transaction Type Tabs */}
						<div className="ft-tabs">
							<button 
								className={`ft-tab ${activeTab === 'expense' ? 'active' : ''}`}
								onClick={() => handleTabChange('expense')}
							>
								<i className="fas fa-arrow-up"></i> Chi tiêu
							</button>
							<button 
								className={`ft-tab ${activeTab === 'income' ? 'active' : ''}`}
								onClick={() => handleTabChange('income')}
							>
								<i className="fas fa-arrow-down"></i> Thu nhập
							</button>
						</div>

						<div className="ft-content">
						{loading ? (
							<div className="ft-loading">
								<div className="ft-loading-spinner"></div>
								<p>Đang tải giao dịch...</p>
							</div>
						) : error ? (
							<div className="ft-error">
								<i className="fas fa-exclamation-triangle"></i>
								<p>{error}</p>
								<button onClick={fetchTransactions} className="ft-retry-btn">
									Thử lại
								</button>
							</div>
						) : (
							<>
								{transactions.length === 0 ? (
									<div className="ft-empty-state">
										<i className={`fas ${activeTab === 'expense' ? 'fa-receipt' : 'fa-money-bill-wave'}`}></i>
										<h3>Chưa có giao dịch {activeTab === 'expense' ? 'chi tiêu' : 'thu nhập'}</h3>
										<p>Bắt đầu thêm giao dịch đầu tiên của bạn</p>
										<button 
											className="ft-btn primary"
											onClick={() => setShowForm(true)}
										>
											<i className="fas fa-plus"></i> Thêm giao dịch
										</button>
									</div>
								) : (
									<>
										{currentPage === 1 && totalPages > 1 && (
											<div style={{
												padding: '12px 16px',
												margin: '8px',
												background: 'linear-gradient(135deg, rgba(42, 82, 152, 0.1) 0%, rgba(78, 205, 196, 0.1) 100%)',
												borderRadius: '12px',
												border: '1px solid rgba(42, 82, 152, 0.2)',
												fontSize: '13px',
												color: '#2a5298',
												fontWeight: 600,
												display: 'flex',
												alignItems: 'center',
												gap: '8px',
												marginBottom: '8px'
											}}>
												<i className="fas fa-info-circle"></i>
												<span>Đang hiển thị 5 giao dịch mới nhất. Sử dụng nút phân trang bên dưới để xem thêm.</span>
											</div>
										)}
										
										{/* Tách giao dịch thành 2 nhóm */}
										{(() => {
											const personalTransactions = transactions.filter(tx => tx.transactionScope === 'personal');
											const familyTransactions = transactions.filter(tx => tx.transactionScope === 'family');
											
											return (
												<>
													{/* Bảng giao dịch cá nhân */}
													{personalTransactions.length > 0 && (
														<div className="ft-transactions-section">
															<div className="ft-section-title">
																<i className="fas fa-user"></i>
																<h3>Giao dịch cá nhân</h3>
																<span className="ft-section-count">({personalTransactions.length})</span>
															</div>
															<div className="ft-transactions-list">
																{personalTransactions.map(transaction => {
																	return renderTransactionItem(transaction);
																})}
															</div>
														</div>
													)}
													
													{/* Bảng giao dịch gia đình */}
													{familyTransactions.length > 0 && (
														<div className="ft-transactions-section">
															<div className="ft-section-title">
																<i className="fas fa-home"></i>
																<h3>Giao dịch gia đình</h3>
																<span className="ft-section-count">({familyTransactions.length})</span>
															</div>
															<div className="ft-transactions-list">
																{familyTransactions.map(transaction => {
																	return renderTransactionItem(transaction);
																})}
															</div>
														</div>
													)}
												</>
											);
										})()}
									</>
								)}
								
								{/* Pagination */}
								{totalPages > 1 && (
									<div className="ft-pagination">
										<button 
											className="ft-pagination-btn"
											onClick={() => handlePageChange(1)}
											disabled={currentPage === 1}
											title="Trang đầu"
										>
											<i className="fas fa-angle-double-left"></i>
											<span className="ft-pagination-btn-text">Đầu</span>
										</button>
										<button 
											className="ft-pagination-btn"
											onClick={() => handlePageChange(currentPage - 1)}
											disabled={currentPage === 1}
											title="Trang trước"
										>
											<i className="fas fa-angle-left"></i>
											<span className="ft-pagination-btn-text">Trước</span>
										</button>
										
										<div className="ft-pagination-info">
											<span className="ft-page-current">Trang {currentPage}</span>
											<span className="ft-page-separator">/</span>
											<span className="ft-page-total">{totalPages}</span>
											{currentPage === 1 && (
												<span className="ft-page-note">(5 giao dịch mới nhất)</span>
											)}
										</div>
										
										<button 
											className="ft-pagination-btn"
											onClick={() => handlePageChange(currentPage + 1)}
											disabled={currentPage === totalPages}
											title="Trang sau"
										>
											<span className="ft-pagination-btn-text">Sau</span>
											<i className="fas fa-angle-right"></i>
										</button>
										<button 
											className="ft-pagination-btn"
											onClick={() => handlePageChange(totalPages)}
											disabled={currentPage === totalPages}
											title="Trang cuối"
										>
											<span className="ft-pagination-btn-text">Cuối</span>
											<i className="fas fa-angle-double-right"></i>
										</button>
									</div>
								)}
								
								{/* Transaction count summary */}
								<div className="ft-summary">
									{currentPage === 1 ? (
										<>
											Hiển thị <strong>5 giao dịch mới nhất</strong> trong tổng số {totalItems} giao dịch {activeTab === 'expense' ? 'chi tiêu' : 'thu nhập'}
											{totalPages > 1 && (
												<span style={{ marginLeft: 8, color: '#2a5298', fontWeight: 600 }}>
													• Sử dụng nút phân trang để xem các giao dịch cũ hơn
												</span>
											)}
										</>
									) : (
										<>
											Hiển thị {transactions.length} giao dịch (trang {currentPage}/{totalPages}) trong tổng số {totalItems} giao dịch {activeTab === 'expense' ? 'chi tiêu' : 'thu nhập'}
										</>
									)}
								</div>
							</>
						)}
						</div>
					</div>
				</div>

				{/* Transaction Form Modal */}
				{showForm && (
					<div className="ft-modal-overlay">
						<div className="ft-modal">
							<div className="ft-modal-header">
								<h3>Thêm giao dịch {activeTab === 'expense' ? 'chi tiêu' : 'thu nhập'}</h3>
								<button 
									className="ft-modal-close"
									onClick={() => setShowForm(false)}
								>
									&times;
								</button>
							</div>
							
							<form onSubmit={handleCreateTransaction} className="ft-form">
								<div className="ft-form-row">
									<div className="ft-form-group">
										<label>Số tiền *</label>
										<input
											type="number"
											value={formData.amount}
											onChange={(e) => setFormData({...formData, amount: e.target.value})}
											placeholder="Nhập số tiền"
											required
											min="0"
											step="1000"
										/>
									</div>
									
									<div className="ft-form-group">
										<label>Danh mục *</label>
										<select
											value={formData.category}
											onChange={(e) => setFormData({...formData, category: e.target.value})}
											required
											disabled={loadingCategories}
										>
											<option value="">-- Chọn danh mục --</option>
											{getFilteredCategories().map(cat => (
												<option key={cat._id} value={cat._id}>
													{cat.icon} {cat.name}
												</option>
											))}
										</select>
									</div>
								</div>
								
								<div className="ft-form-row">
									<div className="ft-form-group">
										<label>Ngày *</label>
										<input
											type="date"
											value={formData.date}
											onChange={(e) => setFormData({...formData, date: e.target.value})}
											required
										/>
									</div>
									
									<div className="ft-form-group">
										<label>Loại giao dịch</label>
										<select
											value={formData.transactionScope}
											onChange={(e) => setFormData({...formData, transactionScope: e.target.value})}
										>
											<option value="personal">Cá nhân</option>
											<option value="family">Gia đình</option>
										</select>
									</div>
								</div>
								
								<div className="ft-form-group">
									<label>Mô tả</label>
									<textarea
										value={formData.description}
										onChange={(e) => setFormData({...formData, description: e.target.value})}
										placeholder="Nhập mô tả chi tiết (tùy chọn)"
										rows={3}
									/>
								</div>
								
								<div className="ft-form-actions">
									<button 
										type="button" 
										className="ft-btn secondary"
										onClick={() => setShowForm(false)}
										disabled={saving}
									>
										Hủy
									</button>
									<button 
										type="submit" 
										className="ft-btn primary"
										disabled={saving}
									>
										{saving ? (
											<>
												<i className="fas fa-spinner fa-spin"></i> Đang lưu...
											</>
										) : (
											<>
												<i className="fas fa-save"></i> Tạo giao dịch
											</>
										)}
									</button>
								</div>
							</form>
						</div>
					</div>
				)}

				{/* Edit Transaction Modal */}
				{showEditModal && (
					<div className="ft-modal-overlay">
						<div className="ft-modal">
							<div className="ft-modal-header">
								<h3>Chỉnh sửa giao dịch</h3>
								<button 
									className="ft-modal-close"
									onClick={() => setShowEditModal(false)}
								>
									&times;
								</button>
							</div>
							
							<form onSubmit={handleUpdateTransaction} className="ft-form">
								<div className="ft-form-row">
									<div className="ft-form-group">
										<label>Số tiền *</label>
										<input
											type="number"
											value={editFormData.amount}
											onChange={(e) => setEditFormData({...editFormData, amount: e.target.value})}
											placeholder="Nhập số tiền"
											required
											min="0"
											step="1000"
										/>
									</div>
									
									<div className="ft-form-group">
										<label>Danh mục *</label>
										<select
											value={editFormData.category}
											onChange={(e) => setEditFormData({...editFormData, category: e.target.value})}
											required
											disabled={loadingCategories}
										>
											<option value="">-- Chọn danh mục --</option>
											{getFilteredCategories(editFormData.type).map(cat => (
												<option key={cat._id} value={cat._id}>
													{cat.icon} {cat.name}
												</option>
											))}
										</select>
									</div>
								</div>
								
								<div className="ft-form-row">
									<div className="ft-form-group">
										<label>Ngày *</label>
										<input
											type="date"
											value={editFormData.date}
											onChange={(e) => setEditFormData({...editFormData, date: e.target.value})}
											required
										/>
									</div>
									
									<div className="ft-form-group">
										<label>Loại giao dịch</label>
										<select
											value={editFormData.transactionScope}
											onChange={(e) => setEditFormData({...editFormData, transactionScope: e.target.value})}
										>
											<option value="personal">Cá nhân</option>
											<option value="family">Gia đình</option>
										</select>
									</div>
								</div>
								
								<div className="ft-form-group">
									<label>Mô tả</label>
									<textarea
										value={editFormData.description}
										onChange={(e) => setEditFormData({...editFormData, description: e.target.value})}
										placeholder="Nhập mô tả chi tiết (tùy chọn)"
										rows={3}
									/>
								</div>
								
								<div className="ft-form-actions">
									<button 
										type="button" 
										className="ft-btn secondary"
										onClick={() => setShowEditModal(false)}
										disabled={updating}
									>
										Hủy
									</button>
									<button 
										type="submit" 
										className="ft-btn primary"
										disabled={updating}
									>
										{updating ? (
											<>
												<i className="fas fa-spinner fa-spin"></i> Đang cập nhật...
											</>
										) : (
											<>
												<i className="fas fa-save"></i> Lưu thay đổi
											</>
										)}
									</button>
								</div>
							</form>
						</div>
					</div>
				)}

				{/* Delete Confirmation Modal */}
				{showDeleteModal && (
					<div className="ft-modal-overlay">
						<div className="ft-modal">
							<div className="ft-modal-header">
								<h3>Xác nhận xóa giao dịch</h3>
								<button 
									className="ft-modal-close"
									onClick={() => setShowDeleteModal(false)}
								>
									&times;
								</button>
							</div>
							
							<div className="ft-form">
								<div className="ft-delete-confirmation">
									<i className="fas fa-exclamation-triangle"></i>
									<p>Bạn có chắc chắn muốn xóa giao dịch này?</p>
									<div className="ft-transaction-preview">
										<div className="ft-preview-label">Mô tả:</div>
										<div className="ft-preview-value">{deletingTransaction?.description || 'Giao dịch không có mô tả'}</div>
										<div className="ft-preview-label">Số tiền:</div>
										<div className="ft-preview-value">{formatCurrency(deletingTransaction?.amount || 0)}</div>
										<div className="ft-preview-label">Ngày:</div>
										<div className="ft-preview-value">{formatDate(deletingTransaction?.date || deletingTransaction?.createdAt)}</div>
									</div>
									<p className="ft-delete-warning">Lưu ý: Hành động này không thể hoàn tác!</p>
								</div>
								
								<div className="ft-form-actions">
									<button 
										type="button" 
										className="ft-btn secondary"
										onClick={() => setShowDeleteModal(false)}
										disabled={deleting}
									>
										Hủy
									</button>
									<button 
										type="button" 
										className="ft-btn danger"
										onClick={handleDeleteTransaction}
										disabled={deleting}
									>
										{deleting ? (
											<>
												<i className="fas fa-spinner fa-spin"></i> Đang xóa...
											</>
										) : (
											<>
												<i className="fas fa-trash-alt"></i> Xác nhận xóa
											</>
										)}
									</button>
								</div>
							</div>
						</div>
					</div>
				)}

				{/* Auto-link Setup Modal */}
				{showAutoLinkModal && (
					<div className="ft-modal-overlay">
						<div className="ft-modal">
							<div className="ft-modal-header">
								<h3>Chọn ví liên kết</h3>
								<button 
									className="ft-modal-close"
									onClick={() => setShowAutoLinkModal(false)}
								>
									&times;
								</button>
							</div>
							
							<div className="ft-wallet-modal-body">
								<div className="ft-auto-link-info">
									<i className="fas fa-info-circle"></i>
									<p>
										Chọn ví để liên kết với giao dịch gia đình của bạn. Số dư cá nhân sẽ được 
										đồng bộ với ví và tất cả giao dịch <strong>Cá nhân</strong> mới sẽ tự động 
										được liên kết với ví này.
									</p>
								</div>

								{/* Current status */}
								{defaultWallet && (
									<div className="ft-current-wallet">
										<h4>Ví mặc định hiện tại:</h4>
										<div className="ft-wallet-card active">
											<div className="ft-wallet-icon">
												<i className="fas fa-wallet"></i>
											</div>
											<div className="ft-wallet-info">
												<div className="ft-wallet-name">{defaultWallet.name}</div>
												<div className="ft-wallet-balance">
													Số dư: {formatCurrency(defaultWallet.currentBalance || 0)}
												</div>
											</div>
											<div className="ft-wallet-check">
												<i className="fas fa-check-circle"></i>
											</div>
										</div>
										<button
											className="ft-btn success"
											onClick={() => {
												syncWalletBalance(defaultWallet._id);
												showNotification('Đang đồng bộ số dư...', 'info');
											}}
											style={{marginTop: 12, width: '100%'}}
										>
											<i className="fas fa-sync-alt"></i> Đồng bộ số dư từ ví
										</button>
									</div>
								)}

								<h4 style={{marginTop: 24, marginBottom: 16}}>
									{defaultWallet ? 'Thay đổi ví liên kết:' : 'Chọn ví liên kết:'}
								</h4>
								
								{loadingWallets ? (
									<div className="ft-loading-inline">
										<i className="fas fa-spinner fa-spin"></i> Đang tải danh sách ví...
									</div>
								) : userWallets.length === 0 ? (
									<div className="ft-empty-wallets">
										<i className="fas fa-wallet"></i>
										<p>Bạn chưa có ví nào. Hãy tạo ví trong trang Ví của bạn.</p>
									</div>
								) : (
									<div className="ft-wallets-grid">
										{userWallets
											.filter(wallet => !defaultWallet || wallet._id !== defaultWallet._id)
											.map(wallet => (
												<div 
													key={wallet._id} 
													className="ft-wallet-card"
													onClick={() => handleSetDefaultWallet(wallet)}
													style={{ cursor: 'pointer' }}
												>
													<div className="ft-wallet-icon">
														<i className="fas fa-wallet"></i>
													</div>
													<div className="ft-wallet-info">
														<div className="ft-wallet-name">{wallet.name}</div>
														<div className="ft-wallet-balance">
															Số dư: {formatCurrency(wallet.currentBalance || 0)}
														</div>
														<div className="ft-wallet-currency">{wallet.currency || 'VND'}</div>
													</div>
													<div className="ft-wallet-select">
														<i className="fas fa-check-circle"></i>
													</div>
												</div>
											))}
									</div>
								)}
								
								{defaultWallet && userWallets.filter(w => w._id !== defaultWallet._id).length === 0 && (
									<div className="ft-no-more-wallets">
										<i className="fas fa-info-circle"></i>
										<p>Không có ví khác để thay đổi</p>
									</div>
								)}
							</div>
							
							<div className="ft-form-actions">
								{defaultWallet && (
									<button 
										type="button" 
										className="ft-btn danger"
										onClick={() => {
											setShowAutoLinkModal(false);
											handleDisconnectWallet();
										}}
									>
										<i className="fas fa-unlink"></i> Ngắt kết nối ví
									</button>
								)}
								<button 
									type="button" 
									className="ft-btn secondary"
									onClick={() => setShowAutoLinkModal(false)}
								>
									Đóng
								</button>
							</div>
						</div>
					</div>
				)}

				{/* Transfer to Family Modal */}
				{showTransferModal && (
					<div className="ft-modal-overlay">
						<div className="ft-modal">
							<div className="ft-modal-header">
								<h3>Chuyển tiền vào quỹ gia đình</h3>
								<button 
									className="ft-modal-close"
									onClick={() => {
										setShowTransferModal(false);
										setTransferAmount('');
										setTransferDescription('');
									}}
								>
									&times;
								</button>
							</div>
							
							<form onSubmit={handleTransferToFamily} className="ft-form">
								<div className="ft-transfer-info">
									<div className="ft-wallet-info-card">
										<div className="ft-wallet-icon">
											<i className="fas fa-wallet"></i>
										</div>
										<div>
											<div className="ft-wallet-name">{defaultWallet?.name}</div>
											<div className="ft-wallet-balance">
												Số dư hiện tại: {formatCurrency(defaultWallet?.currentBalance || 0)}
											</div>
										</div>
									</div>
									
									<div className="ft-transfer-arrow">
										<i className="fas fa-arrow-down"></i>
									</div>
									
									<div className="ft-family-info-card">
										<div className="ft-family-icon">
											<i className="fas fa-home"></i>
										</div>
										<div>
											<div className="ft-family-name">Quỹ gia đình</div>
											<div className="ft-family-balance">
												Số dư hiện tại: {formatCurrency(familyBalance?.familyBalance || 0)}
											</div>
										</div>
									</div>
								</div>
								
								<div className="ft-form-group">
									<label>Số tiền chuyển <span className="required">*</span></label>
									<input 
										type="number"
										className="ft-input"
										value={transferAmount}
										onChange={(e) => setTransferAmount(e.target.value)}
										placeholder="Nhập số tiền"
										min="1"
										required
									/>
								</div>
								
								<div className="ft-form-group">
									<label>Ghi chú</label>
									<textarea 
										className="ft-input"
										value={transferDescription}
										onChange={(e) => setTransferDescription(e.target.value)}
										placeholder="Ghi chú về giao dịch (tùy chọn)"
										rows="3"
									/>
								</div>
								
								<div className="ft-form-actions">
									<button 
										type="button" 
										className="ft-btn secondary"
										onClick={() => {
											setShowTransferModal(false);
											setTransferAmount('');
											setTransferDescription('');
										}}
										disabled={isTransferring}
									>
										Hủy
									</button>
									<button 
										type="submit" 
										className="ft-btn primary"
										disabled={isTransferring}
									>
										{isTransferring ? (
											<>
												<i className="fas fa-spinner fa-spin"></i> Đang chuyển...
											</>
										) : (
											<>
												<i className="fas fa-exchange-alt"></i> Chuyển tiền
											</>
										)}
									</button>
								</div>
							</form>
						</div>
					</div>
				)}

				{/* Transfer from Family Modal */}
				{showTransferFromModal && (
					<div className="ft-modal-overlay">
						<div className="ft-modal">
							<div className="ft-modal-header">
								<h3>Rút tiền từ quỹ gia đình về ví</h3>
								<button 
									className="ft-modal-close"
									onClick={() => {
										setShowTransferFromModal(false);
										setTransferFromAmount('');
										setTransferFromDescription('');
									}}
								>
									&times;
								</button>
							</div>
							
							<form onSubmit={handleTransferFromFamily} className="ft-form">
								<div className="ft-transfer-info">
									<div className="ft-family-info-card">
										<div className="ft-family-icon">
											<i className="fas fa-home"></i>
										</div>
										<div>
											<div className="ft-family-name">Quỹ gia đình</div>
											<div className="ft-family-balance">
												Số dư hiện tại: {formatCurrency(familyBalance?.familyBalance || 0)}
											</div>
										</div>
									</div>
									
									<div className="ft-transfer-arrow">
										<i className="fas fa-arrow-down"></i>
									</div>
									
									<div className="ft-wallet-info-card">
										<div className="ft-wallet-icon">
											<i className="fas fa-wallet"></i>
										</div>
										<div>
											<div className="ft-wallet-name">{defaultWallet?.name}</div>
											<div className="ft-wallet-balance">
												Số dư hiện tại: {formatCurrency(defaultWallet?.currentBalance || 0)}
											</div>
										</div>
									</div>
								</div>
								
								<div className="ft-form-group">
									<label>Số tiền rút <span className="required">*</span></label>
									<input 
										type="number"
										className="ft-input"
										value={transferFromAmount}
										onChange={(e) => setTransferFromAmount(e.target.value)}
										placeholder="Nhập số tiền"
										min="1"
										required
									/>
								</div>
								
								<div className="ft-form-group">
									<label>Ghi chú</label>
									<textarea 
										className="ft-input"
										value={transferFromDescription}
										onChange={(e) => setTransferFromDescription(e.target.value)}
										placeholder="Ghi chú về giao dịch (tùy chọn)"
										rows="3"
									/>
								</div>
								
								<div className="ft-form-actions">
									<button 
										type="button" 
										className="ft-btn secondary"
										onClick={() => {
											setShowTransferFromModal(false);
											setTransferFromAmount('');
											setTransferFromDescription('');
										}}
										disabled={isTransferringFrom}
									>
										Hủy
									</button>
									<button 
										type="submit" 
										className="ft-btn primary"
										disabled={isTransferringFrom}
									>
										{isTransferringFrom ? (
											<>
												<i className="fas fa-spinner fa-spin"></i> Đang rút...
											</>
										) : (
											<>
												<i className="fas fa-arrow-down"></i> Rút tiền
											</>
										)}
									</button>
								</div>
							</form>
						</div>
					</div>
				)}

				{/* Modal chi tiết thành viên */}
				{showMemberDetail && selectedMember && (
					<div className="ft-modal-overlay">
						<div className="ft-modal ft-member-modal">
							<div className="ft-modal-header">
								<h3>
									<i className="fas fa-user-circle"></i> 
									{selectedMember.userName || 'Thành viên'}
								</h3>
								<button 
									className="ft-modal-close"
									onClick={() => setShowMemberDetail(false)}
								>
									&times;
								</button>
							</div>
							
							<div className="ft-member-detail">
								<div className="ft-member-profile">
									<div className="ft-member-avatar-large">
										{selectedMember.userName ? selectedMember.userName.charAt(0).toUpperCase() : 'U'}
									</div>
									<div className="ft-member-info-detail">
										<h4>{selectedMember.userName || 'Thành viên'}</h4>
																				<div className="ft-member-meta">
											<div className="ft-member-meta-item">
												<i className="fas fa-envelope"></i> {selectedMember.userEmail || 'Không có email'}
											</div>
											<div className="ft-member-meta-item">
												<i className="fas fa-user-tag"></i> {getMemberRole(selectedMember.userId, selectedMember.userEmail)}
											</div>
										</div>
										
										<div className="ft-member-balance-detail">
											<div className="ft-balance-row">
												<div className="ft-balance-label">Số dư cá nhân:</div>
												<div className={`ft-balance-value ${selectedMember.balance >= 0 ? 'positive' : 'negative'}`}>
													{formatCurrency(selectedMember.balance)}
												</div>
											</div>
										</div>
									</div>
								</div>
								
								<div className="ft-member-transactions">
									<h4>
										<i className="fas fa-exchange-alt"></i> Giao dịch gần đây
									</h4>
									
									{loadingMemberTransactions ? (
										<div className="ft-loading-inline">
											<div className="ft-loading-spinner"></div>
											<p>Đang tải giao dịch...</p>
										</div>
									) : memberTransactions.length === 0 ? (
										<div className="ft-empty-state-small">
											<i className="fas fa-receipt"></i>
											<p>Chưa có giao dịch nào</p>
										</div>
									) : (
										<div className="ft-member-tx-list">
											{memberTransactions.map(tx => {
												const category = getCategoryInfo(tx.category);
												return (
													<div key={tx._id} className="ft-member-tx-item">
														<div className="ft-member-tx-icon">
															<i className={`fas ${tx.type === 'expense' ? 'fa-arrow-up' : 'fa-arrow-down'}`}></i>
														</div>
														<div className="ft-member-tx-content">
															<div className="ft-member-tx-header">
																<div className="ft-member-tx-title">{tx.description || 'Giao dịch'}</div>
																<div className={`ft-member-tx-amount ${tx.type === 'expense' ? 'expense' : 'income'}`}>
																	{tx.type === 'expense' ? '-' : '+'}{formatCurrency(tx.amount)}
																</div>
															</div>
															<div className="ft-member-tx-meta">
																<span className="ft-category-badge">
																	{category.icon} {category.name}
																</span>
																<span className="ft-date">
																	<i className="fas fa-calendar-alt"></i> {formatDate(tx.date || tx.createdAt)}
																</span>
															</div>
														</div>
													</div>
												);
											})}
										</div>
									)}
								</div>
								
															
								<div className="ft-modal-footer">
									<button 
										className="ft-btn secondary"

										onClick={() => setShowMemberDetail(false)}
									>
										<i className="fas fa-times"></i> Đóng
									</button>
								</div>
							</div>
						</div>
					</div>
				)}

				{/* Activity Table Modal */}
				{showActivityModal && (
					<div className="ft-modal-overlay">
						<div className="ft-modal ft-activity-modal">
							<div className="ft-modal-header">
								<h3><i className="fas fa-list"></i> Bảng hoạt động quỹ gia đình</h3>
								<button className="ft-modal-close" onClick={() => setShowActivityModal(false)}>&times;</button>
							</div>

							<div style={{ padding: 20 }}>
								{loadingActivities ? (
									<div className="ft-loading-inline">
										<i className="fas fa-spinner fa-spin"></i> Đang tải hoạt động...
									</div>
								) : activities.length === 0 ? (
									<div className="ft-empty-state-small">
										<i className="fas fa-info-circle"></i>
										<p>Chưa có hoạt động quỹ gia đình</p>
									</div>
								) : (
									<div className="ft-activity-table-wrap">
										<table className="ft-activity-table">
											<thead>
												<tr>
													<th>Ngày</th>
													<th>Loại</th>
													<th>Số tiền</th>
													<th>Người thực hiện</th>
													<th>Mô tả</th>
													<th>Hành động</th>
												</tr>
											</thead>
											<tbody>
												{activities.map(tx => (
													<tr key={tx._id}>
														<td>{formatDate(tx.date || tx.createdAt)}</td>
														<td>{tx.type === 'income' ? 'Nạp' : 'Rút'}</td>
														<td className={tx.type === 'income' ? 'income' : 'expense'}>
															{tx.type === 'expense' ? '-' : '+'}{formatCurrency(tx.amount)}
														</td>
														<td>{tx.creatorName || (tx.createdBy && (tx.createdBy.name || tx.createdBy.email)) || '—'}</td>
														<td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.description || ''}</td>
														<td>
															<button className="ft-btn secondary" onClick={() => handleViewTransaction(tx)}>
																<i className="fas fa-eye"></i> Xem
															</button>
														</td>
													</tr>
												))}
											</tbody>
										</table>
									</div>
								)}
							</div>

							<div className="ft-form-actions" style={{ marginTop: 0 }}>
								<button className="ft-btn secondary" onClick={() => setShowActivityModal(false)}>Đóng</button>
							</div>
						</div>
					</div>
				)}

				{/* View Transaction Modal (read-only) */}
				{showViewModal && viewTransaction && (
					<div className="ft-modal-overlay">
						<div className="ft-modal">
							<div className="ft-modal-header">
								<h3><i className="fas fa-receipt"></i> Chi tiết hoạt động</h3>
								<button className="ft-modal-close" onClick={() => setShowViewModal(false)}>&times;</button>
							</div>

							<div className="ft-form" style={{ paddingBottom: 16 }}>
								<div className="ft-transaction-preview">
									<div className="ft-preview-label">Mô tả</div>
									<div className="ft-preview-value">{viewTransaction.description || '—'}</div>

									<div className="ft-preview-label">Loại</div>
									<div className="ft-preview-value">{viewTransaction.type === 'income' ? 'Nạp vào quỹ' : 'Rút về ví'}</div>

									<div className="ft-preview-label">Số tiền</div>
									<div className="ft-preview-value">{formatCurrency(viewTransaction.amount)}</div>

									<div className="ft-preview-label">Người thực hiện</div>
									<div className="ft-preview-value">{viewTransaction.creatorName || (viewTransaction.createdBy && (viewTransaction.createdBy.name || viewTransaction.createdBy.email)) || '—'}</div>

									<div className="ft-preview-label">Ngày</div>
									<div className="ft-preview-value">{formatDate(viewTransaction.date || viewTransaction.createdAt)}</div>
								</div>
							</div>

							<div className="ft-form-actions">
								<button className="ft-btn secondary" onClick={() => setShowViewModal(false)}>Đóng</button>
							</div>
						</div>
					</div>
				)}

				{/* Modal hiển thị ảnh hóa đơn liên kết */}
				{showReceiptsModal && (
					<div className="ft-modal-overlay">
						<div className="ft-modal">
							<div className="ft-modal-header">
								<h3>
									<i className="fas fa-image"></i> Ảnh hóa đơn liên kết
								</h3>
								<button className="ft-modal-close" onClick={() => setShowReceiptsModal(false)}>
									&times;
								</button>
							</div>
							<div className="ft-form" style={{ paddingBottom: 16 }}>
								{loadingReceipts ? (
									<div className="ft-loading-inline">
										<i className="fas fa-spinner fa-spin"></i> Đang tải ảnh hóa đơn...
									</div>
								) : linkedReceipts.length === 0 ? (
									<div className="ft-empty-state-small">
										<i className="fas fa-image"></i>
										<p>Chưa có ảnh hóa đơn liên kết với giao dịch này</p>
									</div>
								) : (
									<div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
										{linkedReceipts.map(img => (
											<div key={img._id} style={{ width: 180, textAlign: 'center' }}>
												<img
													src={img.imageUrl}
													alt={img.originalName || 'Ảnh hóa đơn'}
													style={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 8, background: '#f1f5f9' }}
												/>
												<div style={{ marginTop: 8, fontSize: 13, color: '#64748b' }}>
													{img.description || img.originalName}
												</div>
												<div style={{ fontSize: 12, color: '#94a3b8' }}>
													{img.uploaderName}
												</div>
											</div>
										))}
									</div>
								)}
							</div>
							<div className="ft-form-actions">
								<button className="ft-btn secondary" onClick={() => setShowReceiptsModal(false)}>
									<i className="fas fa-times"></i> Đóng
								</button>
							</div>
						</div>
					</div>
				)}
			</main>
		</div>
	);
}
