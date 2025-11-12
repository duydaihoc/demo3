import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import './PublicGroupView.css';

export default function PublicGroupView() {
  const { shareKey } = useParams();
  const [groupData, setGroupData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const API_BASE = 'http://localhost:5000';

  useEffect(() => {
    if (shareKey) {
      fetchPublicGroupData();
    }
  }, [shareKey]);

  const fetchPublicGroupData = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/groups/public/${shareKey}`);
      const data = await res.json();
      
      if (res.ok) {
        setGroupData(data);
      } else {
        setError(data.message || 'Không thể tải dữ liệu nhóm');
      }
    } catch (err) {
      console.error('Error fetching public group:', err);
      setError('Lỗi mạng khi tải dữ liệu');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('vi-VN', { 
      style: 'currency', 
      currency: 'VND',
      maximumFractionDigits: 0 
    }).format(amount);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('vi-VN');
  };

  const getTransactionTypeInfo = (type) => {
    switch(type) {
      case 'equal_split':
        return { icon: 'fa-divide', label: 'Chia đều', color: '#1e40af' };
      case 'payer_for_others':
        return { icon: 'fa-user', label: 'Trả hộ', color: '#059669' };
      case 'percentage_split':
        return { icon: 'fa-percent', label: 'Phần trăm', color: '#dc2626' };
      case 'payer_single':
        return { icon: 'fa-wallet', label: 'Cá nhân', color: '#7c3aed' };
      default:
        return { icon: 'fa-exchange-alt', label: 'Giao dịch', color: '#64748b' };
    }
  };

  if (loading) {
    return (
      <div className="pgv-container">
        <div className="pgv-loading">
          <i className="fas fa-spinner fa-spin"></i>
          <span>Đang tải thông tin nhóm...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="pgv-container">
        <div className="pgv-error">
          <i className="fas fa-exclamation-triangle"></i>
          <h2>Không thể tải thông tin nhóm</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!groupData) {
    return (
      <div className="pgv-container">
        <div className="pgv-error">
          <i className="fas fa-question-circle"></i>
          <h2>Không tìm thấy nhóm</h2>
          <p>Nhóm này có thể không tồn tại hoặc đã ngừng chia sẻ công khai.</p>
        </div>
      </div>
    );
  }

  const { groupInfo, shareSettings, transactions = [], statistics, membersCount } = groupData;

  return (
    <div className="pgv-container">
      {/* Header */}
      <div className="pgv-header">
        <div className="pgv-header-content">
          <div className="pgv-group-info">
            <div 
              className="pgv-group-avatar"
              style={{
                background: groupInfo.color && typeof groupInfo.color === 'object' 
                  ? `linear-gradient(${groupInfo.color.direction || '135deg'}, ${(groupInfo.color.colors || ['#667eea']).join(', ')})`
                  : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
              }}
            >
              {(groupInfo.name || 'G').charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="pgv-group-name">{groupInfo.name}</h1>
              {groupInfo.description && (
                <p className="pgv-group-description">{groupInfo.description}</p>
              )}
              <div className="pgv-group-meta">
                <span>
                  <i className="fas fa-user-shield"></i>
                  Quản lý bởi {groupInfo.ownerName}
                </span>
                {shareSettings.members && (
                  <span>
                    <i className="fas fa-users"></i>
                    {membersCount} thành viên
                  </span>
                )}
                <span>
                  <i className="fas fa-calendar-alt"></i>
                  Tạo ngày {formatDate(groupInfo.createdAt)}
                </span>
              </div>
            </div>
          </div>
          <div className="pgv-public-badge">
            <i className="fas fa-eye"></i>
            <span>Chế độ xem công khai</span>
          </div>
        </div>
      </div>

      {/* Statistics */}
      {shareSettings.statistics && statistics && (
        <div className="pgv-section">
          <h2 className="pgv-section-title">
            <i className="fas fa-chart-bar"></i>
            Thống kê tổng quan
          </h2>
          <div className="pgv-stats-grid">
            <div className="pgv-stat-card">
              <div className="pgv-stat-icon">
                <i className="fas fa-money-bill-wave"></i>
              </div>
              <div className="pgv-stat-content">
                <div className="pgv-stat-value">{formatCurrency(statistics.totalAmount)}</div>
                <div className="pgv-stat-label">Tổng giá trị</div>
              </div>
            </div>
            
            <div className="pgv-stat-card">
              <div className="pgv-stat-icon">
                <i className="fas fa-exchange-alt"></i>
              </div>
              <div className="pgv-stat-content">
                <div className="pgv-stat-value">{statistics.totalTransactions}</div>
                <div className="pgv-stat-label">Tổng giao dịch</div>
              </div>
            </div>
            
            <div className="pgv-stat-card">
              <div className="pgv-stat-icon">
                <i className="fas fa-check-circle"></i>
              </div>
              <div className="pgv-stat-content">
                <div className="pgv-stat-value">{statistics.settlementRate}%</div>
                <div className="pgv-stat-label">Tỉ lệ thanh toán</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Transactions */}
      {shareSettings.transactions && transactions.length > 0 && (
        <div className="pgv-section">
          <h2 className="pgv-section-title">
            <i className="fas fa-list"></i>
            Giao dịch gần đây ({transactions.length})
          </h2>
          <div className="pgv-transactions">
            {transactions.map(tx => {
              const typeInfo = getTransactionTypeInfo(tx.transactionType);
              return (
                <div key={tx._id} className="pgv-transaction-item">
                  <div className="pgv-transaction-left">
                    <div className="pgv-transaction-type" style={{ color: typeInfo.color }}>
                      <i className={`fas ${typeInfo.icon}`}></i>
                      <span>{typeInfo.label}</span>
                    </div>
                    <div className="pgv-transaction-title">{tx.title}</div>
                    <div className="pgv-transaction-meta">
                      <span>
                        <i className="fas fa-calendar-alt"></i>
                        {formatDate(tx.date)}
                      </span>
                      {tx.category && (
                        <span>
                          {tx.category.icon && <span>{tx.category.icon}</span>}
                          {tx.category.name}
                        </span>
                      )}
                      <span>
                        <i className="fas fa-users"></i>
                        {tx.participantsCount} người tham gia
                      </span>
                    </div>
                  </div>
                  <div className="pgv-transaction-right">
                    <div className="pgv-transaction-amount">
                      {formatCurrency(tx.amount)}
                    </div>
                    <div className={`pgv-transaction-status ${tx.isFullySettled ? 'settled' : 'pending'}`}>
                      <i className={`fas ${tx.isFullySettled ? 'fa-check-circle' : 'fa-clock'}`}></i>
                      {tx.isFullySettled ? 'Đã thanh toán' : `${tx.settledCount}/${tx.participantsCount} đã trả`}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="pgv-footer">
        <p>
          <i className="fas fa-shield-alt"></i>
          Đây là trang xem công khai. Dữ liệu được chia sẻ với quyền hạn chế.
        </p>
      </div>
    </div>
  );
}
