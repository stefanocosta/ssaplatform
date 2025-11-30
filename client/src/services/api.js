import axios from 'axios'; 

// Define the base URL for your Flask API.
const API_BASE_URL = '/api'; 
console.log("API Base URL defined as:", API_BASE_URL); 

// --- Create Axios Instance with Interceptors ---
const api = axios.create({
    baseURL: API_BASE_URL,
    timeout: 30000,
    headers: {
        'Content-Type': 'application/json',
    }
});

// 1. Request Interceptor: Attach the current token to every request
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('access_token');
        if (token) {
            config.headers['Authorization'] = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// 2. Response Interceptor: Check for NEW token in headers (Sliding Session)
api.interceptors.response.use(
    (response) => {
        // Check if the server sent a refreshed token
        const newToken = response.headers['x-access-token'];
        if (newToken) {
            console.log("Session refreshed: New token received");
            localStorage.setItem('access_token', newToken);
        }
        return response;
    },
    (error) => {
        // Handle session expiration (401)
        if (error.response && error.response.status === 401) {
            console.warn("Session expired. Logging out.");
            // Only clear if it's truly an auth error, not just a bad request
            if (!window.location.pathname.includes('/login')) {
                 localStorage.removeItem('access_token');
                 // Ideally dispatch a logout action or redirect here, 
                 // but throwing the error allows the UI to handle it (e.g. show message)
            }
        }
        return Promise.reject(error);
    }
);


/**
 * Fetches chart data (OHLC + SSA components) from the backend API.
 * Uses the configured axios instance to handle tokens automatically.
 */
export const getChartData = async (symbol, interval, l, adaptive_l) => {
  console.log(`Attempting to GET: ${API_BASE_URL}/chart-data with params:`, { symbol, interval, l, adaptive_l });
  
  try {
    // Use the 'api' instance, not raw 'axios'
    const response = await api.get('/chart-data', {
      params: {
         symbol: symbol,
         interval: interval,
         l: l,
         adaptive_l: adaptive_l
      }
    });

    // Check if the response structure looks okay before returning
    if (response.data && response.data.ohlc && response.data.ssa) {
       console.log(`API Call Success: Received ${response.data.ohlc.length} OHLC points.`);
       return response.data; 
    } else {
       console.error("API Call Error: Invalid data structure received", response.data);
       throw new Error("Invalid data structure received from server.");
    }

  } catch (error) {
    // Log detailed error information
    if (error.response) {
      if (error.response.status === 401) {
        console.error("API Call Error: Token expired or invalid (401)");
        throw new Error("Your session has expired. Please log in again.");
      }
      console.error("API Call Error:", error.response.status, error.response.data);
      throw new Error(error.response.data.error || error.response.data.msg || `Server responded with status ${error.response.status}`);
      
    } else if (error.request) {
      console.error("API Call Error: No response received", error.request);
      throw new Error("Could not connect to the server. Is it running?");
    } else {
      console.error('API Call Error:', error.message);
      throw new Error(`Error setting up API request: ${error.message}`);
    }
  }
};

/**
 * Sends a request to change the password for the currently logged-in user.
 */
export const changePassword = async (newPassword) => {
    try {
        // Use the 'api' instance
        const response = await api.post('/change-password', { new_password: newPassword });

        if (response.status !== 200) {
            throw new Error(response.data.msg || `Server responded with status ${response.status}`);
        }
        return response.data;

    } catch (error) {
        if (error.response) {
            if (error.response.status === 401) {
              throw new Error("Your session has expired. Please log in again.");
            }
            throw new Error(error.response.data.msg || `Server responded with status ${error.response.status}`);
        }
        throw new Error(`Error setting up API request: ${error.message}`);
    }
};

export default api;