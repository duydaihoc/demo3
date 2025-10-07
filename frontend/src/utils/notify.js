export function showNotification(message, type = 'success', timeout = 4000) {
  if (typeof document === 'undefined') return;
  // inject styles once
  if (!document.getElementById('global-notify-styles')) {
    const style = document.createElement('style');
    style.id = 'global-notify-styles';
    style.innerHTML = `
      .global-notification-wrapper { position: fixed; top: 24px; left: 50%; transform: translateX(-50%); z-index: 9999; display:flex; flex-direction:column; gap:10px; pointer-events: none; }
      .global-notification { pointer-events: auto; min-width: 240px; max-width: 92vw; padding: 14px 20px; border-radius: 10px; color: #fff; font-weight:600; box-shadow: 0 6px 18px rgba(2,6,23,0.18); opacity: 0; transform: translateY(-10px); transition: opacity 220ms, transform 220ms; display:flex; align-items:center; gap:12px; font-size:16px; }
      .global-notification.show { opacity: 1; transform: translateY(0); }
      .global-notification.success { background: linear-gradient(90deg,#10b981,#059669); }
      .global-notification.error { background: linear-gradient(90deg,#ef4444,#dc2626); }
      .global-notification.info { background: linear-gradient(90deg,#0ea5e9,#0284c7); }
      .global-notification .notify-icon { font-size: 22px; flex-shrink:0; opacity:0.92; }
    `;
    document.head.appendChild(style);
  }

  // ensure container
  let container = document.querySelector('.global-notification-wrapper');
  if (!container) {
    container = document.createElement('div');
    container.className = 'global-notification-wrapper';
    document.body.appendChild(container);
  }

  const el = document.createElement('div');
  el.className = `global-notification ${type || 'info'}`;
  // icon
  let icon = '';
  if (type === 'success') icon = '<span class="notify-icon">✅</span>';
  else if (type === 'error') icon = '<span class="notify-icon">❌</span>';
  else icon = '<span class="notify-icon">ℹ️</span>';
  el.innerHTML = `${icon}<span>${message || ''}</span>`;
  container.appendChild(el);

  // animate in
  requestAnimationFrame(() => el.classList.add('show'));

  // remove after timeout
  const tid = setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => {
      try { container.removeChild(el); } catch (e) {}
      if (container && container.children.length === 0) {
        try { container.parentNode.removeChild(container); } catch (e) {}
      }
    }, 260);
    clearTimeout(tid);
  }, timeout);
}
