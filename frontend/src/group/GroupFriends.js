import React, { useState, useEffect } from 'react';
import GroupSidebar from './GroupSidebar';
import './GroupFriends.css';

export default function GroupFriends() {
  const [searchEmail, setSearchEmail] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState([]); // users from API
  const [reqState, setReqState] = useState({}); // map key -> 'idle'|'sending'|'sent'|'error'|'friends'
  const [incomingRequests, setIncomingRequests] = useState([]); // new: incoming friend requests
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [friends, setFriends] = useState([]); // current user's friends list

  const API_BASE = 'http://localhost:5000';
  const token = localStorage.getItem('token');

  // --- Thay thế fetchCurrentUser: thử /api/friends/list trước rồi các endpoint khác ---
  const fetchCurrentUser = async () => {
    if (!token) return;

    // 1) try dedicated friends list endpoint first
    try {
      const listRes = await fetch(`${API_BASE}/api/friends/list`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (listRes.ok) {
        const listData = await listRes.json();
        if (Array.isArray(listData)) {
          setFriends(listData.map(f => ({ id: f.id || f._id || f._id, name: f.name || f.email || 'Thành viên', email: f.email || '' })));
          return;
        }
      }
    } catch (e) {
      // ignore and fall through to other endpoints
    }

    const endpoints = [
      `${API_BASE}/api/auth/me`,
      `${API_BASE}/api/users/me`,
      `${API_BASE}/api/auth/profile`,
      `${API_BASE}/api/users/profile`,
      `${API_BASE}/api/me`
    ];
    for (const url of endpoints) {
      try {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) continue;
        const user = await res.json();
        if (user && Array.isArray(user.friends)) {
          const mapped = user.friends.map(f => {
            if (!f) return { id: f, name: 'Thành viên', email: '' };
            if (typeof f === 'string') return { id: f, name: 'Thành viên', email: '' };
            return { id: f._id || f.id, name: f.name || f.email || 'Thành viên', email: f.email || '' };
          });
          setFriends(mapped);
          return; // done
        }
        // if user object returned but friends is populated object inside user.data or similar:
        if (user && user.data && Array.isArray(user.data.friends)) {
          const mapped = user.data.friends.map(f => {
            if (!f) return { id: f, name: 'Thành viên', email: '' };
            if (typeof f === 'string') return { id: f, name: 'Thành viên', email: '' };
            return { id: f._id || f.id, name: f.name || f.email || 'Thành viên', email: f.email || '' };
          });
          setFriends(mapped);
          return;
        }
      } catch (e) {
        // ignore and try next endpoint
      }
    }

    // fallback: try decode JWT payload to get some info (not friends)
    try {
      const parts = token.split('.');
      if (parts.length >= 2) {
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
        // payload may include minimal profile info, not friends
        if (payload && (payload.name || payload.email)) {
          setFriends([]); // no friends in token, leave empty
        }
      }
    } catch (e) { /* ignore */ }
  };

  // fetch incoming friend requests
  const fetchRequests = async () => {
    if (!token) return;
    setLoadingRequests(true);
    try {
      const res = await fetch(`${API_BASE}/api/friends/requests`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        setIncomingRequests([]);
        return;
      }
      const data = await res.json();
      setIncomingRequests(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn('fetchRequests error', err);
      setIncomingRequests([]);
    } finally {
      setLoadingRequests(false);
    }
  };

  // poll requests on mount (notifications handled in sidebar)
  useEffect(() => {
    fetchRequests();
    fetchCurrentUser();
    const interval = setInterval(fetchRequests, 8000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line

  const handleSearch = async (e) => {
    e && e.preventDefault();
    if (!searchEmail.trim()) return;
    setSearching(true);
    try {
      const q = encodeURIComponent(searchEmail.trim());
      const res = await fetch(`${API_BASE}/api/groups/search-users?email=${q}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (res.ok) {
        const data = await res.json();
        setResults(data || []);
      } else {
        setResults([]);
      }
    } catch (err) {
      console.error('search users failed', err);
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const sendFriendRequest = async (user) => {
    const key = user._id || user.email || user;
    // set sending state and disable button
    setReqState(prev => ({ ...prev, [key]: 'sending' }));
    try {
      const res = await fetch(`${API_BASE}/api/friends/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ email: user.email || user })
      });

      if (!res.ok) {
        // try parse server response
        const err = await res.json().catch(() => null);
        const msg = (err && err.message) ? String(err.message).toLowerCase() : '';

        // If server says request already sent, mark as sent
        // clarify operator precedence to satisfy ESLint
        if (msg.includes('already sent') || (msg.includes('already') && msg.includes('sent'))) {
          setReqState(prev => ({ ...prev, [key]: 'sent' }));
          return;
        }

        // otherwise show error state briefly
        setReqState(prev => ({ ...prev, [key]: 'error' }));
        console.warn('invite failed', err);
        setTimeout(() => setReqState(prev => ({ ...prev, [key]: 'idle' })), 3000);
        return;
      }

      // success -> mark as sent
      await res.json();
      setReqState(prev => ({ ...prev, [key]: 'sent' }));

      // try to refresh notifications (best-effort)
      try {
        await fetch(`${API_BASE}/api/notifications`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
      } catch (nErr) { /* ignore */ }
    } catch (err) {
      console.warn('sendFriendRequest error', err);
      setReqState(prev => ({ ...prev, [key]: 'error' }));
      setTimeout(() => setReqState(prev => ({ ...prev, [key]: 'idle' })), 3000);
    } finally {
      // refresh incoming requests after sending (recipient may now have a pending)
      setTimeout(fetchRequests, 800);
    }
  };

  // --- Thay đổi handleRespond: cập nhật UI ngay và làm mới friends ---
  const handleRespond = async (requestId, accept) => {
    if (!token) { alert('Bạn cần đăng nhập'); return; }
    // optimistic UI: remove request immediately so UX thấy thay đổi
    setIncomingRequests(prev => prev.filter(r => String(r._id || r.id) !== String(requestId)));
    try {
      const res = await fetch(`${API_BASE}/api/friends/respond`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ requestId, accept })
      });
      if (!res.ok) {
        // on error, re-fetch requests to restore list
        await fetchRequests();
        const err = await res.json().catch(() => null);
        alert((err && err.message) ? err.message : 'Không thể phản hồi lời mời');
        return;
      }
      await res.json();
      // refresh incoming requests and current user's friends
      await fetchRequests();
      await fetchCurrentUser();
      // also refresh notifications (best-effort)
      try { await fetch(`${API_BASE}/api/notifications`, { headers: { Authorization: `Bearer ${token}` } }); } catch(e){/*ignore*/}
      if (accept) alert('Đã chấp nhận lời mời');
      else alert('Đã từ chối lời mời');
    } catch (err) {
      console.warn('handleRespond error', err);
      // on network error, restore list
      await fetchRequests();
      alert('Lỗi mạng, thử lại');
    }
  };

  // remove friend handler
  const handleRemoveFriend = async (friendId) => {
    if (!token) { alert('Bạn cần đăng nhập'); return; }
    // optimistic UI remove
    const prev = friends;
    setFriends(prev => prev.filter(f => String(f.id || f._id) !== String(friendId)));

    try {
      const res = await fetch(`${API_BASE}/api/friends/remove`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ friendId })
      });
      if (!res.ok) {
        // rollback on error
        setFriends(prev);
        const err = await res.json().catch(() => null);
        alert((err && err.message) ? err.message : 'Không thể xóa bạn bè');
        return;
      }
      // success: optionally refresh requests and notifications
      await fetchCurrentUser();
      try { await fetch(`${API_BASE}/api/notifications`, { headers: { Authorization: `Bearer ${token}` } }); } catch(e){/*ignore*/}
      alert('Đã xóa bạn bè');
    } catch (err) {
      console.warn('handleRemoveFriend error', err);
      setFriends(prev);
      alert('Lỗi mạng, thử lại');
    }
  };

  return (
    <div className="groups-page">
      <GroupSidebar active="friends" />
      <main className="groups-main" role="main">
        <header className="groups-header">
          <div>
            <h1>Bạn bè</h1>
            <p className="subtitle">Quản lý danh sách bạn bè và lời mời kết bạn</p>
          </div>
        </header>

        <section className="friends-container">
          <div className="friends-panel">
            <div className="friends-card">
              <h2>Tìm và kết bạn</h2>

              {/* Friends list */}
              <div className="friends-list">
                <h3>Danh sách bạn bè</h3>
                {friends.length === 0 ? (
                  <p className="muted">Bạn chưa có bạn bè</p>
                ) : (
                  friends.map(f => (
                    <div key={f.id || f.email} className="friend-item">
                      <div className="friend-meta">
                        <div className="friend-name">{f.name || 'Thành viên'}</div>
                        <div className="friend-email">{f.email || ''}</div>
                      </div>
                     <div className="friend-actions">
                       <button className="remove-btn" onClick={() => handleRemoveFriend(f.id || f._id || f.email)}>Xóa</button>
                     </div>
                    </div>
                  ))
                )}
              </div>

              <form className="friend-search" onSubmit={handleSearch}>
                <input
                  type="email"
                  placeholder="Nhập email tìm kiếm..."
                  value={searchEmail}
                  onChange={(e) => setSearchEmail(e.target.value)}
                  className="friend-search-input"
                />
                <button type="submit" className="friend-search-btn" disabled={searching}>
                  {searching ? 'Đang tìm...' : 'Tìm'}
                </button>
              </form>

              <div className="search-results-list">
                {results.length === 0 ? (
                  <p className="muted">Không có kết quả. Thử email khác.</p>
                ) : (
                  results.map(u => {
                    const key = u._id || u.email;
                    const status = reqState[key] || 'idle';
                    return (
                      <div key={key} className="search-result-item friend-card">
                        <div className="user-info">
                          <div className="user-name">{u.name || 'Người dùng'}</div>
                          <div className="user-email">{u.email}</div>
                        </div>
                        <div className="user-action">
                          <button
                            className={[
                              'friend-btn',
                              status === 'sent' ? 'sent' : '',
                              status === 'sending' ? 'sending' : '',
                              status === 'error' ? 'error' : ''
                            ].join(' ').trim()}
                            onClick={() => sendFriendRequest(u)}
                            disabled={status === 'sent' || status === 'friends' || status === 'sending'}
                          >
                            {status === 'idle' && 'Kết bạn'}
                            {status === 'sending' && 'Đang gửi...'}
                            {status === 'sent' && 'Đã gửi'}
                            {status === 'error' && 'Lỗi, thử lại'}
                            {status === 'friends' && 'Bạn bè'}
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

            </div>
          </div>

          <aside className="friends-side">
            <div className="friends-info">
              <h3>Lời mời</h3>
              {loadingRequests ? (
                <p className="muted">Đang tải...</p>
              ) : incomingRequests.length === 0 ? (
                <p className="muted">Không có lời mời mới</p>
              ) : (
                <div className="incoming-requests">
                  {incomingRequests.map(req => {
                    const reqName = req.sender ? (req.sender.name || req.sender.email) : (req.recipientEmail || 'Người dùng');
                    return (
                      <div className="req-item" key={req._id || req.id}>
                        <div className="req-from">
                          <div className="req-name">{reqName}</div>
                          <div className="req-meta">{new Date(req.createdAt || req.created).toLocaleString()}</div>
                        </div>
                        <div className="req-actions">
                          <button className="accept-btn" onClick={() => handleRespond(req._id || req.id, true)}>Chấp nhận</button>
                          <button className="reject-btn" onClick={() => handleRespond(req._id || req.id, false)}>Từ chối</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}