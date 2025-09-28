import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import './App.css';
import Hello from './hello/Hello';
import Login from './auth/Login';
import Register from './auth/Register';
import HomePage from './home/HomePage';
import TransactionsPage from './home/TransactionsPage';
import SettingsPage from './home/SettingsPage';
import AdminPage from './admin/AdminPage';
import AdminUsersPage from './admin/AdminUsersPage';
import AdminGroupsPage from './admin/AdminGroupsPage';
import AdminFamiliesPage from './admin/AdminFamiliesPage';
import AdminCategoriesPage from './admin/AdminCategoriesPage'; // Import new component
import AdminWalletsPage from './admin/AdminWalletsPage';
import AdminTransactionsPage from './admin/AdminTransactionsPage'; // <-- new import
import GroupHome from './group/GroupHome';

import { useEffect, useState } from 'react';

function AppRoutes() {
	// This component is mounted inside Router so we can use useLocation
	const location = useLocation();
	const [displayLocation, setDisplayLocation] = useState(location);
	const [transitionStage, setTransitionStage] = useState('idle'); // 'idle' | 'exit' | 'enter'
	const duration = 1200; // tăng tổng thời gian chuyển đổi để khớp với animation trong CSS
	const half = Math.round(duration / 2);

	useEffect(() => {
		// If pathname didn't change, do nothing
		if (location.pathname === displayLocation.pathname) return;

		// Only animate when switching between /home and /group
		const from = displayLocation.pathname;
		const to = location.pathname;
		const isHomeGroupTransition =
			(from === '/home' && to === '/group') || (from === '/group' && to === '/home');

		if (!isHomeGroupTransition) {
			// immediate swap without animation for other route changes
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
				<Route path="/admin" element={<AdminPage />} />
				<Route path="/admin/users" element={<AdminUsersPage />} />
				<Route path="/admin/wallets" element={<AdminWalletsPage />} />
				<Route path="/admin/groups" element={<AdminGroupsPage />} />
				<Route path="/admin/families" element={<AdminFamiliesPage />} />
				<Route path="/admin/categories" element={<AdminCategoriesPage />} /> {/* Add new route */}
				<Route path="/admin/transactions" element={<AdminTransactionsPage />} /> {/* Add new route */}
				<Route path="/group" element={<GroupHome />} /> {/* Route for GroupHome */}
			</Routes>
		</div>
	);
}

function App() {
  return (
    <Router>
	  <AppRoutes />
    </Router>
  );
}

export default App;



