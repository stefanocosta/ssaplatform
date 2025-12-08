import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'; 
import { Radar, Activity, FlaskConical, X, BellRing, ChevronDown, ChevronUp } from 'lucide-react'; 
import TradingChart from './components/TradingChart';
import AuthForm from './components/AuthForm'; 
import LandingPage from './components/LandingPage'; 
import ScannerModal from './components/ScannerModal'; 
import AnalysisModal from './components/AnalysisModal'; 
import ForwardTestModal from './components/ForwardTestModal'; 
import MonitorModal from './components/MonitorModal'; 
import './App.css';

// --- INTERNAL COMPONENT: MOBILE ALERT POPUP ---
const AlertPopup = ({ alerts, onClose }) => {
    useEffect(() => {
        // Auto-Close after 60 seconds
        const timer = setTimeout(() => {
            onClose();
        }, 60000);
        return () => clearTimeout(timer);
    }, [onClose]);

    return (
        <div style={{
            position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
            width: '90%', maxWidth: '400px',
            backgroundColor: '#2d1b1b', 
            border: '2px solid #ff4444',
            borderRadius: '12px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.8)',
            zIndex: 9999, 
            padding: '15px',
            animation: 'fadeIn 0.3s ease-out'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h3 style={{ margin: 0, color: '#ff4444', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <BellRing size={20} /> Market Alert
                </h3>
                <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            
            <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                {alerts.map((alert, idx) => (
                    <div key={idx} style={{ 
                        padding: '8px 0', borderBottom: idx < alerts.length - 1 ? '1px solid #444' : 'none',
                        color: 'white', fontSize: '1rem'
                    }}>
                        <strong style={{ color: '#ff9800' }}>{alert.symbol}</strong>
                        <span style={{ margin: '0 8px' }}>→</span>
                        <span style={{ fontWeight: 'bold', color: alert.signal === 'BUY' ? '#00e676' : '#ff5252' }}>{alert.signal}</span>
                        <span style={{ float: 'right', color: '#888', fontSize: '0.9rem' }}>{alert.price}</span>
                    </div>
                ))}
            </div>
            <button onClick={onClose} style={{ width: '100%', marginTop: '15px', padding: '10px', backgroundColor: '#444', border: 'none', borderRadius: '6px', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}>DISMISS</button>
        </div>
    );
};

function Platform() {
  const [inputSymbol, setInputSymbol] = useState('BTC/USD'); 
  const [inputCustomSymbol, setInputCustomSymbol] = useState(''); 
  const [inputInterval, setInputInterval] = useState('1day');
  const [inputLValue, setInputLValue] = useState(30);
  const [inputUseAdaptiveL, setInputUseAdaptiveL] = useState(true);
  
  const [inputIsLive, setInputIsLive] = useState(false);
  const [inputAutoUpdate, setInputAutoUpdate] = useState(false);
  const [inputShowHotspots, setInputShowHotspots] = useState(false); 
  const [inputShowForecast, setInputShowForecast] = useState(false); 
  const [lookupCount, setLookupCount] = useState(0);
  const [finalSymbol, setFinalSymbol] = useState('BTC/USD');

  // --- UI STATE ---
  const [showScanner, setShowScanner] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false); 
  const [showForwardTest, setShowForwardTest] = useState(false); 
  const [showMonitorModal, setShowMonitorModal] = useState(false);
  
  // --- MONITOR & ALERT STATE ---
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [monitorInterval, setMonitorInterval] = useState(null); 
  const [activeAlerts, setActiveAlerts] = useState([]); 
  const [alertTimestamp, setAlertTimestamp] = useState(0); 

  // --- MOBILE MENU STATE ---
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Refs
  const monitorTimeoutRef = useRef(null);
  const processedSignalsRef = useRef(new Set()); 
  const audioRef = useRef(new Audio('/alert.mp3')); // Single audio instance

  const TWELVE_DATA_API_KEY = process.env.REACT_APP_TWELVE_DATA_API_KEY;

  const assetCategories = {
    'Crypto': ['XAU/USD','BTC/USD', 'ETH/USD', 'ADA/USD', 'BNB/USD', 'DOGE/USD', 'XRP/USD', 'SOL/USD', 'FET/USD','ICP/USD'],
    'Forex': ['EUR/USD', 'EUR/CAD', 'EUR/AUD','EUR/JPY', 'EUR/GBP','AUD/CAD','AUD/USD','GBP/CAD', 'GBP/USD', 'USD/CAD', 'USD/CHF', 'USD/JPY'],
    'Stocks': ['AAPL', 'AMZN', 'GOOG', 'MSFT','NVDA', 'META', 'TSLA', 'NFLX']
  };

  // --- EFFECTS ---
  
  useEffect(() => {
      const handleResize = () => setIsMobile(window.innerWidth < 768);
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => { setLookupCount(c => c + 1); }, [inputInterval, inputLValue, inputUseAdaptiveL]); 
  useEffect(() => { if (inputSymbol !== 'CUSTOM') { setFinalSymbol(inputSymbol.toUpperCase()); setLookupCount(c => c + 1); } }, [inputSymbol]);

  // --- MONITORING LOGIC ---
  const getDelayToNextScan = (intervalStr) => {
      const now = new Date();
      const minutes = now.getMinutes();
      const seconds = now.getSeconds();
      const targetSecond = 10;
      const map = { '1min': 1, '5min': 5, '15min': 15, '30min': 30, '1h': 60, '4h': 240 };
      const intervalMins = map[intervalStr] || 60;
      let minutesToAdd = intervalMins - (minutes % intervalMins);
      if (minutes % intervalMins === 0 && seconds < targetSecond) return (targetSecond - seconds) * 1000;
      if (minutes % intervalMins === 0 && seconds >= targetSecond) minutesToAdd = intervalMins;
      const targetTime = new Date(now.getTime() + minutesToAdd * 60000);
      targetTime.setSeconds(targetSecond);
      targetTime.setMilliseconds(0);
      return targetTime.getTime() - now.getTime();
  };

  const performScan = async (interval) => {
      if (!interval) return;
      console.log(`🔍 Monitor Running: Scanning ${interval}...`);
      const token = localStorage.getItem('access_token');
      try {
          const res = await fetch(`/api/scan?interval=${interval}`, { headers: { 'Authorization': `Bearer ${token}` } });
          const results = await res.json();
          const newSignals = results.filter(r => r.signal === 'BUY' || r.signal === 'SELL');
          const notifyList = [];
          const timeBlock = `${new Date().getHours()}:${new Date().getMinutes()}`;

          newSignals.forEach(s => {
              const uniqueKey = `${s.symbol}-${s.signal}-${timeBlock}`;
              if (!processedSignalsRef.current.has(uniqueKey)) {
                  notifyList.push(s);
                  processedSignalsRef.current.add(uniqueKey);
              }
          });

          if (notifyList.length > 0) {
             // 1. Show Popup
             setActiveAlerts(notifyList);
             setAlertTimestamp(Date.now());
             
             // 2. Play Sound (Using unlocked ref)
             try {
                 audioRef.current.currentTime = 0;
                 const playPromise = audioRef.current.play();
                 if (playPromise !== undefined) {
                     playPromise.catch(e => console.error("Audio blocked inside scan loop:", e));
                 }
             } catch(e) { console.error(e); }

             // 3. Desktop Notification
             const body = notifyList.map(s => `${s.symbol}: ${s.signal} @ ${s.price}`).join('\n');
             if ('Notification' in window && Notification.permission === "granted") {
                 try { new Notification(`🚨 ${notifyList.length} Signals!`, { body, icon: '/favicon.ico' }); } catch (e) {}
             }
          }
      } catch (err) { console.error("Scan Error:", err); }
      
      const nextDelay = getDelayToNextScan(interval);
      monitorTimeoutRef.current = setTimeout(() => { performScan(interval); }, nextDelay);
  };

  useEffect(() => {
    if (isMonitoring && monitorInterval) {
        const delay = getDelayToNextScan(monitorInterval);
        monitorTimeoutRef.current = setTimeout(() => { performScan(monitorInterval); }, delay);
    } else {
        if (monitorTimeoutRef.current) clearTimeout(monitorTimeoutRef.current);
        processedSignalsRef.current.clear();
        setActiveAlerts([]); 
    }
    return () => { if (monitorTimeoutRef.current) clearTimeout(monitorTimeoutRef.current); };
  }, [isMonitoring, monitorInterval]);

  useEffect(() => {
      if (!isMonitoring) return;
      const keepAlive = setInterval(async () => {
           const token = localStorage.getItem('access_token');
           try { await fetch('/api/user-info', { headers: { 'Authorization': `Bearer ${token}` } }); } catch(e){}
      }, 5 * 60 * 1000); 
      return () => clearInterval(keepAlive);
  }, [isMonitoring]);

  const toggleMonitor = (interval) => {
      // Audio Warm-up (Unlock)
      try {
          audioRef.current.volume = 0; 
          audioRef.current.play().then(() => {
              audioRef.current.pause();
              audioRef.current.currentTime = 0;
              audioRef.current.volume = 1.0; 
          }).catch(e => console.log("Audio unlock failed", e));
      } catch (e) { }

      setMonitorInterval(interval);
      setIsMonitoring(true);
      setShowMonitorModal(false);
  };

  const stopMonitor = () => { setIsMonitoring(false); setMonitorInterval(null); };

  // Handlers
  const handleSymbolChange = (e) => setInputSymbol(e.target.value);
  const handleCustomSymbolChange = (e) => setInputCustomSymbol(e.target.value);
  const handleIntervalChange = (e) => { setInputInterval(e.target.value); setShowScanner(false); setShowAnalysis(false); setShowForwardTest(false); };
  const handleAutoUpdateToggle = (e) => setInputAutoUpdate(e.target.checked);
  const handleShowHotspotsToggle = (e) => setInputShowHotspots(e.target.checked);
  const handleShowForecastToggle = (e) => setInputShowForecast(e.target.checked);
  const handleLookup = () => {
    const s = (inputSymbol === 'CUSTOM' ? inputCustomSymbol : inputSymbol).toUpperCase();
    if (!s) return;
    setFinalSymbol(s);
    setLookupCount(c => c + 1);
  };
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
                <label style={{ marginRight: '5px' }}>Sym:</label>
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
            
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label title="HotSpots" style={{ color: inputShowHotspots ? '#ffeb3b' : '#797777ff', cursor: 'pointer' }}><input type="checkbox" checked={inputShowHotspots} onChange={handleShowHotspotsToggle} style={{display:'none'}}/> HotSpots</label>
                <label title="Forecast" style={{ color: inputShowForecast ? '#ff00ff' : '#797777ff', cursor: 'pointer' }}><input type="checkbox" checked={inputShowForecast} onChange={handleShowForecastToggle} style={{display:'none'}}/> Forecast</label>
                <label title="Auto Update" style={{ color: inputAutoUpdate ? '#00bcd4' : '#797777ff', cursor: 'pointer' }}><input type="checkbox" checked={inputAutoUpdate} onChange={handleAutoUpdateToggle} style={{display:'none'}}/> Auto</label>
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

          {/* 3. ACTION BUTTONS (Added cursor: pointer back!) */}
          <div style={{ 
              display: (isMobile && !isMobileMenuOpen) ? 'none' : 'flex', 
              width: isMobile ? '100%' : 'auto', 
              gap: '10px', 
              marginLeft: isMobile ? '0' : 'auto',
              justifyContent: isMobile ? 'space-between' : 'flex-end',
              marginTop: isMobile ? '10px' : '0'
          }}>
            <button onClick={() => setShowForwardTest(true)} style={{ flex: isMobile ? 1 : 'none', display: 'flex', justifyContent: 'center', gap: '5px', background: '#00c853', color: 'white', border: 'none', borderRadius: '4px', padding: '5px 12px', cursor: 'pointer' }}><FlaskConical size={16} /> Test</button>
            <button onClick={() => isMonitoring ? (window.confirm("Stop?") && stopMonitor()) : setShowMonitorModal(true)} className={isMonitoring ? 'flashing-monitor' : ''} style={{ flex: isMobile ? 1 : 'none', display: 'flex', justifyContent: 'center', gap: '5px', background: isMonitoring ? '#e65100' : 'transparent', color: isMonitoring ? 'white' : '#ff9800', border: '1px solid #ff9800', borderRadius: '4px', padding: '5px 12px', cursor: 'pointer' }}><Activity size={16} /> MON</button>
            <button onClick={() => setShowAnalysis(!showAnalysis)} style={{ flex: isMobile ? 1 : 'none', display: 'flex', justifyContent: 'center', gap: '5px', background: '#e600adff', color: '#d1d4dc', border: '1px solid #444', borderRadius: '4px', padding: '5px 12px', cursor: 'pointer' }}><Activity size={16} /> DA</button>
            <button onClick={() => setShowScanner(true)} style={{ flex: isMobile ? 1 : 'none', display: 'flex', justifyContent: 'center', gap: '5px', background: '#0078d4', color: 'white', border: 'none', borderRadius: '4px', padding: '5px 12px', cursor: 'pointer' }}><Radar size={16} /> Scan</button>
          </div>

        </div>

        <div className="ChartWrapper" style={{ flex: '1 1 auto', position: 'relative', overflow: 'hidden', width: '100%', minHeight: 0 }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
            <TradingChart symbol={finalSymbol} interval={inputInterval} lValue={inputLValue} useAdaptiveL={inputUseAdaptiveL} apiKey={TWELVE_DATA_API_KEY} enableRealtime={inputIsLive} autoUpdate={inputAutoUpdate} showHotspots={inputShowHotspots} showForecast={inputShowForecast} />
          </div>
        </div>

        {showScanner && <ScannerModal interval={inputInterval} onClose={() => setShowScanner(false)} onSelectAsset={setInputSymbol} />}
        {showAnalysis && <AnalysisModal symbol={finalSymbol} interval={inputInterval} onClose={() => setShowAnalysis(false)} />}
        {showForwardTest && <ForwardTestModal onClose={() => setShowForwardTest(false)} />}
        {showMonitorModal && <MonitorModal onClose={() => setShowMonitorModal(false)} onStart={toggleMonitor} />}
      </div>
      <div className="RotateNotifier"><p>Please rotate your device to portrait mode</p></div>
    </AuthForm>
  );
}

function App() { return <Router><Routes><Route path="/" element={<LandingPage />} /><Route path="/auth" element={<Platform />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes></Router>; }

export default App;