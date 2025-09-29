import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './FriendsPage.css';
import GroupSidebar from './GroupSidebar';

export default function FriendsPage() {
  const navigate = useNavigate();
  const [friends, setFriends] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const token = localStorage.getItem('token');

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        // try to fetch real friends from API; fallback to demo data if it fails
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await fetch('http://localhost:5000/api/friends', { headers });
        if (!mounted) return;
        if (res.ok) {
          const data = await res.json();
          setFriends(Array.isArray(data) ? data : []);
        } else {
          // demo fallback
          setFriends(demoFriends());
        }
      } catch (err) {
        if (!mounted) return;
        setFriends(demoFriends());
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, [token]);

  const demoFriends = () => ([
    { id: 'f1', name: 'Nguyễn Văn A', note: 'Bạn cấp 1', status: 'online' },
    { id: 'f2', name: 'Trần Thị B', note: 'Đồng nghiệp', status: 'away' },
    { id: 'f3', name: 'Lê Văn C', note: 'Bạn học', status: 'offline' },
    { id: 'f4', name: 'Phạm Thị D', note: 'Bạn thân', status: 'online' },
  ]);

  const filtered = friends.filter(f => f.name.toLowerCase().includes(query.toLowerCase()));

  const addFriend = () => {
    const name = window.prompt('Nhập tên bạn muốn thêm:');
    if (!name || !name.trim()) return;
    const newFriend = { id: `f_${Date.now()}`, name: name.trim(), note: '', status: 'offline' };
    setFriends(prev => [newFriend, ...prev]);
  };

  const removeFriend = (id) => {
    if (!window.confirm('Bạn có chắc muốn xóa bạn này?')) return;
    setFriends(prev => prev.filter(f => f.id !== id));
  };

  const openChat = (friend) => {
    // hint: navigate to chat page if exists
    navigate(`/chat/${friend.id}`, { state: { friend } });
  };

  const initials = (name) => {
    if (!name) return '';
    const parts = name.split(' ').filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0,2).toUpperCase();
    return (parts[0][0] + parts[parts.length-1][0]).toUpperCase();
  };

  return (
    <div className="group-page">
      <GroupSidebar />
      <main className="group-main friends-page">
        <div className="friends-header">
          <div>
            <h1>Bạn bè</h1>
            <p className="friends-sub">Quản lý danh sách bạn bè, nhắn tin và xem hoạt động</p>
          </div>
          <div className="friends-controls">
            <input
              type="search"
              placeholder="Tìm kiếm bạn bè..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="friends-search"
              aria-label="Tìm kiếm bạn bè"
            />
            <button className="btn-add" onClick={addFriend} aria-label="Thêm bạn">
              + Thêm bạn
            </button>
          </div>
        </div>

        <section className="friends-list-wrap">
          {loading ? (
            <div className="friends-empty">Đang tải...</div>
          ) : filtered.length === 0 ? (
            <div className="friends-empty">Không tìm thấy bạn bè</div>
          ) : (
            <ul className="friends-grid">
              {filtered.map(f => (
                <li key={f.id} className="friend-card" tabIndex={0} aria-label={f.name}>
                  <div className="friend-top">
                    <div className={`friend-avatar ${f.status || 'offline'}`} title={f.status || 'offline'}>
                      {initials(f.name)}
                    </div>
                    <div className="friend-info">
                      <div className="friend-name">{f.name}</div>
                      <div className="friend-note">{f.note}</div>
                    </div>
                  </div>
                  <div className="friend-actions">
                    <button className="btn msg" onClick={() => openChat(f)} aria-label={`Nhắn ${f.name}`}>Nhắn</button>
                    <button className="btn remove" onClick={() => removeFriend(f.id)} aria-label={`Xóa ${f.name}`}>Xóa</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
