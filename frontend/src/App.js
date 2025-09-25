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

function AppRoutes() {
	const location = useLocation();

	return (
		<Routes>
			<Route path="/" element={<Hello key={location.pathname} />} />
			<Route path="/login" element={<Login key={location.pathname} />} />
			<Route path="/register" element={<Register key={location.pathname} />} />
			<Route path="/home" element={<HomePage key={location.pathname} />} />
			<Route path="/transactions" element={<TransactionsPage key={location.pathname} />} />
			<Route path="/settings" element={<SettingsPage key={location.pathname} />} />
			<Route path="/admin" element={<AdminPage key={location.pathname} />} />
			<Route path="/admin/users" element={<AdminUsersPage key={location.pathname} />} />
			<Route path="/admin/wallets" element={<AdminWalletsPage key={location.pathname} />} />
			<Route path="/admin/groups" element={<AdminGroupsPage key={location.pathname} />} />
			<Route path="/admin/families" element={<AdminFamiliesPage key={location.pathname} />} />
			<Route path="/admin/categories" element={<AdminCategoriesPage key={location.pathname} />} />
		</Routes>
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



