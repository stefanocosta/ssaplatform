import React, { useState, useEffect } from 'react';
import TradingChart from './components/TradingChart';
import PasswordProtection from './components/PasswordProtection'; // Add this import
import './App.css';

function App() {
  // State for the input fields
  const [inputSymbol, setInputSymbol] = useState('BTC/USD'); 
  const [inputCustomSymbol, setInputCustomSymbol] = useState(''); 
  const [inputInterval, setInputInterval] = useState('1day');
  const [inputLValue, setInputLValue] = useState(30);
  const [inputUseAdaptiveL, setInputUseAdaptiveL] = useState(true);
  const [inputIsLive, setInputIsLive] = useState(false);
  const [inputAutoUpdate, setInputAutoUpdate] = useState(false);
  const [inputShowHotspots, setInputShowHotspots] = useState(true); 
  const [lookupCount, setLookupCount] = useState(0);
  const [finalSymbol, setFinalSymbol] = useState('BTC/USD');

  const TWELVE_DATA_API_KEY = process.env.REACT_APP_TWELVE_DATA_API_KEY;

  const assetCategories = {
    'Crypto': ['BTC/USD', 'ETH/USD', 'ADA/USD', 'BNB/USD', 'XRP/USD', 'SOL/USD', 'FET/USD','ICP/USD'],
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
    <PasswordProtection>
      <div className="App">
          <h1 style={{ 
             color: '#d1d4dc', 
             flexShrink: 0,
             fontSize: '1.2rem',
             margin: '10px 0'
           }}>
           SSA Trading Platform
          </h1>

        <div style={{ 
          marginBottom: '10px', 
          color: '#d1d4dc', 
          background: '#2d2d2d', 
          padding: '15px', 
          borderRadius: '5px', 
          display: 'flex', 
          alignItems: 'center', 
          gap: '15px', 
          flexWrap: 'wrap',
          flexShrink: 0 
        }}>
          
          <span>
            <label style={{ marginRight: '5px' }}>Symbol:</label>
            <select 
              value={inputSymbol}
              onChange={handleSymbolChange}
              style={{ 
                  padding: '5px', 
                  backgroundColor: '#3c3c3c', 
                  color: 'white', 
                  border: '1px solid #555'
              }}
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
                autoFocus
                style={{ 
                    padding: '5px', 
                    backgroundColor: '#3c3c3c', 
                    color: 'white', 
                    border: '1px solid #555',
                    width: '120px', 
                    marginLeft: '10px' 
                }}
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
          
          <span>
            <input 
              type="checkbox" 
              id="showHotspots" 
              checked={inputShowHotspots} 
              onChange={handleShowHotspotsToggle}
              style={{ marginRight: '5px', verticalAlign: 'middle' }}
            />
            <label 
              htmlFor="showHotspots" 
              style={{ 
                verticalAlign: 'middle',
                color: inputShowHotspots ? '#ffeb3b' : '#d1d4dc', 
                fontWeight: inputShowHotspots ? 'bold' : 'normal'
              }}
            >
              HotSpots
            </label>
          </span>

          <span>
            <input 
              type="checkbox" 
              id="autoUpdateMode" 
              checked={inputAutoUpdate} 
              onChange={handleAutoUpdateToggle}
              style={{ marginRight: '5px', verticalAlign: 'middle' }}
            />
            <label 
              htmlFor="autoUpdateMode" 
              style={{ 
                verticalAlign: 'middle',
                color: inputAutoUpdate ? '#00bcd4' : '#d1d4dc',
                fontWeight: inputAutoUpdate ? 'bold' : 'normal'
              }}
            >
              Auto(1m)
            </label>
          </span>
          
          <span>
            <input 
              type="checkbox" 
              id="liveMode" 
              checked={inputIsLive} 
              onChange={handleLiveToggle}
              style={{ marginRight: '5px', verticalAlign: 'middle' }}
            />
            <label 
              htmlFor="liveMode" 
              style={{ 
                verticalAlign: 'middle',
                color: inputIsLive ? '#00ff00' : '#d1d4dc',
                fontWeight: inputIsLive ? 'bold' : 'normal'
              }}
            >
              Live
            </label>
          </span>
        </div>

        <div className="ChartWrapper">
          <TradingChart
            key={`${finalSymbol}-${inputInterval}-${inputLValue}-${inputUseAdaptiveL}-${lookupCount}`}
            symbol={finalSymbol}
            interval={inputInterval}
            lValue={inputLValue}
            useAdaptiveL={inputUseAdaptiveL}
            apiKey={TWELVE_DATA_API_KEY}
            enableRealtime={inputIsLive}
            autoUpdate={inputAutoUpdate}
            showHotspots={inputShowHotspots} 
          />
        </div>
      </div>

      <div className="RotateNotifier">
        <p>Please rotate your device to portrait mode</p>
        <p>This app is not designed for landscape view.</p>
      </div>
    </PasswordProtection>
  );
}

export default App;