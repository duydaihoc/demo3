import React, { useState, useEffect } from 'react';
import './Wallets.css';

function Wallets() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [wallets, setWallets] = useState([]);
  const [formData, setFormData] = useState({
    name: '',
    currency: 'VND',
    initialBalance: ''
  });
  const [loading, setLoading] = useState(false);

  // Fetch wallets khi component mount
  useEffect(() => {
    fetchWallets();
  }, []);

  const fetchWallets = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/wallets');
      const data = await response.json();
      setWallets(data);
    } catch (error) {
      console.error('Error fetching wallets:', error);
    }
  };

  const handleAddWalletClick = () => {
    setShowCreateModal(true);
  };

  const handleCloseModal = () => {
    setShowCreateModal(false);
    setFormData({ name: '', currency: 'VND', initialBalance: '' });
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch('http://localhost:5000/api/wallets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name,
          currency: formData.currency,
          initialBalance: Number(formData.initialBalance) || 0
        }),
      });

      if (response.ok) {
        const newWallet = await response.json();
        setWallets(prev => [newWallet, ...prev]);
        handleCloseModal();
        alert('Tạo ví thành công!');
      } else {
        const error = await response.json();
        alert('Lỗi: ' + error.message);
      }
    } catch (error) {
      console.error('Error creating wallet:', error);
      alert('Có lỗi xảy ra khi tạo ví!');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount, currency) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: currency === 'VND' ? 'VND' : currency
    }).format(amount);
  };

  return (
    <div className="wallets-container">
      <div className="wallets-title">Ví</div>
      <div className="wallets-sub">Quản lý các ví của bạn</div>
      <div className="wallets-list">
        {wallets.length === 0 ? (
          <div className="wallet-card wallet-empty-card">
            <div className="wallet-note">Chưa có ví nào</div>
          </div>
        ) : (
          wallets.map(wallet => (
            <div key={wallet._id} className="wallet-card">
              <div className="wallet-name">{wallet.name}</div>
              <div className="wallet-balance">
                {formatCurrency(wallet.initialBalance, wallet.currency)}
              </div>
              <button className="wallet-action-btn">Chi tiết</button>
            </div>
          ))
        )}
        <div className="wallet-card wallet-add-card">
          <button className="wallet-add-btn" onClick={handleAddWalletClick}>
            + Thêm ví mới
          </button>
        </div>
      </div>
      {showCreateModal && (
        <div className="wallet-modal-overlay">
          <div className="wallet-modal">
            <div className="wallet-modal-title">Tạo ví mới</div>
            <form className="wallet-modal-form" onSubmit={handleSubmit}>
              <div className="wallet-modal-field">
                <label>Tên ví:</label>
                <input 
                  type="text" 
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="Nhập tên ví" 
                  required
                />
              </div>
              <div className="wallet-modal-field">
                <label>Loại tiền:</label>
                <select 
                  name="currency"
                  value={formData.currency}
                  onChange={handleInputChange}
                >
                  <option value="VND">VND</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
              <div className="wallet-modal-field">
                <label>Số tiền:</label>
                <input 
                  type="number" 
                  name="initialBalance"
                  value={formData.initialBalance}
                  onChange={handleInputChange}
                  placeholder="Nhập số tiền" 
                  min="0"
                />
              </div>
              <div className="wallet-modal-actions">
                <button 
                  type="submit" 
                  className="wallet-modal-submit-btn"
                  disabled={loading}
                >
                  {loading ? 'Đang tạo...' : 'Tạo'}
                </button>
                <button 
                  type="button" 
                  className="wallet-modal-close-btn" 
                  onClick={handleCloseModal}
                  disabled={loading}
                >
                  Đóng
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Wallets;

