import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import './App.css';
import Hello from './hello/Hello';
import Login from './auth/Login';
import Register from './auth/Register';
import HomePage from './home/HomePage';
import TransactionsPage from './home/TransactionsPage';
import SettingsPage from './home/SettingsPage';

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
      </Routes>
    </Router>
  );
}

export default App;
        


