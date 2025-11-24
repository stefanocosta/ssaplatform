import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, CandlestickSeries, LineSeries, HistogramSeries } from 'lightweight-charts';
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
    const resizeObserver = useRef(null);
    const wsRef = useRef(null);
    const realtimeIntervalRef = useRef(null);
    const currentCandleRef = useRef(null);
    const lastDataRef = useRef(null); 

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [lUsed, setLUsed] = useState(null);
    const [isRealtime, setIsRealtime] = useState(false);
    const [chartReady, setChartReady] = useState(false);
    
    const [showTrend, setShowTrend] = useState(true);
    const [showReconstructed, setShowReconstructed] = useState(true);
    const [countdown, setCountdown] = useState(60);
    const countdownIntervalRef = useRef(null);
    
    const [internalChartType, setInternalChartType] = useState('line');
    
    useEffect(() => {
        console.log("TradingChart mounted:", { symbol, interval, showForecast });
    }, [symbol, interval, showForecast]);

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

    // --- Helper function to set visible range to last N bars ---
    const setVisibleRangeToLastNBars = (n = 250, padding = 20) => {
        if (!chartRef.current || !lastDataRef.current?.ohlc) return;
        
        try {
            const timeScale = chartRef.current.timeScale();
            const ohlcData = lastDataRef.current.ohlc;
            if (ohlcData.length === 0) return;
            
            const dataLength = ohlcData.length;
            // Increase future padding significantly when forecast is showing
            const futurePadding = showForecast ? 60 : 0;
            
            const fromIndex = Math.max(0, dataLength - n);
            const toIndex = (dataLength - 1) + padding + futurePadding;
            
            timeScale.setVisibleLogicalRange({ from: fromIndex, to: toIndex });
        } catch (e) {
            console.warn("Error setting visible range:", e);
        }
    };

    // --- Handler to reset chart view ---
const handleResetView = () => {
        if (!chartRef.current || !chartContainerRef.current) return;
        
        // 1. Reset Horizontal Time Scale
        setVisibleRangeToLastNBars(150);
        
        // 2. Reset Vertical Price Scales
        try {
            ['right', 'cyclic', 'noise'].forEach(scaleId => {
                const scale = chartRef.current.priceScale(scaleId);
                if (scale) scale.applyOptions({ autoScale: true, scaleMargins: { top: 0.1, bottom: 0.1 } });
            });
        } catch (e) { console.warn(e); }

        // 3. Reset Pane Heights (The Robust Way)
        // We use a timeout to move this to the end of the event loop, ensuring UI is stable.
        setTimeout(() => {
            try {
                const panes = chartRef.current.panes();
                const totalH = chartContainerRef.current.clientHeight;
                
                if (panes && panes.length >= 3) {
                    // We want the bottom two to be FIXED at 200px
                    const fixedH = 200; 
                    
                    // We calculate the Main height based on what is LEFT.
                    // We subtract 10px buffer for separators (usually 1-2px each) to be 100% safe.
                    const buffer = 10;
                    const availableForMain = totalH - (fixedH * 2) - buffer;

                    console.log(`Reset Debug: Total=${totalH}, Fixed=${fixedH}, Main=${availableForMain}`);

                    if (availableForMain > 50) {
                        // 1. Force bottom panes to the fixed size
                        panes[1].setHeight(fixedH);
                        panes[2].setHeight(fixedH);
                        
                        // 2. Give the rest to the main pane
                        panes[0].setHeight(availableForMain);
                    } else {
                        console.warn("Screen too small for 200px panes!");
                    }
                }
            } catch (e) {
                console.error("Pane reset error:", e);
            }
        }, 10);
    };

    // --- Helper function to calculate hotspot data ---
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


    // --- MAIN CHART SETUP EFFECT ---
    useEffect(() => {
        const currentChartContainer = chartContainerRef.current;
        if (!currentChartContainer) return;

        let chartInstance = null;

        const fetchData = async () => {
            if (!chartRef.current) return;
            setLoading(true); 
            setError(null); 
            
            const currentSeriesRefs = seriesRefs.current;

            try {
                const data = await getChartData(symbol, interval, lValue, useAdaptiveL);
                lastDataRef.current = data; 

                if (!chartRef.current || !currentSeriesRefs.mainSeries) return;

                if (data && data.ohlc && data.ssa) {
                    if (data.ohlc.length === 0) {
                         setError("Received empty OHLC data.");
                    } else {
                        // 1. Main Series
                        const normalizedOhlc = data.ohlc.map(candle => ({
                            ...candle, time: normalizeTimestamp(candle.time)
                        })).filter(c => c.time !== null).sort((a, b) => a.time - b.time); 
                        
                        if (internalChartType === 'line') {
                            const lineData = normalizedOhlc.map(c => ({ time: c.time, value: c.close }));
                            currentSeriesRefs.mainSeries.setData(lineData);
                        } else {
                            currentSeriesRefs.mainSeries.setData(normalizedOhlc);
                        }
                        
                        // 2. Trend
                        const trendData = data.ssa.trend || [];
                        const coloredTrendData = trendData.map((point, index) => {
                            const normalizedTime = normalizeTimestamp(point.time);
                            if (index === 0 || normalizedTime === null) return { ...point, time: normalizedTime, color: '#888888' };
                            const prevValue = trendData[index - 1].value;
                            const color = point.value >= prevValue ? '#26a69a' : '#ef5350';
                            return { ...point, time: normalizedTime, color };
                        }).filter(p => p.time !== null).sort((a, b) => a.time - b.time);
                        currentSeriesRefs.trend.setData(coloredTrendData);
                        
                        // 3. Cyclic
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
                        }).filter(p => p.time !== null).sort((a, b) => a.time - b.time);
                        currentSeriesRefs.cyclic.setData(coloredCyclicData);
                        
                        // 4. Noise
                        const noiseData = data.ssa.noise || [];
                        const coloredNoiseData = noiseData.map((point) => {
                            const normalizedTime = normalizeTimestamp(point.time); 
                            if (normalizedTime === null) return null;
                            const color = point.value < 0 ? '#00FF00' : (point.value > 0 ? '#FF0000' : '#808080');
                            return { time: normalizedTime, value: point.value, color };
                        }).filter(p => p !== null).sort((a, b) => a.time - b.time);
                        currentSeriesRefs.noise.setData(coloredNoiseData);

                        // 5. Reconstructed & Hotspots
                        const trendDataRaw = data.ssa.trend || [];
                        const cyclicDataRaw = data.ssa.cyclic || [];
                        const reconstructedData = [];
                        for (let i = 0; i < trendDataRaw.length; i++) {
                            if (trendDataRaw[i] && cyclicDataRaw[i] && trendDataRaw[i].time === cyclicDataRaw[i].time) {
                                const normalizedTime = normalizeTimestamp(trendDataRaw[i].time);
                                if (normalizedTime !== null) {
                                    reconstructedData.push({ time: normalizedTime, value: trendDataRaw[i].value + cyclicDataRaw[i].value });
                                }
                            }
                        }
                        reconstructedData.sort((a, b) => a.time - b.time);
                        currentSeriesRefs.reconstructed.setData(reconstructedData);
                        
                        const hotspotData = calculateHotspotData(data.ohlc, data.ssa.trend, reconstructedData);
                        currentSeriesRefs.hotspotSeries.setData(hotspotData);

                        // 6. Zero Lines
                        currentSeriesRefs.cyclicZeroLine.setData(coloredTrendData.map(p => ({ time: p.time, value: 0, color: p.color })));
                        currentSeriesRefs.noiseZeroLine.setData(coloredCyclicData.map(p => ({ time: p.time, value: 0, color: p.color })));
                        
                        // 7. FORECAST (ALWAYS Populate if data exists)
                        if (currentSeriesRefs.forecast) {
                            if (data.forecast && data.forecast.length > 0) {
                                console.log("Setting initial forecast data:", data.forecast.length);
                                const forecastData = data.forecast.map(item => ({
                                    time: normalizeTimestamp(item.time),
                                    value: item.value
                                })).filter(d => d.time !== null); // Filter invalid timestamps
                                
                                currentSeriesRefs.forecast.setData(forecastData);
                            } else {
                                console.warn("No forecast data in response");
                                currentSeriesRefs.forecast.setData([]);
                            }
                        }

                        setLUsed(data.l_used);
                        
                        // Layout fixes
                        const panes = chartRef.current.panes();
                        if (panes.length >= 3) {
                            panes[0].setHeight(300); panes[1].setHeight(200); panes[2].setHeight(200);
                        }
                        
                        setVisibleRangeToLastNBars(150);
                    }
                } else {
                     console.error("Invalid data structure:", data);
                     setError("Received invalid data structure.");
                }
            } catch (err) {
                 console.error("Fetch error:", err);
                 setError(err.message || "Failed to fetch data.");
            } finally {
                setLoading(false);
            }
        };

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
            
            // Initialize Series
            if (internalChartType === 'line') {
                seriesRefs.current.mainSeries = chartInstance.addSeries(LineSeries, { color: '#26a69a', lineWidth: 2, priceLineVisible: false });
            } else { 
                seriesRefs.current.mainSeries = chartInstance.addSeries(CandlestickSeries, { upColor: '#26a69a', downColor: '#ef5350', borderVisible: false, wickUpColor: '#26a69a', wickDownColor: '#ef5350', priceLineVisible: false});
            }

            seriesRefs.current.hotspotSeries = chartInstance.addSeries(CandlestickSeries, { visible: showHotspots, borderVisible: false, priceLineVisible: false  });
            seriesRefs.current.trend = chartInstance.addSeries(LineSeries, { lineWidth: 2, visible: showTrend, priceLineVisible: false });
            seriesRefs.current.reconstructed = chartInstance.addSeries(LineSeries, { color: '#1c86ffff', lineWidth: 3, lineStyle: 1, visible: showReconstructed, priceLineVisible: false });
            
            // Forecast Series - Ensure visibility is set from prop initially
            seriesRefs.current.forecast = chartInstance.addSeries(LineSeries, {
                color: 'magenta',
                lineWidth: 2,
                lineStyle: 0, 
                title: '',
                visible: showForecast,
                priceLineVisible: false
            });

            seriesRefs.current.cyclic = chartInstance.addSeries(HistogramSeries, { priceScaleId: 'cyclic', base: 0, priceLineVisible: false }, 1);
            seriesRefs.current.cyclicZeroLine = chartInstance.addSeries(LineSeries, { priceScaleId: 'cyclic', lineWidth: 4, priceLineVisible: false }, 1); 
            seriesRefs.current.noise = chartInstance.addSeries(HistogramSeries, { priceScaleId: 'noise', base: 0, priceLineVisible: false}, 2);
            seriesRefs.current.noiseZeroLine = chartInstance.addSeries(LineSeries, { priceScaleId: 'noise', lineWidth: 4, priceLineVisible: false }, 2); 
            
            // --- RESIZE OBSERVER with RequestAnimationFrame (Fixes "Object disposed") ---
            resizeObserver.current = new ResizeObserver(entries => {
                 if (!chartRef.current) return;
                 const { width, height } = entries[0].contentRect;
                 
                 requestAnimationFrame(() => {
                     if (chartRef.current) {
                         try {
                             chartRef.current.applyOptions({ width, height });
                         } catch (e) {
                             // Chart likely disposed, ignore
                         }
                     }
                 });
             });
            resizeObserver.current.observe(currentChartContainer);
            
            setChartReady(true);
            fetchData(); 

        } catch (err) {
            console.error("Setup error:", err);
            setError(`Init Error: ${err.message}`);
            setLoading(false);
        }

        return () => {
             if (resizeObserver.current) resizeObserver.current.disconnect();
             if (chartRef.current) {
                 chartRef.current.remove();
                 chartRef.current = null;
             }
             seriesRefs.current = {};
             setChartReady(false);
        };
    }, [symbol, interval, lValue, useAdaptiveL]); 

    // --- TOGGLES ---
    
    // Forecast Toggle: Updates visibility AND ensures data is present
    useEffect(() => {
        if (!chartReady || !seriesRefs.current.forecast) return;
        
        seriesRefs.current.forecast.applyOptions({ visible: showForecast });

        if (showForecast) {
            // Re-apply data from cache to ensure it wasn't wiped
            if (lastDataRef.current && lastDataRef.current.forecast) {
                 console.log("Restoring forecast data from cache...");
                 const forecastData = lastDataRef.current.forecast.map(item => ({
                    time: normalizeTimestamp(item.time),
                    value: item.value
                })).filter(d => d.time !== null);
                
                seriesRefs.current.forecast.setData(forecastData);
            }
            // Ensure view includes the future
            setVisibleRangeToLastNBars(150);
        }
    }, [showForecast, chartReady]);

    useEffect(() => { if (chartReady && seriesRefs.current.hotspotSeries) seriesRefs.current.hotspotSeries.applyOptions({ visible: showHotspots }); }, [showHotspots, chartReady]);
    useEffect(() => { if (chartReady && seriesRefs.current.trend) seriesRefs.current.trend.applyOptions({ visible: showTrend }); }, [showTrend, chartReady]);
    useEffect(() => { if (chartReady && seriesRefs.current.reconstructed) seriesRefs.current.reconstructed.applyOptions({ visible: showReconstructed }); }, [showReconstructed, chartReady]);
    
    // --- CHART TYPE TOGGLE ---
    useEffect(() => {
        if (!chartReady || !chartRef.current || !seriesRefs.current.mainSeries || !lastDataRef.current) return;
        const chartInstance = chartRef.current;
        const currentSeries = seriesRefs.current.mainSeries;
        const isLine = internalChartType === 'line';
        const currentIsLine = currentSeries.seriesType() === 'Line';

        if ((isLine && !currentIsLine) || (!isLine && currentIsLine)) {
            chartInstance.removeSeries(currentSeries);
            const newSeries = isLine 
                ? chartInstance.addSeries(LineSeries, { color: '#26a69a', lineWidth: 2 }) 
                : chartInstance.addSeries(CandlestickSeries, { upColor: '#26a69a', downColor: '#ef5350', borderVisible: false, wickUpColor: '#26a69a', wickDownColor: '#ef5350' });
            
            const data = lastDataRef.current.ohlc;
            if (data) {
                const formatted = data.map(d => ({ ...d, time: normalizeTimestamp(d.time) })).filter(d => d.time).sort((a,b) => a.time - b.time);
                newSeries.setData(isLine ? formatted.map(d => ({ time: d.time, value: d.close })) : formatted);
            }
            seriesRefs.current.mainSeries = newSeries;
        }
    }, [internalChartType, chartReady]);

    // --- LIVE / AUTO UPDATE ---
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
                    
                    // 1. Update Main Series
                    if (seriesRefs.current.mainSeries) {
                         const normOhlc = data.ohlc.map(d => ({...d, time: normalizeTimestamp(d.time)})).sort((a,b) => a.time - b.time);
                         seriesRefs.current.mainSeries.setData(internalChartType === 'line' ? normOhlc.map(d => ({time: d.time, value: d.close})) : normOhlc);
                         if (savedCandle && internalChartType === 'candle') {
                             const lastTime = normOhlc[normOhlc.length-1].time;
                             if (savedCandle.time >= lastTime) seriesRefs.current.mainSeries.update(savedCandle);
                         }
                    }

                    // 2. Update SSA Components
                    const trendData = data.ssa.trend || [];
                    const cyclicData = data.ssa.cyclic || [];
                    const noiseData = data.ssa.noise || [];
                    const trendDataRaw = data.ssa.trend || [];
                    const cyclicDataRaw = data.ssa.cyclic || [];

                    const coloredTrendData = trendData.map((point, index) => {
                        const normalizedTime = normalizeTimestamp(point.time);
                        if (index === 0 || normalizedTime === null) return { ...point, time: normalizedTime, color: '#888888' };
                        const prevValue = trendData[index - 1].value;
                        const color = point.value >= prevValue ? '#26a69a' : '#ef5350';
                        return { ...point, time: normalizedTime, color };
                    }).filter(p => p.time !== null).sort((a, b) => a.time - b.time);
                    seriesRefs.current.trend.setData(coloredTrendData);

                    const coloredCyclicData = cyclicData.map((point, index) => {
                        const normalizedTime = normalizeTimestamp(point.time);
                        if (index === 0 || normalizedTime === null) return { time: normalizedTime, value: point.value, color: '#808080' };
                        const y1 = cyclicData[index - 1].value;
                        const y2 = point.value;
                        let color = '#808080';
                        if (y2 < 0) color = y2 < y1 ? '#006400' : '#00FF00';
                        else if (y2 > 0) color = y2 > y1 ? '#8B0000' : '#FFA500';
                        return { time: normalizedTime, value: point.value, color };
                    }).filter(p => p.time !== null).sort((a, b) => a.time - b.time);
                    seriesRefs.current.cyclic.setData(coloredCyclicData);

                    const coloredNoiseData = noiseData.map((point) => {
                        const normalizedTime = normalizeTimestamp(point.time); 
                        if (normalizedTime === null) return null;
                        const color = point.value < 0 ? '#00FF00' : (point.value > 0 ? '#FF0000' : '#808080');
                        return { time: normalizedTime, value: point.value, color };
                    }).filter(p => p !== null).sort((a, b) => a.time - b.time);
                    seriesRefs.current.noise.setData(coloredNoiseData);

                    if (seriesRefs.current.reconstructed) {
                        const reconstructedData = [];
                        for (let i = 0; i < trendDataRaw.length; i++) {
                            if (trendDataRaw[i] && cyclicDataRaw[i] && trendDataRaw[i].time === cyclicDataRaw[i].time) {
                                const normalizedTime = normalizeTimestamp(trendDataRaw[i].time);
                                if (normalizedTime !== null) {
                                    reconstructedData.push({ time: normalizedTime, value: trendDataRaw[i].value + cyclicDataRaw[i].value });
                                }
                            }
                        }
                        reconstructedData.sort((a, b) => a.time - b.time);
                        seriesRefs.current.reconstructed.setData(reconstructedData);
                        
                        const hotspotData = calculateHotspotData(data.ohlc, data.ssa.trend, reconstructedData);
                        seriesRefs.current.hotspotSeries.setData(hotspotData);
                    }

                    seriesRefs.current.cyclicZeroLine.setData(coloredTrendData.map(p => ({ time: p.time, value: 0, color: p.color })));
                    seriesRefs.current.noiseZeroLine.setData(coloredCyclicData.map(p => ({ time: p.time, value: 0, color: p.color })));

                    // 3. Update Forecast (Always populate, let toggle handle visibility)
                    if (seriesRefs.current.forecast && data.forecast) {
                        console.log("Updating Forecast Data (Periodic)");
                        const forecastData = data.forecast.map(item => ({
                            time: normalizeTimestamp(item.time), value: item.value
                        })).filter(d => d.time !== null);
                        seriesRefs.current.forecast.setData(forecastData);
                    }
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
                ws.onopen = () => { setIsRealtime(true); ws.send(JSON.stringify({ action: "subscribe", params: { symbols: symbol } })); };
                ws.onmessage = (e) => {
                    const d = JSON.parse(e.data);
                    if (d.event === "price" && seriesRefs.current.mainSeries) {
                        const price = parseFloat(d.price);
                        const time = Math.floor(getCandleStartTime((d.timestamp || Date.now()/1000)*1000, intervalMs)/1000);
                        if (internalChartType === 'line') {
                            seriesRefs.current.mainSeries.update({ time, value: price });
                        } else {
                            if (!currentCandleRef.current || currentCandleRef.current.time !== time) currentCandleRef.current = { time, open: price, high: price, low: price, close: price };
                            else { currentCandleRef.current.high = Math.max(currentCandleRef.current.high, price); currentCandleRef.current.low = Math.min(currentCandleRef.current.low, price); currentCandleRef.current.close = price; }
                            seriesRefs.current.mainSeries.update(currentCandleRef.current);
                        }
                    }
                };
            }, 300);
        } else { setIsRealtime(false); }

        if (autoUpdate || enableRealtime) setupAlignedTimer();

        return () => {
            if (timeoutId) clearTimeout(timeoutId);
            if (wsRef.current) wsRef.current.close();
            if (realtimeIntervalRef.current) { clearInterval(realtimeIntervalRef.current); clearTimeout(realtimeIntervalRef.current); }
            if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
        };
    }, [enableRealtime, autoUpdate, apiKey, symbol, interval, lValue, useAdaptiveL, chartReady, internalChartType]);

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            {/* Styles */}
            <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } } .chart-toggle-button { position: absolute; left: 10px; z-index: 10; background: rgba(40, 40, 40, 0.8); color: #d1d4dc; border: 1px solid #555; border-radius: 4px; padding: 4px 8px; cursor: pointer; font-size: 11px; width: 90px; text-align: center; } .chart-toggle-button.active { background: #0078d4; color: white; border: 1px solid #0078d4; } .chart-type-toggle { position: static; width: 55px; }`}</style>
            
            {!loading && !error && (
                <>
                    <div style={{ position: 'absolute', top: '10px', left: '50%', transform: 'translateX(-50%)', zIndex: 10, color: '#d1d4dc', fontSize: '16px', fontWeight: 'bold', pointerEvents: 'none' }}>
                        {symbol} ({interval})
                    </div>
                    <button onClick={() => setShowTrend(p => !p)} className={`chart-toggle-button ${showTrend ? 'active' : ''}`} style={{ top: '60px' }}>{showTrend ? 'Trend: ON' : 'Trend: OFF'}</button>
                    <button onClick={() => setShowReconstructed(p => !p)} className={`chart-toggle-button ${showReconstructed ? 'active' : ''}`} style={{ top: '90px' }}>{showReconstructed ? 'Cyclic: ON' : 'Cyclic: OFF'}</button>
                    <div style={{ position: 'absolute', left: '10px', top: '120px', zIndex: 10, display: 'flex', gap: '5px' }}>
                        <button onClick={() => setInternalChartType('candle')} className={`chart-toggle-button chart-type-toggle ${internalChartType === 'candle' ? 'active' : ''}`} title="Candlestick Chart">Candle</button>
                        <button onClick={() => setInternalChartType('line')} className={`chart-toggle-button chart-type-toggle ${internalChartType === 'line' ? 'active' : ''}`} title="Line Chart">Line</button>
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