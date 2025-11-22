import React, { useEffect, useState, useRef } from 'react';
import './SpendingMap.css';

// NEW: dynamic loader (CDN) instead of bundler imports
const ensureLeaflet = async () => {
  if (typeof window === 'undefined') return null;
  if (window.L && window.L.heatLayer) return window.L;

  const addCss = () => {
    if (!document.querySelector('link[data-leaflet]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      link.setAttribute('data-leaflet', '1');
      document.head.appendChild(link);
    }
  };

  const loadHeat = () => {
    if (window.L && window.L.heatLayer) return Promise.resolve(window.L);
    return new Promise(resolve => {
      const heatScript = document.createElement('script');
      heatScript.src = 'https://unpkg.com/leaflet.heat/dist/leaflet-heat.js';
      heatScript.onload = () => resolve(window.L);
      heatScript.onerror = () => resolve(window.L); // proceed without heat
      document.head.appendChild(heatScript);
    });
  };

  addCss();

  if (window.L) {
    return loadHeat();
  }

  // load leaflet core first
  await new Promise((resolve, reject) => {
    const core = document.createElement('script');
    core.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    core.onload = resolve;
    core.onerror = () => reject(new Error('Leaflet CDN load failed'));
    document.head.appendChild(core);
  });

  return loadHeat();
};

export default function SpendingMap() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [libErr, setLibErr] = useState(null);
  const [txPoints, setTxPoints] = useState([]);
  const markerIndexRef = useRef({}); // map txId -> marker
  const [activeTxId, setActiveTxId] = useState(null);
  const [viewMode, setViewMode] = useState('all');
  const listRef = useRef(null);
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const heatLayerRef = useRef(null);
  const pinLayerRef = useRef(null);

  // NEW: search/filter/sort states
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('date'); // 'date' | 'amount' | 'name'
  const [filterRange, setFilterRange] = useState(null); // 'low' | 'med' | 'high' | null

  // NEW: compute spending stats from txPoints
  const stats = (() => {
    if (!txPoints.length) return { total: 0, avg: 0, max: 0, count: 0 };
    const amounts = txPoints.map(t => Number(t.amount) || 0);
    const total = amounts.reduce((s, a) => s + a, 0);
    const avg = total / amounts.length;
    const max = Math.max(...amounts);
    return { total, avg, max, count: amounts.length };
  })();

  // fetch heat data
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const token = localStorage.getItem('token');
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await fetch('http://localhost:5000/api/transactions/geo/heat', { headers });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.message || 'Tải dữ liệu bản đồ thất bại');
        if (!cancelled) setItems(data.items || []);
      } catch (e) {
        if (!cancelled) setErr(e.message || 'Lỗi tải bản đồ');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // NEW: fetch raw transactions with location (pins)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = localStorage.getItem('token');
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await fetch('http://localhost:5000/api/transactions', { headers });
        const data = await res.json();
        if (!res.ok) throw new Error('Tải giao dịch thất bại');
        if (cancelled) return;
        // Only expenses with valid location
        const points = (Array.isArray(data) ? data : []).filter(tx =>
          tx &&
          tx.type === 'expense' &&
          tx.location &&
          typeof tx.location.lat === 'number' &&
          typeof tx.location.lng === 'number'
        );
        setTxPoints(points);
      } catch (_) {
        // silent – pins are optional
        setTxPoints([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // NEW: init map ONCE (always show map even without data)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!containerRef.current || mapRef.current) return;
      try {
        const L = await ensureLeaflet();
        if (cancelled || !L) return;
        const map = L.map(containerRef.current, {
          center: [21.0278, 105.8342],
          zoom: 6,
          zoomControl: true
        });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap'
        }).addTo(map);
        mapRef.current = map;
      } catch (e) {
        setLibErr(e.message || 'Không thể tải Leaflet từ CDN');
      }
    })();
    return () => {
      cancelled = true;
      if (mapRef.current) {
        try { mapRef.current.remove(); } catch(_) {}
        mapRef.current = null;
      }
      heatLayerRef.current = null;
      pinLayerRef.current = null;
    };
  }, []);

  // UPDATE layers when data changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    (async () => {
      const L = await ensureLeaflet();
      if (!L) return;

      // Remove previous layers
      if (heatLayerRef.current) { try { map.removeLayer(heatLayerRef.current); } catch(_) {} heatLayerRef.current = null; }
      if (pinLayerRef.current)  { try { map.removeLayer(pinLayerRef.current); } catch(_) {}  pinLayerRef.current  = null; }
      markerIndexRef.current = {};

      // Heat layer
      if ((viewMode === 'all' || viewMode === 'heat') && Array.isArray(items) && items.length && L.heatLayer) {
        const pts = items.map(p => {
          const amtNum = Number(p && p.amount ? p.amount : 0);
          const intensity = amtNum > 0 ? Math.sqrt(amtNum) / 250 : 0.15;
          return [p.lat, p.lng, intensity];
        });
        heatLayerRef.current = L.heatLayer(pts, { radius: 26, blur: 18, minOpacity: 0.3, maxZoom: 16 }).addTo(map);
      } else if (Array.isArray(items) && items.length && !L.heatLayer) {
        setLibErr('Heat layer không khả dụng (thiếu leaflet.heat) — vẫn hiển thị ghim giao dịch.');
      }

      // Pins (with custom animated marker)
      if (viewMode === 'all' || viewMode === 'pins') {
        const pinLayer = L.layerGroup();
        // Buckets as dots
        (Array.isArray(items) ? items : []).forEach(p => {
          if (typeof p?.lat !== 'number' || typeof p?.lng !== 'number') return;
          const amtText = Number(p.amount || 0).toLocaleString('vi-VN');
          const cntText = (p.count != null ? p.count : 0);
          const label = `<div style="font-size:.7rem;font-weight:700">
            <div style="color:#2a5298">${p.placeName || 'Điểm'}</div>
            <div style="color:#e74c3c">${amtText}₫</div>
            <div style="color:#607d8b">${cntText} lần</div>
          </div>`;
          L.circleMarker([p.lat, p.lng], {
            radius: 6, color: '#2a5298', weight: 2, fillColor: '#4ecdc4', fillOpacity: 0.85
          }).addTo(pinLayer).bindTooltip(label, { direction: 'top', className: 'sp-custom-tooltip' });
        });
        // Individual tx pins with enhanced popup + custom icon
        (Array.isArray(txPoints) ? txPoints : []).forEach(tx => {
          const lat = tx.location?.lat, lng = tx.location?.lng;
          if (typeof lat !== 'number' || typeof lng !== 'number') return;
          const title = tx.title || tx.description || 'Giao dịch';
          const amountText = Number(tx.amount || 0).toLocaleString('vi-VN') + '₫';
          const dateText = tx.date ? new Date(tx.date).toLocaleDateString('vi-VN') : '';
          const category = tx.category && (tx.category.name || '');
          const categoryIcon = tx.category && (tx.category.icon || '');
          const place = tx.location?.placeName || '';
          // ENHANCED: Add copy coords action button in popup
          const html = `
            <div style="min-width:200px;font-size:.78rem;line-height:1.5">
              <div style="font-weight:900;color:#2a5298;margin-bottom:5px">${title}</div>
              <div style="color:#e74c3c;font-weight:800;margin-bottom:5px">${amountText}</div>
              <div style="color:#607d8b;font-size:.72rem;margin-bottom:3px">${dateText}</div>
              ${category ? `<div style="color:#4ecdc4;font-size:.72rem;margin-bottom:3px;display:flex;align-items:center;gap:4px"><span>${categoryIcon || ''}</span><span>${category}</span></div>` : ''}
              ${place ? `<div style="color:#2a5298;font-size:.72rem;margin-bottom:5px">${place}</div>` : ''}
              <button
                onclick="navigator.clipboard.writeText('${lat}, ${lng}');alert('Đã sao chép tọa độ!');"
                style="margin-top:5px;padding:4px 8px;background:linear-gradient(90deg,#2a5298,#4ecdc4);color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:.7rem;font-weight:700"
              >Copy tọa độ</button>
            </div>
          `;
          const m = L.marker([lat, lng], {
            title, alt: title,
            icon: L.divIcon({
              className: 'sp-custom-marker',
              html: '<div class="sp-marker-dot"></div>',
              iconSize: [20, 20],
              iconAnchor: [10, 10],
              popupAnchor: [0, -10]
            })
          }).addTo(pinLayer).bindPopup(html);
          markerIndexRef.current[tx._id] = m;
        });
        pinLayer.addTo(map);
        pinLayerRef.current = pinLayer;
      }

      // Fit bounds (always consider all points for a pleasant default view)
      const allLatLngs = [];
      (Array.isArray(items) ? items : []).forEach(p => { if (typeof p?.lat === 'number' && typeof p?.lng === 'number') allLatLngs.push([p.lat, p.lng]); });
      (Array.isArray(txPoints) ? txPoints : []).forEach(t => { if (typeof t?.location?.lat === 'number' && typeof t?.location?.lng === 'number') allLatLngs.push([t.location.lat, t.location.lng]); });
      if (allLatLngs.length > 1 && window.L) {
        const bounds = window.L.latLngBounds(allLatLngs);
        map.fitBounds(bounds.pad(0.15));
      }
    })();
  }, [items, txPoints, viewMode]);

  // NEW: enhanced focus handler — center map AND scroll list item to center
  const focusTx = (txId) => {
    const map = mapRef.current;
    if (!map) return;
    const tx = txPoints.find(t => t._id === txId);
    if (!tx || !tx.location) return;
    setActiveTxId(txId);
    // Center map with smooth animation + zoom to 15 for detail view
    map.setView([tx.location.lat, tx.location.lng], 15, { animate: true, duration: 0.8 });
    const marker = markerIndexRef.current[txId];
    if (marker) {
      try { marker.openPopup(); } catch {}
    }
    // Scroll list item to center of container
    if (listRef.current) {
      const listItem = listRef.current.querySelector(`[data-tx-id="${txId}"]`);
      if (listItem) {
        listItem.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      }
    }
  };

  // NEW: reset to show all transactions (fit all bounds)
  const resetView = () => {
    setActiveTxId(null);
    const map = mapRef.current;
    if (!map) return;
    const allLatLngs = [];
    (Array.isArray(items) ? items : []).forEach(p => {
      if (typeof p?.lat === 'number' && typeof p?.lng === 'number') allLatLngs.push([p.lat, p.lng]);
    });
    (Array.isArray(txPoints) ? txPoints : []).forEach(t => {
      if (typeof t?.location?.lat === 'number' && typeof t?.location?.lng === 'number') {
        allLatLngs.push([t.location.lat, t.location.lng]);
      }
    });
    if (allLatLngs.length > 1) {
      const L = window.L;
      if (L) {
        const bounds = L.latLngBounds(allLatLngs);
        map.fitBounds(bounds.pad(0.15));
      }
    } else {
      // fallback center if only 0–1 point
      map.setView([21.0278,105.8342], 6);
    }
  };

  // NEW: helper to classify amount into low/med/high for badge color
  const amountClass = (amt) => {
    if (amt < 100000) return 'low';
    if (amt < 500000) return 'med';
    return 'high';
  };

  // NEW: filter + sort logic
  const filteredAndSorted = (() => {
    let list = [...(txPoints || [])];
    // filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(tx =>
        (tx.title || '').toLowerCase().includes(q) ||
        (tx.description || '').toLowerCase().includes(q) ||
        (tx.location?.placeName || '').toLowerCase().includes(q)
      );
    }
    // filter by amount range
    if (filterRange) {
      list = list.filter(tx => {
        const amt = Number(tx.amount) || 0;
        if (filterRange === 'low') return amt < 100000;
        if (filterRange === 'med') return amt >= 100000 && amt < 500000;
        if (filterRange === 'high') return amt >= 500000;
        return true;
      });
    }
    // sort
    list.sort((a, b) => {
      if (sortBy === 'date') return new Date(b.date || 0) - new Date(a.date || 0);
      if (sortBy === 'amount') return (Number(b.amount) || 0) - (Number(a.amount) || 0);
      if (sortBy === 'name') return (a.title || '').localeCompare(b.title || '');
      return 0;
    });
    return list;
  })();

  return (
    <div className="sp-map-card sp-glow">
      <div className="sp-map-header">
        <div className="sp-map-title">Bản đồ chi tiêu</div>
        <div className="sp-map-controls">
          <div className="sp-view-toggle" role="tablist" aria-label="Chế độ hiển thị bản đồ">
            <button
              className={`sp-toggle-btn ${viewMode === 'all' ? 'active' : ''}`}
              onClick={() => setViewMode('all')}
              role="tab"
              aria-selected={viewMode === 'all'}
            >TẤT CẢ</button>
            <button
              className={`sp-toggle-btn ${viewMode === 'heat' ? 'active' : ''}`}
              onClick={() => setViewMode('heat')}
              role="tab"
              aria-selected={viewMode === 'heat'}
            >HEAT</button>
            <button
              className={`sp-toggle-btn ${viewMode === 'pins' ? 'active' : ''}`}
              onClick={() => setViewMode('pins')}
              role="tab"
              aria-selected={viewMode === 'pins'}
            >PINS</button>
          </div>
          <button type="button" className="sp-map-reset-btn" onClick={resetView} disabled={!txPoints.length && !items.length}>
            TẤT CẢ
          </button>
        </div>
      </div>

      {/* Stats row — clickable to filter by range */}
      <div className="sp-stats-row">
        <div className="sp-stat-badge" onClick={() => setFilterRange(null)} title="Xem tất cả">
          <span>Tổng: <span className="sp-stat-value">{stats.total.toLocaleString('vi-VN')}₫</span></span>
        </div>
        <div className="sp-stat-badge" onClick={() => setFilterRange('low')} title="Lọc chi tiêu thấp (<100k)">
          <span>TB: <span className="sp-stat-value">{Math.round(stats.avg).toLocaleString('vi-VN')}₫</span></span>
        </div>
        <div className="sp-stat-badge" onClick={() => setFilterRange('high')} title="Lọc chi tiêu cao (≥500k)">
          <span>Max: <span className="sp-stat-value">{stats.max.toLocaleString('vi-VN')}₫</span></span>
        </div>
        <div className="sp-stat-badge">
          <span>Điểm: <span className="sp-stat-value">{stats.count}</span></span>
        </div>
      </div>

      {/* NEW: Mini legend for heat intensity */}
      {(viewMode === 'all' || viewMode === 'heat') && (
        <div className="sp-legend">
          <span>Cường độ:</span>
          <div className="sp-legend-item" onClick={() => setFilterRange('low')} title="Lọc mức thấp">
            <div className="sp-legend-dot low" />
            <span>Thấp</span>
          </div>
          <div className="sp-legend-item" onClick={() => setFilterRange('med')} title="Lọc mức trung bình">
            <div className="sp-legend-dot med" />
            <span>Trung bình</span>
          </div>
          <div className="sp-legend-item" onClick={() => setFilterRange('high')} title="Lọc mức cao">
            <div className="sp-legend-dot high" />
            <span>Cao</span>
          </div>
        </div>
      )}

      {(libErr || err) && (
        <div className="sp-map-banners">
          {libErr && <div className="sp-map-banner error">{libErr}</div>}
          {err && <div className="sp-map-banner error">{err}</div>}
        </div>
      )}

      <div className="sp-map-layout">
        <div className="sp-map-main">
          <div ref={containerRef} className="spending-map-container" />
          {loading && <div className="loading-overlay"><div className="spinner" /> Đang tải bản đồ...</div>}
        </div>
        <aside className="sp-map-list">
          <div className="sp-map-list-header">
            <span>Giao dịch có vị trí ({filteredAndSorted.length}/{txPoints.length})</span>
            <span className="sp-map-subtle">{viewMode === 'heat' ? 'Heat' : viewMode === 'pins' ? 'Pins' : 'Kết hợp'}</span>
          </div>

          {/* NEW: search + sort controls */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input
              type="text"
              placeholder="Tìm kiếm..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ flex: 1, padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(214,227,236,0.8)', fontSize: '.72rem', background: 'rgba(255,255,255,0.9)' }}
            />
            <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid rgba(214,227,236,0.8)', fontSize: '.72rem', background: 'rgba(255,255,255,0.9)', cursor: 'pointer' }}>
              <option value="date">Ngày</option>
              <option value="amount">Số tiền</option>
              <option value="name">Tên</option>
            </select>
          </div>

          {filteredAndSorted.length === 0 && (
            <div className="sp-map-list-empty">
              {searchQuery || filterRange ? 'Không tìm thấy giao dịch phù hợp' : 'Chưa có giao dịch chi tiêu có vị trí.'}
            </div>
          )}
          <ul className="sp-map-ul" ref={listRef}>
            {filteredAndSorted.map((tx, idx) => {
              const amt = Number(tx.amount || 0);
              const amtText = amt.toLocaleString('vi-VN') + '₫';
              const date = tx.date ? new Date(tx.date).toLocaleDateString('vi-VN') : '';
              const cat = tx.category && (tx.category.name || '');
              const catIcon = tx.category && (tx.category.icon || '');
              const place = tx.location?.placeName || '';
              return (
                <li
                  key={tx._id}
                  data-tx-id={tx._id}
                  className={`sp-map-item ${activeTxId === tx._id ? 'active pulse' : ''}`}
                  onClick={() => focusTx(tx._id)}
                  title="Xem trên bản đồ"
                  style={{ animationDelay: `${idx * 30}ms`, animation: 'fadeInUp .4s ease forwards', opacity: 0 }}
                >
                  <div className="sp-map-item-top">
                    <span className="sp-map-item-title">{tx.title || tx.description || 'Giao dịch'}</span>
                    <span className={`sp-map-item-amt ${amountClass(amt)}`}>{amtText}</span>
                  </div>
                  <div className="sp-map-item-meta">
                    {date && <span>{date}</span>}
                    {cat && <span className="sp-map-item-category"><span className="sp-cat-icon">{catIcon || ''}</span><span>{cat}</span></span>}
                  </div>
                  {place && <div className="sp-map-item-place">{place}</div>}
                </li>
              );
            })}
          </ul>
        </aside>
      </div>
    </div>
  );
}

// Add CSS keyframe for fadeInUp in the same file via <style> tag or inject dynamically
if (typeof document !== 'undefined' && !document.querySelector('#sp-animations')) {
  const style = document.createElement('style');
  style.id = 'sp-animations';
  style.textContent = `
    @keyframes fadeInUp {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `;
  document.head.appendChild(style);
}
