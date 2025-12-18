import React, { useState, useEffect } from 'react';
import { X, Activity, TrendingUp, TrendingDown, FileText, Zap, Clock, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import DeepWaveModal from './DeepWaveModal';

const HTFCard = ({ data }) => {
    const isLong = data.status === 'LONG';
    const isShort = data.status === 'SHORT';
    
    const statusColor = isLong ? '#00c853' : (isShort ? '#ff3d00' : '#888');
    const cycleColor = data.fast_rising ? '#00c853' : '#ff3d00';

    return (
        <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: '#222', borderRadius: '6px', border: '1px solid #333',
            padding: '8px 12px', marginBottom: '8px'
        }}>
            <div style={{display:'flex', alignItems:'center', gap:'6px'}}>
                <Clock size={14} color="#666"/>
                <span style={{color:'#fff', fontWeight:'bold', fontSize:'0.85rem'}}>{data.interval}</span>
            </div>
            <div style={{
                fontSize: '0.7rem', fontWeight: 'bold', color: statusColor,
                border: `1px solid ${statusColor}`, borderRadius: '4px',
                padding: '1px 6px', minWidth: '50px', textAlign: 'center'
            }}>
                {data.status}
            </div>
            <div style={{display:'flex', alignItems:'center', gap:'4px'}}>
                <span style={{color: '#aaa', fontSize: '0.7rem'}}>Fast:</span>
                <span style={{color: cycleColor, fontWeight: 'bold', fontSize: '0.8rem'}}>{data.fast_pct}%</span>
                {data.fast_rising 
                    ? <ArrowUpRight size={14} color={cycleColor}/> 
                    : <ArrowDownRight size={14} color={cycleColor}/>
                }
            </div>
        </div>
    );
};

const OscillatorBar = ({ value, color }) => {
    const MIN_SCALE = -25;
    const MAX_SCALE = 125;
    const TOTAL_RANGE = MAX_SCALE - MIN_SCALE;

    const getPosPercent = (val) => {
        const clamped = Math.max(MIN_SCALE, Math.min(MAX_SCALE, val));
        return ((clamped - MIN_SCALE) / TOTAL_RANGE) * 100;
    };

    const zeroPos = getPosPercent(0);
    const hundredPos = getPosPercent(100);
    const valuePos = getPosPercent(value);

    const barLeft = value >= 0 ? zeroPos : valuePos;
    const barWidth = Math.abs(valuePos - zeroPos);

    return (
        <div style={{ position: 'relative', width: '100%', height: '20px', marginTop: '2px' }}>
            <div style={{ 
                width: '100%', height: '6px', background: '#333', borderRadius: '3px', 
                position: 'absolute', top: '7px', overflow: 'hidden' 
            }}>
                <div style={{ 
                    position: 'absolute', left: `${barLeft}%`, width: `${barWidth}%`, height: '100%',
                    background: color, transition: 'all 0.5s ease-out',
                    boxShadow: value > 100 || value < 0 ? `0 0 5px ${color}` : 'none'
                }} />
            </div>
            <div style={{ position: 'absolute', left: `${zeroPos}%`, top: '2px', bottom: '2px', width: '1px', background: '#666', zIndex: 2 }}>
                <div style={{ fontSize: '0.5rem', color: '#666', position: 'absolute', top: '-10px', left: '-50%', transform: 'translateX(-2px)' }}>0</div>
            </div>
            <div style={{ position: 'absolute', left: `${hundredPos}%`, top: '2px', bottom: '2px', width: '1px', background: '#666', zIndex: 2 }}>
                <div style={{ fontSize: '0.5rem', color: '#666', position: 'absolute', top: '-10px', left: '-50%', transform: 'translateX(-4px)' }}>100</div>
            </div>
        </div>
    );
};

const AnalysisModal = ({ symbol, interval, strategy, onClose }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    
    // Persistent State
    const [showDeepWave, setShowDeepWave] = useState(() => {
        return sessionStorage.getItem('keepDeepWaveOpen') === 'true';
    });

    useEffect(() => {
        sessionStorage.setItem('keepDeepWaveOpen', showDeepWave);
    }, [showDeepWave]);

    const handleMainClose = () => {
        sessionStorage.setItem('keepDeepWaveOpen', 'false'); 
        onClose();
    };

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);

        const fetchAnalysis = async () => {
            setLoading(true);
            const token = localStorage.getItem('access_token');
            try {
                const safeSymbol = encodeURIComponent(symbol);
                const response = await fetch(`/api/analyze?symbol=${safeSymbol}&interval=${interval}&strategy=${strategy}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const result = await response.json();
                if (result.error) console.error(result.error);
                else setData(result);
            } catch (error) {
                console.error("Analysis failed", error);
            } finally {
                setLoading(false);
            }
        };

        if (symbol) fetchAnalysis();

        return () => window.removeEventListener('resize', handleResize);
    }, [symbol, interval, strategy]);

    const getPctColor = (val) => {
        if (val >= 80) return '#ef5350'; 
        if (val <= 20) return '#26a69a'; 
        return '#b0b0b0';
    };

    const getStatusColor = (status) => {
        if (status === 'LONG') return '#00ff00';
        if (status === 'SHORT') return '#ff0000';
        return '#888';
    };

    if (!symbol) return null;

    return (
        <div style={{
            position: 'fixed', 
            top: isMobile ? '80px' : '100px', 
            right: isMobile ? '10px' : '380px',
            width: '320px',
            maxWidth: 'calc(100vw - 20px)', 
            backgroundColor: 'rgba(30, 30, 30, 0.95)', backdropFilter: 'blur(10px)',
            borderRadius: '12px', border: '1px solid #444',
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 4px 20px rgba(0,0,0,0.6)', zIndex: 1000,
            animation: 'fadeIn 0.3s ease-out'
        }}>
            {/* HEADER */}
            <div style={{ 
                padding: '12px 15px', borderBottom: '1px solid #444', 
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                backgroundColor: '#252525', borderTopLeftRadius: '12px', borderTopRightRadius: '12px'
            }}>
                <h2 style={{ color: '#d1d4dc', margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Activity size={18} color="#0078d4"/>
                    Deep Analysis <span style={{fontSize: '0.7rem', color: '#ff9800', border: '1px solid #ff980044', padding: '1px 4px', borderRadius: '3px', marginLeft: '5px'}}>{strategy?.toUpperCase()}</span>
                </h2>
                <button onClick={handleMainClose} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            <div style={{ padding: '20px' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', color: '#888', padding: '20px' }}>
                         <Activity className="animate-spin" style={{marginRight: '10px'}}/>
                         Analyzing {symbol}...
                    </div>
                ) : data ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        
                        {/* 1. ASSET HEADER */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #444', paddingBottom: '10px' }}>
                            <div>
                                <div style={{ color: 'white', fontWeight: 'bold', fontSize: '1.2rem' }}>{data.symbol}</div>
                                <div style={{ color: '#888', fontSize: '0.8rem' }}>Current: {interval}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ 
                                    color: getStatusColor(data.status), 
                                    fontWeight: 'bold', 
                                    border: `1px solid ${getStatusColor(data.status)}`,
                                    padding: '2px 8px', borderRadius: '4px', fontSize: '0.85rem', display: 'inline-block'
                                }}>
                                    {data.status}
                                </div>
                            </div>
                        </div>

                        {/* 2. MARKET CONTEXT (NEW SECTION) */}
                        {data.context && data.context.length > 0 && (
                            <div>
                                <div style={{ color: '#888', fontSize: '0.7rem', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Higher Timeframe Context
                                </div>
                                {data.context.map((ctx, idx) => (
                                    <HTFCard key={idx} data={ctx} />
                                ))}
                            </div>
                        )}

                        {/* 3. STATS GRID */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            <div style={{ background: '#2a2a2a', padding: '10px', borderRadius: '6px' }}>
                                <div style={{ color: '#888', fontSize: '0.7rem' }}>TREND</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: data.trend === 'Bullish' ? '#26a69a' : '#ef5350', fontWeight: 'bold' }}>
                                    {data.trend === 'Bullish' ? <TrendingUp size={16}/> : <TrendingDown size={16}/>}
                                    {data.trend}
                                </div>
                            </div>
                            <div style={{ background: '#2a2a2a', padding: '10px', borderRadius: '6px' }}>
                                <div style={{ color: '#888', fontSize: '0.7rem' }}>SIGNAL AGE</div>
                                <div style={{ color: '#fff', fontWeight: 'bold' }}>
                                    {data.bars_ago >= 0 ? `${data.bars_ago} bars ago` : 'None'}
                                </div>
                            </div>
                        </div>

                        {/* 4. OSCILLATORS */}
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0px', fontSize: '0.8rem', color: '#ccc' }}>
                                <span>Cyclic</span>
                                <span style={{ color: getPctColor(data.cycle_pct) }}>{data.cycle_pct}%</span>
                            </div>
                            <OscillatorBar value={data.cycle_pct} color={getPctColor(data.cycle_pct)} />
                        </div>

                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0px', fontSize: '0.8rem', color: '#ccc' }}>
                                <span>Fast Cyclic</span>
                                <span style={{ color: getPctColor(data.fast_pct) }}>{data.fast_pct}%</span>
                            </div>
                            <OscillatorBar value={data.fast_pct} color={getPctColor(data.fast_pct)} />
                        </div>

                        {/* 5. RECOMMENDATION */}
                        <div style={{ background: 'rgba(0, 120, 212, 0.1)', borderLeft: '3px solid #0078d4', padding: '10px', borderRadius: '0 6px 6px 0', marginTop: '5px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#0078d4', fontWeight: 'bold', fontSize: '0.85rem', marginBottom: '6px' }}>
                                <FileText size={16} /> Recommendation
                            </div>
                            <p style={{ margin: 0, color: '#d1d4dc', fontSize: '0.85rem', lineHeight: '1.4', whiteSpace: 'pre-line' }}>
                                {data.recommendation}
                            </p>
                        </div>

                        {/* DEEP WAVE LAB BUTTON */}
                        <button 
                            onClick={() => setShowDeepWave(true)}
                            style={{
                                width: '100%', padding: '12px',
                                background: 'linear-gradient(45deg, #1e1e1e, #333)',
                                border: '1px solid #555', borderRadius: '6px',
                                color: '#fff', fontSize: '0.9rem', fontWeight: 'bold',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                cursor: 'pointer', boxShadow: '0 4px 10px rgba(0,0,0,0.3)',
                                marginTop: '5px'
                            }}
                        >
                            <Zap size={16} fill="#ffd700" color="#ffd700"/> Launch Deep Wave Lab
                        </button>

                    </div>
                ) : null}
            </div>
            
            {/* DISCLAIMER */}
            {!loading && data && (
                <div style={{ 
                    padding: '10px 15px', 
                    background: '#252525', 
                    borderTop: '1px solid #333',
                    borderBottomLeftRadius: '12px',
                    borderBottomRightRadius: '12px'
                }}>
                    <p style={{ margin: 0, color: '#858282ff', fontSize: '0.65rem', lineHeight: '1.3', textAlign: 'justify' }}>
                        <strong>Disclaimer:</strong> This analysis is mathematically generated based on statistical algorithms. 
                        It describes the current technical condition of the asset and is <em>not</em> a recommendation to trade. 
                    </p>
                </div>
            )}
            
            {/* RENDER DEEP WAVE MODAL */}
            {showDeepWave && (
                <DeepWaveModal 
                    symbol={symbol} 
                    interval={interval} 
                    onClose={() => setShowDeepWave(false)} 
                />
            )}

            <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } } .animate-spin { animation: spin 1s linear infinite; } @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
    );
};

export default AnalysisModal;