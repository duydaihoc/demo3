export function showNotification(message, type = 'success', timeout = 4000) {
  if (typeof document === 'undefined') return;
  // inject styles once
  if (!document.getElementById('global-notify-styles')) {
    const style = document.createElement('style');
    style.id = 'global-notify-styles';
    style.innerHTML = `
      .global-notification-wrapper { 
        position: fixed; 
        top: 24px; 
        right: 24px; 
        z-index: 99999; 
        display: flex; 
        flex-direction: column-reverse; 
        gap: 12px; 
        pointer-events: none; 
        max-width: 420px; 
      }
      .global-notification { 
        pointer-events: auto; 
        min-width: 300px; 
        max-width: 92vw; 
        padding: 18px 24px; 
        border-radius: 16px; 
        color: #fff; 
        font-weight: 600; 
        box-shadow: 0 12px 40px rgba(15, 23, 42, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.15); 
        opacity: 0; 
        transform: translateX(30px) scale(0.9); 
        transition: all 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55); 
        display: flex; 
        align-items: center; 
        gap: 14px; 
        font-size: 15px; 
        backdrop-filter: blur(20px); 
        -webkit-backdrop-filter: blur(20px); 
        border: 1px solid rgba(255, 255, 255, 0.2);
        position: relative;
        overflow: hidden;
      }
      .global-notification::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        height: 3px;
        background: rgba(255, 255, 255, 0.4);
        width: 100%;
        transform-origin: left;
        animation: notification-progress var(--progress-duration, 4000ms) linear forwards;
      }
      @keyframes notification-progress {
        from { transform: scaleX(1); }
        to { transform: scaleX(0); }
      }
      .global-notification.show { 
        opacity: 1; 
        transform: translateX(0) scale(1); 
      }
      .global-notification.success { 
        background: linear-gradient(135deg, rgba(16, 185, 129, 0.95) 0%, rgba(5, 150, 105, 0.95) 100%); 
        border: 1px solid rgba(16, 185, 129, 0.4); 
      }
      .global-notification.error { 
        background: linear-gradient(135deg, rgba(239, 68, 68, 0.95) 0%, rgba(220, 38, 38, 0.95) 100%); 
        border: 1px solid rgba(239, 68, 68, 0.4); 
      }
      .global-notification.info { 
        background: linear-gradient(135deg, rgba(42, 82, 152, 0.95) 0%, rgba(78, 205, 196, 0.95) 100%); 
        border: 1px solid rgba(42, 82, 152, 0.4); 
      }
      .global-notification .notify-icon { 
        font-size: 26px; 
        flex-shrink: 0; 
        opacity: 1; 
        filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.3)); 
        animation: icon-bounce 0.6s ease-out;
      }
      @keyframes icon-bounce {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.2); }
      }
      .global-notification:hover {
        transform: translateX(0) scale(1.02);
        box-shadow: 0 16px 48px rgba(15, 23, 42, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.2);
      }
      @media (max-width: 768px) {
        .global-notification-wrapper { 
          top: 16px; 
          right: 16px; 
          left: 16px; 
          max-width: none; 
        }
        .global-notification { 
          min-width: auto; 
          width: 100%; 
          padding: 16px 20px;
        }
      }
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
  
  // Set animation duration for progress bar
  el.style.setProperty('--progress-duration', `${timeout}ms`);
  
  // Display message without icon
  el.innerHTML = `<span>${message || ''}</span>`;
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
