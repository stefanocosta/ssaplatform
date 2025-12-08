import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'; 
import { Radar, Activity, FlaskConical } from 'lucide-react'; 
import TradingChart from './components/TradingChart';
import AuthForm from './components/AuthForm'; 
import LandingPage from './components/LandingPage'; 
import ScannerModal from './components/ScannerModal'; 
import AnalysisModal from './components/AnalysisModal'; 
import ForwardTestModal from './components/ForwardTestModal'; 
import MonitorModal from './components/MonitorModal'; // NEW IMPORT
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
  const [monitorInterval, setMonitorInterval] = useState(null); // '15min', '1h' etc
  
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

  // --- MONITORING LOGIC ---
  useEffect(() => {
    let timerId;
    let keepAliveId;

    if (isMonitoring && monitorInterval) {
        console.log(`Creating Monitor Loop for ${monitorInterval}`);

        // 1. KEEP ALIVE (Ping every 5 mins to prevent idle logout)
        keepAliveId = setInterval(async () => {
             const token = localStorage.getItem('access_token');
             try { await fetch('/api/user-info', { headers: { 'Authorization': `Bearer ${token}` } }); } catch(e){}
        }, 5 * 60 * 1000);

        // 2. SCANNER LOOP
        const checkTimeAndScan = async () => {
            const now = new Date();
            const min = now.getMinutes();
            const sec = now.getSeconds();

            // Determine if we should scan based on interval
            let shouldScan = false;
            
            // We scan at the very start of the minute (second === 0)
            // But to be safe against lag, we check if seconds < 5
            if (sec < 5) {
                if (monitorInterval === '1min') shouldScan = true;
                else if (monitorInterval === '5min' && min % 5 === 0) shouldScan = true;
                else if (monitorInterval === '15min' && min % 15 === 0) shouldScan = true;
                else if (monitorInterval === '30min' && min % 30 === 0) shouldScan = true;
                else if (monitorInterval === '1h' && min === 0) shouldScan = true;
                else if (monitorInterval === '4h' && min === 0 && now.getHours() % 4 === 0) shouldScan = true;
            }

            if (shouldScan) {
                console.log("🔔 Monitor Triggered: Scanning Market...");
                const token = localStorage.getItem('access_token');
                try {
                    // Call the existing Scan Endpoint
                    const res = await fetch(`/api/scan?interval=${monitorInterval}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const results = await res.json();
                    
                    // Filter for Active Signals
                    const signals = results.filter(r => r.signal === 'BUY' || r.signal === 'SELL');
                    
                    if (signals.length > 0) {
                        // SEND BROWSER NOTIFICATION
                        if (Notification.permission === "granted") {
                            const body = signals.map(s => `${s.symbol}: ${s.signal}`).join('\n');
                            new Notification(`🚨 ${signals.length} Signals Detected!`, {
                                body: body,
                                icon: '/favicon.ico' // Ensure you have an icon or remove this line
                            });
                        }
                        // Optional: Play a sound
                        // const audio = new Audio('/alert.mp3'); audio.play();
                    }
                } catch (err) {
                    console.error("Monitor Scan Failed", err);
                }
                
                // Sleep for 1 minute to avoid double-triggering in the same minute
                // (The interval loop handles the sleep implicitly by waiting for next tick)
            }
        };

        // Check every 5 seconds (sufficient precision)
        timerId = setInterval(checkTimeAndScan, 5000);
    }

    return () => {
        if (timerId) clearInterval(timerId);
        if (keepAliveId) clearInterval(keepAliveId);
    };
  }, [isMonitoring, monitorInterval]);

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