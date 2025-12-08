import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'; 
import { Radar, Activity, FlaskConical, X, BellRing } from 'lucide-react'; 
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
        // 1. Play Sound on Mount
        const audio = new Audio('/alert.mp3');
        audio.play().catch(e => console.log("Audio autoplay blocked by browser policy:", e));

        // 2. Auto-Close after 60 seconds (approx 1 candle duration)
        const timer = setTimeout(() => {
            onClose();
        }, 60000);

        return () => clearTimeout(timer);
    }, [onClose]);

    return (
        <div style={{
            position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
            width: '90%', maxWidth: '400px',
            backgroundColor: '#2d1b1b', // Red-ish dark background for alert
            border: '2px solid #ff4444',
            borderRadius: '12px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.8)',
            zIndex: 9999, // On top of everything
            padding: '15px',
            animation: 'fadeIn 0.3s ease-out'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h3 style={{ margin: 0, color: '#ff4444', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <BellRing size={20} /> Market Alert
                </h3>
                <button 
                    onClick={onClose}
                    style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer' }}
                >
                    <X size={20} />
                </button>
            </div>
            
            <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                {alerts.map((alert, idx) => (
                    <div key={idx} style={{ 
                        padding: '8px 0', 
                        borderBottom: idx < alerts.length - 1 ? '1px solid #444' : 'none',
                        color: 'white', fontSize: '1rem'
                    }}>
                        <strong style={{ color: '#ff9800' }}>{alert.symbol}</strong>
                        <span style={{ margin: '0 8px' }}>→</span>
                        <span style={{ 
                            fontWeight: 'bold', 
                            color: alert.signal === 'BUY' ? '#00e676' : '#ff5252' 
                        }}>
                            {alert.signal}
                        </span>
                        <span style={{ float: 'right', color: '#888', fontSize: '0.9rem' }}>
                            {alert.price}
                        </span>
                    </div>
                ))}
            </div>

            <button 
                onClick={onClose}
                style={{
                    width: '100%', marginTop: '15px', padding: '10px',
                    backgroundColor: '#444', border: 'none', borderRadius: '6px',
                    color: 'white', fontWeight: 'bold'
                }}
            >
                DISMISS
            </button>
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

  // --- SCANNER & ANALYSIS STATE ---
  const [showScanner, setShowScanner] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false); 
  const [showForwardTest, setShowForwardTest] = useState(false); 

  // --- MONITOR STATE ---
  const [showMonitorModal, setShowMonitorModal] = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [monitorInterval, setMonitorInterval] = useState(null); 
  
  // --- ALERT STATE (FALLBACK POPUP) ---
  const [activeAlerts, setActiveAlerts] = useState([]); // Array of alert objects

  // Refs for timing and deduping
  const monitorTimeoutRef = useRef(null);
  const processedSignalsRef = useRef(new Set()); 

  const TWELVE_DATA_API_KEY = process.env.REACT_APP_TWELVE_DATA_API_KEY;

  const assetCategories = {
    'Crypto': ['XAU/USD','BTC/USD', 'ETH/USD', 'ADA/USD', 'BNB/USD', 'DOGE/USD', 'XRP/USD', 'SOL/USD', 'FET/USD','ICP/USD'],
    'Forex': ['EUR/USD', 'EUR/CAD', 'EUR/AUD','EUR/JPY', 'EUR/GBP','AUD/CAD','AUD/USD','GBP/CAD', 'GBP/USD', 'USD/CAD', 'USD/CHF', 'USD/JPY'],
    'Stocks': ['AAPL', 'AMZN', 'GOOG', 'MSFT','NVDA', 'META', 'TSLA', 'NFLX']
  };

  useEffect(() => {
    setLookupCount(c => c + 1);
  }, [inputInterval, inputLValue, inputUseAdaptiveL]); 

  useEffect(() => {
    if (inputSymbol !== 'CUSTOM') {
      setFinalSymbol(inputSymbol.toUpperCase());
      setLookupCount(c => c + 1);
    }
  }, [inputSymbol]);

  // --- MONITORING ENGINE ---
  
  const getDelayToNextScan = (intervalStr) => {
      const now = new Date();
      const minutes = now.getMinutes();
      const seconds = now.getSeconds();
      const targetSecond = 10;
      
      const map = { '1min': 1, '5min': 5, '15min': 15, '30min': 30, '1h': 60, '4h': 240 };
      const intervalMins = map[intervalStr] || 60;
      
      let minutesToAdd = intervalMins - (minutes % intervalMins);
      
      if (minutes % intervalMins === 0 && seconds < targetSecond) {
          return (targetSecond - seconds) * 1000;
      }

      if (minutes % intervalMins === 0 && seconds >= targetSecond) {
          minutesToAdd = intervalMins;
      }

      const targetTime = new Date(now.getTime() + minutesToAdd * 60000);
      targetTime.setSeconds(targetSecond);
      targetTime.setMilliseconds(0);
      
      return targetTime.getTime() - now.getTime();
  };

  const performScan = async (interval) => {
      if (!interval) return;
      
      console.log(`🔍 Monitor Running: Scanning ${interval} candles...`);
      const token = localStorage.getItem('access_token');
      
      try {
          const res = await fetch(`/api/scan?interval=${interval}`, {
              headers: { 'Authorization': `Bearer ${token}` }
          });
          const results = await res.json();
          
          const newSignals = results.filter(r => r.signal === 'BUY' || r.signal === 'SELL');
          const notifyList = [];

          // Dedupe Logic
          const timeBlock = `${new Date().getHours()}:${new Date().getMinutes()}`;

          newSignals.forEach(s => {
              const uniqueKey = `${s.symbol}-${s.signal}-${timeBlock}`;
              if (!processedSignalsRef.current.has(uniqueKey)) {
                  notifyList.push(s);
                  processedSignalsRef.current.add(uniqueKey);
              }
          });

          // --- TRIGGER NOTIFICATIONS ---
          if (notifyList.length > 0) {
             
             // 1. Set State for In-App Popup (Reliable on Mobile)
             setActiveAlerts(notifyList);

             // 2. Try Standard Browser Notification (Desktop)
             const body = notifyList.map(s => `${s.symbol}: ${s.signal} @ ${s.price}`).join('\n');
             if ('Notification' in window && Notification.permission === "granted") {
                 try {
                     new Notification(`🚨 ${notifyList.length} Market Signals!`, {
                         body: body,
                         icon: '/favicon.ico',
                         requireInteraction: true 
                     });
                 } catch (e) {
                     console.error("Browser notification failed", e);
                 }
             }
          }

      } catch (err) {
          console.error("Monitor Scan Error:", err);
      }
      
      // Schedule Next Loop
      const nextDelay = getDelayToNextScan(interval);
      console.log(`Next scan in ${(nextDelay/1000).toFixed(1)} seconds`);
      
      monitorTimeoutRef.current = setTimeout(() => {
          performScan(interval);
      }, nextDelay);
  };

  useEffect(() => {
    if (isMonitoring && monitorInterval) {
        console.log(`Monitor Started for ${monitorInterval}`);
        const delay = getDelayToNextScan(monitorInterval);
        monitorTimeoutRef.current = setTimeout(() => {
            performScan(monitorInterval);
        }, delay);
    } else {
        if (monitorTimeoutRef.current) clearTimeout(monitorTimeoutRef.current);
        processedSignalsRef.current.clear();
        setActiveAlerts([]); // Clear alerts on stop
    }

    return () => {
        if (monitorTimeoutRef.current) clearTimeout(monitorTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMonitoring, monitorInterval]);

  // Keep Alive
  useEffect(() => {
      if (!isMonitoring) return;
      const keepAlive = setInterval(async () => {
           const token = localStorage.getItem('access_token');
           try { await fetch('/api/user-info', { headers: { 'Authorization': `Bearer ${token}` } }); } catch(e){}
      }, 5 * 60 * 1000); 
      return () => clearInterval(keepAlive);
  }, [isMonitoring]);

  const toggleMonitor = (interval) => {
      setMonitorInterval(interval);
      setIsMonitoring(true);
      setShowMonitorModal(false);
  };

  const stopMonitor = () => {
      setIsMonitoring(false);
      setMonitorInterval(null);
  };

  // ... (Existing Event Handlers match previous version) ...
  const handleSymbolChange = (e) => setInputSymbol(e.target.value);
  const handleCustomSymbolChange = (e) => setInputCustomSymbol(e.target.value);
  const handleIntervalChange = (e) => {
      setInputInterval(e.target.value);
      setShowScanner(false); setShowAnalysis(false); setShowForwardTest(false);
  };
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
        
        {/* --- IN-APP ALERT POPUP (FALLBACK) --- */}
        {activeAlerts.length > 0 && (
            <AlertPopup 
                alerts={activeAlerts} 
                onClose={() => setActiveAlerts([])} 
            />
        )}

        {/* CONTROL BAR */}
        <div style={{ flex: '0 0 auto', color: '#d1d4dc', background: '#2d2d2d', padding: '5px 10px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', zIndex: 20, borderBottom: '1px solid #444' }}>
          <span>
            <label style={{ marginRight: '5px' }}>Symbol:</label>
            <select value={inputSymbol} onChange={handleSymbolChange} style={{ padding: '5px', backgroundColor: '#3c3c3c', color: 'white', border: '1px solid #555' }}>
              {Object.keys(assetCategories).map(cat => (
                <optgroup key={cat} label={cat}>
                  {assetCategories[cat].map(asset => <option key={asset} value={asset}>{asset}</option>)}
                </optgroup>
              ))}
              <option value="CUSTOM">Custom...</option>
            </select>
            {inputSymbol === 'CUSTOM' && (
              <form onSubmit={handleCustomSubmit} style={{ display: 'inline-block', margin: 0, padding: 0 }}>
                <input type="text" value={inputCustomSymbol} onChange={handleCustomSymbolChange} onBlur={() => setInputCustomSymbol(inputCustomSymbol.toUpperCase())} placeholder="Type..." style={{ padding: '5px', backgroundColor: '#3c3c3c', color: 'white', border: '1px solid #555', width: '100px', marginLeft: '5px' }} />
              </form>
            )}
          </span>

          <span>
            <label style={{ marginRight: '5px' }}>Interval:</label>
            <select value={inputInterval} onChange={handleIntervalChange} style={{ padding: '5px', backgroundColor: '#3c3c3c', color: 'white', border: '1px solid #555' }}>
              <option value="1min">1min</option><option value="5min">5min</option><option value="15min">15min</option><option value="30min">30min</option><option value="1h">1H</option><option value="4h">4H</option><option value="1day">Daily</option><option value="1week">Weekly</option><option value="1month">Monthly</option>
            </select>
          </span>
          
          <span style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <label style={{ color: inputShowHotspots ? '#ffeb3b' : '#d1d4dc' }}><input type="checkbox" checked={inputShowHotspots} onChange={handleShowHotspotsToggle} /> HotSpots</label>
            <label style={{ color: inputShowForecast ? '#ff00ff' : '#d1d4dc' }}><input type="checkbox" checked={inputShowForecast} onChange={handleShowForecastToggle} /> Forecast</label>
            <label style={{ color: inputAutoUpdate ? '#00bcd4' : '#d1d4dc' }}><input type="checkbox" checked={inputAutoUpdate} onChange={handleAutoUpdateToggle} /> Auto</label>
          </span>

          <button onClick={() => setShowForwardTest(true)} style={{ display: 'flex', gap: '5px', background: '#00c853', color: 'white', border: 'none', borderRadius: '4px', padding: '5px 12px', marginLeft: 'auto', marginRight: '10px' }}><FlaskConical size={16} /> Test</button>
          
          <button onClick={() => isMonitoring ? (window.confirm("Stop?") && stopMonitor()) : setShowMonitorModal(true)} className={isMonitoring ? 'flashing-monitor' : ''} style={{ display: 'flex', gap: '5px', background: isMonitoring ? '#e65100' : 'transparent', color: isMonitoring ? 'white' : '#ff9800', border: '1px solid #ff9800', borderRadius: '4px', padding: '5px 12px', marginRight: '10px' }}><Activity size={16} /> MON</button>

          <button onClick={() => setShowAnalysis(!showAnalysis)} style={{ display: 'flex', gap: '5px', background: '#e600adff', color: '#d1d4dc', border: '1px solid #444', borderRadius: '4px', padding: '5px 12px', marginRight: '10px' }}><Activity size={16} /> DA</button>

          <button onClick={() => setShowScanner(true)} style={{ display: 'flex', gap: '5px', background: '#0078d4', color: 'white', border: 'none', borderRadius: '4px', padding: '5px 12px' }}><Radar size={16} /> Scan</button>
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