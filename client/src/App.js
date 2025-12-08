import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'; 
import { Radar, Activity, FlaskConical } from 'lucide-react'; 
import TradingChart from './components/TradingChart';
import AuthForm from './components/AuthForm'; 
import LandingPage from './components/LandingPage'; 
import ScannerModal from './components/ScannerModal'; 
import AnalysisModal from './components/AnalysisModal'; 
import ForwardTestModal from './components/ForwardTestModal'; 
import MonitorModal from './components/MonitorModal'; 
import './App.css';

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

  // --- NEW STATE FOR MONITOR ---
  const [showMonitorModal, setShowMonitorModal] = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [monitorInterval, setMonitorInterval] = useState(null); 
  
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
  
  // Helper: Calculate milliseconds until next scan target
  const getDelayToNextScan = (intervalStr) => {
      const now = new Date();
      const minutes = now.getMinutes();
      const seconds = now.getSeconds();
      
      // Target: 10 seconds past the minute
      const targetSecond = 10;
      
      // Map interval string to minutes integer
      const map = { '1min': 1, '5min': 5, '15min': 15, '30min': 30, '1h': 60, '4h': 240 };
      const intervalMins = map[intervalStr] || 60;
      
      // Calculate how many minutes to add to reach the next interval boundary
      // e.g. if 15min interval, and time is 12:04, next is 12:15
      let minutesToAdd = intervalMins - (minutes % intervalMins);
      
      // Special Case: If we are currently in the "Buffer Zone" (e.g. 12:00:05),
      // we should scan NOW, not wait for 12:15:10.
      if (minutes % intervalMins === 0 && seconds < targetSecond) {
          return (targetSecond - seconds) * 1000;
      }

      // If we are exactly on the minute but past target seconds, we wait for next interval
      if (minutes % intervalMins === 0 && seconds >= targetSecond) {
          minutesToAdd = intervalMins;
      }

      // Calculate target date
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
          // 1. Call API
          const res = await fetch(`/api/scan?interval=${interval}`, {
              headers: { 'Authorization': `Bearer ${token}` }
          });
          const results = await res.json();
          
          // 2. Filter Results
          const newSignals = results.filter(r => r.signal === 'BUY' || r.signal === 'SELL');
          const notifyList = [];

          // 3. Dedupe logic (Prevent spamming same signal)
          // We use a unique key: SYMBOL + SIGNAL + TIME_BLOCK
          // Approximate time block using current hour/minute to distinguish from previous candles
          const timeBlock = `${new Date().getHours()}:${new Date().getMinutes()}`;

          newSignals.forEach(s => {
              const uniqueKey = `${s.symbol}-${s.signal}-${timeBlock}`;
              if (!processedSignalsRef.current.has(uniqueKey)) {
                  notifyList.push(s);
                  processedSignalsRef.current.add(uniqueKey);
              }
          });

          // 4. Notify
          if (notifyList.length > 0) {
             const body = notifyList.map(s => `${s.symbol}: ${s.signal} @ ${s.price}`).join('\n');
             
             if (Notification.permission === "granted") {
                 new Notification(`🚨 ${notifyList.length} Market Signals!`, {
                     body: body,
                     icon: '/favicon.ico',
                     requireInteraction: true // Keeps notification on screen
                 });
             } else if (Notification.permission !== "denied") {
                 Notification.requestPermission();
             }
             
             // Optional Sound
             // const audio = new Audio('/alert_sound.mp3'); audio.play().catch(e => console.log(e));
          }

      } catch (err) {
          console.error("Monitor Scan Error:", err);
      }
      
      // 5. Schedule Next Loop
      const nextDelay = getDelayToNextScan(interval);
      console.log(`Next scan in ${(nextDelay/1000).toFixed(1)} seconds`);
      
      monitorTimeoutRef.current = setTimeout(() => {
          performScan(interval);
      }, nextDelay);
  };

  useEffect(() => {
    // START / STOP Logic
    if (isMonitoring && monitorInterval) {
        console.log(`Monitor Started for ${monitorInterval}`);
        
        // Calculate initial delay
        const delay = getDelayToNextScan(monitorInterval);
        console.log(`First scan scheduled in ${(delay/1000).toFixed(1)} seconds`);

        monitorTimeoutRef.current = setTimeout(() => {
            performScan(monitorInterval);
        }, delay);
    } else {
        // Stop
        if (monitorTimeoutRef.current) clearTimeout(monitorTimeoutRef.current);
        processedSignalsRef.current.clear();
    }

    // Cleanup on unmount
    return () => {
        if (monitorTimeoutRef.current) clearTimeout(monitorTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMonitoring, monitorInterval]);

  // Keep Alive (Prevent Auth Timeout)
  useEffect(() => {
      if (!isMonitoring) return;
      const keepAlive = setInterval(async () => {
           const token = localStorage.getItem('access_token');
           try { await fetch('/api/user-info', { headers: { 'Authorization': `Bearer ${token}` } }); } catch(e){}
      }, 5 * 60 * 1000); // 5 mins
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

  const handleSymbolChange = (event) => {
    setInputSymbol(event.target.value);
  };

  const handleCustomSymbolChange = (event) => {
    setInputCustomSymbol(event.target.value);
  };

  const handleIntervalChange = (event) => {
    setInputInterval(event.target.value);
    setShowScanner(false);
    setShowAnalysis(false);
    setShowForwardTest(false);
  };

  const handleAutoUpdateToggle = (event) => {
    setInputAutoUpdate(event.target.checked);
  };

  const handleShowHotspotsToggle = (event) => {
    setInputShowHotspots(event.target.checked);
  };

  const handleShowForecastToggle = (event) => {
    setInputShowForecast(event.target.checked);
  };

  const handleLookup = () => {
    const symbolToLookup = (inputSymbol === 'CUSTOM' ? inputCustomSymbol : inputSymbol).toUpperCase();
    if (!symbolToLookup) {
        console.error("No symbol provided");
        return; 
    }
    setFinalSymbol(symbolToLookup);
    setLookupCount(c => c + 1);
  };

  const handleCustomSubmit = (event) => {
    event.preventDefault(); 
    handleLookup();
    if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
    }
  };

  return (
    <AuthForm>
      <div 
        className="App"
        style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          height: '100%', 
          width: '100%',
          overflow: 'hidden' 
        }} 
      >
        {/* CONTROL BAR */}
        <div style={{ 
          flex: '0 0 auto', 
          color: '#d1d4dc', 
          background: '#2d2d2d', 
          padding: '5px 10px', 
          display: 'flex', 
          alignItems: 'center', 
          gap: '10px', 
          flexWrap: 'wrap',
          zIndex: 20,
          borderBottom: '1px solid #444'
        }}>
          
          {/* Symbol Selector */}
          <span>
            <label style={{ marginRight: '5px' }}>Symbol:</label>
            <select 
              value={inputSymbol}
              onChange={handleSymbolChange}
              style={{ padding: '5px', backgroundColor: '#3c3c3c', color: 'white', border: '1px solid #555' }}
            >
              {Object.keys(assetCategories).map(category => (
                <optgroup key={category} label={category}>
                  {assetCategories[category].map(asset => (
                    <option key={asset} value={asset}>
                      {asset}
                    </option>
                  ))}
                </optgroup>
              ))}
              <option value="CUSTOM">Custom...</option>
            </select>

            {inputSymbol === 'CUSTOM' && (
              <form 
                onSubmit={handleCustomSubmit} 
                style={{ display: 'inline-block', margin: 0, padding: 0 }}
              >
                <input 
                  type="text"
                  value={inputCustomSymbol}
                  onChange={handleCustomSymbolChange}
                  onBlur={() => setInputCustomSymbol(inputCustomSymbol.toUpperCase())}
                  placeholder="Type & Press Enter"
                  enterKeyHint="search"
                  inputMode="text"
                  style={{ 
                    padding: '5px', 
                    backgroundColor: '#3c3c3c', 
                    color: 'white', 
                    border: '1px solid #555', 
                    width: '100px', 
                    marginLeft: '5px' 
                  }}
                />
              </form>
            )}
          </span>

          {/* Interval Selector */}
          <span>
            <label style={{ marginRight: '5px' }}>Interval:</label>
            <select 
              value={inputInterval} 
              onChange={handleIntervalChange}
              style={{ padding: '5px', backgroundColor: '#3c3c3c', color: 'white', border: '1px solid #555' }}
            >
              <option value="1min">1min</option>
              <option value="5min">5min</option>
              <option value="15min">15min</option>
              <option value="30min">30min</option>
              <option value="1h">1H</option>
              <option value="4h">4H</option>
              <option value="1day">Daily</option>
              <option value="1week">Weekly</option>
              <option value="1month">Monthly</option>
            </select>
          </span>
          
          {/* Toggles */}
          <span style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <label style={{ color: inputShowHotspots ? '#ffeb3b' : '#d1d4dc', display: 'flex', alignItems: 'center' }}>
              <input type="checkbox" checked={inputShowHotspots} onChange={handleShowHotspotsToggle} style={{ marginRight: '4px' }} />
              HotSpots
            </label>

            <label style={{ color: inputShowForecast ? '#ff00ff' : '#d1d4dc', display: 'flex', alignItems: 'center' }}>
              <input type="checkbox" checked={inputShowForecast} onChange={handleShowForecastToggle} style={{ marginRight: '4px' }} />
              Forecast
            </label>
            
            <label style={{ color: inputAutoUpdate ? '#00bcd4' : '#d1d4dc', display: 'flex', alignItems: 'center' }}>
              <input type="checkbox" checked={inputAutoUpdate} onChange={handleAutoUpdateToggle} style={{ marginRight: '4px' }} />
              Auto
            </label>
          </span>

          {/* --- FORWARD TEST BUTTON --- */}
          <button
            onClick={() => setShowForwardTest(true)}
            style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                background: '#00c853', color: 'white', border: 'none', 
                borderRadius: '4px', padding: '5px 12px', cursor: 'pointer',
                fontSize: '0.9rem',
                marginLeft: 'auto', // Pushes buttons to the right
                marginRight: '10px'
            }}
            title="View Forward Test Results"
          >
            <FlaskConical size={16} />
            Test
          </button>
          
          {/* --- MONITOR BUTTON (New) --- */}
          <button
            onClick={() => {
                if (isMonitoring) {
                    if (window.confirm("Stop Monitoring?")) stopMonitor();
                } else {
                    setShowMonitorModal(true);
                }
            }}
            className={isMonitoring ? 'flashing-monitor' : ''}
            style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                background: isMonitoring ? '#e65100' : 'transparent', 
                color: isMonitoring ? 'white' : '#ff9800', 
                border: '1px solid #ff9800',
                borderRadius: '4px', padding: '5px 12px', cursor: 'pointer',
                fontSize: '0.9rem',
                marginRight: '10px'
            }}
            title={isMonitoring ? `Monitoring ${monitorInterval} (Click to Stop)` : "Start Market Monitor"}
          >
            <Activity size={16} />
            MON
          </button>

          {/* --- ANALYSIS BUTTON --- */}
          <button
            onClick={() => setShowAnalysis(!showAnalysis)}
            style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                background: '#e600adff', color: '#d1d4dc', border: '1px solid #444',
                borderRadius: '4px', padding: '5px 12px', cursor: 'pointer',
                fontSize: '0.9rem',
                marginRight: '10px'
            }}
            title="Deep Analysis"
          >
            <Activity size={16} />
            DA
          </button>

          {/* --- SCANNER BUTTON --- */}
          <button
            onClick={() => setShowScanner(true)}
            style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                background: '#0078d4', color: 'white', border: 'none',
                borderRadius: '4px', padding: '5px 12px', cursor: 'pointer',
                fontSize: '0.9rem'
            }}
            title="Scan market for signals"
          >
            <Radar size={16} />
            Scan
          </button>

        </div>

        {/* CHART WRAPPER */}
        <div 
          className="ChartWrapper"
          style={{ 
            flex: '1 1 auto', 
            position: 'relative', 
            overflow: 'hidden',
            width: '100%',
            minHeight: 0 
          }} 
        >
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
            />
          </div>
        </div>

        {/* --- MODALS --- */}
        {showScanner && (
            <ScannerModal 
                interval={inputInterval} 
                onClose={() => setShowScanner(false)}
                onSelectAsset={(symbol) => {
                    setInputSymbol(symbol);
                }}
            />
        )}
        
        {showAnalysis && (
            <AnalysisModal
                symbol={finalSymbol}
                interval={inputInterval}
                onClose={() => setShowAnalysis(false)}
            />
        )}

        {showForwardTest && (
            <ForwardTestModal 
                onClose={() => setShowForwardTest(false)}
            />
        )}
        
        {showMonitorModal && (
            <MonitorModal 
                onClose={() => setShowMonitorModal(false)}
                onStart={toggleMonitor}
            />
        )}

      </div>

      <div className="RotateNotifier">
        <p>Please rotate your device to portrait mode</p>
      </div>
    </AuthForm>
  );
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/auth" element={<Platform />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;