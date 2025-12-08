import React, { useState, useEffect } from 'react';
// Added ChevronDown/Up for the collapsible menu
import { LogOut, User as UserIcon, Lock, Mail, ChevronRight, Clock as ClockIcon, BookOpen, ChevronDown, ChevronUp } from 'lucide-react';
import ManualModal from './ManualModal'; 

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
  
  const initialPaymentStatus = localStorage.getItem('payment_status') || 'trial';
  const initialDaysLeft = localStorage.getItem('days_left') || '14';

  const [isAuthenticated, setIsAuthenticated] = useState(!!initialToken);
  const [user, setUser] = useState(initialUsername || 'Guest');
  const [paymentStatus, setPaymentStatus] = useState(initialPaymentStatus);
  const [daysLeft, setDaysLeft] = useState(initialDaysLeft);

  const [showManual, setShowManual] = useState(false);
  
  // --- RESPONSIVE STATES ---
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [isHeaderOpen, setIsHeaderOpen] = useState(false); // Controls the collapsible header

  const [isLoginView, setIsLoginView] = useState(true); 
  const [usernameInput, setUsernameInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const API_BASE_URL = '/api'; 

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
  
  // --- RENDER FOR AUTHENTICATED USERS ---
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
        {/* MANUAL MODAL */}
        {showManual && <ManualModal onClose={() => setShowManual(false)} />}

        {/* HEADER CONTAINER */}
        <div 
          style={{ 
            backgroundColor: '#2d2d2d', 
            color: '#d1d4dc',
            flexShrink: 0, 
            boxShadow: '0 2px 5px rgba(0,0,0,0.3)',
            // Transition for smooth sliding on mobile
            transition: 'all 0.3s ease-in-out',
            overflow: 'hidden',
            borderBottom: '1px solid #444'
          }}
        >
          {/* PRIMARY BAR (Always Visible) */}
          <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              padding: isMobile ? '8px 10px' : '5px 15px',
              height: isMobile ? '45px' : '50px'
          }}>
             {/* LEFT: Title */}
            <div style={{ display: 'flex', alignItems: 'center' }}>
                <h1 style={{ color: '#d1d4dc', fontSize: isMobile ? '1.1rem' : '1.2rem', margin: 0, fontWeight: 'bold' }}>
                    {isMobile ? 'SSA TP 3.1' : 'SSA Trading Platform 3.1'}
                </h1>

                {/* Desktop: Manual Button next to title */}
                {!isMobile && (
                    <button
                        onClick={() => setShowManual(true)}
                        style={{
                            background: 'none',
                            border: '1px solid #555',
                            borderRadius: '4px',
                            color: '#d1d4dc',
                            padding: '4px 8px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            fontSize: '0.9rem',
                            marginLeft: '15px'
                        }}
                    >
                        <BookOpen size={16} style={{ marginRight: '5px' }}/>
                        Manual
                    </button>
                )}
            </div>

            {/* CENTER: Clock (Desktop) or Trial (Mobile) */}
            {isMobile ? (
                 paymentStatus !== 'active' && (
                    <div style={{
                        fontSize: '11px',
                        fontWeight: 'bold',
                        color: parseInt(daysLeft) <= 3 ? '#ff5252' : '#ffab00',
                        border: `1px solid ${parseInt(daysLeft) <= 3 ? '#ff5252' : '#ffab00'}`,
                        padding: '1px 6px',
                        borderRadius: '4px',
                        margin: '0 10px'
                    }}>
                        {daysLeft}d Left
                    </div>
                 )
            ) : (
                <Clock />
            )}

            {/* RIGHT: Desktop Profile OR Mobile Toggle */}
            {isMobile ? (
                // --- MOBILE TOGGLE BUTTON ---
                <button 
                    onClick={() => setIsHeaderOpen(!isHeaderOpen)}
                    style={{ background: 'none', border: 'none', color: '#d1d4dc', padding: '5px' }}
                >
                    {isHeaderOpen ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
                </button>
            ) : (
                // --- DESKTOP PROFILE ---
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    {paymentStatus !== 'active' && (
                        <div style={{
                            fontSize: '13px', fontWeight: 'bold',
                            color: parseInt(daysLeft) <= 3 ? '#ff5252' : '#ffab00',
                            border: `1px solid ${parseInt(daysLeft) <= 3 ? '#ff5252' : '#ffab00'}`,
                            padding: '2px 8px', borderRadius: '4px',
                        }}>
                            Trial: {daysLeft} Days
                        </div>
                    )}
                    <div className="flex items-center" style={{ background: '#444', padding: '3px 8px', borderRadius: '8px' }}>
                        <span className="text-sm font-medium mr-2" style={{color:'white'}}>
                            <UserIcon className="inline w-4 h-4 mr-1 text-teal-400" />
                            {user}
                        </span>
                        <button onClick={handleLogout} className="p-1 text-gray-400 hover:text-red-400">
                            <LogOut className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            )}
          </div>

          {/* SECONDARY BAR (Mobile Only - Collapsible) */}
          {isMobile && isHeaderOpen && (
              <div style={{ 
                  padding: '10px', 
                  backgroundColor: '#252525', 
                  borderTop: '1px solid #333',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  animation: 'slideDown 0.2s ease-out'
              }}>
                  {/* Manual Button */}
                  <button
                    onClick={() => { setShowManual(true); setIsHeaderOpen(false); }}
                    style={{
                        background: '#333', border: 'none', borderRadius: '4px',
                        color: '#d1d4dc', padding: '6px 12px', fontSize: '0.9rem',
                        display: 'flex', alignItems: 'center'
                    }}
                  >
                     <BookOpen size={16} style={{ marginRight: '5px' }}/>
                     Manual
                  </button>

                  {/* User & Logout */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '0.9rem', color: '#aaa' }}>{user}</span>
                      <button 
                        onClick={handleLogout}
                        style={{ 
                            background: '#4a2222', color: '#ffaaaa', border: 'none',
                            padding: '6px 12px', borderRadius: '4px', display: 'flex', alignItems: 'center'
                        }}
                      >
                          <LogOut size={16} style={{ marginRight: '5px' }} />
                          Logout
                      </button>
                  </div>
              </div>
          )}
        </div>
        
        <div style={{ flexGrow: 1 }}>
            {children}
        </div>
      </div>
    );
  }

  // --- RENDER FOR LOGIN/REGISTER VIEW (Unchanged) ---
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
          <AuthInput type="text" placeholder="Username" value={usernameInput} onChange={(e) => setUsernameInput(e.target.value)} Icon={UserIcon} onKeyDown={handleKeyDown} />
          {!isLoginView && ( <AuthInput type="email" placeholder="Email" value={emailInput} onChange={(e) => setEmailInput(e.target.value)} Icon={Mail} onKeyDown={handleKeyDown} /> )}
          <AuthInput type="password" placeholder="Password" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} Icon={Lock} onKeyDown={handleKeyDown} />

          {error && (
            <div style={{ color: '#ff5252', fontSize: '13px', textAlign: 'center', marginBottom: '15px', background: 'rgba(255, 0, 0, 0.1)', padding: '10px', borderRadius: '5px', border: '1px solid #ff5252' }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={isLoading} className={`w-full py-3 text-lg font-semibold rounded-lg transition duration-200 shadow-lg ${isLoading ? 'bg-teal-700/50 cursor-not-allowed' : 'bg-teal-600 hover:bg-teal-500 text-white'}`}>
            {isLoading ? 'Loading...' : (isLoginView ? 'Login' : 'Register Account')}
          </button>
        </form>
        
        <button onClick={handleSwitchView} className="w-full mt-4 text-sm text-teal-400 hover:text-teal-300 transition-colors flex items-center justify-center">
          {isLoginView ? 'Need an account?' : 'Already registered?'} 
          <span className="font-semibold ml-1">{isLoginView ? 'Register' : 'Login'}</span>
          <ChevronRight className="w-4 h-4 ml-1" />
        </button>
      </div>
    </div>
  );
};

export default AuthForm;