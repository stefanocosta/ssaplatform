import React, { useState, useEffect } from 'react';
import { LogOut, User as UserIcon, Lock, Mail, ChevronRight, Clock as ClockIcon } from 'lucide-react';

// ================================================================== //
// CLOCK COMPONENT 
// ================================================================== //
const Clock = () => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (date) => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const d = days[date.getDay()];
    const dayNum = date.getDate(); 
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    const s = String(date.getSeconds()).padStart(2, '0');
    return `${d} ${dayNum}, ${h}:${m}:${s}`;
  };

  return (
    <div style={{ 
      fontFamily: 'monospace', 
      fontSize: '16px', 
      color: '#00bcd4', 
      fontWeight: 'bold',
      letterSpacing: '1px'
    }}>
      {formatTime(time)}
    </div>
  );
};

// ================================================================== //
// AUTH INPUT COMPONENT
// ================================================================== //
const AuthInput = ({ type, placeholder, value, onChange, Icon, onKeyDown }) => (
  <div className="relative mb-4">
    <Icon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      className="w-full pl-10 pr-4 py-3 text-white bg-gray-700 border border-gray-600 rounded-lg focus:ring-teal-500 focus:border-teal-500 outline-none transition duration-150"
      onKeyDown={onKeyDown} 
    />
  </div>
);

// ================================================================== //
// MAIN AUTH FORM COMPONENT
// ================================================================== //
const AuthForm = ({ children }) => {
  const initialToken = localStorage.getItem('access_token');
  const initialUsername = localStorage.getItem('username');
  
  // Retrieve saved payment/trial status
  const initialPaymentStatus = localStorage.getItem('payment_status') || 'trial';
  const initialDaysLeft = localStorage.getItem('days_left') || '14';

  const [isAuthenticated, setIsAuthenticated] = useState(!!initialToken);
  const [user, setUser] = useState(initialUsername || 'Guest');
  const [paymentStatus, setPaymentStatus] = useState(initialPaymentStatus);
  const [daysLeft, setDaysLeft] = useState(initialDaysLeft);

  const [isLoginView, setIsLoginView] = useState(true); 
  const [usernameInput, setUsernameInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const API_BASE_URL = '/api'; 

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    
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
                localStorage.setItem('access_token', data.access_token);
                localStorage.setItem('username', data.username);
                
                // SAVE TRIAL DATA
                localStorage.setItem('payment_status', data.payment_status);
                localStorage.setItem('days_left', data.days_left);
                setPaymentStatus(data.payment_status);
                setDaysLeft(data.days_left);

                setIsAuthenticated(true);
                setUser(data.username);
                setUsernameInput('');
                setPasswordInput('');
            } else {
                alert('Registration successful! Please log in with your new account.'); 
                setIsLoginView(true);
                setUsernameInput(usernameInput); 
                setEmailInput('');
                setPasswordInput('');
            }
        } else {
            setError(data.msg || `Server error during ${endpoint}.`);
            setPasswordInput(''); 
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
    localStorage.removeItem('payment_status');
    localStorage.removeItem('days_left');
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
  
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSubmit();
  };
  
  if (isAuthenticated) {
    return (
      <div 
        className="AppWrapper" 
        style={{ 
            height: '100dvh', 
            display: 'flex', 
            flexDirection: 'column', 
            backgroundColor: '#1a1a1a' 
        }}
      >
        {/* HEADER */}
        <div 
          style={{ 
            backgroundColor: '#2d2d2d', 
            padding: '5px 15px', 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            color: '#d1d4dc',
            flexShrink: 0, 
            boxShadow: '0 2px 5px rgba(0,0,0,0.3)',
            height: '50px' 
          }}
        >
          <h1 style={{ color: '#d1d4dc', fontSize: '1.2rem', margin: 0 }}>
           SSA Platform 2.1
          </h1>

          {/* --- TRIAL COUNTDOWN BADGE --- */}
          {paymentStatus !== 'active' && (
             <div style={{
                 display: 'flex', 
                 alignItems: 'center',
                 fontSize: '13px',
                 fontWeight: 'bold',
                 color: parseInt(daysLeft) <= 3 ? '#ff5252' : '#ffab00', // Red if <= 3 days, else Orange
                 border: `1px solid ${parseInt(daysLeft) <= 3 ? '#ff5252' : '#ffab00'}`,
                 padding: '2px 8px',
                 borderRadius: '4px',
                 marginLeft: 'auto',
                 marginRight: '20px'
             }}>
                 <ClockIcon size={14} style={{marginRight: '5px'}}/>
                 Trial: {daysLeft} Days Left
             </div>
          )}

          <Clock />

          <div 
            className="flex items-center gap-2"
            style={{ 
                background: '#444', 
                padding: '3px 8px', 
                borderRadius: '8px',
                marginLeft: '15px'
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
        
        <div style={{ flexGrow: 1 }}>
            {children}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-gray-900 flex justify-center items-center z-[100]">
      <div className="bg-gray-800 p-8 rounded-xl shadow-[0_0_40px_rgba(0,0,0,0.5)] max-w-sm w-full border border-gray-700">
        
        <h2 className="text-3xl font-bold text-white text-center mb-2" style={{ color: 'white' }}>
          {isLoginView ? 'Welcome Back' : 'Join Platform'}
        </h2>
        
        <p className="text-gray-400 text-center mb-8 text-sm" style={{ color: '#ccc' }}>
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
            <div style={{
                color: '#ff5252', 
                fontSize: '13px', 
                textAlign: 'center', 
                marginBottom: '15px', 
                background: 'rgba(255, 0, 0, 0.1)', 
                padding: '10px', 
                borderRadius: '5px',
                border: '1px solid #ff5252'
            }}>
              {error}
            </div>
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