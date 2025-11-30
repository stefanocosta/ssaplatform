import React, { useState, useEffect } from 'react';
import TradingChart from './components/TradingChart';
import AuthForm from './components/AuthForm'; 
import './App.css';

function App() {
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
  
  const TWELVE_DATA_API_KEY = process.env.REACT_APP_TWELVE_DATA_API_KEY;

  const assetCategories = {
    'Crypto': ['XAU/USD','BTC/USD', 'ETH/USD', 'ADA/USD', 'BNB/USD', 'XRP/USD', 'SOL/USD', 'FET/USD','ICP/USD'],
    'Forex': ['EUR/USD', 'EUR/CAD', 'EUR/AUD','EUR/JPY', 'EUR/GBP','AUD/CAD','AUD/USD','GBP/CAD', 'GBP/USD', 'USD/CAD', 'USD/CHF', 'USD/JPY'],
    'Stocks': ['AAPL', 'AMZN', 'GOOG', 'NVDA', 'META']
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
  };

  const handleLiveToggle = (event) => {
    setInputIsLive(event.target.checked);
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

  const handleSymbolKeyPress = (event) => {
    if (event.key === 'Enter') {
      handleLookup();
    }
  };

  return (
    <AuthForm>
      <div 
        className="App"
        style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          height: '100%', // Fill the AuthForm container
          width: '100%',
          overflow: 'hidden' 
        }} 
      >
        {/* CONTROL BAR - Fixed Height (Auto) */}
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
              <input 
                type="text"
                value={inputCustomSymbol}
                onChange={handleCustomSymbolChange}
                onKeyPress={handleSymbolKeyPress} 
                onBlur={() => setInputCustomSymbol(inputCustomSymbol.toUpperCase())}
                placeholder="Type & Press Enter"
                style={{ padding: '5px', backgroundColor: '#3c3c3c', color: 'white', border: '1px solid #555', width: '100px', marginLeft: '5px' }}
              />
            )}
          </span>

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
            
            <label style={{ color: inputIsLive ? '#00ff00' : '#d1d4dc', display: 'flex', alignItems: 'center' }}>
              <input type="checkbox" checked={inputIsLive} onChange={handleLiveToggle} style={{ marginRight: '4px' }} />
              Live
            </label>
          </span>
        </div>

        {/* CHART WRAPPER - Flex Grow with Relative Positioning */}
        <div 
          className="ChartWrapper"
          style={{ 
            flex: '1 1 auto', 
            position: 'relative', // Key: establish stacking context
            overflow: 'hidden',
            width: '100%',
            minHeight: 0 // Allow shrinking
          }} 
        >
          {/* Absolute positioning forces the chart to fill the wrapper exactly */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
            <TradingChart
             // key={`${finalSymbol}-${inputInterval}-${inputLValue}-${inputUseAdaptiveL}-${lookupCount}`}
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
      </div>

      <div className="RotateNotifier">
        <p>Please rotate your device to portrait mode</p>
      </div>
    </AuthForm>
  );
}

export default App;