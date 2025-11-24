import React, { useEffect, useState, useMemo, useRef } from 'react';
import './GroupActivityFeed.css';

/**
 * GroupActivityFeed - Facebook-style activity feed
 * - Dùng chung cho cả owner và member để đăng bài viết hoạt động, like, bình luận
 * - Giao diện giống Facebook với card trắng, avatar tròn, action buttons
 *
 * Props:
 * - groupId: string (bắt buộc)
 * - canPost?: boolean (mặc định true) — cho phép hiện form đăng bài
 * - title?: string — tiêu đề card, mặc định "Hoạt động nhóm (bài viết)"
 * - limit?: number — số bài mỗi lần tải, mặc định 20
 */
export default function GroupActivityFeed({
  groupId,
  canPost = true,
  title = 'Hoạt động nhóm (bài viết)',
  limit = 20,
}) {
  const API_BASE = 'http://localhost:5000';
  const token = useMemo(() => localStorage.getItem('token') || '', []);

  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [newPostContent, setNewPostContent] = useState('');
  const [newPostImageFile, setNewPostImageFile] = useState(null);
  const [newPostImagePreview, setNewPostImagePreview] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [posting, setPosting] = useState(false);
  const [expandedCreate, setExpandedCreate] = useState(false);
  const [showLinkTransaction, setShowLinkTransaction] = useState(false);
  const [groupTransactions, setGroupTransactions] = useState([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [selectedTransactionId, setSelectedTransactionId] = useState(null);
  const [transactionSearch, setTransactionSearch] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  const [commentInputs, setCommentInputs] = useState({});
  const [editingPostId, setEditingPostId] = useState(null);
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editPostContent, setEditPostContent] = useState('');
  const [editPostImageFile, setEditPostImageFile] = useState(null);
  const [editPostImagePreview, setEditPostImagePreview] = useState('');
  const [editPostImageUrl, setEditPostImageUrl] = useState('');
  const [editCommentContent, setEditCommentContent] = useState('');
  const [deletingPostId, setDeletingPostId] = useState(null);
  const [deletingCommentId, setDeletingCommentId] = useState(null);
  const [hoveredLikePostId, setHoveredLikePostId] = useState(null);
  const containerRef = useRef(null);

  // Get current user info
  const getMyId = () => {
    try {
      const t = token;
      if (!t) return '';
      const payload = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return payload.id || payload._id || payload.userId || '';
    } catch (e) {
      return '';
    }
  };

  const getMyEmail = () => {
    try {
      const t = token;
      if (!t) return '';
      const payload = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return payload.email || '';
    } catch (e) {
      return '';
    }
  };

  useEffect(() => {
    // Fetch current user info
    if (token) {
      fetch(`${API_BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.json())
        .then((data) => {
          if (data && data._id) setCurrentUser(data);
        })
        .catch(() => {});
    }
  }, [token]);

  const fetchPosts = async () => {
    if (!groupId || !token) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `${API_BASE}/api/groups/${encodeURIComponent(groupId)}/posts?limit=${encodeURIComponent(
          limit
        )}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || 'Không thể tải bài viết hoạt động');
      }
      const data = await res.json();
      setPosts(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message || 'Lỗi khi tải bài viết hoạt động');
      setPosts([]);
    } finally {
      setLoading(false);
    }
  };

  const handleImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Vui lòng chọn file hình ảnh');
      return;
    }

    // Validate file size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError('Kích thước file không được vượt quá 10MB');
      return;
    }

    setNewPostImageFile(file);
    setError('');

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setNewPostImagePreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setNewPostImageFile(null);
    setNewPostImagePreview('');
  };

  const fetchGroupTransactions = async (excludePostId = null) => {
    if (!groupId || !token) return;
    setLoadingTransactions(true);
    try {
      // Fetch cả transactions và posts để biết giao dịch nào đã được liên kết
      const [txRes, postsRes] = await Promise.all([
        fetch(
          `${API_BASE}/api/groups/${encodeURIComponent(groupId)}/transactions`,
          {
            headers: { Authorization: `Bearer ${token}` }
          }
        ),
        fetch(
          `${API_BASE}/api/groups/${encodeURIComponent(groupId)}/posts?limit=100`,
          {
            headers: { Authorization: `Bearer ${token}` }
          }
        )
      ]);

      if (!txRes.ok) {
        throw new Error('Không thể tải danh sách giao dịch');
      }
      if (!postsRes.ok) {
        throw new Error('Không thể tải danh sách bài viết');
      }

      const transactionsData = await txRes.json();
      const postsData = await postsRes.json();
      const allTransactions = Array.isArray(transactionsData) ? transactionsData : [];
      const allPosts = Array.isArray(postsData) ? postsData : [];
      
      // Lấy danh sách giao dịch đã được liên kết (trừ bài viết đang edit nếu có)
      const linkedTransactionIds = new Set();
      allPosts.forEach(post => {
        // Bỏ qua bài viết đang edit
        if (excludePostId && post._id === excludePostId) return;
        
        if (post.linkedTransaction) {
          const linkedTxId = post.linkedTransaction._id || post.linkedTransaction.id || post.linkedTransaction;
          if (linkedTxId) {
            linkedTransactionIds.add(String(linkedTxId));
          }
        }
      });
      
      // Filter chỉ lấy giao dịch do user hiện tại tạo và chưa được liên kết
      const myId = getMyId();
      const availableTransactions = allTransactions.filter(tx => {
        // Chỉ lấy giao dịch do user hiện tại tạo
        const createdById = tx.createdBy?._id || tx.createdBy?.id || tx.createdBy;
        if (!createdById || String(createdById) !== String(myId)) {
          return false;
        }
        
        // Loại bỏ giao dịch đã được liên kết
        const txId = tx._id || tx.id;
        if (txId && linkedTransactionIds.has(String(txId))) {
          return false;
        }
        
        return true;
      });
      
      setGroupTransactions(availableTransactions);
    } catch (e) {
      console.error('Error fetching group transactions:', e);
      setGroupTransactions([]);
    } finally {
      setLoadingTransactions(false);
    }
  };

  const handleCreatePost = async () => {
    if (!groupId || !token) return;
    if (!newPostContent.trim() && !newPostImageFile && !selectedTransactionId) return;
    setPosting(true);
    setError('');
    try {
      let imageUrl = '';

      // Upload image if exists
      if (newPostImageFile) {
        setUploadingImage(true);
        const formData = new FormData();
        formData.append('image', newPostImageFile);

        const uploadRes = await fetch(
          `${API_BASE}/api/groups/${encodeURIComponent(groupId)}/posts/upload-image`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
            },
            body: formData,
          }
        );

        if (!uploadRes.ok) {
          const uploadData = await uploadRes.json().catch(() => null);
          throw new Error(uploadData?.message || 'Không thể upload hình ảnh');
        }

        const uploadData = await uploadRes.json();
        imageUrl = `${API_BASE}${uploadData.imageUrl}`;
        setUploadingImage(false);
      }

      // Create post
      const res = await fetch(
        `${API_BASE}/api/groups/${encodeURIComponent(groupId)}/posts`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            content: newPostContent.trim(),
            images: imageUrl ? [imageUrl] : [],
            linkedTransaction: selectedTransactionId || null,
          }),
        }
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.message || 'Không thể đăng bài viết');
      }
      setNewPostContent('');
      setNewPostImageFile(null);
      setNewPostImagePreview('');
      setSelectedTransactionId(null);
      setShowLinkTransaction(false);
      setExpandedCreate(false);
      setPosts((prev) => [data, ...prev]);
    } catch (e) {
      setError(e.message || 'Lỗi khi đăng bài viết');
      setUploadingImage(false);
    } finally {
      setPosting(false);
    }
  };

  const handleToggleLike = async (postId) => {
    if (!groupId || !token) return;
    try {
      const res = await fetch(
        `${API_BASE}/api/groups/${encodeURIComponent(
          groupId
        )}/posts/${encodeURIComponent(postId)}/like`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) return;
      setPosts((prev) => prev.map((p) => (p._id === data._id ? data : p)));
    } catch (_) {
      /* noop */
    }
  };

  const handleAddComment = async (postId, content) => {
    const text = (content || '').trim();
    if (!text || !groupId || !token) return;
    try {
      const res = await fetch(
        `${API_BASE}/api/groups/${encodeURIComponent(
          groupId
        )}/posts/${encodeURIComponent(postId)}/comments`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ content: text }),
        }
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) return;
      setPosts((prev) => prev.map((p) => (p._id === data._id ? data : p)));
      setCommentInputs((prev) => ({ ...prev, [postId]: '' }));
    } catch (_) {
      /* noop */
    }
  };

  const handleEditImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Vui lòng chọn file hình ảnh');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      alert('Kích thước file không được vượt quá 10MB');
      return;
    }

    setEditPostImageFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setEditPostImagePreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveEditImage = () => {
    setEditPostImageFile(null);
    setEditPostImagePreview('');
    setEditPostImageUrl('');
  };

  const handleUpdatePost = async (postId) => {
    if (!groupId || !token || !postId) return;
    try {
      let imageUrl = editPostImageUrl;

      // Upload new image if exists
      if (editPostImageFile) {
        const formData = new FormData();
        formData.append('image', editPostImageFile);

        const uploadRes = await fetch(
          `${API_BASE}/api/groups/${encodeURIComponent(groupId)}/posts/upload-image`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
            },
            body: formData,
          }
        );

        if (!uploadRes.ok) {
          const uploadData = await uploadRes.json().catch(() => null);
          alert(uploadData?.message || 'Không thể upload hình ảnh');
          return;
        }

        const uploadData = await uploadRes.json();
        imageUrl = `${API_BASE}${uploadData.imageUrl}`;
      }

      const res = await fetch(
        `${API_BASE}/api/groups/${encodeURIComponent(groupId)}/posts/${encodeURIComponent(postId)}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            content: editPostContent.trim(),
            images: imageUrl ? [imageUrl] : [],
            linkedTransaction: selectedTransactionId || null,
          }),
        }
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        alert(data?.message || 'Không thể cập nhật bài viết');
        return;
      }
      setPosts((prev) => prev.map((p) => (p._id === data._id ? data : p)));
      setEditingPostId(null);
      setEditPostContent('');
      setEditPostImageFile(null);
      setEditPostImagePreview('');
      setEditPostImageUrl('');
      setSelectedTransactionId(null);
      setShowLinkTransaction(false);
    } catch (e) {
      console.error('handleUpdatePost error', e);
      alert('Lỗi khi cập nhật bài viết');
    }
  };

  const handleDeletePost = async (postId) => {
    if (!groupId || !token || !postId) return;
    if (!window.confirm('Bạn có chắc muốn xóa bài viết này?')) return;
    setDeletingPostId(postId);
    try {
      const res = await fetch(
        `${API_BASE}/api/groups/${encodeURIComponent(groupId)}/posts/${encodeURIComponent(postId)}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        alert(data?.message || 'Không thể xóa bài viết');
        setDeletingPostId(null);
        return;
      }
      setPosts((prev) => prev.filter((p) => p._id !== postId));
    } catch (e) {
      console.error('handleDeletePost error', e);
      alert('Lỗi khi xóa bài viết');
    } finally {
      setDeletingPostId(null);
    }
  };

  const handleUpdateComment = async (postId, commentId) => {
    if (!groupId || !token || !postId || !commentId) return;
    const text = (editCommentContent || '').trim();
    if (!text) return;
    try {
      const res = await fetch(
        `${API_BASE}/api/groups/${encodeURIComponent(
          groupId
        )}/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ content: text }),
        }
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        alert(data?.message || 'Không thể cập nhật bình luận');
        return;
      }
      setPosts((prev) => prev.map((p) => (p._id === data._id ? data : p)));
      setEditingCommentId(null);
      setEditCommentContent('');
    } catch (e) {
      console.error('handleUpdateComment error', e);
      alert('Lỗi khi cập nhật bình luận');
    }
  };

  const handleDeleteComment = async (postId, commentId) => {
    if (!groupId || !token || !postId || !commentId) return;
    if (!window.confirm('Bạn có chắc muốn xóa bình luận này?')) return;
    setDeletingCommentId(commentId);
    try {
      const res = await fetch(
        `${API_BASE}/api/groups/${encodeURIComponent(
          groupId
        )}/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        alert(data?.message || 'Không thể xóa bình luận');
        setDeletingCommentId(null);
        return;
      }
      setPosts((prev) => prev.map((p) => (p._id === data._id ? data : p)));
    } catch (e) {
      console.error('handleDeleteComment error', e);
      alert('Lỗi khi xóa bình luận');
    } finally {
      setDeletingCommentId(null);
    }
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Vừa xong';
    if (minutes < 60) return `${minutes} phút trước`;
    if (hours < 24) return `${hours} giờ trước`;
    if (days < 7) return `${days} ngày trước`;
    return date.toLocaleDateString('vi-VN', { day: 'numeric', month: 'short' });
  };

  const getInitial = (name) => {
    if (!name) return 'U';
    return name.charAt(0).toUpperCase();
  };

  useEffect(() => {
    if (groupId && token) {
      fetchPosts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, token]);

  const myId = getMyId();

  return (
    <div className="gm-card" style={{ gridColumn: "2 / -1" }}>
      <div className="gm-card-header">
        <h2 className="gm-card-title">
          <i className="fas fa-comment-dots"></i> {title}
        </h2>
        <button className="gm-btn secondary" onClick={fetchPosts}>
          <i className="fas fa-sync-alt"></i> Làm mới
        </button>
      </div>
      <div className="gm-card-body" style={{ padding: 0, overflow: 'visible' }}>
        {/* Create Post Section - Facebook Style */}
        {canPost && (
          <>
            {!expandedCreate ? (
              <div className="gaf-create-post">
                <div className="gaf-create-avatar">
                  {getInitial(currentUser?.name || currentUser?.email || 'U')}
                </div>
                <div
                  className="gaf-create-input-wrapper"
                  onClick={() => setExpandedCreate(true)}
                >
                  <input
                    type="text"
                    className="gaf-create-input"
                    placeholder="Bạn đang nghĩ gì?"
                    readOnly
                  />
                </div>
              </div>
            ) : (
              <div className="gaf-create-expanded">
                <textarea
                  className="gaf-create-textarea"
                  placeholder="Bạn đang nghĩ gì?"
                  value={newPostContent}
                  onChange={(e) => setNewPostContent(e.target.value)}
                  disabled={posting || uploadingImage}
                  autoFocus
                />
                
                {/* Image Upload */}
                <div className="gaf-image-upload-section">
                  <label htmlFor="post-image-input" className="gaf-image-upload-btn">
                    <i className="fas fa-image"></i>
                    <span>Chọn ảnh</span>
                  </label>
                  <input
                    id="post-image-input"
                    type="file"
                    accept="image/*"
                    onChange={handleImageSelect}
                    disabled={posting || uploadingImage}
                    style={{ display: 'none' }}
                  />
                  
                  {/* Image Preview */}
                  {newPostImagePreview && (
                    <div className="gaf-image-preview">
                      <img src={newPostImagePreview} alt="Preview" />
                      <button
                        type="button"
                        className="gaf-image-remove-btn"
                        onClick={handleRemoveImage}
                        disabled={posting || uploadingImage}
                        title="Xóa ảnh"
                      >
                        <i className="fas fa-times"></i>
                      </button>
                    </div>
                  )}
                </div>

                {/* Link Transaction Section */}
                <div className="gaf-link-transaction-section">
                  <button
                    type="button"
                    className="gaf-link-transaction-btn"
                    onClick={() => {
                      setShowLinkTransaction(!showLinkTransaction);
                      if (!showLinkTransaction && groupTransactions.length === 0) {
                        fetchGroupTransactions(null);
                      }
                    }}
                    disabled={posting || uploadingImage}
                  >
                    <i className="fas fa-link"></i>
                    <span>{selectedTransactionId ? 'Đã liên kết giao dịch' : 'Liên kết với giao dịch'}</span>
                  </button>

                  {showLinkTransaction && (
                    <div className="gaf-transaction-selector">
                      <div className="gaf-transaction-search">
                        <i className="fas fa-search"></i>
                        <input
                          type="text"
                          placeholder="Tìm kiếm giao dịch..."
                          value={transactionSearch}
                          onChange={(e) => setTransactionSearch(e.target.value)}
                        />
                      </div>
                      {loadingTransactions ? (
                        <div className="gaf-transaction-loading">
                          <i className="fas fa-spinner fa-spin"></i>
                          <span>Đang tải giao dịch...</span>
                        </div>
                      ) : (
                        <div className="gaf-transaction-list">
                          <button
                            type="button"
                            className={`gaf-transaction-item ${!selectedTransactionId ? 'selected' : ''}`}
                            onClick={() => setSelectedTransactionId(null)}
                          >
                            <div className="gaf-transaction-item-info">
                              <div className="gaf-transaction-item-title">
                                <i className="fas fa-unlink" style={{ marginRight: '8px', opacity: 0.7 }}></i>
                                Không liên kết
                              </div>
                            </div>
                            {!selectedTransactionId && (
                              <i className="fas fa-check"></i>
                            )}
                          </button>
                          {(transactionSearch
                            ? groupTransactions.filter(tx =>
                                (tx.title || '').toLowerCase().includes(transactionSearch.toLowerCase()) ||
                                (tx.description || '').toLowerCase().includes(transactionSearch.toLowerCase())
                              )
                            : groupTransactions
                          ).map(tx => (
                            <button
                              key={tx._id}
                              type="button"
                              className={`gaf-transaction-item ${selectedTransactionId === tx._id ? 'selected' : ''}`}
                              onClick={() => setSelectedTransactionId(tx._id)}
                            >
                              <div className="gaf-transaction-item-info">
                                <div className="gaf-transaction-item-title">{tx.title || 'Giao dịch không tên'}</div>
                                <div className="gaf-transaction-item-meta">
                                  {tx.category && (
                                    <span className="gaf-transaction-category">
                                      {tx.category.icon} {tx.category.name}
                                    </span>
                                  )}
                                  <span className="gaf-transaction-amount">
                                    {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(tx.amount || 0)}
                                  </span>
                                </div>
                              </div>
                              {selectedTransactionId === tx._id && (
                                <i className="fas fa-check"></i>
                              )}
                            </button>
                          ))}
                          {groupTransactions.length === 0 && (
                            <div className="gaf-transaction-empty">
                              <i className="fas fa-inbox"></i>
                              <div>Chưa có giao dịch nào trong nhóm</div>
                            </div>
                          )}
                          {groupTransactions.length > 0 && transactionSearch && 
                           (transactionSearch
                             ? groupTransactions.filter(tx =>
                                 (tx.title || '').toLowerCase().includes(transactionSearch.toLowerCase()) ||
                                 (tx.description || '').toLowerCase().includes(transactionSearch.toLowerCase())
                               )
                             : groupTransactions
                           ).length === 0 && (
                            <div className="gaf-transaction-empty">
                              <i className="fas fa-search"></i>
                              <div>Không tìm thấy giao dịch phù hợp</div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Selected Transaction Preview */}
                  {selectedTransactionId && !showLinkTransaction && (() => {
                    const selectedTx = groupTransactions.find(tx => tx._id === selectedTransactionId);
                    if (!selectedTx) return null;
                    return (
                      <div className="gaf-linked-transaction-preview">
                        <div className="gaf-linked-transaction-header">
                          <i className="fas fa-link"></i>
                          <span>Giao dịch đã liên kết</span>
                          <button
                            type="button"
                            className="gaf-unlink-btn"
                            onClick={() => setSelectedTransactionId(null)}
                            disabled={posting || uploadingImage}
                          >
                            <i className="fas fa-times"></i>
                          </button>
                        </div>
                        <div className="gaf-linked-transaction-content">
                          <div className="gaf-linked-transaction-title">{selectedTx.title || 'Giao dịch không tên'}</div>
                          <div className="gaf-linked-transaction-details">
                            {selectedTx.category && (
                              <span className="gaf-linked-category">
                                {selectedTx.category.icon} {selectedTx.category.name}
                              </span>
                            )}
                            <span className="gaf-linked-amount">
                              {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(selectedTx.amount || 0)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {error && (
                  <div className="gaf-error">
                    <i className="fas fa-exclamation-circle"></i> {error}
                  </div>
                )}
                <div className="gaf-create-actions">
                  <div className="gaf-create-buttons">
                    <button
                      className="gaf-create-btn gaf-create-btn-secondary"
                      onClick={() => {
                        setExpandedCreate(false);
                        setNewPostContent('');
                        setNewPostImageFile(null);
                        setNewPostImagePreview('');
                        setSelectedTransactionId(null);
                        setShowLinkTransaction(false);
                        setError('');
                      }}
                      disabled={posting || uploadingImage}
                    >
                      Hủy
                    </button>
                  </div>
                  <button
                    className="gaf-create-btn gaf-create-btn-primary"
                    onClick={handleCreatePost}
                    disabled={posting || uploadingImage || (!newPostContent.trim() && !newPostImageFile && !selectedTransactionId)}
                  >
                    {posting || uploadingImage ? (
                      <>
                        <i className="fas fa-spinner fa-spin"></i> {uploadingImage ? 'Đang upload ảnh...' : 'Đang đăng...'}
                      </>
                    ) : (
                      <>
                        <i className="fas fa-paper-plane"></i> Đăng
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Posts Feed */}
        {loading ? (
          <div className="gaf-loading">
            <i className="fas fa-spinner fa-spin"></i> Đang tải bài viết...
          </div>
        ) : posts.length === 0 ? (
          <div className="gaf-empty">
            <i className="fas fa-comments"></i>
            <div>Chưa có hoạt động nào. Hãy đăng bài đầu tiên cho nhóm!</div>
          </div>
        ) : (
          <div className="gaf-container" ref={containerRef}>
              {posts.map((post) => {
                const likeCount = post.likes ? post.likes.length : 0;
              const commentCount = post.comments ? post.comments.length : 0;
              const hasLiked =
                post.likes &&
                post.likes.some((like) => {
                  if (typeof like === 'object') {
                    // Like object có thể có user field (ObjectId hoặc populated)
                    const likeUserId =
                      like.user?._id || like.user?.id || like.user || like._id || like.id;
                    return String(likeUserId) === String(myId);
                  }
                  // Like có thể là user ID trực tiếp
                  return String(like) === String(myId);
                });
              const authorName = post.author?.name || post.author?.email || 'Thành viên';
              const authorInitial = getInitial(authorName);
              // Get author ID - handle both populated object and raw ID
              const authorId = post.author?._id || post.author?.id || post.author;
              const isPostAuthor = authorId && myId && String(authorId) === String(myId);
              const isEditingPost = editingPostId === post._id;

              return (
                <div key={post._id} className="gaf-post">
                  <div className="gaf-post-inner">
                  {/* Post Header */}
                  <div className="gaf-post-header">
                    <div className="gaf-post-avatar">{authorInitial}</div>
                    <div className="gaf-post-info">
                      <div className="gaf-post-author">{authorName}</div>
                      <div className="gaf-post-time">{formatTime(post.createdAt)}</div>
                    </div>
                    {isPostAuthor && !isEditingPost && (
                      <div className="gaf-post-menu">
                        <div className="gaf-post-menu-dropdown">
                          <button
                            type="button"
                            className="gaf-menu-btn"
                            title="Tùy chọn"
                          >
                            <i className="fas fa-ellipsis-h"></i>
                            <span className="gaf-menu-btn-text">Tùy chọn</span>
                          </button>
                          <div className="gaf-post-menu-items">
                            <button
                              type="button"
                              className="gaf-menu-item"
                              onClick={() => {
                                setEditingPostId(post._id);
                                setEditPostContent(post.content || '');
                                const existingImage = post.images && post.images.length > 0 ? post.images[0] : '';
                                setEditPostImageUrl(existingImage);
                                setEditPostImagePreview(existingImage);
                                setEditPostImageFile(null);
                                setSelectedTransactionId(post.linkedTransaction?._id || post.linkedTransaction || null);
                                // Fetch transactions, exclude current post ID so its linked transaction is still available
                                fetchGroupTransactions(post._id);
                              }}
                            >
                              <i className="fas fa-edit"></i> Sửa bài viết
                            </button>
                            <button
                              type="button"
                              className="gaf-menu-item"
                              onClick={() => {
                                setShowLinkTransaction(true);
                                if (groupTransactions.length === 0) {
                                  fetchGroupTransactions(post._id);
                                }
                                setSelectedTransactionId(post.linkedTransaction?._id || post.linkedTransaction || null);
                                // Scroll to link transaction section if editing
                                if (!editingPostId) {
                                  // If not editing, open edit mode first
                                  setEditingPostId(post._id);
                                  setEditPostContent(post.content || '');
                                  const existingImage = post.images && post.images.length > 0 ? post.images[0] : '';
                                  setEditPostImageUrl(existingImage);
                                  setEditPostImagePreview(existingImage);
                                  setEditPostImageFile(null);
                                  setTimeout(() => {
                                    const linkSection = document.querySelector('.gaf-link-transaction-section');
                                    if (linkSection) {
                                      linkSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                    }
                                  }, 100);
                                } else {
                                  setTimeout(() => {
                                    const linkSection = document.querySelector('.gaf-link-transaction-section');
                                    if (linkSection) {
                                      linkSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                    }
                                  }, 100);
                                }
                              }}
                            >
                              <i className="fas fa-link"></i> {post.linkedTransaction ? 'Sửa liên kết giao dịch' : 'Liên kết giao dịch'}
                            </button>
                            <button
                              type="button"
                              className="gaf-menu-item danger"
                              onClick={() => handleDeletePost(post._id)}
                              disabled={deletingPostId === post._id}
                            >
                              {deletingPostId === post._id ? (
                                <>
                                  <i className="fas fa-spinner fa-spin"></i> Đang xóa...
                                </>
                              ) : (
                                <>
                                  <i className="fas fa-trash"></i> Xóa bài viết
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Post Content - Edit Mode */}
                  {isEditingPost ? (
                    <div className="gaf-edit-post">
                      <textarea
                        className="gaf-create-textarea"
                        placeholder="Bạn đang nghĩ gì?"
                        value={editPostContent}
                        onChange={(e) => setEditPostContent(e.target.value)}
                        rows={4}
                      />
                      
                      {/* Image Upload for Edit */}
                      <div className="gaf-image-upload-section">
                        <label htmlFor={`edit-post-image-input-${post._id}`} className="gaf-image-upload-btn">
                          <i className="fas fa-image"></i>
                          <span>{editPostImagePreview ? 'Thay đổi ảnh' : 'Chọn ảnh'}</span>
                        </label>
                        <input
                          id={`edit-post-image-input-${post._id}`}
                          type="file"
                          accept="image/*"
                          onChange={handleEditImageSelect}
                          style={{ display: 'none' }}
                        />
                        
                        {/* Image Preview */}
                        {editPostImagePreview && (
                          <div className="gaf-image-preview">
                            <img src={editPostImagePreview} alt="Preview" />
                            <button
                              type="button"
                              className="gaf-image-remove-btn"
                              onClick={handleRemoveEditImage}
                              title="Xóa ảnh"
                            >
                              <i className="fas fa-times"></i>
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Link Transaction Section for Edit */}
                      <div className="gaf-link-transaction-section">
                        <button
                          type="button"
                          className="gaf-link-transaction-btn"
                          onClick={() => {
                            setShowLinkTransaction(!showLinkTransaction);
                      if (!showLinkTransaction && groupTransactions.length === 0) {
                        fetchGroupTransactions(null);
                      }
                          }}
                        >
                          <i className="fas fa-link"></i>
                          <span>{selectedTransactionId ? 'Đã liên kết giao dịch' : 'Liên kết với giao dịch'}</span>
                        </button>

                        {showLinkTransaction && (
                          <div className="gaf-transaction-selector">
                            <div className="gaf-transaction-search">
                              <i className="fas fa-search"></i>
                              <input
                                type="text"
                                placeholder="Tìm kiếm giao dịch..."
                                value={transactionSearch}
                                onChange={(e) => setTransactionSearch(e.target.value)}
                              />
                            </div>
                            {loadingTransactions ? (
                              <div className="gaf-transaction-loading">
                                <i className="fas fa-spinner fa-spin"></i> Đang tải...
                              </div>
                            ) : (
                              <div className="gaf-transaction-list">
                                <button
                                  type="button"
                                  className={`gaf-transaction-item ${!selectedTransactionId ? 'selected' : ''}`}
                                  onClick={() => setSelectedTransactionId(null)}
                                >
                                  <span>Không liên kết</span>
                                </button>
                                {(transactionSearch
                                  ? groupTransactions.filter(tx =>
                                      (tx.title || '').toLowerCase().includes(transactionSearch.toLowerCase()) ||
                                      (tx.description || '').toLowerCase().includes(transactionSearch.toLowerCase())
                                    )
                                  : groupTransactions
                                ).map(tx => (
                                  <button
                                    key={tx._id}
                                    type="button"
                                    className={`gaf-transaction-item ${selectedTransactionId === tx._id ? 'selected' : ''}`}
                                    onClick={() => setSelectedTransactionId(tx._id)}
                                  >
                                    <div className="gaf-transaction-item-info">
                                      <div className="gaf-transaction-item-title">{tx.title || 'Giao dịch không tên'}</div>
                                      <div className="gaf-transaction-item-meta">
                                        {tx.category && (
                                          <span className="gaf-transaction-category">
                                            {tx.category.icon} {tx.category.name}
                                          </span>
                                        )}
                                        <span className="gaf-transaction-amount">
                                          {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(tx.amount || 0)}
                                        </span>
                                      </div>
                                    </div>
                                    {selectedTransactionId === tx._id && (
                                      <i className="fas fa-check"></i>
                                    )}
                                  </button>
                                ))}
                                {groupTransactions.length === 0 && (
                                  <div className="gaf-transaction-empty">
                                    Chưa có giao dịch nào trong nhóm
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Selected Transaction Preview for Edit */}
                        {selectedTransactionId && !showLinkTransaction && (() => {
                          const selectedTx = groupTransactions.find(tx => tx._id === selectedTransactionId);
                          if (!selectedTx) return null;
                          return (
                            <div className="gaf-linked-transaction-preview">
                              <div className="gaf-linked-transaction-header">
                                <i className="fas fa-link"></i>
                                <span>Giao dịch đã liên kết</span>
                                <button
                                  type="button"
                                  className="gaf-unlink-btn"
                                  onClick={() => setSelectedTransactionId(null)}
                                >
                                  <i className="fas fa-times"></i>
                                </button>
                              </div>
                              <div className="gaf-linked-transaction-content">
                                <div className="gaf-linked-transaction-title">{selectedTx.title || 'Giao dịch không tên'}</div>
                                <div className="gaf-linked-transaction-details">
                                  {selectedTx.category && (
                                    <span className="gaf-linked-category">
                                      {selectedTx.category.icon} {selectedTx.category.name}
                                    </span>
                                  )}
                                  <span className="gaf-linked-amount">
                                    {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(selectedTx.amount || 0)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </div>

                       <div className="gaf-edit-actions">
                      <button
                        className="gaf-create-btn gaf-create-btn-secondary"
                        onClick={() => {
                          setEditingPostId(null);
                          setEditPostContent('');
                          setEditPostImageFile(null);
                          setEditPostImagePreview('');
                          setEditPostImageUrl('');
                          setSelectedTransactionId(null);
                          setShowLinkTransaction(false);
                        }}
                      >
                        Hủy
                      </button>
                        <button
                          className="gaf-create-btn gaf-create-btn-primary"
                          onClick={() => handleUpdatePost(post._id)}
                          disabled={!editPostContent.trim() && !editPostImagePreview && !selectedTransactionId}
                        >
                          <i className="fas fa-save"></i> Lưu
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Post Content */}
                      {post.content && (
                        <div className="gaf-post-content">{post.content}</div>
                      )}


                      {/* Linked Transaction */}
                      {post.linkedTransaction && (
                        <div className="gaf-linked-transaction-card">
                          <div className="gaf-linked-transaction-header">
                            <i className="fas fa-link"></i>
                            <span>Giao dịch liên kết</span>
                          </div>
                          <div className="gaf-linked-transaction-body">
                            <div className="gaf-linked-transaction-title">
                              {post.linkedTransaction.title || 'Giao dịch không tên'}
                            </div>
                            {post.linkedTransaction.description && (
                              <div className="gaf-linked-transaction-description">
                                {post.linkedTransaction.description}
                              </div>
                            )}
                            <div className="gaf-linked-transaction-meta">
                              <div className="gaf-linked-meta-left">
                                {(() => {
                                  const category = post.linkedTransaction.category;
                                  // Kiểm tra category có tồn tại và có name không
                                  if (category && typeof category === 'object' && category.name) {
                                    return (
                                      <span className="gaf-linked-category-badge">
                                        {category.icon && <span className="gaf-category-icon">{category.icon}</span>}
                                        <span className="gaf-category-name">{category.name}</span>
                                        {/* Hiển thị tags bên trong category badge nếu có */}
                                        {post.linkedTransaction.tags && Array.isArray(post.linkedTransaction.tags) && post.linkedTransaction.tags.length > 0 && (
                                          <span className="gaf-category-tags">
                                            {post.linkedTransaction.tags
                                              .filter(tag => tag && typeof tag === 'string' && tag.trim())
                                              .map((tag, idx) => (
                                                <span key={idx} className="gaf-category-tag">
                                                  #{tag.trim()}
                                                </span>
                                              ))}
                                          </span>
                                        )}
                                      </span>
                                    );
                                  }
                                  // Nếu category là string (ObjectId chưa được populate)
                                  if (category && typeof category === 'string') {
                                    console.warn('Category is string (not populated):', category, 'for transaction:', post.linkedTransaction._id);
                                  }
                                  // Nếu category là object nhưng không có name
                                  if (category && typeof category === 'object' && !category.name) {
                                    console.warn('Category object missing name:', category, 'for transaction:', post.linkedTransaction._id);
                                  }
                                  // Nếu không có category nhưng có tags, hiển thị tags riêng
                                  if (!category && post.linkedTransaction.tags && Array.isArray(post.linkedTransaction.tags) && post.linkedTransaction.tags.length > 0) {
                                    return (
                                      <span className="gaf-linked-tags-only">
                                        {post.linkedTransaction.tags
                                          .filter(tag => tag && typeof tag === 'string' && tag.trim())
                                          .map((tag, idx) => (
                                            <span key={idx} className="gaf-linked-tag">
                                              #{tag.trim()}
                                            </span>
                                          ))}
                                      </span>
                                    );
                                  }
                                  return null;
                                })()}
                              </div>
                              <span className="gaf-linked-amount-badge">
                                {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(post.linkedTransaction.amount || 0)}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Post Image */}
                      {post.images && post.images.length > 0 && (
                        <div className="gaf-post-image-wrapper">
                          <img
                            src={post.images[0].startsWith('http') ? post.images[0] : `${API_BASE}${post.images[0]}`}
                            alt="post"
                            className="gaf-post-image"
                            onError={(e) => {
                              e.target.style.display = 'none';
                              if (e.target.parentElement) {
                                e.target.parentElement.style.display = 'none';
                              }
                            }}
                            loading="lazy"
                          />
                        </div>
                      )}
                    </>
                  )}

                  {/* Post Stats - Instagram Style */}
                  {(likeCount > 0 || commentCount > 0) && (
                    <div className="gaf-post-stats">
                      {likeCount > 0 && (
                        <div 
                          className="gaf-likes-count"
                          onMouseEnter={() => setHoveredLikePostId(post._id)}
                          onMouseLeave={() => setHoveredLikePostId(null)}
                        >
                          <i className="fas fa-heart"></i>
                          <span>{likeCount} lượt thích</span>
                          {hoveredLikePostId === post._id && post.likes && post.likes.length > 0 && (
                            <div className="gaf-likes-tooltip">
                              <div className="gaf-likes-tooltip-header">
                                <i className="fas fa-heart"></i>
                                <span>{likeCount} lượt thích</span>
                              </div>
                              <div className="gaf-likes-tooltip-list">
                                {post.likes.map((like, idx) => {
                                  const likeUser = like.user;
                                  const likeUserName = 
                                    (likeUser && typeof likeUser === 'object'
                                      ? likeUser.name || likeUser.email
                                      : null) || 'Thành viên';
                                  const likeUserInitial = getInitial(likeUserName);
                                  return (
                                    <div key={like._id || idx} className="gaf-likes-tooltip-item">
                                      <div className="gaf-likes-tooltip-avatar">{likeUserInitial}</div>
                                      <span className="gaf-likes-tooltip-name">{likeUserName}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      {commentCount > 0 && (
                        <div className="gaf-comments-count">
                          Xem tất cả {commentCount} bình luận
                        </div>
                      )}
                    </div>
                  )}

                  {/* Post Actions - Instagram Style */}
                  <div className="gaf-post-actions">
                    <button
                      type="button"
                      className={`gaf-action-btn ${hasLiked ? 'liked' : ''}`}
                      onClick={() => handleToggleLike(post._id)}
                      title={hasLiked ? 'Bỏ thích' : 'Thích'}
                    >
                      <span>{hasLiked ? 'Bỏ thích' : 'Thích'}</span>
                    </button>
                    <button
                      type="button"
                      className="gaf-action-btn gaf-action-btn-comment"
                      onClick={() => {
                        const input = document.getElementById(`comment-input-${post._id}`);
                        if (input) input.focus();
                      }}
                      title="Bình luận"
                    >
                      <span>Bình luận</span>
                    </button>
                    <div style={{ marginLeft: 'auto' }}></div>
                  </div>

                  {/* Comments Section */}
                  {post.comments && post.comments.length > 0 && (
                    <div className="gaf-comments">
                      {post.comments.map((comment, idx) => {
                        // Comments có user field (có thể là ObjectId hoặc populated object)
                        const commentUser = comment.user;
                        const commentAuthor =
                          (commentUser && typeof commentUser === 'object'
                            ? commentUser.name || commentUser.email
                            : null) || 'Thành viên';
                        const commentInitial = getInitial(commentAuthor);
                        // Get comment user ID - handle both populated object and raw ID
                        const commentUserId =
                          commentUser && typeof commentUser === 'object'
                            ? commentUser._id || commentUser.id
                            : commentUser;
                        const isCommentAuthor = commentUserId && myId && String(commentUserId) === String(myId);
                        const isEditingComment = editingCommentId === comment._id;

                        return (
                          <div key={comment._id || idx} className="gaf-comment">
                            <div className="gaf-comment-avatar">{commentInitial}</div>
                            <div className="gaf-comment-wrapper">
                              {isEditingComment ? (
                                <div className="gaf-edit-comment">
                                  <textarea
                                    className="gaf-comment-edit-input"
                                    value={editCommentContent}
                                    onChange={(e) => setEditCommentContent(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Escape') {
                                        setEditingCommentId(null);
                                        setEditCommentContent('');
                                      }
                                    }}
                                    rows={2}
                                    autoFocus
                                    placeholder="Sửa bình luận..."
                                  />
                                  <div className="gaf-comment-edit-actions">
                                    <button
                                      className="gaf-comment-edit-btn"
                                      onClick={() => {
                                        setEditingCommentId(null);
                                        setEditCommentContent('');
                                      }}
                                    >
                                      Hủy
                                    </button>
                                    <button
                                      className="gaf-comment-edit-btn primary"
                                      onClick={() => handleUpdateComment(post._id, comment._id)}
                                      disabled={!editCommentContent.trim()}
                                    >
                                      Lưu
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="gaf-comment-content">
                                  <span className="gaf-comment-author">{commentAuthor}</span>
                                  <span className="gaf-comment-text"> {comment.content}</span>
                                  {isCommentAuthor && (
                                    <div className="gaf-comment-menu">
                                      <button
                                        type="button"
                                        className="gaf-comment-menu-btn"
                                        onClick={() => {
                                          setEditingCommentId(comment._id);
                                          setEditCommentContent(comment.content);
                                        }}
                                        title="Sửa"
                                      >
                                        <i className="far fa-edit"></i>
                                        <span>Sửa</span>
                                      </button>
                                      <button
                                        type="button"
                                        className="gaf-comment-menu-btn gaf-comment-menu-btn-delete"
                                        onClick={() => handleDeleteComment(post._id, comment._id)}
                                        disabled={deletingCommentId === comment._id}
                                        title="Xóa"
                                      >
                                        {deletingCommentId === comment._id ? (
                                          <>
                                            <i className="fas fa-spinner fa-spin"></i>
                                            <span>Đang xóa...</span>
                                          </>
                                        ) : (
                                          <>
                                            <i className="far fa-trash-alt"></i>
                                            <span>Xóa</span>
                                          </>
                                        )}
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  </div>

                  {/* Comment Input - Bên ngoài inner để không bị overflow hidden */}
                  <div className="gaf-comment-input-wrapper">
                    <div className="gaf-comment-input-avatar">
                      {getInitial(currentUser?.name || currentUser?.email || 'U')}
                    </div>
                    <input
                      id={`comment-input-${post._id}`}
                      type="text"
                      className="gaf-comment-input"
                      placeholder="Viết bình luận..."
                      value={commentInputs[post._id] || ''}
                      onChange={(e) =>
                        setCommentInputs((prev) => ({ ...prev, [post._id]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.target.value.trim()) {
                          e.preventDefault();
                          handleAddComment(post._id, e.target.value);
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="gaf-comment-send-btn"
                      onClick={() => {
                        const value = commentInputs[post._id] || '';
                        if (value.trim()) {
                          handleAddComment(post._id, value);
                        }
                      }}
                      disabled={!commentInputs[post._id] || !commentInputs[post._id].trim()}
                      title="Gửi"
                    >
                      <i className="fas fa-paper-plane"></i>
                      <span>Gửi</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
