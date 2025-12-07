import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';

const ForwardTestModal = ({ onClose }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

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

    if (!data && loading) return null;

    // Helper for color coding arrows/text
    const getDirColor = (dir) => {
        if (dir === 'UP') return '#00c853';
        if (dir === 'DOWN') return '#ff3d00';
        return '#888';
    };

    const getCycleColor = (val) => {
        if (val > 80) return '#ff3d00'; // Overbought
        if (val < 20) return '#00c853'; // Oversold
        return '#aaa';
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
            backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 2000,
            display: 'flex', justifyContent: 'center', alignItems: 'center'
        }}>
            <div style={{
                width: '1100px', // WIDENED to fit columns
                height: '80vh', backgroundColor: '#1e1e1e',
                borderRadius: '12px', display: 'flex', flexDirection: 'column',
                border: '1px solid #444', boxShadow: '0 0 20px black'
            }}>
                {/* Header */}
                <div style={{ padding: '20px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h2 style={{ color: 'white', margin: 0 }}>Forward Test Results</h2>
                        <div style={{ fontSize: '0.85rem', color: '#888', marginTop: '5px' }}>
                            Simulated $1000 entries | Showing market snapshot @ Entry
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}><X /></button>
                </div>

                {/* Summary Cards */}
                <div style={{ display: 'flex', gap: '20px', padding: '20px', backgroundColor: '#252525' }}>
                    <div style={{ flex: 1, background: '#333', padding: '15px', borderRadius: '8px' }}>
                        <div style={{ color: '#aaa', fontSize: '0.8rem' }}>NET PNL</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: data?.summary.total_pnl >= 0 ? '#00c853' : '#ff3d00' }}>
                            ${data?.summary.total_pnl}
                        </div>
                    </div>
                    <div style={{ flex: 1, background: '#333', padding: '15px', borderRadius: '8px' }}>
                        <div style={{ color: '#aaa', fontSize: '0.8rem' }}>WIN RATE</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'white' }}>
                            {data?.summary.win_rate}%
                        </div>
                    </div>
                    <div style={{ flex: 1, background: '#333', padding: '15px', borderRadius: '8px' }}>
                        <div style={{ color: '#aaa', fontSize: '0.8rem' }}>CLOSED TRADES</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'white' }}>
                            {data?.summary.total_trades}
                        </div>
                    </div>
                </div>

                {/* Table */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', color: '#ddd', fontSize: '0.85rem' }}>
                        <thead style={{ position: 'sticky', top: 0, background: '#1e1e1e', textAlign: 'left' }}>
                            <tr style={{ borderBottom: '1px solid #444', color: '#888' }}>
                                <th style={{ padding: '10px' }}>Asset</th>
                                <th>Int</th>
                                <th>Dir</th>
                                {/* NEW COLUMNS */}
                                <th>TRND</th>
                                <th>CYC</th>
                                <th>FST</th>
                                <th>FCST</th>
                                {/* END NEW COLUMNS */}
                                <th>Status</th>
                                <th>Entry</th>
                                <th>Time</th>
                                <th>Exit</th>
                                <th>PnL</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data?.trades.map(trade => (
                                <tr key={trade.id} style={{ borderBottom: '1px solid #333' }}>
                                    <td style={{ padding: '10px', fontWeight: 'bold' }}>{trade.symbol}</td>
                                    <td>{trade.interval}</td>
                                    <td>
                                        <span style={{ 
                                            color: trade.direction === 'LONG' ? '#00c853' : '#ff3d00',
                                            fontWeight: 'bold', padding: '2px 6px',
                                            background: 'rgba(255,255,255,0.1)', borderRadius: '4px'
                                        }}>
                                            {trade.direction}
                                        </span>
                                    </td>
                                    
                                    {/* --- NEW CELLS --- */}
                                    <td style={{ fontWeight: 'bold', color: getDirColor(trade.trend) }}>
                                        {trade.trend}
                                    </td>
                                    <td style={{ fontWeight: 'bold', color: getCycleColor(trade.cycle) }}>
                                        {trade.cycle}
                                    </td>
                                    <td style={{ fontWeight: 'bold', color: getCycleColor(trade.fast) }}>
                                        {trade.fast}
                                    </td>
                                    <td style={{ fontWeight: 'bold', color: getDirColor(trade.forecast) }}>
                                        {trade.forecast}
                                    </td>
                                    {/* ---------------- */}

                                    <td style={{ color: trade.status === 'OPEN' ? '#29b6f6' : '#888' }}>{trade.status}</td>
                                    <td>{trade.entry_price.toFixed(2)}</td>
                                    <td style={{ fontSize: '0.8rem', color: '#aaa' }}>{trade.entry_date}</td>
                                    <td>{trade.exit_price ? trade.exit_price.toFixed(2) : '-'}</td>
                                    <td style={{ fontWeight: 'bold', color: trade.pnl > 0 ? '#00c853' : (trade.pnl < 0 ? '#ff3d00' : '#888') }}>
                                        {trade.status === 'CLOSED' ? `$${trade.pnl} (${trade.pnl_pct}%)` : '-'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default ForwardTestModal;