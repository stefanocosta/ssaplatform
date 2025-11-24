import React, { useEffect, useRef, useState } from 'react';
import {
    createChart,
    ColorType,
    CandlestickSeries,
    LineSeries,
    HistogramSeries,
    createSeriesMarkers
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
    const [showSignals, setShowSignals] = useState(false);
    const [countdown, setCountdown] = useState(60);
    const countdownIntervalRef = useRef(null);
    const [internalChartType, setInternalChartType] = useState('line');

    // ================================================================== //
    // Helper Functions
    // ================================================================== //
    const intervalToMs = (interval) => {
        const map = {
            '1min': 60000, '5min': 300000, '15min': 900000, '30min': 1800000,
            '1h': 3600000, '2h': 7200000, '4h': 14400000, '1day': 86400000,
            '1week': 604800000, '1month': 2592000000
        };
        return map[interval] || 86400000;
    };

    const normalizeTimestamp = (time) => {
        if (typeof time === 'number') return time;
        if (typeof time === 'string') {
            const n = parseInt(time);
            if (!isNaN(n)) return n.toString().length === 10 ? n : Math.floor(n / 1000);
        }
        if (time instanceof Date) return Math.floor(time.getTime() / 1000);
        if (typeof time === 'object' && time !== null) {
            if (time.timestamp) return normalizeTimestamp(time.timestamp);
            if (time.time) return normalizeTimestamp(time.time);
        }
        return null;
    };

    const setVisibleRangeToLastNBars = (n = 250, padding = 20) => {
        if (!chartRef.current || !lastDataRef.current?.ohlc) return;
        try {
            const timeScale = chartRef.current.timeScale();
            const len = lastDataRef.current.ohlc.length;
            const future = showForecast ? 60 : 0;
            const from = Math.max(0, len - n);
            const to = len - 1 + padding + future;
            timeScale.setVisibleLogicalRange({ from, to });
        } catch (e) { console.warn(e); }
    };

    const handleResetView = () => {
        setVisibleRangeToLastNBars(150);
        ['right', 'cyclic', 'noise'].forEach(id => {
            chartRef.current?.priceScale(id)?.applyOptions({ autoScale: true, scaleMargins: { top: 0.1, bottom: 0.1 } });
        });
    };

    // ================================================================== //
    // Hotspot & Marker Calculations
    // ================================================================== //
    const calculateHotspotData = (ohlcRaw, trendRaw, reconRaw) => {
        if (!ohlcRaw || !trendRaw || !reconRaw || ohlcRaw.length === 0) return [];
        const priceMap = new Map();
        ohlcRaw.forEach(d => priceMap.set(normalizeTimestamp(d.time), d.close));
        const trendMap = new Map();
        trendRaw.forEach(d => trendMap.set(normalizeTimestamp(d.time), d.value));
        const reconMap = new Map();
        reconRaw.forEach(d => reconMap.set(d.time, d.value));
        const allTimes = reconRaw.map(d => d.time);
        const trendValues = allTimes.map(t => trendMap.get(t));
        const trendRising = new Array(allTimes.length).fill(false);
        for (let i = 1; i < trendValues.length; i++) {
            if (trendValues[i] !== undefined && trendValues[i - 1] !== undefined) {
                trendRising[i] = trendValues[i] > trendValues[i - 1];
            } else if (i > 1) trendRising[i] = trendRising[i - 1];
        }
        if (trendValues.length > 1) trendRising[0] = trendRising[1];

        const hotspotCandles = [];
        for (let i = 0; i < allTimes.length; i++) {
            const time = allTimes[i];
            const price = priceMap.get(time);
            const recon = reconMap.get(time);
            const trend = trendMap.get(time);
            if (price === undefined || recon === undefined || trend === undefined) continue;
            const isTrendRising = trendRising[i];
            let color = 'rgba(0,0,0,0)';
            const alpha = 1.0;
            if (recon < trend && price < recon) {
                color = isTrendRising ? `rgba(0,255,0,${alpha})` : `rgba(173,255,47,${alpha})`;
            } else if (recon > trend && price > recon) {
                color = !isTrendRising ? `rgba(255,0,0,${alpha})` : `rgba(255,165,0,${alpha})`;
            }
            hotspotCandles.push({
                time, open: price, high: Math.max(price, recon), low: Math.min(price, recon),
                close: recon, color, borderColor: color
            });
        }
        return hotspotCandles;
    };

    const calculateMarkers = (normalizedOhlc, trendRaw, cyclicRaw, noiseRaw) => {
        if (!normalizedOhlc || !trendRaw || !cyclicRaw || !noiseRaw) return [];
        const priceMap = new Map();
        normalizedOhlc.forEach(d => priceMap.set(d.time, d.close));
        const trendMap = new Map();
        trendRaw.forEach(d => trendMap.set(normalizeTimestamp(d.time), d.value));
        const cyclicMap = new Map();
        cyclicRaw.forEach(d => cyclicMap.set(normalizeTimestamp(d.time), d.value));
        const sortedNoise = [...noiseRaw]
            .map(d => ({ ...d, time: normalizeTimestamp(d.time) }))
            .filter(d => d.time !== null)
            .sort((a, b) => a.time - b.time);

        const markers = [];
        const used = new Set();

        for (let i = 1; i < sortedNoise.length; i++) {
            const cur = sortedNoise[i];
            const prev = sortedNoise[i - 1];
            const time = cur.time;
            const price = priceMap.get(time);
            const trend = trendMap.get(time);
            const cyclic = cyclicMap.get(time);
            const noiseVal = cur.value;
            const prevNoise = prev.value;
            if (price === undefined || trend === undefined || cyclic === undefined) continue;
            if (used.has(time)) continue;

            const recon = trend + cyclic;

            const buyHotspot = recon < trend && price < recon;
            const buyNoise = noiseVal < 0 && noiseVal >= prevNoise;
            if (buyHotspot && buyNoise) {
                markers.push({ time, position: 'belowBar', color: '#00FF00', shape: 'arrowUp', text: 'Buy', size: 2 });
                used.add(time);
                continue;
            }

            const sellHotspot = recon > trend && price > recon;
            const sellNoise = noiseVal > 0 && noiseVal <= prevNoise;
            if (sellHotspot && sellNoise) {
                markers.push({ time, position: 'aboveBar', color: '#FF0000', shape: 'arrowDown', text: 'Sell', size: 2 });
                used.add(time);
            }
        }
        return markers.sort((a, b) => a.time - b.time);
    };

    // ================================================================== //
    // MARKERS UPDATE (v5+ style)
    // ================================================================== //
    const updateMarkers = () => {
        if (!lastDataRef.current || !markersInstanceRef.current) return;

        if (showSignals) {
            const data = lastDataRef.current;
            const ohlc = data.ohlc
                .map(d => ({ ...d, time: normalizeTimestamp(d.time) }))
                .filter(d => d.time !== null)
                .sort((a, b) => a.time - b.time);
            const markers = calculateMarkers(ohlc, data.ssa.trend, data.ssa.cyclic, data.ssa.noise);
            console.log(`[UpdateMarkers] Applying ${markers.length} markers`);
            markersInstanceRef.current.setMarkers(markers);
        } else {
            markersInstanceRef.current.setMarkers([]);
        }
    };

    useEffect(() => { updateMarkers(); }, [showSignals]);

    // ================================================================== //
    // DATA FETCHING (THIS WAS MISSING!)
    // ================================================================== //
    const fetchData = async () => {
        if (!chartRef.current) return;
        setLoading(true);
        setError(null);

        try {
            const data = await getChartData(symbol, interval, lValue, useAdaptiveL);
            lastDataRef.current = data;

            if (!data || !data.ohlc || !data.ssa) {
                setError("Invalid or empty data received");
                return;
            }

            const normalizedOhlc = data.ohlc
                .map(c => ({ ...c, time: normalizeTimestamp(c.time) }))
                .filter(c => c.time !== null)
                .sort((a, b) => a.time - b.time);

            // Main series
            if (internalChartType === 'line') {
                seriesRefs.current.mainSeries.setData(normalizedOhlc.map(c => ({ time: c.time, value: c.close })));
            } else {
                seriesRefs.current.mainSeries.setData(normalizedOhlc);
            }

            // Trend
            const trendColored = (data.ssa.trend || []).map((p, i, arr) => {
                const t = normalizeTimestamp(p.time);
                if (i === 0 || t === null) return { ...p, time: t, color: '#888888' };
                const color = p.value >= arr[i - 1].value ? '#26a69a' : '#ef5350';
                return { ...p, time: t, color };
            }).filter(p => p.time !== null);
            seriesRefs.current.trend?.setData(trendColored);

            // Cyclic
            const cyclicColored = (data.ssa.cyclic || []).map((p, i, arr) => {
                const t = normalizeTimestamp(p.time);
                if (i === 0 || t === null) return { time: t, value: p.value, color: '#808080' };
                const y1 = arr[i - 1].value, y2 = p.value;
                let color = '#808080';
                if (y2 < 0) color = y2 < y1 ? '#006400' : '#00FF00';
                else if (y2 > 0) color = y2 > y1 ? '#8B0000' : '#FFA500';
                return { time: t, value: p.value, color };
            }).filter(p => p.time !== null);
            seriesRefs.current.cyclic?.setData(cyclicColored);

            // Reconstructed
            const reconstructed = [];
            for (let i = 0; i < (data.ssa.trend || []).length; i++) {
                if (data.ssa.trend[i] && data.ssa.cyclic[i]) {
                    const t = normalizeTimestamp(data.ssa.trend[i].time);
                    if (t !== null) reconstructed.push({ time: t, value: data.ssa.trend[i].value + data.ssa.cyclic[i].value });
                }
            }
            seriesRefs.current.reconstructed?.setData(reconstructed);

            // Hotspots
            const hotspot = calculateHotspotData(data.ohlc, data.ssa.trend, reconstructed);
            seriesRefs.current.hotspotSeries?.setData(hotspot);

            // Forecast
            if (data.forecast) {
                const f = data.forecast.map(x => ({ time: normalizeTimestamp(x.time), value: x.value })).filter(x => x.time !== null);
                seriesRefs.current.forecast?.setData(f);
            }

            // Noise
            const noiseColored = (data.ssa.noise || []).map(p => {
                const t = normalizeTimestamp(p.time);
                if (t === null) return null;
                const color = p.value < 0 ? '#00FF00' : p.value > 0 ? '#FF0000' : '#808080';
                return { time: t, value: p.value, color };
            }).filter(Boolean);
            seriesRefs.current.noise?.setData(noiseColored);

            // Zero lines
            seriesRefs.current.cyclicZeroLine?.setData(trendColored.map(p => ({ time: p.time, value: 0, color: p.color })));
            seriesRefs.current.noiseZeroLine?.setData(cyclicColored.map(p => ({ time: p.time, value: 0, color: p.color })));

            updateMarkers();
            handleResetView();
        } catch (err) {
            console.error("Data fetch error:", err);
            setError(err.message || "Failed to load chart data");
        } finally {
            setLoading(false);
        }
    };

    // ================================================================== //
    // CHART SETUP + INITIAL DATA LOAD
    // ================================================================== //
    useEffect(() => {
        const container = chartContainerRef.current;
        if (!container) return;

        const chart = createChart(container, {
            layout: { background: { type: ColorType.Solid, color: '#1a1a1a' }, textColor: '#d1d4dc' },
            grid: { vertLines: { color: '#2b2b43' }, horzLines: { color: '#2b2b43' } },
            timeScale: { timeVisible: true, secondsVisible: interval.includes('min'), borderColor: '#485c68', rightOffset: 50 },
            rightPriceScale: { borderColor: '#485c68' },
            width: container.clientWidth,
            height: container.clientHeight,
        });
        chartRef.current = chart;

        const mainSeries = internalChartType === 'line'
            ? chart.addSeries(LineSeries, { color: '#26a69a', lineWidth: 2, priceLineVisible: false })
            : chart.addSeries(CandlestickSeries, {
                upColor: '#26a69a', downColor: '#ef5350', borderVisible: false,
                wickUpColor: '#26a69a', wickDownColor: '#ef5350', priceLineVisible: false
            });
        seriesRefs.current.mainSeries = mainSeries;
        markersInstanceRef.current = createSeriesMarkers(mainSeries, []);

        seriesRefs.current.hotspotSeries = chart.addSeries(CandlestickSeries, { visible: showHotspots, borderVisible: false, priceLineVisible: false });
        seriesRefs.current.trend = chart.addSeries(LineSeries, { lineWidth: 2, visible: showTrend, priceLineVisible: false });
        seriesRefs.current.reconstructed = chart.addSeries(LineSeries, { color: '#1c86ffff', lineWidth: 3, lineStyle: 1, visible: showReconstructed, priceLineVisible: false });
        seriesRefs.current.forecast = chart.addSeries(LineSeries, { color: 'magenta', lineWidth: 2, lineStyle: 0, visible: showForecast, priceLineVisible: false });

        seriesRefs.current.cyclic = chart.addSeries(HistogramSeries, { priceScaleId: 'cyclic', base: 0, priceLineVisible: false }, 1);
        seriesRefs.current.cyclicZeroLine = chart.addSeries(LineSeries, { priceScaleId: 'cyclic', lineWidth: 4, priceLineVisible: false }, 1);
        seriesRefs.current.noise = chart.addSeries(HistogramSeries, { priceScaleId: 'noise', base: 0, priceLineVisible: false }, 2);
        seriesRefs.current.noiseZeroLine = chart.addSeries(LineSeries, { priceScaleId: 'noise', lineWidth: 4, priceLineVisible: false }, 2);

        chart.priceScale('cyclic').applyOptions({ borderColor: '#485c68' });
        chart.priceScale('noise').applyOptions({ borderColor: '#485c68' });

        resizeObserver.current = new ResizeObserver(() => {
            chart.applyOptions({ width: container.clientWidth, height: container.clientHeight });
        });
        resizeObserver.current.observe(container);

        setChartReady(true);

        return () => {
            resizeObserver.current?.disconnect();
            chart.remove();
            chartRef.current = null;
            seriesRefs.current = {};
            markersInstanceRef.current = null;
        };
    }, [symbol, interval, lValue, useAdaptiveL]);

    // Load data when chart is ready
    useEffect(() => {
        if (chartReady) {
            fetchData();
        }
    }, [chartReady, symbol, interval, lValue, useAdaptiveL]);

    // Chart type toggle
    useEffect(() => {
        if (!chartReady || !chartRef.current || !seriesRefs.current.mainSeries) return;
        const chart = chartRef.current;
        chart.removeSeries(seriesRefs.current.mainSeries);

        const newSeries = internalChartType === 'line'
            ? chart.addSeries(LineSeries, { color: '#26a69a', lineWidth: 2, priceLineVisible: false })
            : chart.addSeries(CandlestickSeries, {
                upColor: '#26a69a', downColor: '#ef5350', borderVisible: false,
                wickUpColor: '#26a69a', wickDownColor: '#ef5350', priceLineVisible: false
            });

        markersInstanceRef.current = createSeriesMarkers(newSeries, []);
        seriesRefs.current.mainSeries = newSeries;

        if (lastDataRef.current?.ohlc) {
            const data = lastDataRef.current.ohlc
                .map(d => ({ ...d, time: normalizeTimestamp(d.time) }))
                .filter(d => d.time)
                .sort((a, b) => a.time - b.time);
            newSeries.setData(internalChartType === 'line'
                ? data.map(d => ({ time: d.time, value: d.close }))
                : data);
        }
        setTimeout(updateMarkers, 0);
    }, [internalChartType, chartReady]);

    // ================================================================== //
    // Render
    // ================================================================== //
    return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <style>{`
                @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.3; } }
                .chart-toggle-button {
                    position: absolute; left: 10px; z-index: 10;
                    background: rgba(40,40,40,0.8); color:#d1d4dc;
                    border:1px solid #555; border-radius:4px;
                    padding:4px 8px; cursor:pointer; font-size:11px;
                    width:90px; text-align:center;
                }
                .chart-toggle-button.active { background:#0078d4; color:white; border:1px solid #0078d4; }
                .chart-type-toggle { width:55px; }
            `}</style>

            {!loading && !error && (
                <>
                    <div style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', zIndex: 10, color: '#d1d4dc', fontSize: 16, fontWeight: 'bold', pointerEvents: 'none' }}>
                        {symbol} ({interval})
                    </div>

                    <button onClick={() => setShowTrend(t => !t)} className={`chart-toggle-button ${showTrend ? 'active' : ''}`} style={{ top: 60 }}>
                        {showTrend ? 'Trend: ON' : 'Trend: OFF'}
                    </button>
                    <button onClick={() => setShowReconstructed(t => !t)} className={`chart-toggle-button ${showReconstructed ? 'active' : ''}`} style={{ top: 90 }}>
                        {showReconstructed ? 'Cyclic: ON' : 'Cyclic: OFF'}
                    </button>
                    <button onClick={() => setShowSignals(t => !t)} className={`chart-toggle-button ${showSignals ? 'active' : ''}`} style={{ top: 120 }}>
                        {showSignals ? 'Signals: ON' : 'Signals: OFF'}
                    </button>

                    <div style={{ position: 'absolute', left: 10, top: 150, zIndex: 10, display: 'flex', gap: 5 }}>
                        <button onClick={() => setInternalChartType('candle')} className={`chart-toggle-button chart-type-toggle ${internalChartType === 'candle' ? 'active' : ''}`}>Candle</button>
                        <button onClick={() => setInternalChartType('line')} className={`chart-toggle-button chart-type-toggle ${internalChartType === 'line' ? 'active' : ''}`}>Line</button>
                    </div>
                </>
            )}

            {isRealtime && (
                <div style={{ position: 'absolute', top: 10, right: 60, zIndex: 10, background: 'rgba(0,128,0,0.7)', color: 'white', padding: '2px 8px', fontSize: 12, borderRadius: 3, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#00ff00', animation: 'pulse 1.5s ease-in-out infinite' }} />
                    LIVE
                </div>
            )}
            {autoUpdate && !isRealtime && (
                <div style={{ position: 'absolute', top: 10, right: 60, zIndex: 10, background: 'rgba(0,188,212,0.7)', color: 'white', padding: '2px 8px', fontSize: 12, borderRadius: 3, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#00bcd4', animation: 'pulse 2s ease-in-out infinite' }} />
                    AUTO (1m)
                    <span style={{ color: '#d1d4dc', marginLeft: 5, fontVariantNumeric: 'tabular-nums' }}>(Next: {countdown}s)</span>
                </div>
            )}

            <button onClick={handleResetView} style={{
                position: 'absolute', bottom: 10, left: 10, zIndex: 10,
                background: 'rgba(40,40,40,0.8)', color: '#d1d4dc',
                border: '1px solid #555', borderRadius: 4,
                padding: '4px 8px', cursor: 'pointer', fontSize: 11
            }}>
                Reset View
            </button>

            {loading && !error && (
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'rgba(0,0,0,0.5)', color: 'white', padding: 10, borderRadius: 5 }}>
                    Loading chart data...
                </div>
            )}
            {error && (
                <div style={{ position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%,-50%)', background: 'rgba(0,0,0,0.7)', color: 'red', padding: 10, borderRadius: 5, zIndex: 20, maxWidth: '80%' }}>
                    Error: {error}
                </div>
            )}

            <div ref={chartContainerRef} style={{ width: '100%', height: '100%' }} />
        </div>
    );
};

export default TradingChart;