import React, { useEffect, useState, useCallback, useMemo } from 'react';
import './CategorySettings.css';
import { showNotification as showGlobalNotification } from '../utils/notify';

export default function CategorySettings({ token }) {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [type, setType] = useState('expense');
  const [icon, setIcon] = useState('');

  // Use global notification only
  const showNotification = (message, type = 'success', timeout = 3500) => {
    showGlobalNotification(message, type, timeout);
  };

  // confirmation dialog state for delete action
  const [confirm, setConfirm] = useState({ open: false, id: null, name: '' });

  const openConfirm = (id, name) => {
    setConfirm({ open: true, id, name });
  };
  const cancelConfirm = () => setConfirm({ open: false, id: null, name: '' });

  // Thêm state cho animations và interactions
  const [animatingCards, setAnimatingCards] = useState(new Set());
  const [selectedType, setSelectedType] = useState('all');
  const [isCreating, setIsCreating] = useState(false);

  // Icon suggestions
  const iconSuggestions = [
    '🍔', '☕', '🚗', '🏠', '💰', '🎮', '📱', '👕', '💊', '📚',
    '🎬', '✈️', '⛽', '🛒', '💳', '🏦', '💡', '🎵', '🏥', '🎯'
  ];

  const handleDelete = async (id, name) => {
    setAnimatingCards(prev => new Set(prev).add(id));
    setTimeout(async () => {
      try {
        const res = await fetch(`http://localhost:5000/api/categories/${id}`, { method: 'DELETE', headers });
        if (!res.ok) {
          const txt = await res.text().catch(()=> 'Xóa thất bại');
          throw new Error(txt || 'Xóa thất bại');
        }
        await fetchCategories();
        showNotification('🗑️ Xóa danh mục thành công', 'success');
      } catch (err) {
        console.error(err);
        showNotification(err.message || 'Lỗi khi xóa danh mục', 'error');
      } finally {
        setAnimatingCards(prev => {
          const newSet = new Set(prev);
          newSet.delete(id);
          return newSet;
        });
        cancelConfirm();
      }
    }, 300);
  };

  const confirmDelete = () => handleDelete(confirm.id, confirm.name);

  // small search to filter categories on client side
  const [search, setSearch] = useState('');

  // categories shown after search (case-insensitive)
  const filteredCategories = useMemo(() => {
    const q = (search || '').trim().toLowerCase();
    if (!q) return categories;
    return (categories || []).filter(c => (c.name || '').toLowerCase().includes(q) || (c.type || '').toLowerCase().includes(q));
  }, [categories, search]);

  // Filter categories by type
  const filteredByType = useMemo(() => {
    if (selectedType === 'all') return filteredCategories;
    return filteredCategories.filter(c => c.type === selectedType);
  }, [filteredCategories, selectedType]);

  // stable headers memoized by token
  const headers = useMemo(() => (
    token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' }
  ), [token]);

  // parse JWT payload to obtain a user id for client-side filtering
  const parseJwt = (tkn) => {
    try {
      const payload = tkn.split('.')[1];
      const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
      const json = decodeURIComponent(atob(b64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
      return JSON.parse(json);
    } catch (err) {
      return {};
    }
  };

  const uid = useMemo(() => {
    if (!token) return null;
    const p = parseJwt(token);
    return p.id || p._id || p.userId || p.sub || null;
  }, [token]);

  // stable fetchCategories callback so it can be used in useEffect deps
  const fetchCategories = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('http://localhost:5000/api/categories', { headers });
      if (!res.ok) throw new Error('Không thể tải danh mục');
      const data = await res.json();
      // If we have a uid, filter to categories created/owned by this user
      if (uid) {
        const filtered = (data || []).filter(c => {
          const owner = c.owner;
          const createdBy = c.createdBy;
          const ownerId = owner && (typeof owner === 'object' ? (owner._id || owner.id) : owner);
          const creatorId = createdBy && (typeof createdBy === 'object' ? (createdBy._id || createdBy.id) : createdBy);
          return (ownerId && String(ownerId) === String(uid)) || (creatorId && String(creatorId) === String(uid));
        });
        setCategories(filtered);
      } else {
        setCategories(data || []);
      }
    } catch (err) {
      console.error(err);
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }, [headers, uid]);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!name.trim()) return showNotification('Tên danh mục là bắt buộc', 'error');
    
    setIsCreating(true);
    try {
      // Ensure we send the user ID if available
      const body = { name: name.trim(), type, icon };
      
      // If we have a user ID from token, include it as owner
      // The backend will prioritize the token, but this ensures owner is set
      if (uid) {
        body.owner = uid;
        body.createdBy = 'user';
      }
      
      const res = await fetch('http://localhost:5000/api/categories', {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const errText = await res.text().catch(()=> 'Tạo danh mục thất bại');
        throw new Error(errText || 'Tạo danh mục thất bại');
      }
      setName(''); setIcon('');
      await fetchCategories();
      showNotification('✨ Tạo danh mục thành công!', 'success');
    } catch (err) {
      console.error(err);
      showNotification(err.message || 'Lỗi khi tạo danh mục', 'error');
    } finally {
      setIsCreating(false);
    }
  };


  return (
    <div className="cat-settings bank-style">
      {/* Enhanced confirmation modal */}
      {confirm.open && (
        <div className="confirm-overlay fade-in" role="dialog" aria-modal="true">
          <div className="confirm-dialog scale-in">
            <div className="confirm-header">
              <div className="confirm-icon">🗑️</div>
              <div className="confirm-title">Xác nhận xóa danh mục</div>
            </div>
            <div className="confirm-body">
              Bạn có chắc chắn muốn xóa danh mục "<strong>{confirm.name}</strong>" không? 
              <br />
              <small className="warning-text">Hành động này không thể hoàn tác.</small>
            </div>
            <div className="confirm-actions">
              <button className="btn-cancel" onClick={cancelConfirm}>
                <span>Hủy</span>
              </button>
              <button className="btn-danger" onClick={confirmDelete}>
                <span>Xóa danh mục</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="cat-left">
        <div className="cat-header">
          <h3>
            <span className="cat-header-icon">📂</span>
            Danh mục của bạn
            <span className="cat-count">({filteredByType.length})</span>
          </h3>
          <div className="cat-actions">
            <div className="cat-filter-tabs">
              <button 
                className={`filter-tab ${selectedType === 'all' ? 'active' : ''}`}
                onClick={() => setSelectedType('all')}
              >
                Tất cả
              </button>
              <button 
                className={`filter-tab ${selectedType === 'expense' ? 'active' : ''}`}
                onClick={() => setSelectedType('expense')}
              >
                Chi tiêu
              </button>
              <button 
                className={`filter-tab ${selectedType === 'income' ? 'active' : ''}`}
                onClick={() => setSelectedType('income')}
              >
                Thu nhập
              </button>
            </div>
            <div className="search-wrapper">
              <input
                className="cat-search"
                placeholder="Tìm kiếm danh mục..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <span className="search-icon">🔍</span>
            </div>
          </div>
        </div>

        <div className="cat-grid">
          {loading ? (
            <div className="cat-loading">
              <div className="loading-spinner"></div>
              <span>Đang tải danh mục...</span>
            </div>
          ) : filteredByType.length === 0 ? (
            <div className="cat-empty-illustration">
              <div className="empty-ico animate-bounce">📂</div>
              <div className="empty-title">Chưa có danh mục nào</div>
              <div className="empty-subtitle">
                {search ? 'Không tìm thấy kết quả phù hợp' : 'Hãy tạo danh mục đầu tiên của bạn'}
              </div>
            </div>
          ) : (
            filteredByType.map((c, index) => (
              <div 
                key={c._id} 
                className={`cat-card ${animatingCards.has(c._id) ? 'deleting' : ''}`}
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                <div className="cat-card-left">
                  <div className="cat-avatar">
                    <span className="cat-icon">{c.icon || '📁'}</span>
                  </div>
                  <div className="cat-meta">
                    <div className="cat-title">{c.name}</div>
                    <div className={`cat-badge ${c.type === 'income' ? 'income' : 'expense'}`}>
                      {c.type === 'income' ? '💰 Thu nhập' : '💸 Chi tiêu'}
                    </div>
                  </div>
                </div>
                <div className="cat-card-right">
                  <div className="cat-id">#{String(c._id).slice(-6)}</div>
                  <button 
                    className="cat-delete" 
                    onClick={() => openConfirm(c._id, c.name)}
                    title="Xóa danh mục"
                  >
                    <span>🗑️</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <aside className="cat-right">
        <div className="cat-create-card">
          <div className="create-header">
            <h4>
              <span className="create-icon">✨</span>
              Tạo danh mục mới
            </h4>
            <p className="muted">Tạo danh mục để phân loại giao dịch của bạn một cách dễ dàng.</p>
          </div>
          
          <form className="cat-form" onSubmit={handleCreate}>
            <div className="form-group">
              <label>Tên danh mục</label>
              <input 
                value={name} 
                onChange={e => setName(e.target.value)} 
                placeholder="Ví dụ: Ăn uống, Du lịch..." 
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label>Loại danh mục</label>
              <div className="type-selector">
                <button
                  type="button"
                  className={`type-option ${type === 'expense' ? 'active' : ''}`}
                  onClick={() => setType('expense')}
                >
                  <span className="type-icon">💸</span>
                  <span>Chi tiêu</span>
                </button>
                <button
                  type="button"
                  className={`type-option ${type === 'income' ? 'active' : ''}`}
                  onClick={() => setType('income')}
                >
                  <span className="type-icon">💰</span>
                  <span>Thu nhập</span>
                </button>
              </div>
            </div>

            <div className="form-group">
              <label>
                Biểu tượng
                <a 
                  href="https://getemoji.com/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="emoji-link"
                  title="Mở trang web để tìm và copy emoji"
                >
                  Tìm Icon thêm để phù hợp với danh mục
                </a>
              </label>
              <div className="icon-input-wrapper">
                <input 
                  value={icon} 
                  onChange={e => setIcon(e.target.value)} 
                  placeholder="Chọn biểu tượng..." 
                  className="form-input icon-input"
                />
                <div className="icon-preview">{icon || '📁'}</div>
              </div>
              <div className="icon-suggestions">
                <span className="suggestions-label">Gợi ý:</span>
                {iconSuggestions.map((ico, i) => (
                  <button
                    key={i}
                    type="button"
                    className="icon-suggestion"
                    onClick={() => setIcon(ico)}
                  >
                    {ico}
                  </button>
                ))}
              </div>
            </div>

            <div className="cat-create-actions">
              <button 
                type="submit" 
                className={`btn-primary ${isCreating ? 'loading' : ''}`}
                disabled={isCreating}
              >
                {isCreating ? (
                  <>
                    <span className="btn-spinner"></span>
                    Đang tạo...
                  </>
                ) : (
                  <>
                    <span>✨ Tạo danh mục</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </aside>
    </div>
  );
}

