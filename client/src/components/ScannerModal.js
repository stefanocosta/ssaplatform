import React, { useState, useEffect } from 'react';
import { X, RefreshCw, TrendingUp, TrendingDown, AlertCircle, ChevronLeft, ChevronRight, Minus, Filter, Maximize2, Minimize2 } from 'lucide-react';

const ScannerModal = ({ onClose, interval, onSelectAsset }) => {
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeSymbol, setActiveSymbol] = useState(null);
    const [isCollapsed, setIsCollapsed] = useState(false); // Minimized to side tab
    const [isDetailed, setIsDetailed] = useState(true);   // Toggle between Full/Compact view
    
    const [showSignalsOnly, setShowSignalsOnly] = useState(false);

    useEffect(() => {
        scanMarket();
    }, []);

    const scanMarket = async () => {
        setLoading(true);
        const token = localStorage.getItem('access_token');
        try {
            const response = await fetch(`/api/scan?interval=${interval}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            if (Array.isArray(data)) {
                setResults(data);
            }
        } catch (error) {
            console.error("Scan failed", error);
        } finally {
            setLoading(false);
        }
    };

    const handleSignalClick = (symbol) => {
        onSelectAsset(symbol);
        setActiveSymbol(symbol);
        setIsCollapsed(true);
    };

    const getPctColor = (val) => {
        if (val >= 80) return '#ef5350'; 
        if (val <= 20) return '#26a69a'; 
        return '#b0b0b0'; 
    };

    const displayedResults = showSignalsOnly 
        ? results.filter(r => r.signal !== null)
        : results;

    if (isCollapsed) {
        return (
            <div 
                onClick={() => setIsCollapsed(false)}
                style={{
                    position: 'fixed', right: 0, top: '150px', 
                    backgroundColor: '#0078d4', color: 'white',
                    padding: '10px 4px 10px 8px',
                    borderTopLeftRadius: '8px', borderBottomLeftRadius: '8px',
                    cursor: 'pointer', zIndex: 1000,
                    boxShadow: '-2px 0 10px rgba(0,0,0,0.5)',
                    display: 'flex', alignItems: 'center'
                }}
            >
                <ChevronLeft size={24} />
                <span style={{ writingMode: 'vertical-rl', textOrientation: 'mixed', fontSize: '12px', fontWeight: 'bold', marginTop: '10px' }}>SCANNER</span>
            </div>
        );
    }

    // --- DYNAMIC GRID LAYOUT ---
    // Detailed: Tightened spacing (1.1fr asset, tighter stats)
    const detailedGrid = '1.1fr 0.3fr 0.4fr 0.4fr 0.3fr 0.75fr 0.6fr 0.5fr';
    // Compact: Just Asset and Signal
    const compactGrid = '1.5fr 0.5fr';

    const currentGrid = isDetailed ? detailedGrid : compactGrid;
    const currentWidth = isDetailed ? '620px' : '260px'; // Resize modal based on view

    return (
        <div style={{
            position: 'fixed', top: '90px', right: '20px', bottom: '20px', 
            width: currentWidth, 
            maxWidth: '95vw',
            backgroundColor: 'rgba(30, 30, 30, 0.98)', backdropFilter: 'blur(10px)',
            borderRadius: '12px', border: '1px solid #444',
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 4px 30px rgba(0,0,0,0.7)', zIndex: 1000,
            transition: 'width 0.2s ease-in-out', // Smooth resize animation
            animation: 'slideIn 0.3s ease-out'
        }}>
            {/* HEADER */}
            <div style={{ 
                padding: '12px 10px', borderBottom: '1px solid #444', 
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                backgroundColor: '#252525', borderTopLeftRadius: '12px', borderTopRightRadius: '12px'
            }}>
                <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                    <h2 style={{ color: '#d1d4dc', margin: 0, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <RefreshCw className={loading ? 'spinner' : ''} size={14} />
                        {isDetailed ? `Scanner (${interval})` : interval}
                    </h2>

                    {/* FILTER TOGGLE (Only show in detailed view to save space) */}
                    {isDetailed && (
                        <label style={{ 
                            display: 'flex', alignItems: 'center', gap: '4px', 
                            fontSize: '0.75rem', color: showSignalsOnly ? '#fff' : '#888',
                            cursor: 'pointer', background: '#333', padding: '2px 6px', borderRadius: '4px'
                        }}>
                            <input 
                                type="checkbox" 
                                checked={showSignalsOnly} 
                                onChange={e => setShowSignalsOnly(e.target.checked)}
                                style={{accentColor: '#0078d4', width:'12px', height:'12px'}}
                            />
                            Signals Only
                        </label>
                    )}
                </div>

                <div style={{ display: 'flex', gap: '2px' }}>
                    {/* EXPAND/COLLAPSE BUTTON */}
                    <button 
                        onClick={() => setIsDetailed(!isDetailed)} 
                        title={isDetailed ? "Compact View" : "Detailed View"}
                        style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', padding:'2px' }}
                    >
                        {isDetailed ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                    </button>
                    
                    <button onClick={() => setIsCollapsed(true)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', padding:'2px' }}><Minus size={18} /></button>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', padding:'2px' }}><X size={18} /></button>
                </div>
            </div>

            {/* CONTENT */}
            <div style={{ padding: '8px', overflowY: 'auto', flexGrow: 1 }}>
                {loading ? (
                    <div style={{ padding: '40px 10px', textAlign: 'center', color: '#888' }}>
                        <RefreshCw className="spinner" size={24} style={{ marginBottom: '15px', opacity: 0.7 }} />
                        <p style={{fontSize: '0.8rem'}}>Scanning...</p>
                    </div>
                ) : displayedResults.length === 0 ? (
                    <div style={{ padding: '40px 10px', textAlign: 'center', color: '#888' }}>
                        <AlertCircle size={24} style={{ marginBottom: '10px', opacity: 0.5 }} />
                        <p style={{fontSize: '0.8rem'}}>No results.</p>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gap: '3px' }}>
                        {/* COLUMN HEADER */}
                        <div style={{ 
                            display: 'grid', 
                            gridTemplateColumns: currentGrid, 
                            padding: '0 6px 4px 6px', fontSize: '0.65rem', color: '#888', fontWeight: 'bold', letterSpacing: '0.5px'
                        }}>
                            <span>ASSET</span>
                            
                            {/* DETAILED COLUMNS */}
                            {isDetailed && (
                                <>
                                    <span style={{textAlign:'center'}}>TRND</span>
                                    <span style={{textAlign:'center'}}>CYC</span>
                                    <span style={{textAlign:'center'}}>FST</span>
                                    <span style={{textAlign:'center'}}>FCST</span>
                                    <span style={{textAlign:'center'}}>POS (AGE)</span>
                                    <span style={{textAlign:'right'}}>PnL %</span>
                                </>
                            )}
                            
                            <span style={{textAlign:'right'}}>ACTIVE</span>
                        </div>

                        {/* ROW RENDERING */}
                        {displayedResults.map((item, idx) => {
                            const isActive = activeSymbol === item.symbol;
                            const pnlValue = item.pnl_pct !== undefined && item.pnl_pct !== null ? item.pnl_pct : 0;
                            const hasPosition = item.position && item.position !== 'NEUTRAL';

                            return (
                                <div 
                                    key={idx}
                                    onClick={() => handleSignalClick(item.symbol)}
                                    style={{
                                        display: 'grid', 
                                        gridTemplateColumns: currentGrid,
                                        alignItems: 'center',
                                        backgroundColor: isActive ? '#404040' : (idx % 2 === 0 ? '#2a2a2a' : '#252525'), 
                                        border: isActive ? '1px solid #0078d4' : '1px solid transparent',
                                        padding: '6px 6px', borderRadius: '4px',
                                        cursor: 'pointer', 
                                        borderLeft: item.signal 
                                            ? `3px solid ${item.signal === 'BUY' ? '#00ff00' : '#ff0000'}`
                                            : (pnlValue > 0 ? '3px solid #4caf50' : '3px solid transparent'),
                                        transition: 'all 0.1s'
                                    }}
                                >
                                    {/* 1. ASSET */}
                                    <div style={{overflow: 'hidden'}}>
                                        <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '0.8rem', whiteSpace:'nowrap' }}>{item.symbol}</div>
                                        {isDetailed && (
                                            <div style={{ color: '#666', fontSize: '0.65rem' }}>{item.price.toFixed(item.price < 1 ? 4 : 2)}</div>
                                        )}
                                    </div>

                                    {/* DETAILED COLUMNS */}
                                    {isDetailed && (
                                        <>
                                            {/* 2. TREND */}
                                            <div style={{ display: 'flex', justifyContent: 'center' }}>
                                                {item.trend_dir === 'UP' ? <TrendingUp size={14} color="#26a69a" /> : <TrendingDown size={14} color="#ef5350" />}
                                            </div>

                                            {/* 3. CYC % */}
                                            <div style={{ textAlign: 'center', fontSize: '0.75rem', color: getPctColor(item.cycle_pct) }}>{item.cycle_pct}</div>

                                            {/* 4. FAST % */}
                                            <div style={{ textAlign: 'center', fontSize: '0.75rem', color: getPctColor(item.fast_pct) }}>{item.fast_pct}</div>

                                            {/* 5. FCST */}
                                            <div style={{ display: 'flex', justifyContent: 'center' }}>
                                                {item.forecast_dir === 'UP' ? <TrendingUp size={14} color="#26a69a" /> : (item.forecast_dir === 'DOWN' ? <TrendingDown size={14} color="#ef5350" /> : <Minus size={14} color="#666"/>)}
                                            </div>

                                            {/* 6. POSITION (AGE) */}
                                            <div style={{ textAlign: 'center', fontSize: '0.7rem' }}>
                                                {hasPosition ? (
                                                    <>
                                                        <span style={{color: item.position==='LONG'?'#4caf50':'#ef5350', fontWeight:'bold'}}>
                                                            {item.position.charAt(0)}
                                                        </span>
                                                        <span style={{color:'#888'}}> ({item.bars_ago})</span>
                                                    </>
                                                ) : <span style={{color:'#444'}}>-</span>}
                                            </div>

                                            {/* 7. PNL */}
                                            <div style={{ textAlign: 'right', fontSize: '0.75rem', fontWeight:'bold', color: pnlValue > 0 ? '#4caf50' : (pnlValue < 0 ? '#ef5350' : '#666') }}>
                                                {hasPosition ? (pnlValue > 0 ? '+' : '') + pnlValue + '%' : '-'}
                                            </div>
                                        </>
                                    )}

                                    {/* 8. ACTIVE SIGNAL (Always Visible) */}
                                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                        {item.signal ? (
                                            <div style={{ 
                                                color: item.signal === 'BUY' ? '#00ff00' : '#ff0000',
                                                fontWeight: 'bold', fontSize: '0.7rem',
                                                background: 'rgba(0,0,0,0.3)', padding: '2px 4px', borderRadius: '3px'
                                            }}>
                                                {item.signal}
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
            
            <style>{`
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                .spinner { animation: spin 1s linear infinite; display: inline-block; }
                @keyframes slideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
                ::-webkit-scrollbar { width: 4px; }
                ::-webkit-scrollbar-track { background: #222; }
                ::-webkit-scrollbar-thumb { background: #444; borderRadius: 2px; }
                ::-webkit-scrollbar-thumb:hover { background: #555; }
            `}</style>
        </div>
    );
};

export default ScannerModal;