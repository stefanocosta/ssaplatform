import React, { useState } from 'react';
import { X, Activity } from 'lucide-react';

const MonitorModal = ({ onClose, onStart }) => {
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
        // Request Notification Permission immediately
        if (Notification.permission !== "granted") {
            Notification.requestPermission();
        }
        onStart(selectedInterval);
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
            backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 3000,
            display: 'flex', justifyContent: 'center', alignItems: 'center'
        }}>
            <div style={{
                width: '350px', backgroundColor: '#1e1e1e',
                borderRadius: '12px', border: '1px solid #ff9800',
                boxShadow: '0 0 20px rgba(255, 152, 0, 0.3)',
                padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ color: '#ff9800', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Activity size={20} /> Monitor Market
                    </h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer' }}><X /></button>
                </div>

                <div style={{ color: '#ddd', fontSize: '0.9rem', lineHeight: '1.4' }}>
                    Select a timeframe. The app will scan for signals at the close of every candle and notify you.
                    <br/><br/>
                    <em style={{color: '#888'}}>⚠️ Keep this tab open. Anti-logout is active.</em>
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