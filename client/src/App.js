import React, { useState } from 'react';
import TradingChart from './components/TradingChart';
import './App.css'; // Assuming you created this basic CSS file

function App() {
  // State for the input fields
  const [inputSymbol, setInputSymbol] = useState('BTC/USD');
  const [inputInterval, setInputInterval] = useState('1day');
  const [inputLValue, setInputLValue] = useState(30);
  const [inputUseAdaptiveL, setInputUseAdaptiveL] = useState(true);

  // State for the chart props (updated only on button click)
  const [chartSymbol, setChartSymbol] = useState('BTC/USD');
  const [chartInterval, setChartInterval] = useState('1day');
  const [chartLValue, setChartLValue] = useState(30);
  const [chartUseAdaptiveL, setChartUseAdaptiveL] = useState(true);

  // --- Handlers for Input Changes ---
  const handleSymbolChange = (event) => {
    setInputSymbol(event.target.value.toUpperCase());
  };

  const handleIntervalChange = (event) => {
    setInputInterval(event.target.value);
  };

  const handleLChange = (event) => {
    if (!inputUseAdaptiveL) {
       const val = parseInt(event.target.value);
       if (!isNaN(val) && val >= 2) {
          setInputLValue(val);
       } else if (event.target.value === '') {
          setInputLValue('');
       }
    }
  };

   const handleLBlur = (event) => {
     if (event.target.value === '') {
        setInputLValue(30);
     }
  };

  const handleAdaptiveLToggle = (event) => {
    setInputUseAdaptiveL(event.target.checked);
  };

  // --- Handler for Lookup Button ---
  const handleLookup = () => {
    // Update the chart props with the current input values
    setChartSymbol(inputSymbol);
    setChartInterval(inputInterval);
    // Ensure L is a number before setting
    setChartLValue(Number.isInteger(inputLValue) ? inputLValue : 30);
    setChartUseAdaptiveL(inputUseAdaptiveL);
  };

  // Handle Enter key in symbol input
   const handleSymbolKeyPress = (event) => {
     if (event.key === 'Enter') {
       handleLookup();
     }
   };


  return (
    <div className="App" style={{ backgroundColor: '#1e1e1e', minHeight: '100vh', padding: '20px' }}>
      {/* Fixed title color */}
      <h1 style={{ color: '#d1d4dc' }}>SSA Trading Platform (React Prototype)</h1>

      {/* --- Controls Section --- */}
      <div style={{ marginBottom: '20px', color: '#d1d4dc', background: '#2d2d2d', padding: '15px', borderRadius: '5px', display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
        <span>
          <label style={{ marginRight: '5px' }}>Symbol:</label>
          <input type="text" value={inputSymbol}
                 onChange={handleSymbolChange}
                 onKeyPress={handleSymbolKeyPress}
                 style={{ padding: '5px', backgroundColor: '#3c3c3c', color: 'white', border: '1px solid #555' }}/>
        </span>
        <span>
          <label style={{ marginRight: '5px' }}>Interval:</label>
          <select value={inputInterval} onChange={handleIntervalChange}
                  style={{ padding: '5px', backgroundColor: '#3c3c3c', color: 'white', border: '1px solid #555' }}>
            <option value="1week">Weekly</option>
            <option value="1day">Daily</option>
            <option value="4h">4H</option>
            <option value="1h">1H</option>
            <option value="15min">15min</option>
          </select>
        </span>
        <span>
          <label style={{ marginRight: '5px' }}>L:</label>
          <input type="number" value={inputLValue} min="2" step="1"
                 onChange={handleLChange}
                 onBlur={handleLBlur}
                 disabled={inputUseAdaptiveL}
                 style={{ width: '50px', padding: '5px', backgroundColor: inputUseAdaptiveL ? '#555' : '#3c3c3c', color: 'white', border: '1px solid #555' }}/>
        </span>
        <span>
          <input type="checkbox" id="adaptiveL" checked={inputUseAdaptiveL} onChange={handleAdaptiveLToggle}
                 style={{ marginRight: '5px', verticalAlign: 'middle' }}/>
          <label htmlFor="adaptiveL" style={{ verticalAlign: 'middle' }}>Adaptive L</label>
        </span>
        {/* Added Lookup Button */}
        <button onClick={handleLookup} style={{ padding: '6px 15px', cursor: 'pointer', backgroundColor: '#0078d4', color: 'white', border: 'none', borderRadius: '4px' }}>
           Lookup
        </button>
      </div>

      {/* --- Chart Component --- */}
      {/* Pass the chart state variables & Added key */}
      <TradingChart
         key={`${chartSymbol}-${chartInterval}-${chartLValue}-${chartUseAdaptiveL}`}
         symbol={chartSymbol}
         interval={chartInterval}
         lValue={chartLValue}
         useAdaptiveL={chartUseAdaptiveL}
      />
    </div>
  );
}

export default App;