import React, { useState, useEffect, useMemo } from 'react';
import { X, ArrowUp, ArrowDown, Search, Filter } from 'lucide-react';

const ForwardTestModal = ({ onClose }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    
    // --- FILTERS STATE ---
    const [filterInterval, setFilterInterval] = useState(null); // null = All
    const [filterStatus, setFilterStatus] = useState('ALL');    // ALL, OPEN, CLOSED
    const [filterAsset, setFilterAsset] = useState('');
    
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

    // --- 1. FILTERING & STATS CALCULATION ---
    const dashboardData = useMemo(() => {
        if (!data?.trades) return { trades: [], stats: null };

        // A. Filter the Trades
        const filtered = data.trades.filter(t => {
            // Interval Filter
            if (filterInterval && t.interval !== filterInterval) return false;
            // Status Filter
            if (filterStatus !== 'ALL' && t.status !== filterStatus) return false;
            // Asset Filter (Partial Match)
            if (filterAsset && !t.symbol.includes(filterAsset.toUpperCase())) return false;
            return true;
        });

        // B. Calculate Dynamic Stats for the Filtered View
        const stats = {
            total_pnl: 0,
            win_count: 0,
            loss_count: 0,
            closed_count: 0,
            open_count: 0,
            sum_wins: 0,
            sum_losses: 0
        };

        filtered.forEach(t => {
            if (t.status === 'OPEN') {
                stats.open_count++;
            } else {
                stats.closed_count++;
                stats.total_pnl += (t.pnl || 0);
                if ((t.pnl || 0) > 0) {
                    stats.win_count++;
                    stats.sum_wins += t.pnl;
                } else {
                    stats.loss_count++;
                    stats.sum_losses += Math.abs(t.pnl || 0);
                }
            }
        });

        const win_rate = stats.closed_count > 0 ? (stats.win_count / stats.closed_count * 100) : 0;
        const avg_win = stats.win_count > 0 ? (stats.sum_wins / stats.win_count) : 0;
        const avg_loss = stats.loss_count > 0 ? (stats.sum_losses / stats.loss_count) : 0;

        return {
            trades: filtered,
            stats: {
                total_pnl: stats.total_pnl,
                win_rate: win_rate,
                total_trades: stats.closed_count,
                open_trades: stats.open_count,
                avg_win: avg_win,
                avg_loss: avg_loss
            }
        };

    }, [data, filterInterval, filterStatus, filterAsset]);

    // --- 2. SORTING LOGIC (Applied to Filtered Data) ---
    const sortedTrades = useMemo(() => {
        let sortableItems = [...dashboardData.trades];
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
    }, [dashboardData, sortConfig]);

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

    // Use computed stats for display (fallback to global summary if something fails, though dashboardData.stats handles it)
    const displayStats = dashboardData.stats || data?.summary;

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

    // Helper for Timeframe Breakdown (Clickable)
    const IntervalCard = ({ intervalData, isActive, onClick }) => (
        <div 
            onClick={onClick}
            style={{ 
                background: isActive ? '#3a3a45' : '#2a2a2a', 
                border: isActive ? '1px solid #0078d4' : '1px solid #444', 
                borderRadius: '6px', padding: '8px', minWidth: '130px', flex: 1,
                cursor: 'pointer', transition: 'all 0.2s'
            }}
        >
            <div style={{ color: isActive ? '#0078d4' : '#d1d4dc', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '5px', borderBottom:'1px solid #444', paddingBottom:'3px', display:'flex', justifyContent:'space-between' }}>
                {intervalData.interval}
                {isActive && <span style={{fontSize:'0.7rem', background:'#0078d4', color:'white', padding:'0 4px', borderRadius:'3px'}}>ACTIVE</span>}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '2px' }}>
                <span style={{color: '#aaa'}}>PnL:</span>
                <span style={{ fontWeight: 'bold', color: intervalData.pnl >= 0 ? '#00c853' : '#ff3d00' }}>${intervalData.pnl}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '2px' }}>
                <span style={{color: '#aaa'}}>Win%:</span>
                <span style={{ color: 'white' }}>{intervalData.win_rate}%</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '2px' }}>
                <span style={{color: '#aaa'}}>Open:</span>
                <span style={{ color: '#29b6f6' }}>{intervalData.open}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                <span style={{color: '#aaa'}}>Closed:</span>
                <span style={{ color: '#aaa' }}>{intervalData.closed}</span>
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
                            Dynamic Filter Analysis | Simulated Entries
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}><X /></button>
                </div>

                {/* --- STATS DASHBOARD --- */}
                <div style={{ padding: '15px', backgroundColor: '#252525', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    
                    {/* Row 1: Filtered Stats (Dynamic) */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                        <StatCard 
                            label="Net PnL" 
                            value={`$${displayStats.total_pnl.toFixed(2)}`} 
                            color={displayStats.total_pnl >= 0 ? '#00c853' : '#ff3d00'} 
                        />
                        <StatCard label="Win Rate" value={`${displayStats.win_rate.toFixed(1)}%`} />
                        <StatCard label="Closed Trades" value={displayStats.total_trades} />
                        <StatCard label="Open Trades" value={displayStats.open_trades} color="#29b6f6" />
                        <StatCard label="Avg Win" value={`$${displayStats.avg_win.toFixed(2)}`} color="#00c853" />
                        <StatCard label="Avg Loss" value={`$${displayStats.avg_loss.toFixed(2)}`} color="#ff3d00" />
                    </div>

                    {/* Row 2: Timeframe Breakdown (Clickable Filters) */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '5px' }}>
                        {data?.intervals.map(intv => (
                            <IntervalCard 
                                key={intv.interval} 
                                intervalData={intv} 
                                isActive={filterInterval === intv.interval}
                                onClick={() => setFilterInterval(filterInterval === intv.interval ? null : intv.interval)}
                            />
                        ))}
                    </div>

                    {/* Row 3: Filter Controls */}
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '5px', background:'#333', padding:'8px', borderRadius:'6px' }}>
                        <Filter size={16} color="#888" />
                        
                        {/* Asset Filter */}
                        <div style={{ position: 'relative' }}>
                            <Search size={14} color="#888" style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)' }} />
                            <input 
                                type="text" 
                                placeholder="Filter Asset (e.g. EUR)" 
                                value={filterAsset}
                                onChange={(e) => setFilterAsset(e.target.value)}
                                style={{ 
                                    padding: '6px 6px 6px 28px', borderRadius: '4px', border: '1px solid #555', 
                                    background: '#222', color: 'white', fontSize: '0.85rem', width: '150px'
                                }}
                            />
                        </div>

                        {/* Status Filter */}
                        <select 
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                            style={{ 
                                padding: '6px', borderRadius: '4px', border: '1px solid #555', 
                                background: '#222', color: 'white', fontSize: '0.85rem'
                            }}
                        >
                            <option value="ALL">Status: All</option>
                            <option value="OPEN">Status: Open</option>
                            <option value="CLOSED">Status: Closed</option>
                        </select>

                        {/* Clear Button */}
                        {(filterInterval || filterStatus !== 'ALL' || filterAsset) && (
                            <button 
                                onClick={() => { setFilterInterval(null); setFilterStatus('ALL'); setFilterAsset(''); }}
                                style={{ 
                                    marginLeft: 'auto', background: 'none', border: 'none', 
                                    color: '#f44336', fontSize: '0.8rem', cursor: 'pointer', fontWeight:'bold' 
                                }}
                            >
                                Clear Filters
                            </button>
                        )}
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