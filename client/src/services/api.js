import axios from 'axios'; // Using axios for making HTTP requests

// Define the base URL for your Flask API.
// This assumes your Flask server is running on port 5000.
//const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://192.168.1.119:5000/api';
const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';
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
  // Add log inside the function too, just before the request
  console.log(`Attempting to GET: ${API_BASE_URL}/chart-data with params:`, { symbol, interval, l, adaptive_l });
  try {
    // Construct the API endpoint URL with query parameters
    const response = await axios.get(`${API_BASE_URL}/chart-data`, {
      params: {
         symbol: symbol,
         interval: interval,
         l: l,
         adaptive_l: adaptive_l
      },
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
      throw new Error(error.response.data.error || `Server responded with status ${error.response.status}`);
    } else if (error.request) {
      // The request was made but no response was received
      console.error("API Call Error: No response received", error.request);
      // *** This specific error message is the one you were seeing ***
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