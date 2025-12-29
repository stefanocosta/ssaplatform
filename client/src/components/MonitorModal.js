import React, { useState, useEffect, useRef } from 'react';
import { X, Activity, Play, Square, Volume2, VolumeX, ExternalLink, Clock, AlertCircle } from 'lucide-react';

const MonitorModal = ({ 
    isOpen = true, 
    onClose, 
    onOpen, 
    strategy, 
    onSelectAsset, 
    onStatusChange 
}) => {
    const [selectedInterval, setSelectedInterval] = useState('15min');
    const [isMonitoring, setIsMonitoring] = useState(false);
    const [signalsLog, setSignalsLog] = useState([]); 
    const [lastScanTime, setLastScanTime] = useState(null);
    const [soundEnabled, setSoundEnabled] = useState(true);
    
    // TriggerRef is a counter used to re-run the effect loop reliably
    const [scanTrigger, setScanTrigger] = useState(0);

    const logsEndRef = useRef(null);

    // Auto-scroll logs
    useEffect(() => {
        if (isOpen && logsEndRef.current) {
            logsEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [signalsLog, isOpen]);

    // --- THE ROBUST MONITORING LOOP ---
    useEffect(() => {
        let timerId = null;

        if (isMonitoring) {
            const runScan = async () => {
                try {
                    const token = localStorage.getItem('access_token');
                    const res = await fetch(`/api/scan?interval=${selectedInterval}&strategy=${strategy}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    
                    if (!res.ok) throw new Error("API Error");
                    
                    const data = await res.json();
                    
                    // Update Time (Visual feedback)
                    setLastScanTime(new Date());

                    // 1. FILTER: New Signals Only (Age = 0)
                    const newSignals = data.filter(item => item.signal !== null && item.bars_ago === 0);

                    // 2. ALWAYS UPDATE LIST (Replace old signals)
                    setSignalsLog(newSignals);

                    // 3. NOTIFICATIONS
                    if (newSignals.length > 0) {
                        // FIX: Safe check - only try notification if supported
                        if ('Notification' in window && Notification.permission === 'granted') {
                            try {
                                new Notification(`Found ${newSignals.length} ${strategy} Signals`, { 
                                    body: `Interval: ${selectedInterval}`, 
                                    icon: '/favicon.ico' 
                                });
                            } catch (e) {
                                console.warn("Notification failed:", e);
                            }
                        }

                        if (soundEnabled) {
                            const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3'); 
                            audio.play().catch(e => console.log("Audio error", e));
                        }
                        
                        // Auto-Open if background
                        if (!isOpen && onOpen) onOpen();
                    }

                } catch (err) {
                    console.error("Monitor Scan Failed:", err);
                } finally {
                    // Update trigger to schedule next loop even if failed
                    setScanTrigger(prev => prev + 1);
                }
            };

            // Calculate delay to next minute mark + 2 seconds buffer
            const now = new Date();
            const msToNextMinute = (60000 - (now.getTime() % 60000)) + 2000;

            timerId = setTimeout(() => {
                runScan();
            }, msToNextMinute);
        }

        return () => {
            if (timerId) clearTimeout(timerId);
        };
    }, [isMonitoring, scanTrigger, selectedInterval, strategy, soundEnabled, isOpen, onOpen]); 

    // FIX: Updated Start Function (Permissive)
    const startMonitoring = () => {
        // Try to request permission, but don't block execution if it fails/missing
        if ('Notification' in window) {
            Notification.requestPermission().catch(e => console.log("Notifications blocked/error", e));
        }

        setIsMonitoring(true);
        if (onStatusChange) onStatusChange(true);
        
        // Run one immediate scan for instant feedback
        setScanTrigger(prev => prev + 1); 
    };

    const stopMonitoring = () => {
        setIsMonitoring(false);
        setSignalsLog([]); 
        setLastScanTime(null);
        if (onStatusChange) onStatusChange(false);
    };

    const handleAssetClick = (symbol) => {
        if (onSelectAsset) onSelectAsset(symbol);
    };

    const options = [
        { label: '1 Min', value: '1min' },
        { label: '5 Min', value: '5min' },
        { label: '15 Min', value: '15min' },
        { label: '30 Min', value: '30min' },
        { label: '1 Hour', value: '1h' },
        { label: '4 Hours', value: '4h' }
    ];

    // --- RENDER LOGIC ---
    if (!isOpen && !isMonitoring) return null;

    const containerStyle = {
        position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
        backgroundColor: 'rgba(0,0,0,0.3)', 
        zIndex: 2000,
        display: isOpen ? 'flex' : 'none', 
        justifyContent: 'center', alignItems: 'center'
    };

    return (
        <div style={containerStyle}>
            <div style={{
                backgroundColor: '#1e1e1e', padding: '25px', borderRadius: '12px',
                border: isMonitoring ? '2px solid #00e676' : '1px solid #444', 
                width: '400px', display: 'flex', flexDirection: 'column', gap: '15px',
                boxShadow: isMonitoring ? '0 0 30px rgba(0, 230, 118, 0.15)' : 'none'
            }}>
                {/* HEADER */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #444', paddingBottom: '10px' }}>
                    <div>
                        <h2 style={{ color: 'white', margin: 0, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Activity color={isMonitoring ? "#00e676" : "#ff9800"} size={20} className={isMonitoring ? "animate-pulse" : ""} /> 
                            {isMonitoring ? "Live Monitor" : "Configure Monitor"}
                        </h2>
                        <div style={{color:'#888', fontSize:'0.75rem', marginTop:'2px', display:'flex', alignItems:'center', gap:'6px'}}>
                            Strategy: <span style={{color:'#ff9800', fontWeight:'bold', border:'1px solid #ff9800', padding:'0 4px', borderRadius:'3px'}}>{strategy?.toUpperCase() || 'BASIC'}</span>
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer' }}><X /></button>
                </div>

                {!isMonitoring ? (
                    <>
                        <div style={{ background: 'rgba(255, 152, 0, 0.1)', borderLeft: '3px solid #ff9800', padding: '10px', fontSize: '0.8rem', color: '#d1d4dc', lineHeight:'1.4' }}>
                            <strong style={{color:'#ffcc80'}}>Background Mode:</strong><br/>
                            Scans are synchronized to candle close. Popups appear automatically when a <strong>New Signal</strong> triggers.
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                            {options.map(opt => (
                                <button 
                                    key={opt.value}
                                    onClick={() => setSelectedInterval(opt.value)}
                                    style={{
                                        padding: '8px', borderRadius: '4px', border: '1px solid #444',
                                        backgroundColor: selectedInterval === opt.value ? '#ff9800' : '#333',
                                        color: selectedInterval === opt.value ? 'black' : 'white',
                                        cursor: 'pointer', fontWeight: 'bold', fontSize:'0.85rem'
                                    }}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                        
                        <div onClick={() => setSoundEnabled(!soundEnabled)} style={{display:'flex', alignItems:'center', gap:'10px', cursor:'pointer', color:'#ccc', fontSize:'0.9rem', padding:'5px'}}>
                            {soundEnabled ? <Volume2 size={18} color="#00e676"/> : <VolumeX size={18} color="#ef5350"/>}
                            Sound Alerts {soundEnabled ? 'On' : 'Off'}
                        </div>

                        <button 
                            onClick={startMonitoring}
                            style={{
                                padding: '12px', borderRadius: '6px', border: 'none',
                                backgroundColor: '#ff9800', color: 'black', fontWeight: 'bold', fontSize: '1rem',
                                cursor: 'pointer', marginTop: '10px', display:'flex', alignItems:'center', justifyContent:'center', gap:'8px'
                            }}
                        >
                            <Play size={18} fill="black" /> START MONITORING
                        </button>
                    </>
                ) : (
                    <>
                        <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                            
                            <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.85rem', color:'#aaa', background:'#252525', padding:'8px', borderRadius:'4px' }}>
                                <span style={{display:'flex', alignItems:'center', gap:'5px'}}><Clock size={14}/> {selectedInterval}</span>
                                <span style={{display:'flex', alignItems:'center', gap:'5px'}}>Last Scan: <strong style={{color:'#fff'}}>{lastScanTime ? lastScanTime.toLocaleTimeString() : '...'}</strong></span>
                            </div>

                            {/* SIGNAL LIST */}
                            <div style={{ 
                                height: '220px', background: '#111', borderRadius: '6px', 
                                border: '1px solid #333', overflowY: 'auto', padding: '10px',
                                fontFamily: 'monospace', fontSize: '0.85rem'
                            }}>
                                {signalsLog.length === 0 && (
                                    <div style={{height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', color:'#444'}}>
                                        <Activity className="animate-spin" size={24} style={{marginBottom:'10px'}}/>
                                        <div>Scanning...</div>
                                        <div style={{fontSize:'0.7rem', marginTop:'5px'}}>Waiting for new signals</div>
                                    </div>
                                )}
                                
                                {signalsLog.map((log, i) => (
                                    <div key={i} style={{ 
                                        marginBottom: '6px', 
                                        backgroundColor: 'rgba(255,255,255,0.05)', 
                                        borderRadius: '4px',
                                        padding: '10px 12px', // Comfortable padding
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                    }}>
                                        <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                                            
                                            {/* CLICKABLE ASSET - NO TIME */}
                                            <span 
                                                onClick={() => handleAssetClick(log.symbol)}
                                                title="Open in Chart"
                                                style={{
                                                    color: '#29b6f6', fontWeight: 'bold', cursor: 'pointer', 
                                                    display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.95rem'
                                                }}
                                            >
                                                {log.symbol} <ExternalLink size={12} strokeWidth={2.5} />
                                            </span>

                                            {/* SIGNAL BADGE */}
                                            <span style={{
                                                color: log.signal === 'BUY' || log.signal === 'LONG' ? '#00e676' : '#ff3d00',
                                                fontWeight: 'bold', 
                                                background: 'rgba(0,0,0,0.3)', 
                                                padding:'2px 8px', borderRadius:'4px', fontSize:'0.8rem'
                                            }}>
                                                {log.signal}
                                            </span>
                                        </div>
                                        
                                        <div style={{color:'#ccc', fontWeight:'bold'}}>${log.price}</div>
                                    </div>
                                ))}
                                <div ref={logsEndRef} />
                            </div>

                            <div style={{display:'flex', gap:'10px'}}>
                                <button onClick={onClose} style={{ flex: 1, padding: '12px', borderRadius: '6px', border: '1px solid #444', backgroundColor: 'transparent', color: '#aaa', fontWeight: 'bold', cursor: 'pointer' }}>HIDE (Run in Background)</button>
                                <button onClick={stopMonitoring} style={{ flex: 1, padding: '12px', borderRadius: '6px', border: 'none', backgroundColor: '#ef5350', color: 'white', fontWeight: 'bold', cursor: 'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:'8px' }}>
                                    <Square size={14} fill="white" /> STOP
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
            <style>{`
                .animate-pulse { animation: pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
                .animate-spin { animation: spin 1.5s linear infinite; }
                @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }
                @keyframes spin { 100% { transform: rotate(360deg); } }
                ::-webkit-scrollbar { width: 6px; }
                ::-webkit-scrollbar-track { background: #111; }
                ::-webkit-scrollbar-thumb { background: #333; borderRadius: 3px; }
            `}</style>
        </div>
    );
};

export default MonitorModal;