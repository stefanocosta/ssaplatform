import React, { useState, useEffect } from 'react';
import { X, Activity, TrendingUp, TrendingDown, FileText } from 'lucide-react';

const AnalysisModal = ({ symbol, interval, onClose }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchAnalysis = async () => {
            setLoading(true);
            const token = localStorage.getItem('access_token');
            try {
                // Ensure symbol is URL encoded properly (e.g., BTC/USD -> BTC%2FUSD)
                const safeSymbol = encodeURIComponent(symbol);
                const response = await fetch(`/api/analyze?symbol=${safeSymbol}&interval=${interval}`, {
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
    }, [symbol, interval]);

    // Color helpers
    const getPctColor = (val) => {
        if (val >= 80) return '#ef5350'; // Red
        if (val <= 20) return '#26a69a'; // Green
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
            position: 'fixed', top: '100px', right: '380px', // Placed to the left of the scanner
            width: '320px',
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
                    Deep Analysis
                </h2>
                <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            <div style={{ padding: '20px' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', color: '#888', padding: '20px' }}>
                         <Activity className="animate-spin" style={{marginRight: '10px'}}/>
                         Analyzing {symbol}...
                    </div>
                ) : data ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        
                        {/* ASSET INFO */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #444', paddingBottom: '10px' }}>
                            <div>
                                <div style={{ color: 'white', fontWeight: 'bold', fontSize: '1.2rem' }}>{data.symbol}</div>
                                <div style={{ color: '#888', fontSize: '0.8rem' }}>Interval: {interval}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ color: '#888', fontSize: '0.75rem', marginBottom: '4px' }}>CURRENT STATUS</div>
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

                        {/* STATS GRID */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            {/* Trend */}
                            <div style={{ background: '#2a2a2a', padding: '10px', borderRadius: '6px' }}>
                                <div style={{ color: '#888', fontSize: '0.7rem' }}>TREND</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: data.trend === 'Bullish' ? '#26a69a' : '#ef5350', fontWeight: 'bold' }}>
                                    {data.trend === 'Bullish' ? <TrendingUp size={16}/> : <TrendingDown size={16}/>}
                                    {data.trend}
                                </div>
                            </div>
                            
                            {/* Signal Age */}
                            <div style={{ background: '#2a2a2a', padding: '10px', borderRadius: '6px' }}>
                                <div style={{ color: '#888', fontSize: '0.7rem' }}>SIGNAL AGE</div>
                                <div style={{ color: '#fff', fontWeight: 'bold' }}>
                                    {data.bars_ago >= 0 ? `${data.bars_ago} bars ago` : 'None'}
                                </div>
                            </div>
                        </div>

                        {/* CYCLES */}
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', fontSize: '0.8rem', color: '#ccc' }}>
                                <span>Cycle Position</span>
                                <span style={{ color: getPctColor(data.cycle_pct) }}>{data.cycle_pct}%</span>
                            </div>
                            <div style={{ width: '100%', height: '6px', background: '#333', borderRadius: '3px', overflow: 'hidden' }}>
                                <div style={{ width: `${Math.min(100, Math.max(0, data.cycle_pct))}%`, height: '100%', background: getPctColor(data.cycle_pct), transition: 'width 0.5s' }} />
                            </div>
                        </div>

                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', fontSize: '0.8rem', color: '#ccc' }}>
                                <span>Fast (Noise)</span>
                                <span style={{ color: getPctColor(data.fast_pct) }}>{data.fast_pct}%</span>
                            </div>
                            <div style={{ width: '100%', height: '6px', background: '#333', borderRadius: '3px', overflow: 'hidden' }}>
                                <div style={{ width: `${Math.min(100, Math.max(0, data.fast_pct))}%`, height: '100%', background: getPctColor(data.fast_pct), transition: 'width 0.5s' }} />
                            </div>
                        </div>

                        {/* RECOMMENDATION TEXT */}
                        <div style={{ background: 'rgba(0, 120, 212, 0.1)', borderLeft: '3px solid #0078d4', padding: '10px', borderRadius: '0 6px 6px 0', marginTop: '5px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#0078d4', fontWeight: 'bold', fontSize: '0.85rem', marginBottom: '6px' }}>
                                <FileText size={16} /> Recommendation
                            </div>
                            <p style={{ margin: 0, color: '#d1d4dc', fontSize: '0.85rem', lineHeight: '1.4' }}>
                                {data.recommendation}
                            </p>
                        </div>

                    </div>
                ) : null}
            </div>
            <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } } .animate-spin { animation: spin 1s linear infinite; } @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
    );
};

export default AnalysisModal;