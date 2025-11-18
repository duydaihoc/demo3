// API Configuration
// Supports environment variables for different deployment scenarios
// - REACT_APP_API_URL: Full API base URL (e.g., http://localhost:5000 or https://dxjtkv16-5000.asse.devtunnels.ms)
// - REACT_APP_API_PORT: Backend port (defaults to 5000) - only used if REACT_APP_API_URL is not set
// 
// For port forwarding/dev tunnels:
// Set REACT_APP_API_URL to your backend tunnel URL (e.g., https://dxjtkv16-5000.asse.devtunnels.ms)
// In frontend/.env or frontend/.env.local, add:
// REACT_APP_API_URL=https://dxjtkv16-5000.asse.devtunnels.ms

const getApiUrl = () => {
  // Priority 1: Use REACT_APP_API_URL if set (full URL including protocol and host)
  // This is the recommended way for port forwarding/dev tunnels
  if (process.env.REACT_APP_API_URL) {
    console.log('🔗 Using API URL from env:', process.env.REACT_APP_API_URL);
    return process.env.REACT_APP_API_URL;
  }

  // Priority 2: If running on dev tunnel, try to infer backend URL
  // Frontend: dxjtkv16-3000.asse.devtunnels.ms -> Backend: dxjtkv16-5000.asse.devtunnels.ms
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname.includes('devtunnels.ms') || hostname.includes('asse.devtunnels.ms')) {
      // Try to infer backend URL from frontend URL
      // Replace port 3000 with 5000 or replace tunnel ID segment
      const backendUrl = hostname.replace('-3000', '-5000').replace(':3000', ':5000');
      const protocol = window.location.protocol;
      const inferredUrl = `${protocol}//${backendUrl}`;
      console.log('🔗 Inferred backend URL from dev tunnel:', inferredUrl);
      return inferredUrl;
    }
  }

  // Priority 3: Default to localhost:5000 for development
  // Port can be customized via REACT_APP_API_PORT
  const port = process.env.REACT_APP_API_PORT || '5000';
  const defaultUrl = `http://localhost:${port}`;
  console.log('🔗 Using default API URL:', defaultUrl);
  return defaultUrl;
};

export const API_BASE_URL = getApiUrl();

// Helper function to build full API endpoint URL
export const apiUrl = (endpoint) => {
  // Remove leading slash if present to avoid double slashes
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
  
  // Build base URL - handle both cases where API_BASE_URL includes /api or not
  let base = API_BASE_URL;
  if (!base.endsWith('/api')) {
    base = `${base}/api`;
  }
  
  // Ensure no double slashes
  return `${base}/${cleanEndpoint}`.replace(/([^:]\/)\/+/g, '$1');
};

export default API_BASE_URL;

