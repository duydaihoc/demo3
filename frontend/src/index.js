import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { API_BASE_URL } from './config/api';

// Global fetch interceptor - tự động thay thế localhost:5000 với API_BASE_URL
// Giải pháp tập trung, không cần sửa code trong các file khác
const originalFetch = window.fetch;
window.fetch = function(url, options = {}) {
  let newUrl = url;
  
  // Xử lý nếu url là string
  if (typeof url === 'string' && url.includes('localhost:5000')) {
    const baseUrl = API_BASE_URL.endsWith('/api') 
      ? API_BASE_URL 
      : `${API_BASE_URL}/api`;
    
    // Replace http://localhost:5000/api/... hoặc https://localhost:5000/api/... với baseUrl/...
    newUrl = url.replace(/https?:\/\/localhost:5000\/api\//g, `${baseUrl}/`);
    newUrl = newUrl.replace(/https?:\/\/localhost:5000\/api$/g, baseUrl);
    // Replace localhost:5000 (không có /api) với API_BASE_URL
    newUrl = newUrl.replace(/https?:\/\/localhost:5000/g, API_BASE_URL);
    
    if (newUrl !== url) {
      console.log('🔄 Fetch URL replaced:', url, '->', newUrl);
    }
  }
  // Xử lý nếu url là Request object
  else if (url instanceof Request) {
    const requestUrl = url.url;
    if (requestUrl.includes('localhost:5000')) {
      const baseUrl = API_BASE_URL.endsWith('/api') 
        ? API_BASE_URL 
        : `${API_BASE_URL}/api`;
      
      let newRequestUrl = requestUrl.replace(/https?:\/\/localhost:5000\/api\//g, `${baseUrl}/`);
      newRequestUrl = newRequestUrl.replace(/https?:\/\/localhost:5000\/api$/g, baseUrl);
      newRequestUrl = newRequestUrl.replace(/https?:\/\/localhost:5000/g, API_BASE_URL);
      
      if (newRequestUrl !== requestUrl) {
        console.log('🔄 Request URL replaced:', requestUrl, '->', newRequestUrl);
        // Tạo Request mới với URL đã thay đổi
        newUrl = new Request(newRequestUrl, {
          method: url.method,
          headers: url.headers,
          body: url.body,
          mode: url.mode,
          credentials: url.credentials,
          cache: url.cache,
          redirect: url.redirect,
          referrer: url.referrer,
          integrity: url.integrity
        });
      }
    }
  }
  
  // Gọi fetch gốc với URL đã được thay thế
  return originalFetch.call(this, newUrl, options);
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
