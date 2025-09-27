import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import './CategorySettings.css';

export default function CategorySettings({ token }) {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [type, setType] = useState('expense');
  const [icon, setIcon] = useState('');

  // notification state
  const [notif, setNotif] = useState(null); // { message, type }
  const notifTimeoutRef = useRef(null);
  const showNotification = (message, type = 'success', timeout = 3500) => {
    if (notifTimeoutRef.current) {
      clearTimeout(notifTimeoutRef.current);
      notifTimeoutRef.current = null;
    }
    setNotif({ message, type });
    notifTimeoutRef.current = setTimeout(() => {
      setNotif(null);
      notifTimeoutRef.current = null;
    }, timeout);
  };

  // confirmation dialog state for delete action
  const [confirm, setConfirm] = useState({ open: false, id: null, name: '' });

  const openConfirm = (id, name) => {
    setConfirm({ open: true, id, name });
  };
  const cancelConfirm = () => setConfirm({ open: false, id: null, name: '' });

  const confirmDelete = async () => {
    const id = confirm.id;
    if (!id) return cancelConfirm();
    try {
      const res = await fetch(`http://localhost:5000/api/categories/${id}`, { method: 'DELETE', headers });
      if (!res.ok) {
        const txt = await res.text().catch(()=> 'Xóa thất bại');
        throw new Error(txt || 'Xóa thất bại');
      }
      await fetchCategories();
      showNotification('Xóa danh mục thành công', 'success');
    } catch (err) {
      console.error(err);
      showNotification(err.message || 'Lỗi khi xóa danh mục', 'error');
    } finally {
      cancelConfirm();
    }
  };

  // small search to filter categories on client side
  const [search, setSearch] = useState('');

  // categories shown after search (case-insensitive)
  const filteredCategories = useMemo(() => {
    const q = (search || '').trim().toLowerCase();
    if (!q) return categories;
    return (categories || []).filter(c => (c.name || '').toLowerCase().includes(q) || (c.type || '').toLowerCase().includes(q));
  }, [categories, search]);

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
    try {
      const res = await fetch('http://localhost:5000/api/categories', {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: name.trim(), type, icon })
      });
      if (!res.ok) {
        const errText = await res.text().catch(()=> 'Tạo danh mục thất bại');
        throw new Error(errText || 'Tạo danh mục thất bại');
      }
      setName(''); setIcon('');
      await fetchCategories();
      showNotification('Tạo danh mục thành công', 'success');
    } catch (err) {
      console.error(err);
      showNotification(err.message || 'Lỗi khi tạo danh mục', 'error');
    }
  };

  // cleanup notification timer on unmount
  useEffect(() => {
    return () => {
      if (notifTimeoutRef.current) {
        clearTimeout(notifTimeoutRef.current);
        notifTimeoutRef.current = null;
      }
    };
  }, []);

  return (
    <div className="cat-settings bank-style">
      {/* notification */}
      {notif && (
        <div className={`cat-notif ${notif.type === 'error' ? 'error' : 'success'}`} role="status">
          {notif.message}
        </div>
      )}

      {/* confirmation modal for delete */}
      {confirm.open && (
        <div className="confirm-overlay" role="dialog" aria-modal="true">
          <div className="confirm-dialog">
            <div className="confirm-title">Xác nhận xóa</div>
            <div className="confirm-body">Bạn có chắc chắn muốn xóa danh mục "<strong>{confirm.name}</strong>" không?</div>
            <div className="confirm-actions">
              <button className="btn-cancel" onClick={cancelConfirm}>Hủy</button>
              <button className="btn-danger" onClick={confirmDelete}>Xóa</button>
            </div>
          </div>
        </div>
      )}

      <div className="cat-left">
        <div className="cat-header">
          <h3>Danh mục của bạn</h3>
          <div className="cat-actions">
            <input
              className="cat-search"
              placeholder="Tìm kiếm danh mục..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="cat-grid">
          {loading ? (
            <div className="cat-loading">Đang tải danh mục...</div>
          ) : filteredCategories.length === 0 ? (
            <div className="cat-empty-illustration">
              <div className="empty-ico">📂</div>
              <div>Chưa có danh mục nào khớp</div>
            </div>
          ) : (
            filteredCategories.map(c => (
              <div key={c._id} className="cat-card">
                <div className="cat-card-left">
                  <div className="cat-avatar">{c.icon || '📁'}</div>
                  <div className="cat-meta">
                    <div className="cat-title">{c.name}</div>
                    <div className={`cat-badge ${c.type === 'income' ? 'income' : 'expense'}`}>{c.type === 'income' ? 'Thu nhập' : 'Chi tiêu'}</div>
                  </div>
                </div>
                <div className="cat-card-right">
                  <div className="cat-id">{String(c._id).slice(-6)}</div>
                  <button className="cat-delete" onClick={() => openConfirm(c._id, c.name)}>Xóa</button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <aside className="cat-right">
        <div className="cat-create-card">
          <h4>Tạo danh mục mới</h4>
          <p className="muted">Tạo danh mục để phân loại giao dịch của bạn.</p>
          <form className="cat-form" onSubmit={handleCreate}>
            <label>Tên danh mục</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Ví dụ: Ăn uống" />
            <label>Loại</label>
            <select value={type} onChange={e => setType(e.target.value)}>
              <option value="expense">Chi tiêu</option>
              <option value="income">Thu nhập</option>
            </select>
            <label>Icon</label>
            <input value={icon} onChange={e => setIcon(e.target.value)} placeholder="📌" />
            <div className="cat-create-actions">
              <button type="submit" className="btn-primary">Tạo danh mục</button>
            </div>
          </form>
        </div>
      </aside>
    </div>
  );
}
              
