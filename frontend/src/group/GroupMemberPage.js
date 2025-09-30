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

	return (
		<div className="groups-page">
			<GroupSidebar active="groups" />
			<main className="group-member-page" role="main">
				<h1>Thông tin nhóm</h1>
				{loading ? (
					<div className="gm-loading">Đang tải thông tin nhóm...</div>
				) : !group ? (
					<div className="gm-error">Không tìm thấy nhóm</div>
				) : (
					<div className="gm-content">
						<h2>{group.name}</h2>
						<p>{group.description}</p>
						<div className="gm-members">
							<h3>Thành viên</h3>
							<ul>
								{group.members && group.members.map(m => (
									<li key={m.email || m.user}>
										{m.name || m.email || (m.user && String(m.user))}
										{String(getOwnerId(group)) === String(m.user) && <span className="gm-owner-label"> (Chủ nhóm)</span>}
									</li>
								))}
							</ul>
						</div>
						{!isOwner && (
							<div className="gm-leave-group">
								<button className="gm-btn leave" onClick={handleLeaveGroup} disabled={leaving}>
									{leaving ? 'Đang xử lý...' : 'Rời nhóm'}
								</button>
							</div>
						)}
					</div>
				)}
			</main>
		</div>
	);
}
