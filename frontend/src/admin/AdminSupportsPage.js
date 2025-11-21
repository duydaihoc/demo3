import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminSidebar from './AdminSidebar';
import './AdminPage.css';

function AdminSupportsPage() {
  const [supports, setSupports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSupport, setSelectedSupport] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const navigate = useNavigate();
  const token = localStorage.getItem('token');

  useEffect(() => {
    const role = localStorage.getItem('role');
    if (!token || role !== 'admin') {
      navigate('/login');
      return;
    }
    fetchSupports();
  }, [navigate, token, statusFilter, page]);

  const fetchSupports = async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams({
        page: page.toString(),
        limit: '20',
        ...(statusFilter !== 'all' && { status: statusFilter })
      });

      const response = await fetch(`http://localhost:5000/api/support?${queryParams}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setSupports(data.data || []);
        setTotalPages(data.pages || 1);
      }
    } catch (error) {
      console.error('Error fetching supports:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (id, newStatus) => {
    try {
      const response = await fetch(`http://localhost:5000/api/support/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus })
      });

      if (response.ok) {
        fetchSupports();
        if (selectedSupport && selectedSupport._id === id) {
          setSelectedSupport({ ...selectedSupport, status: newStatus });
        }
      }
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const getStatusBadge = (status) => {
    const statusMap = {
      pending: { text: 'Chờ xử lý', color: '#f59e0b' },
      reviewed: { text: 'Đã xem', color: '#3b82f6' },
      contacted: { text: 'Đã liên hệ', color: '#8b5cf6' },
      completed: { text: 'Hoàn thành', color: '#10b981' }
    };
    const statusInfo = statusMap[status] || statusMap.pending;
    return (
      <span style={{
        padding: '4px 12px',
        borderRadius: '12px',
        fontSize: '12px',
        fontWeight: 600,
        backgroundColor: `${statusInfo.color}20`,
        color: statusInfo.color
      }}>
        {statusInfo.text}
      </span>
    );
  };

  const formatDate = (date) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleString('vi-VN');
  };

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <div className="admin-main-content">
        <div className="admin-page-header">
          <h2 className="admin-title">🤝 Quản lý hỗ trợ & Yêu cầu tính năng</h2>
          <div className="admin-header-stats" style={{ display: 'flex', gap: '12px' }}>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: '1px solid #e5e7eb',
                fontSize: '14px',
                cursor: 'pointer'
              }}
            >
              <option value="all">Tất cả</option>
              <option value="pending">Chờ xử lý</option>
              <option value="reviewed">Đã xem</option>
              <option value="contacted">Đã liên hệ</option>
              <option value="completed">Hoàn thành</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
            <div style={{ fontSize: '2rem', marginBottom: '12px' }}>⏳</div>
            Đang tải...
          </div>
        ) : supports.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
            <div style={{ fontSize: '3rem', marginBottom: '12px' }}>📭</div>
            <p>Chưa có hỗ trợ nào</p>
          </div>
        ) : (
          <>
            <div className="admin-table-container">
              <table className="admin-users-table">
                <thead>
                  <tr>
                    <th>Loại</th>
                    <th>Người gửi</th>
                    <th>Email</th>
                    <th>Nội dung</th>
                    <th>Trạng thái</th>
                    <th>Ngày gửi</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {supports.map((support) => (
                    <tr key={support._id}>
                      <td>
                        {support.type === 'feature-request' ? (
                          <span style={{
                            padding: '4px 12px',
                            borderRadius: '12px',
                            fontSize: '12px',
                            fontWeight: 600,
                            backgroundColor: '#f59e0b20',
                            color: '#f59e0b'
                          }}>
                            💡 Tính năng
                          </span>
                        ) : (
                          <span style={{
                            padding: '4px 12px',
                            borderRadius: '12px',
                            fontSize: '12px',
                            fontWeight: 600,
                            backgroundColor: '#10b98120',
                            color: '#10b981'
                          }}>
                            🤝 Hỗ trợ
                          </span>
                        )}
                      </td>
                      <td>
                        <div>
                          <strong>{support.name}</strong>
                          {support.user && (
                            <div style={{ fontSize: '12px', color: '#64748b' }}>
                              Tài khoản: {support.user.email || 'N/A'}
                            </div>
                          )}
                        </div>
                      </td>
                      <td>{support.email}</td>
                      <td>
                        <div style={{ maxWidth: '300px' }}>
                          {support.message ? (
                            <div style={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}>
                              {support.message}
                            </div>
                          ) : (
                            <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Không có</span>
                          )}
                          {support.featureCategories && support.featureCategories.length > 0 && (
                            <div style={{ marginTop: '4px', fontSize: '12px', color: '#f59e0b' }}>
                              Mục: {support.featureCategories.join(', ')}
                            </div>
                          )}
                        </div>
                      </td>
                      <td>{getStatusBadge(support.status)}</td>
                      <td>{formatDate(support.createdAt)}</td>
                      <td>
                        <button
                          onClick={() => setSelectedSupport(support)}
                          style={{
                            padding: '6px 12px',
                            background: '#3b82f6',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '13px'
                          }}
                        >
                          Xem chi tiết
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{
                display: 'flex',
                justifyContent: 'center',
                gap: '8px',
                marginTop: '20px',
                alignItems: 'center'
              }}>
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  style={{
                    padding: '8px 16px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px',
                    background: page === 1 ? '#f3f4f6' : 'white',
                    cursor: page === 1 ? 'not-allowed' : 'pointer'
                  }}
                >
                  Trước
                </button>
                <span>Trang {page} / {totalPages}</span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  style={{
                    padding: '8px 16px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px',
                    background: page === totalPages ? '#f3f4f6' : 'white',
                    cursor: page === totalPages ? 'not-allowed' : 'pointer'
                  }}
                >
                  Sau
                </button>
              </div>
            )}
          </>
        )}

        {/* Modal chi tiết hỗ trợ */}
        {selectedSupport && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
              padding: '20px'
            }}
            onClick={() => setSelectedSupport(null)}
          >
            <div
              style={{
                background: 'white',
                borderRadius: '16px',
                padding: '32px',
                maxWidth: '700px',
                width: '100%',
                maxHeight: '90vh',
                overflowY: 'auto',
                boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '24px',
                paddingBottom: '16px',
                borderBottom: '2px solid #e5e7eb'
              }}>
                <h3 style={{ margin: 0, fontSize: '24px', color: '#1e293b' }}>
                  Chi tiết hỗ trợ
                </h3>
                <button
                  onClick={() => setSelectedSupport(null)}
                  style={{
                    background: '#f3f4f6',
                    border: 'none',
                    borderRadius: '50%',
                    width: '32px',
                    height: '32px',
                    cursor: 'pointer',
                    fontSize: '18px'
                  }}
                >
                  ×
                </button>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <h4 style={{ margin: '0 0 12px 0', color: '#64748b', fontSize: '14px' }}>Thông tin cơ bản</h4>
                <div style={{
                  background: '#f9fafb',
                  padding: '16px',
                  borderRadius: '8px',
                  display: 'grid',
                  gap: '12px'
                }}>
                  <div>
                    <strong>📋 Loại:</strong>{' '}
                    {selectedSupport.type === 'feature-request' ? (
                      <span style={{
                        padding: '4px 12px',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: 600,
                        backgroundColor: '#f59e0b20',
                        color: '#f59e0b'
                      }}>
                        💡 Yêu cầu tính năng
                      </span>
                    ) : (
                      <span style={{
                        padding: '4px 12px',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: 600,
                        backgroundColor: '#10b98120',
                        color: '#10b981'
                      }}>
                        🤝 Hỗ trợ
                      </span>
                    )}
                  </div>
                  <div>
                    <strong>👤 Tên:</strong> {selectedSupport.name}
                  </div>
                  <div>
                    <strong>📧 Email:</strong> {selectedSupport.email}
                  </div>
                  {selectedSupport.user && (
                    <div>
                      <strong>🔐 Tài khoản:</strong> {selectedSupport.user.email || 'N/A'}
                    </div>
                  )}
                  <div>
                    <strong>📅 Ngày gửi:</strong> {formatDate(selectedSupport.createdAt)}
                  </div>
                  <div>
                    <strong>📊 Trạng thái:</strong> {getStatusBadge(selectedSupport.status)}
                  </div>
                  {selectedSupport.message && (
                    <div>
                      <strong>💬 Nội dung:</strong>
                      <div style={{
                        marginTop: '8px',
                        padding: '12px',
                        background: 'white',
                        borderRadius: '6px',
                        whiteSpace: 'pre-wrap'
                      }}>
                        {selectedSupport.message}
                      </div>
                    </div>
                  )}
                  {selectedSupport.featureCategories && selectedSupport.featureCategories.length > 0 && (
                    <div>
                      <strong>🎯 Mục yêu cầu tính năng:</strong>
                      <div style={{
                        marginTop: '8px',
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '8px'
                      }}>
                        {selectedSupport.featureCategories.map((cat) => {
                          const categoryMap = {
                            'wallet': { label: 'Ví', icon: '💼' },
                            'transaction': { label: 'Giao dịch', icon: '💸' },
                            'category': { label: 'Danh mục', icon: '🗂️' },
                            'family': { label: 'Gia đình', icon: '🏠' },
                            'group': { label: 'Nhóm', icon: '👥' },
                            'goal': { label: 'Mục tiêu', icon: '🎯' },
                            'integration': { label: 'Khả năng liên kết', icon: '🔗' }
                          };
                          const category = categoryMap[cat] || { label: cat, icon: '📌' };
                          return (
                            <span
                              key={cat}
                              style={{
                                padding: '6px 12px',
                                background: '#fef3c7',
                                borderRadius: '8px',
                                fontSize: '13px',
                                fontWeight: 500,
                                color: '#92400e',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px'
                              }}
                            >
                              <span>{category.icon}</span>
                              {category.label}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {selectedSupport.personalInfo && Object.values(selectedSupport.personalInfo).some(v => v) && (
                <div style={{ marginBottom: '20px' }}>
                  <h4 style={{ margin: '0 0 12px 0', color: '#64748b', fontSize: '14px' }}>Thông tin cá nhân</h4>
                  <div style={{
                    background: '#f9fafb',
                    padding: '16px',
                    borderRadius: '8px',
                    display: 'grid',
                    gap: '12px'
                  }}>
                    {selectedSupport.personalInfo.usageTime && (
                      <div>
                        <strong>⏰ Thời gian sử dụng:</strong>{' '}
                        {selectedSupport.personalInfo.usageTime === 'less-than-1-month' && 'Dưới 1 tháng'}
                        {selectedSupport.personalInfo.usageTime === '1-3-months' && '1 - 3 tháng'}
                        {selectedSupport.personalInfo.usageTime === '3-6-months' && '3 - 6 tháng'}
                        {selectedSupport.personalInfo.usageTime === '6-12-months' && '6 - 12 tháng'}
                        {selectedSupport.personalInfo.usageTime === 'more-than-1-year' && 'Trên 1 năm'}
                        {!['less-than-1-month', '1-3-months', '3-6-months', '6-12-months', 'more-than-1-year'].includes(selectedSupport.personalInfo.usageTime) && selectedSupport.personalInfo.usageTime}
                      </div>
                    )}
                    {selectedSupport.personalInfo.purpose && (
                      <div>
                        <strong>🎯 Mục đích sử dụng:</strong>
                        <div style={{
                          marginTop: '8px',
                          padding: '12px',
                          background: 'white',
                          borderRadius: '6px',
                          whiteSpace: 'pre-wrap'
                        }}>
                          {selectedSupport.personalInfo.purpose}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div style={{
                display: 'flex',
                gap: '12px',
                justifyContent: 'flex-end',
                marginTop: '24px',
                paddingTop: '24px',
                borderTop: '1px solid #e5e7eb'
              }}>
                <select
                  value={selectedSupport.status}
                  onChange={(e) => handleStatusChange(selectedSupport._id, e.target.value)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb',
                    fontSize: '14px',
                    cursor: 'pointer'
                  }}
                >
                  <option value="pending">Chờ xử lý</option>
                  <option value="reviewed">Đã xem</option>
                  <option value="contacted">Đã liên hệ</option>
                  <option value="completed">Hoàn thành</option>
                </select>
                <button
                  onClick={() => setSelectedSupport(null)}
                  style={{
                    padding: '8px 16px',
                    background: '#f3f4f6',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer'
                  }}
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminSupportsPage;

