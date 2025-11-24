import React, { useState, useEffect } from 'react';
import { LogOut, User as UserIcon, Lock, Mail, ChevronRight } from 'lucide-react';

// Custom input component for consistent styling
// MOVED OUTSIDE to prevent re-rendering and focus loss on every keystroke
const AuthInput = ({ type, placeholder, value, onChange, Icon, onKeyDown }) => (
  <div className="relative mb-4">
    <Icon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      className="w-full pl-10 pr-4 py-3 text-white bg-gray-700 border border-gray-600 rounded-lg focus:ring-teal-500 focus:border-teal-500 outline-none transition duration-150"
      onKeyDown={onKeyDown} // Handle 'Enter' key press via prop
    />
  </div>
);

const AuthForm = ({ children }) => {
  // Check for JWT token on component mount
  const initialToken = localStorage.getItem('access_token');
  const initialUsername = localStorage.getItem('username');
  
  const [isAuthenticated, setIsAuthenticated] = useState(!!initialToken);
  const [user, setUser] = useState(initialUsername || 'Guest');
  const [isLoginView, setIsLoginView] = useState(true); // true for Login, false for Register
  const [usernameInput, setUsernameInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // NOTE: This URL should match the running Flask server's address
  const API_BASE_URL = 'http://192.168.1.119:5000/api'; 

  // Function to handle both Login and Registration submission
  const handleSubmit = async (e) => {
    // Prevent default form submission or handle synthetic event if called from onKeyDown
    if (e) {
      e.preventDefault();
    }
    
    setError('');
    setIsLoading(true);

    const endpoint = isLoginView ? 'login' : 'register';
    const payload = isLoginView 
      ? { username: usernameInput, password: passwordInput }
      : { username: usernameInput, email: emailInput, password: passwordInput };
      
    try {
        const response = await fetch(`${API_BASE_URL}/${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (response.ok) {
            if (isLoginView) {
                // Successful login: Store token and grant access
                localStorage.setItem('access_token', data.access_token);
                localStorage.setItem('username', data.username);
                setIsAuthenticated(true);
                setUser(data.username);
                // Clear inputs
                setUsernameInput('');
                setPasswordInput('');
            } else {
                // Successful registration: Switch to login view
                alert('Registration successful! Please log in with your new account.'); 
                setIsLoginView(true);
                // Pre-fill username for convenience
                setUsernameInput(usernameInput); 
                setEmailInput('');
                setPasswordInput('');
            }
        } else {
            // Error handling
            setError(data.msg || `Server error during ${endpoint}.`);
            setPasswordInput(''); // Clear password on error
        }
    } catch (err) {
        console.error("Authentication error:", err);
        setError('Could not connect to the authentication server.');
    } finally {
        setIsLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('username');
    setIsAuthenticated(false);
    setUser('Guest');
  };

  const handleSwitchView = () => {
    setIsLoginView(!isLoginView);
    setError('');
    setUsernameInput('');
    setEmailInput('');
    setPasswordInput('');
  };
  
  // Create a reusable key down handler to trigger submission on Enter key press
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSubmit(); // Call handleSubmit without the full event object
    }
  };
  

  // If authenticated, render the main application content
  if (isAuthenticated) {
    return (
      <div 
        className="AppWrapper" 
        style={{ 
            height: '100dvh', 
            display: 'flex', 
            flexDirection: 'column', 
            backgroundColor: '#1a1a1a' // Match global background
        }}
      >
        {/* NEW COMBINED HEADER */}
        <div 
          style={{ 
            backgroundColor: '#2d2d2d', 
            padding: '5px 15px', 
            display: 'flex', 
            justifyContent: 'space-between', // Align title left, user info right
            alignItems: 'center',
            color: '#d1d4dc',
            flexShrink: 0, 
            boxShadow: '0 2px 5px rgba(0,0,0,0.3)',
            height: '50px' // ADDED FIXED HEIGHT
          }}
        >
          {/* 1. App Title */}
          <h1 style={{ 
             color: '#d1d4dc', 
             fontSize: '1.2rem',
             margin: 0 
           }}>
           SSA Trading Platform
          </h1>

          {/* 2. User Info Badge and Logout */}
          <div 
            className="flex items-center gap-2"
            style={{ 
                background: '#444', 
                padding: '3px 8px', 
                borderRadius: '8px' 
            }}
          >
            <span className="text-sm font-medium" style={{color:'white'}}>
              <UserIcon className="inline w-4 h-4 mr-1 text-teal-400" />
              {user}
            </span>
            <button 
              onClick={handleLogout} 
              className="p-1 text-gray-400 hover:text-red-400 transition-colors"
              title="Logout"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
        
        {/* Render the rest of the application content below the header */}
        {/* This div allows the rest of the App.js content to scroll if needed */}
        <div style={{ flexGrow: 1 }}>
            {children}
        </div>
      </div>
    );
  }

  // Otherwise, show the authentication prompt (remains the same)
  return (
    <div className="fixed inset-0 bg-gray-900 flex justify-center items-center z-[100]">
      <div className="bg-gray-800 p-8 rounded-xl shadow-[0_0_40px_rgba(0,0,0,0.5)] max-w-sm w-full border border-gray-700">
        
        {/* FIX 1: Added inline style to guarantee text color is white/visible immediately */}
        <h2 
          className="text-3xl font-bold text-white text-center mb-2"
          style={{ color: 'white' }}
        >
          {isLoginView ? 'Welcome Back' : 'Join Platform'}
        </h2>
        
        {/* FIX 2: Added inline style to guarantee subheading text is light/visible immediately */}
        <p 
          className="text-gray-400 text-center mb-8 text-sm"
          style={{ color: '#ccc' }}
        >
          {isLoginView ? 'Sign in to access the SSA Trading Platform' : 'Create your secure account'}
        </p>

        <form onSubmit={handleSubmit}>
          
          <AuthInput
            type="text"
            placeholder="Username"
            value={usernameInput}
            onChange={(e) => setUsernameInput(e.target.value)}
            Icon={UserIcon}
            onKeyDown={handleKeyDown} 
          />

          {!isLoginView && (
            <AuthInput
              type="email"
              placeholder="Email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              Icon={Mail}
              onKeyDown={handleKeyDown} 
            />
          )}

          <AuthInput
            type="password"
            placeholder="Password"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            Icon={Lock}
            onKeyDown={handleKeyDown} 
          />

          {error && (
            <p className="text-red-400 text-sm text-center mb-4" style={{color:'red'}}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className={`w-full py-3 text-lg font-semibold rounded-lg transition duration-200 shadow-lg 
              ${isLoading ? 'bg-teal-700/50 cursor-not-allowed' : 'bg-teal-600 hover:bg-teal-500 text-white'}`}
          >
            {isLoading 
              ? <svg className="animate-spin h-5 w-5 mr-3 text-white inline" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
              : (isLoginView ? 'Login' : 'Register Account')}
          </button>
        </form>
        
        <button 
          onClick={handleSwitchView}
          className="w-full mt-4 text-sm text-teal-400 hover:text-teal-300 transition-colors flex items-center justify-center"
        >
          {isLoginView ? 'Need an account?' : 'Already registered?'} 
          <span className="font-semibold ml-1">{isLoginView ? 'Register' : 'Login'}</span>
          <ChevronRight className="w-4 h-4 ml-1" />
        </button>
      </div>
    </div>
  );
};

export default AuthForm;