import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, ArrowUp, ArrowDown, Search, Filter, TrendingUp, List, CheckSquare, Square, ChevronDown, Play, Clock, BarChart2, Award, Activity, Timer, HelpCircle, Info } from 'lucide-react';

// --- ASSETS CONSTANT ---
const ASSET_CATEGORIES = {
    'Crypto': ['XAU/USD','BTC/USD', 'ETH/USD', 'ADA/USD', 'BNB/USD', 'DOGE/USD', 'XRP/USD', 'SOL/USD', 'FET/USD','ICP/USD'],
    'Forex': ['EUR/USD', 'EUR/CAD', 'EUR/AUD','EUR/JPY', 'EUR/GBP','AUD/CAD','AUD/USD','GBP/CAD', 'GBP/USD', 'USD/CAD', 'USD/CHF', 'USD/JPY'],
    'Stocks': ['AAPL', 'AMZN', 'GOOG', 'MSFT','NVDA', 'META', 'TSLA', 'NFLX']
};
const ALL_ASSETS = Object.values(ASSET_CATEGORIES).flat().sort();

// --- HELP MODAL ---
const HelpPopup = ({ onClose }) => (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 3000, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(4px)' }}>
        <div style={{ width: '500px', maxWidth: '90%', backgroundColor: '#1e1e1e', borderRadius: '12px', border: '1px solid #0078d4', boxShadow: '0 0 40px rgba(0, 120, 212, 0.3)', padding: '25px', position: 'relative' }}>
            <button onClick={onClose} style={{ position: 'absolute', top: '15px', right: '15px', background: 'none', border: 'none', color: '#888', cursor: 'pointer' }}><X size={20}/></button>
            
            <div style={{display:'flex', alignItems:'center', gap:'10px', marginBottom:'20px', color:'#0078d4'}}>
                <Info size={24} />
                <h2 style={{margin:0, fontSize:'1.2rem'}}>About Forward Testing</h2>
            </div>
            
            <div style={{ color: '#d1d4dc', fontSize: '0.9rem', lineHeight: '1.6' }}>
                <p>This is a <strong>Real-Time Simulation</strong> designed to provide the most sincere validation of the trading strategies.</p>
                <p>Unlike standard backtests which can be curve-fitted to past data, this system acts as a <strong>Live Trading Bot</strong>:</p>
                <ul style={{paddingLeft:'20px', color:'#aaa'}}>
                    <li>It monitors the portfolio 24/7 across multiple timeframes (15m, 1h, 4h).</li>
                    <li>It executes a trade immediately whenever the <strong>Trend, Cycle, and Fast Wave</strong> components align to trigger a signal.</li>
                    <li>It tracks the trade until the signal reverses, exactly as a human trader would be instructed to do.</li>
                </ul>
                <p style={{marginTop:'15px', borderTop:'1px solid #333', paddingTop:'15px'}}>
                    <strong style={{color:'#fff'}}>Why this matters:</strong><br/>
                    This builds a track record "forward" in time. What you see here is exactly how the algorithm performs in live market conditions, with no hindsight bias.
                </p>
            </div>
        </div>
    </div>
);

// --- SYSTEM MONITOR COMPONENT (Compact Version) ---
const SystemMonitor = ({ trades, isMobile, strategy }) => { // UPDATED: Added strategy prop
    const [now, setNow] = useState(new Date());
    const [startTime, setStartTime] = useState(null);

    // 1. Determine Start Time based on selected strategy
    useEffect(() => {
        if (trades && trades.length > 0) {
            // FIX: Filter trades by the current strategy first
            const strategyTrades = trades.filter(t => {
                const tStrat = t.strategy ? t.strategy.toUpperCase() : 'BASIC';
                return tStrat === strategy;
            });

            if (strategyTrades.length > 0) {
                const sorted = strategyTrades.sort((a, b) => new Date(a.entry_date) - new Date(b.entry_date));
                const firstDate = new Date(sorted[0].entry_date);
                setStartTime(firstDate);
            } else {
                setStartTime(null); // No trades for this strategy yet
            }
        }
    }, [trades, strategy]);

    // 2. Tick every second
    useEffect(() => {
        const interval = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(interval);
    }, []);

    // 3. Format Duration
    const getRunningDuration = () => {
        if (!startTime) return isMobile ? "--d --h" : "--d --h --m";
        const diff = Math.floor((now - startTime) / 1000); 
        const d = Math.floor(diff / (3600 * 24));
        const h = Math.floor((diff % (3600 * 24)) / 3600);
        const m = Math.floor((diff % 3600) / 60);
        if (isMobile) return `${d}d ${h}h`; 
        const s = diff % 60;
        return `${d}d ${h}h ${m}m ${s}s`;
    };

    const getTimeToNext = (intervalMinutes) => {
        const minutes = now.getMinutes();
        const next = Math.ceil((minutes + 1) / intervalMinutes) * intervalMinutes;
        const diffMins = next - minutes - 1; 
        const diffSecs = 59 - now.getSeconds();
        
        let totalMins = diffMins;
        if (intervalMinutes === 60) totalMins = 59 - minutes;
        if (intervalMinutes === 240) { 
            const hour = now.getUTCHours(); 
            const nextHour = Math.ceil((hour + 1) / 4) * 4; 
            let hourDiff = nextHour - hour - 1;
            if (hourDiff < 0) hourDiff += 24;
            totalMins = (hourDiff * 60) + (59 - minutes);
        }

        return `${totalMins}m`;
    };

    return (
        <div style={{ 
            display: 'flex', alignItems: 'center', 
            gap: isMobile ? '8px' : '20px', 
            marginLeft: isMobile ? '0' : '20px', 
            borderLeft: isMobile ? 'none' : '1px solid #444', 
            paddingLeft: isMobile ? '0' : '20px', 
            flexWrap: 'nowrap', 
            fontSize: isMobile ? '0.65rem' : '0.75rem',
            overflow: 'hidden'
        }}>
            {/* STATUS PULSE */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <div style={{ position: 'relative', width: '8px', height: '8px' }}>
                    <div style={{ position: 'absolute', width: '100%', height: '100%', background: '#00e676', borderRadius: '50%' }}></div>
                    <div style={{ position: 'absolute', width: '100%', height: '100%', background: '#00e676', borderRadius: '50%', animation: 'ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite' }}></div>
                </div>
                {!isMobile && <div style={{ color: '#00e676', fontWeight: 'bold', fontSize: '0.7rem', letterSpacing: '1px' }}>RUNNING</div>}
            </div>

            {/* RUNNING TIME */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
                <Clock size={isMobile ? 12 : 14} color="#666" />
                <div style={{ fontWeight: 'bold', color: '#ccc', fontFamily: 'monospace' }}>
                    {getRunningDuration()}
                </div>
            </div>

            {/* NEXT UPDATES */}
            <div style={{ display: 'flex', gap: isMobile ? '8px' : '15px', color: '#888', whiteSpace: 'nowrap' }}>
                <div style={{display:'flex', alignItems:'center', gap:'2px'}}>
                    <span>15m:</span><span style={{color: '#ff9800', fontFamily:'monospace', fontWeight:'bold'}}>{getTimeToNext(15)}</span>
                </div>
                <div style={{display:'flex', alignItems:'center', gap:'2px'}}>
                    <span>1h:</span><span style={{color: '#29b6f6', fontFamily:'monospace', fontWeight:'bold'}}>{getTimeToNext(60)}</span>
                </div>
                <div style={{display:'flex', alignItems:'center', gap:'2px'}}>
                    <span>4h:</span><span style={{color: '#e040fb', fontFamily:'monospace', fontWeight:'bold'}}>{getTimeToNext(240)}</span>
                </div>
            </div>
            <style>{`@keyframes ping { 75%, 100% { transform: scale(2); opacity: 0; } }`}</style>
        </div>
    );
};

// --- EQUITY CHART (Reused) ---
const LargeEquityChart = ({ trades }) => {
    const [hoveredPoint, setHoveredPoint] = useState(null);
    const containerRef = useRef(null);

    const chartData = useMemo(() => {
        const sorted = [...trades].filter(t => t.status === 'CLOSED').sort((a, b) => new Date(a.entry_date) - new Date(b.entry_date));
        let currentEquity = 10000; const points = [{ date: 'Start', val: currentEquity, trade: null }];
        sorted.forEach(t => { currentEquity += (t.pnl || 0); points.push({ date: t.entry_date, val: currentEquity, trade: t }); });
        return points;
    }, [trades]);

    if (!chartData || chartData.length < 2) return <div style={{flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'#666'}}>Not enough data.</div>;
    const width = 1000; const height = 400; const padding = 50;
    const minVal = Math.min(...chartData.map(d => d.val)); const maxVal = Math.max(...chartData.map(d => d.val));
    const range = (maxVal - minVal) || 1; const yMin = minVal - (range * 0.05); const finalRange = (maxVal + (range * 0.05)) - yMin;
    const getX = (i) => padding + (i / (chartData.length - 1)) * (width - padding * 2);
    const getY = (val) => height - padding - ((val - yMin) / finalRange) * (height - padding * 2);
    const pathD = chartData.map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d.val)}`).join(' ');

    const handleInteraction = (clientX) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const svgX = ((clientX - rect.left) / rect.width) * width;
        let closest = null; let minD = Infinity;
        chartData.forEach((d, i) => { const dist = Math.abs(svgX - getX(i)); if (dist < minD) { minD = dist; closest = d; } });
        setHoveredPoint(closest);
    };

    return (
        <div ref={containerRef} onMouseMove={e => handleInteraction(e.clientX)} onTouchStart={e => handleInteraction(e.touches[0].clientX)} onTouchMove={e => handleInteraction(e.touches[0].clientX)} onMouseLeave={() => setHoveredPoint(null)} onTouchEnd={() => setHoveredPoint(null)}
            style={{ flex: 1, position: 'relative', background: '#222', borderRadius: '8px', margin: '10px 0', border: '1px solid #444', overflow: 'hidden', cursor: 'crosshair', touchAction: 'none' }}>
            <div style={{ position: 'absolute', top: 10, left: 15, color: '#888', fontSize: '0.8rem' }}>Capital Growth</div>
            <div style={{ position: 'absolute', top: 10, right: 15, fontWeight: 'bold', color: chartData[chartData.length-1].val >= 10000 ? '#00c853' : '#ff3d00' }}>${chartData[chartData.length-1].val.toFixed(2)}</div>
            <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
                <path d={pathD} fill="none" stroke="#0078d4" strokeWidth="3" vectorEffect="non-scaling-stroke" />
                {hoveredPoint && <><line x1={getX(chartData.indexOf(hoveredPoint))} y1={padding} x2={getX(chartData.indexOf(hoveredPoint))} y2={height - padding} stroke="#fff" strokeDasharray="2" opacity="0.5"/><circle cx={getX(chartData.indexOf(hoveredPoint))} cy={getY(hoveredPoint.val)} r="4" fill="white"/></>}
            </svg>
            {hoveredPoint && <div style={{ position: 'absolute', top: '50px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.8)', border: '1px solid #555', padding: '8px', borderRadius: '4px', pointerEvents: 'none', color: '#fff', fontSize: '0.8rem', textAlign: 'center' }}><div>${hoveredPoint.val.toFixed(2)}</div><div style={{color:'#aaa', fontSize:'0.7rem'}}>{hoveredPoint.date}</div></div>}
        </div>
    );
};

// --- PERFORMERS LIST ---
const PerformersView = ({ data }) => {
    const rankedData = useMemo(() => {
        if (!data || !data.trades) return {};
        const groups = {};
        data.trades.forEach(t => {
            if (t.status !== 'CLOSED') return;
            if (!groups[t.interval]) groups[t.interval] = {};
            if (!groups[t.interval][t.symbol]) groups[t.interval][t.symbol] = { symbol: t.symbol, pnl: 0, wins: 0, losses: 0, total: 0 };
            const g = groups[t.interval][t.symbol]; const pnl = t.pnl || 0; g.pnl += pnl; g.total++;
            if (pnl > 0) g.wins++; else if (pnl < 0) g.losses++;
        });
        const result = {};
        Object.keys(groups).forEach(intv => {
            const arr = Object.values(groups[intv]);
            arr.forEach(a => { a.winRate = a.total > 0 ? (a.wins / a.total) * 100 : 0; });
            arr.sort((a, b) => b.pnl - a.pnl);
            result[intv] = arr;
        });
        return Object.keys(result).sort().reduce((obj, key) => { obj[key] = result[key]; return obj; }, {});
    }, [data]);

    return (
        <div style={{ display: 'flex', gap: '20px', overflowX: 'auto', paddingBottom: '10px', height: '100%' }}>
            {Object.keys(rankedData).length === 0 && <div style={{color:'#666', padding:'20px'}}>No closed trade data available to rank.</div>}
            {Object.entries(rankedData).map(([interval, assets]) => (
                <div key={interval} style={{ minWidth: '300px', flex:1, background: '#252525', borderRadius: '8px', border: '1px solid #444', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: '12px', borderBottom: '1px solid #444', background: '#333', borderRadius: '8px 8px 0 0', fontWeight: 'bold', color: '#fff', display:'flex', justifyContent:'space-between' }}><span>{interval}</span><span style={{fontSize:'0.75rem', fontWeight:'normal', color:'#aaa'}}>{assets.length} Assets</span></div>
                    <div style={{ overflowY: 'auto', flex: 1, padding: '5px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                            <thead><tr style={{ color: '#888', borderBottom: '1px solid #444' }}><th style={{ textAlign: 'left', padding: '8px' }}>Asset</th><th style={{ textAlign: 'center', padding: '8px' }}>Trades</th><th style={{ textAlign: 'right', padding: '8px' }}>PnL</th></tr></thead>
                            <tbody>{assets.map((asset, idx) => (
                                <tr key={asset.symbol} style={{ borderBottom: '1px solid #333', background: idx < 3 ? 'rgba(0, 200, 83, 0.05)' : 'transparent' }}>
                                    <td style={{ padding: '8px', fontWeight: 'bold', color: '#d1d4dc' }}>{idx < 3 && <Award size={12} color={idx===0?'#ffd700':idx===1?'#c0c0c0':'#cd7f32'} style={{marginRight:'5px', verticalAlign:'middle'}}/>}{asset.symbol}</td>
                                    <td style={{ padding: '8px', textAlign: 'center', color: '#aaa' }}>{asset.total} <span style={{fontSize:'0.7rem', color: asset.winRate > 50 ? '#00c853' : '#ff3d00'}}>({asset.winRate.toFixed(0)}%)</span></td>
                                    <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold', color: asset.pnl >= 0 ? '#00c853' : '#ff3d00' }}>${asset.pnl.toFixed(2)}</td>
                                </tr>
                            ))}</tbody>
                        </table>
                    </div>
                </div>
            ))}
        </div>
    );
};

// --- HELPER COMPONENTS ---
const StatCard = ({ label, value, color = 'white' }) => (
    <div style={{ background: '#333', padding: '10px', borderRadius: '6px', minWidth: '100px', flex: 1, textAlign: 'center' }}>
        <div style={{ color: '#aaa', fontSize: '0.65rem', textTransform: 'uppercase', marginBottom:'4px' }}>{label}</div>
        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: color }}>{value}</div>
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

const TestModal = ({ onClose }) => {
    const [mode, setMode] = useState('forward'); 
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [showHelp, setShowHelp] = useState(false);
    
    // 1. MOBILE DETECTION
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // --- BACKTEST CONFIG ---
    const [btAssets, setBtAssets] = useState(new Set(ASSET_CATEGORIES['Crypto'])); 
    const [btInterval, setBtInterval] = useState('1day');
    const [btBars, setBtBars] = useState(300);
    const [showAssetMenu, setShowAssetMenu] = useState(false);
    
    // BACKTEST PARAMS
    const [btStrategy, setBtStrategy] = useState('BASIC');
    const [btUseBreakeven, setBtUseBreakeven] = useState(false);
    const [btBeAtr, setBtBeAtr] = useState(2.0);
    const [btUseTp, setBtUseTp] = useState(false);
    const [btTpAtr, setBtTpAtr] = useState(5.0);

    // --- FILTERS (Forward Only) ---
    const [filterStrategy, setFilterStrategy] = useState('BASIC'); 
    const [filterInterval, setFilterInterval] = useState(null); 
    const [filterStatus, setFilterStatus] = useState('ALL');    
    const [filterDirection, setFilterDirection] = useState('ALL'); 
    const [filterAsset, setFilterAsset] = useState('');
    const [filterTrend, setFilterTrend] = useState('ALL'); 
    const [filterForecast, setFilterForecast] = useState('ALL'); 
    const [selectedAssets, setSelectedAssets] = useState(new Set());
    const [showFilterAssetMenu, setShowFilterAssetMenu] = useState(false);

    // --- VIEW ---
    const [showEquity, setShowEquity] = useState(false);
    const [showPerformers, setShowPerformers] = useState(false); 
    const [sortConfig, setSortConfig] = useState({ key: 'entry_date', direction: 'desc' });

    useEffect(() => {
        if (mode === 'forward') fetchForwardResults();
        else setData(null); 
    }, [mode]);

    const fetchForwardResults = async () => {
        setLoading(true);
        const token = localStorage.getItem('access_token');
        try {
            const res = await fetch('/api/forward-test-results', { headers: { 'Authorization': `Bearer ${token}` } });
            const json = await res.json();
            setData(json);
        } catch (err) { console.error(err); } 
        finally { setLoading(false); }
    };

    const runBacktest = async () => {
        if (btAssets.size === 0) return alert("Select at least one asset");
        setLoading(true);
        setData(null);
        const token = localStorage.getItem('access_token');
        try {
            const res = await fetch('/api/run-backtest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ 
                    assets: Array.from(btAssets), 
                    interval: btInterval, 
                    lookback: btBars,
                    strategy: btStrategy,
                    use_breakeven: btUseBreakeven,
                    be_atr: parseFloat(btBeAtr),
                    use_tp: btUseTp,
                    tp_atr: parseFloat(btTpAtr)
                })
            });
            const json = await res.json();
            setData(json);
        } catch (err) { console.error(err); alert("Backtest failed"); } 
        finally { setLoading(false); }
    };

    // --- HELPERS ---
    const toggleBtAsset = (s) => { const n = new Set(btAssets); if(n.has(s)) n.delete(s); else n.add(s); setBtAssets(n); };
    const toggleBtCategory = (cat) => { const items = ASSET_CATEGORIES[cat]; const all = items.every(x=>btAssets.has(x)); const n=new Set(btAssets); items.forEach(x=>all?n.delete(x):n.add(x)); setBtAssets(n); };
    
    const toggleFilterAsset = (s) => { const n = new Set(selectedAssets); if(n.has(s)) n.delete(s); else n.add(s); setSelectedAssets(n); };
    const toggleFilterCategory = (cat) => { const items = ASSET_CATEGORIES[cat]; const all = items.every(x=>selectedAssets.has(x)); const n=new Set(selectedAssets); items.forEach(x=>all?n.delete(x):n.add(x)); setSelectedAssets(n); };

    const getDirColor = (d) => d === 'UP' ? '#00c853' : d === 'DOWN' ? '#ff3d00' : '#888';
    const getCycleColor = (v) => v > 80 ? '#ff3d00' : v < 20 ? '#00c853' : '#aaa';

    // --- FILTER & STATS LOGIC ---
    const dashboardData = useMemo(() => {
        if (!data?.trades) return { trades: [], stats: null };
        const filtered = data.trades.filter(t => {
            if (mode === 'forward') {
                const tradeStrat = t.strategy ? t.strategy.toUpperCase() : 'BASIC';
                if (tradeStrat !== filterStrategy) return false;

                if (filterInterval && t.interval !== filterInterval) return false;
                if (filterStatus !== 'ALL' && t.status !== filterStatus) return false;
                if (filterDirection !== 'ALL' && t.direction !== filterDirection) return false;
                if (selectedAssets.size > 0) { if (!selectedAssets.has(t.symbol)) return false; } 
                else if (filterAsset && !t.symbol.includes(filterAsset.toUpperCase())) return false;
                
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
            }
            return true;
        });

        const s = { total_pnl: 0, win_count: 0, loss_count: 0, closed_count: 0, open_count: 0, sum_wins: 0, sum_losses: 0 };
        filtered.forEach(t => {
            if (t.status === 'OPEN') s.open_count++;
            else {
                s.closed_count++; s.total_pnl += (t.pnl || 0);
                if ((t.pnl || 0) > 0) { s.win_count++; s.sum_wins += t.pnl; } else { s.loss_count++; s.sum_losses += Math.abs(t.pnl || 0); }
            }
        });
        return {
            trades: filtered,
            stats: {
                total_pnl: s.total_pnl,
                win_rate: s.closed_count > 0 ? (s.win_count / s.closed_count * 100) : 0,
                total_trades: s.closed_count, open_trades: s.open_count,
                avg_win: s.win_count > 0 ? s.sum_wins / s.win_count : 0,
                avg_loss: s.loss_count > 0 ? s.sum_losses / s.loss_count : 0
            }
        };
    }, [data, mode, filterStrategy, filterInterval, filterStatus, filterDirection, filterAsset, selectedAssets, filterTrend, filterForecast]);

    const sortedTrades = useMemo(() => {
        let items = [...dashboardData.trades];
        if (sortConfig) {
            items.sort((a, b) => {
                let av = a[sortConfig.key], bv = b[sortConfig.key];
                if (['trend', 'forecast'].includes(sortConfig.key)) { av = {'UP':3,'FLAT':2,'DOWN':1,'-':0}[av]||0; bv = {'UP':3,'FLAT':2,'DOWN':1,'-':0}[bv]||0; }
                else if (sortConfig.key === 'direction') { av = {'LONG':2,'SHORT':1}[av]||0; bv = {'LONG':2,'SHORT':1}[bv]||0; }
                else if (['entry_date','exit_date'].includes(sortConfig.key)) { av = new Date(av).getTime(); bv = new Date(bv).getTime(); }
                else { if (av===null) av=-Infinity; if (bv===null) bv=-Infinity; }
                if (av < bv) return sortConfig.direction === 'asc' ? -1 : 1;
                if (av > bv) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return items;
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

    const displayStats = dashboardData.stats || data?.summary || {};
    
    const renderContent = () => {
        if (showPerformers) {
            return <PerformersView data={data} />;
        }
        if (showEquity) {
            return <LargeEquityChart trades={dashboardData.trades} />;
        }
        return (
            <div style={{overflowX:'auto', border:'1px solid #444', borderRadius:'6px'}}>
                <table style={{width:'100%', minWidth:'900px', borderCollapse:'collapse', color:'#ddd', fontSize:'0.85rem'}}>
                    <thead style={{background:'#252525'}}>
                        <tr style={{borderBottom:'1px solid #444', color:'#888'}}>
                            {createSortHeader('Asset', 'symbol')}
                            {createSortHeader(mode==='forward'?'Int':'Time', 'interval')}
                            {createSortHeader('Dir', 'direction')}
                            {mode === 'forward' && createSortHeader('TRND', 'trend')}
                            {mode === 'forward' && createSortHeader('CYC', 'cycle')}
                            {mode === 'forward' && createSortHeader('FST', 'fast')}
                            {mode === 'forward' && createSortHeader('FCST', 'forecast')}
                            {mode === 'forward' && createSortHeader('Status', 'status')}
                            {createSortHeader('Entry $', 'entry_price')}
                            {createSortHeader('Time', 'entry_date')}
                            {createSortHeader('Exit', 'exit_date')}
                            {createSortHeader('Exit $', 'exit_price')}
                            {createSortHeader('PnL', 'pnl')}
                        </tr>
                    </thead>
                    <tbody>
                        {sortedTrades.map(t => (
                            <tr key={t.id} style={{borderBottom:'1px solid #333'}}>
                                <td style={{padding:'10px', fontWeight:'bold'}}>{t.symbol}</td>
                                <td>{t.interval}</td>
                                <td><span style={{color:t.direction==='LONG'?'#00c853':'#ff3d00', fontWeight:'bold', padding:'2px 6px', background:'rgba(255,255,255,0.1)', borderRadius:'4px'}}>{t.direction}</span></td>
                                
                                {mode === 'forward' && <td style={{fontWeight:'bold', color:getDirColor(t.trend)}}>{t.trend}</td>}
                                {mode === 'forward' && <td style={{fontWeight:'bold', color:getCycleColor(t.cycle)}}>{t.cycle}</td>}
                                {mode === 'forward' && <td style={{fontWeight:'bold', color:getCycleColor(t.fast)}}>{t.fast}</td>}
                                {mode === 'forward' && <td style={{fontWeight:'bold', color:getDirColor(t.forecast)}}>{t.forecast}</td>}
                                {mode === 'forward' && <td style={{color:t.status==='OPEN'?'#29b6f6':'#888'}}>{t.status}</td>}
                                
                                {/* FIX 2: 4 decimal places for Prices */}
                                <td>{t.entry_price.toFixed(4)}</td>
                                <td style={{fontSize:'0.8rem', color:'#aaa'}}>{t.entry_date}</td>
                                <td style={{fontSize:'0.8rem', color:'#aaa'}}>{t.exit_date}</td>
                                
                                <td>{t.exit_price ? t.exit_price.toFixed(4) : '-'}</td>
                                
                                <td style={{fontWeight:'bold', color: t.pnl>=0?'#00c853':'#ff3d00'}}>
                                    {t.pnl !== 0 ? `$${t.pnl.toFixed(2)}` : '-'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 2000, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <div style={{ width: '95%', maxWidth: '1100px', height: '90vh', backgroundColor: '#1e1e1e', borderRadius: '12px', display: 'flex', flexDirection: 'column', border: '1px solid #444', boxShadow: '0 0 20px black' }}>
                
                {/* HEADER - Updated Layout */}
                <div style={{ padding: '10px 15px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight:'50px' }}>
                    
                    {/* LEFT: Title & Mode Toggle */}
                    <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                        {!isMobile && <button onClick={() => setMode('forward')} style={{ background: mode === 'forward' ? '#0078d4' : '#333', border: 'none', padding: '8px 15px', borderRadius: '6px', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}>Forward Test</button>}
                        
                        {/* MOVED STRATEGY HERE */}
                        {mode === 'forward' && (
                             <select value={filterStrategy} onChange={(e) => setFilterStrategy(e.target.value)} style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid #ff9800', background: '#333', color: '#ff9800', fontWeight:'bold', cursor:'pointer', outline: 'none' }}>
                                <option value="BASIC">BASIC</option>
                                <option value="FAST">FAST</option>
                            </select>
                        )}

                        {/* Help Button */}
                        {mode === 'forward' && (
                            <button onClick={() => setShowHelp(true)} style={{ background: 'none', border: '1px solid #444', borderRadius: '50%', width:'28px', height:'28px', display:'flex', alignItems:'center', justifyContent:'center', color: '#0078d4', cursor: 'pointer' }} title="About this tool">
                                <HelpCircle size={16} />
                            </button>
                        )}
                    </div>

                    {/* CENTER: SYSTEM MONITOR (Integrated here) */}
                    {mode === 'forward' && data?.trades && (
                         <div style={{flex: 1, display: 'flex', justifyContent: 'center'}}>
                             {/* UPDATED: Pass strategy to filter time */}
                             <SystemMonitor trades={data.trades} isMobile={isMobile} strategy={filterStrategy} />
                         </div>
                    )}

                    {/* RIGHT: Close */}
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}><X /></button>
                </div>

                {/* BACKTEST CONFIG (Hidden) */}
                {/* ... */}

                {/* FORWARD FILTERS (Only in Forward Mode) */}
                {mode === 'forward' && (
                    <div style={{ padding: '10px 15px', background: '#252525', borderBottom: '1px solid #333', display: 'flex', gap: '10px', alignItems: 'center', flexWrap:'wrap' }}>
                        
                        <div style={{display:'flex', alignItems:'center', gap:'6px', marginRight:'10px'}}>
                            <Filter size={16} color="#0078d4" />
                            <span style={{fontSize:'0.75rem', fontWeight:'bold', color:'#aaa'}}>FILTERS</span>
                        </div>
                        
                        {/* ASSET SELECTOR - NOW FIRST */}
                        <div style={{ position: 'relative', display: 'flex', gap: '2px', order: isMobile ? -1 : 0, width: isMobile ? '100%' : 'auto' }}>
                            <div style={{ position: 'relative', width: isMobile ? '100%' : 'auto' }}>
                                <Search size={14} color="#888" style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)' }} />
                                <input type="text" placeholder={selectedAssets.size > 0 ? `${selectedAssets.size} Selected` : "Asset..."} value={filterAsset} onChange={(e) => setFilterAsset(e.target.value)} disabled={selectedAssets.size > 0} style={{ padding: '6px 6px 6px 28px', borderRadius: '4px', border: '1px solid #555', background: selectedAssets.size > 0 ? '#333' : '#1a1a1a', color: 'white', fontSize: '0.85rem', width: isMobile ? '100%' : '100px' }} />
                            </div>
                            <button onClick={() => setShowFilterAssetMenu(!showFilterAssetMenu)} style={{ background: selectedAssets.size > 0 ? '#0078d4' : '#333', border: '1px solid #555', borderRadius: '4px', color: 'white', padding: '0 8px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><ChevronDown size={14} /></button>
                            {showFilterAssetMenu && (
                                <div style={{ position: 'absolute', top: '100%', left: 0, width: '450px', maxWidth: '85vw', maxHeight: '400px', overflowY: 'auto', overflowX: 'auto', background: '#222', border: '1px solid #555', borderRadius: '6px', zIndex: 100, padding: '15px', marginTop: '5px', boxShadow: '0 10px 30px rgba(0,0,0,0.8)', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(110px, 1fr))', gap: '15px' }}>
                                    {Object.entries(ASSET_CATEGORIES).map(([category, assets]) => {
                                        const allSelected = assets.every(a => selectedAssets.has(a));
                                        return (
                                            <div key={category} style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                                <div onClick={() => toggleFilterCategory(category)} style={{ color: allSelected ? '#fff' : '#0078d4', background: allSelected ? '#0078d4' : 'transparent', fontSize: '0.75rem', fontWeight: 'bold', borderBottom: '1px solid #444', padding: '4px', marginBottom: '4px', cursor: 'pointer', borderRadius: '4px' }}>
                                                    {category.toUpperCase()}
                                                </div>
                                                {assets.map(sym => (
                                                    <button key={sym} onClick={() => toggleFilterAsset(sym)} style={{ textAlign: 'left', background: selectedAssets.has(sym) ? '#0078d4' : '#333', color: selectedAssets.has(sym) ? 'white' : '#ccc', border: 'none', padding: '6px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', transition: 'all 0.1s' }}>{sym}</button>
                                                ))}
                                            </div>
                                        );
                                    })}
                                    <div style={{ gridColumn: '1 / -1', borderTop: '1px solid #444', paddingTop: '10px', display: 'flex', justifyContent: 'flex-end' }}>
                                        <button onClick={() => {setSelectedAssets(new Set());}} style={{background:'none', border:'none', color:'#f44336', cursor:'pointer', marginRight:'15px', fontSize:'0.8rem'}}>Clear All</button>
                                        <button onClick={() => setShowFilterAssetMenu(false)} style={{background:'#0078d4', border:'none', color:'white', padding:'5px 15px', borderRadius:'4px', cursor:'pointer', fontSize:'0.8rem', fontWeight:'bold'}}>Done</button>
                                    </div>
                                </div>
                            )}
                        </div>
                        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #555', background: '#1a1a1a', color: 'white', fontSize: '0.85rem' }}><option value="ALL">Status: All</option><option value="OPEN">Open</option><option value="CLOSED">Closed</option></select>
                        <select value={filterDirection} onChange={(e) => setFilterDirection(e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #555', background: '#1a1a1a', color: 'white', fontSize: '0.85rem' }}><option value="ALL">Pos: All</option><option value="LONG">Long</option><option value="SHORT">Short</option></select>
                        <select value={filterInterval || 'ALL'} onChange={(e) => setFilterInterval(e.target.value === 'ALL' ? null : e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #555', background: '#1a1a1a', color: 'white', fontSize: '0.85rem' }}><option value="ALL">Int: All</option><option value="15min">15min</option><option value="1h">1 Hour</option><option value="4h">4 Hours</option></select>
                        <select value={filterTrend} onChange={(e) => setFilterTrend(e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #555', background: '#1a1a1a', color: 'white', fontSize: '0.85rem' }}><option value="ALL">Trend: All</option><option value="FOLLOW">Trend Follow</option><option value="COUNTER">Counter Trend</option></select>
                        <select value={filterForecast} onChange={(e) => setFilterForecast(e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #555', background: '#1a1a1a', color: 'white', fontSize: '0.85rem' }}><option value="ALL">Forecast: All</option><option value="WITH">With Forecast</option><option value="AGAINST">Against Forecast</option></select>
                        {(filterInterval || filterStatus !== 'ALL' || filterDirection !== 'ALL' || filterAsset || selectedAssets.size > 0 || filterTrend !== 'ALL' || filterForecast !== 'ALL') && (
                            <button onClick={() => { setFilterInterval(null); setFilterStatus('ALL'); setFilterDirection('ALL'); setFilterAsset(''); setSelectedAssets(new Set()); setFilterTrend('ALL'); setFilterForecast('ALL'); }} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#f44336', fontSize: '0.75rem', cursor: 'pointer', fontWeight:'bold' }}>RESET</button>
                        )}
                    </div>
                )}

                {/* MAIN CONTENT AREA */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '15px', display: 'flex', flexDirection: 'column' }}>
                    
                    {!data && loading && <div style={{textAlign:'center', marginTop:'50px', color:'#888'}}>Running simulation... This may take a moment.</div>}
                    {!data && !loading && mode === 'backtest' && <div style={{textAlign:'center', marginTop:'50px', color:'#666'}}>Configure settings and click RUN TEST</div>}
                    
                    {data && (
                        <>
                            {/* --- STATS GRID --- */}
                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '20px' }}>
                                <StatCard label="Net PnL" value={`$${displayStats.total_pnl?.toFixed(2)}`} color={displayStats.total_pnl >= 0 ? '#00c853' : '#ff3d00'} />
                                <StatCard label="Win Rate" value={`${displayStats.win_rate?.toFixed(1)}%`} /> {/* FIX 1: Rounded to 1 decimal */}
                                <StatCard label="Closed Trades" value={displayStats.total_trades} />
                                {mode === 'forward' && (
                                    <>
                                        <StatCard label="Open Trades" value={displayStats.open_trades} color="#29b6f6" />
                                        <StatCard label="Avg Win" value={`$${displayStats.avg_win?.toFixed(2)}`} color="#00c853" />
                                        <StatCard label="Avg Loss" value={`$${displayStats.avg_loss?.toFixed(2)}`} color="#ff3d00" />
                                    </>
                                )}
                            </div>

                            {/* --- FORWARD SPECIFIC: INTERVAL BREAKDOWN --- */}
                            {mode === 'forward' && !showEquity && !showPerformers && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '15px' }}>
                                    {data?.intervals?.map(intv => (
                                        <IntervalCard key={intv.interval} intervalData={intv} isActive={filterInterval === intv.interval} onClick={() => setFilterInterval(filterInterval === intv.interval ? null : intv.interval)} />
                                    ))}
                                </div>
                            )}

                            {/* --- VIEW TOGGLES --- */}
                            <div style={{marginBottom:'10px', display: 'flex', gap: '10px'}}>
                                <button onClick={() => { setShowEquity(!showEquity); setShowPerformers(false); }} style={{background: showEquity ? '#3a3a45' : 'none', border:'1px solid #444', padding:'5px 10px', color:'white', borderRadius:'4px', fontSize:'0.8rem', display:'flex', alignItems:'center', gap:'5px', cursor:'pointer'}}>
                                    {showEquity ? <List size={14}/> : <TrendingUp size={14}/>} {showEquity ? 'Show List' : 'Show Equity Curve'}
                                </button>

                                <button onClick={() => { setShowPerformers(!showPerformers); setShowEquity(false); }} style={{background: showPerformers ? '#3a3a45' : 'none', border:'1px solid #444', padding:'5px 10px', color:'white', borderRadius:'4px', fontSize:'0.8rem', display:'flex', alignItems:'center', gap:'5px', cursor:'pointer'}}>
                                    <Award size={14} color={showPerformers ? '#ffd700' : 'white'} /> Performers
                                </button>
                            </div>

                            {/* --- DATA VIEW CONTENT --- */}
                            {renderContent()}
                        </>
                    )}
                </div>
            </div>
            
            {showHelp && <HelpPopup onClose={() => setShowHelp(false)} />}
        </div>
    );
};

export default TestModal;