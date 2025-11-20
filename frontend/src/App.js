import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import './App.css';
import Hello from './hello/Hello';
import Login from './auth/Login';
import Register from './auth/Register';
import HomePage from './home/HomePage';
import TransactionsPage from './home/TransactionsPage';
import SettingsPage from './home/SettingsPage';
import SettingsGeneral from './home/SettingsGeneral';
import AdminPage from './admin/AdminPage';
import AdminUsersPage from './admin/AdminUsersPage';
import AdminGroupsPage from './admin/AdminGroupsPage';
import AdminFamiliesPage from './admin/AdminFamiliesPage';
import AdminCategoriesPage from './admin/AdminCategoriesPage'; // Import new component
import AdminWalletsPage from './admin/AdminWalletsPage';
import AdminTransactionsPage from './admin/AdminTransactionsPage'; // <-- new import
import AdminGroupTransactionsPage from './admin/AdminGroupTransactionsPage';
import GroupHome from './group/GroupHome';
import GroupsPage from './group/GroupsPage';
import GroupFriends from './group/GroupFriends';
import GroupActivity from './group/GroupActivity';
import GroupTransactions from './group/GroupTransactions'; // <-- new import
import GroupManagePage from './group/GroupManagePage';
import GroupMemberPage from './group/GroupMemberPage';
import AdminGroupViewPage from './admin/AdminGroupViewPage';
import FamilyHome from './family/FamilyHome'; // Import FamilyHome component
import FamilySwitchPage from './family/FamilySwitchPage';
import FamilySelectorPage from './family/FamilySelectorPage';
import SwitchPage from './SwitchPage';
import FamilyMembersPage from './family/FamilyMembersPage';
import FamilySettings from './family/FamilySettings'; // Import component mới
import FamilyTransactions from './family/FamilyTransactions'; // Thêm import
import FamilyShoppingList from './family/FamilyShoppingList'; // Thêm import cho trang danh sách mua sắm
import FamilyTodoList from './family/FamilyTodoList'; // Thêm import cho trang danh sách việc cần làm
import FamilyArchive from './family/FamilyArchive'; // Thêm import cho trang lưu trữ
import FamilyCharts from './family/FamilyCharts'; // Thêm import cho trang biểu đồ
import PublicGroupView from './group/PublicGroupView';

import { useEffect, useState } from 'react';

function AppRoutes() {
	// This component is mounted inside Router so we can use useLocation
	const location = useLocation();
	const [displayLocation, setDisplayLocation] = useState(location);
	const [transitionStage, setTransitionStage] = useState('idle'); // 'idle' | 'exit' | 'enter'
	const duration = 1200; // tăng tổng thời gian chuyển đổi để khớp với animation trong CSS
	const half = Math.round(duration / 2);

	useEffect(() => {
		// If both pathname and search didn't change, do nothing
		const samePath = location.pathname === displayLocation.pathname;
		const sameSearch = location.search === displayLocation.search;
		if (samePath && sameSearch) return;

		// Only animate when switching between /home and /group
		const from = displayLocation.pathname;
		const to = location.pathname;
		const isHomeGroupTransition =
			(from === '/home' && to === '/group') || (from === '/group' && to === '/home');

		if (!isHomeGroupTransition) {
			// immediate swap without animation for other route changes,
			// including when only the query string changes (e.g. /settings <-> /settings?tab=categories)
			setDisplayLocation(location);
			setTransitionStage('idle');
			return;
		}

		// start exit animation for home<->group transition
		setTransitionStage('exit');
		const t1 = setTimeout(() => {
			// swap displayed location at mid-point
			setDisplayLocation(location);
			// start enter animation
			setTransitionStage('enter');
			const t2 = setTimeout(() => setTransitionStage('idle'), duration - half);
			return () => clearTimeout(t2);
		}, half);

		return () => clearTimeout(t1);
	}, [location, displayLocation, half, duration]);

	return (
		// container class changes with transition stage to trigger CSS animations
		<div className={`page-transition ${transitionStage}`}>
			<Routes location={displayLocation}>
				<Route path="/" element={<Hello />} />
				<Route path="/login" element={<Login />} />
				<Route path="/register" element={<Register />} />
				<Route path="/home" element={<HomePage />} />
				<Route path="/transactions" element={<TransactionsPage />} />
				<Route path="/settings" element={<SettingsPage />} />
				<Route path="/settings/general" element={<SettingsGeneral />} />
				<Route path="/admin" element={<AdminPage />} />
				<Route path="/admin/users" element={<AdminUsersPage />} />
				<Route path="/admin/wallets" element={<AdminWalletsPage />} />
				<Route path="/admin/groups" element={<AdminGroupsPage />} />
				<Route path="/admin/groups/view/:groupId" element={<AdminGroupViewPage />} />
				<Route path="/admin/groups/transition-group" element={<AdminGroupTransactionsPage />} />
				<Route path="/admin/families" element={<AdminFamiliesPage />} />
				<Route path="/admin/categories" element={<AdminCategoriesPage />} /> {/* Add new route */}
				<Route path="/admin/transactions" element={<AdminTransactionsPage />} /> {/* Add new route */}
				<Route path="/group" element={<GroupHome />} /> {/* Route for GroupHome */}
				<Route path="/groups" element={<GroupsPage />} /> {/* Route cho trang Nhóm */}
				<Route path="/friends" element={<GroupFriends />} /> {/* Route cho trang Bạn bè */}
				<Route path="/activity" element={<GroupActivity />} /> {/* Route cho trang Hoạt động */}
				<Route path="/groups/:groupId/transactions" element={<GroupTransactions />} /> {/* Group transactions */}
				<Route path="/groups/manage/:groupId" element={<GroupManagePage />} />
				<Route path="/groups/member/:groupId" element={<GroupMemberPage />} />
				{/* Family Routes */}
				<Route path="/family-selector" element={<FamilySelectorPage />} />
				<Route path="/family-switch" element={<FamilySwitchPage />} />
				<Route path="/family" element={<FamilyHome />} />
				<Route path="/family/expenses" element={<FamilyHome />} /> {/* Thay bằng component tương ứng khi bạn tạo */}
				<Route path="/family/budget" element={<FamilyHome />} /> {/* Thay bằng component tương ứng khi bạn tạo */}
				<Route path="/family/savings" element={<FamilyHome />} /> {/* Thay bằng component tương ứng khi bạn tạo */}
				<Route path="/family/bills" element={<FamilyHome />} /> {/* Thay bằng component tương ứng khi bạn tạo */}
				<Route path="/family/members" element={<FamilyMembersPage />} /> {/* Thay bằng component tương ứng khi bạn tạo */}
				<Route path="/family/settings" element={<FamilySettings />} />
				<Route path="/family/transactions" element={<FamilyTransactions />} /> {/* Thêm route cho trang giao dịch gia đình */}
				<Route path="/family/shopping-list" element={<FamilyShoppingList />} /> {/* Thêm route cho trang danh sách mua sắm */}
				<Route path="/family/todo-list" element={<FamilyTodoList />} /> {/* Thêm route cho trang danh sách việc cần làm */}
				<Route path="/family/archive" element={<FamilyArchive />} /> {/* Thêm route cho trang lưu trữ */}
				<Route path="/family/charts" element={<FamilyCharts />} /> {/* Thay bằng component tương ứng khi bạn tạo */}
				<Route path="/switch" element={<SwitchPage />} />
				{/* Public group view - không cần auth */}
				<Route path="/public/group/:shareKey" element={<PublicGroupView />} />
			</Routes>
		</div>
	);
}

// mount polling notification in top-level App (fallback if socket.io-client not installed)
function App() {
	useEffect(() => {
		const token = localStorage.getItem('token');
		const userId = localStorage.getItem('userId');
		if (!userId) return;

		let stopped = false;
		let lastSeenIds = new Set();

		const normalizeList = (data) => {
			if (!data) return [];
			if (Array.isArray(data)) return data;
			if (data.notifications && Array.isArray(data.notifications)) return data.notifications;
			if (data.data && Array.isArray(data.data)) return data.data;
			return [];
		};

		const checkNotifications = async () => {
			try {
				let res = await fetch('http://localhost:5000/api/notifications', {
					headers: token ? { Authorization: `Bearer ${token}` } : {}
				});
				if (!res.ok) {
					// try alternate endpoint
					try {
						res = await fetch('http://localhost:5000/api/notifications/list', {
							headers: token ? { Authorization: `Bearer ${token}` } : {}
						});
					} catch (e) { res = null; }
				}
				if (!res) return;
				const data = await res.json().catch(() => null);
				const arr = normalizeList(data);
				const newNotifs = arr.filter(n => !lastSeenIds.has(String(n._id || n.id)));
				if (newNotifs.length > 0) {
					newNotifs.forEach(n => {
						try {
							// do not show blocking alert; log instead so UI remains non-blocking
							console.log('New notification:', n && (n.message || n.text) ? (n.message || n.text) : 'Bạn có thông báo mới');
						} catch (e) { /* ignore */ }
					});
					arr.forEach(n => lastSeenIds.add(String(n._id || n.id)));
				}
			} catch (err) {
				console.warn('Notification poll error', err);
			}
		};

		// initial check and then interval
		checkNotifications();
		const interval = setInterval(() => {
			if (!stopped) checkNotifications();
		}, 8000);

		return () => {
			stopped = true;
			clearInterval(interval);
		};
	}, []);

	return (
		<Router>
			<AppRoutes />
		</Router>
	);
}

export default App;



