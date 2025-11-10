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
  const markerIndexRef = useRef({}); // NEW: map txId -> marker
  const [activeTxId, setActiveTxId] = useState(null); // NEW: highlight selected

  // Map/container refs (always render map)
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  // NEW: layer refs to update without recreating map
  const heatLayerRef = useRef(null);
  const pinLayerRef = useRef(null);

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

  // UPDATE layers when data changes (no map re-creation)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    (async () => {
      const L = await ensureLeaflet();
      if (!L) return;

      // Remove previous layers
      if (heatLayerRef.current) {
        try { map.removeLayer(heatLayerRef.current); } catch(_) {}
        heatLayerRef.current = null;
      }
      if (pinLayerRef.current) {
        try { map.removeLayer(pinLayerRef.current); } catch(_) {}
        pinLayerRef.current = null;
      }
      markerIndexRef.current = {}; // NEW: reset marker registry

      // Heat layer (if available and has items)
      if (Array.isArray(items) && items.length && L.heatLayer) {
        const pts = items.map(p => {
          const amtNum = Number(p && p.amount ? p.amount : 0);
          const intensity = amtNum > 0 ? Math.sqrt(amtNum) / 250 : 0.15;
          return [p.lat, p.lng, intensity];
        });
        heatLayerRef.current = L.heatLayer(pts, {
          radius: 26,
          blur: 18,
          minOpacity: 0.3,
          maxZoom: 16
        }).addTo(map);
      } else if (Array.isArray(items) && items.length && !L.heatLayer) {
        setLibErr('Heat layer không khả dụng (thiếu leaflet.heat) — vẫn hiển thị ghim giao dịch.');
      }

      // Pin markers (heat buckets + raw)
      const pinLayer = L.layerGroup();
      // Buckets as small dots with tooltip
      (Array.isArray(items) ? items : []).forEach(p => {
        if (typeof p?.lat !== 'number' || typeof p?.lng !== 'number') return;
        const amtText = Number(p.amount || 0).toLocaleString('vi-VN');
        const cntText = (p.count != null ? p.count : 0);
        const label = `${p.placeName || 'Điểm'}\n${amtText}₫ (${cntText} lần)`;
        L.circleMarker([p.lat, p.lng], {
          radius: 5,
          color: '#2a5298',
          weight: 1,
          fillColor: '#4ecdc4',
          fillOpacity: 0.85
        }).addTo(pinLayer).bindTooltip(label.replace(/\n/g, '<br/>'), { direction: 'top' });
      });
      // Individual transaction pins (store reference)
      (Array.isArray(txPoints) ? txPoints : []).forEach(tx => {
        const lat = tx.location?.lat;
        const lng = tx.location?.lng;
        if (typeof lat !== 'number' || typeof lng !== 'number') return;
        const title = tx.title || tx.description || 'Giao dịch';
        const amountText = Number(tx.amount || 0).toLocaleString('vi-VN') + '₫';
        const dateText = tx.date ? new Date(tx.date).toLocaleDateString('vi-VN') : '';
        const category = tx.category && (tx.category.name || '');
        const place = tx.location?.placeName || '';
        const html = `
          <div style="min-width:160px">
            <div style="font-weight:800;color:#2a5298">${title}</div>
            <div>${amountText} • ${dateText}</div>
            ${category ? `<div>Danh mục: ${category}</div>` : ''}
            ${place ? `<div>Địa điểm: ${place}</div>` : ''}
          </div>
        `;
        const m = L.marker([lat, lng], { title, alt: title }).addTo(pinLayer).bindPopup(html);
        markerIndexRef.current[tx._id] = m; // NEW
      });
      pinLayer.addTo(map);
      pinLayerRef.current = pinLayer;

      // Fit bounds if we have any points
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
        const bounds = L.latLngBounds(allLatLngs);
        map.fitBounds(bounds.pad(0.15));
      }
    })();
  }, [items, txPoints]);

  // NEW: focus handler
  const focusTx = (txId) => {
    const map = mapRef.current;
    if (!map) return;
    const tx = txPoints.find(t => t._id === txId);
    if (!tx || !tx.location) return;
    setActiveTxId(txId);
    map.setView([tx.location.lat, tx.location.lng], Math.max(map.getZoom(), 14), { animate: true });
    const marker = markerIndexRef.current[txId];
    if (marker) {
      try { marker.openPopup(); } catch {}
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

  return (
    <div className="sp-map-layout">
      <div className="sp-map-main">
        {(libErr || err) && (
          <div className="sp-map-banners">
            {libErr && <div className="sp-map-banner error">{libErr}</div>}
            {err && <div className="sp-map-banner error">{err}</div>}
          </div>
        )}
        <div ref={containerRef} className="spending-map-container" />
        {loading && <div className="loading-overlay">Đang tải bản đồ...</div>}
      </div>
      <aside className="sp-map-list">
        <div className="sp-map-list-header">
          <span>Giao dịch có vị trí ({txPoints.length})</span>
          <button
            type="button"
            className="sp-map-reset-btn"
            onClick={resetView}
            disabled={!txPoints.length && !items.length}
            title="Xem tất cả giao dịch"
          >
            Tất cả
          </button>
        </div>
        {txPoints.length === 0 && (
          <div className="sp-map-list-empty">Chưa có giao dịch chi tiêu có vị trí.</div>
        )}
        <ul className="sp-map-ul">
          {(txPoints || []).map(tx => {
            const amt = Number(tx.amount || 0).toLocaleString('vi-VN') + '₫';
            const date = tx.date ? new Date(tx.date).toLocaleDateString('vi-VN') : '';
            const cat = tx.category && (tx.category.name || '');
            const place = tx.location?.placeName || '';
            return (
              <li
                key={tx._id}
                className={`sp-map-item ${activeTxId === tx._id ? 'active' : ''}`}
                onClick={() => focusTx(tx._id)}
                title="Xem trên bản đồ"
              >
                <div className="sp-map-item-top">
                  <span className="sp-map-item-title">{tx.title || tx.description || 'Giao dịch'}</span>
                  <span className="sp-map-item-amt">{amt}</span>
                </div>
                <div className="sp-map-item-meta">
                  {date && <span>{date}</span>}
                  {cat && <span>• {cat}</span>}
                </div>
                {place && <div className="sp-map-item-place">{place}</div>}
              </li>
            );
          })}
        </ul>
      </aside>
    </div>
  );
}
