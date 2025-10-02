import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import GroupSidebar from './GroupSidebar';
import './GroupsPage.css';

export default function GroupsPage() {
	const navigate = useNavigate();
	const [showCreateModal, setShowCreateModal] = useState(false);
	const [modalStep, setModalStep] = useState(1);
	const [createdGroup, setCreatedGroup] = useState(null);
	const [groupName, setGroupName] = useState('');
	const [groupDescription, setGroupDescription] = useState('');
	const [groups, setGroups] = useState([]);
	const [loadingGroups, setLoadingGroups] = useState(false);
	const [creating, setCreating] = useState(false);
	const [errorMsg, setErrorMsg] = useState(null);
	const [chosenColors, setChosenColors] = useState(['#4CAF50']);
	const [gradientDirection, setGradientDirection] = useState('135deg');

	// friends selection for group creation
	const [friendsList, setFriendsList] = useState([]);
	const [loadingFriends, setLoadingFriends] = useState(false);
	const [selectedFriendEmails, setSelectedFriendEmails] = useState([]);
	const [friendSearch, setFriendSearch] = useState('');
	
	// Các state mới cho trang được cải tiến
	// eslint-disable-next-line no-unused-vars
	const [activeGroups, setActiveGroups] = useState([]);
	const [recentGroups, setRecentGroups] = useState([]);
	const [pinnedGroups, setPinnedGroups] = useState([]);
	const [groupStats, setGroupStats] = useState({
		total: 0,
		active: 0,
		ownerCount: 0,
		memberCount: 0
	});

	const [inviteSending, setInviteSending] = useState(false);
	const [inviteResult, setInviteResult] = useState(null);

	const API_BASE = 'http://localhost:5000';
	const getToken = () => localStorage.getItem('token');

	// Add the missing fetchFriendsList function
	const fetchFriendsList = useCallback(async () => {
		const token = getToken();
		if (!token) return;

		setLoadingFriends(true);
		try {
			const res = await fetch(`${API_BASE}/api/friends/list`, {
				headers: { Authorization: `Bearer ${token}` }
			});
			if (!res.ok) {
				setFriendsList([]);
				return;
			}
			const data = await res.json();
			// Normalize the data structure
			const friends = Array.isArray(data) ? data : [];
			setFriendsList(friends);
		} catch (err) {
			console.error('Error fetching friends list:', err);
			setFriendsList([]);
		} finally {
			setLoadingFriends(false);
		}
	}, [API_BASE]); // Include API_BASE in dependencies

	const fetchGroups = useCallback(async () => {
		setErrorMsg(null);
		const token = getToken();
		if (!token) {
			setErrorMsg('Bạn cần đăng nhập để xem nhóm.');
			setGroups([]);
			return;
		}

		setLoadingGroups(true);
		try {
			const res = await fetch(`${API_BASE}/api/groups`, {
				headers: { Authorization: `Bearer ${token}` }
			});
			if (res.status === 401) {
				setErrorMsg('Không hợp lệ hoặc hết hạn phiên. Vui lòng đăng nhập lại.');
				setGroups([]);
				setLoadingGroups(false);
				return;
			}
			if (!res.ok) {
				const err = await res.json().catch(() => null);
				throw new Error(err && err.message ? err.message : 'Lỗi khi tải nhóm');
			}
			const data = await res.json();
			setGroups(data || []);

			// Xử lý dữ liệu cho các phần mới
			const ownerGroups = data.filter(g => isOwner(g));
			const memberGroups = data.filter(g => !isOwner(g));
			
			// Các nhóm gần đây (dựa trên updateAt hoặc createdAt)
			const sorted = [...data].sort((a, b) => {
				const dateA = new Date(a.updatedAt || a.createdAt);
				const dateB = new Date(b.updatedAt || b.createdAt);
				return dateB - dateA;
			});
			setRecentGroups(sorted.slice(0, 5));
			
			// Giả định active groups là các nhóm có giao dịch gần đây hoặc nhiều thành viên
			const active = data.filter(g => (g.members && g.members.length > 3) || g.lastTransaction);
			setActiveGroups(active.slice(0, 6));
			
			// Tính toán các thống kê
			setGroupStats({
				total: data.length,
				active: active.length,
				ownerCount: ownerGroups.length,
				memberCount: memberGroups.length
			});
			
			// Giả định pinned groups là các nhóm đầu tiên (hoặc implement pinned functionality)
			setPinnedGroups(data.slice(0, 3));
			
		} catch (err) {
			console.error('fetchGroups error', err);
			setErrorMsg(err.message || 'Lỗi khi tải nhóm');
		} finally {
			setLoadingGroups(false);
		}
	}, []);

	useEffect(() => {
		fetchGroups();
	}, [fetchGroups]);

	// Thêm helper function để kiểm tra nếu user là owner
	const isOwner = (group) => {
		const token = localStorage.getItem('token');
		if (!token || !group || !group.owner) return false;
		try {
			const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
			const myId = payload.id || payload._id || payload.userId || '';
			const ownerId = typeof group.owner === 'object' ? (group.owner._id || group.owner.id) : group.owner;
			return String(myId) === String(ownerId);
		} catch (e) { return false; }
	};

	// Helper: lấy tên hiển thị cho chủ nhóm
	const getOwnerDisplayName = (group) => {
		if (!group || !group.owner) return 'Không xác định';
		if (typeof group.owner === 'object') return group.owner.name || group.owner.email || 'Chủ nhóm';
		return 'Chủ nhóm';
	};

	// Helper: định dạng thời gian tương đối
	const getRelativeTimeString = (date) => {
		if (!date) return '';
		
		const now = new Date();
		const past = new Date(date);
		const diffMs = now - past;
		const diffSec = Math.round(diffMs / 1000);
		const diffMin = Math.round(diffSec / 60);
		const diffHour = Math.round(diffMin / 60);
		const diffDay = Math.round(diffHour / 24);
		
		if (diffSec < 60) return 'Vừa xong';
		if (diffMin < 60) return `${diffMin} phút trước`;
		if (diffHour < 24) return `${diffHour} giờ trước`;
		if (diffDay < 30) return `${diffDay} ngày trước`;
		
		return past.toLocaleDateString('vi-VN');
	};

	// more robust toggle using Set and normalized email
	const toggleFriendSelection = (emailRaw) => {
		const email = (emailRaw || '').toLowerCase().trim();
		setSelectedFriendEmails(prev => {
			const s = new Set(prev.map(e => (e || '').toLowerCase().trim()));
			if (s.has(email)) s.delete(email);
			else s.add(email);
			return Array.from(s);
		});
	};

	// select all / clear helpers for visible list
	const selectAllVisible = (visible) => {
		setSelectedFriendEmails(prev => {
			const s = new Set(prev.map(e => (e||'').toLowerCase().trim()));
			visible.forEach(f => s.add((f.email||'').toLowerCase().trim()));
			return Array.from(s);
		});
	};
	const clearAll = () => setSelectedFriendEmails([]);

	// filtered friends used in invite step (fix undefined error)
	const q = (friendSearch || '').toLowerCase().trim();
	const filteredFriends = q
		? friendsList.filter(f => (f.name||'').toLowerCase().includes(q) || (f.email||'').toLowerCase().includes(q))
		: friendsList;
	
	// Step 1: create group (owner only, no invited members). On success go to step 2.
	const handleCreateGroup = async (e) => {
		e && e.preventDefault();
		setErrorMsg(null);
		if (!groupName.trim()) {
			setErrorMsg('Vui lòng nhập tên nhóm.');
			return;
		}
		const token = getToken();
		if (!token) {
			setErrorMsg('Bạn cần đăng nhập để tạo nhóm.');
			return;
		}

		setCreating(true);
		try {
			const payload = {
				name: groupName.trim(),
				description: groupDescription.trim(),
				// create group with owner only; members will be invited in step 2
				members: [],
				color: { colors: chosenColors, direction: gradientDirection }
			};

			const res = await fetch(`${API_BASE}/api/groups`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`
				},
				body: JSON.stringify(payload)
			});

			if (!res.ok) {
				const err = await res.json().catch(() => null);
				throw new Error(err && (err.message || err.error) ? (err.message || err.error) : 'Server error');
			}
			const newGroup = await res.json();
			// keep created group and switch to invite step
			setCreatedGroup(newGroup);
			setModalStep(2);
			// ensure friends list is loaded
			fetchFriendsList();
		} catch (err) {
			console.error('Create group failed', err);
			setErrorMsg(err.message || 'Lỗi khi tạo nhóm');
		} finally {
			setCreating(false);
		}
	};

	// Step 2: invite selected friends into createdGroup
	const sendInvitesToGroup = async () => {
		if (!createdGroup || !createdGroup._id) {
			setInviteResult('Không có group hợp lệ để mời');
			return;
		}
		const token = getToken();
		if (!token) { setInviteResult('Bạn cần đăng nhập'); return; }
		if (!selectedFriendEmails || selectedFriendEmails.length === 0) {
			setInviteResult('Chưa chọn thành viên nào');
			return;
		}
		setInviteSending(true);
		setInviteResult(null);
		try {
			const results = [];
			for (const email of selectedFriendEmails) {
				try {
					const res = await fetch(`${API_BASE}/api/groups/${encodeURIComponent(createdGroup._id)}/invite`, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
						body: JSON.stringify({ email })
					});
					const body = await res.json().catch(() => null);
					results.push({ email, ok: res.ok, body });
				} catch (e) {
					results.push({ email, ok: false, error: e.message });
				}
			}
			setInviteResult(`Đã gửi ${results.filter(r => r.ok).length}/${results.length} lời mời`);
			// refresh groups list and reset modal (optionally keep modal open)
			fetchGroups();
			// optional: close modal automatically after a short delay
			setTimeout(() => {
				setShowCreateModal(false);
				setModalStep(1);
				setCreatedGroup(null);
				setSelectedFriendEmails([]);
			}, 900);
		} catch (err) {
			setInviteResult('Lỗi khi gửi lời mời');
			console.error('sendInvitesToGroup error', err);
		} finally {
			setInviteSending(false);
		}
	};

	// Thêm nhiều màu sắc hơn để người dùng lựa chọn
	const colorOptions = [
		'#4CAF50','#2196F3','#FF9800','#E91E63','#9C27B0',
		'#009688','#1b74e4','#00b894','#FF5722','#673AB7',
		'#3F51B5','#00BCD4','#8BC34A','#FFC107','#F44336',
		'#795548','#607D8B','#9c88ff','#273c75','#16a085',
		'#27ae60','#2980b9','#8e44ad','#f39c12','#d35400'
	];

	// Các hướng gradient có thể chọn
	const gradientDirections = [
		{ value: '135deg', label: 'Chéo xuống' },
		{ value: '45deg', label: 'Chéo lên' },
		{ value: '90deg', label: 'Ngang' },
		{ value: '180deg', label: 'Dọc' },
		{ value: 'circle', label: 'Tròn' }
	];

	const toggleColor = (c) => {
		setChosenColors(prev => {
			if (!prev) return [c];
			if (prev.includes(c)) return prev.filter(x => x !== c);
			return [...prev, c];
		});
	};

	// thay thế buildPreviewBg/buildCard background bằng phiên bản thống nhất,
	// chấp nhận: array of colors, JSON-stringified array, linear-gradient string,
	// comma-separated colors, hoặc single hex color.
	const normalizeColorsArray = (input) => {
		if (!input) return [];
		// if already array
		if (Array.isArray(input)) return input.filter(Boolean);
		// if object with colors property
		if (typeof input === 'object') {
			if (input.colors && Array.isArray(input.colors)) return input.colors.filter(Boolean);
			return [];
		}
		if (typeof input !== 'string') return [];
		const s = input.trim();
		// Already a linear-gradient string -> return empty (caller will use raw)
		if (s.toLowerCase().startsWith('linear-gradient')) return [];
		// Try parse JSON string (object or array)
		try {
			const parsed = JSON.parse(s);
			if (Array.isArray(parsed)) return parsed.filter(Boolean);
			if (parsed && parsed.colors && Array.isArray(parsed.colors)) return parsed.colors.filter(Boolean);
		} catch (e) { /* ignore */ }
		// Comma-separated values
		if (s.includes(',')) return s.split(',').map(p => p.trim()).filter(Boolean);
		// single color
		return [s];
	};

	// Hàm xây dựng background cải tiến
	const buildPreviewBg = (colorsOrInput, direction = gradientDirection) => {
		const colors = Array.isArray(colorsOrInput) ? colorsOrInput.filter(Boolean) : normalizeColorsArray(colorsOrInput);
		if (!colors || colors.length === 0) return '#fff';
		
		if (colors.length === 1) {
			return `linear-gradient(${direction}, ${colors[0]}cc, ${colors[0]}99)`;
		}
		
		const stops = colors.map(c => c.length <= 7 ? (c + 'aa') : c);
		
		if (direction === 'circle') {
			return `radial-gradient(circle, ${stops.join(', ')})`;
		}
		
		return `linear-gradient(${direction}, ${stops.join(', ')})`;
	};

	// Hàm phân tích chuỗi màu từ database
	const getCardBackground = (group) => {
		if (!group) return buildPreviewBg(['#4CAF50']);
		const col = group.color;
		if (!col) return buildPreviewBg(['#4CAF50']);

		// if backend returned an object { colors: [...], direction }
		if (typeof col === 'object') {
			if (col.colors && Array.isArray(col.colors)) return buildPreviewBg(col.colors, col.direction || gradientDirection);
			// fallback: try to normalize object
			const arr = normalizeColorsArray(col);
			if (arr.length) return buildPreviewBg(arr, col.direction || gradientDirection);
		}

		if (typeof col === 'string') {
			const s = col.trim();
			// raw CSS gradient stored as string
			if (s.toLowerCase().startsWith('linear-gradient') || s.toLowerCase().startsWith('radial-gradient')) return s;
			// try parse as JSON string
			try {
				const parsed = JSON.parse(s);
				if (parsed && parsed.colors && Array.isArray(parsed.colors)) {
					return buildPreviewBg(parsed.colors, parsed.direction || gradientDirection);
				}
			} catch (e) { /* ignore */ }
			const arr = normalizeColorsArray(s);
			if (arr && arr.length > 0) return buildPreviewBg(arr);
			return buildPreviewBg([s]);
		}

		// fallback
		return buildPreviewBg(['#4CAF50']);
	};

	// Helper: xác định vai trò của user trong group
	const getRole = (group) => {
		const token = localStorage.getItem('token');
		if (!token || !group || !group.members) return '';
		try {
			const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
			const myEmail = (payload.email || '').toLowerCase().trim();
			const member = group.members.find(m => (m.email || '').toLowerCase().trim() === myEmail);
			return member ? (member.role || (group.owner && member.user === group.owner._id ? 'owner' : 'member')) : '';
		} catch (e) { return ''; }
	};

	return (
		<div className="groups-page">
			<GroupSidebar active="groups" />
			
			<main className="groups-main" role="main">
				<header className="groups-header">
					<div>
						<h1>Nhóm</h1>
						<p className="subtitle">Quản lý và tham gia nhóm chi tiêu</p>
					</div>

					<div className="header-actions">
						<button
							className="create-group-btn"
							onClick={() => { setShowCreateModal(true); fetchFriendsList(); }}
						>
							<i className="fas fa-plus-circle"></i> Tạo nhóm mới
						</button>
					</div>
				</header>

				{errorMsg && (
					<div className="groups-error-alert">
						<i className="fas fa-exclamation-circle"></i> {errorMsg}
					</div>
				)}

				{/* Bảng điều khiển thống kê */}
				<section className="groups-dashboard">
					<div className="groups-stat-card">
						<div className="stat-value">{groupStats.total}</div>
						<div className="stat-label">Tổng số nhóm</div>
						<i className="fas fa-layer-group stat-icon"></i>
					</div>
					<div className="groups-stat-card">
						<div className="stat-value">{groupStats.ownerCount}</div>
						<div className="stat-label">Nhóm quản lý</div>
						<i className="fas fa-user-shield stat-icon"></i>
					</div>
					<div className="groups-stat-card">
						<div className="stat-value">{groupStats.memberCount}</div>
						<div className="stat-label">Nhóm tham gia</div>
						<i className="fas fa-users stat-icon"></i>
					</div>
					<div className="groups-stat-card">
						<div className="stat-value">{groupStats.active}</div>
						<div className="stat-label">Nhóm hoạt động</div>
						<i className="fas fa-chart-line stat-icon"></i>
					</div>
				</section>

				{/* Phần nhóm ghim */}
				{pinnedGroups.length > 0 && (
					<section className="groups-section">
						<div className="section-header">
							<h2 className="section-title"><i className="fas fa-thumbtack"></i> Nhóm ghim</h2>
						</div>
						<div className="pinned-groups-grid">
							{pinnedGroups.map(group => (
								<div 
									key={group._id || group.id} 
									className="pinned-group-card"
									onClick={() => navigate(`/groups/${isOwner(group) ? 'manage' : 'member'}/${group._id || group.id}`)}
									style={{ background: getCardBackground(group) }}
								>
									<div className="pg-content">
										<h3 className="pg-name">{group.name}</h3>
										<div className="pg-meta">
											<div className="pg-members">
												<i className="fas fa-users"></i> {(group.members && group.members.length) || 0} thành viên
											</div>
											<div className="pg-role">
												{isOwner(group) ? (
													<span className="role-badge owner"><i className="fas fa-crown"></i> Quản trị viên</span>
												) : (
													<span className="role-badge member"><i className="fas fa-user"></i> Thành viên</span>
												)}
											</div>
										</div>
									</div>
								</div>
							))}
						</div>
					</section>
				)}

				{/* Nhóm gần đây */}
				{recentGroups.length > 0 && (
					<section className="groups-section">
						<div className="section-header">
							<h2 className="section-title"><i className="fas fa-history"></i> Nhóm gần đây</h2>
							<div className="section-actions">
								<button className="section-action-btn" onClick={fetchGroups}>
									<i className="fas fa-sync-alt"></i> Làm mới
								</button>
							</div>
						</div>

						<div className="recent-groups-list">
							{recentGroups.map(group => {
								const updatedAt = group.updatedAt || group.createdAt;
								
								return (
									<div key={group._id || group.id} className="recent-group-item">
										<div 
											className="rg-avatar" 
											style={{ background: getCardBackground(group) }}
										>
											{(group.name || '?')[0].toUpperCase()}
										</div>
										<div className="rg-info">
											<div className="rg-name">{group.name}</div>
											<div className="rg-time">{getRelativeTimeString(updatedAt)}</div>
										</div>
										<div className="rg-members">
											<i className="fas fa-users"></i> {(group.members && group.members.length) || 0}
										</div>
										<div className="rg-actions">
											<button 
												className="rg-btn"
												onClick={() => navigate(`/groups/${isOwner(group) ? 'manage' : 'member'}/${group._id || group.id}`)}
											>
												{isOwner(group) ? 'Quản lý' : 'Xem'}
											</button>
										</div>
									</div>
								);
							})}
						</div>
					</section>
				)}

				{/* Tất cả nhóm - Card Grid */}
				<section className="groups-section">
					<div className="section-header">
						<h2 className="section-title"><i className="fas fa-th-large"></i> Tất cả nhóm của bạn</h2>
					</div>

					{loadingGroups ? (
						<div className="groups-loading">
							<div className="loading-spinner"></div>
							<p>Đang tải danh sách nhóm...</p>
						</div>
					) : groups.length > 0 ? (
						<div className="groups-card-container">
							{groups.map(group => {
								const role = getRole(group);
								return (
									<div key={group._id || group.id || group.id} className="group-card-v2 bank-card" style={{ background: getCardBackground(group) }}>
										<div className="wc-bg-shape wc-bg-a" />
										<div className="wc-bg-shape wc-bg-b" />

										<div className="bank-top" aria-hidden>
											<div className="card-chip-small" />
											<div className="card-number">•••• {String(group._id || group.id || '').slice(-6)}</div>
										</div>

										<div className="bank-balance" role="img" aria-label={`Tổng chi tiêu ${group.totalExpense || 0}`}>
											<div className="balance-value">{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(group.totalExpense || 0)}</div>
											<div className="balance-sub">Tổng chi tiêu nhóm</div>
										</div>

										<div className="bank-meta">
											<div className="bank-name">{group.name}</div>

											<div className="bank-owner">
												<div className="owner-avatar" title={getOwnerDisplayName(group)}>
													{group.owner && (group.owner.name ? group.owner.name.split(' ').map(n => n[0]).slice(0,2).join('') : String(group.owner).slice(0,2)).toUpperCase()}
												</div>
												<div className="owner-info">
													<div className="owner-name">{getOwnerDisplayName(group)}</div>
													<div className="owner-members">{(group.members && group.members.length) || 0} thành viên</div>
												</div>
											</div>
										</div>

										<div className="bank-actions">
											{role === 'owner' ? (
												<>
													<button
														className="wc-btn"
														onClick={() => navigate(`/groups/manage/${group._id || group.id}`)}
													>
														<i className="fas fa-cog"></i> Quản lý
													</button>
													<button 
														className="wc-btn"
														onClick={() => navigate(`/groups/${group._id || group.id}/transactions`)}
													>
														<i className="fas fa-exchange-alt"></i> Giao dịch
													</button>
												</>
											) : (
												<>
													<button
														className="wc-btn"
														onClick={() => navigate(`/groups/member/${group._id || group.id}`)}
													>
														<i className="fas fa-eye"></i> Xem
													</button>
													<button
														className="wc-btn"
														onClick={() => navigate(`/groups/${group._id || group.id}/transactions`)}
													>
														<i className="fas fa-exchange-alt"></i> Giao dịch
													</button>
												</>
											)}
										</div>
									</div>
								);
							})}
						</div>
					) : (
						<div className="no-groups">
							<div className="empty-icon"><i className="fas fa-users-slash"></i></div>
							<h3>Chưa có nhóm nào</h3>
							<p>Bạn chưa tham gia nhóm nào. Hãy tạo một nhóm mới để bắt đầu!</p>
							<button 
								className="create-group-btn"
								onClick={() => { setShowCreateModal(true); fetchFriendsList(); }}
							>
								<i className="fas fa-plus-circle"></i> Tạo nhóm mới
							</button>
						</div>
					)}
				</section>

				{/* Modal tạo nhóm (giữ nguyên code modal) */}
				{showCreateModal && (
					<div className="modal-overlay">
						<div className="modal card-styled-modal create-group-modal">
							<div className="modal-header">
								<h2>{modalStep === 1 ? 'Tạo nhóm mới' : `Thêm thành viên vào "${createdGroup ? createdGroup.name : ''}"`}</h2>
								<button className="close-btn" onClick={() => {
									setShowCreateModal(false);
									setModalStep(1);
									setCreatedGroup(null);
									setSelectedFriendEmails([]);
								}}>&times;</button>
							</div>

							{modalStep === 1 ? (
								<form className="create-group-form" onSubmit={handleCreateGroup}>
									<div className="form-group">
										<label>Tên nhóm</label>
										<input
											type="text"
											value={groupName}
											onChange={(e) => setGroupName(e.target.value)}
											placeholder="Nhập tên nhóm..."
											required
										/>
									</div>

									<div className="form-group">
										<label>Mô tả (tùy chọn)</label>
										<input
											type="text"
											value={groupDescription}
											onChange={(e) => setGroupDescription(e.target.value)}
											placeholder="Mô tả ngắn về nhóm..."
										/>
									</div>

									{/* color/design UI */}
									<div className="form-group">
										<label>Thiết kế thẻ nhóm</label>
										<div className="card-design-container">
											<div className="design-options">
												<div className="design-option">
													<h4>Chọn màu sắc</h4>
													<div className="color-picker" role="group" aria-label="Chọn màu thẻ">
														{colorOptions.map(c => {
															const selected = chosenColors.includes(c);
															return (
																<button
																	key={c}
																	type="button"
																	className={`swatch ${selected ? 'selected' : ''}`}
																	onClick={() => toggleColor(c)}
																	style={{ background: c }}
																	aria-pressed={selected}
																	title={c}
																>
																	{selected && <span className="swatch-check">✓</span>}
																</button>
															);
														})}
													</div>
													<div className="color-hint">
														Chọn nhiều màu để tạo hiệu ứng gradient đẹp mắt
													</div>
												</div>
												
												<div className="design-option">
													<h4>Hướng gradient</h4>
													<div className="direction-selector">
														{gradientDirections.map(dir => (
															<button
																key={dir.value}
																type="button"
																className={`direction-btn ${gradientDirection === dir.value ? 'selected' : ''}`}
																onClick={() => setGradientDirection(dir.value)}
															>
																<span className="direction-icon" style={{
																	background: buildPreviewBg(['#4CAF50', '#2196F3'], dir.value)
															}}></span>
																<span>{dir.label}</span>
															</button>
														))}
													</div>
												</div>
											</div>
											
											{/* Xem trước thẻ */}
											<div className="card-preview-container">
												<h4>Xem trước thẻ</h4>
												<div className="bank-card-preview" style={{ background: buildPreviewBg(chosenColors) }}>
													<div className="wc-bg-shape wc-bg-a" />
													<div className="wc-bg-shape wc-bg-b" />
													
													<div className="bank-top">
														<div className="card-chip-small" />
														<div className="card-number">•••• NEW</div>
													</div>

													<div className="bank-balance">
														<div className="balance-value">0 ₫</div>
														<div className="balance-sub">Tổng chi tiêu nhóm</div>
													</div>

													<div className="bank-meta">
														<div className="bank-name">{groupName || 'Tên nhóm'}</div>
														<div className="bank-owner">
															<div className="owner-avatar">YOU</div>
														</div>
													</div>
												</div>
											</div>
										</div>
									</div>

									<div className="form-actions">
										<button type="button" className="cancel-btn" onClick={() => { setShowCreateModal(false); setModalStep(1); }}>Hủy</button>
										<button type="submit" className="create-btn" disabled={creating}>
											{creating ? <><i className="fas fa-spinner fa-spin"></i> Đang tạo...</> : <><i className="fas fa-check"></i> Tạo nhóm</>}
										</button>
									</div>
								</form>
							) : (
								// Step 2: invite friends UI
								<div className="create-group-invite">
									<div className="invite-header">
										<h3>Thêm thành viên vào nhóm "{createdGroup?.name || ''}"</h3>
										<p className="invite-subtitle">Mời bạn bè tham gia để nhóm hoạt động hiệu quả hơn</p>
									</div>

									{/* search + quick actions */}
									<div className="friend-search-container">
										<div className="search-input-wrapper">
											<span className="search-icon">🔍</span>
											<input
												type="search"
												placeholder="Tìm kiếm theo tên hoặc email..."
												className="friend-search-input"
												value={friendSearch}
												onChange={(e) => setFriendSearch(e.target.value)}
											/>
											{friendSearch && (
												<button 
													type="button" 
													className="search-clear-btn" 
													onClick={() => setFriendSearch('')}
													aria-label="Xóa tìm kiếm"
												>×</button>
											)}
										</div>
										<div className="friends-actions">
											<button type="button" className="action-btn" onClick={() => selectAllVisible(filteredFriends)}>
												Chọn tất cả
											</button>
											<button type="button" className="action-btn secondary" onClick={clearAll}>
												Bỏ chọn
											</button>
										</div>
									</div>
									
									{/* Hiển thị số lượng đã chọn */}
									<div className="selection-summary">
										<div className="selection-counter">
											<span className="counter-number">{selectedFriendEmails.length}</span>
											<span className="counter-text">thành viên đã chọn</span>
										</div>
									</div>

									{/* friends list as cards grid */}
									<div className="friends-grid-container">
										{loadingFriends ? (
											<div className="friends-loading">
												<div className="loading-spinner"></div>
												<p>Đang tải danh sách bạn bè...</p>
											</div>
										) : filteredFriends.length === 0 ? (
											<div className="friends-empty">
												{friendSearch ? (
													<>
														<div className="empty-icon">🔍</div>
														<p>Không tìm thấy kết quả cho "{friendSearch}"</p>
														<button className="clear-search-btn" onClick={() => setFriendSearch('')}>
															Xóa tìm kiếm
														</button>
													</>
												) : (
													<>
														<div className="empty-icon">👥</div>
														<p>Bạn chưa có người bạn nào</p>
														<button className="action-btn" onClick={() => navigate('/friends')}>
															Tìm bạn bè
														</button>
													</>
												)}
											</div>
										) : (
											<div className="friends-grid">
												{filteredFriends.map(friend => {
													const id = `invite-${encodeURIComponent(friend.email)}`;
													const checked = selectedFriendEmails.map(e => (e || '').toLowerCase().trim())
														.includes((friend.email || '').toLowerCase().trim());
													
													// Tạo màu ngẫu nhiên nhưng ổn định cho mỗi người dùng dựa vào email
													const getInitialAndColor = (name, email) => {
														const initial = (name || email || '?')[0].toUpperCase();
														const hash = [...(email || name || '?')].reduce((acc, char) => acc + char.charCodeAt(0), 0);
														const hue = hash % 360;
														return { 
															initial, 
															color: `hsl(${hue}, 70%, 45%)`,
															bgColor: `hsl(${hue}, 85%, 90%)`
														};
													};
													
													const { initial, color, bgColor } = getInitialAndColor(friend.name, friend.email);
													
													return (
														<div
															key={friend.id || friend.email}
															className={`friend-card ${checked ? 'selected' : ''}`}
															onClick={() => toggleFriendSelection(friend.email)}
														>
															<div className="friend-card-avatar" style={{ backgroundColor: bgColor, color: color }}>
																{initial}
															</div>
															<div className="friend-card-info">
																<div className="friend-card-name">{friend.name || 'Người dùng'}</div>
																<div className="friend-card-email">{friend.email}</div>
															</div>
															<div className="friend-card-select">
																<input
																	type="checkbox"
																	id={id}
																	checked={checked}
																	onChange={(e) => {
																		e.stopPropagation();
																		toggleFriendSelection(friend.email);
																	}}
																	className="friend-checkbox"
																/>
																<span className="checkmark"></span>
															</div>
														</div>
													);
												})}
											</div>
										)}
									</div>

									<div className="invite-actions">
										<button 
											type="button" 
											className="cancel-btn" 
											onClick={() => {
												setShowCreateModal(false);
												setModalStep(1);
												setCreatedGroup(null);
												setSelectedFriendEmails([]);
												fetchGroups();
											}}
										>
											Bỏ qua
										</button>
										<button 
											type="button" 
											className="invite-btn" 
											onClick={sendInvitesToGroup} 
											disabled={inviteSending || selectedFriendEmails.length === 0}
										>
											{inviteSending ? 'Đang gửi...' : `thêm thành viên (${selectedFriendEmails.length})`}
										</button>
									</div>

									{inviteResult && (
										<div className="invite-result">
											{inviteResult}
										</div>
									)}
								</div>
							)}
						</div>
					</div>
				)}
			</main>
		</div>
	);
}



