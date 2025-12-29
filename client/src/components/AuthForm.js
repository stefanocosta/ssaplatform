import React, { useState, useEffect } from 'react';
import { 
  LogOut, User as UserIcon, Lock, Mail, ChevronRight, 
  BookOpen, Key, CheckCircle, XCircle 
} from 'lucide-react';
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
  
  return (
    <div style={{ 
      fontFamily: 'monospace', 
      fontSize: '16px', 
      color: '#00bcd4', 
      fontWeight: 'bold',
      letterSpacing: '1px'
    }}>
      {time.toLocaleTimeString([], { hour12: false })}
    </div>
  );
};

// ================================================================== //
// AUTH INPUT COMPONENT (Reusable)
// ================================================================== //
const AuthInput = ({ type, placeholder, value, onChange, Icon, onKeyDown, isError, isValid }) => (
  <div className="relative w-full group mb-4">
    <Icon className={`absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 transition-colors duration-200 ${isError ? 'text-red-400' : (isValid ? 'text-green-400' : 'text-gray-400 group-focus-within:text-teal-400')}`} />
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      onKeyDown={onKeyDown}
      className={`w-full pl-12 pr-10 py-4 bg-gray-700/50 border rounded-lg text-white placeholder-gray-400 outline-none transition-all duration-200
        ${isError 
            ? 'border-red-500/50 focus:ring-2 focus:ring-red-500/50' 
            : (isValid ? 'border-green-500/50 focus:ring-2 focus:ring-green-500/50' : 'border-gray-600 focus:ring-2 focus:ring-teal-500 focus:border-transparent')
        }
      `}
    />
    {isValid && <CheckCircle className="absolute right-4 top-1/2 transform -translate-y-1/2 w-4 h-4 text-green-500" />}
    {isError && <XCircle className="absolute right-4 top-1/2 transform -translate-y-1/2 w-4 h-4 text-red-500" />}
  </div>
);

// ================================================================== //
// CHANGE PASSWORD MODAL
// ================================================================== //
const ChangePasswordModal = ({ onClose }) => {
  const [oldPass, setOldPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [msg, setMsg] = useState('');
  const [isError, setIsError] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('access_token');
    try {
      const res = await fetch('/api/change-password', {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ old_password: oldPass, new_password: newPass })
      });
      const data = await res.json();
      setMsg(data.msg);
      setIsError(!res.ok);
      if (res.ok) {
        setTimeout(onClose, 1500);
      }
    } catch (err) {
      setMsg('Connection error');
      setIsError(true);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex justify-center items-center z-[110] backdrop-blur-sm p-4">
      <div className="bg-gray-800 p-8 rounded-xl border border-gray-600 w-full max-w-sm shadow-2xl transform transition-all scale-100">
        <h3 className="text-xl text-white font-bold mb-6 flex items-center gap-2 pb-4 border-b border-gray-700">
            <Key size={20} className="text-teal-400"/> Change Password
        </h3>
        
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div>
              <label className="text-xs font-semibold text-gray-400 ml-1 uppercase tracking-wider">Current Password</label>
              <input type="password" value={oldPass} onChange={e=>setOldPass(e.target.value)} 
                className="w-full p-3 mt-1 rounded bg-gray-700 text-white border border-gray-600 focus:border-teal-500 outline-none transition-colors" 
              />
          </div>
          <div>
              <label className="text-xs font-semibold text-gray-400 ml-1 uppercase tracking-wider">New Password</label>
              <input type="password" value={newPass} onChange={e=>setNewPass(e.target.value)} 
                className="w-full p-3 mt-1 rounded bg-gray-700 text-white border border-gray-600 focus:border-teal-500 outline-none transition-colors"
              />
          </div>
          
          {msg && (
            <div className={`text-sm p-3 rounded font-medium ${isError ? 'bg-red-900/30 text-red-300 border border-red-800' : 'bg-green-900/30 text-green-300 border border-green-800'}`}>
                {msg}
            </div>
          )}

          <div className="flex gap-3 mt-4">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 font-medium transition-colors">Cancel</button>
            <button type="submit" className="flex-1 py-2.5 rounded bg-teal-600 text-white hover:bg-teal-500 font-bold shadow-lg shadow-teal-900/50 transition-all">Update</button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ================================================================== //
// MAIN COMPONENT
// ================================================================== //
const AuthForm = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('access_token'));
  const [user, setUser] = useState(localStorage.getItem('username') || 'Guest');
  const [paymentStatus, setPaymentStatus] = useState(localStorage.getItem('payment_status') || 'trial');
  const [daysLeft, setDaysLeft] = useState(localStorage.getItem('days_left') || '14');

  // View States
  const [showManual, setShowManual] = useState(false);
  const [showChangePass, setShowChangePass] = useState(false);
  const [isLoginView, setIsLoginView] = useState(true);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // Form Inputs
  const [usernameInput, setUsernameInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [confirmPassInput, setConfirmPassInput] = useState('');
  
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Derived state for password matching
  const passwordsMatch = !isLoginView && passwordInput && confirmPassInput && (passwordInput === confirmPassInput);
  const passwordsMismatch = !isLoginView && confirmPassInput && (passwordInput !== confirmPassInput);

  const API_BASE_URL = '/api'; 

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setError('');

    // --- Validation ---
    if (!usernameInput || !passwordInput) {
        setError("Please fill in all required fields.");
        return;
    }
    if (!isLoginView) {
        if (!emailInput) { setError("Email is required."); return; }
        if (passwordInput !== confirmPassInput) { setError("Passwords do not match."); return; }
    }

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
                alert('Registration successful! Please log in.'); 
                setIsLoginView(true);
                setPasswordInput('');
                setConfirmPassInput('');
            }
        } else {
            setError(data.msg || `Server error during ${endpoint}.`);
        }
    } catch (err) {
        console.error("Auth Error:", err);
        setError('Could not connect to the server.');
    } finally {
        setIsLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    setIsAuthenticated(false);
    setUser('Guest');
  };

  const handleSwitchView = () => {
    setIsLoginView(!isLoginView);
    setError('');
    setUsernameInput('');
    setEmailInput('');
    setPasswordInput('');
    setConfirmPassInput('');
  };
  
  // --- RENDER: AUTHENTICATED DASHBOARD ---
  if (isAuthenticated) {
    return (
      <div 
        className="AppWrapper" 
        style={{ 
            height: '100dvh', 
            width: '100vw',
            display: 'flex', 
            flexDirection: 'column', 
            backgroundColor: '#1a1a1a',
            overflow: 'hidden'
        }}
      >
        {showManual && <ManualModal onClose={() => setShowManual(false)} />}
        {showChangePass && <ChangePasswordModal onClose={() => setShowChangePass(false)} />}

        {/* HEADER */}
        <div style={{ 
            backgroundColor: '#2d2d2d', 
            color: '#d1d4dc',
            flexShrink: 0, 
            boxShadow: '0 2px 5px rgba(0,0,0,0.3)',
            zIndex: 50,
            borderBottom: '1px solid #444',
            height: '50px' // Enforce height
        }}>
          <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              padding: isMobile ? '0 10px' : '0 15px',
              height: '100%'
          }}>
            
            {/* Left Side: Brand + Manual */}
            <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '8px' : '15px' }}>
                <h1 style={{ color: '#d1d4dc', fontSize: isMobile ? '1rem' : '1.2rem', margin: 0, fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                    {isMobile ? 'SSA TP 5.0' : 'SSA Trading Platform 5.0'}
                </h1>
                
                {/* Manual Button - Text on Desktop, Icon on Mobile */}
                <button 
                    onClick={() => setShowManual(true)} 
                    style={{
                        background: 'transparent',
                        border: isMobile ? 'none' : '1px solid #555',
                        borderRadius: '4px',
                        color: '#bbb',
                        padding: isMobile ? '4px' : '4px 8px',
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: '5px'
                    }}
                    title="Manual"
                >
                    <BookOpen size={isMobile ? 18 : 16} />
                    {!isMobile && "Manual"}
                </button>
            </div>

            {/* Center: Clock (Desktop Only) */}
            {!isMobile && <Clock />}

            {/* Right Side: User Controls (Unified Mobile/Desktop Layout) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '8px' : '15px' }}>
                
                {/* Trial Badge - Compact on Mobile */}
                {paymentStatus !== 'active' && (
                    <div style={{
                        fontSize: '11px', fontWeight: 'bold',
                        color: parseInt(daysLeft) <= 3 ? '#ff5252' : '#ffab00',
                        border: `1px solid ${parseInt(daysLeft) <= 3 ? '#ff5252' : '#ffab00'}`,
                        padding: isMobile ? '2px 4px' : '3px 8px', 
                        borderRadius: '4px',
                        whiteSpace: 'nowrap',
                        lineHeight: '1'
                    }}>
                        {daysLeft}d{isMobile ? '' : ' Left'}
                    </div>
                )}

                {/* User Info & Actions */}
                <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    backgroundColor: isMobile ? 'transparent' : '#444', 
                    padding: isMobile ? '0' : '4px 12px', 
                    borderRadius: '8px',
                    gap: isMobile ? '8px' : '10px'
                }}>
                    
                    {/* Username */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {!isMobile && <UserIcon className="w-4 h-4 text-teal-400" />}
                        <span style={{ fontSize: '0.85rem', fontWeight: '500', color: '#fff' }}>{user}</span>
                    </div>

                    {/* Separator (Desktop Only) */}
                    {!isMobile && <div style={{ width: '1px', height: '14px', backgroundColor: '#666' }}></div>}

                    {/* Password Button */}
                    <button 
                        onClick={() => setShowChangePass(true)} 
                        style={{ 
                            background: 'transparent', border: 'none', 
                            color: '#ccc', cursor: 'pointer', 
                            display: 'flex', alignItems: 'center', gap: '4px',
                            padding: 0
                        }}
                        title="Change Password"
                    >
                         <Key size={16} />
                         {!isMobile && <span style={{fontSize: '12px'}}>Pass</span>}
                    </button>
                    
                    {/* Separator (Desktop Only) */}
                    {!isMobile && <div style={{ width: '1px', height: '14px', backgroundColor: '#666' }}></div>}

                    {/* Logout Button */}
                    <button 
                        onClick={handleLogout} 
                        title="Logout" 
                        style={{ 
                            background: isMobile ? '#4a2222' : 'transparent', // Red bg on mobile icon for visibility
                            border: 'none', 
                            color: isMobile ? '#ffaaaa' : '#ccc', 
                            borderRadius: '4px',
                            padding: isMobile ? '4px' : '0',
                            cursor: 'pointer', display: 'flex', alignItems: 'center' 
                        }}
                        className="hover:text-red-400 transition-colors"
                    >
                        <LogOut size={16} />
                    </button>
                </div>
            </div>

          </div>
        </div>
        
        {/* Main Content Wrapper */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
            {children}
        </div>
      </div>
    );
  }

  // --- RENDER: LOGIN / REGISTER PAGE ---
  return (
    <div className="h-[100vh] w-full flex items-center justify-center bg-gray-900 relative">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
         <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-gray-800 via-gray-900 to-black opacity-80"></div>
         <div className="absolute -top-40 -left-40 w-96 h-96 bg-teal-600/10 rounded-full blur-3xl"></div>
         <div className="absolute bottom-20 right-20 w-80 h-80 bg-blue-600/10 rounded-full blur-3xl"></div>
      </div>

      <div className="w-full max-w-lg p-10 bg-gray-800 border border-gray-700 rounded-2xl shadow-[0_30px_60px_rgba(0,0,0,0.6)] z-10 mx-4 backdrop-blur-sm">
        
        {/* Header Section */}
        <div className="text-center mb-10">
            <h2 className="text-4xl font-bold text-white mb-3 tracking-tight">
            {isLoginView ? 'Welcome Back' : 'Create Account'}
            </h2>
            <p className="text-gray-400 text-base">
            {isLoginView ? 'Access the advanced SSA Trading Platform' : 'Join us and start trading smarter'}
            </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <AuthInput 
            type="text" 
            placeholder="Username" 
            value={usernameInput} 
            onChange={(e) => setUsernameInput(e.target.value)} 
            Icon={UserIcon} 
          />
          
          {!isLoginView && ( 
            <AuthInput 
                type="email" 
                placeholder="Email Address" 
                value={emailInput} 
                onChange={(e) => setEmailInput(e.target.value)} 
                Icon={Mail} 
            /> 
          )}
          
          <AuthInput 
            type="password" 
            placeholder="Password" 
            value={passwordInput} 
            onChange={(e) => setPasswordInput(e.target.value)} 
            Icon={Lock} 
          />

          {!isLoginView && (
             <AuthInput 
                type="password" 
                placeholder="Confirm Password" 
                value={confirmPassInput} 
                onChange={(e) => setConfirmPassInput(e.target.value)} 
                Icon={Lock}
                isError={passwordsMismatch}
                isValid={passwordsMatch}
             />
          )}

          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400 text-sm text-center font-medium animate-pulse">
              {error}
            </div>
          )}

          {/* Action Button */}
          <button 
            type="submit" 
            disabled={isLoading} 
            className={`w-full py-4 mt-4 text-lg font-bold text-white rounded-lg shadow-xl transition-all transform hover:-translate-y-1 active:scale-95 ${
                isLoading 
                ? 'bg-gray-600 cursor-not-allowed' 
                : 'bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-400 hover:shadow-teal-500/25'
            }`}
          >
            {isLoading ? 'Processing...' : (isLoginView ? 'Login to Platform' : 'Create Account')}
          </button>
        </form>
        
        {/* Switch View Footer */}
        <div className="mt-10 pt-8 border-t border-gray-700 flex flex-col items-center gap-3">
            <span className="text-gray-500 text-sm font-medium">
                {isLoginView ? "Don't have an account yet?" : "Already have an account?"}
            </span>
            <button 
                onClick={handleSwitchView} 
                className="px-6 py-2 rounded-full bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white transition-all text-sm font-semibold flex items-center gap-2 group"
            >
                {isLoginView ? 'Register New Account' : 'Back to Login'}
                <ChevronRight className="w-4 h-4 text-teal-400 group-hover:translate-x-1 transition-transform" />
            </button>
        </div>

      </div>
    </div>
  );
};

export default AuthForm;