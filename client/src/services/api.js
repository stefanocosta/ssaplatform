import axios from 'axios'; // Using axios for making HTTP requests

// Define the base URL for your Flask API.
// Note: Using a relative path '/api' is good if the React app is served from Flask
// but if you are running them separately (e.g., React on 4000, Flask on 5000), 
// you might need to use the absolute URL like 'http://127.0.0.1:5000/api'.
// For this fix, let's assume you've configured a proxy or are using an absolute path 
// if running on separate ports. We will revert the constant to the absolute path 
// that matches your log output to ensure connectivity.

// Since your logs show the client is contacting http://127.0.0.1:5000, 
// let's use the explicit absolute URL for reliability during development.
//const API_BASE_URL = 'http://127.0.0.1:5000/api'; 
const API_BASE_URL = 'http://192.168.1.119:5000/api'; 

console.log("API Base URL defined as:", API_BASE_URL); // Verification Log

/**
 * Fetches chart data (OHLC + SSA components) from the backend API.
 * @param {string} symbol - The ticker symbol (e.g., 'BTC/USD').
 * @param {string} interval - The chart interval (e.g., '1day', '1h').
 * @param {number} l - The SSA window parameter L (if not adaptive).
 * @param {boolean} adaptive_l - Whether to use adaptive L calculation on the backend.
 * @returns {Promise<object>} A promise that resolves with the data object from the API.
 * @throws {Error} Throws an error if the fetch fails or the response is invalid.
 */
export const getChartData = async (symbol, interval, l, adaptive_l) => {
  // --- START OF JWT FIX ---

  // 1. Retrieve the token from localStorage
  const token = localStorage.getItem('access_token');

  // 2. Define the headers, including Authorization
  const headers = {
    'Content-Type': 'application/json',
  };
  
  if (token) {
    // 3. Add the JWT token in the 'Bearer <token>' format
    headers['Authorization'] = `Bearer ${token}`;
  } else {
    // Optional: Throw an error if no token is found for a protected route
    console.error("No authentication token found in localStorage.");
    // In a production app, you'd force a redirect to the login page here.
    // We will let the API call fail to show the 401 error message for debugging.
  }
  
  // --- END OF JWT FIX ---

  console.log(`Attempting to GET: ${API_BASE_URL}/chart-data with params:`, { symbol, interval, l, adaptive_l });
  try {
    
    const response = await axios.get(`${API_BASE_URL}/chart-data`, {
      params: {
         symbol: symbol,
         interval: interval,
         l: l,
         adaptive_l: adaptive_l
      },
      headers: headers, // <-- Pass the authorization headers
      timeout: 30000 // Set a timeout (e.g., 30 seconds)
    });

    // Check if the response structure looks okay before returning
    if (response.data && response.data.ohlc && response.data.ssa) {
       console.log(`API Call Success: Received ${response.data.ohlc.length} OHLC points.`);
       return response.data; // Return the data part of the response
    } else {
       console.error("API Call Error: Invalid data structure received", response.data);
       throw new Error("Invalid data structure received from server.");
    }

  } catch (error) {
    // Log detailed error information
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error("API Call Error:", error.response.status, error.response.data);
      // NOTE: This will now catch the 401 and throw the appropriate error message
      throw new Error(error.response.data.error || `Server responded with status ${error.response.status}`);
    } else if (error.request) {
      // The request was made but no response was received
      console.error("API Call Error: No response received", error.request);
      throw new Error("Could not connect to the server. Is it running?");
    } else {
      // Something happened in setting up the request that triggered an Error
      console.error('API Call Error:', error.message);
      throw new Error(`Error setting up API request: ${error.message}`);
    }
  }
};

// --- Add other API functions below later ---
// Example:
// export const loginUser = async (username, password) => { ... };
// export const getWatchlist = async () => { ... };