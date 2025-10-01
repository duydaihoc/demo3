import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import GroupSidebar from './GroupSidebar';
import './GroupManagePage.css';

export default function GroupManagePage() {
	const { groupId } = useParams();
	const navigate = useNavigate();
	const [group, setGroup] = useState(null);
	const [loading, setLoading] = useState(true);
	const [editing, setEditing] = useState(false);
	const [editName, setEditName] = useState('');
	const [editColors, setEditColors] = useState([]);
	const [editDirection, setEditDirection] = useState('135deg');
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState('');
	const [removingMemberId, setRemovingMemberId] = useState(null);
	const [deleting, setDeleting] = useState(false);
	// add-member UI state
	const [showAddMember, setShowAddMember] = useState(false);
	const [newMemberEmail, setNewMemberEmail] = useState('');
	const [addingMember, setAddingMember] = useState(false);
	const [addMemberError, setAddMemberError] = useState('');
	const [addMemberSuccess, setAddMemberSuccess] = useState('');
	// friends list for invite UI
	const [friendsList, setFriendsList] = useState([]);
	const [loadingFriends, setLoadingFriends] = useState(false);
	const [invitingEmail, setInvitingEmail] = useState(null);

	const API_BASE = 'http://localhost:5000';
	const token = localStorage.getItem('token');
	// Load friends when opening add-member panel
	useEffect(() => {
		let mounted = true;
		if (!showAddMember) return;
		if (!token) { setFriendsList([]); return; }
		setLoadingFriends(true);
		fetch(`${API_BASE}/api/friends/list`, { headers: { Authorization: `Bearer ${token}` } })
			.then(r => r.ok ? r.json() : Promise.reject())
			.then(data => {
				if (!mounted) return;
				const arr = Array.isArray(data) ? data : (data && Array.isArray(data.data) ? data.data : []);
				const normalized = arr.map(u => ({
					id: u.id || u._id || (u._id?u._id:''), 
					name: u.name || u.email || 'Thành viên',
					email: (u.email || '').toLowerCase().trim()
				}));
				setFriendsList(normalized);
			})
			.catch(() => { if (mounted) setFriendsList([]); })
			.finally(() => { if (mounted) setLoadingFriends(false); });
		return () => { mounted = false; };
	}, [showAddMember, token]); // eslint-disable-line

	// Helper: xác định owner
	const getOwnerId = (g) => g && g.owner && (g.owner._id || g.owner.id || g.owner);

	// Helper: lấy userId hiện tại từ token
	const getMyId = () => {
		try {
			const t = token;
			if (!t) return '';
			const payload = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
			return payload.id || payload._id || payload.userId || '';
		} catch (e) { return ''; }
	};

	const isOwner = group && String(getOwnerId(group)) === String(getMyId());

	// Extracted loader so we can refresh after actions
	const refreshGroup = async () => {
		if (!groupId || !token) return;
		setLoading(true);
		try {
			const res = await fetch(`${API_BASE}/api/groups/${groupId}`, {
				headers: { Authorization: `Bearer ${token}` }
			});
			if (!res.ok) {
				setGroup(null);
				setLoading(false);
				return;
			}
			const data = await res.json();
			setGroup(data);
			// sync edit fields when reloading
			setEditName(data.name || '');
			let colors = ['#4CAF50'], direction = '135deg';
			if (data.color) {
				if (typeof data.color === 'object') {
					colors = Array.isArray(data.color.colors) ? data.color.colors : colors;
					direction = data.color.direction || direction;
				} else if (typeof data.color === 'string') {
					try {
						const parsed = JSON.parse(data.color);
						colors = Array.isArray(parsed.colors) ? parsed.colors : colors;
						direction = parsed.direction || direction;
					} catch (e) { /* ignore */ }
				}
			}
			setEditColors(colors);
			setEditDirection(direction);
		} catch (e) {
			console.warn('refreshGroup error', e);
		} finally {
			setLoading(false);
		}
	};

	// call refreshGroup on mount instead of inline fetch
	useEffect(() => {
		refreshGroup();
	}, [groupId, token]); // eslint-disable-line

	// Sửa tên/màu nhóm
	const handleSave = async () => {
		if (!groupId || !token) return;
		setSaving(true);
		setError('');
		try {
			const payload = {
				name: editName,
				color: { colors: editColors, direction: editDirection }
			};
			const res = await fetch(`${API_BASE}/api/groups/${groupId}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
				body: JSON.stringify(payload)
			});
			if (!res.ok) {
				const err = await res.json().catch(() => null);
				setError((err && err.message) ? err.message : 'Không thể cập nhật nhóm');
				setSaving(false);
				return;
			}
			const updated = await res.json();
			setGroup(updated);
			setEditing(false);
		} catch (e) {
			setError('Lỗi mạng');
		} finally {
			setSaving(false);
		}
	};

	// Xóa thành viên
	const handleRemoveMember = async (memberId) => {
		if (!groupId || !token || !memberId) return;
		setRemovingMemberId(memberId);
		try {
			const res = await fetch(`${API_BASE}/api/groups/${groupId}/remove-member`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
				body: JSON.stringify({ memberId })
			});
			if (!res.ok) {
				alert('Không thể xóa thành viên');
				setRemovingMemberId(null);
				return;
			}
			// reload group
			const updated = await res.json();
			setGroup(updated);
		} catch (e) {
			alert('Lỗi mạng');
		} finally {
			setRemovingMemberId(null);
		}
	};

	// Xóa nhóm
	const handleDeleteGroup = async () => {
		if (!groupId || !token) return;
		if (!window.confirm('Bạn có chắc muốn xóa nhóm này?')) return;
		setDeleting(true);
		try {
			const res = await fetch(`${API_BASE}/api/groups/${groupId}`, {
				method: 'DELETE',
				headers: { Authorization: `Bearer ${token}` }
			});
			if (!res.ok) {
				alert('Không thể xóa nhóm');
				setDeleting(false);
				return;
			}
			alert('Đã xóa nhóm');
			navigate('/groups');
		} catch (e) {
			alert('Lỗi mạng');
		} finally {
			setDeleting(false);
		}
	};

	// Add member action (owner only)
	const handleAddMember = async () => {
		setAddMemberError('');
		setAddMemberSuccess('');
		if (!newMemberEmail || !newMemberEmail.trim()) {
			setAddMemberError('Vui lòng nhập email.');
			return;
		}
		setAddingMember(true);
		try {
			const res = await fetch(`${API_BASE}/api/groups/${encodeURIComponent(groupId)}/invite`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
				body: JSON.stringify({ email: newMemberEmail.trim().toLowerCase() })
			});
			const body = await res.json().catch(() => null);
			if (!res.ok) {
				const msg = body && (body.message || body.error) ? (body.message || body.error) : 'Không thể thêm thành viên';
				setAddMemberError(msg);
				return;
			}
			setAddMemberSuccess('Đã gửi lời mời');
			setNewMemberEmail('');
			setShowAddMember(false);
			// refresh group to reflect new invited member
			await refreshGroup();
		} catch (e) {
			console.error('handleAddMember error', e);
			setAddMemberError('Lỗi mạng');
		} finally {
			setAddingMember(false);
		}
	};
	// Invite single friend by email (from friends list)
	const handleInviteFriend = async (email) => {
		if (!groupId || !token || !email) return;
		setInvitingEmail(email);
		try {
			const res = await fetch(`${API_BASE}/api/groups/${encodeURIComponent(groupId)}/invite`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
				body: JSON.stringify({ email: email.trim().toLowerCase() })
			});
			const body = await res.json().catch(() => null);
			if (!res.ok) {
				alert((body && body.message) ? body.message : 'Không thể mời bạn này');
				return;
			}
			setAddMemberSuccess('Đã gửi lời mời');
			// refresh group and remove invited friend from list
			await refreshGroup();
			setFriendsList(prev => prev.filter(f => f.email !== email));
		} catch (e) {
			alert('Lỗi mạng');
		} finally {
			setInvitingEmail(null);
		}
	};

	// Color options
	const colorOptions = [
		'#4CAF50','#2196F3','#FF9800','#E91E63','#9C27B0',
		'#009688','#1a3b5d','#00b894','#FF5722','#673AB7',
		'#3F51B5','#00BCD4','#8BC34A','#FFC107','#F44336',
		'#795548','#607D8B','#9c88ff','#273c75','#16a085',
		'#27ae60','#2980b9','#8e44ad','#f39c12','#d35400'
	];
	
	// Gradient directions
	const gradientDirections = [
		{ value: '135deg', label: 'Chéo xuống' },
		{ value: '45deg', label: 'Chéo lên' },
		{ value: '90deg', label: 'Ngang' },
		{ value: '180deg', label: 'Dọc' },
		{ value: 'circle', label: 'Tròn' }
	];
	
	// Generate gradient background style
	const getGradientStyle = (colors, direction) => {
		if (!colors || !colors.length) return { background: '#1a3b5d' };
		if (colors.length === 1) return { background: colors[0] };
		
		if (direction === 'circle') {
			return { background: `radial-gradient(circle, ${colors.join(', ')})` };
		}
		return { background: `linear-gradient(${direction}, ${colors.join(', ')})` };
	};
	
	// Get the first letter of group name for avatar
	const getGroupInitial = (name) => {
		return name ? name.charAt(0).toUpperCase() : 'G';
	};
	
	// Get member initial for avatar
	const getMemberInitial = (member) => {
		if (member.name) return member.name.charAt(0).toUpperCase();
		if (member.email) return member.email.charAt(0).toUpperCase();
		return 'U';
	};

	// Format date for display (simple helper)
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

	// Inside the render method, update the layout structure for a banking-style interface:
	return (
		<div className="groups-page">
			<GroupSidebar active="groups" />
			<main className="group-manage-page">
				<h1>Quản lý nhóm</h1>
				
				{loading ? (
					<div className="gm-loading">
						<i className="fas fa-spinner fa-spin"></i>
						<div>Đang tải thông tin nhóm...</div>
					</div>
				) : !group ? (
					<div className="gm-error">
						<i className="fas fa-exclamation-triangle"></i> Không tìm thấy nhóm
					</div>
				) : (
					<>
						{/* Banking-style dashboard summary */}
						<div className="gm-dashboard">
							<div className="gm-dashboard-header">
								<h2 className="gm-dashboard-title">
									<i className="fas fa-layer-group"></i>
									{group.name}
								</h2>
								{isOwner && !editing && (
									<button className="gm-btn primary" onClick={() => setEditing(true)}>
										<i className="fas fa-edit"></i> Quản lý nhóm
									</button>
								)}
							</div>
							
							<div className="gm-dashboard-stats">
								<div className="gm-stat-item">
									<div className="gm-stat-label">
										<i className="fas fa-users"></i> Thành viên
									</div>
									<div className="gm-stat-value">{group.members ? group.members.length : 0}</div>
								</div>
								
								<div className="gm-stat-item">
									<div className="gm-stat-label">
										<i className="fas fa-user-shield"></i> Người quản lý
									</div>
									<div className="gm-stat-value">
										{group.owner && (group.owner.name || group.owner.email || "Chủ nhóm")}
									</div>
								</div>
								
								<div className="gm-stat-item">
									<div className="gm-stat-label">
										<i className="fas fa-calendar-alt"></i> Ngày tạo
									</div>
									<div className="gm-stat-value">{formatDate(group.createdAt) || "N/A"}</div>
								</div>
								
								<div className="gm-stat-item">
									<div className="gm-stat-label">
										<i className="fas fa-shield-alt"></i> Vai trò của bạn
									</div>
									<div className="gm-stat-value">{isOwner ? "Quản trị viên" : "Thành viên"}</div>
								</div>
							</div>
						</div>
						
						<div className="gm-layout">
							{editing ? (
								// Group editing form in banking-style
								<div className="gm-card gm-full-width">
									<div className="gm-card-header">
										<h2 className="gm-card-title">
											<i className="fas fa-cogs"></i> Chỉnh sửa thông tin nhóm
										</h2>
									</div>
									
									<div className="gm-card-body">
										<div className="gm-edit-form">
											<div className="gm-form-group">
												<label htmlFor="group-name">Tên nhóm</label>
												<input
													type="text"
													id="group-name"
													className="gm-form-input"
													value={editName}
													onChange={(e) => setEditName(e.target.value)}
													disabled={saving}
													placeholder="Nhập tên nhóm..."
												/>
											</div>
											
											<div className="gm-edit-color">
												<div>
													<label>Màu sắc nhóm</label>
													<div className="gm-color-picker">
														{colorOptions.map(c => (
															<button
																key={c}
																type="button"
																className={`gm-color-swatch${editColors.includes(c) ? ' selected' : ''}`}
																style={{ background: c }}
																onClick={() => setEditColors(prev => 
																	prev.includes(c) 
																	? prev.filter(x => x !== c) 
																	: [...prev, c]
																)}
															>
																{editColors.includes(c) && <span className="gm-color-check">✓</span>}
															</button>
														))}
													</div>
												</div>
												
												<div>
													<label>Hướng gradient</label>
													<div className="gm-direction-picker">
														{gradientDirections.map(dir => (
															<button
																key={dir.value}
																type="button"
																className={`gm-direction-btn${editDirection === dir.value ? ' selected' : ''}`}
																onClick={() => setEditDirection(dir.value)}
															>
																{dir.label}
															</button>
														))}
													</div>
												</div>
											</div>
											
											{/* Preview gradient - banking style */}
											<div 
												className="gm-group-preview" 
												style={getGradientStyle(editColors, editDirection)}
											>
												{editName || group.name}
											</div>
											
											<div className="gm-action-section">
												<button 
													className="gm-btn success" 
													onClick={handleSave}
													disabled={saving}
												>
													{saving ? 
														<><i className="fas fa-spinner fa-spin"></i> Đang lưu...</> : 
														<><i className="fas fa-check-circle"></i> Lưu thay đổi</>
													}
												</button>
												<button 
													className="gm-btn secondary" 
													onClick={() => setEditing(false)}
													disabled={saving}
												>
													<i className="fas fa-times-circle"></i> Hủy
												</button>
											</div>
											
											{error && (
												<div className="gm-error" style={{marginTop: 20, padding: 16, borderRadius: 10}}>
													<i className="fas fa-exclamation-circle"></i> {error}
												</div>
											)}
										</div>
									</div>
								</div>
							) : (
								<>
									{/* Group Information Card - Banking Style */}
									<div className="gm-card" style={{gridColumn: "1 / span 1"}}>
										<div className="gm-card-header">
											<h2 className="gm-card-title">
												<i className="fas fa-info-circle"></i> Thông tin nhóm
											</h2>
										</div>
										
										<div className="gm-card-body">
											<div className="gm-group-header">
												<div 
													className="gm-group-avatar" 
													style={getGradientStyle(
														group.color && typeof group.color === 'object' ? group.color.colors : ['#1a3b5d'], 
														group.color && typeof group.color === 'object' ? group.color.direction : '135deg'
													)}
												>
													{getGroupInitial(group.name)}
												</div>
												
												<div className="gm-group-info">
													<h2>{group.name}</h2>
													{group.description && <p>{group.description}</p>}
												</div>
											</div>
											
											<div className="gm-group-meta">
												<div className="gm-meta-item">
													<div className="gm-meta-label">
														<i className="fas fa-user-shield"></i> Người tạo
													</div>
													<div className="gm-meta-value">
														{group.owner && (group.owner.name || group.owner.email)}
													</div>
												</div>
												
												<div className="gm-meta-item">
													<div className="gm-meta-label">
														<i className="fas fa-users"></i> Số thành viên
													</div>
													<div className="gm-meta-value">
														{group.members ? group.members.length : 0}
													</div>
												</div>
												
												{group.createdAt && (
													<div className="gm-meta-item">
														<div className="gm-meta-label">
															<i className="fas fa-calendar-alt"></i> Ngày tạo
														</div>
														<div className="gm-meta-value">
															{formatDate(group.createdAt)}
														</div>
													</div>
												)}
											</div>
											
											{isOwner && (
												<div className="gm-action-section">
													<button className="gm-btn primary" onClick={() => setEditing(true)}>
														<i className="fas fa-edit"></i> Chỉnh sửa
													</button>
												</div>
											)}
										</div>
									</div>
									
									{/* Members Management - Banking Style */}
									<div className="gm-card" style={{gridColumn: "2 / -1"}}>
										<div className="gm-card-header">
											<h2 className="gm-card-title">
												<i className="fas fa-users"></i> Thành viên nhóm
											</h2>
											{isOwner && (
												<button 
													className="gm-btn primary" 
													onClick={() => { setShowAddMember(!showAddMember); setAddMemberError(''); setAddMemberSuccess(''); }}
												>
													{showAddMember ? 
														<><i className="fas fa-times"></i> Đóng</> : 
														<><i className="fas fa-user-plus"></i> Thêm thành viên</>
													}
												</button>
											)}
										</div>
										
										<div className="gm-card-body">
											{/* Add member form - Banking Style */}
											{isOwner && showAddMember && (
												<div className="gm-add-member">
													{/* manual email invite (fallback) */}
													<div className="gm-add-member-form">
														<input
															type="email"
															placeholder="Nhập email thành viên..."
															value={newMemberEmail}
															onChange={e => setNewMemberEmail(e.target.value)}
															className="gm-form-input"
															disabled={addingMember}
														/>
														<button className="gm-btn success" onClick={handleAddMember} disabled={addingMember}>
															{addingMember ? 'Đang thêm...' : 'Thêm'}
														</button>
													</div>
													{addMemberError && <div className="gm-error" style={{ marginTop: 8 }}>{addMemberError}</div>}
													{addMemberSuccess && <div className="gm-success-message" style={{ marginTop: 8 }}>{addMemberSuccess}</div>}

													{/* friends list: show only friends who are NOT already in group */}
													<div style={{ marginTop: 14 }}>
														<strong>Bạn bè của bạn</strong>
														{loadingFriends ? (
															<div style={{ marginTop: 8 }}>Đang tải...</div>
														) : (
															(() => {
																// build sets of existing members by email/userId
																const existingEmails = new Set((group && group.members ? group.members.map(m => (m.email || (m.user && (m.user.email || ''))).toString().toLowerCase().trim()) : []).filter(Boolean));
																const existingUserIds = new Set((group && group.members ? group.members.map(m => (m.user && (m.user._id ? m.user._id : m.user)) || '').map(x => x && String(x)) : []).filter(Boolean));
																const visible = friendsList.filter(f => {
																	if (!f) return false;
																	const fid = f.id ? String(f.id) : '';
																	const femail = (f.email||'').toLowerCase().trim();
																	if (femail && existingEmails.has(femail)) return false;
																	if (fid && existingUserIds.has(fid)) return false;
																	return true;
																});

																if (!visible.length) return <div className="gm-error" style={{ marginTop: 8 }}>Không còn bạn bè nào chưa có trong nhóm</div>;

																return (
																	<ul className="gm-friends-list" style={{ marginTop: 8 }}>
																		{visible.map(f => (
																			<li key={f.email} className="gm-friend-item" style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid #eef2f6' }}>
																				<div>
																					<div style={{ fontWeight:600 }}>{f.name}</div>
																					<div style={{ fontSize:12, color:'#64748b' }}>{f.email}</div>
																				</div>
																				<div>
																					<button
																						className="gm-btn success sm"
																						onClick={() => handleInviteFriend(f.email)}
																						disabled={invitingEmail === f.email}
																					>
																						{invitingEmail === f.email ? 'Đang gửi...' : 'Mời'}
																					</button>
																				</div>
																			</li>
																		))}
																	</ul>
																);
															})()
														)}
													</div>
												</div>
											)}
											
											{/* Members list - Banking Style */}
											{group.members && group.members.length > 0 ? (
												<ul className="gm-members-list">
													{group.members.map(member => {
														// normalize member user id (handle populated object or raw id)
														const memberUserId = member.user && (member.user._id ? member.user._id : member.user);
														// determine owner: by user id OR by email matching owner's email (for invited-only entries)
														const isMemberOwner = String(getOwnerId(group)) === String(memberUserId)
															|| (member.email && group.owner && String((group.owner.email || '')).toLowerCase().trim() === String(member.email).toLowerCase().trim());
														// memberId to send: prefer user id, fallback to email (lowercased)
														const memberId = memberUserId ? String(memberUserId) : (member.email ? String(member.email).toLowerCase().trim() : null);

														return (
															<li key={memberId || `${member.email||''}`} className="gm-member-item">
																<div 
																	className="gm-member-avatar" 
																	style={isMemberOwner ? 
																		getGradientStyle(['#1a3b5d', '#4a6fa1'], '135deg') : 
																		{background: '#f1f5f9', color: '#334155'}
																	}
																>
																	{getMemberInitial(member)}
																</div>
																
																<div className="gm-member-info">
																	<div className="gm-member-name">
																		{member.name || member.email || 'Thành viên'}
																		{isMemberOwner && (
																			<span className="gm-owner-badge">
																				<i className="fas fa-crown"></i> Quản trị viên
																			</span>
																		)}
																	</div>
																	{member.email && (
																		<div className="gm-member-email">
																			<i className="fas fa-envelope"></i> {member.email}
																		</div>
																	)}
																</div>
																
																{/* only owner may remove other members */}
																{isOwner && !isMemberOwner && memberId && (
																	<div className="gm-member-actions">
																		<button
																			className="gm-btn danger sm"
																			onClick={() => handleRemoveMember(memberId)}
																			disabled={String(removingMemberId) === String(memberId)}
																		>
																			{String(removingMemberId) === String(memberId) ? (
																				<><i className="fas fa-spinner fa-spin"></i> Đang xóa</>
																			) : (
																				<><i className="fas fa-user-minus"></i> Xóa</>
																			)}
																		</button>
																	</div>
																)}
															</li>
														);
													})}
												</ul>
											) : (
												<div className="gm-empty-state">
													<i className="fas fa-users-slash"></i>
													<div className="gm-empty-state-text">Chưa có thành viên nào trong nhóm</div>
													{isOwner && !showAddMember && (
														<button className="gm-btn primary" onClick={() => setShowAddMember(true)}>
															<i className="fas fa-user-plus"></i> Thêm thành viên đầu tiên
														</button>
													)}
												</div>
											)}
										</div>
									</div>
								</>
							)}
							
							{/* Danger Zone - Banking Style (only for owner) */}
							{isOwner && !editing && (
								<div className="gm-card gm-full-width">
									<div className="gm-card-header">
										<h2 className="gm-card-title" style={{color: '#b91c1c'}}>
											<i className="fas fa-exclamation-triangle"></i> Vùng nguy hiểm
										</h2>
									</div>
									
									<div className="gm-card-body">
										<div className="gm-delete-section">
											<div className="gm-delete-section-title">
												<i className="fas fa-trash-alt"></i> Xóa nhóm
											</div>
											<div className="gm-delete-section-text">
												Hành động này không thể hoàn tác. Nhóm sẽ bị xóa vĩnh viễn cùng với tất cả dữ liệu và thành viên liên quan.
											</div>
											<button 
												className="gm-btn danger" 
												onClick={handleDeleteGroup}
												disabled={deleting}
											>
												{deleting ? (
													<><i className="fas fa-spinner fa-spin"></i> Đang xóa...</>
												) : (
													<><i className="fas fa-trash-alt"></i> Xóa vĩnh viễn</>
												)}
											</button>
										</div>
									</div>
								</div>
							)}
						</div>
					</>
				)}
			</main>
		</div>
	);
}
