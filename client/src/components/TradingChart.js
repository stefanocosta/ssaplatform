import React, { useEffect, useRef, useState } from 'react';
import {
    createChart,
    ColorType,
    CandlestickSeries,
    LineSeries,
    HistogramSeries,
    createSeriesMarkers,
    PriceScaleMode
} from 'lightweight-charts';
import { getChartData } from '../services/api';

const TradingChart = ({
    symbol = 'BTC/USD',
    interval = '1day',
    lValue = 30,
    useAdaptiveL = true,
    apiKey = '',
    enableRealtime = false,
    autoUpdate = false,
    showHotspots = false,
    showForecast = false
}) => {
    const chartContainerRef = useRef(null);
    const chartRef = useRef(null);
    const seriesRefs = useRef({});
    // Store references to price lines to clear them on updates
    const priceLinesRef = useRef({ cyclic: [], noise: [] });
    const markersInstanceRef = useRef(null);
    const resizeObserver = useRef(null);
    const wsRef = useRef(null);
    const realtimeIntervalRef = useRef(null);
    const currentCandleRef = useRef(null);
    const lastDataRef = useRef(null);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isRealtime, setIsRealtime] = useState(false);
    const [chartReady, setChartReady] = useState(false);

    const [showTrend, setShowTrend] = useState(true);
    const [showReconstructed, setShowReconstructed] = useState(true);
    const [showSignals, setShowSignals] = useState(true);
    const [countdown, setCountdown] = useState(60);
    const countdownIntervalRef = useRef(null);
    
    const [internalChartType, setInternalChartType] = useState('candle');

    // ================================================================== //
    // HELPERS
    // ================================================================== //
    const intervalToMs = (interval) => {
        const map = { '1min': 60000, '5min': 300000, '15min': 900000, '30min': 1800000, '1h': 3600000, '2h': 7200000, '4h': 14400000, '1day': 86400000, '1week': 604800000, '1month': 2592000000 };
        return map[interval] || 86400000;
    };
    const getCandleStartTime = (timestamp, intervalMs) => Math.floor(timestamp / intervalMs) * intervalMs;
    const normalizeTimestamp = (time) => {
        if (typeof time === 'number') return time;
        if (typeof time === 'string') return parseInt(time).toString().length === 10 ? parseInt(time) : Math.floor(parseInt(time) / 1000);
        if (time instanceof Date) return Math.floor(time.getTime() / 1000);
        if (typeof time === 'object' && time !== null) return normalizeTimestamp(time.timestamp || time.time);
        return null;
    };
    const setVisibleRangeToLastNBars = (n = 250, padding = 20) => {
        if (!chartRef.current || !lastDataRef.current?.ohlc) return;
        try {
            const timeScale = chartRef.current.timeScale();
            const dataLength = lastDataRef.current.ohlc.length;
            if (dataLength === 0) return;
            const futurePadding = showForecast ? 60 : 0;
            timeScale.setVisibleLogicalRange({ from: Math.max(0, dataLength - n), to: (dataLength - 1) + padding + futurePadding });
        } catch (e) {}
    };
    const handleResetView = () => {
        if (!chartRef.current || !chartContainerRef.current) return;
        setVisibleRangeToLastNBars(150);
        try {
            ['right', 'cyclic', 'noise'].forEach(id => chartRef.current.priceScale(id)?.applyOptions({ autoScale: true, scaleMargins: { top: 0.1, bottom: 0.1 } }));
            setTimeout(() => {
                const panes = chartRef.current.panes();
                const totalH = chartContainerRef.current.clientHeight;
                if (panes && panes.length >= 3 && (totalH - 310) > 50) {
                    panes[1].setHeight(150); panes[2].setHeight(150); panes[0].setHeight(totalH - 310);
                }
            }, 10);
        } catch (e) {}
    };
    const calculateHotspotData = (ohlcRaw, trendRaw, reconRaw) => {
        if (!ohlcRaw || !trendRaw || !reconRaw || ohlcRaw.length === 0) return [];
        const priceMap = new Map(); ohlcRaw.forEach(d => priceMap.set(normalizeTimestamp(d.time), d.close));
        const trendMap = new Map(); trendRaw.forEach(d => trendMap.set(normalizeTimestamp(d.time), d.value));
        const reconMap = new Map(); reconRaw.forEach(d => reconMap.set(d.time, d.value));
        const allTimes = reconRaw.map(d => d.time);
        const trendValues = allTimes.map(time => trendMap.get(time));
        const trendRising = new Array(allTimes.length).fill(false);
        for (let i = 1; i < trendValues.length; i++) {
             if (trendValues[i] !== undefined && trendValues[i-1] !== undefined) trendRising[i] = trendValues[i] > trendValues[i-1];
             else if (i > 1) trendRising[i] = trendRising[i-1];
        }
        if (trendValues.length > 1) trendRising[0] = trendRising[1];
        const res = [];
        for (let i = 0; i < allTimes.length; i++) {
            const time = allTimes[i], price = priceMap.get(time), recon = reconMap.get(time), trend = trendMap.get(time);
            if (price === undefined || recon === undefined || trend === undefined) continue;
            const rising = trendRising[i];
            let color = 'rgba(0,0,0,0)';
            if (recon < trend && price < recon) color = rising ? 'rgba(0,255,0,1)' : 'rgba(173,255,47,1)';
            else if (recon > trend && price > recon) color = !rising ? 'rgba(255,0,0,1)' : 'rgba(255,165,0,1)';
            res.push({ time, open: price, high: Math.max(price, recon), low: Math.min(price, recon), close: recon, color, borderColor: color });
        }
        return res;
    };
    const calculateMarkers = (normalizedOhlc, trendRaw, cyclicRaw, noiseRaw) => {
        if (!normalizedOhlc || !trendRaw || !cyclicRaw || !noiseRaw) return [];
        const priceMap = new Map(); normalizedOhlc.forEach(d => priceMap.set(d.time, d.close));
        const trendMap = new Map(); trendRaw.forEach(d => trendMap.set(normalizeTimestamp(d.time), d.value));
        const cyclicMap = new Map(); cyclicRaw.forEach(d => cyclicMap.set(normalizeTimestamp(d.time), d.value));
        const sortedNoise = [...noiseRaw].map(d => ({ ...d, time: normalizeTimestamp(d.time) })).filter(d => d.time).sort((a,b)=>a.time-b.time);
        const markers = [], used = new Set();
        for (let i = 1; i < sortedNoise.length; i++) {
            const cur = sortedNoise[i], prev = sortedNoise[i-1], time = cur.time;
            const price = priceMap.get(time), trend = trendMap.get(time), cyclic = cyclicMap.get(time);
            if (price===undefined || trend===undefined || cyclic===undefined || used.has(time)) continue;
            const recon = trend + cyclic;
            if ((recon < trend && price < recon) && (cur.value < 0 && cur.value >= prev.value)) {
                markers.push({ time, position: 'belowBar', color: '#00FF00', shape: 'arrowUp', text: '', size: 1.5 }); used.add(time);
            } else if ((recon > trend && price > recon) && (cur.value > 0 && cur.value <= prev.value)) {
                markers.push({ time, position: 'aboveBar', color: '#FF0000', shape: 'arrowDown', text: '', size: 1.5 }); used.add(time);
            }
        }
        return markers;
    };
    const updateMarkers = () => {
        if (!lastDataRef.current || !markersInstanceRef.current) return;
        if (showSignals) {
            const d = lastDataRef.current;
            const nOhlc = d.ohlc.map(x=>({...x, time: normalizeTimestamp(x.time)})).sort((a,b)=>a.time-b.time);
            markersInstanceRef.current.setMarkers(calculateMarkers(nOhlc, d.ssa.trend, d.ssa.cyclic, d.ssa.noise));
        } else markersInstanceRef.current.setMarkers([]);
    };
    useEffect(() => { updateMarkers(); }, [showSignals]);

    // ================================================================== //
    // NEW: DRAW SUPPORT/RESISTANCE LEVELS ON CYCLIC/NOISE PANELS
    // ================================================================== //
    const drawLevels = (seriesName, levels, colorRes = '#ef5350', colorSup = '#26a69a') => {
        const series = seriesRefs.current[seriesName];
        const store = priceLinesRef.current[seriesName];
        
        if (!series || !levels) return;

        // Clear old lines
        store.forEach(line => series.removePriceLine(line));
        priceLinesRef.current[seriesName] = [];

        // Draw Resistance (Average Peak)
        if (levels.res !== null && levels.res !== undefined) {
            const line = series.createPriceLine({
                price: levels.res,
                color: colorRes,
                lineWidth: 1.5,
                lineStyle: 2, // Dashed
                axisLabelVisible: false,
                title: '', // Keep clean
            });
            priceLinesRef.current[seriesName].push(line);
        }

        // Draw Support (Average Valley)
        if (levels.sup !== null && levels.sup !== undefined) {
            const line = series.createPriceLine({
                price: levels.sup,
                color: colorSup,
                lineWidth: 1.5,
                lineStyle: 2, // Dashed
                axisLabelVisible: false,
                title: '', // Keep clean
            });
            priceLinesRef.current[seriesName].push(line);
        }
    };

    // ================================================================== //
    // FETCH DATA - MODIFIED FOR SILENT UPDATES
    // ================================================================== //
    const fetchData = async (isUpdate = false) => {
        if (!chartRef.current) return;
        
        // ONLY set loading to true if this is the initial load.
        // If it's an update (background refresh), we skip this to prevent "flashing"
        if (!isUpdate) {
            setLoading(true); 
            setError(null);
        }

        try {
            const data = await getChartData(symbol, interval, lValue, useAdaptiveL);
            lastDataRef.current = data;
            if (data && data.ohlc && data.ssa) {
                if (data.ohlc.length === 0) { setError("Received empty OHLC data."); return; }
                const nOhlc = data.ohlc.map(c => ({ ...c, time: normalizeTimestamp(c.time) })).filter(c=>c.time).sort((a,b)=>a.time-b.time);
                
                if (internalChartType === 'line') {
                    seriesRefs.current.mainSeries.setData(nOhlc.map(c=>({time:c.time, value:c.close})));
                } else {
                    seriesRefs.current.mainSeries.setData(nOhlc);
                }

                const mkSeriesData = (raw, colorFn) => {
                    if (!raw) return [];
                    return raw.map((p, i) => {
                        const t = normalizeTimestamp(p.time);
                        if (!t) return null;
                        return { ...p, time: t, color: colorFn(p, i, raw) };
                    }).filter(x=>x);
                };

                const trendD = mkSeriesData(data.ssa.trend, (p,i,arr) => (i===0 ? '#888' : (p.value >= arr[i-1].value ? '#26a69a' : '#ef5350')));
                if (seriesRefs.current.trend) seriesRefs.current.trend.setData(trendD);

                const cyclicD = mkSeriesData(data.ssa.cyclic, (p,i,arr) => {
                    if (i===0) return '#808080';
                    const y2=p.value, y1=arr[i-1].value;
                    if (y2<0) return y2<y1?'#006400':'#00FF00';
                    return y2>y1?'#8B0000':'#FFA500';
                });
                if (seriesRefs.current.cyclic) seriesRefs.current.cyclic.setData(cyclicD);

                const noiseD = mkSeriesData(data.ssa.noise, (p) => p.value<0?'#00FF00':(p.value>0?'#FF0000':'#808080'));
                if (seriesRefs.current.noise) seriesRefs.current.noise.setData(noiseD);

                const reconD = [];
                const trendMap = new Map(trendD.map(x=>[x.time, x.value]));
                const cyclicMap = new Map(cyclicD.map(x=>[x.time, x.value]));
                trendD.forEach(x => {
                    const cVal = cyclicMap.get(x.time);
                    if (cVal !== undefined) reconD.push({ time: x.time, value: x.value + cVal });
                });
                if (seriesRefs.current.reconstructed) seriesRefs.current.reconstructed.setData(reconD);

                if (seriesRefs.current.hotspotSeries) seriesRefs.current.hotspotSeries.setData(calculateHotspotData(data.ohlc, data.ssa.trend, reconD));

                if (seriesRefs.current.forecast && data.forecast) {
                    seriesRefs.current.forecast.setData(data.forecast.map(x=>({time: normalizeTimestamp(x.time), value: x.value})).filter(x=>x.time));
                }

                if (seriesRefs.current.cyclicZeroLine) seriesRefs.current.cyclicZeroLine.setData(trendD.map(x=>({time:x.time, value:0, color:x.color})));
                if (seriesRefs.current.noiseZeroLine) seriesRefs.current.noiseZeroLine.setData(cyclicD.map(x=>({time:x.time, value:0, color:x.color})));

                // --- DRAW LEVELS IF STATS EXIST ---
                if (data.ssa.stats) {
                    drawLevels('cyclic', data.ssa.stats.cyclic);
                    drawLevels('noise', data.ssa.stats.noise);
                }

                updateMarkers();
                
                // ONLY reset the view on initial load.
                // If it's an update, we want to keep the user's current zoom/scroll position.
                if (!isUpdate) {
                    handleResetView();
                }

            } else { setError("Invalid data structure."); }
        } catch (e) { console.error(e); setError(e.message); } finally { 
            if (!isUpdate) setLoading(false); 
        }
    };

    // ================================================================== //
    // CHART SETUP
    // ================================================================== //
    useEffect(() => {
        // Initial Load (isUpdate = false)
        setLoading(true);
        const container = chartContainerRef.current;
        if (!container) return;

        let chart;
        try {
            chart = createChart(container, {
                layout: { background: { type: ColorType.Solid, color: '#1a1a1a' }, textColor: '#d1d4dc' },
                grid: { vertLines: { color: '#2b2b43' }, horzLines: { color: '#2b2b43' } },
                timeScale: { timeVisible: true, secondsVisible: interval.includes('min'), borderColor: '#485158', rightOffset: 50 },
                rightPriceScale: { 
                    borderColor: '#485158',
                    mode: PriceScaleMode.Logarithmic 
                },
                width: container.clientWidth,
                height: container.clientHeight,
            });
            chartRef.current = chart;

            if (internalChartType === 'line') {
                seriesRefs.current.mainSeries = chart.addSeries(LineSeries, { color: '#26a69a', lineWidth: 2, priceLineVisible: false });
            } else {
                seriesRefs.current.mainSeries = chart.addSeries(CandlestickSeries, { upColor: '#26a69a', downColor: '#ef5350', borderVisible: false, wickUpColor: '#26a69a', wickDownColor: '#ef5350', priceLineVisible: false });
            }
            markersInstanceRef.current = createSeriesMarkers(seriesRefs.current.mainSeries, []);

            seriesRefs.current.hotspotSeries = chart.addSeries(CandlestickSeries, { visible: showHotspots, borderVisible: false, priceLineVisible: false });
            seriesRefs.current.trend = chart.addSeries(LineSeries, { lineWidth: 2, visible: showTrend, priceLineVisible: false });
            seriesRefs.current.reconstructed = chart.addSeries(LineSeries, { color: '#1c86ffff', lineWidth: 3, lineStyle: 1, visible: showReconstructed, priceLineVisible: false });
            seriesRefs.current.forecast = chart.addSeries(LineSeries, { color: 'magenta', lineWidth: 2, lineStyle: 0, title: '', visible: showForecast, priceLineVisible: false });

            // Panes 1 & 2
            seriesRefs.current.cyclic = chart.addSeries(HistogramSeries, { priceScaleId: 'cyclic', base: 0, priceLineVisible: false }, 1);
            seriesRefs.current.cyclicZeroLine = chart.addSeries(LineSeries, { priceScaleId: 'cyclic', lineWidth: 4, priceLineVisible: false }, 1);
            seriesRefs.current.noise = chart.addSeries(HistogramSeries, { priceScaleId: 'noise', base: 0, priceLineVisible: false }, 2);
            seriesRefs.current.noiseZeroLine = chart.addSeries(LineSeries, { priceScaleId: 'noise', lineWidth: 4, priceLineVisible: false }, 2);
            chart.priceScale('cyclic').applyOptions({ borderColor: '#485158' });
            chart.priceScale('noise').applyOptions({ borderColor: '#485158' });

            // Layout
            const fixedH=150, buffer=10, totalH=container.clientHeight, avail=totalH-(fixedH*2)-buffer;
            const panes = chart.panes();
            if (panes && panes.length>=3 && avail>50) {
                panes[1].setHeight(fixedH); panes[2].setHeight(fixedH); panes[0].setHeight(avail);
            }

            resizeObserver.current = new ResizeObserver(entries => {
                if(chartRef.current) requestAnimationFrame(() => chartRef.current.applyOptions({ width: entries[0].contentRect.width, height: entries[0].contentRect.height }));
            });
            resizeObserver.current.observe(container);

            const fetchDelay = setTimeout(() => { if (chartRef.current) { setChartReady(true); fetchData(false); } }, 50);

            return () => {
                clearTimeout(fetchDelay);
                if (resizeObserver.current) resizeObserver.current.disconnect();
                if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; }
                seriesRefs.current = {}; 
                priceLinesRef.current = { cyclic: [], noise: [] }; // Reset refs
                markersInstanceRef.current = null; setChartReady(false);
            };
        } catch (e) { console.error(e); setError(e.message); setLoading(false); }
    }, [symbol, interval, lValue, useAdaptiveL]);

    // ================================================================== //
    // REALTIME LOGIC
    // ================================================================== //
    useEffect(() => {
        const currentSymbol = symbol;
        let timeoutId = null;
        if (countdownIntervalRef.current) { clearInterval(countdownIntervalRef.current); countdownIntervalRef.current = null; }

        if ((!enableRealtime && !autoUpdate) || !chartReady) {
            if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
            if (realtimeIntervalRef.current) { clearInterval(realtimeIntervalRef.current); clearTimeout(realtimeIntervalRef.current); }
            setIsRealtime(false); setCountdown(60); currentCandleRef.current = null; return;
        }

        const runPeriodicRefresh = async () => {
            setCountdown(60);
            // CALL FETCHDATA IN SILENT MODE (isUpdate = true)
            // This updates the data without showing the loading spinner or resetting the zoom.
            await fetchData(true);
        };

        const setupAlignedTimer = () => {
            if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
            if (realtimeIntervalRef.current) { clearInterval(realtimeIntervalRef.current); clearTimeout(realtimeIntervalRef.current); }
            const now = new Date(), target=10, rem = target - now.getSeconds();
            const wait = rem <= 0 ? rem + 60 : rem;
            setCountdown(wait);
            countdownIntervalRef.current = setInterval(() => setCountdown(s => s > 1 ? s - 1 : 60), 1000);
            realtimeIntervalRef.current = setTimeout(() => { runPeriodicRefresh(); realtimeIntervalRef.current = setInterval(runPeriodicRefresh, 60000); }, wait * 1000);
        };

        if (enableRealtime && apiKey) {
            timeoutId = setTimeout(() => {
                const ws = new WebSocket(`wss://ws.twelvedata.com/v1/quotes/price?apikey=${apiKey}`);
                wsRef.current = ws;
                ws.onopen = () => { setIsRealtime(true); ws.send(JSON.stringify({ action: "subscribe", params: { symbols: symbol } })); };
                ws.onmessage = (e) => {
                    const d = JSON.parse(e.data);
                    if (d.event === "price" && seriesRefs.current.mainSeries) {
                        const price = parseFloat(d.price);
                        const time = Math.floor(getCandleStartTime((d.timestamp || Date.now()/1000) * 1000, intervalToMs(interval)) / 1000);
                        if (internalChartType === 'line') seriesRefs.current.mainSeries.update({ time, value: price });
                        else {
                            if (!currentCandleRef.current || currentCandleRef.current.time !== time) currentCandleRef.current = { time, open: price, high: price, low: price, close: price };
                            else { currentCandleRef.current.high=Math.max(currentCandleRef.current.high,price); currentCandleRef.current.low=Math.min(currentCandleRef.current.low,price); currentCandleRef.current.close=price; }
                            seriesRefs.current.mainSeries.update(currentCandleRef.current);
                        }
                    } else if (d.status === "error") { setError(d.message); setIsRealtime(false); ws.close(); }
                };
            }, 300);
        }
        if (autoUpdate || enableRealtime) setupAlignedTimer();
        return () => { clearTimeout(timeoutId); if(wsRef.current) wsRef.current.close(); clearInterval(realtimeIntervalRef.current); clearInterval(countdownIntervalRef.current); };
    }, [enableRealtime, autoUpdate, apiKey, symbol, interval, lValue, useAdaptiveL, chartReady, internalChartType]);

    // ================================================================== //
    // TOGGLES & RENDER
    // ================================================================== //
    useEffect(() => { if (chartReady && seriesRefs.current.trend) seriesRefs.current.trend.applyOptions({ visible: showTrend }); }, [showTrend, chartReady]);
    useEffect(() => { if (chartReady && seriesRefs.current.reconstructed) seriesRefs.current.reconstructed.applyOptions({ visible: showReconstructed }); }, [showReconstructed, chartReady]);
    useEffect(() => { if (chartReady && seriesRefs.current.hotspotSeries) seriesRefs.current.hotspotSeries.applyOptions({ visible: showHotspots }); }, [showHotspots, chartReady]);
    useEffect(() => {
        if (chartReady && seriesRefs.current.forecast) {
            seriesRefs.current.forecast.applyOptions({ visible: showForecast });
            if (showForecast) setVisibleRangeToLastNBars(150);
        }
    }, [showForecast, chartReady]);

    useEffect(() => {
        if (!chartReady || !chartRef.current || !seriesRefs.current.mainSeries || !lastDataRef.current) return;
        const chart = chartRef.current;
        const isLine = internalChartType === 'line';
        chart.removeSeries(seriesRefs.current.mainSeries);
        const newSeries = isLine
            ? chart.addSeries(LineSeries, { color: '#26a69a', lineWidth: 2, priceLineVisible: false })
            : chart.addSeries(CandlestickSeries, { upColor: '#26a69a', downColor: '#ef5350', borderVisible: false, wickUpColor: '#26a69a', wickDownColor: '#ef5350', priceLineVisible: false });
        markersInstanceRef.current = createSeriesMarkers(newSeries, []);
        seriesRefs.current.mainSeries = newSeries;
        const data = lastDataRef.current.ohlc.map(d=>({...d, time: normalizeTimestamp(d.time)})).filter(d=>d.time).sort((a,b)=>a.time-b.time);
        newSeries.setData(isLine ? data.map(d=>({time:d.time, value:d.close})) : data);
        setTimeout(() => updateMarkers(), 0);
    }, [internalChartType, chartReady]);

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <style>{`
                @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
                .chart-toggle-button { position: absolute; left: 10px; z-index: 10; background: rgba(40, 40, 40, 0.8); color: #d1d4dc; border: 1px solid #555; border-radius: 4px; padding: 4px 8px; cursor: pointer; font-size: 11px; width: 90px; text-align: center; }
                .chart-toggle-button.active { background: #0078d4; color: white; border: 1px solid #0078d4; }
                .chart-type-toggle { position: static; width: 55px; }
            `}</style>

            {!loading && !error && (
                <>
                    <div style={{ position: 'absolute', top: '10px', left: '50%', transform: 'translateX(-50%)', zIndex: 10, color: '#d1d4dc', fontSize: '16px', fontWeight: 'bold', pointerEvents: 'none' }}>
                        {symbol} ({interval})
                    </div>
                    <button onClick={() => setShowTrend(p => !p)} className={`chart-toggle-button ${showTrend ? 'active' : ''}`} style={{ top: '60px' }}>{showTrend ? 'Trend: ON' : 'Trend: OFF'}</button>
                    <button onClick={() => setShowReconstructed(p => !p)} className={`chart-toggle-button ${showReconstructed ? 'active' : ''}`} style={{ top: '90px' }}>{showReconstructed ? 'Cyclic: ON' : 'Cyclic: OFF'}</button>
                    <button onClick={() => setShowSignals(p => !p)} className={`chart-toggle-button ${showSignals ? 'active' : ''}`} style={{ top: '120px' }}>{showSignals ? 'Signals: ON' : 'Signals: OFF'}</button>
                    
                    {/* CHART CONTROLS (Bottom Left) - LOG BUTTON REMOVED */}
                    <div style={{ position: 'absolute', left: '10px', top: '150px', zIndex: 10, display: 'flex', gap: '5px' }}>
                        <button onClick={() => setInternalChartType('candle')} className={`chart-toggle-button chart-type-toggle ${internalChartType === 'candle' ? 'active' : ''}`}>Candle</button>
                        <button onClick={() => setInternalChartType('line')} className={`chart-toggle-button chart-type-toggle ${internalChartType === 'line' ? 'active' : ''}`}>Line</button>
                    </div>
                </>
            )}

            {isRealtime && <div style={{ position: 'absolute', top: '10px', right: '60px', zIndex: 10, background: 'rgba(0,128,0,0.7)', color: 'white', padding: '2px 8px', fontSize: '12px', borderRadius: '3px', display: 'flex', alignItems: 'center', gap: '5px' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#00ff00', animation: 'pulse 1.5s ease-in-out infinite' }}></span>LIVE</div>}
            {autoUpdate && !isRealtime && <div style={{ position: 'absolute', top: '10px', right: '60px', zIndex: 10, background: 'rgba(0, 188, 212, 0.7)', color: 'white', padding: '2px 8px', fontSize: '12px', borderRadius: '3px', display: 'flex', alignItems: 'center', gap: '5px' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#00bcd4', animation: 'pulse 2s ease-in-out infinite' }}></span>AUTO (1m)<span style={{color: '#d1d4dc', marginLeft: '5px', fontVariantNumeric: 'tabular-nums'}}>(Next: {countdown}s)</span></div>}

            <button onClick={handleResetView} style={{ position: 'absolute', bottom: '10px', left: '10px', zIndex: 10, background: 'rgba(40, 40, 40, 0.8)', color: '#d1d4dc', border: '1px solid #555', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', fontSize: '11px' }}>Reset View</button>
            
            {/* ATTRIBUTION FOOTER */}
            <div style={{
                position: 'absolute', bottom: '10px', right: '60px', zIndex: 5,
                color: '#b9b4b4ff', fontSize: '11px', pointerEvents: 'none', fontStyle: 'italic'
            }}>
                Data by Twelvedata.com
            </div>

            {loading && !error && <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: 'white', background: 'rgba(0,0,0,0.5)', padding: '10px', borderRadius: '5px' }}>Loading chart data...</div>}
            {error && <div style={{ position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%, -50%)', color: 'red', background: 'rgba(0,0,0,0.7)', padding: '10px', borderRadius: '5px', zIndex: 20, maxWidth: '80%' }}>Error: {error}</div>}
            <div ref={chartContainerRef} style={{ width: '100%', height: '100%', opacity: loading ? 0 : 1, transition: 'opacity 0.2s ease-in' }} />
        </div>
    );
};

export default TradingChart;