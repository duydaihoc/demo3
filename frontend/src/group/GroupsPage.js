import React, { useState, useEffect, useCallback } from 'react';
import GroupSidebar from './GroupSidebar';
import './GroupsPage.css';

export default function GroupsPage() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [groups, setGroups] = useState([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [creating, setCreating] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  // allow selecting multiple colors
  const [chosenColors, setChosenColors] = useState(['#4CAF50']);
  // Thêm state mới cho gradient direction
  const [gradientDirection, setGradientDirection] = useState('135deg');

  // notifications now handled in sidebar

  const API_BASE = 'http://localhost:5000';

  const getToken = () => localStorage.getItem('token');

  const fetchGroups = useCallback(async () => {
    setErrorMsg(null);
    const token = getToken();
    if (!token) {
      setErrorMsg('Bạn cần đăng nhập để xem nhóm.');
      setGroups([]);
      return;
    }

    setLoadingGroups(true);
    try {
      const res = await fetch(`${API_BASE}/api/groups`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 401) {
        setErrorMsg('Không hợp lệ hoặc hết hạn phiên. Vui lòng đăng nhập lại.');
        setGroups([]);
        setLoadingGroups(false);
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err && err.message ? err.message : 'Lỗi khi tải nhóm');
      }
      const data = await res.json();
      setGroups(data || []);
    } catch (err) {
      console.error('fetchGroups error', err);
      setErrorMsg(err.message || 'Lỗi khi tải nhóm');
    } finally {
      setLoadingGroups(false);
    }
  }, []);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const handleCreateGroup = async (e) => {
    e && e.preventDefault();
    setErrorMsg(null);
    if (!groupName.trim()) {
      setErrorMsg('Vui lòng nhập tên nhóm.');
      return;
    }
    const token = getToken();
    if (!token) {
      setErrorMsg('Bạn cần đăng nhập để tạo nhóm.');
      return;
    }

    setCreating(true);
    try {
      const payload = {
        name: groupName.trim(),
        description: groupDescription.trim(),
        members: [],
        // Lưu thông tin màu sắc dưới dạng object { colors, direction }
        color: { colors: chosenColors, direction: gradientDirection }
      };

      const res = await fetch(`${API_BASE}/api/groups`, {
         method: 'POST',
         headers: {
           'Content-Type': 'application/json',
           Authorization: `Bearer ${token}`
         },
         body: JSON.stringify(payload)
       });

      if (res.status === 401) {
        setErrorMsg('Không có quyền. Vui lòng đăng nhập lại.');
        setCreating(false);
        return;
      }

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err && (err.message || err.error) ? (err.message || err.error) : 'Server error');
      }

      await res.json();
      // Refresh list
      fetchGroups();
      // Reset form
      setShowCreateModal(false);
      setGroupName('');
      setGroupDescription('');
      setChosenColors(['#4CAF50']);
    } catch (err) {
      console.error('Create group failed', err);
      setErrorMsg(err.message || 'Lỗi khi tạo nhóm');
    } finally {
      setCreating(false);
    }
  };

  // Thêm nhiều màu sắc hơn để người dùng lựa chọn
  const colorOptions = [
    '#4CAF50','#2196F3','#FF9800','#E91E63','#9C27B0',
    '#009688','#1b74e4','#00b894','#FF5722','#673AB7',
    '#3F51B5','#00BCD4','#8BC34A','#FFC107','#F44336',
    '#795548','#607D8B','#9c88ff','#273c75','#16a085',
    '#27ae60','#2980b9','#8e44ad','#f39c12','#d35400'
  ];

  // Các hướng gradient có thể chọn
  const gradientDirections = [
    { value: '135deg', label: 'Chéo xuống' },
    { value: '45deg', label: 'Chéo lên' },
    { value: '90deg', label: 'Ngang' },
    { value: '180deg', label: 'Dọc' },
    { value: 'circle', label: 'Tròn' }
  ];

  const toggleColor = (c) => {
    setChosenColors(prev => {
      if (!prev) return [c];
      if (prev.includes(c)) return prev.filter(x => x !== c);
      return [...prev, c];
    });
  };

  // thay thế buildPreviewBg/buildCard background bằng phiên bản thống nhất,
  // chấp nhận: array of colors, JSON-stringified array, linear-gradient string,
  // comma-separated colors, hoặc single hex color.
  const normalizeColorsArray = (input) => {
    if (!input) return [];
    // if already array
    if (Array.isArray(input)) return input.filter(Boolean);
    // if object with colors property
    if (typeof input === 'object') {
      if (input.colors && Array.isArray(input.colors)) return input.colors.filter(Boolean);
      return [];
    }
    if (typeof input !== 'string') return [];
    const s = input.trim();
    // Already a linear-gradient string -> return empty (caller will use raw)
    if (s.toLowerCase().startsWith('linear-gradient')) return [];
    // Try parse JSON string (object or array)
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return parsed.filter(Boolean);
      if (parsed && parsed.colors && Array.isArray(parsed.colors)) return parsed.colors.filter(Boolean);
    } catch (e) { /* ignore */ }
    // Comma-separated values
    if (s.includes(',')) return s.split(',').map(p => p.trim()).filter(Boolean);
    // single color
    return [s];
  };

  // Hàm xây dựng background cải tiến
  const buildPreviewBg = (colorsOrInput, direction = gradientDirection) => {
    const colors = Array.isArray(colorsOrInput) ? colorsOrInput.filter(Boolean) : normalizeColorsArray(colorsOrInput);
    if (!colors || colors.length === 0) return '#fff';
    
    if (colors.length === 1) {
      return `linear-gradient(${direction}, ${colors[0]}cc, ${colors[0]}99)`;
    }
    
    const stops = colors.map(c => c.length <= 7 ? (c + 'aa') : c);
    
    if (direction === 'circle') {
      return `radial-gradient(circle, ${stops.join(', ')})`;
    }
    
    return `linear-gradient(${direction}, ${stops.join(', ')})`;
  };

  // Hàm phân tích chuỗi màu từ database
  const getCardBackground = (group) => {
    if (!group) return buildPreviewBg(['#4CAF50']);
    const col = group.color;
    if (!col) return buildPreviewBg(['#4CAF50']);

    // if backend returned an object { colors: [...], direction }
    if (typeof col === 'object') {
      if (col.colors && Array.isArray(col.colors)) return buildPreviewBg(col.colors, col.direction || gradientDirection);
      // fallback: try to normalize object
      const arr = normalizeColorsArray(col);
      if (arr.length) return buildPreviewBg(arr, col.direction || gradientDirection);
    }

    if (typeof col === 'string') {
      const s = col.trim();
      // raw CSS gradient stored as string
      if (s.toLowerCase().startsWith('linear-gradient') || s.toLowerCase().startsWith('radial-gradient')) return s;
      // try parse as JSON string
      try {
        const parsed = JSON.parse(s);
        if (parsed && parsed.colors && Array.isArray(parsed.colors)) {
          return buildPreviewBg(parsed.colors, parsed.direction || gradientDirection);
        }
      } catch (e) { /* ignore */ }
      const arr = normalizeColorsArray(s);
      if (arr && arr.length > 0) return buildPreviewBg(arr);
      return buildPreviewBg([s]);
    }

    // fallback
    return buildPreviewBg(['#4CAF50']);
  };

  return (
    <div className="groups-page">
      <GroupSidebar active="groups" />
      <main className="groups-main" role="main">
        <header className="groups-header">
          <div>
            <h1>Nhóm</h1>
            <p className="subtitle">Quản lý và xem các nhóm của bạn</p>
          </div>

          <div className="header-actions">
            <button className="create-group-btn" onClick={() => setShowCreateModal(true)}>+ Tạo nhóm mới</button>
          </div>
        </header>

        {errorMsg && (
          <div style={{ marginBottom: 12, color: '#b91c1c' }}>{errorMsg}</div>
        )}

        <section className="groups-card-container">
          {loadingGroups ? (
            <div className="loading-groups"><p>Đang tải danh sách nhóm...</p></div>
          ) : groups.length > 0 ? (
            groups.map(group => (
              <div key={group._id || group.id || group.id} className="group-card-v2 bank-card" style={{ background: getCardBackground(group) }}>
                <div className="wc-bg-shape wc-bg-a" />
                <div className="wc-bg-shape wc-bg-b" />

                <div className="bank-top" aria-hidden>
                  <div className="card-chip-small" />
                  <div className="card-number">•••• {String(group._id || group.id || '').slice(-6)}</div>
                </div>

                <div className="bank-balance" role="img" aria-label={`Tổng chi tiêu ${group.totalExpense || 0}`}>
                  <div className="balance-value">{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(group.totalExpense || 0)}</div>
                  <div className="balance-sub">Tổng chi tiêu nhóm</div>
                </div>

                <div className="bank-meta">
                  <div className="bank-name">{group.name}</div>

                  <div className="bank-owner">
                    <div className="owner-avatar" title={(group.owner && (group.owner.name || group.owner.email)) || 'Chủ nhóm'}>
                      {group.owner && (group.owner.name ? group.owner.name.split(' ').map(n => n[0]).slice(0,2).join('') : String(group.owner).slice(0,2)).toUpperCase()}
                    </div>
                    <div className="owner-info">
                      <div className="owner-name">{(group.owner && (group.owner.name || group.owner.email)) || 'Bạn'}</div>
                      <div className="owner-members">{(group.members && group.members.length) || 0} thành viên</div>
                    </div>
                  </div>
                </div>

                <div className="bank-actions">
                  <button className="wc-btn" onClick={() => alert('Xem chi tiết nhóm: ' + group.name)}>Xem chi tiết</button>
                  <button className="wc-btn outline" onClick={() => alert('Quản lý nhóm: ' + group.name)}>Quản lý</button>
                </div>
              </div>
            ))
          ) : (
            <div className="no-groups"><p>Bạn chưa tham gia nhóm nào. Hãy tạo nhóm mới!</p></div>
          )}
        </section>

        {showCreateModal && (
          <div className="modal-overlay">
            <div className="modal card-styled-modal create-group-modal">
              <div className="modal-header">
                <h2>Tạo nhóm mới</h2>
                <button className="close-btn" onClick={() => setShowCreateModal(false)}>&times;</button>
              </div>

              <form className="create-group-form" onSubmit={handleCreateGroup}>
                <div className="form-group">
                  <label>Tên nhóm</label>
                  <input 
                    type="text" 
                    value={groupName} 
                    onChange={(e) => setGroupName(e.target.value)} 
                    placeholder="Nhập tên nhóm..."
                    required 
                  />
                </div>

                <div className="form-group">
                  <label>Mô tả (tùy chọn)</label>
                  <input 
                    type="text" 
                    value={groupDescription} 
                    onChange={(e) => setGroupDescription(e.target.value)}
                    placeholder="Mô tả ngắn về nhóm..." 
                  />
                </div>

                {/* Giao diện chọn màu cải tiến */}
                <div className="form-group">
                  <label>Thiết kế thẻ nhóm</label>
                  
                  <div className="card-design-container">
                    <div className="design-options">
                      <div className="design-option">
                        <h4>Chọn màu sắc</h4>
                        <div className="color-picker" role="group" aria-label="Chọn màu thẻ">
                          {colorOptions.map(c => {
                            const selected = chosenColors.includes(c);
                            return (
                              <button
                                key={c}
                                type="button"
                                className={`swatch ${selected ? 'selected' : ''}`}
                                onClick={() => toggleColor(c)}
                                style={{ background: c }}
                                aria-pressed={selected}
                                title={c}
                              >
                                {selected && <span className="swatch-check">✓</span>}
                              </button>
                            );
                          })}
                        </div>
                        <div className="color-hint">
                          Chọn nhiều màu để tạo hiệu ứng gradient đẹp mắt
                        </div>
                      </div>
                      
                      <div className="design-option">
                        <h4>Hướng gradient</h4>
                        <div className="direction-selector">
                          {gradientDirections.map(dir => (
                            <button
                              key={dir.value}
                              type="button"
                              className={`direction-btn ${gradientDirection === dir.value ? 'selected' : ''}`}
                              onClick={() => setGradientDirection(dir.value)}
                            >
                              <span className="direction-icon" style={{
                                background: buildPreviewBg(['#4CAF50', '#2196F3'], dir.value)
                            }}></span>
                              <span>{dir.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    
                    {/* Xem trước thẻ cải tiến */}
                    <div className="card-preview-container">
                      <h4>Xem trước thẻ</h4>
                      <div className="bank-card-preview" style={{ background: buildPreviewBg(chosenColors) }}>
                        <div className="wc-bg-shape wc-bg-a" />
                        <div className="wc-bg-shape wc-bg-b" />
                        
                        <div className="bank-top">
                          <div className="card-chip-small" />
                          <div className="card-number">•••• NEW</div>
                        </div>

                        <div className="bank-balance">
                          <div className="balance-value">0 ₫</div>
                          <div className="balance-sub">Tổng chi tiêu nhóm</div>
                        </div>

                        <div className="bank-meta">
                          <div className="bank-name">{groupName || 'Tên nhóm'}</div>
                          <div className="bank-owner">
                            <div className="owner-avatar">YOU</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="form-actions">
                  <button type="button" className="cancel-btn" onClick={() => setShowCreateModal(false)}>Hủy</button>
                  <button type="submit" className="create-btn" disabled={creating}>
                    {creating ? 'Đang tạo...' : 'Tạo nhóm'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}



