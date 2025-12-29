import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'; 
import { Radar, Activity, FlaskConical, X, BellRing, ChevronDown, ChevronUp } from 'lucide-react'; 
import TradingChart from './components/TradingChart';
import AuthForm from './components/AuthForm'; 
import LandingPage from './components/LandingPage'; 
import ScannerModal from './components/ScannerModal'; 
import AnalysisModal from './components/AnalysisModal'; 
import TestModal from './components/TestModal'; 
import MonitorModal from './components/MonitorModal'; 
import './App.css';

// ================================================================== //
// CUSTOM HOOK: IDLE LOGOUT (15 MIN TIMEOUT)
// ================================================================== //
const useIdleLogout = (timeoutMinutes = 30, onLogout) => {
  useEffect(() => {
    let timer;
    
    const resetTimer = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        console.log("User idle for too long. Logging out...");
        onLogout();
      }, timeoutMinutes * 60 * 1000);
    };

    // Events that count as "activity"
    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];
    
    // Attach listeners
    events.forEach(event => document.addEventListener(event, resetTimer));
    
    // Start the timer initially
    resetTimer();

    // Cleanup
    return () => {
      if (timer) clearTimeout(timer);
      events.forEach(event => document.removeEventListener(event, resetTimer));
    };
  }, [timeoutMinutes, onLogout]);
};

// ================================================================== //
// ALERT POPUP COMPONENT
// ================================================================== //
const AlertPopup = ({ alerts, onClose }) => {
    useEffect(() => {
        const timer = setTimeout(() => { onClose(); }, 60000);
        return () => clearTimeout(timer);
    }, [onClose]);

    return (
        <div style={{ position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)', width: '90%', maxWidth: '400px', backgroundColor: '#2d1b1b', border: '2px solid #ff4444', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.8)', zIndex: 9999, padding: '15px', animation: 'fadeIn 0.3s ease-out' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h3 style={{ margin: 0, color: '#ff4444', display: 'flex', alignItems: 'center', gap: '8px' }}><BellRing size={20} /> Market Alert</h3>
                <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                {alerts.map((alert, idx) => (
                    <div key={idx} style={{ padding: '8px 0', borderBottom: idx < alerts.length - 1 ? '1px solid #444' : 'none', color: 'white', fontSize: '1rem' }}>
                        <strong style={{ color: '#ff9800' }}>{alert.symbol}</strong> <span style={{ margin: '0 8px' }}>→</span> <span style={{ fontWeight: 'bold', color: alert.signal === 'BUY' ? '#00e676' : '#ff5252' }}>{alert.signal}</span> <span style={{ float: 'right', color: '#888', fontSize: '0.9rem' }}>{alert.price}</span>
                    </div>
                ))}
            </div>
            <button onClick={onClose} style={{ width: '100%', marginTop: '15px', padding: '10px', backgroundColor: '#444', border: 'none', borderRadius: '6px', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}>DISMISS</button>
        </div>
    );
};

// ================================================================== //
// MAIN PLATFORM COMPONENT
// ================================================================== //
function Platform() {
  const [inputSymbol, setInputSymbol] = useState('BTC/USD'); 
  const [inputCustomSymbol, setInputCustomSymbol] = useState(''); 
  const [inputInterval, setInputInterval] = useState('1day');
  const [inputLValue, setInputLValue] = useState(30);
  const [inputUseAdaptiveL, setInputUseAdaptiveL] = useState(true);
  const [inputStrategy, setInputStrategy] = useState('BASIC');

  const [inputIsLive, setInputIsLive] = useState(false);
  const [inputAutoUpdate, setInputAutoUpdate] = useState(false);
  const [inputShowHotspots, setInputShowHotspots] = useState(false); 
  const [inputShowForecast, setInputShowForecast] = useState(false); 
  const [lookupCount, setLookupCount] = useState(0);
  const [finalSymbol, setFinalSymbol] = useState('BTC/USD');

  // --- UI STATE ---
  const [showScanner, setShowScanner] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false); 
  const [showTestModal, setShowTestModal] = useState(false); 
  const [showMonitorModal, setShowMonitorModal] = useState(false);
  
  // --- MONITOR & ALERT STATE ---
  const [isMonitoring, setIsMonitoring] = useState(false); // Used for Button Blinking
  const [activeAlerts, setActiveAlerts] = useState([]); 
  const [alertTimestamp, setAlertTimestamp] = useState(0); 

  // --- MOBILE MENU STATE ---
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const TWELVE_DATA_API_KEY = process.env.REACT_APP_TWELVE_DATA_API_KEY;

  const assetCategories = {
    'Crypto': ['XAU/USD','BTC/USD', 'ETH/USD', 'ADA/USD', 'BNB/USD', 'DOGE/USD', 'XRP/USD', 'SOL/USD', 'FET/USD','ICP/USD'],
    'Forex': ['EUR/USD', 'EUR/CAD', 'EUR/AUD','EUR/JPY', 'EUR/GBP','AUD/CAD','AUD/USD','GBP/CAD', 'GBP/USD', 'USD/CAD', 'USD/CHF', 'USD/JPY'],
    'Stocks': ['AAPL', 'AMZN', 'GOOG', 'MSFT','NVDA', 'META', 'TSLA', 'NFLX']
  };

  // --- ACTIVATE IDLE TIMER ---
  const handleIdleLogout = () => {
     // Clear data and force reload to show Login Screen
     localStorage.clear();
     window.location.reload(); 
  };
  
  // 15 Minutes Timeout
  useIdleLogout(15, handleIdleLogout);

  useEffect(() => {
      const handleResize = () => setIsMobile(window.innerWidth < 768);
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => { setLookupCount(c => c + 1); }, [inputInterval, inputLValue, inputUseAdaptiveL]); 
  useEffect(() => { if (inputSymbol !== 'CUSTOM') { setFinalSymbol(inputSymbol.toUpperCase()); setLookupCount(c => c + 1); } }, [inputSymbol]);

  // Handlers
  const handleSymbolChange = (e) => setInputSymbol(e.target.value);
  const handleCustomSymbolChange = (e) => setInputCustomSymbol(e.target.value);
  const handleIntervalChange = (e) => { setInputInterval(e.target.value); setShowScanner(false); setShowAnalysis(false); setShowTestModal(false); };
  const handleStrategyChange = (e) => setInputStrategy(e.target.value); 
  const handleAutoUpdateToggle = (e) => setInputAutoUpdate(e.target.checked);
  const handleShowHotspotsToggle = (e) => setInputShowHotspots(e.target.checked);
  const handleShowForecastToggle = (e) => setInputShowForecast(e.target.checked);
  const handleLookup = () => { const s = (inputSymbol === 'CUSTOM' ? inputCustomSymbol : inputSymbol).toUpperCase(); if (!s) return; setFinalSymbol(s); setLookupCount(c => c + 1); };
  const handleCustomSubmit = (e) => { e.preventDefault(); handleLookup(); if(document.activeElement) document.activeElement.blur(); };

  return (
    <AuthForm>
      <div className="App" style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden' }}>
        
        {activeAlerts.length > 0 && <AlertPopup key={alertTimestamp} alerts={activeAlerts} onClose={() => setActiveAlerts([])} />}

        {/* CONTROL BAR */}
        <div style={{ flex: '0 0 auto', color: '#d1d4dc', background: '#2d2d2d', padding: '5px 10px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', zIndex: 20, borderBottom: '1px solid #444' }}>
          
          {/* 1. INPUTS */}
          <span style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span>
                <select value={inputSymbol} onChange={handleSymbolChange} style={{ padding: '5px', backgroundColor: '#3c3c3c', color: 'white', border: '1px solid #555', maxWidth: '100px' }}>
                {Object.keys(assetCategories).map(cat => (
                    <optgroup key={cat} label={cat}>
                    {assetCategories[cat].map(asset => <option key={asset} value={asset}>{asset}</option>)}
                    </optgroup>
                ))}
                <option value="CUSTOM">Cust...</option>
                </select>
                {inputSymbol === 'CUSTOM' && (
                <form onSubmit={handleCustomSubmit} style={{ display: 'inline-block', margin: 0, padding: 0 }}>
                    <input type="text" value={inputCustomSymbol} onChange={handleCustomSymbolChange} onBlur={() => setInputCustomSymbol(inputCustomSymbol.toUpperCase())} placeholder="..." style={{ padding: '5px', backgroundColor: '#3c3c3c', color: 'white', border: '1px solid #555', width: '60px', marginLeft: '5px' }} />
                </form>
                )}
            </span>

            <span>
                <select value={inputInterval} onChange={handleIntervalChange} style={{ padding: '5px', backgroundColor: '#3c3c3c', color: 'white', border: '1px solid #555' }}>
                <option value="1min">1m</option><option value="5min">5m</option><option value="15min">15m</option><option value="30min">30m</option><option value="1h">1H</option><option value="4h">4H</option><option value="1day">D</option><option value="1week">W</option>
                </select>
            </span>

            <span>
                <select value={inputStrategy} onChange={handleStrategyChange} style={{ padding: '5px', backgroundColor: '#3c3c3c', color: '#00bcd4', border: '1px solid #555', fontWeight:'bold' }}>
                    <option value="BASIC">Basic</option>
                    <option value="BASIC_S">Basic (Single)</option>
                    <option value="FAST">Fast</option>
                </select>
            </span>
            
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label title="HotSpots" style={{ color: inputShowHotspots ? '#ffeb3b' : '#555', cursor: 'pointer' }}><input type="checkbox" checked={inputShowHotspots} onChange={handleShowHotspotsToggle} style={{display:'none'}}/> HS</label>
                <label title="Forecast" style={{ color: inputShowForecast ? '#ff00ff' : '#555', cursor: 'pointer' }}><input type="checkbox" checked={inputShowForecast} onChange={handleShowForecastToggle} style={{display:'none'}}/> FC</label>
                <label title="Auto Update" style={{ color: inputAutoUpdate ? '#00bcd4' : '#555', cursor: 'pointer' }}><input type="checkbox" checked={inputAutoUpdate} onChange={handleAutoUpdateToggle} style={{display:'none'}}/> A</label>
            </span>
          </span>

          {/* 2. CHEVRON (Mobile Only) */}
          {isMobile && (
              <button 
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                style={{ 
                    marginLeft: 'auto', background: 'none', border: '1px solid #444', 
                    borderRadius: '4px', color: '#d1d4dc', padding: '4px', cursor: 'pointer' 
                }}
              >
                  {isMobileMenuOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </button>
          )}

          {/* 3. ACTION BUTTONS */}
          <div style={{ 
              display: (isMobile && !isMobileMenuOpen) ? 'none' : 'flex', 
              width: isMobile ? '100%' : 'auto', 
              gap: '10px', 
              marginLeft: isMobile ? '0' : 'auto',
              justifyContent: isMobile ? 'space-between' : 'flex-end',
              marginTop: isMobile ? '10px' : '0'
          }}>
            <button onClick={() => setShowTestModal(true)} style={{ flex: isMobile ? 1 : 'none', display: 'flex', justifyContent: 'center', gap: '5px', background: '#00c853', color: 'white', border: 'none', borderRadius: '4px', padding: '5px 12px', cursor: 'pointer' }}><FlaskConical size={16} /> Test</button>
            
            <button 
                onClick={() => setShowMonitorModal(true)} 
                className={isMonitoring ? 'flashing-monitor' : ''} 
                style={{ 
                    flex: isMobile ? 1 : 'none', display: 'flex', justifyContent: 'center', gap: '5px', 
                    background: isMonitoring ? '#e65100' : 'transparent', 
                    color: isMonitoring ? 'white' : '#ff9800', 
                    border: '1px solid #ff9800', borderRadius: '4px', padding: '5px 12px', cursor: 'pointer' 
                }}
            >
                <Activity size={16} /> MON
            </button>
            
            <button onClick={() => setShowAnalysis(!showAnalysis)} style={{ flex: isMobile ? 1 : 'none', display: 'flex', justifyContent: 'center', gap: '5px', background: '#e600adff', color: '#d1d4dc', border: '1px solid #444', borderRadius: '4px', padding: '5px 12px', cursor: 'pointer' }}><Activity size={16} /> DA</button>
            <button onClick={() => setShowScanner(true)} style={{ flex: isMobile ? 1 : 'none', display: 'flex', justifyContent: 'center', gap: '5px', background: '#0078d4', color: 'white', border: 'none', borderRadius: '4px', padding: '5px 12px', cursor: 'pointer' }}><Radar size={16} /> Scan</button>
          </div>
        </div>

        <div className="ChartWrapper" style={{ flex: '1 1 auto', position: 'relative', overflow: 'hidden', width: '100%', minHeight: 0 }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
            <TradingChart 
                symbol={finalSymbol} 
                interval={inputInterval} 
                lValue={inputLValue} 
                useAdaptiveL={inputUseAdaptiveL} 
                apiKey={TWELVE_DATA_API_KEY} 
                enableRealtime={inputIsLive} 
                autoUpdate={inputAutoUpdate} 
                showHotspots={inputShowHotspots} 
                showForecast={inputShowForecast} 
                strategy={inputStrategy}
            />
          </div>
        </div>

        {showScanner && <ScannerModal interval={inputInterval} strategy={inputStrategy} onClose={() => setShowScanner(false)} onSelectAsset={setInputSymbol} />}
        {showAnalysis && <AnalysisModal symbol={finalSymbol} interval={inputInterval} strategy={inputStrategy} onClose={() => setShowAnalysis(false)} />}
        {showTestModal && <TestModal onClose={() => setShowTestModal(false)} />}
        
        <MonitorModal 
            isOpen={showMonitorModal}
            onClose={() => setShowMonitorModal(false)} 
            onOpen={() => setShowMonitorModal(true)}
            strategy={inputStrategy} 
            onSelectAsset={setInputSymbol}
            onStatusChange={setIsMonitoring} 
        />

      </div>
      <div className="RotateNotifier"><p>Please rotate your device to portrait mode</p></div>
    </AuthForm>
  );
}

function App() { return <Router><Routes><Route path="/" element={<LandingPage />} /><Route path="/auth" element={<Platform />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes></Router>; }

export default App;