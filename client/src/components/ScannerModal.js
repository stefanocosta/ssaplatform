import React, { useState, useEffect } from 'react';
import { X, RefreshCw, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';

const ScannerModal = ({ onClose, interval, onSelectAsset }) => {
    const [signals, setSignals] = useState([]);
    const [loading, setLoading] = useState(true);
    // Track which asset is currently active on the chart
    const [activeSymbol, setActiveSymbol] = useState(null);

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
                setSignals(data);
            }
        } catch (error) {
            console.error("Scan failed", error);
        } finally {
            setLoading(false);
        }
    };

    const handleSignalClick = (symbol) => {
        // 1. Update the chart in the background
        onSelectAsset(symbol);
        // 2. Highlight this row
        setActiveSymbol(symbol);
        // 3. DO NOT CLOSE THE MODAL (Persistent)
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 1000,
            display: 'flex', justifyContent: 'center', alignItems: 'center'
        }}>
            <div style={{
                backgroundColor: '#1e1e1e', width: '90%', maxWidth: '500px',
                borderRadius: '12px', border: '1px solid #333',
                display: 'flex', flexDirection: 'column', maxHeight: '80vh',
                boxShadow: '0 0 20px rgba(0,0,0,0.5)'
            }}>
                {/* Header */}
                <div style={{ padding: '15px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ color: '#d1d4dc', margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <RefreshCw className={loading ? 'spinner' : ''} size={20} />
                        Market Scanner ({interval})
                    </h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer' }}>
                        <X size={24} />
                    </button>
                </div>

                {/* Content */}
                <div style={{ padding: '15px', overflowY: 'auto', flexGrow: 1 }}>
                    {loading ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>
                            <RefreshCw className="spinner" size={40} style={{ marginBottom: '15px', opacity: 0.7 }} />
                            <p>Scanning market data...</p>
                        </div>
                    ) : signals.length === 0 ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>
                            <AlertCircle size={40} style={{ marginBottom: '10px', opacity: 0.5 }} />
                            <p>No active signals found for this timeframe.</p>
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gap: '10px' }}>
                            {signals.map((sig, idx) => {
                                // Check if this is the active symbol
                                const isActive = activeSymbol === sig.symbol;
                                
                                return (
                                    <div 
                                        key={idx}
                                        onClick={() => handleSignalClick(sig.symbol)}
                                        style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            // Change background if active to show selection
                                            backgroundColor: isActive ? '#404040' : '#2a2a2a', 
                                            // Add a bright border if active
                                            border: isActive ? '1px solid #0078d4' : '1px solid transparent',
                                            padding: '15px', borderRadius: '8px',
                                            cursor: 'pointer', 
                                            borderLeft: `4px solid ${sig.type === 'BUY' ? '#00ff00' : '#ff0000'}`,
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        <div>
                                            <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '1.1rem' }}>
                                                {sig.symbol}
                                                {isActive && <span style={{fontSize: '0.7rem', marginLeft: '8px', color: '#00bcd4', textTransform: 'uppercase', border: '1px solid #00bcd4', padding: '1px 4px', borderRadius: '4px'}}>Active</span>}
                                            </div>
                                            <div style={{ color: '#888', fontSize: '0.85rem' }}>Price: {sig.price.toFixed(4)}</div>
                                        </div>
                                        <div style={{ 
                                            display: 'flex', alignItems: 'center', gap: '5px',
                                            color: sig.type === 'BUY' ? '#00ff00' : '#ff0000',
                                            fontWeight: 'bold', backgroundColor: 'rgba(0,0,0,0.2)',
                                            padding: '5px 10px', borderRadius: '4px'
                                        }}>
                                            {sig.type === 'BUY' ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                                            {sig.type}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
                
                <style>{`
                    @keyframes spin { 
                        0% { transform: rotate(0deg); } 
                        100% { transform: rotate(360deg); } 
                    }
                    .spinner { 
                        animation: spin 1s linear infinite; 
                        display: inline-block;
                    }
                `}</style>
            </div>
        </div>
    );
};

export default ScannerModal;