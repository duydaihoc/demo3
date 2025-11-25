import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import GroupSidebar from './GroupSidebar';
import GroupCharts from './GroupCharts';
import GroupActivityFeed from './GroupActivityFeed';
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
	// Add member states
	const [showAddMember, setShowAddMember] = useState(false);
	const [newMemberEmail, setNewMemberEmail] = useState('');
	const [addingMember, setAddingMember] = useState(false);
	const [addMemberError, setAddMemberError] = useState('');
	const [addMemberSuccess, setAddMemberSuccess] = useState('');
	const [friendsList, setFriendsList] = useState([]);
	const [loadingFriends, setLoadingFriends] = useState(false);
	const [selectedFriends, setSelectedFriends] = useState([]);
	
	// Pending invites for this group
	const [pendingInvites, setPendingInvites] = useState([]);
	const [loadingInvites, setLoadingInvites] = useState(false);

	// Tab state
	const [activeTab, setActiveTab] = useState('members');
	const [activitySubTab, setActivitySubTab] = useState('transactions'); // 'transactions' or 'posts'

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
		} catch (e) {
			console.warn('refreshGroup error', e);
		} finally {
			setLoading(false);
		}
	};

	// Fetch pending invites for this group - lấy từ Group model và Notifications
	const fetchPendingInvites = async () => {
		if (!groupId || !token) return;
		
		setLoadingInvites(true);
		try {
			const myId = getMyId();
			
			// Lấy lời mời từ Group model (đảm bảo không mất khi reload)
			const groupRes = await fetch(`${API_BASE}/api/groups/${groupId}`, {
				headers: { Authorization: `Bearer ${token}` }
			});
			const groupData = groupRes.ok ? await groupRes.json().catch(() => null) : null;
			const groupInvites = groupData?.pendingInvites || [];
			
			// Lấy notifications để có thông tin đầy đủ
			const notifRes = await fetch(`${API_BASE}/api/notifications`, {
				headers: { Authorization: `Bearer ${token}` }
			});
			const notifData = notifRes.ok ? await notifRes.json().catch(() => []) : [];
			const notifications = Array.isArray(notifData) ? notifData : (Array.isArray(notifData.notifications) ? notifData.notifications : []);
			
			// Kết hợp lời mời từ Group model và Notifications
			// Ưu tiên lấy từ Group model (đảm bảo không mất), bổ sung thông tin từ Notifications
			const inviteMap = new Map();
			
			// Thêm lời mời từ Group model
			groupInvites.forEach(invite => {
				if (String(invite.invitedBy?._id || invite.invitedBy) === String(myId)) {
					const key = invite.email || String(invite.userId?._id || invite.userId);
					inviteMap.set(key, {
						_id: invite.notificationId || `group-${invite.email}`,
						type: 'group.invite',
						recipient: invite.userId ? { _id: invite.userId._id || invite.userId, email: invite.email, name: invite.userId.name } : { email: invite.email },
						sender: { _id: invite.invitedBy._id || invite.invitedBy },
						data: { groupId, email: invite.email, groupName: groupData?.name },
						status: invite.status,
						createdAt: invite.invitedAt,
						inviteStatus: invite.status
					});
				}
			});
			
			// Lấy tất cả lời mời (group.invite) từ Notifications cho group này mà mình là người gửi
			const inviteNotifications = notifications.filter(notif => {
				if (notif.type !== 'group.invite') return false;
				if (!notif.data?.groupId) return false;
				
				// So sánh groupId (có thể là ObjectId hoặc string)
				const notifGroupId = String(notif.data.groupId);
				const currentGroupId = String(groupId);
				if (notifGroupId !== currentGroupId) return false;
				
				// Kiểm tra mình là người gửi
				const senderId = notif.sender?._id || notif.sender;
				if (!senderId) return false;
				return String(senderId) === String(myId);
			});
			
			// Cập nhật thông tin từ Notifications vào map
			inviteNotifications.forEach(notif => {
				const recipientEmail = (notif.data?.email || notif.recipient?.email || '').toLowerCase().trim();
				const recipientId = notif.recipient?._id || notif.recipient;
				const key = recipientEmail || String(recipientId);
				
				if (inviteMap.has(key)) {
					// Cập nhật thông tin từ notification
					const existing = inviteMap.get(key);
					inviteMap.set(key, {
						...existing,
						_id: notif._id || existing._id,
						recipient: notif.recipient || existing.recipient,
						sender: notif.sender || existing.sender,
						data: notif.data || existing.data,
						createdAt: notif.createdAt || existing.createdAt,
						// Giữ status từ Group model nếu có
						inviteStatus: existing.inviteStatus || 'pending'
					});
				} else {
					// Thêm lời mời mới từ notification (nếu chưa có trong Group model)
					inviteMap.set(key, {
						...notif,
						inviteStatus: 'pending'
					});
				}
			});
			
			// Chuyển map thành array
			const allInvites = Array.from(inviteMap.values());
			
			// Lấy các notification response để xác định trạng thái
			// Response notification: sender là người được mời (người phản hồi), recipient là owner
			const responseNotifications = notifications.filter(notif => {
				if (notif.type !== 'group.invite.accepted' && notif.type !== 'group.invite.rejected') return false;
				if (!notif.data?.groupId) return false;
				
				// So sánh groupId (có thể là ObjectId hoặc string)
				const notifGroupId = String(notif.data.groupId);
				const currentGroupId = String(groupId);
				if (notifGroupId !== currentGroupId) return false;
				
				// Kiểm tra recipient là mình (owner nhận thông báo phản hồi)
				const recipientId = notif.recipient?._id || notif.recipient;
				if (!recipientId || String(recipientId) !== String(myId)) return false;
				return true;
			});
			
			// Tạo map để tra cứu trạng thái nhanh
			// Key: recipient ID/email của lời mời (người được mời)
			// Value: status (accepted/rejected)
			const statusMap = new Map();
			responseNotifications.forEach(resp => {
				// Trong response notification, sender là người được mời (người phản hồi)
				const invitedUserId = resp.sender?._id || resp.sender || resp.data?.userId;
				const invitedUserEmail = (resp.data?.email || resp.sender?.email || '').toLowerCase().trim();
				const status = resp.type === 'group.invite.accepted' ? 'accepted' : 'rejected';
				
				// Lưu theo cả ID và email để matching chính xác hơn
				if (invitedUserId) {
					statusMap.set(`id:${String(invitedUserId)}`, status);
				}
				if (invitedUserEmail) {
					statusMap.set(`email:${invitedUserEmail}`, status);
				}
			});
			
			// Gắn trạng thái cho mỗi lời mời (cập nhật từ response notifications nếu chưa có từ Group model)
			const invitesWithStatus = allInvites.map(invite => {
				// Nếu đã có status từ Group model, ưu tiên dùng nó
				if (invite.inviteStatus && invite.inviteStatus !== 'pending') {
					return invite;
				}
				// Trong invite notification, recipient là người được mời
				const recipientId = invite.recipient?._id || invite.recipient || invite.data?.userId;
				const recipientEmail = (invite.data?.email || invite.recipient?.email || '').toLowerCase().trim();
				let status = 'pending'; // Mặc định là đang chờ
				
				// Kiểm tra trạng thái từ response notifications
				// Match: invite.recipient === response.sender (cùng là người được mời)
				if (recipientId) {
					const idKey = `id:${String(recipientId)}`;
					if (statusMap.has(idKey)) {
						status = statusMap.get(idKey);
					}
				}
				
				// Nếu chưa match bằng ID, thử match bằng email
				if (status === 'pending' && recipientEmail) {
					const emailKey = `email:${recipientEmail}`;
					if (statusMap.has(emailKey)) {
						status = statusMap.get(emailKey);
					}
				}
				
				return {
					...invite,
					inviteStatus: status
				};
			});
			
			// Sắp xếp theo thời gian (mới nhất trước)
			const sortedInvites = invitesWithStatus.sort((a, b) => {
				const timeA = new Date(a.createdAt || 0).getTime();
				const timeB = new Date(b.createdAt || 0).getTime();
				return timeB - timeA;
			});
			
			setPendingInvites(sortedInvites);
		} catch (err) {
			console.error('Error fetching pending invites:', err);
			setPendingInvites([]);
		} finally {
			setLoadingInvites(false);
		}
	};

	useEffect(() => {
		if (!groupId || !token) return;
		refreshGroup();

		// also load txs
		fetchTxs();
		fetchPendingInvites();
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

	// Add member helpers
	const fetchFriendsList = async () => {
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
			const data = await res.json().catch(() => []);
			const arr = Array.isArray(data) ? data : (data && Array.isArray(data.data) ? data.data : []);
			const normalized = arr.map(u => ({
				id: u.id || u._id,
				name: u.name || u.email || 'Người dùng',
				email: (u.email || '').toLowerCase().trim()
			}));
			setFriendsList(normalized);
		} catch (e) {
			console.warn('fetchFriendsList error', e);
			setFriendsList([]);
		} finally {
			setLoadingFriends(false);
		}
	};

	const handleShowAddMember = () => {
		const next = !showAddMember;
		setShowAddMember(next);
		setAddMemberError('');
		setAddMemberSuccess('');
		setSelectedFriends([]);
		if (next) fetchFriendsList();
	};

	const getNonMemberFriends = () => {
		if (!group || !Array.isArray(group.members) || !friendsList.length) return friendsList;
		const memberEmails = new Set(
			group.members
				.map(m => (m.email || '').toLowerCase().trim())
				.filter(Boolean)
		);
		const memberUserIds = new Set(
			group.members
				.map(m => (m.user && (m.user._id || m.user) ? String(m.user._id || m.user) : '').trim())
				.filter(Boolean)
		);
		return friendsList.filter(f => {
			if (!f || !f.email) return true;
			if (memberEmails.has(f.email.toLowerCase().trim())) return false;
			if (memberUserIds.has(String(f.id))) return false;
			return true;
		});
	};

	const toggleSelectedFriend = (friend) => {
		if (!friend) return;
		setSelectedFriends(prev => {
			const exists = prev.some(f => (f.email || '').toLowerCase().trim() === (friend.email || '').toLowerCase().trim());
			if (exists) return prev.filter(f => (f.email || '').toLowerCase().trim() !== (friend.email || '').toLowerCase().trim());
			return [...prev, friend];
		});
	};

	const handleAddSelectedFriends = async () => {
		if (!selectedFriends.length) {
			setAddMemberError('Chưa chọn bạn bè nào để mời');
			return;
		}
		setAddingMember(true);
		setAddMemberError('');
		setAddMemberSuccess('');
		try {
			const results = [];
			for (const f of selectedFriends) {
				const email = (f.email || '').toLowerCase().trim();
				if (!email) continue;
				try {
					const res = await fetch(`${API_BASE}/api/groups/${encodeURIComponent(groupId)}/invite`, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
						body: JSON.stringify({ email })
					});
					results.push({ email, ok: res.ok });
				} catch (e) {
					results.push({ email, ok: false });
				}
			}
			const okCount = results.filter(r => r.ok).length;
		setAddMemberSuccess(`Đã gửi ${okCount}/${results.length} lời mời`);
		await refreshGroup();
		await fetchFriendsList();
		await fetchPendingInvites();
		setSelectedFriends([]);
		} catch (e) {
			console.error('handleAddSelectedFriends error', e);
			setAddMemberError('Lỗi khi gửi lời mời');
		} finally {
			setAddingMember(false);
		}
	};

	const handleAddMember = async () => {
		setAddMemberError('');
		setAddMemberSuccess('');
		const email = (newMemberEmail || '').trim().toLowerCase();
		if (!email) {
			setAddMemberError('Vui lòng nhập email.');
			return;
		}
		if (!group) {
			setAddMemberError('Thông tin nhóm chưa tải xong.');
			return;
		}
		setAddingMember(true);
		try {
			const chkRes = await fetch(`${API_BASE}/api/groups/search-users?email=${encodeURIComponent(email)}`, {
				headers: token ? { Authorization: `Bearer ${token}` } : {}
			});
			if (!chkRes.ok) {
				setAddMemberError('Lỗi khi kiểm tra người dùng');
				return;
			}
			const users = await chkRes.json().catch(() => []);
			if (!Array.isArray(users) || users.length === 0) {
				setAddMemberError('Người dùng không tồn tại');
				return;
			}
			const foundUser = users[0];
			const foundUserId = foundUser._id || foundUser.id || null;

			const already = Array.isArray(group.members) && group.members.some(m => {
				const mUserId = m.user && (m.user._id ? m.user._id : m.user);
				const mEmail = (m.email || '').toLowerCase().trim();
				if (mUserId && foundUserId && String(mUserId) === String(foundUserId)) return true;
				if (mEmail && mEmail === email) return true;
				return false;
			});
			if (already) {
				setAddMemberError('Người dùng đã tồn tại trong nhóm');
				return;
			}

			const res = await fetch(`${API_BASE}/api/groups/${encodeURIComponent(groupId)}/invite`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
				body: JSON.stringify({ email })
			});
			const body = await res.json().catch(() => null);
			if (!res.ok) {
				const msg = body && (body.message || body.error) ? (body.message || body.error) : 'Không thể thêm thành viên';
				setAddMemberError(msg);
				return;
			}

		setAddMemberSuccess('Đã gửi lời mời! Người dùng có thể chấp nhận hoặc từ chối trong trang Hoạt động.');
		setNewMemberEmail('');
		await refreshGroup();
		await fetchPendingInvites();
		} catch (e) {
			console.error('handleAddMember error', e);
			setAddMemberError('Lỗi mạng');
		} finally {
			setAddingMember(false);
		}
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
							<div className="gm-dashboard-info">
								<div 
									className="gm-dashboard-avatar" 
									style={getGradientStyle(
										group.color && typeof group.color === 'object' ? group.color.colors : ['#1a3b5d'], 
										group.color && typeof group.color === 'object' ? group.color.direction : '135deg'
									)}
								>
									{getGroupInitial(group.name)}
								</div>
								<div className="gm-dashboard-info-content">
									<div className="gm-dashboard-name">
									<i className="fas fa-layer-group"></i>
										<span>{group.name}</span>
									</div>
									<div className="gm-dashboard-actions">
										<button className="gm-btn leave" onClick={handleLeaveGroup} disabled={leaving}>
											{leaving ? 
												<><i className="fas fa-spinner fa-spin"></i> Đang rời...</> : 
												<><i className="fas fa-sign-out-alt"></i> Rời nhóm</>
											}
										</button>
									<button
											className="gm-btn"
										onClick={() => navigate(`/groups/${groupId}/transactions`)}
									>
										<i className="fas fa-exchange-alt"></i> Giao dịch
									</button>
									</div>
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
									
						{/* Tab Navigation */}
						<div className="gm-tabs-container">
							<div className="gm-tabs">
											<button 
									className={`gm-tab ${activeTab === 'members' ? 'active' : ''}`}
									onClick={() => setActiveTab('members')}
								>
									<i className="fas fa-users"></i> Thành viên
								</button>
								<button 
									className={`gm-tab ${activeTab === 'activity' ? 'active' : ''}`}
									onClick={() => setActiveTab('activity')}
								>
									<i className="fas fa-stream"></i> Hoạt động
								</button>
								<button 
									className={`gm-tab ${activeTab === 'charts' ? 'active' : ''}`}
									onClick={() => setActiveTab('charts')}
								>
									<i className="fas fa-chart-pie"></i> Biểu đồ
								</button>
								<button 
									className={`gm-tab ${activeTab === 'debts' ? 'active' : ''}`}
									onClick={() => setActiveTab('debts')}
								>
									<i className="fas fa-hand-holding-usd"></i> Công nợ
											</button>
							</div>
							
							<div className="gm-tab-content">
								{/* Tab: Thành viên */}
								{activeTab === 'members' && (
									<div className="gm-tab-pane active">
										<div className="gm-card">
								<div className="gm-card-header">
									<h2 className="gm-card-title">
										<i className="fas fa-users"></i> Thành viên nhóm
									</h2>
									<button 
										className="gm-btn primary" 
										onClick={handleShowAddMember}
									>
										{showAddMember ? 
											<><i className="fas fa-times"></i> Đóng</> : 
											<><i className="fas fa-user-plus"></i> Thêm thành viên</>
										}
									</button>
								</div>
								<div className="gm-card-body">
									{/* Pending Invites Section */}
									{pendingInvites.length > 0 && (
										<div className="gm-pending-invites-section">
											<h3 style={{ fontSize: '1rem', marginTop: 0, marginBottom: 12, color: '#64748b', fontWeight: 600 }}>
												<i className="fas fa-clock" style={{ marginRight: 8, color: '#f59e0b' }}></i>
												Lời mời đang chờ phản hồi ({pendingInvites.length})
											</h3>
											<div className="gm-pending-invites-list">
												{pendingInvites.map(invite => {
													const recipientEmail = invite.recipient?.email || invite.data?.email || 'Người dùng';
													const recipientName = invite.recipient?.name || recipientEmail;
													const status = invite.inviteStatus || 'pending';
													
													// Xác định icon và text cho từng trạng thái
													const getStatusInfo = (status) => {
														switch(status) {
															case 'accepted':
																return {
																	icon: 'fa-check-circle',
																	text: 'Đã chấp nhận',
																	className: 'accepted'
																};
															case 'rejected':
																return {
																	icon: 'fa-times-circle',
																	text: 'Đã từ chối',
																	className: 'rejected'
																};
															default:
																return {
																	icon: 'fa-hourglass-half',
																	text: 'Đang chờ',
																	className: 'pending'
																};
														}
													};
													
													const statusInfo = getStatusInfo(status);
													
													return (
														<div key={invite._id} className="gm-pending-invite-item">
															<div className={`gm-pending-invite-icon ${statusInfo.className}`}>
																<i className={`fas ${statusInfo.icon}`}></i>
															</div>
															<div className="gm-pending-invite-content">
																<div className="gm-pending-invite-name">{recipientName}</div>
																<div className="gm-pending-invite-email">{recipientEmail}</div>
																<div className="gm-pending-invite-time">
																	{new Date(invite.createdAt).toLocaleDateString('vi-VN', {
																		day: 'numeric',
																		month: 'short',
																		hour: '2-digit',
																		minute: '2-digit'
																	})}
																</div>
															</div>
															<div className="gm-pending-invite-status">
																<span className={`gm-status-badge ${statusInfo.className}`}>
																	<i className={`fas ${statusInfo.icon}`}></i> {statusInfo.text}
																</span>
															</div>
														</div>
													);
												})}
											</div>
											<hr style={{ margin: '16px 0', borderColor: '#e2e8f0' }} />
										</div>
									)}
									
									{/* Add member section */}
									{showAddMember && (
										<div className="gm-add-member">
											{/* Friends list section */}
											<div className="gm-friends-section">
												<h3 style={{ fontSize: '1.1rem', marginTop: 0, marginBottom: 12 }}>
													Thêm từ danh sách bạn bè
												</h3>
												
												{loadingFriends ? (
													<div className="gm-loading-inline">
														<i className="fas fa-spinner fa-spin"></i> Đang tải danh sách bạn bè...
													</div>
												) : (
													<>
														{getNonMemberFriends().length === 0 ? (
															<div className="gm-empty-friends">
																<i className="fas fa-user-friends"></i>
																<p>Tất cả bạn bè của bạn đã là thành viên hoặc bạn chưa có bạn bè nào</p>
															</div>
														) : (
															<>
																<div className="gm-friends-grid">
																	{getNonMemberFriends().map(friend => {
																		const isSelected = selectedFriends.some(f => f.email === friend.email);
																		const initial = (friend.name || friend.email || '?')[0].toUpperCase();
																		
																		return (
																			<div 
																				key={friend.id || friend.email} 
																				className={`gm-friend-card ${isSelected ? 'selected' : ''}`}
																				onClick={() => toggleSelectedFriend(friend)}
																			>
																				<div className="gm-friend-avatar">
																					{initial}
																				</div>
																				<div className="gm-friend-info">
																					<div className="gm-friend-name">{friend.name}</div>
																					<div className="gm-friend-email">{friend.email}</div>
																				</div>
																				<div className="gm-friend-checkbox">
																					<input 
																						type="checkbox" 
																						checked={isSelected}
																						onChange={(e) => {
																							e.stopPropagation();
																							toggleSelectedFriend(friend);
																						}}
																					/>
																				</div>
																			</div>
																		);
																	})}
																</div>
																
																<div style={{ marginTop: 12, marginBottom: 12 }}>
																	<button 
																		className="gm-btn success" 
																		onClick={handleAddSelectedFriends}
																		disabled={!selectedFriends.length || addingMember}
																	>
																		{addingMember ? 
																			<><i className="fas fa-spinner fa-spin"></i> Đang thêm...</> : 
																			<><i className="fas fa-user-plus"></i> Thêm {selectedFriends.length} người đã chọn</>
																		}
																	</button>
																</div>
															</>
														)}
													</>
												)}
											</div>
											
											<div style={{ margin: '16px 0', borderTop: '1px solid #e2e8f0', paddingTop: 16 }}>
												<h3 style={{ fontSize: '1.1rem', marginTop: 0, marginBottom: 12 }}>
													Hoặc thêm bằng email
												</h3>
												
												<div className="gm-add-member-form">
													<input
														type="email"
														placeholder="Nhập email thành viên mới..."
														value={newMemberEmail}
														onChange={e => setNewMemberEmail(e.target.value)}
														className="gm-form-input"
														disabled={addingMember}
													/>
													<button 
														className="gm-btn success" 
														onClick={handleAddMember} 
														disabled={addingMember || !newMemberEmail.trim()}
													>
														{addingMember ? 
															<><i className="fas fa-spinner fa-spin"></i> Đang thêm...</> : 
															<><i className="fas fa-plus-circle"></i> Thêm</>
														}
													</button>
												</div>
											</div>
											
											{addMemberError && (
												<div className="gm-error" style={{marginTop: 12, padding: 12, borderRadius: 8}}>
													<i className="fas fa-exclamation-circle"></i> {addMemberError}
												</div>
											)}
											{addMemberSuccess && (
												<div className="gm-success-message">
													<i className="fas fa-check-circle"></i> {addMemberSuccess}
												</div>
											)}
										</div>
									)}
									
												{/* Members list */}
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
											{!showAddMember && (
												<button className="gm-btn primary" onClick={() => setShowAddMember(true)}>
													<i className="fas fa-user-plus"></i> Thêm thành viên đầu tiên
												</button>
											)}
										</div>
									)}
								</div>
							</div>
									</div>
								)}
								
								{/* Tab: Hoạt động */}
								{activeTab === 'activity' && (
									<div className="gm-tab-pane active">
										{/* Sub-tabs cho Hoạt động */}
										<div className="gm-sub-tabs-container">
											<div className="gm-sub-tabs">
												<button 
													className={`gm-sub-tab ${activitySubTab === 'transactions' ? 'active' : ''}`}
													onClick={() => setActivitySubTab('transactions')}
												>
													<i className="fas fa-exchange-alt"></i> Giao dịch
												</button>
												<button 
													className={`gm-sub-tab ${activitySubTab === 'posts' ? 'active' : ''}`}
													onClick={() => setActivitySubTab('posts')}
												>
													<i className="fas fa-comment-dots"></i> Bài viết
												</button>
											</div>
										</div>
										
										{/* Sub-tab: Giao dịch */}
										{activitySubTab === 'transactions' && (
											<div className="gm-card">
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
														<li key={tx._id} className="gm-member-item" style={{position: 'relative', overflow: 'hidden'}}>
															{allSettled && (
																<div className="gm-settled-badge">
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
										)}

										{/* Sub-tab: Bài viết */}
										{activitySubTab === 'posts' && (
											<div style={{ padding: 0 }}>
							<GroupActivityFeed groupId={groupId} canPost={true} />
											</div>
										)}
									</div>
								)}

								{/* Tab: Biểu đồ */}
								{activeTab === 'charts' && (
									<div className="gm-tab-pane active">
								<GroupCharts txs={txs} members={group ? group.members : []} />
							</div>
								)}

								{/* Tab: Công nợ */}
								{activeTab === 'debts' && (
									<div className="gm-tab-pane active">
										<div className="gm-card">
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
								)}
							</div>
						</div>
					</>
				)}
			</main>
		</div>
	);
}


