import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
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

function App() {
  return (
    <Router>
      <Routes>
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
      </Routes>
    </Router>
  );
}

export default App;



