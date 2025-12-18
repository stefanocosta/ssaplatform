import React, { useState } from 'react';
import { X, Activity } from 'lucide-react';

const MonitorModal = ({ onClose, onStart, strategy }) => {
    const [selectedInterval, setSelectedInterval] = useState('15min');

    const options = [
        { label: '1 Minute', value: '1min' },
        { label: '5 Minutes', value: '5min' },
        { label: '15 Minutes', value: '15min' },
        { label: '30 Minutes', value: '30min' },
        { label: '1 Hour', value: '1h' },
        { label: '4 Hours', value: '4h' }
    ];

    const handleStart = () => {
        if ('Notification' in window) {
            try {
                if (Notification.permission !== "granted" && Notification.permission !== "denied") {
                    Notification.requestPermission().catch(err => console.log("Notification Error:", err));
                }
            } catch (e) { console.warn("Notifications not supported"); }
        }
        onStart(selectedInterval, strategy); // Pass strategy back to App
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
            backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 2000,
            display: 'flex', justifyContent: 'center', alignItems: 'center'
        }}>
            <div style={{
                backgroundColor: '#1e1e1e', padding: '25px', borderRadius: '12px',
                border: '1px solid #444', width: '320px', display: 'flex', flexDirection: 'column', gap: '15px'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #444', paddingBottom: '10px' }}>
                    <div>
                        <h2 style={{ color: 'white', margin: 0, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Activity color="#ff9800" size={20} /> Monitor
                        </h2>
                        <div style={{color:'#888', fontSize:'0.75rem', marginTop:'2px'}}>
                            Strategy: <span style={{color:'#ff9800', fontWeight:'bold'}}>{strategy?.toUpperCase() || 'BASIC'}</span>
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer' }}><X /></button>
                </div>

                <div style={{ background: 'rgba(255, 152, 0, 0.1)', border: '1px solid #ff9800', borderRadius: '6px', padding: '10px', fontSize: '0.8rem', color: '#ffcc80' }}>
                    This will run a background scan every minute for the selected timeframe using the <strong>{strategy?.toUpperCase() || 'BASIC'}</strong> strategy.
                    <br/><br/><em style={{color:'#888'}}>⚠️ Keep this tab open. Anti-logout is active.</em>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    {options.map(opt => (
                        <button 
                            key={opt.value}
                            onClick={() => setSelectedInterval(opt.value)}
                            style={{
                                padding: '10px', borderRadius: '6px', border: '1px solid #444',
                                backgroundColor: selectedInterval === opt.value ? '#ff9800' : '#333',
                                color: selectedInterval === opt.value ? 'black' : 'white',
                                cursor: 'pointer', fontWeight: 'bold'
                            }}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>

                <button 
                    onClick={handleStart}
                    style={{
                        padding: '12px', borderRadius: '6px', border: 'none',
                        backgroundColor: '#ff9800', color: 'black', fontWeight: 'bold', fontSize: '1rem',
                        cursor: 'pointer', marginTop: '10px'
                    }}
                >
                    START MONITORING
                </button>
            </div>
        </div>
    );
};

export default MonitorModal;