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

	const isOwner = group && String(getOwnerId(group)) === String(getMyId());

	// Extracted loader so we can refresh after actions (used to replace inline useEffect fetch)
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

	// UI chọn màu
	const colorOptions = [
		'#4CAF50','#2196F3','#FF9800','#E91E63','#9C27B0',
		'#009688','#1b74e4','#00b894','#FF5722','#673AB7',
		'#3F51B5','#00BCD4','#8BC34A','#FFC107','#F44336',
		'#795548','#607D8B','#9c88ff','#273c75','#16a085',
		'#27ae60','#2980b9','#8e44ad','#f39c12','#d35400'
	];
	const gradientDirections = [
		{ value: '135deg', label: 'Chéo xuống' },
		{ value: '45deg', label: 'Chéo lên' },
		{ value: '90deg', label: 'Ngang' },
		{ value: '180deg', label: 'Dọc' },
		{ value: 'circle', label: 'Tròn' }
	];

	return (
		<div className="groups-page">
			<GroupSidebar active="groups" />
			<main className="group-manage-page" role="main">
				<h1>Quản lý nhóm</h1>
				{loading ? (
					<div className="gm-loading">Đang tải thông tin nhóm...</div>
				) : !group ? (
					<div className="gm-error">Không tìm thấy nhóm</div>
				) : (
					<div className="gm-content">
						<div className="gm-group-info">
							<div>
								<h2>
									{editing ? (
										<input
											type="text"
											value={editName}
											onChange={e => setEditName(e.target.value)}
											className="gm-edit-input"
											disabled={saving}
										/>
									) : (
										group.name
									)}
								</h2>
								<p>{group.description}</p>
								<div className="gm-owner">
									<strong>Người tạo nhóm:</strong> {group.owner && (group.owner.name || group.owner.email)}
								</div>
							</div>
							{isOwner && (
								<div className="gm-edit-actions">
									{editing ? (
										<>
											<button className="gm-btn save" onClick={handleSave} disabled={saving}>Lưu</button>
											<button className="gm-btn cancel" onClick={() => setEditing(false)}>Hủy</button>
											{error && <div className="gm-error">{error}</div>}
										</>
									) : (
										<>
											<button className="gm-btn edit" onClick={() => setEditing(true)}>Sửa tên/màu nhóm</button>
											<button className="gm-btn add" onClick={() => { setShowAddMember(v => !v); setAddMemberError(''); setAddMemberSuccess(''); }}>
												+ Thêm thành viên
											</button>
										</>
									)}
								</div>
							)}
						</div>
						{/* Inline add-member form (owner only) */}
						{isOwner && showAddMember && (
							<div className="gm-add-member" style={{ marginTop: 12 }}>
								<input
									type="email"
									placeholder="Email thành viên..."
									value={newMemberEmail}
									onChange={e => setNewMemberEmail(e.target.value)}
									className="gm-add-input"
									disabled={addingMember}
								/>
								<div className="gm-add-actions" style={{ marginTop: 8 }}>
									<button className="gm-btn save" onClick={handleAddMember} disabled={addingMember}>
										{addingMember ? 'Đang thêm...' : 'Thêm'}
									</button>
									<button className="gm-btn cancel" onClick={() => { setShowAddMember(false); setNewMemberEmail(''); setAddMemberError(''); }}>
										Hủy
									</button>
								</div>
								{addMemberError && <div className="gm-error" style={{ marginTop: 8 }}>{addMemberError}</div>}
								{addMemberSuccess && <div className="gm-success-message" style={{ marginTop: 8 }}>{addMemberSuccess}</div>}
							</div>
						)}
						{editing && (
							<div className="gm-edit-color">
								<div>
									<label>Chọn màu thẻ nhóm:</label>
									<div className="gm-color-picker">
										{colorOptions.map(c => (
											<button
												key={c}
												type="button"
												className={`gm-color-swatch${editColors.includes(c) ? ' selected' : ''}`}
												style={{ background: c }}
												onClick={() => setEditColors(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])}
											>
												{editColors.includes(c) && <span className="gm-color-check">✓</span>}
											</button>
										))}
									</div>
								</div>
								<div>
									<label>Hướng gradient:</label>
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
						)}
						<div className="gm-members">
							<h3>Thành viên</h3>
							<ul>
								{group.members && group.members.map(m => {
									const isMemberOwner = String(getOwnerId(group)) === String(m.user);
									const memberId = m.user ? m.user : m.email;
									return (
										<li key={m.email || m.user}>
											{m.name || m.email || (m.user && String(m.user))}
											{isMemberOwner && <span className="gm-owner-label"> (Chủ nhóm)</span>}
											{/* Chỉ hiện nút Xóa với member, không phải owner */}
											{isOwner && !isMemberOwner && memberId && (
												<button
													className="gm-btn remove"
													onClick={() => handleRemoveMember(memberId)}
													disabled={removingMemberId === memberId}
												>
													{removingMemberId === memberId ? 'Đang xóa...' : 'Xóa'}
												</button>
											)}
										</li>
									);
								})}
							</ul>
						</div>
						{isOwner && (
							<div className="gm-delete-group">
								<button className="gm-btn delete" onClick={handleDeleteGroup} disabled={deleting}>
									{deleting ? 'Đang xóa...' : 'Xóa nhóm'}
								</button>
							</div>
						)}
					</div>
				)}
			</main>
		</div>
	);
}
