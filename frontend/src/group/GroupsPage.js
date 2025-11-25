import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import GroupSidebar from './GroupSidebar';
import './GroupsPage.css';
import { showNotification } from '../utils/notify';

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
	const [menuGroupId, setMenuGroupId] = useState(null); // group id đang mở menu 3 chấm
	const [searchQuery, setSearchQuery] = useState(''); // Tìm kiếm nhóm
	const [pendingInvites, setPendingInvites] = useState([]); // Lời mời đang chờ phản hồi (đã gửi)
	const [loadingInvites, setLoadingInvites] = useState(false);
	const [receivedInvites, setReceivedInvites] = useState([]); // Lời mời nhận được (chờ chấp nhận/từ chối)
	const [loadingReceivedInvites, setLoadingReceivedInvites] = useState(false);
	
	// Cache tên nhóm để tránh fetch nhiều lần
	const [groupNamesCache, setGroupNamesCache] = useState({});
	const groupNamesCacheRef = useRef({});
	const fetchingGroupsRef = useRef(new Set());
	
	// Sync ref với state
	useEffect(() => {
		groupNamesCacheRef.current = groupNamesCache;
	}, [groupNamesCache]);

	const API_BASE = 'http://localhost:5000';
	const getToken = () => localStorage.getItem('token');
	
	// Helper function để fetch tên nhóm từ API
	const fetchGroupNameById = useCallback(async (groupId) => {
		if (!groupId) return;
		
		// Kiểm tra cache bằng ref (không trigger re-render)
		if (groupNamesCacheRef.current[groupId]) return;
		
		// Kiểm tra đang fetch
		if (fetchingGroupsRef.current.has(groupId)) return;
		
		fetchingGroupsRef.current.add(groupId);
		const token = getToken();
		
		try {
			const res = await fetch(`${API_BASE}/api/groups/${groupId}`, {
				headers: { Authorization: `Bearer ${token}` }
			});
			if (res.ok) {
				const groupData = await res.json().catch(() => null);
				if (groupData && groupData.name) {
					setGroupNamesCache(prev => ({ ...prev, [groupId]: groupData.name }));
				}
			}
		} catch (e) {
			console.warn('Error fetching group name:', e);
		} finally {
			fetchingGroupsRef.current.delete(groupId);
		}
	}, []);
	
	// Helper function để lấy tên nhóm từ cache hoặc notification data
	const getGroupName = useCallback((invite) => {
		const data = invite?.data || {};
		const groupId = data.groupId;
		
		// Ưu tiên lấy từ notification data
		if (data.groupName) return data.groupName;
		
		// Lấy từ cache nếu có
		if (groupId && groupNamesCache[groupId]) return groupNamesCache[groupId];
		
		// Nếu chưa có trong cache, fetch từ API
		if (groupId && !groupNamesCacheRef.current[groupId]) {
			fetchGroupNameById(groupId);
		}
		
		// Fallback: hiển thị ID
		return groupId ? `Nhóm #${String(groupId).substring(0, 6)}...` : 'Nhóm';
	}, [groupNamesCache, fetchGroupNameById]);
	
	// ===== Pinned groups (client-side, per user) =====
	const getCurrentUserId = () => {
		const token = getToken();
		if (!token) return 'guest';
		try {
			const payload = JSON.parse(
				atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))
			);
			return (
				payload.id ||
				payload._id ||
				payload.userId ||
				payload.email ||
				'guest'
			);
		} catch (e) {
			return 'guest';
		}
	};

	const pinnedStorageKey = `pinnedGroups_${getCurrentUserId()}`;

	const [pinnedGroupIds, setPinnedGroupIds] = useState(() => {
		try {
			const raw = localStorage.getItem(pinnedStorageKey);
			const parsed = raw ? JSON.parse(raw) : [];
			return Array.isArray(parsed) ? parsed : [];
		} catch (e) {
			return [];
		}
	});

	const togglePinGroup = (groupId) => {
		if (!groupId) return;
		setPinnedGroupIds((prev) => {
			const set = new Set(prev);
			if (set.has(groupId)) {
				set.delete(groupId);
			} else {
				set.add(groupId);
			}
			const next = Array.from(set);
			try {
				localStorage.setItem(pinnedStorageKey, JSON.stringify(next));
			} catch (e) {
				// ignore storage errors
			}
			return next;
		});
	};

	const toggleCardMenu = (groupId) => {
		setMenuGroupId((prev) => (prev === groupId ? null : groupId));
	};

	const handlePinFromMenu = (groupId) => {
		togglePinGroup(groupId);
		setMenuGroupId(null);
	};

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
			
			// Cập nhật cache tên nhóm từ danh sách nhóm
			if (Array.isArray(data)) {
				const newCache = {};
				data.forEach(group => {
					if (group._id && group.name) {
						newCache[group._id] = group.name;
					}
				});
				if (Object.keys(newCache).length > 0) {
					setGroupNamesCache(prev => ({ ...prev, ...newCache }));
				}
			}

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
			
		} catch (err) {
			console.error('fetchGroups error', err);
			setErrorMsg(err.message || 'Lỗi khi tải nhóm');
		} finally {
			setLoadingGroups(false);
		}
	}, []);

	// Fetch pending invitations (lời mời đã gửi đang chờ phản hồi)
	const fetchPendingInvites = useCallback(async () => {
		const token = getToken();
		if (!token) return;
		
		setLoadingInvites(true);
		try {
			const res = await fetch(`${API_BASE}/api/notifications`, {
				headers: { Authorization: `Bearer ${token}` }
			});
			if (!res.ok) {
				setPendingInvites([]);
				return;
			}
			const data = await res.json().catch(() => []);
			const notifications = Array.isArray(data) ? data : (Array.isArray(data.notifications) ? data.notifications : []);
			
			// Lọc các notification group.invite mà mình là người gửi (sender)
			const myId = getCurrentUserId();
			const invites = notifications.filter(notif => {
				return notif.type === 'group.invite' && 
				       notif.sender && 
				       (String(notif.sender._id || notif.sender) === String(myId)) &&
				       !notif.read; // Chỉ lấy những lời mời chưa được phản hồi
			});
			
			setPendingInvites(invites);
		} catch (err) {
			console.error('Error fetching pending invites:', err);
			setPendingInvites([]);
		} finally {
			setLoadingInvites(false);
		}
	}, []);

	// Fetch received invitations (lời mời nhận được - chờ chấp nhận/từ chối)
	const fetchReceivedInvites = useCallback(async () => {
		const token = getToken();
		if (!token) return;
		
		setLoadingReceivedInvites(true);
		try {
			const myId = getCurrentUserId();
			
			// Lấy tất cả notifications
			const res = await fetch(`${API_BASE}/api/notifications`, {
				headers: { Authorization: `Bearer ${token}` }
			});
			if (!res.ok) {
				setReceivedInvites([]);
				return;
			}
			const data = await res.json().catch(() => []);
			const notifications = Array.isArray(data) ? data : (Array.isArray(data.notifications) ? data.notifications : []);
			
			// Lấy danh sách nhóm để kiểm tra xem user đã là thành viên chưa
			const groupsRes = await fetch(`${API_BASE}/api/groups`, {
				headers: { Authorization: `Bearer ${token}` }
			});
			const groupsData = groupsRes.ok ? await groupsRes.json().catch(() => []) : [];
			const userGroups = Array.isArray(groupsData) ? groupsData : [];
			
			// Lọc các notification group.invite mà mình là người nhận (recipient)
			const invites = notifications.filter(notif => {
				if (notif.type !== 'group.invite') return false;
				if (!notif.recipient) return false;
				
				const recipientId = notif.recipient._id || notif.recipient;
				if (String(recipientId) !== String(myId)) return false;
				
				const groupId = notif.data?.groupId;
				if (!groupId) return false;
				
				// Kiểm tra xem user đã là thành viên của nhóm này chưa
				const isMember = userGroups.some(g => {
					if (String(g._id) !== String(groupId)) return false;
					return g.members && g.members.some(m => {
						const memberUserId = m.user?._id || m.user;
						const memberEmail = (m.email || '').toLowerCase().trim();
						return (memberUserId && String(memberUserId) === String(myId)) ||
						       (memberEmail && String(memberEmail) === String((notif.recipient?.email || '').toLowerCase().trim()));
					});
				});
				
				// Nếu đã là thành viên thì không hiển thị lời mời
				if (isMember) return false;
				
				// Kiểm tra xem đã có phản hồi chưa bằng cách tìm notification accepted/rejected
				const hasResponse = notifications.some(resp => {
					if (resp.type !== 'group.invite.accepted' && resp.type !== 'group.invite.rejected') return false;
					const respGroupId = resp.data?.groupId;
					if (!respGroupId || String(respGroupId) !== String(groupId)) return false;
					// Response notification: sender là người được mời (người phản hồi)
					const responseSenderId = resp.sender?._id || resp.sender;
					return String(responseSenderId) === String(myId);
				});
				
				// Nếu đã có phản hồi thì không hiển thị
				if (hasResponse) return false;
				
				// Nếu notification đã được đánh dấu là đọc và có groupId, có thể đã phản hồi
				// Nhưng vẫn hiển thị nếu chưa có response notification và chưa là thành viên
				return true;
			});
			
			setReceivedInvites(invites);
		} catch (err) {
			console.error('Error fetching received invites:', err);
			setReceivedInvites([]);
		} finally {
			setLoadingReceivedInvites(false);
		}
	}, []);

	// Handle accept group invite
	const handleAcceptGroupInvite = async (invite) => {
		const token = getToken();
		if (!token) return;

		const groupId = invite.data?.groupId;
		if (!groupId) {
			alert('Không tìm thấy thông tin nhóm');
			return;
		}

		try {
			const res = await fetch(`${API_BASE}/api/groups/${groupId}/respond-invite`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`
				},
				body: JSON.stringify({
					accept: true,
					notificationId: invite._id
				})
			});

			if (!res.ok) {
				const err = await res.json().catch(() => ({ message: 'Lỗi khi chấp nhận lời mời' }));
				alert(err.message);
				return;
			}

			// Loại bỏ lời mời khỏi danh sách ngay lập tức
			setReceivedInvites(prev => prev.filter(inv => inv._id !== invite._id));
			
			// Refresh data
			await fetchGroups();
			await fetchReceivedInvites();
			showNotification('✅ Đã tham gia nhóm thành công!', 'success');
		} catch (error) {
			console.error('Error accepting group invite:', error);
			alert('Có lỗi xảy ra khi chấp nhận lời mời');
		}
	};

	// Handle reject group invite
	const handleRejectGroupInvite = async (invite) => {
		const token = getToken();
		if (!token) return;

		const groupId = invite.data?.groupId;
		if (!groupId) {
			alert('Không tìm thấy thông tin nhóm');
			return;
		}

		if (!window.confirm('Bạn có chắc muốn từ chối lời mời này?')) {
			return;
		}

		try {
			const res = await fetch(`${API_BASE}/api/groups/${groupId}/respond-invite`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`
				},
				body: JSON.stringify({
					accept: false,
					notificationId: invite._id
				})
			});

			if (!res.ok) {
				const err = await res.json().catch(() => ({ message: 'Lỗi khi từ chối lời mời' }));
				alert(err.message);
				return;
			}

			// Loại bỏ lời mời khỏi danh sách ngay lập tức
			setReceivedInvites(prev => prev.filter(inv => inv._id !== invite._id));
			
			// Refresh data
			await fetchReceivedInvites();
			showNotification('Đã từ chối lời mời', 'info');
		} catch (error) {
			console.error('Error rejecting group invite:', error);
			alert('Có lỗi xảy ra khi từ chối lời mời');
		}
	};

	useEffect(() => {
		fetchGroups();
		fetchPendingInvites();
		fetchReceivedInvites();
	}, [fetchGroups, fetchPendingInvites, fetchReceivedInvites]);

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
			fetchFriendsList();
			// notify user
			showNotification('✅ Nhóm đã được tạo thành công!', 'success');
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
			const successCount = results.filter(r => r.ok).length;
			if (successCount > 0) {
				setInviteResult(`Đã gửi ${successCount}/${results.length} lời mời. Họ có thể chấp nhận hoặc từ chối trong trang Hoạt động.`);
			} else {
				setInviteResult('Không thể gửi lời mời. Vui lòng thử lại.');
			}
			// refresh groups list and reset modal (optionally keep modal open)
			fetchGroups();
			// optional: close modal automatically after a short delay
			setTimeout(() => {
				setShowCreateModal(false);
				setModalStep(1);
				setCreatedGroup(null);
				setSelectedFriendEmails([]);
			}, 1500);
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

	// ===== Derived data for new UI =====
	const pinnedGroupsDerived = useMemo(
		() =>
			groups.filter((g) =>
				pinnedGroupIds.includes(g._id || g.id)
			),
		[groups, pinnedGroupIds]
	);

	const totalPinned = pinnedGroupsDerived.length;

	// Filter groups based on search query
	const filteredGroups = useMemo(() => {
		if (!searchQuery.trim()) return groups;
		const query = searchQuery.toLowerCase().trim();
		return groups.filter(g => 
			(g.name || '').toLowerCase().includes(query) ||
			(g.description || '').toLowerCase().includes(query)
		);
	}, [groups, searchQuery]);

	// Separate pinned and unpinned groups
	const displayGroups = useMemo(() => {
		const pinned = filteredGroups.filter(g => pinnedGroupIds.includes(g._id || g.id));
		const unpinned = filteredGroups.filter(g => !pinnedGroupIds.includes(g._id || g.id));
		return { pinned, unpinned };
	}, [filteredGroups, pinnedGroupIds]);

	// Render function for group card
	const renderGroupCard = (group) => {
		const role = getRole(group);
		const id = group._id || group.id || group.id;
		const isPinned = pinnedGroupIds.includes(id);
		
		return (
			<div 
				key={id} 
				className="group-select-card" 
				style={{ background: getCardBackground(group) }}
				onClick={() => {
					if (isOwner(group)) {
						navigate(`/groups/manage/${id}`);
					} else {
						navigate(`/groups/member/${id}`);
					}
				}}
			>
				<div className="group-card-overlay"></div>
				
				{/* Pin indicator */}
				{isPinned && (
					<div className="group-pin-indicator">
						<i className="fas fa-thumbtack"></i>
					</div>
				)}

				{/* Menu button */}
				<div
					className="group-card-menu-wrapper"
					onClick={(e) => e.stopPropagation()}
				>
					<button
						type="button"
						className="group-card-menu-btn"
						onClick={() => toggleCardMenu(id)}
						title="Tùy chọn nhóm"
					>
						<i className="fas fa-ellipsis-v"></i>
					</button>
					{menuGroupId === id && (
						<div className="group-card-menu">
							<button
								type="button"
								className="group-menu-item"
								onClick={() => handlePinFromMenu(id)}
							>
								<i className="fas fa-thumbtack"></i>
								{isPinned ? 'Bỏ ghim nhóm' : 'Ghim nhóm'}
							</button>
							<button
								type="button"
								className="group-menu-item"
								onClick={() => navigate(`/groups/${id}/transactions`)}
							>
								<i className="fas fa-exchange-alt"></i>
								Xem giao dịch
							</button>
						</div>
					)}
				</div>

				{/* Card Content */}
				<div className="group-card-content">
					<div className="group-card-icon">
						{(group.name || '?')[0].toUpperCase()}
					</div>
					<div className="group-card-name">{group.name}</div>
					{group.description && (
						<div className="group-card-description">{group.description}</div>
					)}
					<div className="group-card-meta">
						<div className="group-meta-item">
							<i className="fas fa-users"></i>
							<span>{(group.members && group.members.length) || 0} thành viên</span>
						</div>
						<div className="group-meta-item">
							<i className="fas fa-wallet"></i>
							<span>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(group.totalExpense || 0)}</span>
						</div>
					</div>
					<div className="group-card-role">
						{isOwner(group) ? (
							<span className="role-badge owner">
								<i className="fas fa-crown"></i> Quản lý
							</span>
						) : (
							<span className="role-badge member">
								<i className="fas fa-user"></i> Tham gia
							</span>
						)}
					</div>
				</div>

				{/* Hover effect */}
				<div className="group-card-hover-effect">
					<i className="fas fa-arrow-right"></i>
				</div>
			</div>
		);
	};

	return (
		<div className="groups-page">
			<GroupSidebar active="groups" />
			
			<main className="groups-main" role="main">
				<header className="groups-header">
					<div className="groups-title-block">
						<h1>Chọn nhóm</h1>
						<p className="subtitle">
							Chọn một nhóm để xem và quản lý giao dịch
						</p>
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

				{/* Search Bar */}
				<div className="groups-search-container">
					<div className="groups-search-wrapper">
						<i className="fas fa-search groups-search-icon"></i>
						<input
							type="text"
							className="groups-search-input"
							placeholder="Tìm kiếm nhóm theo tên hoặc mô tả..."
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
						/>
						{searchQuery && (
							<button
								type="button"
								className="groups-search-clear"
								onClick={() => setSearchQuery('')}
								aria-label="Xóa tìm kiếm"
							>
								<i className="fas fa-times"></i>
							</button>
						)}
					</div>
				</div>

				{errorMsg && (
					<div className="groups-error-alert">
						<i className="fas fa-exclamation-circle"></i> {errorMsg}
					</div>
				)}

				{/* Received Invites Section - Lời mời nhận được */}
				{receivedInvites.length > 0 && (
					<section className="groups-section-received-invites">
						<div className="section-header-received">
							<i className="fas fa-envelope-open"></i>
							<h2>Lời mời tham gia nhóm</h2>
							<span className="received-count">{receivedInvites.length}</span>
						</div>
						<div className="received-invites-list">
							{receivedInvites.map(invite => {
								const groupId = invite.data?.groupId;
								const groupName = getGroupName(invite);
								const inviterName = invite.data?.inviterName || invite.sender?.name || invite.sender?.email || 'Người dùng';
								
								return (
									<div key={invite._id} className="received-invite-item">
										<div className="received-invite-icon">
											<i className="fas fa-envelope"></i>
										</div>
										<div className="received-invite-content">
											<div className="received-invite-group">
												<strong>{groupName}</strong>
											</div>
											<div className="received-invite-inviter">
												Được mời bởi: {inviterName}
											</div>
											<div className="received-invite-time">
												{new Date(invite.createdAt).toLocaleDateString('vi-VN', {
													day: 'numeric',
													month: 'short',
													hour: '2-digit',
													minute: '2-digit'
												})}
											</div>
										</div>
										<div className="received-invite-actions">
											<button 
												className="invite-action-btn accept-btn"
												onClick={() => handleAcceptGroupInvite(invite)}
											>
												<i className="fas fa-check"></i> Chấp nhận
											</button>
											<button 
												className="invite-action-btn reject-btn"
												onClick={() => handleRejectGroupInvite(invite)}
											>
												<i className="fas fa-times"></i> Từ chối
											</button>
										</div>
									</div>
								);
							})}
						</div>
					</section>
				)}

				{/* Pending Invites Section - Lời mời đã gửi đang chờ phản hồi */}
				{pendingInvites.length > 0 && (
					<section className="groups-section-pending-invites">
						<div className="section-header-pending">
							<i className="fas fa-clock"></i>
							<h2>Lời mời đang chờ phản hồi</h2>
							<span className="pending-count">{pendingInvites.length}</span>
						</div>
						<div className="pending-invites-list">
							{pendingInvites.map(invite => {
								const groupId = invite.data?.groupId;
								const groupName = getGroupName(invite);
								const recipientEmail = invite.recipient?.email || invite.data?.email || 'Người dùng';
								
								return (
									<div key={invite._id} className="pending-invite-item">
										<div className="pending-invite-icon">
											<i className="fas fa-user-clock"></i>
										</div>
										<div className="pending-invite-content">
											<div className="pending-invite-group">
												<strong>{groupName}</strong>
											</div>
											<div className="pending-invite-recipient">
												Đã mời: {recipientEmail}
											</div>
											<div className="pending-invite-time">
												{new Date(invite.createdAt).toLocaleDateString('vi-VN', {
													day: 'numeric',
													month: 'short',
													hour: '2-digit',
													minute: '2-digit'
												})}
											</div>
										</div>
										<div className="pending-invite-status">
											<span className="status-badge pending">
												<i className="fas fa-hourglass-half"></i> Đang chờ
											</span>
										</div>
									</div>
								);
							})}
						</div>
					</section>
				)}

				{loadingGroups ? (
					<div className="groups-loading">
						<div className="loading-spinner"></div>
						<p>Đang tải danh sách nhóm...</p>
					</div>
				) : filteredGroups.length > 0 ? (
					<>
						{/* Pinned Groups Section */}
						{displayGroups.pinned.length > 0 && (
							<section className="groups-section-pinned">
								<div className="section-header-pinned">
									<i className="fas fa-thumbtack"></i>
									<h2>Nhóm đã ghim</h2>
									<span className="pinned-count">{displayGroups.pinned.length}</span>
								</div>
								<div className="groups-card-container">
									{displayGroups.pinned.map(group => {
										return renderGroupCard(group);
									})}
								</div>
							</section>
						)}

						{/* All Groups Section */}
						<section className="groups-section-all">
							{displayGroups.pinned.length > 0 && displayGroups.unpinned.length > 0 && (
								<div className="section-header-all">
									<h2>Tất cả nhóm</h2>
									<span className="groups-count">{displayGroups.unpinned.length} nhóm</span>
								</div>
							)}
							<div className="groups-card-container">
								{displayGroups.unpinned.map(group => {
									return renderGroupCard(group);
								})}
							</div>
						</section>
					</>
				) : (
					<div className="no-groups">
						<div className="empty-icon"><i className="fas fa-users-slash"></i></div>
						<h3>{searchQuery ? 'Không tìm thấy nhóm nào' : 'Chưa có nhóm nào'}</h3>
						<p>
							{searchQuery 
								? `Không có nhóm nào khớp với "${searchQuery}". Thử tìm kiếm với từ khóa khác.`
								: 'Bạn chưa tham gia nhóm nào. Hãy tạo một nhóm mới để bắt đầu!'
							}
						</p>
						{!searchQuery && (
							<button 
								className="create-group-btn"
								onClick={() => { setShowCreateModal(true); fetchFriendsList(); }}
							>
								<i className="fas fa-plus-circle"></i> Tạo nhóm mới
							</button>
						)}
					</div>
				)}
			</main>

			{/* Modal tạo nhóm */}
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
		</div>
	);
}



