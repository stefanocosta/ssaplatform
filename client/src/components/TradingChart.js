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
    // ORIGINAL HELPERS (100% restored)
    // ================================================================== //
    const intervalToMs = (interval) => {
        const map = {
            '1min': 60000, '5min': 300000, '15min': 900000, '30min': 1800000,
            '1h': 3600000, '2h': 7200000, '4h': 14400000, '1day': 86400000,
            '1week': 604800000, '1month': 2592000000
        };
        return map[interval] || 86400000;
    };

    const getCandleStartTime = (timestamp, intervalMs) => {
        return Math.floor(timestamp / intervalMs) * intervalMs;
    };

    const normalizeTimestamp = (time) => {
        if (typeof time === 'number') return time;
        if (typeof time === 'string') {
            const parsedTime = parseInt(time);
            if (!isNaN(parsedTime)) {
                return (parsedTime.toString().length === 10) ? parsedTime : Math.floor(parsedTime / 1000);
            }
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
            const ohlcData = lastDataRef.current.ohlc;
            if (ohlcData.length === 0) return;
            const dataLength = ohlcData.length;
            const futurePadding = showForecast ? 60 : 0;
            const fromIndex = Math.max(0, dataLength - n);
            const toIndex = (dataLength - 1) + padding + futurePadding;
            timeScale.setVisibleLogicalRange({ from: fromIndex, to: toIndex });
        } catch (e) { console.warn("Error setting visible range:", e); }
    };

    const handleResetView = () => {
        if (!chartRef.current || !chartContainerRef.current) return;
        setVisibleRangeToLastNBars(150);
        try {
            ['right', 'cyclic', 'noise'].forEach(scaleId => {
                const scale = chartRef.current.priceScale(scaleId);
                if (scale) scale.applyOptions({ autoScale: true, scaleMargins: { top: 0.1, bottom: 0.1 } });
            });
        } catch (e) { console.warn("Error resetting scales:", e); }

        setTimeout(() => {
            try {
                const panes = chartRef.current.panes();
                const totalH = chartContainerRef.current.clientHeight;
                if (panes && panes.length >= 3) {
                    const fixedH = 150;
                    const buffer = 10;
                    const availableForMain = totalH - (fixedH * 2) - buffer;
                    if (availableForMain > 50) {
                        panes[1].setHeight(fixedH);
                        panes[2].setHeight(fixedH);
                        panes[0].setHeight(availableForMain);
                    }
                }
            } catch (e) { console.error("Pane reset error:", e); }
        }, 10);
    };

    // ================================================================== //
    // ORIGINAL Hotspot & Marker Calculations
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
        const trendValues = allTimes.map(time => trendMap.get(time));
        const trendRising = new Array(allTimes.length).fill(false);
        for (let i = 1; i < trendValues.length; i++) {
            if (trendValues[i] !== undefined && trendValues[i-1] !== undefined) {
                trendRising[i] = trendValues[i] > trendValues[i-1];
            } else if (i > 1) {
                trendRising[i] = trendRising[i-1];
            }
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
                color = isTrendRising ? `rgba(0, 255, 0, ${alpha})` : `rgba(173, 255, 47, ${alpha})`;
            } else if (recon > trend && price > recon) {
                color = !isTrendRising ? `rgba(255, 0, 0, ${alpha})` : `rgba(255, 165, 0, ${alpha})`;
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
        const usedTimestamps = new Set();

        for (let i = 1; i < sortedNoise.length; i++) {
            const current = sortedNoise[i];
            const prev = sortedNoise[i-1];
            const time = current.time;

            const price = priceMap.get(time);
            const trend = trendMap.get(time);
            const cyclic = cyclicMap.get(time);
            const noiseVal = current.value;
            const prevNoiseVal = prev.value;
            if (price === undefined || trend === undefined || cyclic === undefined || noiseVal === undefined) continue;
            if (usedTimestamps.has(time)) continue;

            const recon = trend + cyclic;

            const isBuyHotspot = (recon < trend) && (price < recon);
            const isBuyNoise = (noiseVal < 0) && (noiseVal >= prevNoiseVal);
            if (isBuyHotspot && isBuyNoise) {
                markers.push({ time: time, position: 'belowBar', color: '#00FF00', shape: 'arrowUp', text: '', size: 1.5 });
                usedTimestamps.add(time);
                continue;
            }

            const isSellHotspot = (recon > trend) && (price > recon);
            const isSellNoise = (noiseVal > 0) && (noiseVal <= prevNoiseVal);
            if (isSellHotspot && isSellNoise) {
                markers.push({ time: time, position: 'aboveBar', color: '#FF0000', shape: 'arrowDown', text: '', size: 1.5 });
                usedTimestamps.add(time);
            }
        }
        markers.sort((a, b) => a.time - b.time);
        return markers;
    };

    // ================================================================== //
    // MARKERS UPDATE (v5+ compatible)
    // ================================================================== //
    const updateMarkers = () => {
        if (!lastDataRef.current || !markersInstanceRef.current) return;

        if (showSignals) {
            const data = lastDataRef.current;
            const normalizedOhlc = data.ohlc.map(d => ({...d, time: normalizeTimestamp(d.time)})).sort((a,b)=>a.time-b.time);
            const markers = calculateMarkers(normalizedOhlc, data.ssa.trend, data.ssa.cyclic, data.ssa.noise);
            console.log(`[UpdateMarkers] Applying ${markers.length} markers.`);
            markersInstanceRef.current.setMarkers(markers);
        } else {
            markersInstanceRef.current.setMarkers([]);
        }
    };

    useEffect(() => { updateMarkers(); }, [showSignals]);

    // ================================================================== //
    // FULL DATA FETCH (original logic)
    // ================================================================== //
    const fetchData = async () => {
        if (!chartRef.current) return;
        setLoading(true);
        setError(null);

        try {
            const data = await getChartData(symbol, interval, lValue, useAdaptiveL);
            lastDataRef.current = data;

            if (data && data.ohlc && data.ssa) {
                if (data.ohlc.length === 0) {
                    setError("Received empty OHLC data.");
                } else {
                    const normalizedOhlc = data.ohlc.map(candle => ({
                        ...candle, time: normalizeTimestamp(candle.time)
                    })).filter(c => c.time !== null).sort((a, b) => a.time - b.time);

                    if (internalChartType === 'line') {
                        const lineData = normalizedOhlc.map(c => ({ time: c.time, value: c.close }));
                        seriesRefs.current.mainSeries.setData(lineData);
                    } else {
                        seriesRefs.current.mainSeries.setData(normalizedOhlc);
                    }

                    const trendData = data.ssa.trend || [];
                    const coloredTrendData = trendData.map((point, i) => {
                        const t = normalizeTimestamp(point.time);
                        if (i === 0 || t === null) return { ...point, time: t, color: '#888888' };
                        const prevValue = trendData[i - 1].value;
                        const color = point.value >= prevValue ? '#26a69a' : '#ef5350';
                        return { ...point, time: t, color };
                    }).filter(p => p.time !== null);
                    if (seriesRefs.current.trend) seriesRefs.current.trend.setData(coloredTrendData);

                    const cyclicData = data.ssa.cyclic || [];
                    const coloredCyclicData = cyclicData.map((point, i) => {
                        const t = normalizeTimestamp(point.time);
                        if (i === 0 || t === null) return { time: t, value: point.value, color: '#808080' };
                        const y1 = cyclicData[i - 1].value;
                        const y2 = point.value;
                        let color = '#808080';
                        if (y2 < 0) color = y2 < y1 ? '#006400' : '#00FF00';
                        else if (y2 > 0) color = y2 > y1 ? '#8B0000' : '#FFA500';
                        return { time: t, value: point.value, color };
                    }).filter(p => p.time !== null);
                    if (seriesRefs.current.cyclic) seriesRefs.current.cyclic.setData(coloredCyclicData);

                    const noiseData = data.ssa.noise || [];
                    const coloredNoiseData = noiseData.map((point) => {
                        const t = normalizeTimestamp(point.time);
                        if (t === null) return null;
                        const color = point.value < 0 ? '#00FF00' : (point.value > 0 ? '#FF0000' : '#808080');
                        return { time: t, value: point.value, color };
                    }).filter(p => p !== null);
                    if (seriesRefs.current.noise) seriesRefs.current.noise.setData(coloredNoiseData);

                    const reconstructedData = [];
                    for (let i = 0; i < trendData.length; i++) {
                        if (trendData[i] && cyclicData[i] && trendData[i].time === cyclicData[i].time) {
                            const t = normalizeTimestamp(trendData[i].time);
                            if (t !== null) {
                                reconstructedData.push({ time: t, value: trendData[i].value + cyclicData[i].value });
                            }
                        }
                    }
                    reconstructedData.sort((a, b) => a.time - b.time);
                    if (seriesRefs.current.reconstructed) seriesRefs.current.reconstructed.setData(reconstructedData);

                    const hotspotData = calculateHotspotData(data.ohlc, data.ssa.trend, reconstructedData);
                    if (seriesRefs.current.hotspotSeries) seriesRefs.current.hotspotSeries.setData(hotspotData);

                    if (seriesRefs.current.forecast && data.forecast) {
                        const forecastData = data.forecast.map(item => ({
                            time: normalizeTimestamp(item.time), value: item.value
                        })).filter(d => d.time !== null);
                        seriesRefs.current.forecast.setData(forecastData);
                    }

                    if (seriesRefs.current.cyclicZeroLine) seriesRefs.current.cyclicZeroLine.setData(coloredTrendData.map(p => ({ time: p.time, value: 0, color: p.color })));
                    if (seriesRefs.current.noiseZeroLine) seriesRefs.current.noiseZeroLine.setData(coloredCyclicData.map(p => ({ time: p.time, value: 0, color: p.color })));

                    updateMarkers();
                    handleResetView();
                }
            } else {
                setError("Received invalid data structure.");
            }
        } catch (err) {
            console.error("Fetch error:", err);
            setError(err.message || "Failed to fetch data.");
        } finally {
            setLoading(false);
        }
    };

    // ================================================================== //
    // CHART SETUP + MARKERS
    // ================================================================== //
    useEffect(() => {
        const currentChartContainer = chartContainerRef.current;
        if (!currentChartContainer) return;

        let chartInstance = null;

        try {
            chartInstance = createChart(currentChartContainer, {
                layout: { background: { type: ColorType.Solid, color: '#1a1a1a' }, textColor: '#d1d4dc' },
                grid: { vertLines: { color: '#2b2b43' }, horzLines: { color: '#2b2b43' } },
                timeScale: { timeVisible: true, secondsVisible: interval.includes('min'), borderColor: '#485158', rightOffset: 50 },
                rightPriceScale: { borderColor: '#485158' },
                width: currentChartContainer.clientWidth,
                height: currentChartContainer.clientHeight,
            });
            chartRef.current = chartInstance;

            if (internalChartType === 'line') {
                seriesRefs.current.mainSeries = chartInstance.addSeries(LineSeries, { color: '#26a69a', lineWidth: 2, priceLineVisible: false });
            } else {
                seriesRefs.current.mainSeries = chartInstance.addSeries(CandlestickSeries, {
                    upColor: '#26a69a', downColor: '#ef5350', borderVisible: false,
                    wickUpColor: '#26a69a', wickDownColor: '#ef5350', priceLineVisible: false
                });
            }

            markersInstanceRef.current = createSeriesMarkers(seriesRefs.current.mainSeries, []);

            seriesRefs.current.hotspotSeries = chartInstance.addSeries(CandlestickSeries, { visible: showHotspots, borderVisible: false, priceLineVisible: false });
            seriesRefs.current.trend = chartInstance.addSeries(LineSeries, { lineWidth: 2, visible: showTrend, priceLineVisible: false });
            seriesRefs.current.reconstructed = chartInstance.addSeries(LineSeries, { color: '#1c86ffff', lineWidth: 3, lineStyle: 1, visible: showReconstructed, priceLineVisible: false });
            seriesRefs.current.forecast = chartInstance.addSeries(LineSeries, { color: 'magenta', lineWidth: 2, lineStyle: 0, title: '', visible: showForecast, priceLineVisible: false });

            seriesRefs.current.cyclic = chartInstance.addSeries(HistogramSeries, { priceScaleId: 'cyclic', base: 0, priceLineVisible: false }, 1);
            seriesRefs.current.cyclicZeroLine = chartInstance.addSeries(LineSeries, { priceScaleId: 'cyclic', lineWidth: 4, priceLineVisible: false }, 1);
            seriesRefs.current.noise = chartInstance.addSeries(HistogramSeries, { priceScaleId: 'noise', base: 0, priceLineVisible: false }, 2);
            seriesRefs.current.noiseZeroLine = chartInstance.addSeries(LineSeries, { priceScaleId: 'noise', lineWidth: 4, priceLineVisible: false }, 2);

            chartInstance.priceScale('cyclic').applyOptions({ borderColor: '#485158' });
            chartInstance.priceScale('noise').applyOptions({ borderColor: '#485158' });

            //setChartReady(true);
            //fetchData();

            // Force pane layout immediately before data loads
            try {
                // IMPORTANT: Make sure this matches the height you chose in handleResetView
                const fixedH = 150; 
                const buffer = 10;
                const totalH = currentChartContainer.clientHeight;
                const availableForMain = totalH - (fixedH * 2) - buffer;

                // We use 'chartInstance' here because 'chartRef.current' might not be fully ready in React state yet
                const panes = chartInstance.panes(); 
                
                if (panes && panes.length >= 3 && availableForMain > 50) {
                    // Pane 0 = Main, Pane 1 = Cyclic, Pane 2 = Noise
                    panes[1].setHeight(fixedH);
                    panes[2].setHeight(fixedH);
                    panes[0].setHeight(availableForMain);
                }
            } catch (e) {
                console.warn("Initial pane resize failed", e);
            }

            resizeObserver.current = new ResizeObserver(entries => {
                if (!chartRef.current) return;
                const { width, height } = entries[0].contentRect;
                requestAnimationFrame(() => {
                    if (chartRef.current) {
                        try { chartRef.current.applyOptions({ width, height }); } catch (e) { }
                    }
                });
            });
            resizeObserver.current.observe(currentChartContainer);

            // =========================================================
            // FIX: DEBOUNCE DATA FETCH
            // Use a timeout to absorb rapid prop updates (like interval + lValue)
            // =========================================================
            const fetchDelay = setTimeout(() => {
                // Double check chart wasn't destroyed during the delay
                if (chartRef.current) {
                    setChartReady(true);
                    fetchData();
                }
            }, 50); // 50ms delay is invisible to user but stops double-fetching

            // CLEANUP FUNCTION
            return () => {
                clearTimeout(fetchDelay); // <--- CANCEL the fetch if props change quickly
                
                if (resizeObserver.current) resizeObserver.current.disconnect();
                if (chartRef.current) { 
                    chartRef.current.remove(); 
                    chartRef.current = null; 
                }
                seriesRefs.current = {};
                markersInstanceRef.current = null;
                setChartReady(false);
            };

        } catch (err) {
            console.error("Setup error:", err);
            setError(`Init Error: ${err.message}`);
            setLoading(false);
        }
        // Note: The return above handles the cleanup for the success path.
        // If we error out, we don't need special cleanup beyond React's unmount.
    }, [symbol, interval, lValue, useAdaptiveL]);

    // ================================================================== //
    // FULL AUTO-UPDATE + LIVE WEBSOCKET (100% restored)
    // ================================================================== //
    useEffect(() => {
        const currentSymbol = symbol;
        let timeoutId = null;

        if (countdownIntervalRef.current) { clearInterval(countdownIntervalRef.current); countdownIntervalRef.current = null; }

        if ((!enableRealtime && !autoUpdate) || !chartReady) {
            if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
            if (realtimeIntervalRef.current) { clearInterval(realtimeIntervalRef.current); clearTimeout(realtimeIntervalRef.current); }
            setIsRealtime(false);
            setCountdown(60);
            currentCandleRef.current = null;
            return;
        }

        const runPeriodicRefresh = async () => {
            setCountdown(60);
            const savedCandle = currentCandleRef.current ? { ...currentCandleRef.current } : null;
            try {
                const data = await getChartData(symbol, interval, lValue, useAdaptiveL);
                if (data && data.ohlc) {
                    lastDataRef.current = data;
                    const normalizedOhlc = data.ohlc.map(d => ({...d, time: normalizeTimestamp(d.time)})).sort((a,b) => a.time - b.time);

                    if (seriesRefs.current.mainSeries) {
                        seriesRefs.current.mainSeries.setData(internalChartType === 'line' ? normalizedOhlc.map(d => ({time: d.time, value: d.close})) : normalizedOhlc);
                        if (savedCandle && internalChartType === 'candle') {
                            const lastTime = normalizedOhlc[normalizedOhlc.length-1].time;
                            if (savedCandle.time >= lastTime) seriesRefs.current.mainSeries.update(savedCandle);
                        }
                    }

                    const trendData = data.ssa.trend || [];
                    const coloredTrendData = trendData.map((point, index) => {
                        const normalizedTime = normalizeTimestamp(point.time);
                        if (index === 0 || normalizedTime === null) return { ...point, time: normalizedTime, color: '#888888' };
                        const prevValue = trendData[index - 1].value;
                        const color = point.value >= prevValue ? '#26a69a' : '#ef5350';
                        return { ...point, time: normalizedTime, color };
                    }).filter(p => p.time !== null);
                    if (seriesRefs.current.trend) seriesRefs.current.trend.setData(coloredTrendData);

                    const cyclicData = data.ssa.cyclic || [];
                    const coloredCyclicData = cyclicData.map((point, index) => {
                        const normalizedTime = normalizeTimestamp(point.time);
                        if (index === 0 || normalizedTime === null) return { time: normalizedTime, value: point.value, color: '#808080' };
                        const y1 = cyclicData[index - 1].value;
                        const y2 = point.value;
                        let color = '#808080';
                        if (y2 < 0) color = y2 < y1 ? '#006400' : '#00FF00';
                        else if (y2 > 0) color = y2 > y1 ? '#8B0000' : '#FFA500';
                        return { time: normalizedTime, value: point.value, color };
                    }).filter(p => p.time !== null);
                    if (seriesRefs.current.cyclic) seriesRefs.current.cyclic.setData(coloredCyclicData);

                    const noiseData = data.ssa.noise || [];
                    const coloredNoiseData = noiseData.map((point) => {
                        const normalizedTime = normalizeTimestamp(point.time);
                        if (normalizedTime === null) return null;
                        const color = point.value < 0 ? '#00FF00' : (point.value > 0 ? '#FF0000' : '#808080');
                        return { time: normalizedTime, value: point.value, color };
                    }).filter(p => p !== null);
                    if (seriesRefs.current.noise) seriesRefs.current.noise.setData(coloredNoiseData);

                    const reconstructedData = [];
                    for (let i = 0; i < trendData.length; i++) {
                        if (trendData[i] && cyclicData[i] && trendData[i].time === cyclicData[i].time) {
                            const normalizedTime = normalizeTimestamp(trendData[i].time);
                            if (normalizedTime !== null) {
                                reconstructedData.push({ time: normalizedTime, value: trendData[i].value + cyclicData[i].value });
                            }
                        }
                    }
                    reconstructedData.sort((a, b) => a.time - b.time);
                    if (seriesRefs.current.reconstructed) seriesRefs.current.reconstructed.setData(reconstructedData);

                    const hotspotData = calculateHotspotData(data.ohlc, data.ssa.trend, reconstructedData);
                    if (seriesRefs.current.hotspotSeries) seriesRefs.current.hotspotSeries.setData(hotspotData);

                    if (seriesRefs.current.forecast && data.forecast) {
                        const forecastData = data.forecast.map(item => ({
                            time: normalizeTimestamp(item.time), value: item.value
                        })).filter(d => d.time !== null);
                        seriesRefs.current.forecast.setData(forecastData);
                    }

                    if (seriesRefs.current.current.cyclicZeroLine) seriesRefs.current.cyclicZeroLine.setData(coloredTrendData.map(p => ({ time: p.time, value: 0, color: p.color })));
                    if (seriesRefs.current.noiseZeroLine) seriesRefs.current.noiseZeroLine.setData(coloredCyclicData.map(p => ({ time: p.time, value: 0, color: p.color })));

                    updateMarkers();
                }
            } catch (err) { console.error("Periodic refresh error:", err); }
        };

        const setupAlignedTimer = () => {
            if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
            if (realtimeIntervalRef.current) { clearInterval(realtimeIntervalRef.current); clearTimeout(realtimeIntervalRef.current); }
            const now = new Date();
            const secondsRemaining = 60 - now.getSeconds();
            setCountdown(secondsRemaining);
            countdownIntervalRef.current = setInterval(() => setCountdown(s => (s > 0 ? s - 1 : 60)), 1000);
            realtimeIntervalRef.current = setTimeout(() => {
                runPeriodicRefresh();
                realtimeIntervalRef.current = setInterval(runPeriodicRefresh, 60000);
            }, secondsRemaining * 1000);
        };

        if (enableRealtime && apiKey) {
            timeoutId = setTimeout(() => {
                const intervalMs = intervalToMs(interval);
                const ws = new WebSocket(`wss://ws.twelvedata.com/v1/quotes/price?apikey=${apiKey}`);
                wsRef.current = ws;

                ws.onopen = () => { 
                    setIsRealtime(true); 
                    // Subscribe to the symbol
                    ws.send(JSON.stringify({ action: "subscribe", params: { symbols: symbol } })); 
                };

                // --- UPDATED ERROR HANDLING HERE ---
                ws.onmessage = (e) => {
                    const d = JSON.parse(e.data);

                    // 1. Handle Price Updates
                    if (d.event === "price" && seriesRefs.current.mainSeries) {
                        const price = parseFloat(d.price);
                        // Use d.timestamp if available, otherwise fallback to Date.now()
                        // TwelveData timestamps are usually in seconds or milliseconds depending on the endpoint, 
                        // but for quotes/price it's often a unix timestamp.
                        const rawTime = d.timestamp ? d.timestamp : Date.now() / 1000;
                        
                        // Ensure we align the time to the chart interval
                        const time = Math.floor(getCandleStartTime(rawTime * 1000, intervalMs) / 1000);

                        if (internalChartType === 'line') {
                            seriesRefs.current.mainSeries.update({ time, value: price });
                        } else {
                            if (!currentCandleRef.current || currentCandleRef.current.time !== time) {
                                currentCandleRef.current = { time, open: price, high: price, low: price, close: price };
                            } else {
                                currentCandleRef.current.high = Math.max(currentCandleRef.current.high, price);
                                currentCandleRef.current.low = Math.min(currentCandleRef.current.low, price);
                                currentCandleRef.current.close = price;
                            }
                            seriesRefs.current.mainSeries.update(currentCandleRef.current);
                        }
                    } 
                    // 2. Handle API Errors (Not Authorized / Invalid Symbol)
                    else if (d.status === "error") {
                        console.error("TwelveData WS Error:", d.message);
                        setError(`Live Error: ${d.message}`); // Show error in UI
                        setIsRealtime(false); // Turn off "LIVE" badge
                        if (wsRef.current) wsRef.current.close();
                    }
                };

                // 3. Handle Network Errors
                ws.onerror = (err) => {
                    console.error("WebSocket connection error", err);
                    setError("Live connection failed.");
                    setIsRealtime(false);
                };

            }, 300);
        } else { 
            setIsRealtime(false); 
        }

        if (autoUpdate || enableRealtime) setupAlignedTimer();

        return () => {
            if (timeoutId) clearTimeout(timeoutId);
            if (wsRef.current) wsRef.current.close();
            if (realtimeIntervalRef.current) { clearInterval(realtimeIntervalRef.current); clearTimeout(realtimeIntervalRef.current); }
            if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
        };
    }, [enableRealtime, autoUpdate, apiKey, symbol, interval, lValue, useAdaptiveL, chartReady, internalChartType]);

    // ================================================================== //
    // TOGGLES (visibility)
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

    // ================================================================== //
    // CHART TYPE TOGGLE (Line/Candle)
    // ================================================================== //
    useEffect(() => {
        if (!chartReady || !chartRef.current || !seriesRefs.current.mainSeries || !lastDataRef.current) return;
        const chartInstance = chartRef.current;
        const currentSeries = seriesRefs.current.mainSeries;
        const isLine = internalChartType === 'line';

        chartInstance.removeSeries(currentSeries);
        const newSeries = isLine
            ? chartInstance.addSeries(LineSeries, { color: '#26a69a', lineWidth: 2, priceLineVisible: false })
            : chartInstance.addSeries(CandlestickSeries, { upColor: '#26a69a', downColor: '#ef5350', borderVisible: false, wickUpColor: '#26a69a', wickDownColor: '#ef5350', priceLineVisible: false });

        markersInstanceRef.current = createSeriesMarkers(newSeries, []);
        seriesRefs.current.mainSeries = newSeries;

        const data = lastDataRef.current.ohlc;
        if (data) {
            const formatted = data.map(d => ({ ...d, time: normalizeTimestamp(d.time) })).filter(d => d.time).sort((a,b) => a.time - b.time);
            newSeries.setData(isLine ? formatted.map(d => ({ time: d.time, value: d.close })) : formatted);
        }

        setTimeout(() => updateMarkers(), 0);
    }, [internalChartType, chartReady]);

    // ================================================================== //
    // Render (100% valid JSX — no more errors!)
    // ================================================================== //
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

                    <div style={{ position: 'absolute', left: '10px', top: '150px', zIndex: 10, display: 'flex', gap: '5px' }}>
                        <button onClick={() => setInternalChartType('candle')} className={`chart-toggle-button chart-type-toggle ${internalChartType === 'candle' ? 'active' : ''}`}>Candle</button>
                        <button onClick={() => setInternalChartType('line')} className={`chart-toggle-button chart-type-toggle ${internalChartType === 'line' ? 'active' : ''}`}>Line</button>
                    </div>
                </>
            )}

            {isRealtime && <div style={{ position: 'absolute', top: '10px', right: '60px', zIndex: 10, background: 'rgba(0,128,0,0.7)', color: 'white', padding: '2px 8px', fontSize: '12px', borderRadius: '3px', display: 'flex', alignItems: 'center', gap: '5px' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#00ff00', animation: 'pulse 1.5s ease-in-out infinite' }}></span>LIVE</div>}
            {autoUpdate && !isRealtime && <div style={{ position: 'absolute', top: '10px', right: '60px', zIndex: 10, background: 'rgba(0, 188, 212, 0.7)', color: 'white', padding: '2px 8px', fontSize: '12px', borderRadius: '3px', display: 'flex', alignItems: 'center', gap: '5px' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#00bcd4', animation: 'pulse 2s ease-in-out infinite' }}></span>AUTO (1m)<span style={{color: '#d1d4dc', marginLeft: '5px', fontVariantNumeric: 'tabular-nums'}}>(Next: {countdown}s)</span></div>}

            <button onClick={handleResetView} style={{ position: 'absolute', bottom: '10px', left: '10px', zIndex: 10, background: 'rgba(40, 40, 40, 0.8)', color: '#d1d4dc', border: '1px solid #555', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', fontSize: '11px' }}>Reset View</button>

            {loading && !error && <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: 'white', background: 'rgba(0,0,0,0.5)', padding: '10px', borderRadius: '5px' }}>Loading chart data...</div>}
            {error && <div style={{ position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%, -50%)', color: 'red', background: 'rgba(0,0,0,0.7)', padding: '10px', borderRadius: '5px', zIndex: 20, maxWidth: '80%' }}>Error: {error}</div>}
            <div ref={chartContainerRef} style={{ width: '100%', height: '100%' }} />
        </div>
    );
};

export default TradingChart;