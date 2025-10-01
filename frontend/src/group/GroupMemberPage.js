import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import GroupSidebar from './GroupSidebar';
import './GroupMemberPage.css';

export default function GroupMemberPage() {
	const { groupId } = useParams();
	const navigate = useNavigate();
	const [group, setGroup] = useState(null);
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
	
	useEffect(() => {
		if (!groupId || !token) return;
		setLoading(true);
		fetch(`${API_BASE}/api/groups/${groupId}`, {
			headers: { Authorization: `Bearer ${token}` }
		})
			.then(res => res.json())
			.then(data => { setGroup(data); setLoading(false); })
			.catch(() => setLoading(false));
	}, [groupId, token]);

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
				alert('Không thể rời nhóm');
				setLeaving(false);
				return;
			}
			alert('Bạn đã rời nhóm');
			navigate('/groups');
		} catch (e) {
			alert('Lỗi mạng');
		} finally {
			setLeaving(false);
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
		if (member.name) return member.name.charAt(0).toUpperCase();
		if (member.email) return member.email.charAt(0).toUpperCase();
		return 'U';
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
								
								{isOwner && (
									<button 
										className="gm-btn primary"
										onClick={() => navigate(`/groups/${groupId}/manage`)}
									>
										<i className="fas fa-cogs"></i> Quản lý nhóm
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
						</div>
					</>
				)}
			</main>
		</div>
	);
}
									
