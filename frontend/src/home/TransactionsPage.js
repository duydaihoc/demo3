/* eslint-disable no-undef */ 
import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import './TransactionsPage.css';
import { showNotification } from '../utils/notify';

// NEW: Leaflet dynamic loader (reuse pattern)
const loadLeaflet = async () => {
  if (typeof window === 'undefined') return null;
  if (window.L) return window.L;
  await new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel='stylesheet';
    css.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(css);
    const js = document.createElement('script');
    js.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    js.onload=resolve;
    js.onerror=()=>reject(new Error('Leaflet load failed'));
    document.head.appendChild(js);
  });
  return window.L;
};

function TransactionsPage() {
  const navigate = useNavigate(); // NEW
  const userName = localStorage.getItem('userName') || 'Tên người dùng'; // Get from localStorage with fallback

  // new: totals of wallets grouped by currency
  const [totalsByCurrency, setTotalsByCurrency] = useState({});
  const [loadingTotals, setLoadingTotals] = useState(false);
  const [totalsError, setTotalsError] = useState(null);

  // wallets list + transaction form state
  const [wallets, setWallets] = useState([]);
  const [transactions, setTransactions] = useState([]); // NEW: danh sách giao dịch
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  // edit modal/form state (fix ReferenceError: editModal is not defined)
  const [editModal, setEditModal] = useState({ show: false, tx: null, saving: false });
  const [editForm, setEditForm] = useState({ name: '', amount: '', date: '', type: 'expense', categoryId: '', walletId: '' });
  const [form, setForm] = useState({
    walletId: '',
    name: '',
    type: 'expense',
    categoryId: '',
    amount: '',
    date: new Date().toISOString().slice(0,10),
    note: '',
    // NEW location fields
    placeName: '',
    lat: '',
    lng: '',
    accuracy: ''
  });
  const [saving, setSaving] = useState(false);
  const [txMessage, setTxMessage] = useState(null);
  const [walletFilter, setWalletFilter] = useState(''); // '' = all wallets
  // Removed local toast state - using global notification only
  const [incomeByCurrency, setIncomeByCurrency] = useState({});
  const [expenseByCurrency, setExpenseByCurrency] = useState({});
  // confirm delete state for transactions
  const [confirmDelete, setConfirmDelete] = useState({ show: false, txId: null, title: '' });
  // ADD: scope filter state
  const [scopeFilter, setScopeFilter] = useState('all'); // 'all' | 'personal' | 'group' | 'family'

  // thêm state cho lọc theo ngày
  const [startDate, setStartDate] = useState(''); // format yyyy-mm-dd
  const [endDate, setEndDate] = useState('');     // format yyyy-mm-dd

  // Map search state
  const [mapSearch, setMapSearch] = useState('');
  const [mapResults, setMapResults] = useState([]);
  const [mapLoading, setMapLoading] = useState(false);
  const mapRef = useRef(null);
  const leafletMapRef = useRef(null);
  const markerRef = useRef(null);

  // NEW: modal state for map picker
  const [showMapModal, setShowMapModal] = useState(false);
  const [showTxMapModal, setShowTxMapModal] = useState(false);          // NEW
  const [txMapTarget, setTxMapTarget] = useState(null);                 // NEW
  const txViewMapRef = useRef(null);                                    // NEW
  const txViewLeafletRef = useRef(null);                                // NEW

  // NEW: state for Edit-Location modal (separate from add-transaction map modal)
  const [showEditMapModal, setShowEditMapModal] = useState(false);
  const [editLocTarget, setEditLocTarget] = useState(null);
  const editMapRef = useRef(null);
  const editLeafletMapRef = useRef(null);
  const editMarkerRef = useRef(null);
  const [editMapSearch, setEditMapSearch] = useState('');
  const [editMapResults, setEditMapResults] = useState([]);
  const [editMapLoading, setEditMapLoading] = useState(false);
  const [editLocForm, setEditLocForm] = useState({ placeName: '', lat: '', lng: '', accuracy: '' });
  const [savingLocation, setSavingLocation] = useState(false);

  const formatCurrency = (amount, currency) => {
    try {
      return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: currency || 'VND' }).format(amount);
    } catch (e) {
      return `${amount} ${currency || ''}`;
    }
  };

  // show toast helper - chỉ dùng global notification
  const showToast = (message, type = 'success', duration = 3000) => {
    showNotification(message, type, duration);
  };

  // fetch transactions for current user (admin can request all)
  // fetch transactions for current user (admin can request all)
  // accepts optional AbortSignal to cancel requests when unmounting/navigation
  const fetchTransactions = async (signal) => {
    setLoadingTransactions(true);
    try {
      const token = localStorage.getItem('token');
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const opts = { headers };
      if (signal) opts.signal = signal;
      const res = await fetch('http://localhost:5000/api/transactions', opts);
      if (!res.ok) throw new Error('Không thể tải giao dịch');
      const data = await res.json();
      setTransactions(data || []);
    } catch (err) {
      if (err.name === 'AbortError') {
        // fetch was aborted — ignore
        return;
      }
      console.error('Fetch transactions failed', err);
      setTransactions([]);
    } finally {
      setLoadingTransactions(false);
    }
  };

  // refresh wallets + totals (used after create / edit / delete)
  const refreshWallets = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const r = await fetch('http://localhost:5000/api/wallets', { headers });
      if (!r.ok) return;
      const data = await r.json();
      setWallets(data || []);
      try { window.dispatchEvent(new CustomEvent('walletsUpdated', { detail: data })); } catch(_) {}
      const sums = {};
      (data || []).forEach(w => {
        const curr = w.currency || 'VND';
        const amt = Number(w.initialBalance) || 0;
        sums[curr] = (sums[curr] || 0) + amt;
      });
      setTotalsByCurrency(sums);
    } catch (err) {
      console.error('Refresh wallets failed', err);
    }
  };

  useEffect(() => {
    const fetchWalletsAndTotals = async (signal) => {
       setLoadingTotals(true);
       setTotalsError(null);
       try {
         const token = localStorage.getItem('token');
         const headers = {};
         if (token) headers['Authorization'] = `Bearer ${token}`;

         const res = await fetch('http://localhost:5000/api/wallets', { headers, signal });
         if (!res.ok) throw new Error('Không thể tải ví');
         const data = await res.json();
         setWallets(data || []);

         const sums = {};
         (data || []).forEach(w => {
           const curr = w.currency || 'VND';
           const amt = Number(w.initialBalance) || 0;
           sums[curr] = (sums[curr] || 0) + amt;
         });
         setTotalsByCurrency(sums);
       } catch (err) {
        if (err.name === 'AbortError') {
          // aborted, ignore
          return;
        }
        console.error('Fetch wallet totals failed', err);
         setTotalsError('Không thể tải tổng số dư');
       } finally {
         setLoadingTotals(false);
       }
     };
    // use one AbortController for both requests so cleanup cancels all
    const ctrl = new AbortController();
    fetchWalletsAndTotals(ctrl.signal);
    // also load transactions (pass signal)
    fetchTransactions(ctrl.signal);
    return () => { ctrl.abort(); };
   }, []);

  // filtered transactions by walletFilter AND date range (+ scope filter)
  const filteredTransactions = transactions.filter(tx => {
    // wallet filter
    if (walletFilter && walletFilter !== '') {
      if (tx.isPending) {
        // pending debts are shown regardless of wallet
      } else {
        const wid = tx.wallet && (typeof tx.wallet === 'string' ? tx.wallet : tx.wallet._id);
        if (String(wid) !== String(walletFilter)) return false;
      }
    }
    // date filter
    if (startDate || endDate) {
      const txDate = tx.date ? new Date(tx.date) : null;
      if (!txDate) return false;
      if (startDate) {
        const sd = new Date(startDate);
        sd.setHours(0,0,0,0);
        if (txDate < sd) return false;
      }
      if (endDate) {
        const ed = new Date(endDate);
        ed.setHours(23,59,59,999);
        if (txDate > ed) return false;
      }
    }
    // scope filter
    const isGroupTx = tx.groupTransaction === true;
    const isFamilyTx = !!(tx.metadata && (tx.metadata.familyId || tx.metadata.familyTransactionId ||
      tx.metadata.source === 'family_transfer' || tx.metadata.source === 'family_personal'));
    const isPersonalTx = !isGroupTx && !isFamilyTx;

    if (scopeFilter === 'group' && !isGroupTx) return false;
    if (scopeFilter === 'family' && !isFamilyTx) return false;
    if (scopeFilter === 'personal' && !isPersonalTx) return false;

    return true;
  });

  // ensure deterministic ordering
  const sortedTransactions = (filteredTransactions || []).slice().sort((a, b) => {
    const aStamp = a && (a.createdAt || a.date) ? (a.createdAt || a.date) : 0;
    const bStamp = b && (b.createdAt || b.date) ? (b.createdAt || b.date) : 0;
    const at = Date.parse(aStamp) || 0;
    const bt = Date.parse(bStamp) || 0;
    return bt - at;
  });
  
  // show wallet column when "Tất cả ví" is selected
  const showWalletColumn = !walletFilter;

  // helper to update single form field
  const handleFormChange = (k, v) => {
    setForm(prev => ({ ...prev, [k]: v }));
    // reset categoryId when wallet or type changes
    if (k === 'walletId' || k === 'type') {
      setForm(prev => ({ ...prev, categoryId: '' }));
    }
  };

  // add: edit form change handler (fix ReferenceError: handleEditChange is not defined)
  const handleEditChange = (key, value) => {
    setEditForm(prev => {
      const next = { ...prev, [key]: value };
      // when wallet or type changes, reset category to force re-pick a valid one
      if (key === 'walletId' || key === 'type') {
        next.categoryId = '';
      }
      return next;
    });
  };

  // NEW: auto geolocation
  const grabGeo = () => {
    if (!navigator.geolocation) return showToast('Thiết bị không hỗ trợ GPS', 'error');
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude, longitude, accuracy } = pos.coords;
        setForm(prev => ({ ...prev, lat: latitude.toFixed(6), lng: longitude.toFixed(6), accuracy: Math.round(accuracy) }));
        showToast('Đã lấy vị trí', 'success');
      },
      err => showToast(`GPS lỗi: ${err.code}`, 'error'),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  };

  // categories available for selected wallet & type
  const availableCategories = (() => {
    if (!form.walletId) return [];
    const w = wallets.find(x => String(x._id) === String(form.walletId));
    if (!w || !Array.isArray(w.categories)) return [];
    return (w.categories || []).filter(c => c.type === form.type);
  })();

  // submit transaction
  const handleSubmit = async (e) => {
    e && e.preventDefault();
    setTxMessage(null);
    // validation
    if (!form.walletId) return setTxMessage({ type: 'error', text: 'Vui lòng chọn ví.' });
    if (!form.name || !form.name.trim()) return setTxMessage({ type: 'error', text: 'Vui lòng nhập tên giao dịch.' });
    if (!form.categoryId) return setTxMessage({ type: 'error', text: 'Vui lòng chọn danh mục.' });
    if (!form.amount || Number(form.amount) <= 0) return setTxMessage({ type: 'error', text: 'Số tiền phải lớn hơn 0.' });

    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const body = {
        wallet: form.walletId,
        category: form.categoryId,
        type: form.type,
        amount: Number(form.amount),
        title: form.name,
        description: form.note,
        // Always use server-localized ISO timestamp for "added now"
        date: new Date().toISOString(),
        // NEW: include location only if lat & lng present
        location: (form.lat && form.lng) ? {
          lat: Number(form.lat),
          lng: Number(form.lng),
          placeName: form.placeName || '',
          accuracy: form.accuracy ? Number(form.accuracy) : undefined
        } : undefined
      };

      const res = await fetch('http://localhost:5000/api/transactions', { method: 'POST', headers, body: JSON.stringify(body) });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Tạo giao dịch thất bại');
      }
      const created = await res.json();
      // show success toast when transaction added
      showToast('Đã thêm giao dịch thành công', 'success');
      // prepend to transactions list so UI cập nhật ngay
      setTransactions(prev => [created, ...prev]);
      try { window.dispatchEvent(new CustomEvent('transactionsUpdated', { detail: created })); } catch(_) {}

      // refresh wallets & totals to reflect balance change
      try {
        const token2 = localStorage.getItem('token');
        const headers2 = {};
        if (token2) headers2['Authorization'] = `Bearer ${token2}`;
        const r = await fetch('http://localhost:5000/api/wallets', { headers: headers2 });
        if (r.ok) {
          const data = await r.json();
          setWallets(data || []);
          // dispatch for other components that listen (FinanceDashboard / Wallets)
          try { window.dispatchEvent(new CustomEvent('walletsUpdated', { detail: data })); } catch(_) {}
          const sums = {};
          (data || []).forEach(w => {
            const curr = w.currency || 'VND';
            const amt = Number(w.initialBalance) || 0;
            sums[curr] = (sums[curr] || 0) + amt;
          });
          setTotalsByCurrency(sums);
        }
      } catch (ignoreErr) { /* ignore */ }

      // reset form (keep selected wallet to ease multiple entries)
      setForm(prev => ({
        ...prev,
        name: '',
        categoryId: '',
        amount: '',
        note: '',
        placeName: '',
        lat: '',
        lng: '',
        accuracy: ''
      }));
    } catch (err) {
      console.error('Create transaction failed', err);
      const msg = err.message || 'Lỗi khi thêm giao dịch';
      setTxMessage({ type: 'error', text: msg });
      showToast(msg, 'error'); // toast on error
    } finally {
      setSaving(false);
    }
  };

  // Insert helper to open edit modal
  const openEdit = (tx) => {
    // compute IDs clearly to avoid mixing && and || in one expression
    const categoryId = tx.category
      ? (tx.category._id ? tx.category._id : tx.category)
      : '';
    const walletId = tx.wallet
      ? (tx.wallet._id ? tx.wallet._id : tx.wallet)
      : '';

    setEditForm({
      name: tx.title || '',
      amount: tx.amount || '',
      date: tx.date ? new Date(tx.date).toISOString().slice(0,10) : new Date().toISOString().slice(0,10),
      type: tx.type || 'expense',
      categoryId,
      walletId
    });
    // Initialize location form from tx.location
    const curr = tx.location || {};
    setEditLocForm({
      placeName: curr.placeName || '',
      lat: typeof curr.lat === 'number' ? curr.lat.toFixed(6) : '',
      lng: typeof curr.lng === 'number' ? curr.lng.toFixed(6) : '',
      accuracy: typeof curr.accuracy === 'number' ? Math.round(curr.accuracy) : ''
    });
    setEditMapSearch('');
    setEditMapResults([]);
    setEditModal({ show: true, tx, saving: false });
  };

  // Initialize Leaflet map inside the Edit modal
  useEffect(() => {
    if (!editModal.show) {
      if (editLeafletMapRef.current) {
        try { editLeafletMapRef.current.remove(); } catch(_) {}
        editLeafletMapRef.current = null;
        editMarkerRef.current = null;
      }
      return;
    }
    let cancelled = false;
    (async () => {
      await new Promise(r => setTimeout(r, 50)); // wait DOM
      if (!editMapRef.current || cancelled) return;
      try {
        const L = await loadLeaflet();
        if (!L || cancelled) return;
        const lat = editLocForm.lat ? Number(editLocForm.lat) : 21.0278;
        const lng = editLocForm.lng ? Number(editLocForm.lng) : 105.8342;
        const zoom = editLocForm.lat && editLocForm.lng ? 14 : 6;
        const map = L.map(editMapRef.current).setView([lat, lng], zoom);
        editLeafletMapRef.current = map;
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);
        if (editLocForm.lat && editLocForm.lng) {
          editMarkerRef.current = L.marker([Number(editLocForm.lat), Number(editLocForm.lng)]).addTo(map);
        }
        map.on('click', e => {
          const { lat, lng } = e.latlng;
          setEditLocForm(prev => ({ ...prev, lat: lat.toFixed(6), lng: lng.toFixed(6) }));
          if (!editMarkerRef.current) {
            editMarkerRef.current = L.marker([lat, lng]).addTo(map);
          } else {
            editMarkerRef.current.setLatLng([lat, lng]);
          }
        });
      } catch (err) {
        console.error('Edit modal map init error:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [editModal.show]); // eslint-disable-line react-hooks/exhaustive-deps

  // Geocode search for location inside Edit modal
  const performEditSearch = async () => {
    if (!editMapSearch.trim()) return;
    setEditMapLoading(true);
    setEditMapResults([]);
    try {
      const q = encodeURIComponent(editMapSearch.trim());
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=8&q=${q}`;
      const res = await fetch(url, { headers: { 'Accept-Language': 'vi' } });
      const data = await res.json();
      setEditMapResults(data || []);
    } catch (e) {
      showToast('Không tìm được địa điểm', 'error');
    } finally {
      setEditMapLoading(false);
    }
  };

  // Select a search result in Edit modal
  const selectEditSearchResult = (r) => {
    const lat = Number(r.lat);
    const lng = Number(r.lon);
    setEditLocForm(prev => ({ ...prev, placeName: r.display_name, lat: lat.toFixed(6), lng: lng.toFixed(6) }));
    if (editLeafletMapRef.current && window.L) {
      editLeafletMapRef.current.setView([lat, lng], 14);
      if (!editMarkerRef.current) editMarkerRef.current = window.L.marker([lat, lng]).addTo(editLeafletMapRef.current);
      else editMarkerRef.current.setLatLng([lat, lng]);
    }
    setEditMapResults([]);
  };

  // GPS for Edit modal
  const grabEditGeo = () => {
    if (!navigator.geolocation) return showToast('Thiết bị không hỗ trợ GPS', 'error');
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude, longitude, accuracy } = pos.coords;
        setEditLocForm(prev => ({ ...prev, lat: latitude.toFixed(6), lng: longitude.toFixed(6), accuracy: Math.round(accuracy) }));
        // REMOVED setEditRemoveLocation(false);
        if (editLeafletMapRef.current) {
          editLeafletMapRef.current.setView([latitude, longitude], 14);
          if (!editMarkerRef.current) editMarkerRef.current = window.L.marker([latitude, longitude]).addTo(editLeafletMapRef.current);
          else editMarkerRef.current.setLatLng([latitude, longitude]);
        }
      },
      err => showToast(`GPS lỗi: ${err.code}`, 'error'),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  };

  // submit edit (now includes location/removeLocation)
  const submitEdit = async (e) => {
    e && e.preventDefault();
    if (!editModal.tx) return;
    setEditModal(prev => ({ ...prev, saving: true }));
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const body = {
        wallet: editForm.walletId,
        category: editForm.categoryId,
        type: editForm.type,
        amount: Number(editForm.amount),
        title: editForm.name,
        description: '',
        // date: editForm.date ? new Date(editForm.date) : undefined
      };
      const hadLocationBefore = !!editModal.tx.location;
      const hasCoordsNow = editLocForm.lat && editLocForm.lng;
      if (hasCoordsNow) {
        body.location = {
          lat: Number(editLocForm.lat),
          lng: Number(editLocForm.lng),
          placeName: editLocForm.placeName || '',
          accuracy: editLocForm.accuracy ? Number(editLocForm.accuracy) : undefined
        };
      } else if (hadLocationBefore) {
        // User cleared selection -> remove location
        body.removeLocation = true;
      }
      const res = await fetch(`http://localhost:5000/api/transactions/${editModal.tx._id}`, { method: 'PUT', headers, body: JSON.stringify(body) });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Cập nhật thất bại');
      }
      const updated = await res.json();
      setTransactions(prev => prev.map(t => t._id === updated._id ? updated : t));
      showToast('Đã cập nhật giao dịch thành công', 'success');
      refreshWallets();
      setEditModal({ show: false, tx: null, saving: false });
    } catch (err) {
      console.error('Update transaction failed', err);
      showToast(err.message || 'Lỗi khi cập nhật giao dịch', 'error');
      setEditModal(prev => ({ ...prev, saving: false }));
    }
  };

  // open a confirmation dialog for deletion (replaces window.confirm)
  const openDeleteConfirm = (tx) => {
    setConfirmDelete({ show: true, txId: tx._id, title: tx.title || tx.description || '(không tên)' });
  };

  const cancelDelete = () => setConfirmDelete({ show: false, txId: null, title: '' });

  // perform delete after user confirms
  const handleDeleteConfirmed = async () => {
    const txId = confirmDelete.txId;
    if (!txId) return cancelDelete();
    try {
      const token = localStorage.getItem('token');
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`http://localhost:5000/api/transactions/${txId}`, { method: 'DELETE', headers });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Xóa thất bại');
      }
      // remove from list and refresh wallets/totals (backend reverts money)
      setTransactions(prev => prev.filter(t => t._id !== txId));
      showToast('Đã xóa giao dịch thành công', 'success');
      // refresh wallets/totals
      await refreshWallets();
    } catch (err) {
      console.error('Delete transaction failed', err);
      showToast(err.message || 'Lỗi khi xóa giao dịch', 'error');
    } finally {
      cancelDelete();
    }
  };

  // Recompute monthly income/expense for displayed transactions whenever transactions or walletFilter change
  useEffect(() => {
    // compute new maps from current source data & filters
    const inc = {};
    const exp = {};
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const list = (transactions || []).filter(tx => {
      // Loại bỏ giao dịch nhóm đang pending (chưa thanh toán) khi tính toán số dư
      if (tx.isPending) return false;
      
      if (walletFilter && walletFilter !== '') {
        // Settled transactions: filter theo ví đã dùng
        const wid = tx.wallet && (typeof tx.wallet === 'string' ? tx.wallet : tx.wallet._id);
        if (String(wid) !== String(walletFilter)) return false;
      }
      
      if (startDate || endDate) {
        const txDate = tx.date ? new Date(tx.date) : null;
        if (!txDate) return false;
        if (startDate) {
          const sd = new Date(startDate);
          sd.setHours(0,0,0,0);
          if (txDate < sd) return false;
        }
        if (endDate) {
          const ed = new Date(endDate);
          ed.setHours(23,59,59,999);
          if (txDate > ed) return false;
        }
      }
      return true;
    });

    list.forEach(tx => {
      const txDate = tx.date ? new Date(tx.date) : null;
      if (!txDate) return;
      if (txDate >= monthStart && txDate < monthEnd) {
        let currency = 'VND';
        if (tx.wallet && typeof tx.wallet !== 'string' && tx.wallet.currency) currency = tx.wallet.currency;
        else if (typeof tx.wallet === 'string') {
          const w = wallets.find(wt => String(wt._id) === String(tx.wallet));
          if (w && w.currency) currency = w.currency;
        }
        const amt = Number(tx.amount) || 0;
        if (tx.type === 'income') inc[currency] = (inc[currency] || 0) + amt;
        else exp[currency] = (exp[currency] || 0) + amt;
      }
    });

    // shallow compare helper
    const mapsEqual = (a, b) => {
      const ak = Object.keys(a || {});
      const bk = Object.keys(b || {});
      if (ak.length !== bk.length) return false;
      for (let k of ak) {
        if (Number(a[k]) !== Number(b[k])) return false;
      }
      return true;
    };

    // use functional setState to compare with previous value without referencing it in deps
    setIncomeByCurrency(prev => mapsEqual(prev, inc) ? prev : inc);
    setExpenseByCurrency(prev => mapsEqual(prev, exp) ? prev : exp);
  }, [transactions, walletFilter, startDate, endDate, wallets]); // recompute when source data or filters change

  // NEW: perform geocode search (Nominatim)
  const performSearch = async () => {
    if (!mapSearch.trim()) return;
    setMapLoading(true);
    setMapResults([]);
    try {
      const q = encodeURIComponent(mapSearch.trim());
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=8&q=${q}`;
      const res = await fetch(url, { headers: { 'Accept-Language': 'vi' } });
      const data = await res.json();
      setMapResults(data || []);
    } catch (e) {
      showToast('Không tìm được địa điểm', 'error');
    } finally {
      setMapLoading(false);
    }
  };

  // NEW: init map only when modal opens
  useEffect(() => {
    if (!showMapModal) {
      // NEW: cleanup when modal closes to allow re-init on next open
      if (leafletMapRef.current) {
        try { leafletMapRef.current.remove(); } catch(_) {}
        leafletMapRef.current = null;
        markerRef.current = null;
      }
      return;
    }
    let cancelled = false;
    (async () => {
      // NEW: wait a tick for DOM to be ready after modal opens
      await new Promise(r => setTimeout(r, 50));
      if (!mapRef.current || cancelled) return;
      try {
        const L = await loadLeaflet();
        if (!L || cancelled) return;
        // NEW: always create new map instance (previous was removed on close)
        const center = [21.0278,105.8342];
        const map = L.map(mapRef.current).setView(center, 6);
        leafletMapRef.current = map;
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution:'© OpenStreetMap'
        }).addTo(map);
        map.on('click', e => {
          const { lat, lng } = e.latlng;
          setForm(prev => ({ ...prev, lat: lat.toFixed(6), lng: lng.toFixed(6) }));
          if (!markerRef.current) {
            markerRef.current = L.marker([lat,lng]).addTo(map);
          } else {
            markerRef.current.setLatLng([lat,lng]);
          }
        });
      } catch (err) {
        console.error('Map init error:', err);
        showToast('Không thể tải bản đồ', 'error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showMapModal]);

  // NEW: focus selected search result
  const selectSearchResult = (r) => {
    const lat = Number(r.lat);
    const lng = Number(r.lon);
    setForm(prev => ({
      ...prev,
      placeName: r.display_name,
      lat: lat.toFixed(6),
      lng: lng.toFixed(6)
    }));
    if (leafletMapRef.current && window.L) {
      leafletMapRef.current.setView([lat,lng], 14);
      if (!markerRef.current) markerRef.current = window.L.marker([lat,lng]).addTo(leafletMapRef.current);
      else markerRef.current.setLatLng([lat,lng]);
    }
    setMapResults([]);
  };

  const openTxMap = (tx) => { // NEW
    if (!tx?.location || typeof tx.location.lat !== 'number' || typeof tx.location.lng !== 'number') return;
    setTxMapTarget(tx);
    setShowTxMapModal(true);
  };

  // FIX: re-add map init for per-transaction view modal (pin)
  useEffect(() => {
    if (!showTxMapModal || !txMapTarget) {
      // cleanup
      if (txViewLeafletRef.current) {
        try { txViewLeafletRef.current.remove(); } catch (_) {}
        txViewLeafletRef.current = null;
      }
      return;
    }
    let cancelled = false;
    (async () => {
      // wait a tick for modal DOM layout
      await new Promise(r => setTimeout(r, 50));
      if (!txViewMapRef.current || cancelled) return;
      try {
        const L = await loadLeaflet();
        if (!L || cancelled) return;
        const { lat, lng } = txMapTarget.location || {};
        if (typeof lat !== 'number' || typeof lng !== 'number') return;
        const map = L.map(txViewMapRef.current).setView([lat, lng], 14);
        txViewLeafletRef.current = map;
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap'
        }).addTo(map);
        L.marker([lat, lng]).addTo(map).bindPopup(
          `<b>${(txMapTarget.title || txMapTarget.description || 'Giao dịch').replace(/"/g,'&quot;')}</b><br/>${lat}, ${lng}<br/>${txMapTarget.location.placeName || ''}`
        ).openPopup();
        // ensure proper sizing after render
        setTimeout(() => {
          if (!cancelled) {
            try { map.invalidateSize(); } catch (_) {}
          }
        }, 120);
      } catch (e) {
        console.error('View map init error', e);
      }
    })();
    return () => { cancelled = true; };
  }, [showTxMapModal, txMapTarget]);

  return (
    <div>
      <Sidebar userName={userName} />
      <main
        className="transactions-main"
        style={{
          marginLeft: 220,
          height: '100vh',          // fill viewport height
          overflowY: 'auto',       // enable vertical scrolling
          boxSizing: 'border-box', // include padding in height calculations
          padding: '24px'          // keep spacing consistent with other pages
        }}
      >
        <div className="transactions-header">
          <span className="transactions-title">Giao dịch</span>
          <div className="transactions-date">
            <button className="date-btn">September 2025</button>
          </div>
        </div>
        <div className="transactions-summary">
          <div className="wallet-card1">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div className="wallet-title" style={{ margin: 0 }}>Ví</div>
              {/* select để chọn All hoặc 1 ví cụ thể */}
              <select
                value={walletFilter}
                onChange={(e) => setWalletFilter(e.target.value)}
                aria-label="Chọn ví hoặc tất cả ví"
                style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #dce7ef', background: '#fff' }}
              >
                <option value="">Tất cả ví</option>
                {wallets.map(w => (
                  <option key={w._id} value={w._id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="wallet-balance" style={{ marginTop: 12 }}>
              {loadingTotals ? 'Đang tải...' : (totalsError ? '—' : (
                walletFilter ? (
                  // show single wallet balance
                  (() => {
                    const sel = wallets.find(x => String(x._id) === String(walletFilter));
                    return sel ? formatCurrency(sel.initialBalance || 0, sel.currency) : '0₫';
                  })()
                ) : (
                  // all wallets: existing totals display
                  (Object.keys(totalsByCurrency).length === 0) ? '0₫'
                  : (Object.keys(totalsByCurrency).length === 1
                     ? formatCurrency(totalsByCurrency[Object.keys(totalsByCurrency)[0]], Object.keys(totalsByCurrency)[0])
                     : Object.keys(totalsByCurrency).map(c => `${formatCurrency(totalsByCurrency[c], c)}`).join(' • ')
                    )
                )
              ))}
            </div>
            <div className="wallet-note">{totalsError ? totalsError : ''}</div>
          </div>

          <div className="summary-item">
            <div className="summary-label">Tổng số dư</div>
            <div className="summary-value">
              {/* reuse wallet-balance logic for total display */}
              {walletFilter ? (
                (() => {
                  const sel = wallets.find(x => String(x._id) === String(walletFilter));
                  return sel ? formatCurrency(sel.initialBalance || 0, sel.currency) : '0₫';
                })()
              ) : (
                (Object.keys(totalsByCurrency).length === 0) ? '0₫'
                : (Object.keys(totalsByCurrency).length === 1
                   ? formatCurrency(totalsByCurrency[Object.keys(totalsByCurrency)[0]], Object.keys(totalsByCurrency)[0])
                   : Object.keys(totalsByCurrency).map(c => `${formatCurrency(totalsByCurrency[c], c)}`).join(' • ')
                  )
              )}
            </div>
          </div>
          <div className="summary-item">
            <div className="summary-label">Thu nhập tháng này</div>
            <div className="summary-value" style={{ color: '#27ae60' }}>
              {Object.keys(incomeByCurrency).length === 0 ? '0₫' : Object.keys(incomeByCurrency).map(c => formatCurrency(incomeByCurrency[c], c)).join(' • ')}
            </div>
          </div>
          <div className="summary-item">
            <div className="summary-label">Chi phí tháng này</div>
            <div className="summary-value" style={{ color: '#e74c3c' }}>
              {Object.keys(expenseByCurrency).length === 0 ? '0₫' : Object.keys(expenseByCurrency).map(c => formatCurrency(expenseByCurrency[c], c)).join(' • ')}
            </div>
          </div>
        </div>
        <div className="transactions-form-section">
          <div className="transactions-form-title">Thêm giao dịch</div>
          <form className="transactions-form" onSubmit={handleSubmit}>
            <select value={form.walletId} onChange={(e) => handleFormChange('walletId', e.target.value)} required>
              <option value="">-- Chọn ví --</option>
              {wallets.map(w => (
                <option key={w._id} value={w._id}>{w.name} — {w.currency} {w.initialBalance}</option>
              ))}
            </select>

            <input
              type="text"
              placeholder="Tên giao dịch"
              value={form.name}
              onChange={(e) => handleFormChange('name', e.target.value)}
              required
            />

            <select value={form.type} onChange={(e) => handleFormChange('type', e.target.value)}>
              <option value="expense">Chi tiêu</option>
              <option value="income">Thu nhập</option>
            </select>

            <select value={form.categoryId} onChange={(e) => handleFormChange('categoryId', e.target.value)} required>
              <option value="">-- Chọn danh mục --</option>
              {availableCategories.map(c => (
                <option key={c._id} value={c._id}>{c.icon || ''} {c.name}</option>
              ))}
            </select>

            <input type="number" placeholder="Số tiền" value={form.amount} onChange={(e) => handleFormChange('amount', e.target.value)} required min="0" />
            <input type="text" placeholder="Ghi chú" value={form.note} onChange={(e) => handleFormChange('note', e.target.value)} style={{ gridColumn: '1 / span 3' }} />

            {/* NEW: Map button replaces inline map picker */}
            <button
              type="button"
              onClick={() => setShowMapModal(true)}
              style={{ padding: '10px 14px', borderRadius: 8, background: 'linear-gradient(90deg,#2a5298,#4ecdc4)', color: '#fff', fontWeight: 700, cursor: 'pointer', border: 'none' }}
            >
              Bản đồ
            </button>

            {/* Show current location if set */}
            {(form.lat || form.lng || form.placeName) && (
              <div style={{ gridColumn: '1 / -1', fontSize: '.85rem', color: '#506a82', fontWeight: 600 }}>
                {form.placeName && <div>Địa điểm: {form.placeName}</div>}
                {(form.lat && form.lng) && <div>Tọa độ: {form.lat}, {form.lng}</div>}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="save-btn" type="submit" disabled={saving} style={{ minWidth: 160 }}>
                {saving ? 'Đang lưu...' : 'Thêm giao dịch'}
              </button>
            </div>

            {txMessage && <div style={{ marginTop: 8, color: txMessage.type === 'error' ? '#b71c1c' : '#1565c0' }}>{txMessage.text}</div>}
          </form>
        </div>
        <div className="transactions-list-section">
          <div className="transactions-list-title" style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:12 }}>
            <span>Danh sách giao dịch</span>

            {/* SCOPE FILTER BAR */}
            <div className="tx-scope-filters">
              <button
                type="button"
                className={`tx-scope-btn ${scopeFilter==='all'?'active':''}`}
                onClick={()=>setScopeFilter('all')}
                title="Hiện tất cả"
              >TẤT CẢ</button>
              <button
                type="button"
                className={`tx-scope-btn ${scopeFilter==='personal'?'active':''}`}
                onClick={()=>setScopeFilter('personal')}
                title="Chỉ giao dịch cá nhân"
              >CÁ NHÂN</button>
              <button
                type="button"
                className={`tx-scope-btn ${scopeFilter==='group'?'active':''}`}
                onClick={()=>setScopeFilter('group')}
                title="Chỉ giao dịch nhóm"
              >NHÓM</button>
              <button
                type="button"
                className={`tx-scope-btn ${scopeFilter==='family'?'active':''}`}
                onClick={()=>setScopeFilter('family')}
                title="Chỉ giao dịch gia đình"
              >GIA ĐÌNH</button>
            </div>

            {/* DATE RANGE PICKER */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label style={{ fontSize: 13, color: '#666' }}>Từ</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                aria-label="Từ ngày"
                style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #e6eef6' }}
              />
              <label style={{ fontSize: 13, color: '#666' }}>Đến</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                aria-label="Đến ngày"
                style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #e6eef6' }}
              />
              <button
                type="button"
                onClick={() => { setStartDate(''); setEndDate(''); }}
                style={{ padding: '6px 10px', borderRadius: 6, background: '#eef7fb', border: '1px solid #d8edf6' }}
              >
                Đặt lại
              </button>
            </div>
          </div>

          <table className="transactions-table">
            <thead>
              <tr>
                <th>Ngày</th>
                <th>Tên</th>
                {showWalletColumn && <th>Ví</th>}
                <th>Loại</th>
                <th>Danh mục</th>
                <th>Số tiền</th>
                {/* Loại bỏ cột nhóm */}
                {/* <th>Nhóm</th> */}
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loadingTransactions ? (
                <tr><td colSpan={showWalletColumn ? 7 : 6} style={{ textAlign: 'center', color: '#888' }}>Đang tải...</td></tr>
              ) : sortedTransactions.length === 0 ? (
                <tr><td colSpan={showWalletColumn ? 7 : 6} style={{ textAlign: 'center', color: '#888' }}>(Chưa có giao dịch)</td></tr>
              ) : sortedTransactions.map(tx => {
                const titleText = tx.title || tx.description || '—';
                const categoryInfo = tx.category && typeof tx.category === 'object' 
                  ? { name: tx.category.name || '', icon: tx.category.icon || '' }
                  : { name: tx.category || '', icon: '' };
                const categoryLabel = categoryInfo.name;
                const categoryIcon = categoryInfo.icon;
                const walletObj = tx.wallet && (typeof tx.wallet === 'string' ? null : tx.wallet);
                const currency = walletObj && walletObj.currency ? walletObj.currency : 'VND';
                let walletName = '';
                if (walletObj && walletObj.name) walletName = walletObj.name;
                else if (typeof tx.wallet === 'string') {
                  const w = wallets.find(wt => String(wt._id) === String(tx.wallet));
                  walletName = w ? w.name : '';
                }
                const amountFormatted = formatCurrency(tx.amount, currency);
                
                // Xác định kiểu hiển thị và style cho giao dịch nhóm
                const isGroupTx = tx.groupTransaction === true;
                const isPending = tx.isPending === true;
                const isFamilyTransfer = tx.metadata && tx.metadata.source === 'family_transfer';
                const isFamilyPersonal = tx.metadata && tx.metadata.source === 'family_personal';
                const familyName = tx.metadata && tx.metadata.familyName ? tx.metadata.familyName : '';
                const familyDirection = tx.metadata && tx.metadata.direction ? tx.metadata.direction : ''; // 'to-family' | 'from-family'

                // Tính toán style và icon cho giao dịch nhóm
                let rowStyle = {};
                let actionIcon = '';
                let detailText = '';
                
                if (isGroupTx) {
                  // Style cho các loại giao dịch nhóm khác nhau
                  if (tx.groupRole === 'payer' && tx.groupActionType === 'paid') {
                    rowStyle = { backgroundColor: '#fff8e1' }; // Màu vàng nhạt cho người trả tiền
                    actionIcon = '';
                  } else if (tx.groupRole === 'receiver') {
                    rowStyle = { backgroundColor: '#e8f5e9' }; // Màu xanh nhạt cho người nhận
                    actionIcon = '';
                  } else if (tx.groupRole === 'participant' && tx.groupActionType === 'paid') {
                    rowStyle = { backgroundColor: '#ffebee' }; // Màu đỏ nhạt cho người đã trả
                    actionIcon = '';
                  } else if (isPending) {
                    rowStyle = { backgroundColor: '#f5f5f5', color: '#757575' }; // Màu xám cho giao dịch chưa thanh toán
                    actionIcon = '';
                  }
                }

                // FIX: compute badges kinds once (remove duplicate const isGroupTx)
                const isFamilyTx = !!(tx.metadata && (tx.metadata.familyId || tx.metadata.familyTransactionId || isFamilyTransfer || isFamilyPersonal));
                const isPersonalTx = !isGroupTx && !isFamilyTx;

                return (
                  <tr key={tx._id} style={rowStyle}>
                    <td>{new Date(tx.date).toLocaleDateString()}</td>
                    <td>
                      <div className="tx-badges">
                        {isPersonalTx && <span className="tx-badge personal">CÁ NHÂN</span>}
                        {isGroupTx && <span className="tx-badge group">NHÓM</span>}
                        {isFamilyTx && <span className="tx-badge family">GIA ĐÌNH</span>}
                        {isPending && <span className="tx-badge" style={{ background:'#ffe2d3', color:'#c05621' }}>PENDING</span>}
                      </div>
                      {/* Hiển thị chú thích khi đây là giao dịch gia đình nhưng linked vào ví cá nhân (personal)
                          CHỈ hiển thị khi KHÔNG phải đang lọc theo scope "personal" */}
                      {isFamilyPersonal && scopeFilter !== 'personal' && (
                        <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 700, marginBottom: 4 }}>
                          Giao dịch gia đình (Cá nhân): {familyName || tx.metadata.familyId || ''}
                        </div>
                      )}
                      {isFamilyTransfer && (
                        <div style={{ fontSize: 12, color: '#065f46', fontWeight: 700, marginBottom: 4 }}>
                          {familyDirection === 'to-family' ? 'Nạp vào quỹ:' : familyDirection === 'from-family' ? 'Nhận từ quỹ:' : 'Quỹ:'} {familyName || tx.metadata.familyId || ''}
                        </div>
                      )}
                      {isGroupTx && <span style={{ marginRight:4 }}>{actionIcon}</span>}
                      <strong style={isPending ? { fontStyle: 'italic' } : {}}>{titleText}</strong>
                      {isPending && <span style={{ color: '#f57c00', marginLeft: '5px', fontSize: '12px' }}>(Chưa thanh toán)</span>}
                      {isGroupTx && detailText && (
                        <div style={{ fontSize: '12px', color: '#666', marginTop: '4px', lineHeight: '1.4' }}>
                          {detailText}
                        </div>
                      )}
                      {isGroupTx && tx.groupName && (
                        <div style={{ fontSize: '11px', color: '#999', marginTop: '2px', fontStyle: 'italic' }}>
                          Nhóm: {tx.groupName}
                        </div>
                      )}
                    </td>
                    {showWalletColumn && <td>{walletName}</td>}
                    <td>
                      <span style={{ 
                        color: tx.type === 'income' ? '#27ae60' : '#e74c3c',
                        fontWeight: '500'
                      }}>
                        {tx.type === 'income' ? 'Thu nhập' : 'Chi tiêu'}
                      </span>
                      {isGroupTx && (
                        <div style={{ fontSize: '11px', color: '#999', marginTop: '2px' }}>
                          {tx.groupRole === 'payer' ? 'Người tạo' : 
                           tx.groupRole === 'receiver' ? 'Người nhận' : 
                           tx.groupRole === 'participant' ? 'Người nợ' : ''}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className="tx-category-cell">
                        {categoryIcon && <span className="tx-category-icon">{categoryIcon}</span>}
                        <span>{categoryLabel}</span>
                      </span>
                    </td>
                    <td style={isPending ? { color: '#757575', fontStyle: 'italic' } : { fontWeight: '500' }}>
                      {amountFormatted}
                      {isGroupTx && tx.groupTransactionType && (
                        <div style={{ fontSize: '11px', color: '#999', marginTop: '2px' }}>
                          {tx.groupTransactionType === 'payer_for_others' ? 'Trả giúp' :
                           tx.groupTransactionType === 'equal_split' ? 'Chia đều' :
                           tx.groupTransactionType === 'percentage_split' ? 'Chia %' :
                           tx.groupTransactionType === 'payer_single' ? 'Trả đơn' : ''}
                        </div>
                      )}
                    </td>
                    <td className="tx-actions">
                      {/* Chỉ hiển thị nút Sửa/Xóa cho giao dịch cá nhân VÀ không phải transfer quỹ/không phải family-personal */}
                      {!isGroupTx && !isFamilyTransfer && !isFamilyPersonal && (
                        <>
                          <button className="tx-edit-btn" onClick={() => openEdit(tx)}>Sửa</button>
                          <button className="tx-delete-btn" onClick={() => openDeleteConfirm(tx)}>Xóa</button>
                        </>
                      )}

                      {/* NEW: nút dẫn tới trang gia đình nếu transaction liên quan đến family (metadata.familyId).
                          Điều hướng tới /family/{familyId}/transactions; nếu không có familyId thì fallback sang /family/transactions/{familyTransactionId} */}
                      {(tx.metadata && (tx.metadata.familyId || tx.metadata.familyTransactionId)) && (
                        <button
                          className="tx-family-btn"
                          onClick={async () => {
                            try {
                              const familyId = tx.metadata.familyId;
                              const familyTxId = tx.metadata.familyTransactionId;
                              if (familyId) {
                                // Lưu chọn gia đình rồi điều hướng SPA tới trang gia đình (app đọc localStorage)
                                localStorage.setItem('selectedFamilyId', familyId);
                                navigate('/family/transactions');
                                return;
                              }
                              if (familyTxId) {
                                // Nếu chỉ có familyTransactionId, gọi API để lấy familyId
                                const token = localStorage.getItem('token');
                                const headers = token ? { Authorization: `Bearer ${token}` } : {};
                                const res = await fetch(`http://localhost:5000/api/family/transactions/${familyTxId}`, { headers });
                                if (!res.ok) throw new Error('Không tìm thấy giao dịch gia đình');
                                const txDetail = await res.json();
                                const fid = txDetail.familyId && (txDetail.familyId._id || txDetail.familyId);
                                if (fid) {
                                  localStorage.setItem('selectedFamilyId', fid);
                                  navigate('/family/transactions');
                                  return;
                                }
                                throw new Error('Không xác định được ID gia đình từ giao dịch');
                              }
                              // fallback an toàn
                              showToast('Không có thông tin gia đình để chuyển hướng', 'error');
                            } catch (err) {
                              console.error('Navigate to family failed', err);
                              showToast(err.message || 'Không thể vào trang gia đình', 'error');
                            }
                          }}
                          title="Xem gia đình"
                        >
                          Gia đình
                        </button>
                      )}
                      {/* Hiển thị nút Xem chi tiết cho giao dịch nhóm */}
                      {isGroupTx && (
                        <button 
                          className="tx-view-btn" 
                          onClick={() => window.location.href = `/groups/${tx.groupId}/transactions`}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: '#3498db',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                          }}
                        >
                          Chi tiết
                        </button>
                      )}
                      {!isGroupTx && !isFamilyTransfer && !isFamilyPersonal && tx.location && typeof tx.location.lat === 'number' && typeof tx.location.lng === 'number' && (
                        <button
                          type="button"
                          className="tx-row-map-btn"
                          onClick={() => openTxMap(tx)}
                          title="Xem vị trí giao dịch"
                        >vị trí</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>

      {/* Toast notification removed - using global notification from notify.js only */}

      {/* Edit Transaction Modal with Location section */}
      {editModal.show && (
        <div className="tx-overlay">
          <div className="tx-edit-modal" role="dialog" aria-modal="true" aria-label="Sửa giao dịch">
            <h3 style={{ marginTop: 0 }}>Sửa giao dịch</h3>
            <form onSubmit={submitEdit} style={{ display: 'grid', gap: 8 }}>
              {/* ...existing inputs wallet/name/type/category/amount/date... */}
              <select value={editForm.walletId} onChange={(e) => handleEditChange('walletId', e.target.value)} required>
                <option value="">-- Chọn ví --</option>
                {wallets.map(w => <option key={w._id} value={w._id}>{w.name}</option>)}
              </select>
              <input value={editForm.name} onChange={(e) => handleEditChange('name', e.target.value)} placeholder="Tên giao dịch" required />
              <select value={editForm.type} onChange={(e) => handleEditChange('type', e.target.value)}>
                <option value="expense">Chi tiêu</option>
                <option value="income">Thu nhập</option>
              </select>
              <select value={editForm.categoryId} onChange={(e) => handleEditChange('categoryId', e.target.value)} required>
                <option value="">-- Chọn danh mục --</option>
                {
                  // categories available for selected wallet in edit modal
                  (() => {
                    const w = wallets.find(x => String(x._id) === String(editForm.walletId));
                    if (!w || !Array.isArray(w.categories)) return null;
                    return (w.categories || []).filter(c => c.type === editForm.type).map(c => (
                      <option key={c._id} value={c._id}>{c.icon || ''} {c.name}</option>
                    ));
                  })()
                }
              </select>
              <input type="number" value={editForm.amount} onChange={(e) => handleEditChange('amount', e.target.value)} min="0" required />
              <input type="date" value={editForm.date} onChange={(e) => handleEditChange('date', e.target.value)} required />

              {/* Location section */}
              <div className="tx-edit-loc-section">
                <div className="tx-edit-loc-title">Vị trí giao dịch</div>

                <div className="tx-edit-loc-row">
                  <input
                    type="text"
                    placeholder="Tìm địa điểm"
                    value={editMapSearch}
                    onChange={(e) => setEditMapSearch(e.target.value)}
                  />
                  <button type="button" onClick={performEditSearch} className="tx-edit-loc-secondary" disabled={editMapLoading}>
                    {editMapLoading ? 'Đang tìm...' : 'Tìm'}
                  </button>
                </div>

                {editMapResults.length > 0 && (
                  <div className="tx-map-results">
                    {editMapResults.map(r => (
                      <div
                        key={r.place_id}
                        className="tx-map-results-item"
                        onClick={() => selectEditSearchResult(r)}
                        title="Chọn địa điểm"
                      >
                        {r.display_name}
                      </div>
                    ))}
                  </div>
                )}

                <div className="tx-map-canvas" ref={editMapRef} aria-label="Bản đồ sửa vị trí"></div>

                <input
                  type="text"
                  placeholder="Tên địa điểm (ví dụ: Quán cà phê A)"
                  value={editLocForm.placeName}
                  onChange={(e) => setEditLocForm(prev => ({ ...prev, placeName: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e3f6f5' }}
                />

                {(editLocForm.lat || editLocForm.lng) && (
                  <div style={{ fontSize: '.8rem', color: '#506a82', fontWeight: 600 }}>
                    Tọa độ hiện tại: {editLocForm.lat || '—'}, {editLocForm.lng || '—'}
                  </div>
                )}

                <div className="tx-edit-loc-actions">
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" onClick={grabEditGeo} className="tx-edit-loc-secondary">GPS</button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditLocForm({ placeName: '', lat: '', lng: '', accuracy: '' });
                        if (editMarkerRef.current) { try { editMarkerRef.current.remove(); } catch(_) {} editMarkerRef.current = null; }
                      }}
                      className="tx-edit-loc-secondary"
                    >
                      Xóa chọn trên bản đồ
                    </button>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setEditModal({ show: false, tx: null, saving: false })}>Hủy</button>
                <button type="submit" disabled={editModal.saving}>{editModal.saving ? 'Đang lưu...' : 'Lưu'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRM MODAL (RESTORED) */}
      {confirmDelete.show && (
        <div className="tx-overlay" role="dialog" aria-modal="true" aria-label="Xác nhận xóa giao dịch">
          <div className="tx-edit-modal" style={{ maxWidth: 420 }}>
            <h3 style={{ marginTop: 0 }}>Xóa giao dịch</h3>
            <p>Bạn có chắc muốn xóa "<strong>{confirmDelete.title}</strong>"? Số dư ví sẽ được điều chỉnh lại.</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button type="button" onClick={cancelDelete} style={{ padding: '8px 12px', borderRadius: 8 }}>Hủy</button>
              <button
                type="button"
                onClick={handleDeleteConfirmed}
                className="tx-delete-btn"
                style={{ padding: '8px 12px', borderRadius: 8 }}
              >Xóa</button>
            </div>
          </div>
        </div>
      )}

      {/* NEW: Map Modal */}
      {showMapModal && (
        <div className="tx-overlay">
          <div className="tx-map-modal">
            <div className="tx-map-modal-header">
              <div className="tx-map-modal-title">Chọn vị trí trên bản đồ</div>
              <button className="tx-map-modal-close" onClick={() => setShowMapModal(false)}>×</button>
            </div>
            <div className="tx-map-picker">
              <div className="tx-map-search-row">
                <input
                  type="text"
                  placeholder="Tìm địa điểm (VD: quán cà phê, đường...)"
                  value={mapSearch}
                  onChange={e => setMapSearch(e.target.value)}
                />
                <button type="button" onClick={performSearch} disabled={mapLoading}>
                  {mapLoading ? 'Đang tìm...' : 'Tìm'}
                </button>
              </div>
              {mapResults.length > 0 && (
                <div className="tx-map-results">
                  {mapResults.map(r => (
                    <div
                      key={r.place_id}
                      className="tx-map-results-item"
                      onClick={() => selectSearchResult(r)}
                      title="Chọn địa điểm"
                    >
                      {r.display_name}
                    </div>
                  ))}
                </div>
              )}
              <div className="tx-map-canvas" ref={mapRef} aria-label="Bản đồ chọn vị trí"></div>
              <div className="tx-map-hint">
                Nhấp trên bản đồ để đặt tọa độ hoặc dùng ô tìm kiếm.
              </div>

              {/* Location manual inputs — HIDDEN lat/lng */}
              <input
                type="text"
                placeholder="Tên địa điểm (ví dụ: Quán cà phê A)"
                value={form.placeName}
                onChange={(e) => handleFormChange('placeName', e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e3f6f5' }}
              />
              {/* REMOVED: lat/lng visible inputs in modal — values set by map click / search result */}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={grabGeo}
                  style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #d0e4ef', background: '#eef7fb', cursor: 'pointer', fontWeight: 600 }}
                >
                  GPS
                </button>
                <button
                  type="button"
                  onClick={() => setForm(prev => ({ ...prev, lat: '', lng: '', accuracy: '', placeName: '' }))}
                  style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e6e6e6', background: '#fafafa', cursor: 'pointer', fontWeight: 600 }}
                >
                  Xóa vị trí
                </button>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setShowMapModal(false)}
                  style={{ marginLeft: 'auto', padding: '8px 16px', borderRadius: 8, background: 'linear-gradient(90deg,#2a5298,#4ecdc4)', color: '#fff', fontWeight: 700, border: 'none', cursor: 'pointer' }}
                >
                  Xong
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* NEW: per-transaction location view modal */}
      {showTxMapModal && txMapTarget && (
        <div className="tx-overlay">
          <div className="tx-map-view-modal">
            <div className="tx-map-view-header">
              <div className="tx-map-view-title">
                Vị trí giao dịch: {txMapTarget.title || txMapTarget.description || '—'}
              </div>
              <button
                type="button"
                className="tx-map-view-close"
                onClick={() => { setShowTxMapModal(false); setTxMapTarget(null); }}
              >×</button>
            </div>
            <div className="tx-map-view-meta">
              {txMapTarget.location.placeName && <div><b>Địa điểm:</b> {txMapTarget.location.placeName}</div>}
              <div><b>Tọa độ:</b> {txMapTarget.location.lat}, {txMapTarget.location.lng}</div>
            </div>
            <div ref={txViewMapRef} className="tx-map-view-canvas" aria-label="Bản đồ vị trí giao dịch" />
            <div className="tx-map-view-footer">
              Bản đồ chỉ hiển thị giao dịch này. Đóng để quay lại danh sách.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TransactionsPage;;
