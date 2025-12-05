import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'; 
import { Radar, Activity } from 'lucide-react'; // Added Activity icon
import TradingChart from './components/TradingChart';
import AuthForm from './components/AuthForm'; 
import LandingPage from './components/LandingPage'; 
import ScannerModal from './components/ScannerModal'; 
import AnalysisModal from './components/AnalysisModal'; // Import Analysis Modal
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
  const [showAnalysis, setShowAnalysis] = useState(false); // New State
  
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

  const handleSymbolChange = (event) => {
    setInputSymbol(event.target.value);
  };

  const handleCustomSymbolChange = (event) => {
    setInputCustomSymbol(event.target.value);
  };

  const handleIntervalChange = (event) => {
    setInputInterval(event.target.value);

    // --- FIX: Close Scanner/Analysis when timeframe changes ---
    setShowScanner(false);
    setShowAnalysis(false);
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

          {/* --- ANALYSIS BUTTON --- */}
          <button
            onClick={() => setShowAnalysis(!showAnalysis)}
            style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                background: '#2a2a2a', color: '#d1d4dc', border: '1px solid #444',
                borderRadius: '4px', padding: '5px 12px', cursor: 'pointer',
                fontSize: '0.9rem',
                marginLeft: 'auto', // Pushes this and subsequent elements to the right
                marginRight: '10px'
            }}
            title="Deep Analysis"
          >
            <Activity size={16} />
            Analysis
          </button>

          {/* --- SCANNER BUTTON --- */}
          <button
            onClick={() => setShowScanner(true)}
            style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                background: '#0078d4', color: 'white', border: 'none',
                borderRadius: '4px', padding: '5px 12px', cursor: 'pointer',
                fontSize: '0.9rem'
                // Removed marginLeft: auto, so it sits right next to Analysis
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

        {/* --- SCANNER MODAL --- */}
        {showScanner && (
            <ScannerModal 
                interval={inputInterval} 
                onClose={() => setShowScanner(false)}
                onSelectAsset={(symbol) => {
                    setInputSymbol(symbol);
                }}
            />
        )}
        
        {/* --- ANALYSIS MODAL --- */}
        {showAnalysis && (
            <AnalysisModal
                symbol={finalSymbol}
                interval={inputInterval}
                onClose={() => setShowAnalysis(false)}
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