import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, ArrowUp, ArrowDown, Search, Filter, TrendingUp, List, CheckSquare, Square, ChevronDown } from 'lucide-react';

// --- DEFINED ASSETS (Matches Main App) ---
const ASSET_CATEGORIES = {
    'Crypto': ['XAU/USD','BTC/USD', 'ETH/USD', 'ADA/USD', 'BNB/USD', 'DOGE/USD', 'XRP/USD', 'SOL/USD', 'FET/USD','ICP/USD'],
    'Forex': ['EUR/USD', 'EUR/CAD', 'EUR/AUD','EUR/JPY', 'EUR/GBP','AUD/CAD','AUD/USD','GBP/CAD', 'GBP/USD', 'USD/CAD', 'USD/CHF', 'USD/JPY'],
    'Stocks': ['AAPL', 'AMZN', 'GOOG', 'MSFT','NVDA', 'META', 'TSLA', 'NFLX']
};

// Flatten to a single sorted list for the dropdown logic if needed, 
// but we mostly use categories now.
const ALL_ASSETS = Object.values(ASSET_CATEGORIES).flat().sort();

// --- INTERNAL COMPONENT: FULL SCREEN EQUITY CHART ---
const LargeEquityChart = ({ trades }) => {
    const [hoveredPoint, setHoveredPoint] = useState(null);
    const containerRef = useRef(null);

    // 1. Prepare Data
    const chartData = useMemo(() => {
        const sorted = [...trades]
            .filter(t => t.status === 'CLOSED')
            .sort((a, b) => new Date(a.entry_date) - new Date(b.entry_date));
        
        let currentEquity = 1000; // Base Capital
        const points = [{ date: 'Start', val: currentEquity, trade: null }];

        sorted.forEach(t => {
            currentEquity += (t.pnl || 0);
            points.push({
                date: t.entry_date,
                val: currentEquity,
                trade: t
            });
        });

        return points;
    }, [trades]);

    if (!chartData || chartData.length < 2) {
        return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>Not enough closed trades to plot.</div>;
    }

    // 2. Dimensions
    const width = 1000;
    const height = 400;
    const padding = 50;

    const minVal = Math.min(...chartData.map(d => d.val));
    const maxVal = Math.max(...chartData.map(d => d.val));
    const range = (maxVal - minVal) || 1;
    
    const yMin = minVal - (range * 0.05);
    const yMax = maxVal + (range * 0.05);
    const finalRange = yMax - yMin;

    const getX = (index) => padding + (index / (chartData.length - 1)) * (width - padding * 2);
    const getY = (val) => height - padding - ((val - yMin) / finalRange) * (height - padding * 2);

    const pathD = chartData.map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d.val)}`).join(' ');
    const zeroY = getY(1000);

    const handleMouseMove = (e) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const svgX = (e.clientX - rect.left) / rect.width * width;
        
        let closestDist = Infinity;
        let closest = null;
        
        chartData.forEach((d, i) => {
            const px = getX(i);
            const dist = Math.abs(svgX - px);
            if (dist < closestDist) {
                closestDist = dist;
                closest = d;
            }
        });
        setHoveredPoint(closest);
    };

    return (
        <div 
            ref={containerRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoveredPoint(null)}
            style={{ 
                flex: 1, position: 'relative', 
                background: '#222', borderRadius: '8px', 
                margin: '10px 0', border: '1px solid #444',
                overflow: 'hidden', cursor: 'crosshair'
            }}
        >
            <div style={{ position: 'absolute', top: 10, left: 15, color: '#888', fontSize: '0.8rem' }}>Growth of $1,000 Capital</div>
            <div style={{ position: 'absolute', top: 10, right: 15, fontWeight: 'bold', color: chartData[chartData.length-1].val >= 1000 ? '#00c853' : '#ff3d00' }}>
                ${chartData[chartData.length-1].val.toFixed(2)}
            </div>

            <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
                <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#333" strokeWidth="1" />
                <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#333" strokeWidth="1" />
                
                {zeroY >= padding && zeroY <= height - padding && (
                    <line x1={padding} y1={zeroY} x2={width - padding} y2={zeroY} stroke="#555" strokeWidth="1" strokeDasharray="5" />
                )}

                <path d={pathD} fill="none" stroke="#0078d4" strokeWidth="3" vectorEffect="non-scaling-stroke" />

                <defs>
                    <linearGradient id="chartGrad" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#0078d4" stopOpacity="0.2" />
                        <stop offset="100%" stopColor="#0078d4" stopOpacity="0" />
                    </linearGradient>
                </defs>
                <path d={`${pathD} L ${getX(chartData.length-1)} ${height-padding} L ${padding} ${height-padding} Z`} fill="url(#chartGrad)" stroke="none" />

                {hoveredPoint && (
                    <>
                        <line x1={getX(chartData.indexOf(hoveredPoint))} y1={padding} x2={getX(chartData.indexOf(hoveredPoint))} y2={height - padding} stroke="#fff" strokeWidth="1" strokeDasharray="2" opacity="0.5" />
                        <circle cx={getX(chartData.indexOf(hoveredPoint))} cy={getY(hoveredPoint.val)} r="4" fill="white" />
                    </>
                )}
            </svg>

            {hoveredPoint && (
                <div style={{
                    position: 'absolute', top: '50px', left: '50%', transform: 'translateX(-50%)',
                    background: 'rgba(0,0,0,0.8)', border: '1px solid #555', padding: '8px 12px', 
                    borderRadius: '4px', pointerEvents: 'none', color: '#fff', fontSize: '0.8rem', textAlign: 'center', zIndex: 10
                }}>
                    <div style={{ fontWeight: 'bold' }}>Equity: ${hoveredPoint.val.toFixed(2)}</div>
                    <div style={{ color: '#aaa', fontSize: '0.7rem' }}>{hoveredPoint.date}</div>
                    {hoveredPoint.trade && (
                        <div style={{ marginTop: '4px', paddingTop: '4px', borderTop: '1px solid #444' }}>
                            {hoveredPoint.trade.symbol} ({hoveredPoint.trade.direction})<br/>
                            <span style={{ color: hoveredPoint.trade.pnl >= 0 ? '#00c853' : '#ff3d00' }}>
                                {hoveredPoint.trade.pnl >= 0 ? '+' : ''}{hoveredPoint.trade.pnl.toFixed(2)}
                            </span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

const ForwardTestModal = ({ onClose }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    
    // --- FILTERS STATE ---
    const [filterInterval, setFilterInterval] = useState(null); 
    const [filterStatus, setFilterStatus] = useState('ALL');    
    const [filterDirection, setFilterDirection] = useState('ALL'); 
    const [filterAsset, setFilterAsset] = useState('');
    const [filterTrend, setFilterTrend] = useState('ALL'); 
    const [filterForecast, setFilterForecast] = useState('ALL'); 

    // --- ASSET MULTI-SELECT ---
    const [selectedAssets, setSelectedAssets] = useState(new Set());
    const [showAssetMenu, setShowAssetMenu] = useState(false);

    // --- VIEW MODE ---
    const [showEquity, setShowEquity] = useState(false);

    // --- SORTING ---
    const [sortConfig, setSortConfig] = useState({ key: 'entry_date', direction: 'desc' });

    useEffect(() => {
        const fetchResults = async () => {
            const token = localStorage.getItem('access_token');
            try {
                const res = await fetch('/api/forward-test-results', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const json = await res.json();
                setData(json);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchResults();
    }, []);

    // Toggle Individual Asset
    const toggleAsset = (symbol) => {
        const newSet = new Set(selectedAssets);
        if (newSet.has(symbol)) newSet.delete(symbol);
        else newSet.add(symbol);
        setSelectedAssets(newSet);
    };

    // Toggle Entire Category
    const toggleCategory = (categoryName) => {
        const assetsInCategory = ASSET_CATEGORIES[categoryName];
        
        // Check if all assets in this category are already selected
        const allSelected = assetsInCategory.every(a => selectedAssets.has(a));
        
        const newSet = new Set(selectedAssets);
        if (allSelected) {
            // Deselect all
            assetsInCategory.forEach(a => newSet.delete(a));
        } else {
            // Select all
            assetsInCategory.forEach(a => newSet.add(a));
        }
        setSelectedAssets(newSet);
    };

    // --- FILTER & STATS LOGIC ---
    const dashboardData = useMemo(() => {
        if (!data?.trades) return { trades: [], stats: null };

        const filtered = data.trades.filter(t => {
            if (filterInterval && t.interval !== filterInterval) return false;
            if (filterStatus !== 'ALL' && t.status !== filterStatus) return false;
            if (filterDirection !== 'ALL' && t.direction !== filterDirection) return false;

            // Asset Filter: Check Set OR Search String
            if (selectedAssets.size > 0) {
                if (!selectedAssets.has(t.symbol)) return false;
            } else if (filterAsset) {
                if (!t.symbol.includes(filterAsset.toUpperCase())) return false;
            }

            if (filterTrend !== 'ALL') {
                const isFollow = (t.direction === 'LONG' && t.trend === 'UP') || (t.direction === 'SHORT' && t.trend === 'DOWN');
                if (filterTrend === 'FOLLOW' && !isFollow) return false;
                if (filterTrend === 'COUNTER' && isFollow) return false;
            }
            if (filterForecast !== 'ALL') {
                const isWith = (t.direction === 'LONG' && t.forecast === 'UP') || (t.direction === 'SHORT' && t.forecast === 'DOWN');
                if (filterForecast === 'WITH' && !isWith) return false;
                if (filterForecast === 'AGAINST' && isWith) return false;
            }
            return true;
        });

        const stats = { total_pnl: 0, win_count: 0, loss_count: 0, closed_count: 0, open_count: 0, sum_wins: 0, sum_losses: 0 };
        filtered.forEach(t => {
            if (t.status === 'OPEN') stats.open_count++;
            else {
                stats.closed_count++;
                stats.total_pnl += (t.pnl || 0);
                if ((t.pnl || 0) > 0) { stats.win_count++; stats.sum_wins += t.pnl; }
                else { stats.loss_count++; stats.sum_losses += Math.abs(t.pnl || 0); }
            }
        });

        return {
            trades: filtered,
            stats: {
                total_pnl: stats.total_pnl,
                win_rate: stats.closed_count > 0 ? (stats.win_count / stats.closed_count * 100) : 0,
                total_trades: stats.closed_count,
                open_trades: stats.open_count,
                avg_win: stats.win_count > 0 ? (stats.sum_wins / stats.win_count) : 0,
                avg_loss: stats.loss_count > 0 ? (stats.sum_losses / stats.loss_count) : 0
            }
        };
    }, [data, filterInterval, filterStatus, filterDirection, filterAsset, selectedAssets, filterTrend, filterForecast]);

    // --- SORTING ---
    const sortedTrades = useMemo(() => {
        let sortableItems = [...dashboardData.trades];
        if (sortConfig !== null) {
            sortableItems.sort((a, b) => {
                let aValue = a[sortConfig.key];
                let bValue = b[sortConfig.key];
                if (sortConfig.key === 'trend' || sortConfig.key === 'forecast') {
                    const map = { 'UP': 3, 'FLAT': 2, 'DOWN': 1, '-': 0 };
                    aValue = map[aValue] || 0; bValue = map[bValue] || 0;
                } else if (sortConfig.key === 'direction') {
                    const map = { 'LONG': 2, 'SHORT': 1 };
                    aValue = map[aValue] || 0; bValue = map[bValue] || 0;
                } else if (sortConfig.key === 'status') {
                    const map = { 'OPEN': 2, 'CLOSED': 1 };
                    aValue = map[aValue] || 0; bValue = map[bValue] || 0;
                } else if (sortConfig.key === 'entry_date' || sortConfig.key === 'exit_date') {
                    aValue = aValue === '-' ? 0 : new Date(aValue).getTime();
                    bValue = bValue === '-' ? 0 : new Date(bValue).getTime();
                } else {
                    if (aValue === null) aValue = -Infinity; if (bValue === null) bValue = -Infinity;
                }
                if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return sortableItems;
    }, [dashboardData, sortConfig]);

    const requestSort = (key) => {
        let direction = 'desc'; 
        if (sortConfig.key === key && sortConfig.direction === 'desc') direction = 'asc';
        setSortConfig({ key, direction });
    };

    const createSortHeader = (label, key) => (
        <th onClick={() => requestSort(key)} style={{ padding: '15px 10px', cursor: 'pointer', textAlign: 'left' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                {label} {sortConfig.key === key && (sortConfig.direction === 'asc' ? <ArrowUp size={14} color="#0078d4" /> : <ArrowDown size={14} color="#0078d4" />)}
            </div>
        </th>
    );

    if (!data && loading) return null;
    const displayStats = dashboardData.stats || data?.summary;
    const getDirColor = (d) => d === 'UP' ? '#00c853' : d === 'DOWN' ? '#ff3d00' : '#888';
    const getCycleColor = (v) => v > 80 ? '#ff3d00' : v < 20 ? '#00c853' : '#aaa';

    // UI HELPER COMPONENTS
    const StatCard = ({ label, value, color = 'white', subValue = null }) => (
        <div style={{ background: '#333', padding: '10px', borderRadius: '6px', minWidth: '100px', flex: 1, textAlign: 'center' }}>
            <div style={{ color: '#aaa', fontSize: '0.65rem', textTransform: 'uppercase', marginBottom:'4px' }}>{label}</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: color }}>{value}</div>
            {subValue && <div style={{ fontSize: '0.75rem', color: '#888', marginTop: '2px' }}>{subValue}</div>}
        </div>
    );

    const IntervalCard = ({ intervalData, isActive, onClick }) => (
        <div onClick={onClick} style={{ background: isActive ? '#3a3a45' : '#2a2a2a', border: isActive ? '1px solid #0078d4' : '1px solid #444', borderRadius: '6px', padding: '8px', minWidth: '130px', flex: 1, cursor: 'pointer', transition: 'all 0.2s' }}>
            <div style={{ color: isActive ? '#0078d4' : '#d1d4dc', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '5px', borderBottom:'1px solid #444', paddingBottom:'3px', display:'flex', justifyContent:'space-between' }}>
                {intervalData.interval} {isActive && <span style={{fontSize:'0.7rem', background:'#0078d4', color:'white', padding:'0 4px', borderRadius:'3px'}}>ON</span>}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}><span style={{color:'#aaa'}}>PnL:</span><span style={{fontWeight:'bold', color: intervalData.pnl >= 0 ? '#00c853' : '#ff3d00'}}>${intervalData.pnl}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}><span style={{color:'#aaa'}}>Win%:</span><span style={{color:'white'}}>{intervalData.win_rate}%</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}><span style={{color:'#aaa'}}>Closed:</span><span style={{color:'#aaa'}}>{intervalData.closed}</span></div>
        </div>
    );

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 2000, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <div style={{ width: '95%', maxWidth: '1100px', height: '90vh', backgroundColor: '#1e1e1e', borderRadius: '12px', display: 'flex', flexDirection: 'column', border: '1px solid #444', boxShadow: '0 0 20px black' }}>
                
                {/* 1. Header */}
                <div style={{ padding: '15px 20px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h2 style={{ color: 'white', margin: 0, fontSize: '1.2rem' }}>Forward Test</h2>
                        <div style={{ fontSize: '0.8rem', color: '#888' }}>
                            {showEquity ? 'Equity Curve Analysis' : 'Trade Log View'}
                        </div>
                    </div>
                    
                    <div style={{ display:'flex', gap:'15px' }}>
                        <button 
                            onClick={() => setShowEquity(!showEquity)}
                            style={{ 
                                display: 'flex', alignItems: 'center', gap: '8px',
                                background: showEquity ? '#0078d4' : '#333', border: '1px solid #444', 
                                color: 'white', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight:'bold'
                            }}
                        >
                            {showEquity ? <List size={18}/> : <TrendingUp size={18}/>}
                            {showEquity ? 'List View' : 'Equity View'}
                        </button>
                        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}><X /></button>
                    </div>
                </div>

                {/* 2. Global Filters */}
                <div style={{ padding: '10px 15px', background: '#252525', borderBottom: '1px solid #333', display: 'flex', gap: '10px', alignItems: 'center', flexWrap:'wrap' }}>
                    <div style={{display:'flex', alignItems:'center', gap:'6px', marginRight:'10px'}}>
                        <Filter size={16} color="#0078d4" />
                        <span style={{fontSize:'0.75rem', fontWeight:'bold', color:'#aaa'}}>FILTERS</span>
                    </div>
                    
                    {/* ASSET FILTER (Categorized Mega Menu) */}
                    <div style={{ position: 'relative', display: 'flex', gap: '2px' }}>
                        <div style={{ position: 'relative' }}>
                            <Search size={14} color="#888" style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)' }} />
                            <input 
                                type="text" 
                                placeholder={selectedAssets.size > 0 ? `${selectedAssets.size} Selected` : "Asset..."}
                                value={filterAsset} 
                                onChange={(e) => setFilterAsset(e.target.value)} 
                                disabled={selectedAssets.size > 0}
                                style={{ 
                                    padding: '6px 6px 6px 28px', borderRadius: '4px', border: '1px solid #555', 
                                    background: selectedAssets.size > 0 ? '#333' : '#1a1a1a', 
                                    color: 'white', fontSize: '0.85rem', width: '100px' 
                                }} 
                            />
                        </div>
                        
                        <button 
                            onClick={() => setShowAssetMenu(!showAssetMenu)}
                            style={{ 
                                background: selectedAssets.size > 0 ? '#0078d4' : '#333', 
                                border: '1px solid #555', borderRadius: '4px', color: 'white', 
                                padding: '0 8px', cursor: 'pointer', display: 'flex', alignItems: 'center'
                            }}
                        >
                            <ChevronDown size={14} />
                        </button>

                        {/* MEGA MENU POPUP */}
                        {showAssetMenu && (
                            <div style={{ 
                                position: 'absolute', top: '100%', left: 0, width: '450px', maxHeight: '400px', overflowY: 'auto',
                                background: '#222', border: '1px solid #555', borderRadius: '6px', zIndex: 100, 
                                padding: '15px', marginTop: '5px', boxShadow: '0 10px 30px rgba(0,0,0,0.8)',
                                display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px'
                            }}>
                                {Object.entries(ASSET_CATEGORIES).map(([category, assets]) => {
                                    // Check if all items in this category are selected
                                    const allSelected = assets.every(a => selectedAssets.has(a));
                                    
                                    return (
                                        <div key={category} style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                            <div 
                                                onClick={() => toggleCategory(category)}
                                                style={{ 
                                                    color: allSelected ? '#fff' : '#0078d4', 
                                                    background: allSelected ? '#0078d4' : 'transparent',
                                                    fontSize: '0.75rem', fontWeight: 'bold', 
                                                    borderBottom: '1px solid #444', padding: '4px', marginBottom: '4px',
                                                    cursor: 'pointer', borderRadius: '4px'
                                                }}
                                            >
                                                {category.toUpperCase()}
                                            </div>
                                            {assets.map(sym => (
                                                <button 
                                                    key={sym}
                                                    onClick={() => toggleAsset(sym)}
                                                    style={{
                                                        textAlign: 'left', background: selectedAssets.has(sym) ? '#0078d4' : '#333',
                                                        color: selectedAssets.has(sym) ? 'white' : '#ccc',
                                                        border: 'none', padding: '6px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem',
                                                        transition: 'all 0.1s'
                                                    }}
                                                >
                                                    {sym}
                                                </button>
                                            ))}
                                        </div>
                                    );
                                })}
                                
                                <div style={{ gridColumn: '1 / -1', borderTop: '1px solid #444', paddingTop: '10px', display: 'flex', justifyContent: 'flex-end' }}>
                                    <button onClick={() => {setSelectedAssets(new Set());}} style={{background:'none', border:'none', color:'#f44336', cursor:'pointer', marginRight:'15px', fontSize:'0.8rem'}}>Clear All</button>
                                    <button onClick={() => setShowAssetMenu(false)} style={{background:'#0078d4', border:'none', color:'white', padding:'5px 15px', borderRadius:'4px', cursor:'pointer', fontSize:'0.8rem', fontWeight:'bold'}}>Done</button>
                                </div>
                            </div>
                        )}
                    </div>

                    <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #555', background: '#1a1a1a', color: 'white', fontSize: '0.85rem' }}>
                        <option value="ALL">Status: All</option><option value="OPEN">Open</option><option value="CLOSED">Closed</option>
                    </select>

                    <select value={filterDirection} onChange={(e) => setFilterDirection(e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #555', background: '#1a1a1a', color: 'white', fontSize: '0.85rem' }}>
                        <option value="ALL">Pos: All</option><option value="LONG">Long</option><option value="SHORT">Short</option>
                    </select>

                    <select value={filterInterval || 'ALL'} onChange={(e) => setFilterInterval(e.target.value === 'ALL' ? null : e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #555', background: '#1a1a1a', color: 'white', fontSize: '0.85rem' }}>
                        <option value="ALL">Int: All</option><option value="15min">15min</option><option value="1h">1 Hour</option><option value="4h">4 Hours</option>
                    </select>

                    <select value={filterTrend} onChange={(e) => setFilterTrend(e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #555', background: '#1a1a1a', color: 'white', fontSize: '0.85rem' }}>
                        <option value="ALL">Trend: All</option><option value="FOLLOW">Trend Follow</option><option value="COUNTER">Counter Trend</option>
                    </select>
                    <select value={filterForecast} onChange={(e) => setFilterForecast(e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #555', background: '#1a1a1a', color: 'white', fontSize: '0.85rem' }}>
                        <option value="ALL">Forecast: All</option><option value="WITH">With Forecast</option><option value="AGAINST">Against Forecast</option>
                    </select>

                    {(filterInterval || filterStatus !== 'ALL' || filterDirection !== 'ALL' || filterAsset || selectedAssets.size > 0 || filterTrend !== 'ALL' || filterForecast !== 'ALL') && (
                        <button onClick={() => { setFilterInterval(null); setFilterStatus('ALL'); setFilterDirection('ALL'); setFilterAsset(''); setSelectedAssets(new Set()); setFilterTrend('ALL'); setFilterForecast('ALL'); }} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#f44336', fontSize: '0.75rem', cursor: 'pointer', fontWeight:'bold' }}>RESET FILTERS</button>
                    )}
                </div>

                {/* 3. Main Content */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '15px', display: 'flex', flexDirection: 'column' }}>
                    
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '15px' }}>
                        <StatCard label="Net PnL" value={`$${displayStats.total_pnl.toFixed(2)}`} color={displayStats.total_pnl >= 0 ? '#00c853' : '#ff3d00'} />
                        <StatCard label="Win Rate" value={`${displayStats.win_rate.toFixed(1)}%`} />
                        <StatCard label="Trades (Closed)" value={displayStats.total_trades} />
                        <StatCard label="Avg Win" value={`$${displayStats.avg_win.toFixed(2)}`} color="#00c853" />
                        <StatCard label="Avg Loss" value={`$${displayStats.avg_loss.toFixed(2)}`} color="#ff3d00" />
                        {!showEquity && <StatCard label="Open Trades" value={displayStats.open_trades} color="#29b6f6" />}
                    </div>

                    {showEquity ? (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                            <LargeEquityChart trades={dashboardData.trades} />
                            <div style={{ textAlign: 'center', color: '#666', fontSize: '0.8rem', marginTop: '10px' }}>
                                * Equity curve calculated on CLOSED trades matching current filters. Base capital $1,000.
                            </div>
                        </div>
                    ) : (
                        <>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '15px' }}>
                                {data?.intervals.map(intv => (
                                    <IntervalCard key={intv.interval} intervalData={intv} isActive={filterInterval === intv.interval} onClick={() => setFilterInterval(filterInterval === intv.interval ? null : intv.interval)} />
                                ))}
                            </div>

                            <div style={{ flex: 1, overflowX: 'auto', border: '1px solid #444', borderRadius: '6px' }}>
                                <table style={{ width: '100%', minWidth: '900px', borderCollapse: 'collapse', color: '#ddd', fontSize: '0.85rem' }}>
                                    <thead style={{ background: '#252525' }}>
                                        <tr style={{ borderBottom: '1px solid #444', color: '#888' }}>
                                            {createSortHeader('Asset', 'symbol')}
                                            {createSortHeader('Int', 'interval')}
                                            {createSortHeader('Dir', 'direction')}
                                            {createSortHeader('TRND', 'trend')}
                                            {createSortHeader('CYC', 'cycle')}
                                            {createSortHeader('FST', 'fast')}
                                            {createSortHeader('FCST', 'forecast')}
                                            {createSortHeader('Status', 'status')}
                                            {createSortHeader('Entry $', 'entry_price')}
                                            {createSortHeader('Time', 'entry_date')}
                                            {createSortHeader('Exit', 'exit_date')}
                                            {createSortHeader('PnL', 'pnl')}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sortedTrades.map(t => (
                                            <tr key={t.id} style={{ borderBottom: '1px solid #333', background: '#1e1e1e' }}>
                                                <td style={{ padding: '10px', fontWeight: 'bold' }}>{t.symbol}</td>
                                                <td>{t.interval}</td>
                                                <td><span style={{ color: t.direction === 'LONG' ? '#00c853' : '#ff3d00', fontWeight: 'bold', padding: '2px 6px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px' }}>{t.direction}</span></td>
                                                <td style={{ fontWeight: 'bold', color: getDirColor(t.trend) }}>{t.trend}</td>
                                                <td style={{ fontWeight: 'bold', color: getCycleColor(t.cycle) }}>{t.cycle}</td>
                                                <td style={{ fontWeight: 'bold', color: getCycleColor(t.fast) }}>{t.fast}</td>
                                                <td style={{ fontWeight: 'bold', color: getDirColor(t.forecast) }}>{t.forecast}</td>
                                                <td style={{ color: t.status === 'OPEN' ? '#29b6f6' : '#888' }}>{t.status}</td>
                                                <td>{t.entry_price.toFixed(2)}</td>
                                                <td style={{ fontSize: '0.8rem', color: '#aaa', whiteSpace: 'nowrap' }}>{t.entry_date}</td>
                                                <td style={{ fontSize: '0.8rem', color: '#aaa', whiteSpace: 'nowrap' }}>{t.exit_date !== '-' ? t.exit_date : ''}</td>
                                                <td style={{ fontWeight: 'bold', color: t.pnl > 0 ? '#00c853' : (t.pnl < 0 ? '#ff3d00' : '#888') }}>{t.pnl !== 0 ? `$${t.pnl.toFixed(2)}` : '-'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ForwardTestModal;