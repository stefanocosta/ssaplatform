import React, { useState, useEffect, useMemo } from 'react';
import { X, Activity, Zap, Layers, BarChart2, Anchor, CheckSquare, Square, Sparkles } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, ReferenceLine, AreaChart, Area, ReferenceArea } from 'recharts';

const CustomBarTooltip = ({ active, payload, nonTrendPower }) => {
    if (active && payload && payload.length) {
        const data = payload[0].payload; 
        const absPower = data.power;
        const relPower = nonTrendPower > 0 ? (absPower / nonTrendPower) * 100 : 0;
        return (
            <div style={{ backgroundColor: 'rgba(20, 20, 20, 0.95)', border: '1px solid #444', padding: '6px 10px', borderRadius: '4px', color: '#29b6f6', fontWeight: 'bold', fontSize: '0.75rem', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
                Strength: {relPower.toFixed(1)}%
            </div>
        );
    }
    return null;
};

const PriceTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        return (
            <div style={{ backgroundColor: 'rgba(20, 20, 20, 0.95)', border: '1px solid #444', padding: '8px 12px', borderRadius: '4px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
                <div style={{color: '#888', fontSize: '0.75rem', marginBottom: '2px'}}>{label}</div>
                <div style={{color: '#fff', fontWeight: 'bold', fontSize: '0.9rem'}}>${Number(payload[0].value).toFixed(2)}</div>
            </div>
        );
    }
    return null;
};

const SyncMeter = ({ posCount, negCount }) => {
    const isBullish = negCount > posCount;
    const count = isBullish ? negCount : posCount;
    const activeColor = isBullish ? '#00c853' : '#ff3d00';
    return (
        <div style={{display:'flex', gap:'4px', marginTop:'8px'}}>
            {[...Array(5)].map((_, i) => (
                <div key={i} style={{ flex: 1, height: '6px', borderRadius: '2px', backgroundColor: i < count ? activeColor : '#333', boxShadow: i < count ? `0 0 6px ${activeColor}` : 'none', transition: 'all 0.3s' }}/>
            ))}
        </div>
    );
};

const DeepWaveModal = ({ symbol, interval, onClose }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeWaves, setActiveWaves] = useState({ 0: true, 1: true, 2: true, 3: true, 4: true });

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            const token = localStorage.getItem('access_token');
            try {
                const res = await fetch(`/api/deep-wave-analyze?symbol=${symbol}&interval=${interval}`, { headers: { 'Authorization': `Bearer ${token}` } });
                const json = await res.json();
                if (json.error) console.error(json.error); else setData(json);
            } catch (err) { console.error(err); } finally { setLoading(false); }
        };
        fetchData();
    }, [symbol, interval]);

    const { chartData, syncRegions } = useMemo(() => {
        if (!data || !data.times || !data.waves) return { chartData: [], syncRegions: [] };
        const cData = []; const regions = []; let currentSync = null; let startSyncTime = null;

        data.times.forEach((t, idx) => {
            const d = new Date(t * 1000);
            const timeStr = d.toLocaleString(undefined, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            
            // SAFELY ACCESS PRICES
            const priceVal = (data.prices && data.prices[idx] !== undefined) ? data.prices[idx] : 0;
            const point = { time: timeStr, price: priceVal };
            
            let activeValues = [];
            data.waves.forEach((wave, wIdx) => {
                point[wave.name] = wave.data[idx];
                if (activeWaves[wIdx]) activeValues.push(wave.data[idx]);
            });

            let pointSync = null;
            if (activeValues.length > 0) {
                if (activeValues.every(v => v > 0)) pointSync = 'ABOVE';
                else if (activeValues.every(v => v < 0)) pointSync = 'BELOW';
            }

            if (pointSync !== currentSync) {
                if (currentSync !== null && startSyncTime !== null) regions.push({ type: currentSync, x1: startSyncTime, x2: timeStr });
                if (pointSync !== null) startSyncTime = timeStr;
                currentSync = pointSync;
            }
            cData.push(point);
        });

        if (currentSync !== null && startSyncTime !== null && cData.length > 0) regions.push({ type: currentSync, x1: startSyncTime, x2: cData[cData.length - 1].time });
        return { chartData: cData, syncRegions: regions };
    }, [data, activeWaves]);

    const nonTrendPower = data && data.trend ? (100 - data.trend.power) : 1;
    const toggleWave = (index) => setActiveWaves(prev => ({ ...prev, [index]: !prev[index] }));

    if (!symbol) return null;

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 3000, backdropFilter: 'blur(3px)' }}>
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '90%', maxWidth: '450px', height: '90vh', backgroundColor: '#1e1e1e', borderRadius: '12px', border: '1px solid #444', display: 'flex', flexDirection: 'column', boxShadow: '0 0 40px rgba(0,0,0,0.8)', overflow: 'hidden' }}>
                <div style={{ padding: '15px 20px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background:'#252525' }}>
                    <div><h2 style={{ margin: 0, color: '#d1d4dc', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem' }}><Zap fill="#ffd700" color="#ffd700" size={18}/> Deep Wave Analysis</h2></div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer' }}><X size={20}/></button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '15px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {loading && <div style={{textAlign:'center', color:'#888', marginTop:'50px'}}>Running SSA Decomposition...</div>}

                    {!loading && data && data.trend && (
                        <>
                            <div style={{ background: '#2a2a2a', padding: '12px', borderRadius: '8px', border: '1px solid #333' }}>
                                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px'}}>
                                    <div style={{color:'#888', fontSize:'0.75rem', display:'flex', alignItems:'center', gap:'6px'}}><Activity size={14} color="#ef5350"/> MARKET TREND</div>
                                    <div style={{fontSize:'0.85rem', fontWeight:'bold', color: data.trend.direction.includes('Bullish') ? '#00c853' : (data.trend.direction.includes('Ranging') ? '#ffd700' : '#ff3d00')}}>{data.trend.direction}</div>
                                </div>
                                <div style={{ width:'100%', height:'6px', background:'#333', borderRadius:'3px', overflow:'hidden', marginBottom:'6px'}}><div style={{width:`${data.trend.power}%`, height:'100%', background: data.trend.direction.includes('Ranging') ? '#ffd700' : '#ef5350'}}></div></div>
                                <div style={{fontSize:'0.7rem', color:'#666', textAlign:'right'}}>{data.trend.power.toFixed(1)}% Dominance</div>
                            </div>

                            <div style={{ background: '#2a2a2a', padding: '12px', borderRadius: '8px', border: '1px solid #333' }}>
                                <div style={{color:'#888', fontSize:'0.75rem', display:'flex', alignItems:'center', gap:'6px', marginBottom:'5px'}}><Anchor size={14} color="#ffa726"/> CYCLE ALIGNMENT</div>
                                <div style={{fontSize:'0.85rem', fontWeight:'bold', color: data.sync?.color || '#888', marginBottom:'5px'}}>{data.sync?.status || 'Neutral / Mixed'}</div>
                                <SyncMeter posCount={data.sync?.pos_count || 0} negCount={data.sync?.neg_count || 0} />
                            </div>

                            <div style={{ background: '#2a2a2a', padding: '12px', borderRadius: '8px', border: '1px solid #333' }}>
                                <div style={{color:'#888', fontSize:'0.75rem', display:'flex', alignItems:'center', gap:'6px', marginBottom:'5px'}}><BarChart2 size={14} color="#29b6f6"/> POWER SPECTRUM (Top 10)</div>
                                <div style={{height:'100px', width:'100%'}}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={data.spectrum.slice(0, 10)}>
                                            <Tooltip content={<CustomBarTooltip nonTrendPower={nonTrendPower} />} cursor={{fill: 'rgba(255,255,255,0.05)'}} />
                                            <Bar dataKey="power" radius={[2, 2, 0, 0]}>{data.spectrum.slice(0, 10).map((entry, index) => (<Cell key={`cell-${index}`} fill={data.waves[index]?.color || '#444'} />))}</Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            <div style={{ background: '#2a2a2a', padding: '12px', borderRadius: '8px', border: '1px solid #333' }}>
                                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px'}}>
                                    <div style={{color:'#888', fontSize:'0.75rem', display:'flex', alignItems:'center', gap:'6px'}}><Layers size={14} color="#ffeb3b"/> ACTIVE CYCLES</div>
                                    <div style={{display:'flex', gap:'8px'}}>{[0,1,2,3,4].map(idx => (<div key={idx} onClick={() => toggleWave(idx)} style={{cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', width:'16px', height:'16px'}}>{activeWaves[idx] ? <div style={{width:'8px', height:'8px', backgroundColor:data.waves[idx]?.color, borderRadius:'50%'}}></div> : <div style={{width:'8px', height:'8px', border:`1px solid ${data.waves[idx]?.color}`, borderRadius:'50%', opacity:0.4}}></div>}</div>))}</div>
                                </div>
                                <div style={{ height: '80px', width: '100%', marginBottom: '4px', borderBottom: '1px solid #333' }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={chartData} syncId="deepWaveSync"><defs><linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#8884d8" stopOpacity={0.3}/><stop offset="95%" stopColor="#8884d8" stopOpacity={0}/></linearGradient></defs><XAxis dataKey="time" hide /><YAxis domain={['dataMin', 'dataMax']} hide /><Tooltip content={<PriceTooltip />} cursor={{ stroke: '#fff', strokeWidth: 1, strokeDasharray: '3 3', opacity: 0.3 }} /><Area type="monotone" dataKey="price" stroke="#8884d8" fill="url(#priceGradient)" strokeWidth={1} isAnimationActive={false} /></AreaChart>
                                    </ResponsiveContainer>
                                </div>
                                <div style={{ height: '160px', width: '100%' }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={chartData} syncId="deepWaveSync"><XAxis dataKey="time" hide /><YAxis hide domain={['auto', 'auto']}/><ReferenceLine y={0} stroke="#ffffff" strokeWidth={1} strokeDasharray="3 3" opacity={0.3} />{syncRegions.map((region, idx) => (<ReferenceArea key={`region-${idx}`} x1={region.x1} x2={region.x2} fill={region.type === 'BELOW' ? '#00c853' : '#ff3d00'} fillOpacity={0.15} />))}{data.waves.map((wave, idx) => (activeWaves[idx] && (<Line key={idx} type="monotone" dataKey={wave.name} stroke={wave.color} strokeWidth={2} dot={false} isAnimationActive={false} />)))}</LineChart>
                                    </ResponsiveContainer>
                                </div>
                                <div style={{fontSize:'0.65rem', color:'#666', marginTop:'4px', textAlign:'center', fontStyle:'italic'}}><span style={{color:'#00c853'}}>Green Band</span> = All Below 0 | <span style={{color:'#ff3d00'}}>Red Band</span> = All Above 0</div>
                            </div>

                            <div style={{ background: 'linear-gradient(90deg, rgba(0, 120, 212, 0.1) 0%, rgba(20, 20, 20, 0) 100%)', borderLeft: '4px solid #3b82f6', borderRadius: '0 6px 6px 0', padding: '16px', marginTop: '10px' }}>
                                <div style={{color: '#60a5fa', fontSize: '0.75rem', fontWeight: 'bold', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px', letterSpacing: '0.05em'}}><Sparkles size={14} /> STRATEGIC SYNTHESIS</div>
                                <div style={{ color: '#e2e8f0', fontSize: '0.9rem', lineHeight: '1.6', whiteSpace: 'pre-line' }}>{data.summary}</div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DeepWaveModal;