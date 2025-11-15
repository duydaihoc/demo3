import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import GroupSidebar from './GroupSidebar';
import GroupCharts from './GroupCharts';
import './GroupMemberPage.css';
import './GroupCharts.css';


export default function GroupMemberPage() {
	const { groupId } = useParams();
	const navigate = useNavigate();
	const [group, setGroup] = useState(null);
	// NEW: transactions + loading + debts
	const [txs, setTxs] = useState([]);
	const [loadingTxs, setLoadingTxs] = useState(false);
	const [txError, setTxError] = useState('');
	const [loading, setLoading] = useState(true);
	const [leaving, setLeaving] = useState(false);

	const API_BASE = 'http://localhost:5000';
	const token = localStorage.getItem('token');

	// Helper: lấy userId hiện tại từ token
	const getMyId = () => {
		try {
			const t = token;
			if (!t) return '';
			const payload = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
			return payload.id || payload._id || payload.userId || '';
		} catch (e) { return ''; }
	};

	const getOwnerId = (g) => g && g.owner && (g.owner._id || g.owner.id || g.owner);

	const isOwner = group && String(getOwnerId(group)) === String(getMyId());
	
	const getMyEmail = () => {
		try {
			const t = token;
			if (!t) return '';
			const payload = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
			return (payload.email || '').toLowerCase();
		} catch (e) { return ''; }
	};

	const fetchTxs = async () => {
		if (!groupId || !token) return;
		setLoadingTxs(true);
		setTxError('');
		try {
			const res = await fetch(`${API_BASE}/api/groups/${groupId}/transactions`, {
				headers: { Authorization: `Bearer ${token}` }
			});
			if (!res.ok) { setTxs([]); setTxError('Không thể tải giao dịch'); setLoadingTxs(false); return; }
			const data = await res.json();
			setTxs(Array.isArray(data) ? data : []);
		} catch (e) {
			console.warn('fetchTxs', e);
			setTxError('Lỗi mạng khi tải giao dịch');
			setTxs([]);
		} finally {
			setLoadingTxs(false);
		}
	};

	// NEW: allow leaving group (used by "Rời nhóm" button)
	const handleLeaveGroup = async () => {
		if (!groupId || !token) return;
		if (!window.confirm('Bạn có chắc muốn rời nhóm này?')) return;
		setLeaving(true);
		try {
			const myId = getMyId();
			const res = await fetch(`${API_BASE}/api/groups/${groupId}/remove-member`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
				body: JSON.stringify({ memberId: myId })
			});
			if (!res.ok) {
				const err = await res.json().catch(()=>null);
				alert((err && err.message) ? err.message : 'Không thể rời nhóm');
				setLeaving(false);
				return;
			}
			alert('Bạn đã rời nhóm');
			navigate('/groups');
		} catch (e) {
			console.warn('handleLeaveGroup error', e);
			alert('Lỗi mạng');
		} finally {
			setLeaving(false);
		}
	};

	useEffect(() => {
		if (!groupId || !token) return;
		setLoading(true);
		fetch(`${API_BASE}/api/groups/${groupId}`, {
			headers: { Authorization: `Bearer ${token}` }
		})
			.then(res => res.json())
			.then(data => { setGroup(data); setLoading(false); })
			.catch(() => setLoading(false));

		// also load txs
		fetchTxs();
		// eslint-disable-next-line
	}, [groupId, token]);

	const computeDebts = () => {
		const myId = getMyId();
		const myEmail = getMyEmail();
		const owesMe = [];
		const iOwe = [];
		for (const tx of txs) {
			const payerId = tx.payer && (tx.payer._id || tx.payer);

			// determine creator id/email
			let creatorId = null;
			let creatorEmail = null;
			if (tx.createdBy) {
				if (typeof tx.createdBy === 'object') {
					creatorId = tx.createdBy._id || tx.createdBy.id || null;
					creatorEmail = (tx.createdBy.email || '').toLowerCase();
				} else {
					const c = String(tx.createdBy);
					if (c.includes('@')) creatorEmail = c.toLowerCase();
					else creatorId = c;
				}
			}

			if (Array.isArray(tx.participants)) {
				for (const p of tx.participants) {
					const partUserId = p.user && (p.user._id || p.user);
					const partEmail = (p.email || '').toLowerCase();

					const isPartCreator = Boolean(
						(creatorId && partUserId && String(creatorId) === String(partUserId)) ||
						(creatorEmail && partEmail && String(creatorEmail) === String(partEmail))
					);

					if (String(payerId) === String(myId)) {
						if (!p.settled && !isPartCreator) owesMe.push({ tx, participant: p });
					}
					if (!p.settled && ((partUserId && String(partUserId) === String(myId)) || (partEmail && myEmail && partEmail === myEmail)) && !isPartCreator) {
						iOwe.push({ tx, participant: p });
					}
				}
			}
		}
		return { owesMe, iOwe };
	};

	const handleSettle = async (txId, participantUserId = null) => {
		if (!token || !groupId || !txId) return;
		try {
			const body = participantUserId ? { userId: participantUserId } : {};
			const res = await fetch(`${API_BASE}/api/groups/${groupId}/transactions/${txId}/settle`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
				body: Object.keys(body).length ? JSON.stringify(body) : undefined
			});
			if (!res.ok) {
				const err = await res.json().catch(() => null);
				alert((err && err.message) ? err.message : 'Không thể đánh dấu đã thanh toán');
				return;
			}
			await fetchTxs();
		} catch (e) {
			console.warn('handleSettle', e);
			alert('Lỗi mạng khi đánh dấu thanh toán');
		}
	};

	// Format date for display
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
		if (member.email) return member.email.charAt(0).toUpperCase();
		return 'U';
	};

	// Thêm hàm tra cứu tên/email từ id
	const getUserNameById = (userId) => {
		if (!userId) return null;
		// check owner first
		if (group && group.owner) {
			const ownerId = group.owner && (group.owner._id || group.owner.id || group.owner);
			if (ownerId && String(ownerId) === String(userId)) {
				return group.owner.name || group.owner.email || String(userId);
			}
		}
		// then members
		if (group && Array.isArray(group.members)) {
			const member = group.members.find(m => {
				const mUserId = m.user && (m.user._id ? String(m.user._id) : String(m.user));
				return mUserId && String(mUserId) === String(userId);
			});
			if (member) {
				// Ưu tiên lấy tên từ member.user.name, nếu không có thì member.name, cuối cùng mới là email
				if (member.user && typeof member.user === 'object') {
					return member.user.name || member.user.email || member.name || member.email || String(userId);
				}
				return member.name || member.email || String(userId);
			}
		}
		return null;
	};

	return (
		<div className="groups-page">
			<GroupSidebar active="groups" />
			<main className="group-member-page">
				<h1>Thông tin nhóm</h1>
				
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
								
								{/* Show actions: quản lý chỉ owner, giao dịch cho mọi thành viên */}
								<div style={{display:'flex', gap:8, alignItems:'center'}}>
									{isOwner && (
										<button 
											className="gm-btn primary"
											onClick={() => navigate(`/groups/${groupId}/manage`)}
										>
											<i className="fas fa-cogs"></i> Quản lý nhóm
										</button>
									)}
									<button
										className="gm-btn primary"
										onClick={() => navigate(`/groups/${groupId}/transactions`)}
										style={{background:'#0ea5e9', border:'none', color:'white'}}
									>
										<i className="fas fa-exchange-alt"></i> Giao dịch
									</button>
								</div>
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
										<i className="fas fa-shield-alt"></i> Vai trò của bạn
									</div>
									<div className="gm-stat-value">{isOwner ? "Quản trị viên" : "Thành viên"}</div>
								</div>
							</div>
						</div>
						
						<div className="gm-layout">
							{/* Group Information Card */}
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
									
									{group.createdAt && (
										<div style={{marginTop: 20, color: '#64748b', fontSize: '0.9rem'}}>
											<i className="fas fa-calendar-alt"></i> Ngày tạo: {formatDate(group.createdAt)}
										</div>
									)}
									
									{!isOwner && (
										<div className="gm-leave-section" style={{marginTop: 24}}>
											<div className="gm-leave-section-title">
												<i className="fas fa-sign-out-alt"></i> Rời nhóm
											</div>
											<div className="gm-leave-section-text">
												Khi rời nhóm, bạn sẽ không còn quyền truy cập vào nội dung của nhóm này nữa.
												Bạn có thể được thêm lại vào nhóm bởi quản trị viên trong tương lai.
											</div>
											<button 
												className="gm-btn leave" 
												onClick={handleLeaveGroup}
												disabled={leaving}
											>
												{leaving ? (
													<><i className="fas fa-spinner fa-spin"></i> Đang xử lý...</>
												) : (
													<><i className="fas fa-sign-out-alt"></i> Rời nhóm</>
												)}
											</button>
										</div>
									)}
								</div>
							</div>
							
							{/* Members Card */}
							<div className="gm-card" style={{gridColumn: "2 / -1"}}>
								<div className="gm-card-header">
									<h2 className="gm-card-title">
										<i className="fas fa-users"></i> Thành viên nhóm
									</h2>
								</div>
								
								<div className="gm-card-body">
									{group.members && group.members.length > 0 ? (
										<ul className="gm-members-list">
											{group.members.map(member => {
												// normalize member user id (handle populated object or raw id)
												const memberUserId = member.user && (member.user._id ? member.user._id : member.user);
												// determine owner: by user id OR by email matching owner's email
												const isMemberOwner = String(getOwnerId(group)) === String(memberUserId)
													|| (member.email && group.owner && String((group.owner.email || '')).toLowerCase().trim() === String(member.email).toLowerCase().trim());
												
												// Check if this member is the current user
												const isCurrentUser = String(memberUserId) === String(getMyId());
												const displayName = member.name || member.email || (memberUserId ? String(memberUserId).substring(0, 8) + '...' : 'Thành viên');

												return (
													<li key={member.email || memberUserId} className="gm-member-item">
														<div 
															className="gm-member-avatar" 
															style={isMemberOwner ? 
																getGradientStyle(['#1a3b5d', '#4a6fa1'], '135deg') : 
																isCurrentUser ? 
																	{background: '#10b981', color: 'white'} : 
																	{background: '#f1f5f9', color: '#334155'}
															}
														>
															{getMemberInitial(member)}
														</div>
														
														<div className="gm-member-info">
															<div className="gm-member-name">
																{displayName}
																{isMemberOwner && (
																	<span className="gm-owner-badge">
																		<i className="fas fa-crown"></i> Quản trị viên
																	</span>
																)}
																{isCurrentUser && !isMemberOwner && (
																	<span className="gm-owner-badge" style={{background: '#ecfdf5', color: '#065f46'}}>
																		<i className="fas fa-user"></i> Bạn
																	</span>
																)}
															</div>
															{member.email && (
																<div className="gm-member-email">
																	<i className="fas fa-envelope"></i> {member.email}
																</div>
															)}
														</div>
													</li>
												);
											})}
										</ul>
									) : (
										<div className="gm-empty-state">
											<i className="fas fa-users-slash"></i>
											<div className="gm-empty-state-text">Chưa có thành viên nào trong nhóm</div>
										</div>
									)}
								</div>
							</div>

							{/* NEW: Activity card - Thay đổi gridColumn */}
							<div className="gm-card" style={{gridColumn: "1 / span 1"}}>
								<div className="gm-card-header">
									<h2 className="gm-card-title"><i className="fas fa-stream"></i> Hoạt động nhóm</h2>
									<button className="gm-btn secondary" onClick={fetchTxs}>Làm mới</button>
								</div>
								<div className="gm-card-body">
									{loadingTxs ? <div className="gm-loading-inline">Đang tải hoạt động...</div> :
										txError ? <div className="gm-error">{txError}</div> :
										txs.length === 0 ? <div className="gm-empty-state-text">Chưa có hoạt động</div> :
										<>
											{/* Transaction Type Legend */}
											<div style={{marginBottom: 16, padding: 12, background: 'linear-gradient(135deg, #f8fafc 0%, #e7e5e4 100%)', borderRadius: 12, fontSize: 12}}>
												<div style={{fontWeight: 700, marginBottom: 8, color: '#334155'}}><i className="fas fa-info-circle"></i> Loại giao dịch:</div>
												<div style={{display: 'flex', flexWrap: 'wrap', gap: 8}}>
													<span style={{padding: '4px 10px', background: '#dbeafe', color: '#1e40af', borderRadius: 8, fontSize: 11, fontWeight: 600}}>
														<i className="fas fa-divide"></i> Chia đều
													</span>
													<span style={{padding: '4px 10px', background: '#d1fae5', color: '#065f46', borderRadius: 8, fontSize: 11, fontWeight: 600}}>
														<i className="fas fa-user"></i> Trả hộ
													</span>
													<span style={{padding: '4px 10px', background: '#fef3c7', color: '#92400e', borderRadius: 8, fontSize: 11, fontWeight: 600}}>
														<i className="fas fa-percent"></i> Phần trăm
													</span>
													<span style={{padding: '4px 10px', background: '#fce7f3', color: '#831843', borderRadius: 8, fontSize: 11, fontWeight: 600}}>
														<i className="fas fa-wallet"></i> Cá nhân
													</span>
													<span style={{padding: '4px 10px', background: '#dcfce7', color: '#14532d', borderRadius: 8, fontSize: 11, fontWeight: 600}}>
														<i className="fas fa-check-circle"></i> Đã trả nợ
													</span>
												</div>
											</div>
											
											<ul className="gm-members-list gm-activity-list">
												{txs.map(tx => {
													const getTransactionTypeInfo = (type) => {
														switch(type) {
															case 'equal_split':
																return { icon: 'fa-divide', label: 'Chia đều', color: '#1e40af', bg: '#dbeafe' };
															case 'payer_for_others':
																return { icon: 'fa-user', label: 'Trả hộ', color: '#065f46', bg: '#d1fae5' };
															case 'percentage_split':
																return { icon: 'fa-percent', label: 'Phần trăm', color: '#92400e', bg: '#fef3c7' };
															case 'payer_single':
																return { icon: 'fa-wallet', label: 'Cá nhân', color: '#831843', bg: '#fce7f3' };
															default:
																return { icon: 'fa-exchange-alt', label: 'Giao dịch', color: '#64748b', bg: '#f1f5f9' };
														}
													};
													
													const typeInfo = getTransactionTypeInfo(tx.transactionType);
													const settledCount = tx.participants?.filter(p => p.settled).length || 0;
													const totalParticipants = tx.participants?.length || 0;
													const allSettled = totalParticipants > 0 && settledCount === totalParticipants;
													
													return (
														<li key={tx._id} className="gm-member-item" style={{position: 'relative', overflow: 'visible'}}>
															{allSettled && (
																<div style={{
																	position: 'absolute',
																	top: -8,
																	right: -8,
																	background: '#dcfce7',
																	color: '#14532d',
																	padding: '4px 10px',
																	borderRadius: 12,
																	fontSize: 11,
																	fontWeight: 700,
																	zIndex: 10,
																	boxShadow: '0 2px 8px rgba(20, 83, 45, 0.2)'
																}}>
																	<i className="fas fa-check-circle"></i> Đã thanh toán
																</div>
															)}
															<div style={{flex:1}}>
																<div style={{display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4}}>
																	<span style={{
																		padding: '3px 8px',
																		background: typeInfo.bg,
																		color: typeInfo.color,
																		borderRadius: 6,
																		fontSize: 10,
																		fontWeight: 700
																	}}>
																		<i className={`fas ${typeInfo.icon}`}></i> {typeInfo.label}
																	</span>
																	<div style={{fontWeight:700, color: allSettled ? '#059669' : '#0f172a'}}>
																		{tx.title || 'Giao dịch'}
																	</div>
																</div>
																<div style={{fontSize:12, color:'#64748b', marginBottom: 4}}>
																	<i className="fas fa-user"></i> {tx.payer ? (tx.payer.name || tx.payer.email) : 'Người trả'} • {new Date(tx.date || tx.createdAt).toLocaleDateString('vi-VN')}
																</div>
																{tx.description && <div style={{marginTop:4,color:'#475569', fontSize: 12}}>{tx.description}</div>}
																{totalParticipants > 0 && (
																	<div style={{marginTop: 6, fontSize: 11, color: settledCount === totalParticipants ? '#059669' : '#f59e0b'}}>
																		<i className={`fas ${settledCount === totalParticipants ? 'fa-check-circle' : 'fa-clock'}`}></i> 
																		{settledCount}/{totalParticipants} người đã trả
																	</div>
																)}
															</div>
															<div style={{textAlign:'right'}}>
																<div style={{fontWeight:800, fontSize: 16, color: allSettled ? '#059669' : '#0f172a'}}>
																	{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(tx.amount || 0)}
																</div>
																{tx.category && (
																	<div style={{fontSize:11,color:'#64748b', marginTop: 4}}>
																		{tx.category.icon && <span style={{marginRight: 4}}>{tx.category.icon}</span>}
																		{tx.category.name}
																	</div>
																)}
															</div>
														</li>
													);
												})}
											</ul>
										</>
									}
								</div>
							</div>

							{/* ADD: Charts */}
							<div style={{gridColumn: "1 / span 1"}}>
								<GroupCharts txs={txs} members={group ? group.members : []} />
							</div>

							{/* NEW: Debts card - Thay đổi gridColumn */}
							<div className="gm-card" style={{gridColumn: "2 / -1"}}>
								<div className="gm-card-header">
									<h2 className="gm-card-title"><i className="fas fa-hand-holding-usd"></i> Công nợ</h2>
								</div>
								<div className="gm-card-body">
									{loadingTxs ? <div className="gm-loading-inline">Đang tải...</div> : (() => {
										const { owesMe, iOwe } = computeDebts();
										
										// Tính tổng tiền người khác nợ mình
										const totalOwedToMe = owesMe.reduce((total, entry) => {
											return total + (entry.participant.shareAmount || 0);
										}, 0);
										
										// Tính tổng tiền mình nợ người khác
										const totalIowe = iOwe.reduce((total, entry) => {
											return total + (entry.participant.shareAmount || 0);
										}, 0);
										
										// Tính toán chênh lệch công nợ
										const netBalance = totalOwedToMe - totalIowe;
										
										return (
											<>
												{/* Thêm card tổng hợp công nợ */}
												<div className="gm-debt-summary">
													<div className="gm-debt-summary-cards">
														<div className="gm-debt-summary-card income">
															<div className="gm-debt-summary-label">
																<i className="fas fa-arrow-circle-down"></i> Người nợ bạn
															</div>
															<div className="gm-debt-summary-amount">
																{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(totalOwedToMe)}
															</div>
														</div>
														<div className="gm-debt-summary-card expense">
															<div className="gm-debt-summary-label">
																<i className="fas fa-arrow-circle-up"></i> Bạn nợ người
															</div>
															<div className="gm-debt-summary-amount">
																{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(totalIowe)}
															</div>
														</div>
														<div className={`gm-debt-summary-card balance ${netBalance >= 0 ? 'positive' : 'negative'}`}>
															<div className="gm-debt-summary-label">
																<i className={`fas ${netBalance >= 0 ? 'fa-plus-circle' : 'fa-minus-circle'}`}></i> Chênh lệch
															</div>
															<div className="gm-debt-summary-amount">
																{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Math.abs(netBalance))}
																<div className="gm-debt-summary-direction">
																	{netBalance > 0 ? 'Bạn nhận về' : netBalance < 0 ? 'Bạn cần trả' : 'Bằng nhau'}
																</div>
															</div>
														</div>
													</div>
													<hr style={{margin:'20px 0',borderColor:'#e8eef5'}} />
												</div>
												<h3 style={{marginTop:0}}>Người nợ bạn</h3>
												{owesMe.length === 0 ? <div className="gm-empty-state-text">Không có ai nợ bạn</div> :
													<ul className="gm-members-list">
														{owesMe.map((entry,i) => {
															const p = entry.participant;
																const name = p.user ? (p.user.name || p.user.email) : (p.email || 'Người trả');
															return (
																<li key={i} className="gm-member-item">
																	<div style={{flex:1}}>
																		<div className="gm-member-name">{name}</div>
																		<div className="gm-member-email">Giao dịch: {entry.tx.title || 'Không tiêu đề'}</div>
																	</div>
																	<div style={{textAlign:'right'}}>
																		<div style={{fontWeight:700}}>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(p.shareAmount || 0)}</div>
																		<button className="gm-btn success" onClick={() => handleSettle(entry.tx._id, (p.user && (p.user._id || p.user)) || null)}>Đã nhận</button>
																	</div>
																</li>
															);
														})}
													</ul>
												}

												<hr style={{margin:'16px 0',borderColor:'#e8eef5'}} />

												<h3>Mình nợ người</h3>
												{iOwe.length === 0 ? <div className="gm-empty-state-text">Bạn không nợ ai</div> :
													<ul className="gm-members-list">
														{iOwe.map((entry,i) => {
															const tx = entry.tx;
															const p = entry.participant;
															
															// Lấy thông tin người tạo/payer
															let payerName = 'Người trả';
															
															// Ưu tiên lấy từ createdBy (thường được populate đầy đủ hơn)
															if (tx.createdBy && typeof tx.createdBy === 'object') {
																payerName = tx.createdBy.name || (tx.createdBy.email ? tx.createdBy.email.split('@')[0] : 'Người trả');
															} else if (tx.payer && typeof tx.payer === 'object') {
																payerName = tx.payer.name || (tx.payer.email ? tx.payer.email.split('@')[0] : 'Người trả');
															} else {
																// Fallback: thử getUserNameById
																const payerId = tx.createdBy || tx.payer;
																const resolved = getUserNameById(payerId);
																if (resolved) {
																	// Nếu resolved là email, extract tên
																	payerName = resolved.includes('@') ? resolved.split('@')[0] : resolved;
																}
															}
															
															return (
																<li key={i} className="gm-member-item">
																	<div style={{flex:1}}>
																		<div className="gm-member-name">{payerName}</div>
																		<div className="gm-member-email">Giao dịch: {tx.title || 'Không tiêu đề'}</div>
																	</div>
																	<div style={{textAlign:'right'}}>
																		<div style={{fontWeight:700}}>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(p.shareAmount || 0)}</div>
																		<button className="gm-btn primary" onClick={() => handleSettle(tx._id)}>Đã trả</button>
																	</div>
																</li>
															);
														})}
													</ul>
												}
											</>
										);
									})()}
								</div>
							</div>
						</div>
					</>
				)}
			</main>
		</div>
	);
}


