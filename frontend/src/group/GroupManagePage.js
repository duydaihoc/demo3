import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import GroupSidebar from './GroupSidebar';
import './GroupManagePage.css';
import { showNotification } from '../utils/notify';
import GroupCharts from './GroupCharts';
import GroupActivityFeed from './GroupActivityFeed';
import './GroupCharts.css';
import GroupShareModal from './GroupShareModal';


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
	// NEW: modal state for delete confirmation
	const [showDeleteModal, setShowDeleteModal] = useState(false);
	// add-member UI state
	const [showAddMember, setShowAddMember] = useState(false);
	const [newMemberEmail, setNewMemberEmail] = useState('');
	const [addingMember, setAddingMember] = useState(false);
	const [addMemberError, setAddMemberError] = useState('');
	const [addMemberSuccess, setAddMemberSuccess] = useState('');
	// Thêm state mới cho danh sách bạn bè
	const [friendsList, setFriendsList] = useState([]);
	const [loadingFriends, setLoadingFriends] = useState(false);
	const [selectedFriends, setSelectedFriends] = useState([]);

	// NEW: transactions + loading + debts
	const [txs, setTxs] = useState([]);
	const [loadingTxs, setLoadingTxs] = useState(false);
	const [txError, setTxError] = useState('');

	// Thêm state cho modal chia sẻ
	const [showShareModal, setShowShareModal] = useState(false);

	// Tab state
	const [activeTab, setActiveTab] = useState('members');
	const [activitySubTab, setActivitySubTab] = useState('transactions'); // 'transactions' or 'posts'

	// Group posts (hoạt động nhóm)
	const [posts, setPosts] = useState([]);
	const [loadingPosts, setLoadingPosts] = useState(false);
	const [postError, setPostError] = useState('');
	const [newPostContent, setNewPostContent] = useState('');
	const [newPostImage, setNewPostImage] = useState('');
	const [posting, setPosting] = useState(false);

	// Pending invites for this group
	const [pendingInvites, setPendingInvites] = useState([]);
	const [loadingInvites, setLoadingInvites] = useState(false);

	const API_BASE = 'http://localhost:5000';
	const token = localStorage.getItem('token');

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

	// NEW: helper to get current user's email from token (used in computeDebts)
	const getMyEmail = () => {
		try {
			const t = token;
			if (!t) return '';
			const payload = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
			return (payload.email || '').toLowerCase().trim();
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
			// Mỗi lời mời là một entry riêng biệt, không gộp lại theo email/userId
			const inviteMap = new Map();
			
			// Thêm lời mời từ Group model - mỗi lời mời có key duy nhất
			groupInvites.forEach(invite => {
				if (String(invite.invitedBy?._id || invite.invitedBy) === String(myId)) {
					// Tạo key duy nhất: notificationId hoặc kết hợp email/userId + createdAt + status
					const uniqueKey = invite.notificationId 
						? `notif-${invite.notificationId}` 
						: `group-${invite.email || String(invite.userId?._id || invite.userId)}-${invite.invitedAt || Date.now()}-${invite.status || 'pending'}`;
					
					inviteMap.set(uniqueKey, {
						_id: invite.notificationId || `group-${invite.email}-${invite.invitedAt}`,
						type: 'group.invite',
						recipient: invite.userId ? { _id: invite.userId._id || invite.userId, email: invite.email, name: invite.userId.name } : { email: invite.email },
						sender: { _id: invite.invitedBy._id || invite.invitedBy },
						data: { groupId, email: invite.email, groupName: groupData?.name },
						status: invite.status,
						createdAt: invite.invitedAt,
						inviteStatus: invite.status,
						notificationId: invite.notificationId
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
			
			// Thêm lời mời từ Notifications - mỗi notification là một lời mời riêng biệt
			inviteNotifications.forEach(notif => {
				// Tạo key duy nhất cho mỗi notification
				const uniqueKey = `notif-${notif._id}`;
				
				// Chỉ thêm nếu chưa có trong map (tránh trùng với lời mời từ Group model)
				if (!inviteMap.has(uniqueKey)) {
					inviteMap.set(uniqueKey, {
						...notif,
						inviteStatus: 'pending',
						notificationId: notif._id
					});
				} else {
					// Cập nhật thông tin từ notification nếu đã có trong Group model
					const existing = inviteMap.get(uniqueKey);
					inviteMap.set(uniqueKey, {
						...existing,
						_id: notif._id || existing._id,
						recipient: notif.recipient || existing.recipient,
						sender: notif.sender || existing.sender,
						data: notif.data || existing.data,
						createdAt: notif.createdAt || existing.createdAt,
						notificationId: notif._id || existing.notificationId
					});
				}
			});
			
			// Chuyển map thành array - giữ tất cả lời mời riêng biệt
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
			
			// Gắn trạng thái cho mỗi lời mời
			// Match response notification với lời mời cụ thể dựa trên thời gian và user
			// Nếu có nhiều lời mời cho cùng user, match response với lời mời gần nhất (createdAt mới nhất)
			const invitesWithStatus = allInvites.map(invite => {
				// Nếu đã có status từ Group model, ưu tiên dùng nó
				if (invite.inviteStatus && invite.inviteStatus !== 'pending') {
					return invite;
				}
				
				// Trong invite notification, recipient là người được mời
				const recipientId = invite.recipient?._id || invite.recipient || invite.data?.userId;
				const recipientEmail = (invite.data?.email || invite.recipient?.email || '').toLowerCase().trim();
				const inviteCreatedAt = new Date(invite.createdAt || 0).getTime();
				
				// Tìm tất cả response notifications phù hợp với user này
				const candidateResponses = responseNotifications.filter(resp => {
					const respCreatedAt = new Date(resp.createdAt || 0).getTime();
					// Response phải được tạo sau lời mời
					if (respCreatedAt < inviteCreatedAt) return false;
					
					// Match bằng userId
					const respUserId = resp.sender?._id || resp.sender || resp.data?.userId;
					if (recipientId && respUserId && String(recipientId) === String(respUserId)) {
						return true;
					}
					
					// Match bằng email
					const respEmail = (resp.data?.email || resp.sender?.email || '').toLowerCase().trim();
					if (recipientEmail && respEmail && recipientEmail === respEmail) {
						return true;
					}
					
					return false;
				});
				
				// Nếu có nhiều response, tìm response gần nhất với lời mời này (thời gian gần nhất)
				if (candidateResponses.length > 0) {
					// Sắp xếp theo thời gian tạo (mới nhất trước)
					candidateResponses.sort((a, b) => {
						const timeA = new Date(a.createdAt || 0).getTime();
						const timeB = new Date(b.createdAt || 0).getTime();
						return timeB - timeA;
					});
					
					// Tìm response gần nhất với lời mời này (thời gian chênh lệch nhỏ nhất)
					let closestResponse = null;
					let minTimeDiff = Infinity;
					
					candidateResponses.forEach(resp => {
						const respCreatedAt = new Date(resp.createdAt || 0).getTime();
						const timeDiff = respCreatedAt - inviteCreatedAt;
						if (timeDiff >= 0 && timeDiff < minTimeDiff) {
							minTimeDiff = timeDiff;
							closestResponse = resp;
						}
					});
					
					if (closestResponse) {
						const status = closestResponse.type === 'group.invite.accepted' ? 'accepted' : 'rejected';
						return {
							...invite,
							inviteStatus: status
						};
					}
				}
				
				// Mặc định là pending
				return {
					...invite,
					inviteStatus: 'pending'
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

	// call refreshGroup on mount instead of inline fetch
	useEffect(() => {
		refreshGroup();
		fetchPendingInvites();
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

			// notify user
			showNotification('✅ Nhóm đã được cập nhật thành công!', 'success');
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

	// Xóa nhóm -> chỉ mở modal (trước đây gọi window.confirm trực tiếp)
	const handleDeleteGroup = async () => {
		if (!groupId || !token) return;
		// open confirmation modal
		setShowDeleteModal(true);
	};

	// Thực sự xóa khi người dùng xác nhận
	const handleConfirmDelete = async () => {
		if (!groupId || !token) return;
		setDeleting(true);
		try {
			const res = await fetch(`${API_BASE}/api/groups/${groupId}`, {
				method: 'DELETE',
				headers: { Authorization: `Bearer ${token}` }
			});
			if (!res.ok) {
				const err = await res.json().catch(() => null);
				alert((err && err.message) ? err.message : 'Không thể xóa nhóm');
				setDeleting(false);
				setShowDeleteModal(false);
				return;
			}
			// success: close modal and navigate away
			setShowDeleteModal(false);
			showNotification('❌ Nhóm đã được xóa thành công!', 'success');
			navigate('/groups');
		} catch (e) {
			console.error('handleConfirmDelete error', e);
			alert('Lỗi mạng khi xóa nhóm');
		} finally {
			setDeleting(false);
		}
	};

	// Add member action (owner only) -- thay thế để kiểm tra user tồn tại và chưa có trong nhóm
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
			// 1) kiểm tra user tồn tại (sử dụng endpoint search-users hiện có)
			const chkRes = await fetch(`${API_BASE}/api/groups/search-users?email=${encodeURIComponent(email)}`, {
				headers: token ? { Authorization: `Bearer ${token}` } : {}
			});
			if (!chkRes.ok) {
				// lỗi khi kiểm tra server
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

			// 2) kiểm tra đã là thành viên trong nhóm chưa (so sánh bằng userId hoặc email)
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

			// 3) tiến hành invite (server sẽ thêm user đã tồn tại bằng userId nếu có)
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

			// success
		setAddMemberSuccess('Đã gửi lời mời! Người dùng có thể chấp nhận hoặc từ chối trong trang Hoạt động.');
			setNewMemberEmail('');
			// reload group để cập nhật danh sách thành viên
			await refreshGroup();
		// Refresh pending invites
		await fetchPendingInvites();
		} catch (e) {
			console.error('handleAddMember error', e);
			setAddMemberError('Lỗi mạng');
		} finally {
			setAddingMember(false);
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

	// NEW helper: resolve payer info (id + name) for a transaction
	const getTransactionPayer = (tx) => {
		if (!tx) return { id: null, name: 'Người trả' };

		// helper to try resolve from group by id/email (see below)
		const resolveFromGroup = (rawIdOrEmail) => {
			if (!rawIdOrEmail || !group) return null;
			return getUserNameById(rawIdOrEmail);
		};

		// If payer is an object (populated), prefer its name but fall back to group lookup using id or email
		if (tx.payer && typeof tx.payer === 'object') {
			const payerId = tx.payer._id || tx.payer.id || null;
			const payerEmail = (tx.payer.email || '').toLowerCase().trim();
			const payerName = tx.payer.name || null;

			if (payerName) return { id: payerId, name: payerName };
			// try group resolution by id first
			const resolvedById = payerId ? resolveFromGroup(payerId) : null;
			if (resolvedById) return { id: payerId, name: resolvedById };
			// try by email
			const resolvedByEmail = payerEmail ? resolveFromGroup(payerEmail) : null;
			if (resolvedByEmail) return { id: payerId || payerEmail, name: resolvedByEmail };

			// fallback to email if present, else show truncated id
			if (payerEmail) return { id: payerId || payerEmail, name: payerEmail };
			if (payerId) return { id: payerId, name: `Người trả #${String(payerId).slice(0,6)}...` };

			return { id: null, name: 'Người trả' };
		}

		// If payer is a raw string (could be id or email)
		if (tx.payer && typeof tx.payer === 'string') {
			const raw = tx.payer;
			if (raw.includes('@')) {
				// email string: try resolve by email to get name
				const resolved = resolveFromGroup(raw.toLowerCase().trim());
				return { id: raw, name: resolved || raw };
			}
			// likely an id: try resolve by id
			const resolvedById = resolveFromGroup(raw);
			if (resolvedById) return { id: raw, name: resolvedById };
			return { id: raw, name: `Người trả #${String(raw).slice(0,6)}...` };
		}

		// fallback to createdBy if payer missing
		if (tx.createdBy) {
			if (typeof tx.createdBy === 'object') {
				const cbId = tx.createdBy._id || tx.createdBy.id || null;
				const cbEmail = (tx.createdBy.email || '').toLowerCase().trim();
				const cbName = tx.createdBy.name || null;
				if (cbName) return { id: cbId, name: cbName };
				const resolved = cbId ? resolveFromGroup(cbId) : (cbEmail ? resolveFromGroup(cbEmail) : null);
				if (resolved) return { id: cbId || cbEmail, name: resolved };
				if (cbEmail) return { id: cbId || cbEmail, name: cbEmail };
				if (cbId) return { id: cbId, name: `Người trả #${String(cbId).slice(0,6)}...` };
			}
			if (typeof tx.createdBy === 'string') {
				const raw = tx.createdBy;
				if (raw.includes('@')) {
					const resolved = resolveFromGroup(raw.toLowerCase().trim());
					return { id: raw, name: resolved || raw };
				}
				const resolvedById = resolveFromGroup(raw);
				if (resolvedById) return { id: raw, name: resolvedById };
				return { id: raw, name: `Người trả #${String(raw).slice(0,6)}...` };
			}
		}

		return { id: null, name: 'Người trả' };
	};

// NEW helper: resolve a userId/email to a display name using current group (owner then members)
const getUserNameById = (userIdOrEmail) => {
	if (!userIdOrEmail || !group) return null;
	const s = String(userIdOrEmail).trim();
	const lower = s.toLowerCase();

	// 1) check owner by id or email
	if (group.owner) {
		const ownerId = group.owner && (group.owner._id || group.owner.id || group.owner);
		const ownerEmail = ((group.owner && group.owner.email) || '').toLowerCase().trim();
		if (ownerId && String(ownerId) === String(s)) return group.owner.name || ownerEmail || String(s);
		if (ownerEmail && ownerEmail === lower) return group.owner.name || ownerEmail || String(s);
	}

	// 2) check members: match by populated user id or by member.email
	if (Array.isArray(group.members)) {
		for (const m of group.members) {
			const mUserId = m.user && (m.user._id || m.user.id || m.user);
			const mEmail = (m.email || '').toLowerCase().trim();
			const mName = m.name || (m.user && (m.user.name || m.user.email)) || null;

			if (mUserId && String(mUserId) === String(s)) return mName || mEmail || String(s);
			if (mEmail && mEmail === lower) return mName || mEmail || String(s);

			// if member.user is populated object and has email or id nested
			if (m.user && typeof m.user === 'object') {
				const muId = m.user._id || m.user.id || null;
				const muEmail = (m.user && m.user.email ? m.user.email.toLowerCase().trim() : '');
				const muName = m.user.name || null;
				if (muId && String(muId) === String(s)) return muName || muEmail || String(s);
				if (muEmail && muEmail === lower) return muName || muEmail || String(s);
			}
		}
	}

	return null;
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

	// Thêm hàm lấy danh sách bạn bè (populated) và chuẩn hóa
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

	// Toggle add-member panel and load friends when opening
	const handleShowAddMember = () => {
		const next = !showAddMember;
		setShowAddMember(next);
		setAddMemberError('');
		setAddMemberSuccess('');
		setSelectedFriends([]);
		if (next) fetchFriendsList();
	};

	// Return friends who are not already members of the group
	const getNonMemberFriends = () => {
		if (!group || !Array.isArray(group.members) || !friendsList.length) return friendsList;
		const memberEmails = new Set(
			group.members
				.map(m => (m.email || '').toLowerCase().trim())
				.filter(Boolean)
		);
		// also include user ids (stringified) to avoid duplicates if friend has no email
		const memberUserIds = new Set(
			group.members
				.map(m => (m.user && (m.user._id || m.user) ? String(m.user._id || m.user) : '').trim())
				.filter(Boolean)
		);
		return friendsList.filter(f => {
			if (!f || !f.email) return true;
			if (memberEmails.has(f.email.toLowerCase().trim())) return false;
			// if friend's id matches a member user id, exclude
			if (memberUserIds.has(String(f.id))) return false;
			return true;
		});
	};

	// Select / unselect a friend (store friend object)
	const toggleSelectedFriend = (friend) => {
		if (!friend) return;
		setSelectedFriends(prev => {
			const exists = prev.some(f => (f.email || '').toLowerCase().trim() === (friend.email || '').toLowerCase().trim());
			if (exists) return prev.filter(f => (f.email || '').toLowerCase().trim() !== (friend.email || '').toLowerCase().trim());
			return [...prev, friend];
		});
	};

	// Invite all selected friends (batch)
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
			// Refresh group and friends list to update UI
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

	// fetch transactions for group
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

	// ===== Group posts helpers =====
	const fetchPosts = async () => {
		if (!groupId || !token) return;
		setLoadingPosts(true);
		setPostError('');
		try {
			const res = await fetch(`${API_BASE}/api/groups/${groupId}/posts?limit=20`, {
				headers: { Authorization: `Bearer ${token}` }
			});
			if (!res.ok) {
				const err = await res.json().catch(() => null);
				throw new Error(err?.message || 'Không thể tải bài viết hoạt động');
			}
			const data = await res.json();
			setPosts(Array.isArray(data) ? data : []);
		} catch (e) {
			console.error('fetchPosts error', e);
			setPostError(e.message || 'Lỗi khi tải bài viết');
			setPosts([]);
		} finally {
			setLoadingPosts(false);
		}
	};

	const handleCreatePost = async () => {
		if (!groupId || !token) return;
		if (!newPostContent.trim() && !newPostImage.trim()) return;
		setPosting(true);
		setPostError('');
		try {
			const body = {
				content: newPostContent.trim(),
				images: newPostImage.trim() ? [newPostImage.trim()] : []
			};
			const res = await fetch(`${API_BASE}/api/groups/${groupId}/posts`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`
				},
				body: JSON.stringify(body)
			});
			const data = await res.json().catch(() => null);
			if (!res.ok) {
				throw new Error(data?.message || 'Không thể đăng bài viết');
			}
			setNewPostContent('');
			setNewPostImage('');
			setPosts(prev => [data, ...prev]);
		} catch (e) {
			console.error('handleCreatePost error', e);
			setPostError(e.message || 'Lỗi khi đăng bài viết');
		} finally {
			setPosting(false);
		}
	};

	const handleToggleLike = async (postId) => {
		if (!groupId || !token || !postId) return;
		try {
			const res = await fetch(`${API_BASE}/api/groups/${groupId}/posts/${postId}/like`, {
				method: 'POST',
				headers: { Authorization: `Bearer ${token}` }
			});
			const data = await res.json().catch(() => null);
			if (!res.ok) {
				console.error('toggle like error', data?.message);
				return;
			}
			setPosts(prev =>
				prev.map(p => p._id === data._id ? data : p)
			);
		} catch (e) {
			console.error('handleToggleLike error', e);
		}
	};

	const handleAddComment = async (postId, content) => {
		if (!groupId || !token || !postId) return;
		const text = (content || '').trim();
		if (!text) return;
		try {
			const res = await fetch(`${API_BASE}/api/groups/${groupId}/posts/${postId}/comments`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`
				},
				body: JSON.stringify({ content: text })
			});
			const data = await res.json().catch(() => null);
			if (!res.ok) {
				console.error('add comment error', data?.message);
				return;
			}
			setPosts(prev =>
				prev.map(p => p._id === data._id ? data : p)
			);
		} catch (e) {
			console.error('handleAddComment error', e);
		}
	};

	useEffect(() => {
		// when group changes, load transactions & posts
		if (groupId && token) {
			fetchTxs();
			fetchPosts();
		}
		// eslint-disable-next-line
	}, [groupId]);

	// compute debts lists
	const computeDebts = () => {
		const myId = getMyId();
		const myEmail = getMyEmail();
		const owesMe = []; // participants in txs where I am payer and not settled
		const iOwe = []; // entries where I am participant and not settled

		for (const tx of txs) {
			// normalize payer id
			const payerId = tx.payer && (tx.payer._id || tx.payer);

			// determine creator id/email for this tx
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

			if (!Array.isArray(tx.participants)) continue;
			for (const p of tx.participants) {
				const partUserId = p.user && (p.user._id || p.user);
				const partEmail = (p.email || '').toLowerCase();

				// detect if this participant is the creator (by id or email)
				const isPartCreator = Boolean(
					(creatorId && partUserId && String(creatorId) === String(partUserId)) ||
					(creatorEmail && partEmail && String(creatorEmail) === String(partEmail))
				);

				// If I am the payer, others owe me — but skip the creator (creator should not be considered debtor)
				if (String(payerId) === String(myId)) {
					if (!p.settled && !isPartCreator) {
						owesMe.push({ tx, participant: p });
					}
				}

				// I owe others? skip if participant is creator (creator does not owe)
				if (!p.settled && ((partUserId && String(partUserId) === String(myId)) || (partEmail && myEmail && partEmail === myEmail)) && !isPartCreator) {
					iOwe.push({ tx, participant: p });
				}
			}
		}
		return { owesMe, iOwe };
	};

	// settle handler: if actor is payer and marking someone else settled, pass userId; otherwise participant marks themselves
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
			// refresh txs
			await fetchTxs();
		} catch (e) {
			console.warn('handleSettle', e);
			alert('Lỗi mạng khi đánh dấu thanh toán');
		}
	};

	// ensure we have groupId from route (if not already available in this file)
	// (removed duplicate `const { groupId } = ...` because `groupId` is already declared elsewhere)

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
									{group.name}
									</div>
									<div className="gm-dashboard-actions">
										{isOwner && (
											<>
												<button className="gm-btn" onClick={() => setEditing(true)}>
													<i className="fas fa-edit"></i> Chỉnh sửa
												</button>
												<button className="gm-btn danger" onClick={handleDeleteGroup}>
													<i className="fas fa-trash-alt"></i> Xóa nhóm
												</button>
											</>
										)}
										<button className="gm-btn" onClick={() => setShowShareModal(true)}>
											<i className="fas fa-share-alt"></i> Chia sẻ
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
								{isOwner && (
															<button
										className={`gm-tab ${activeTab === 'members' ? 'active' : ''}`}
										onClick={() => { setActiveTab('members'); setEditing(false); }}
															>
										<i className="fas fa-users"></i> Thành viên
															</button>
								)}
															<button
									className={`gm-tab ${activeTab === 'activity' ? 'active' : ''}`}
									onClick={() => { setActiveTab('activity'); setEditing(false); }}
															>
									<i className="fas fa-stream"></i> Hoạt động
															</button>
												<button 
									className={`gm-tab ${activeTab === 'charts' ? 'active' : ''}`}
									onClick={() => { setActiveTab('charts'); setEditing(false); }}
												>
									<i className="fas fa-chart-pie"></i> Biểu đồ
												</button>
												<button 
									className={`gm-tab ${activeTab === 'debts' ? 'active' : ''}`}
									onClick={() => { setActiveTab('debts'); setEditing(false); }}
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
											{isOwner && (
												<button 
													className="gm-btn primary" 
													onClick={handleShowAddMember}
												>
													{showAddMember ? 
														<><i className="fas fa-times"></i> Đóng</> : 
														<><i className="fas fa-user-plus"></i> Thêm thành viên</>
													}
												</button>
											)}
										</div>
										
										<div className="gm-card-body">
											{/* Pending Invites Section */}
											{isOwner && pendingInvites.length > 0 && (
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
											
											{/* Add member section - updated UI with friends list */}
											{isOwner && showAddMember && (
												<div className="gm-add-member">
													{/* Friends list section */}
													<div className="gm-friends-section">
														<h3 style={{ fontSize: '1.1rem', marginTop: 0, marginBottom: 16 }}>
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
																		
																		<div style={{ marginTop: 16, marginBottom: 20 }}>
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
													
													<div style={{ margin: '20px 0', borderTop: '1px solid #e2e8f0', paddingTop: 20 }}>
														<h3 style={{ fontSize: '1.1rem', marginTop: 0, marginBottom: 16 }}>
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
														<div className="gm-error" style={{marginTop: 16, padding: 12, borderRadius: 8}}>
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
									{loadingTxs ? (
										<div className="gm-loading-inline"><i className="fas fa-spinner fa-spin"></i> Đang tải hoạt động...</div>
									) : txError ? (
										<div className="gm-error">{txError}</div>
									) : txs.length === 0 ? (
										<div className="gm-empty-state">Chưa có hoạt động nào</div>
									) : (
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
									)}
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
									{loadingTxs ? (
										<div className="gm-loading-inline">Đang tải...</div>
									) : (
										(() => {
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
													{owesMe.length === 0 ? <div className="gm-empty-state-text">Không có ai nợ bạn</div> : (
														<ul className="gm-members-list">
															{owesMe.map((entry, i) => {
																const p = entry.participant;
																const name = p.user ? (p.user.name || p.user.email) : (p.email || 'Người dùng');
																return (
																	<li key={i} className="gm-member-item">
																		<div style={{flex:1}}>
																			<div className="gm-member-name">{name}</div>
																			<div className="gm-member-email">Giao dịch: {entry.tx.title || 'Không tiêu đề'}</div>
																		</div>
																		<div style={{textAlign:'right'}}>
																			<div style={{fontWeight:700}}>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(p.shareAmount || 0)}</div>
																			{/* payer (me) can mark as received */}
																			<button className="gm-btn success" onClick={() => handleSettle(entry.tx._id, (p.user && (p.user._id || p.user)) || null)}>Đã nhận</button>
																		</div>
																	</li>
																);
															})}
														</ul>
													)}

													<hr style={{margin:'16px 0',borderColor:'#e8eef5'}} />

													<h3>Mình nợ người</h3>
													{iOwe.length === 0 ? <div className="gm-empty-state-text">Bạn không nợ ai</div> : (
														<ul className="gm-members-list">
															{iOwe.map((entry, i) => {
																const payerInfo = getTransactionPayer(entry.tx);
																const payerName = payerInfo.name || payerInfo.id || 'Người trả';
																const p = entry.participant;
																return (
																	<li key={i} className="gm-member-item">
																		<div style={{flex:1}}>
																			<div className="gm-member-name">{payerName}</div>
																			<div className="gm-member-email">Giao dịch: {entry.tx.title || 'Không tiêu đề'}</div>
																		</div>
																		<div style={{textAlign:'right'}}>
																			<div style={{fontWeight:700}}>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(p.shareAmount || 0)}</div>
																			<button className="gm-btn primary" onClick={() => handleSettle(entry.tx._id)}>Đã trả</button>
																		</div>
																	</li>
																);
															})}
														</ul>
													)}
												</>
											);
										})()
									)}
											</div>
										</div>
									</div>
									)}
								</div>
							</div>

							{/* Xóa bỏ hoàn toàn phần "Danger Zone" */}
							{/* isOwner && !editing && (
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
													<span><i className="fas fa-spinner fa-spin"></i> Đang xóa...</span>
												) : (
													<span><i className="fas fa-trash-alt"></i> Xóa vĩnh viễn</span>
												)}
											</button>
										</div>
									</div>
								</div>
							)} */}

				{/* DELETE CONFIRMATION MODAL */}
				{showDeleteModal && (
					<div style={{
						position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex',
						alignItems:'center', justifyContent:'center', zIndex:2000
					}}>
						<div style={{width:420, background:'#fff', borderRadius:12, overflow:'hidden', boxShadow:'0 12px 40px rgba(0,0,0,0.3)'}}>
							<div style={{padding:18, borderBottom:'1px solid #eee'}}>
								<h3 style={{margin:0}}>Xác nhận xóa nhóm</h3>
							</div>
							<div style={{padding:18}}>
								<p>Bạn chắc chắn muốn xóa nhóm <strong>{group?.name}</strong>? Hành động này không thể hoàn tác.</p>
								<div style={{display:'flex', justifyContent:'flex-end', gap:10, marginTop:12}}>
									<button
										className="gm-btn secondary"
										onClick={() => setShowDeleteModal(false)}
										disabled={deleting}
									>
										Hủy
									</button>
									<button
										className="gm-btn danger"
										onClick={handleConfirmDelete}
										disabled={deleting}
									>
										{deleting ? 'Đang xóa...' : 'Xóa nhóm'}
									</button>
								</div>
							</div>
						</div>
					</div>
				)}

				{/* Edit Group Modal */}
				{editing && (
					<div style={{
						position: 'fixed',
						inset: 0,
						background: 'rgba(0,0,0,0.5)',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						zIndex: 2000,
						padding: '20px'
					}}>
						<div style={{
							width: '100%',
							maxWidth: '600px',
							background: '#fff',
							borderRadius: 12,
							overflow: 'hidden',
							boxShadow: '0 12px 40px rgba(0,0,0,0.3)',
							maxHeight: '90vh',
							overflowY: 'auto'
						}}>
							<div style={{ padding: 20, borderBottom: '1px solid #eee' }}>
								<h3 style={{ margin: 0 }}>Chỉnh sửa nhóm</h3>
							</div>
							<div style={{ padding: 20 }}>
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
									
									<div 
										className="gm-group-preview" 
										style={getGradientStyle(editColors, editDirection)}
									>
										{editName || group.name}
									</div>
									
									<div className="gm-action-section" style={{ marginTop: 20 }}>
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
											onClick={() => { setEditing(false); }}
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
					</div>
				)}

				{/* Share Modal */}
				<GroupShareModal
					groupId={groupId}
					isOpen={showShareModal}
					onClose={() => setShowShareModal(false)}
				/>
					</>
				)}
			</main>
		</div>
	);
}


