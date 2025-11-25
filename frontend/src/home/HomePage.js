import React, { useState, useRef, useEffect } from 'react';
import { TourProvider, useTour } from '@reactour/tour';
import { steps } from './tourConfig';
import { walletCreationSteps } from './walletTourConfig';
import { savingsGoalSteps } from './savingsTourConfig';
import Sidebar from './Sidebar';
import Wallets from './Wallets';
import './HomePage.css';
import './TransactionsPage.css'; // Import CSS for transaction modal
import FinanceDashboard from './FinanceDashboard';
import SavingsGoals from './SavingsGoals';
import AiAssistant from './AiAssistant';
import { useNavigate } from 'react-router-dom';
import SpendingMap from './SpendingMap'; // NEW
import { showNotification } from '../utils/notify';

// Custom next/previous button component for the tour
const TourNavigation = (props) => {
  const { currentStep, steps, setCurrentStep, setIsOpen } = props;
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === steps.length - 1;
  
  const goToStep = (step) => {
    setCurrentStep(step);
  };
  
  const onClose = () => {
    setIsOpen(false);
  };

  return (
    <div style={{ 
      marginTop: '20px',
      display: 'flex',
      justifyContent: 'space-between',
      width: '100%',
      padding: '0 10px'
    }}>
      <button 
        onClick={onClose}
        style={{
          padding: '8px 16px',
          border: 'none',
          background: '#f0f0f0',
          borderRadius: '4px',
          cursor: 'pointer'
        }}
      >
        Bỏ qua
      </button>
      <div>
        {!isFirstStep && (
          <button 
            onClick={() => goToStep(currentStep - 1)}
            style={{
              marginRight: '10px',
              padding: '8px 16px',
              border: 'none',
              background: '#e0e0e0',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Trước
          </button>
        )}
        <button 
          onClick={() => isLastStep ? onClose() : goToStep(currentStep + 1)}
          style={{
            padding: '8px 16px',
            border: 'none',
            background: '#4ecdc4',
            color: 'white',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          {isLastStep ? 'Hoàn thành' : 'Tiếp theo'}
        </button>
      </div>
    </div>
  );
};

// Leaflet dynamic loader (reuse from TransactionsPage)
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

const HomePageContent = () => {
  const userName = localStorage.getItem('userName') || 'Tên người dùng';
  const navigate = useNavigate();
  const { setIsOpen, setCurrentStep, setSteps, currentStep } = useTour();
  const [showWelcome, setShowWelcome] = useState(false);
  const [showHelpDropdown, setShowHelpDropdown] = useState(false);
  const walletRef = useRef(null);
  const goalsRef = useRef(null);
  const aiRef = useRef(null);
  const statsRef = useRef(null);
  const financeDashboardRef = useRef(null);

  // Transaction modal state
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [wallets, setWallets] = useState([]);
  const [form, setForm] = useState({
    walletId: '',
    name: '',
    type: 'expense',
    categoryId: '',
    amount: '',
    date: new Date().toISOString().slice(0,10),
    note: '',
    placeName: '',
    lat: '',
    lng: '',
    accuracy: ''
  });
  const [saving, setSaving] = useState(false);
  const [txMessage, setTxMessage] = useState(null);
  const [showMapModal, setShowMapModal] = useState(false);
  const [mapSearch, setMapSearch] = useState('');
  const [mapResults, setMapResults] = useState([]);
  const [mapLoading, setMapLoading] = useState(false);
  const mapRef = useRef(null);
  const leafletMapRef = useRef(null);
  const markerRef = useRef(null);

  // Check if this is the first visit - CHỈ cho user mới
  useEffect(() => {
    const isNewUser = localStorage.getItem('isNewUser') === 'true';
    const hasSeenTour = localStorage.getItem('hasSeenTour') === 'true';
    const justRegistered = localStorage.getItem('justRegistered') === 'true';
    
    // Hiển thị tour nếu:
    // 1. User mới đăng ký (justRegistered)
    // 2. Hoặc là user mới (isNewUser) VÀ chưa xem tour (hasSeenTour = false)
    if (justRegistered || (isNewUser && !hasSeenTour)) {
      setShowWelcome(true);
      // Xóa flag justRegistered sau khi đã hiển thị
      localStorage.removeItem('justRegistered');
    }
  }, []);

  const startTour = () => {
    setShowWelcome(false);
    // Use a small timeout to ensure the tour has time to initialize
    setTimeout(() => {
      window.currentTourType = 'general';
      setIsOpen(true);
    }, 100);
  };
  
  // Function to show help button and trigger tour
  const showHelp = () => {
    window.currentTourType = 'general';
    setIsOpen(true);
  };

  const skipTour = async () => {
    setShowWelcome(false);
    // THÊM: Đánh dấu đã xem tour trên server
    await markTourAsSeen();
  };

  // THÊM: Function để đánh dấu đã xem tour
  const markTourAsSeen = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await fetch('http://localhost:5000/api/auth/mark-tour-seen', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        // Cập nhật localStorage
        localStorage.setItem('hasSeenTour', 'true');
        localStorage.setItem('isNewUser', 'false');
        console.log('Tour marked as seen');
      }
    } catch (error) {
      console.error('Error marking tour as seen:', error);
    }
  };

  // Function to show general guide
  const showGeneralHelp = () => {
    setSteps(steps);
    setShowHelpDropdown(false);
    window.currentTourType = 'general';
    setIsOpen(true);
  };

  // Function to show wallet creation guide
  const showWalletCreationGuide = () => {
    setSteps(walletCreationSteps);
    setShowHelpDropdown(false);
    setCurrentStep(0);
    window.currentTourType = 'wallet';
    setIsOpen(true);
  };

  // Function to show savings goals creation guide
  const showSavingsGoalGuide = () => {
    setSteps(savingsGoalSteps);
    setShowHelpDropdown(false);
    setCurrentStep(0);
    window.currentTourType = 'savings';
    setIsOpen(true);
  };

  // Toggle dropdown
  const toggleHelpDropdown = () => {
    setShowHelpDropdown(!showHelpDropdown);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest('.home-help-dropdown')) {
        setShowHelpDropdown(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  useEffect(() => {
    const onAddModal = () => {
      if (currentStep === 0) setTimeout(() => setCurrentStep(1), 150);
    };
    const onWalletCreated = () => {
      setTimeout(() => setCurrentStep(5), 250); // jump to step 6 (index 5)
    };
    const onExpenseChosen = () => {
      if (currentStep === 5) setTimeout(() => setCurrentStep(6), 150); // move to step 7
    };
    const onIncomeTab = () => {
      if (currentStep === 6) setTimeout(() => setCurrentStep(7), 150); // move to step 8
    };
    const onIncomeChosen = () => {
      if (currentStep === 7) setTimeout(() => setCurrentStep(8), 150); // move to step 9
    };
    const onCategoriesSaved = () => {
      if (currentStep <= 9) {
        markTourAsSeen();
        setIsOpen(false);
      }
    };
    // NEW: khi mở form tạo mục tiêu tiết kiệm trong tour "savings"
    const onSavingsCreateFormOpened = () => {
      if (window.currentTourType === 'savings' && currentStep === 1) {
        setTimeout(() => setCurrentStep(2), 200);
      }
    };
    const onSavingsGoalCreated = () => {
      if (window.currentTourType === 'savings') {
        // Hoàn tất tour tạo mục tiêu khi người dùng bấm "Tạo mục tiêu"
        markTourAsSeen();
        setIsOpen(false);
      }
    };
    window.addEventListener('walletAddModalOpened', onAddModal);
    window.addEventListener('walletCreated', onWalletCreated);
    window.addEventListener('walletExpenseCategoryChosen', onExpenseChosen);
    window.addEventListener('walletIncomeTabSelected', onIncomeTab);
    window.addEventListener('walletIncomeCategoryChosen', onIncomeChosen);
    window.addEventListener('walletCategoriesSaved', onCategoriesSaved);
    window.addEventListener('savingsGoalCreateFormOpened', onSavingsCreateFormOpened);
    window.addEventListener('savingsGoalCreated', onSavingsGoalCreated);
    return () => {
      window.removeEventListener('walletAddModalOpened', onAddModal);
      window.removeEventListener('walletCreated', onWalletCreated);
      window.removeEventListener('walletExpenseCategoryChosen', onExpenseChosen);
      window.removeEventListener('walletIncomeTabSelected', onIncomeTab);
      window.removeEventListener('walletIncomeCategoryChosen', onIncomeChosen);
      window.removeEventListener('walletCategoriesSaved', onCategoriesSaved);
      window.removeEventListener('savingsGoalCreateFormOpened', onSavingsCreateFormOpened);
      window.removeEventListener('savingsGoalCreated', onSavingsGoalCreated);
    };
  }, [currentStep]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Recalc highlight when category filter changes or modal resizes
    const forceRecalc = () => {
      // hack: trigger resize + re-set same step to force recompute bbox
      window.dispatchEvent(new Event('resize'));
      setTimeout(() => setCurrentStep(s => s), 50);
    };
    const onFilterChanged = forceRecalc;
    const onModalResized = forceRecalc;

    window.addEventListener('walletCategoryFilterChanged', onFilterChanged);
    window.addEventListener('walletCategoryModalResized', onModalResized);

    return () => {
      window.removeEventListener('walletCategoryFilterChanged', onFilterChanged);
      window.removeEventListener('walletCategoryModalResized', onModalResized);
    };
  }, [setCurrentStep]);

  useEffect(() => {
    // Attach MutationObserver when on category steps of wallet tour
    const modal = document.querySelector('.category-modal');
    if (!modal) return;
    const observer = new MutationObserver(() => {
      try { window.dispatchEvent(new CustomEvent('walletCategoryModalResized')); } catch(_) {}
    });
    observer.observe(modal, { childList: true, subtree: true, attributes: true });
    return () => observer.disconnect();
  }, [currentStep]);

  // Fetch wallets when modal opens
  useEffect(() => {
    if (showTransactionModal) {
      const fetchWallets = async () => {
        try {
          const token = localStorage.getItem('token');
          const headers = {};
          if (token) headers['Authorization'] = `Bearer ${token}`;
          const res = await fetch('http://localhost:5000/api/wallets', { headers });
          if (res.ok) {
            const data = await res.json();
            setWallets(data || []);
          }
        } catch (err) {
          console.error('Fetch wallets failed', err);
        }
      };
      fetchWallets();
    }
  }, [showTransactionModal]);

  // Transaction form handlers
  const handleFormChange = (k, v) => {
    setForm(prev => ({ ...prev, [k]: v }));
    if (k === 'walletId' || k === 'type') {
      setForm(prev => ({ ...prev, categoryId: '' }));
    }
  };

  const availableCategories = (() => {
    if (!form.walletId) return [];
    const w = wallets.find(x => String(x._id) === String(form.walletId));
    if (!w || !Array.isArray(w.categories)) return [];
    return (w.categories || []).filter(c => c.type === form.type);
  })();

  const handleSubmit = async (e) => {
    e && e.preventDefault();
    setTxMessage(null);
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
        date: new Date().toISOString(),
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
      showNotification('Đã thêm giao dịch thành công', 'success');
      try { window.dispatchEvent(new CustomEvent('transactionsUpdated', { detail: created })); } catch(_) {}
      try { window.dispatchEvent(new CustomEvent('walletsUpdated')); } catch(_) {}

      // Reset form and close modal
      setForm({
        walletId: '',
        name: '',
        type: 'expense',
        categoryId: '',
        amount: '',
        date: new Date().toISOString().slice(0,10),
        note: '',
        placeName: '',
        lat: '',
        lng: '',
        accuracy: ''
      });
      setShowTransactionModal(false);
    } catch (err) {
      console.error('Create transaction failed', err);
      const msg = err.message || 'Lỗi khi thêm giao dịch';
      setTxMessage({ type: 'error', text: msg });
      showNotification(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  // Map functions
  const grabGeo = () => {
    if (!navigator.geolocation) return showNotification('Thiết bị không hỗ trợ GPS', 'error');
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude, longitude, accuracy } = pos.coords;
        setForm(prev => ({ ...prev, lat: latitude.toFixed(6), lng: longitude.toFixed(6), accuracy: Math.round(accuracy) }));
        showNotification('Đã lấy vị trí', 'success');
      },
      err => showNotification(`GPS lỗi: ${err.code}`, 'error'),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  };

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
      showNotification('Không tìm được địa điểm', 'error');
    } finally {
      setMapLoading(false);
    }
  };

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

  // Init map when modal opens
  useEffect(() => {
    if (!showMapModal) {
      if (leafletMapRef.current) {
        try { leafletMapRef.current.remove(); } catch(_) {}
        leafletMapRef.current = null;
        markerRef.current = null;
      }
      return;
    }
    let cancelled = false;
    (async () => {
      await new Promise(r => setTimeout(r, 50));
      if (!mapRef.current || cancelled) return;
      try {
        const L = await loadLeaflet();
        if (!L || cancelled) return;
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
        showNotification('Không thể tải bản đồ', 'error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showMapModal]);

  return (
    <div className="home-container">
      <Sidebar userName={userName} />
      {showWelcome && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '30px',
            borderRadius: '12px',
            maxWidth: '500px',
            textAlign: 'center'
          }}>
            <h2>Chào mừng bạn đến với ứng dụng Quản lý tài chính!</h2>
            <p>Bạn có muốn xem hướng dẫn sử dụng không?</p>
            <div style={{ marginTop: '20px' }}>
              <button 
                onClick={startTour}
                style={{
                  padding: '10px 20px',
                  margin: '0 10px',
                  border: 'none',
                  background: '#4ecdc4',
                  color: 'white',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                Có, hướng dẫn tôi
              </button>
              <button 
                onClick={skipTour}
                style={{
                  padding: '10px 20px',
                  margin: '0 10px',
                  border: '1px solid #ddd',
                  background: 'white',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                Bỏ qua
              </button>
            </div>
          </div>
        </div>
      )}
      <main className="home-main">
        <div className="home-header">
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span className="home-title">Trang chủ</span>
            <div 
              className={`home-help-dropdown ${showHelpDropdown ? 'open' : ''}`}
            >
              <button
                onClick={toggleHelpDropdown}
                className="home-help-btn"
                title="Chọn loại hướng dẫn"
              >
                <i className="fas fa-question-circle"></i>
                Hướng dẫn
                <i className="fas fa-chevron-down dropdown-arrow"></i>
              </button>
              <div className="home-help-dropdown-content">
                <button 
                  className="home-help-dropdown-item"
                  onClick={showGeneralHelp}
                >
                  <i className="fas fa-compass"></i>
                  Hướng dẫn chung
                </button>
                <button 
                  className="home-help-dropdown-item"
                  onClick={showWalletCreationGuide}
                >
                  <i className="fas fa-wallet"></i>
                  Hướng dẫn tạo ví
                </button>
                <button 
                  className="home-help-dropdown-item"
                  onClick={showSavingsGoalGuide}
                >
                  <i className="fas fa-bullseye"></i>
                  Hướng dẫn mục tiêu tiết kiệm
                </button>
              </div>
            </div>
          </div>
          <div className="home-actions">
            <button onClick={() => setShowTransactionModal(true)}>+ Ghi chép</button>
            <button onClick={() => navigate('/switch')}>
              <i className="fas fa-layer-group"></i> Nhóm/Gia đình
            </button>
            <button 
              onClick={() => {
                if (financeDashboardRef.current) {
                  financeDashboardRef.current.openExportModal();
                }
              }}
              className="report-btn"
            >
              Xuất báo cáo
            </button>
          </div>
        </div>
        <div className="home-content">
          <section className="home-left">
            {/* NEW: Move SpendingMap to top */}
            <SpendingMap />
            {/* FinanceDashboard renders below the map now */}
            <FinanceDashboard ref={financeDashboardRef} />
            {/* <SpendingTimeline />  // ...removed... */}
          </section>
          <aside className="home-right">
            {/* Đưa Wallets sang bên phải */}
            <Wallets />
            
            {/* Đưa SavingsGoals xuống dưới Wallets */}
            <SavingsGoals />
            
            <div className="home-reminder">
              <div className="home-reminder-title">Ghi chú / Nhắc nhở</div>
              <ul className="home-reminder-list">
                <li>💡 Quản lý nhiều ví để tách rõ loại chi tiêu.</li>
                <li>Đặt mục tiêu tiết kiệm cho từng ví.</li>
                <li>📝 Cập nhật danh mục cho chính xác hơn.</li>
              </ul>
            </div>
          </aside>
        </div>
      </main>
      <AiAssistant />

      {/* Transaction Modal */}
      {showTransactionModal && (
        <div className="tx-overlay" onClick={(e) => {
          if (e.target.className === 'tx-overlay') {
            setShowTransactionModal(false);
            setForm({
              walletId: '',
              name: '',
              type: 'expense',
              categoryId: '',
              amount: '',
              date: new Date().toISOString().slice(0,10),
              note: '',
              placeName: '',
              lat: '',
              lng: '',
              accuracy: ''
            });
            setTxMessage(null);
          }
        }}>
          <div className="tx-edit-modal tx-modal-custom" onClick={(e) => e.stopPropagation()}>
            <div className="tx-modal-header">
              <h3>Thêm giao dịch</h3>
              <button
                className="tx-modal-close-btn"
                onClick={() => {
                  setShowTransactionModal(false);
                  setForm({
                    walletId: '',
                    name: '',
                    type: 'expense',
                    categoryId: '',
                    amount: '',
                    date: new Date().toISOString().slice(0,10),
                    note: '',
                    placeName: '',
                    lat: '',
                    lng: '',
                    accuracy: ''
                  });
                  setTxMessage(null);
                }}
              >
                ×
              </button>
            </div>
            <form onSubmit={handleSubmit} className="tx-modal-form">
              <select
                value={form.walletId}
                onChange={(e) => handleFormChange('walletId', e.target.value)}
                required
                style={{
                  padding: '10px 12px',
                  border: '1px solid #e3f6f5',
                  borderRadius: 8,
                  fontSize: '1rem',
                  background: '#f7fafd',
                  width: '100%',
                  boxSizing: 'border-box'
                }}
              >
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
                style={{
                  padding: '10px 12px',
                  border: '1px solid #e3f6f5',
                  borderRadius: 8,
                  fontSize: '1rem',
                  background: '#f7fafd',
                  width: '100%',
                  boxSizing: 'border-box'
                }}
              />

              <select
                value={form.type}
                onChange={(e) => handleFormChange('type', e.target.value)}
                style={{
                  padding: '10px 12px',
                  border: '1px solid #e3f6f5',
                  borderRadius: 8,
                  fontSize: '1rem',
                  background: '#f7fafd',
                  width: '100%',
                  boxSizing: 'border-box'
                }}
              >
                <option value="expense">Chi tiêu</option>
                <option value="income">Thu nhập</option>
              </select>

              <select
                value={form.categoryId}
                onChange={(e) => handleFormChange('categoryId', e.target.value)}
                required
                style={{
                  padding: '10px 12px',
                  border: '1px solid #e3f6f5',
                  borderRadius: 8,
                  fontSize: '1rem',
                  background: '#f7fafd',
                  width: '100%',
                  boxSizing: 'border-box'
                }}
              >
                <option value="">-- Chọn danh mục --</option>
                {availableCategories.map(c => (
                  <option key={c._id} value={c._id}>{c.icon || ''} {c.name}</option>
                ))}
              </select>

              <input
                type="number"
                placeholder="Số tiền"
                value={form.amount}
                onChange={(e) => handleFormChange('amount', e.target.value)}
                required
                min="0"
                style={{
                  padding: '10px 12px',
                  border: '1px solid #e3f6f5',
                  borderRadius: 8,
                  fontSize: '1rem',
                  background: '#f7fafd',
                  width: '100%',
                  boxSizing: 'border-box'
                }}
              />
              <input
                type="text"
                placeholder="Ghi chú"
                value={form.note}
                onChange={(e) => handleFormChange('note', e.target.value)}
                style={{
                  padding: '10px 12px',
                  border: '1px solid #e3f6f5',
                  borderRadius: 8,
                  fontSize: '1rem',
                  background: '#f7fafd',
                  width: '100%',
                  boxSizing: 'border-box'
                }}
              />

              <button
                type="button"
                onClick={() => setShowMapModal(true)}
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  background: 'linear-gradient(90deg,#2a5298,#4ecdc4)',
                  color: '#fff',
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: 'none'
                }}
              >
                Bản đồ
              </button>

              {(form.lat || form.lng || form.placeName) && (
                <div className="tx-location-info">
                  {form.placeName && <div>Địa điểm: {form.placeName}</div>}
                  {(form.lat && form.lng) && <div>Tọa độ: {form.lat}, {form.lng}</div>}
                </div>
              )}

              {txMessage && (
                <div className={`tx-message tx-message-${txMessage.type}`}>
                  {txMessage.text}
                </div>
              )}
            </form>
            <div className="tx-modal-footer">
              <button
                type="button"
                className="tx-btn-cancel"
                onClick={() => {
                  setShowTransactionModal(false);
                  setForm({
                    walletId: '',
                    name: '',
                    type: 'expense',
                    categoryId: '',
                    amount: '',
                    date: new Date().toISOString().slice(0,10),
                    note: '',
                    placeName: '',
                    lat: '',
                    lng: '',
                    accuracy: ''
                  });
                  setTxMessage(null);
                }}
              >
                Hủy
              </button>
              <button
                className="tx-btn-submit"
                type="button"
                disabled={saving}
                onClick={(e) => {
                  e.preventDefault();
                  handleSubmit(e);
                }}
              >
                {saving ? 'Đang lưu...' : 'Thêm giao dịch'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Map Modal */}
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

              <input
                type="text"
                placeholder="Tên địa điểm (ví dụ: Quán cà phê A)"
                value={form.placeName}
                onChange={(e) => handleFormChange('placeName', e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e3f6f5' }}
              />
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
    </div>
  );
}

function HomePage() {
  // THÊM: Function để đánh dấu đã xem tour
  const markTourAsSeen = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await fetch('http://localhost:5000/api/auth/mark-tour-seen', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        localStorage.setItem('hasSeenTour', 'true');
        localStorage.setItem('isNewUser', 'false');
        console.log('Tour marked as seen');
      }
    } catch (error) {
      console.error('Error marking tour as seen:', error);
    }
  };

  return (
    <div>
    <TourProvider
      steps={steps}
      scrollSmooth={true}
      resizeObserving={true}
      components={{
        Navigation: (props) => {
          const { currentStep, steps, setCurrentStep, setIsOpen } = props;
          const visibleDots = 5; // Maximum number of visible dots
          let startIndex = 0;
          
          // Calculate the starting index to show a sliding window of dots
          if (currentStep >= visibleDots) {
            startIndex = currentStep - visibleDots + 1;
          }
          
          // Ensure we don't go beyond the total number of steps
          const endIndex = Math.min(startIndex + visibleDots, steps.length);
          const isFirstStep = currentStep === 0;
          const isLastStep = currentStep === steps.length - 1;
          
          return (
            <div style={{
              background: 'linear-gradient(135deg, rgba(78, 205, 196, 0.1), rgba(42, 82, 152, 0.1))',
              borderRadius: '12px',
              padding: '15px 20px',
              margin: '20px 0',
              boxShadow: '0 4px 15px rgba(0, 0, 0, 0.1)',
              width: '100%',
              maxWidth: '400px',
              margin: '20px auto',
              border: '1px solid rgba(255, 255, 255, 0.2)'
            }}>
              {/* Step Counter */}
              <div style={{
                textAlign: 'center',
                marginBottom: '15px',
                fontSize: '14px',
                fontWeight: 600,
                color: '#4ecdc4',
                textTransform: 'uppercase',
                letterSpacing: '1px'
              }}>
                Bước {currentStep + 1} / {steps.length}
              </div>
              
              {/* Dots Navigation */}
              <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                marginBottom: '15px',
                padding: '0 10px'
              }}>
                {steps.map((_, index) => {
                  // Only render dots within the visible range
                  if (index >= startIndex && index < endIndex) {
                    return (
                      <button
                        key={index}
                        onClick={() => setCurrentStep(index)}
                        style={{
                          width: currentStep === index ? '12px' : '8px',
                          height: currentStep === index ? '12px' : '8px',
                          borderRadius: '50%',
                          border: 'none',
                          margin: '0 6px',
                          padding: 0,
                          background: currentStep === index 
                            ? 'linear-gradient(135deg, #4ecdc4, #2a5298)' 
                            : 'rgba(255, 255, 255, 0.4)',
                          cursor: 'pointer',
                          transition: 'all 0.3s ease',
                          boxShadow: currentStep === index 
                            ? '0 0 10px rgba(78, 205, 196, 0.5)' 
                            : 'none'
                        }}
                        aria-label={`Bước ${index + 1}`}
                      />
                    );
                  }
                  return null;
                })}
              </div>
              
              {/* Navigation Buttons */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                width: '100%',
                gap: '15px'
              }}>
                {/* Back Button */}
                <button
                  onClick={() => setCurrentStep(currentStep - 1)}
                  disabled={isFirstStep}
                  style={{
                    flex: 1,
                    padding: '10px 15px',
                    border: '1px solid rgba(78, 205, 196, 0.5)',
                    background: 'rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    cursor: isFirstStep ? 'not-allowed' : 'pointer',
                    color: isFirstStep ? 'rgba(78, 205, 196, 0.5)' : '#4ecdc4',
                    fontWeight: 600,
                    fontSize: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    transition: 'all 0.3s ease',
                    opacity: isFirstStep ? 0.6 : 1,
                    backdropFilter: 'blur(5px)'
                  }}
                >
                  <span>←</span> Quay lại
                </button>
                
                {/* Next/Finish Button */}
                <button
                  onClick={() => isLastStep ? setIsOpen(false) : setCurrentStep(currentStep + 1)}
                  style={{
                    flex: 1,
                    padding: '10px 15px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #4ecdc4, #2a5298)',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    color: 'white',
                    fontWeight: 600,
                    fontSize: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    transition: 'all 0.3s ease',
                    boxShadow: '0 4px 15px rgba(78, 205, 196, 0.3)'
                  }}
                >
                  {isLastStep ? 'Hoàn thành' : 'Tiếp theo'}
                  {!isLastStep && <span>→</span>}
                </button>
              </div>
            </div>
          );
        }
      }}
      onOpen={() => document.body.classList.add('tour-open')}
      onClose={() => document.body.classList.remove('tour-open')}
      onCurrentStepChange={(step) => {
        // Xác định bộ steps hiện tại theo loại tour đang mở
        let currentSteps = steps;
        if (window.currentTourType === 'wallet') {
          currentSteps = walletCreationSteps;
        } else if (window.currentTourType === 'savings') {
          currentSteps = savingsGoalSteps;
        }

        const stepDef = currentSteps[step];

        // Tự cuộn tới khu vực dashboard trung tâm
        if (stepDef?.selector === '.fd-root') {
          const target = document.querySelector('.fd-root');
          const scroller = document.querySelector('.home-main');
          if (target && scroller) {
            const top = target.offsetTop - 40;
            scroller.scrollTo({ top, behavior: 'smooth' });
          }
        }

        // Tự cuộn tới khu vực mục tiêu tiết kiệm
        if (stepDef?.selector === '.tour-goals-component') {
          const target = document.querySelector('.tour-goals-component');
          const scroller = document.querySelector('.home-main');
          if (target && scroller) {
            const top = target.offsetTop - 60;
            scroller.scrollTo({ top, behavior: 'smooth' });
          }
        }

        // Thực thi action nếu step có khai báo (ví dụ: auto bấm nút mở form)
        if (stepDef?.action && typeof stepDef.action === 'function') {
          setTimeout(() => {
            stepDef.action();
          }, 500);
        }
      }}
      disableInteraction={false}
      disableDotsNavigation={false}
      disableKeyboardNavigation={false}
      showNavigation={true}
      showBadge={false}
      showCloseButton={true}
      onClickClose={({ setIsOpen }) => {
        markTourAsSeen();
        setIsOpen(false);
      }}
      styles={{
        popover: (base) => ({
          ...base,
          padding: 0,
          border: 'none',
          background: 'linear-gradient(135deg,#4ecdc4 0%,#2a5298 100%)',
          borderRadius: 20,
          boxShadow: '0 10px 28px -4px rgba(0,0,0,0.25)',
          overflow: 'hidden',
        }),
        dot: (base, { current }) => ({
          ...base,
          width: 12,
          height: 12,
          // margin removed so CSS gap + margin works
          backgroundColor: current ? '#4ecdc4' : '#d5dbe3',
          border: current ? '2px solid #2a5298' : '2px solid #ffffff',
          boxSizing: 'border-box',
        }),
        badge: () => ({
          display: 'none'
        }),
        maskArea: (base) => ({
          ...base,
          rx: 14,
          stroke: 'rgba(78,205,196,0.55)',
          strokeWidth: 4,
          transition: 'all .5s cubic-bezier(.4,.14,.25,1)'
        }),
        highlightedArea: (base) => ({
          ...base,
          stroke: 'url(#tour-gradient-stroke)',
          strokeWidth: 4,
          filter: 'drop-shadow(0 0 12px rgba(78,205,196,0.55))',
          transition: 'all .55s cubic-bezier(.4,.14,.25,1)',
        }),
        controls: (base) => ({
          ...base,
          marginTop: '20px'
        }),
        button: (base) => ({
          ...base,
          padding: '8px 16px',
          border: 'none',
          background: '#4ecdc4',
          color: 'white',
          borderRadius: '4px',
          cursor: 'pointer',
          fontWeight: '500',
          fontSize: '14px',
          transition: 'all 0.2s'
        })
      }}
      padding={10}
      position="center"
      prevButton={({ currentStep, setCurrentStep, steps }) => {
        const isFirstStep = currentStep === 0;
        return isFirstStep ? null : (
          <button
            onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
            style={{
              padding: '8px 16px',
              marginRight: '10px',
              border: 'none',
              background: '#e0e0e0',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: '500'
            }}
          >
            ← Trước
          </button>
        );
      }}
      nextButton={({ currentStep, setCurrentStep, steps, setIsOpen }) => {
        const isLastStep = currentStep === steps.length - 1;
        return (
          <button
            onClick={() => {
              if (isLastStep) {
                markTourAsSeen();
                setIsOpen(false);
              } else {
                setCurrentStep(Math.min(steps.length - 1, currentStep + 1));
              }
            }}
            style={{
              padding: '8px 16px',
              border: 'none',
              background: '#4ecdc4',
              color: 'white',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: '500'
            }}
          >
            {isLastStep ? 'Hoàn thành ✓' : 'Tiếp theo →'}
          </button>
        );
      }}
    >
      <HomePageContent />
    </TourProvider>
    </div>
  );
}

export default HomePage;

