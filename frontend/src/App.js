import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import './App.css';
import Hello from './hello/Hello';
import Login from './auth/Login';
import Register from './auth/Register';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Hello />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
      </Routes>
    </Router>
  );
}

export default App;


