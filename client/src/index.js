import React from 'react';
import ReactDOM from 'react-dom/client'; // Use client for React 18+
import './index.css'; // Optional: if you have or create this CSS file
import App from './App';
import reportWebVitals from './reportWebVitals'; // Optional: for performance measuring

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
 // <React.StrictMode>
    <App />
 // </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals(); // You might need to create the reportWebVitals.js file if you want this