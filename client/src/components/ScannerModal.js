import React, { useState, useEffect } from 'react';
import { X, RefreshCw, TrendingUp, TrendingDown, AlertCircle, ChevronLeft, Minus } from 'lucide-react';

const ScannerModal = ({ onClose, interval, onSelectAsset, assetList }) => {
    const [signals, setSignals] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeSymbol, setActiveSymbol] = useState(null);
    const [isCollapsed, setIsCollapsed] = useState(false);

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
        onSelectAsset(symbol);
        setActiveSymbol(symbol);
        setIsCollapsed(true);
    };

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

    return (
        <div style={{
            position: 'fixed', top: '110px', right: '20px', bottom: '20px', width: '340px',
            backgroundColor: 'rgba(30, 30, 30, 0.95)', backdropFilter: 'blur(5px)',
            borderRadius: '12px', border: '1px solid #444',
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 4px 20px rgba(0,0,0,0.6)', zIndex: 1000,
            animation: 'slideIn 0.3s ease-out'
        }}>
            <div style={{ 
                padding: '12px 15px', borderBottom: '1px solid #444', 
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                backgroundColor: '#252525', borderTopLeftRadius: '12px', borderTopRightRadius: '12px'
            }}>
                <h2 style={{ color: '#d1d4dc', margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <RefreshCw className={loading ? 'spinner' : ''} size={16} />
                    Scanner ({interval})
                </h2>
                <div style={{ display: 'flex', gap: '5px' }}>
                    <button onClick={() => setIsCollapsed(true)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer' }}><Minus size={20} /></button>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer' }}><X size={20} /></button>
                </div>
            </div>

            <div style={{ padding: '10px', overflowY: 'auto', flexGrow: 1 }}>
                {loading ? (
                    <div style={{ padding: '40px 10px', textAlign: 'center', color: '#888' }}>
                        <RefreshCw className="spinner" size={30} style={{ marginBottom: '15px', opacity: 0.7 }} />
                        <p style={{fontSize: '0.9rem'}}>Scanning...</p>
                    </div>
                ) : signals.length === 0 ? (
                    <div style={{ padding: '40px 10px', textAlign: 'center', color: '#888' }}>
                        <AlertCircle size={30} style={{ marginBottom: '10px', opacity: 0.5 }} />
                        <p style={{fontSize: '0.9rem'}}>No signals.</p>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gap: '8px' }}>
                        {/* HEADER ROW */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr 1fr', padding: '0 10px', fontSize: '0.75rem', color: '#888', fontWeight: 'bold' }}>
                            <span>ASSET</span>
                            <span style={{textAlign: 'center'}}>TREND</span>
                            <span style={{textAlign: 'right'}}>SIGNAL</span>
                        </div>

                        {signals.map((sig, idx) => {
                            const isActive = activeSymbol === sig.symbol;
                            return (
                                <div 
                                    key={idx}
                                    onClick={() => handleSignalClick(sig.symbol)}
                                    style={{
                                        display: 'grid', 
                                        gridTemplateColumns: '1.2fr 0.8fr 1fr',
                                        alignItems: 'center',
                                        backgroundColor: isActive ? '#404040' : '#2a2a2a', 
                                        border: isActive ? '1px solid #0078d4' : '1px solid transparent',
                                        padding: '10px 12px', borderRadius: '6px',
                                        cursor: 'pointer', 
                                        borderLeft: `4px solid ${sig.type === 'BUY' ? '#00ff00' : '#ff0000'}`,
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    {/* COL 1: Asset & Price */}
                                    <div>
                                        <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '0.95rem' }}>{sig.symbol}</div>
                                        <div style={{ color: '#888', fontSize: '0.75rem' }}>{sig.price.toFixed(4)}</div>
                                    </div>

                                    {/* COL 2: Trend Direction (NEW) */}
                                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                                        {sig.trend_dir === 'UP' 
                                            ? <TrendingUp size={20} color="#26a69a" /> 
                                            : <TrendingDown size={20} color="#ef5350" />
                                        }
                                    </div>

                                    {/* COL 3: Signal Badge */}
                                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                        <div style={{ 
                                            display: 'flex', alignItems: 'center', gap: '4px',
                                            color: sig.type === 'BUY' ? '#00ff00' : '#ff0000',
                                            fontWeight: 'bold', fontSize: '0.8rem',
                                            backgroundColor: 'rgba(0,0,0,0.3)',
                                            padding: '4px 8px', borderRadius: '4px'
                                        }}>
                                            {sig.type}
                                        </div>
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
            `}</style>
        </div>
    );
};

export default ScannerModal;