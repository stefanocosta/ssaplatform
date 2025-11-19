import React, { useState, useEffect } from 'react';

const PasswordProtection = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  // The password you want to use - change this!
  const CORRECT_PASSWORD = 'SSA31415';

  // Check if user was previously authenticated (stored in sessionStorage)
  useEffect(() => {
    const authStatus = sessionStorage.getItem('isAuthenticated');
    if (authStatus === 'true') {
      setIsAuthenticated(true);
    }
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (password === CORRECT_PASSWORD) {
      setIsAuthenticated(true);
      sessionStorage.setItem('isAuthenticated', 'true');
      setError('');
    } else {
      setError('Incorrect password. Please try again.');
      setPassword('');
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSubmit(e);
    }
  };

  // If authenticated, show the app
  if (isAuthenticated) {
    return <>{children}</>;
  }

  // Otherwise, show password prompt
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      backgroundColor: '#1a1a1a',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 9999
    }}>
      <div style={{
        backgroundColor: '#2d2d2d',
        padding: '40px',
        borderRadius: '10px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
        maxWidth: '400px',
        width: '90%'
      }}>
        <h2 style={{
          color: '#d1d4dc',
          textAlign: 'center',
          marginBottom: '10px',
          fontSize: '1.5rem'
        }}>
          SSA Trading Platform
        </h2>
        
        <p style={{
          color: '#888',
          textAlign: 'center',
          marginBottom: '30px',
          fontSize: '0.9rem'
        }}>
          Please enter the password to continue
        </p>

        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Enter password"
            autoFocus
            style={{
              width: '100%',
              padding: '12px',
              fontSize: '16px',
              backgroundColor: '#3c3c3c',
              color: 'white',
              border: error ? '2px solid #ef5350' : '1px solid #555',
              borderRadius: '5px',
              marginBottom: '15px',
              boxSizing: 'border-box',
              outline: 'none'
            }}
          />

          {error && (
            <p style={{
              color: '#ef5350',
              fontSize: '0.85rem',
              marginBottom: '15px',
              textAlign: 'center'
            }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            style={{
              width: '100%',
              padding: '12px',
              fontSize: '16px',
              backgroundColor: '#26a69a',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
              fontWeight: 'bold',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#2bbbad'}
            onMouseLeave={(e) => e.target.style.backgroundColor = '#26a69a'}
          >
            Enter
          </button>
        </form>
      </div>
    </div>
  );
};

export default PasswordProtection;