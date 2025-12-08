import React, { useState, useEffect, useMemo } from 'react';
import { X, ArrowUp, ArrowDown } from 'lucide-react';

const ForwardTestModal = ({ onClose }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    
    // Default sort: Entry Date Descending (newest first)
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

    // --- SORTING LOGIC ---
    const sortedTrades = useMemo(() => {
        if (!data?.trades) return [];
        
        let sortableItems = [...data.trades];
        if (sortConfig !== null) {
            sortableItems.sort((a, b) => {
                let aValue = a[sortConfig.key];
                let bValue = b[sortConfig.key];

                // Custom Mappings
                if (sortConfig.key === 'trend' || sortConfig.key === 'forecast') {
                    const map = { 'UP': 3, 'FLAT': 2, 'DOWN': 1, '-': 0 };
                    aValue = map[aValue] || 0;
                    bValue = map[bValue] || 0;
                } else if (sortConfig.key === 'direction') {
                    const map = { 'LONG': 2, 'SHORT': 1 };
                    aValue = map[aValue] || 0;
                    bValue = map[bValue] || 0;
                } else if (sortConfig.key === 'status') {
                    const map = { 'OPEN': 2, 'CLOSED': 1 };
                    aValue = map[aValue] || 0;
                    bValue = map[bValue] || 0;
                } else if (sortConfig.key === 'entry_date' || sortConfig.key === 'exit_date') {
                    aValue = aValue === '-' ? 0 : new Date(aValue).getTime();
                    bValue = bValue === '-' ? 0 : new Date(bValue).getTime();
                } else {
                    if (aValue === null || aValue === undefined || aValue === '-') aValue = -Infinity;
                    if (bValue === null || bValue === undefined || bValue === '-') bValue = -Infinity;
                }

                if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return sortableItems;
    }, [data, sortConfig]);

    const requestSort = (key) => {
        let direction = 'desc'; 
        if (sortConfig.key === key && sortConfig.direction === 'desc') {
            direction = 'asc';
        }
        setSortConfig({ key, direction });
    };

    const createSortHeader = (label, key, align = 'left') => (
        <th 
            style={{ padding: '15px 10px', cursor: 'pointer', userSelect: 'none', textAlign: align }}
            onClick={() => requestSort(key)}
            title={`Sort by ${label}`}
        >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: align === 'right' ? 'flex-end' : 'flex-start', gap: '5px' }}>
                {label}
                {sortConfig.key === key && (
                    sortConfig.direction === 'asc' 
                    ? <ArrowUp size={14} color="#0078d4" /> 
                    : <ArrowDown size={14} color="#0078d4" />
                )}
            </div>
        </th>
    );

    if (!data && loading) return null;

    const getDirColor = (dir) => {
        if (dir === 'UP') return '#00c853';
        if (dir === 'DOWN') return '#ff3d00';
        return '#888';
    };

    const getCycleColor = (val) => {
        if (val > 80) return '#ff3d00';
        if (val < 20) return '#00c853';
        return '#aaa';
    };

    // Helper Component for the Top Grid Cards
    const StatCard = ({ label, value, color = 'white', subValue = null }) => (
        <div style={{ background: '#333', padding: '10px', borderRadius: '6px', minWidth: '100px', flex: 1 }}>
            <div style={{ color: '#aaa', fontSize: '0.65rem', textTransform: 'uppercase', marginBottom:'4px' }}>{label}</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: color }}>{value}</div>
            {subValue && <div style={{ fontSize: '0.75rem', color: '#888', marginTop: '2px' }}>{subValue}</div>}
        </div>
    );

    // Helper for Timeframe Breakdown
    const IntervalCard = ({ data }) => (
        <div style={{ background: '#2a2a2a', border: '1px solid #444', borderRadius: '6px', padding: '8px', minWidth: '130px', flex: 1 }}>
            <div style={{ color: '#0078d4', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '5px', borderBottom:'1px solid #444', paddingBottom:'3px' }}>
                {data.interval}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '2px' }}>
                <span style={{color: '#aaa'}}>PnL:</span>
                <span style={{ fontWeight: 'bold', color: data.pnl >= 0 ? '#00c853' : '#ff3d00' }}>${data.pnl}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '2px' }}>
                <span style={{color: '#aaa'}}>Win%:</span>
                <span style={{ color: 'white' }}>{data.win_rate}%</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                <span style={{color: '#aaa'}}>Open:</span>
                <span style={{ color: '#29b6f6' }}>{data.open}</span>
            </div>
        </div>
    );

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
            backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 2000,
            display: 'flex', justifyContent: 'center', alignItems: 'center'
        }}>
            <div style={{
                width: '95%', maxWidth: '1100px', 
                height: '85vh', backgroundColor: '#1e1e1e',
                borderRadius: '12px', display: 'flex', flexDirection: 'column',
                border: '1px solid #444', boxShadow: '0 0 20px black'
            }}>
                {/* Header */}
                <div style={{ padding: '15px 20px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h2 style={{ color: 'white', margin: 0, fontSize: '1.2rem' }}>Forward Test Results</h2>
                        <div style={{ fontSize: '0.8rem', color: '#888', marginTop: '5px' }}>
                            Simulated $1000 entries | Market Snapshot @ Entry
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}><X /></button>
                </div>

                {/* --- STATS DASHBOARD --- */}
                <div style={{ padding: '15px', backgroundColor: '#252525', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    
                    {/* Row 1: Global Stats */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                        <StatCard 
                            label="Net PnL" 
                            value={`$${data?.summary.total_pnl}`} 
                            color={data?.summary.total_pnl >= 0 ? '#00c853' : '#ff3d00'} 
                        />
                        <StatCard label="Win Rate" value={`${data?.summary.win_rate}%`} />
                        <StatCard label="Closed Trades" value={data?.summary.total_trades} />
                        <StatCard label="Open Trades" value={data?.summary.open_trades} color="#29b6f6" />
                        <StatCard label="Avg Win" value={`$${data?.summary.avg_win}`} color="#00c853" />
                        <StatCard label="Avg Loss" value={`$${data?.summary.avg_loss}`} color="#ff3d00" />
                    </div>

                    {/* Row 2: Timeframe Breakdown */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '5px' }}>
                        {data?.intervals.map(intv => (
                            <IntervalCard key={intv.interval} data={intv} />
                        ))}
                    </div>
                </div>

                {/* Table */}
                <div style={{ flex: 1, overflow: 'auto', padding: '0' }}>
                    <table style={{ 
                        width: '100%', minWidth: '900px',
                        borderCollapse: 'collapse', color: '#ddd', fontSize: '0.85rem' 
                    }}>
                        <thead style={{ position: 'sticky', top: 0, background: '#1e1e1e', textAlign: 'left', zIndex: 10 }}>
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
                                {createSortHeader('Exit Time', 'exit_date')}
                                {createSortHeader('Exit $', 'exit_price')}
                                {createSortHeader('PnL', 'pnl')}
                            </tr>
                        </thead>
                        <tbody>
                            {sortedTrades.map(trade => (
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
                                    <td style={{ fontWeight: 'bold', color: getDirColor(trade.trend) }}>{trade.trend}</td>
                                    <td style={{ fontWeight: 'bold', color: getCycleColor(trade.cycle) }}>{trade.cycle}</td>
                                    <td style={{ fontWeight: 'bold', color: getCycleColor(trade.fast) }}>{trade.fast}</td>
                                    <td style={{ fontWeight: 'bold', color: getDirColor(trade.forecast) }}>{trade.forecast}</td>
                                    <td style={{ color: trade.status === 'OPEN' ? '#29b6f6' : '#888' }}>{trade.status}</td>
                                    
                                    <td>{trade.entry_price.toFixed(2)}</td>
                                    <td style={{ fontSize: '0.8rem', color: '#aaa', whiteSpace: 'nowrap' }}>{trade.entry_date}</td>
                                    
                                    <td style={{ fontSize: '0.8rem', color: '#aaa', whiteSpace: 'nowrap' }}>
                                        {trade.exit_date !== '-' ? trade.exit_date : ''}
                                    </td>

                                    <td>{trade.exit_price ? trade.exit_price.toFixed(2) : '-'}</td>
                                    
                                    <td style={{ fontWeight: 'bold', color: trade.pnl > 0 ? '#00c853' : (trade.pnl < 0 ? '#ff3d00' : '#888') }}>
                                        {trade.pnl !== 0 ? `$${trade.pnl.toFixed(2)} (${trade.pnl_pct.toFixed(2)}%)` : '-'}
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