import React, { useEffect, useRef, useState } from 'react';
// We need Candlestick, Line, and Histogram series
import { createChart, ColorType, CandlestickSeries, LineSeries, HistogramSeries } from 'lightweight-charts';
import { getChartData } from '../services/api';

const TradingChart = ({ 
    symbol = 'BTC/USD', 
    interval = '1day', 
    // --- REMOVED: chartType prop ---
    lValue = 30, 
    useAdaptiveL = true, 
    apiKey = '', 
    enableRealtime = false, 
    autoUpdate = false,
    showHotspots = false 
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
    
    // --- State for line visibility ---
    const [showTrend, setShowTrend] = useState(true);
    const [showReconstructed, setShowReconstructed] = useState(true);
    // --- State for countdown timer ---
    const [countdown, setCountdown] = useState(60);
    const countdownIntervalRef = useRef(null);
    
    // --- NEW: Internal state for chart type ---
    const [internalChartType, setInternalChartType] = useState('line');
    
    useEffect(() => {
        console.log("TradingChart component mounted with props:", {
            symbol, interval, lValue, useAdaptiveL, enableRealtime, autoUpdate, showHotspots, hasApiKey: !!apiKey
        });
    }, []);

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

    const convertSymbolForWS = (sym) => {
        return sym.replace('/', '');
    };

    const normalizeTimestamp = (time) => {
        if (typeof time === 'number') {
            return time;
        }
        if (typeof time === 'string') {
            const parsedTime = parseInt(time);
            if (!isNaN(parsedTime)) {
                return (parsedTime.toString().length === 10) ? parsedTime : Math.floor(parsedTime / 1000);
            }
        }
        if (time instanceof Date) {
            return Math.floor(time.getTime() / 1000);
        }
        if (typeof time === 'object' && time !== null) {
            if (time.timestamp) return normalizeTimestamp(time.timestamp);
            if (time.time) return normalizeTimestamp(time.time);
            const timestamp = new Date(time).getTime();
            if (!isNaN(timestamp)) {
                return Math.floor(timestamp / 1000);
            }
        }
        console.error("Could not normalize timestamp:", time, typeof time);
        return null;
    };

    // --- Helper function to set visible range to last N bars ---
    const setVisibleRangeToLastNBars = (n = 250, padding = 20) => {
        if (!chartRef.current || !lastDataRef.current?.ohlc) return;
        
        const ohlcData = lastDataRef.current.ohlc;
        if (ohlcData.length === 0) return;
        
        const dataLength = ohlcData.length;
        
        // Calculate the 'from' and 'to' bar indices
        const fromIndex = Math.max(0, dataLength - n);
        const toIndex = (dataLength - 1) + padding; // This is the key change
        
        // Use setVisibleLogicalRange instead of setVisibleRange
        chartRef.current.timeScale().setVisibleLogicalRange({
            from: fromIndex,
            to: toIndex
        });
    };

    // --- Handler to reset chart view (Horizontal, Vertical, and Panes) ---
    const handleResetView = () => {
        if (chartRef.current) {
            // 1. Reset time (horizontal) to last 150 bars
            setVisibleRangeToLastNBars(150);
            
            // 2. Reset all price scales (vertical)
            try { chartRef.current.priceScale('right').applyOptions({ autoScale: true }); } catch (e) {}
            try { chartRef.current.priceScale('cyclic').applyOptions({ autoScale: true }); } catch (e) {}
            try { chartRef.current.priceScale('noise').applyOptions({ autoScale: true }); } catch (e) {}

            // 3. Reset pane heights
            const panes = chartRef.current.panes();
            if (panes.length >= 3) {
                panes[0].setHeight(300);
                panes[1].setHeight(200);
                panes[2].setHeight(100);
            }
        }
    };

    // --- Helper function to calculate hotspot data (Candlestick logic) ---
    const calculateHotspotData = (ohlcRaw, trendRaw, reconRaw) => {
        if (!ohlcRaw || !trendRaw || !reconRaw || ohlcRaw.length === 0) {
            return [];
        }

        const priceMap = new Map();
        ohlcRaw.forEach(d => {
            priceMap.set(normalizeTimestamp(d.time), d.close);
        });

        const trendMap = new Map();
        trendRaw.forEach(d => {
            trendMap.set(normalizeTimestamp(d.time), d.value);
        });
        
        const reconMap = new Map();
        reconRaw.forEach(d => {
            reconMap.set(d.time, d.value); // reconRaw is already normalized
        });

        const allTimes = reconRaw.map(d => d.time); // Already sorted from fetchData/runPeriodicRefresh

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
            
            if (price === undefined || recon === undefined || trend === undefined) {
                continue;
            }

            const isTrendRising = trendRising[i];
            let color = 'rgba(0,0,0,0)'; // Default transparent
            
            const alpha = 1.0; 

            if (recon < trend && price < recon) {
                color = isTrendRising ? `rgba(0, 255, 0, ${alpha})` : `rgba(173, 255, 47, ${alpha})`; 
            } else if (recon > trend && price > recon) {
                color = !isTrendRising ? `rgba(255, 0, 0, ${alpha})` : `rgba(255, 165, 0, ${alpha})`; 
            }

            hotspotCandles.push({
                time: time,
                open: price,
                high: Math.max(price, recon),
                low: Math.min(price, recon),
                close: recon,
                color: color,
                borderColor: color 
            });
        }
        
        return hotspotCandles; // Already sorted
    };


    // This effect creates the chart and fetches initial data
    useEffect(() => {
        console.log("Chart setup effect triggered");
        const currentChartContainer = chartContainerRef.current;
        if (!currentChartContainer) {
            console.error("Chart container ref is null on setup");
            return;
        }

        let chartInstance = null;

        const fetchData = async () => {
            if (!chartRef.current) {
                return;
            }
            setLoading(true); 
            setError(null); 
            setLUsed(null);
            
            const currentSeriesRefs = seriesRefs.current;
            const currentChartRef = chartRef.current;

            try {
                const data = await getChartData(symbol, interval, lValue, useAdaptiveL);
                console.log("fetchData: API call successful, Data received:", data);
                
                lastDataRef.current = data; 

                if (!currentChartRef || !currentSeriesRefs || Object.keys(currentSeriesRefs).length === 0 || !currentSeriesRefs.mainSeries) {
                     console.warn("fetchData: Refs missing after fetch, skipping setData.");
                     return;
                }

                if (data && data.ohlc && data.ssa) {
                    if (data.ohlc.length === 0) {
                         console.error("fetchData: OHLC data array is empty!");
                         setError("Received empty OHLC data.");
                    } else {
                        console.log("fetchData: Attempting to set data to series...");
                        
                        // Set Main Series (Candle or Line)
                        const normalizedOhlc = data.ohlc.map(candle => ({
                            ...candle,
                            time: normalizeTimestamp(candle.time)
                        })).filter(c => c.time !== null)
                          .sort((a, b) => a.time - b.time); // SORT
                        
                        // --- MODIFIED: Use internalChartType state ---
                        if (internalChartType === 'line') {
                            const lineData = normalizedOhlc.map(c => ({
                                time: c.time,
                                value: c.close 
                            }));
                            currentSeriesRefs.mainSeries.setData(lineData);
                        } else {
                            currentSeriesRefs.mainSeries.setData(normalizedOhlc);
                        }
                        
                        // Set Trend Series
                        const trendData = data.ssa.trend || [];
                        const coloredTrendData = trendData.map((point, index) => {
                            const normalizedTime = normalizeTimestamp(point.time);
                            if (index === 0 || normalizedTime === null) return { ...point, time: normalizedTime, color: '#888888' };
                            const prevValue = trendData[index - 1].value;
                            const currentValue = point.value;
                            const color = currentValue >= prevValue ? '#26a69a' : '#ef5350';
                            return { ...point, time: normalizedTime, color };
                        }).filter(p => p.time !== null)
                          .sort((a, b) => a.time - b.time); // SORT
                        currentSeriesRefs.trend.setData(coloredTrendData);
                        
                        // Set Cyclic Series
                        const cyclicData = data.ssa.cyclic || [];
                        const coloredCyclicData = cyclicData.map((point, index) => {
                            const normalizedTime = normalizeTimestamp(point.time);
                            if (index === 0 || normalizedTime === null) return { time: normalizedTime, value: point.value, color: '#808080' };
                            const y1 = cyclicData[index - 1].value;
                            const y2 = point.value;
                            let color;
                            if (y2 < 0) {
                                color = y2 < y1 ? '#006400' : '#00FF00';
                            } else if (y2 > 0) {
                                color = y2 > y1 ? '#8B0000' : '#FFA500';
                            } else {
                                color = '#808080';
                            }
                            return { time: normalizedTime, value: point.value, color };
                        }).filter(p => p.time !== null)
                          .sort((a, b) => a.time - b.time); // SORT
                        
                        currentSeriesRefs.cyclic.setData(coloredCyclicData);
                        
                        // Set Noise Series
                        const noiseData = data.ssa.noise || [];
                        const coloredNoiseData = noiseData.map((point) => {
                            const normalizedTime = normalizeTimestamp(point.time);
                            if (normalizedTime === null) return null;
                            let color;
                            if (point.value < 0) {
                                color = '#00FF00';
                            } else if (point.value > 0) {
                                color = '#FF0000';
                            } else {
                                color = '#808080';
                            }
                            return { time: normalizedTime, value: point.value, color };
                        }).filter(p => p !== null)
                          .sort((a, b) => a.time - b.time); // SORT

                        currentSeriesRefs.noise.setData(coloredNoiseData);

                        // Set Reconstructed Line
                        const trendDataRaw = data.ssa.trend || [];
                        const cyclicDataRaw = data.ssa.cyclic || [];
                        const reconstructedData = [];
                        for (let i = 0; i < trendDataRaw.length; i++) {
                            const trendPoint = trendDataRaw[i];
                            const cyclicPoint = cyclicDataRaw[i];
                            if (!trendPoint || !cyclicPoint || trendPoint.time !== cyclicPoint.time) {
                                continue; 
                            }
                            const normalizedTime = normalizeTimestamp(trendPoint.time);
                            if (normalizedTime === null) {
                                continue;
                            }
                            reconstructedData.push({
                                time: normalizedTime,
                                value: trendPoint.value + cyclicPoint.value
                            });
                        }
                        reconstructedData.sort((a, b) => a.time - b.time); // SORT
                        if (currentSeriesRefs.reconstructed) {
                            currentSeriesRefs.reconstructed.setData(reconstructedData);
                        }

                        // Calculate and Set Hotspot Data
                        const hotspotData = calculateHotspotData(
                            data.ohlc, 
                            data.ssa.trend, 
                            reconstructedData 
                        );
                        
                        if (currentSeriesRefs.hotspotSeries) {
                            currentSeriesRefs.hotspotSeries.setData(hotspotData);
                        }

                        // Set zero-line lines
                        const cyclicZeroLineData = coloredTrendData.map(point => ({
                            time: point.time,
                            value: 0,
                            color: point.color
                        }));
                        currentSeriesRefs.cyclicZeroLine.setData(cyclicZeroLineData);

                        const noiseZeroLineData = coloredCyclicData.map(point => ({
                            time: point.time,
                            value: 0,
                            color: point.color
                        }));
                        currentSeriesRefs.noiseZeroLine.setData(noiseZeroLineData);
                        
                        console.log("fetchData: setData calls completed.");
                        setLUsed(data.l_used);
                        
                        console.log("Setting pane heights after data load...");
                        const panes = currentChartRef.panes();
                        if (panes.length >= 3) {
                            panes[0].setHeight(300);
                            panes[1].setHeight(200);
                            panes[2].setHeight(100);
                        }
                        
                        // Set initial view to last 150 bars
                        setVisibleRangeToLastNBars(150);
                    }
                } else {
                     console.error("fetchData: Invalid data structure received:", data);
                     setError("Received invalid data structure from backend.");
                     if (currentSeriesRefs && currentSeriesRefs.mainSeries) {
                        Object.values(currentSeriesRefs).forEach(series => series?.setData([]));
                     }
                }
            } catch (err) {
                 console.error("fetchData: Error caught during fetch/processing:", err);
                 setError(err.message || "Failed to fetch chart data.");
                 if (currentSeriesRefs && currentSeriesRefs.mainSeries) {
                    Object.values(currentSeriesRefs).forEach(series => series?.setData([]));
                 }
            } finally {
                console.log("fetchData: Reached finally block. Setting loading to false.");
                setLoading(false);
            }
        };

        try {
            console.log("Before createChart...");
            chartInstance = createChart(currentChartContainer, {
                 layout: { 
                    background: { type: ColorType.Solid, color: '#1a1a1a' }, 
                    textColor: '#d1d4dc',
                    panes: {
                        separatorColor: '#2b2b43',
                        separatorHoverColor: '#f00c0cff',
                        separatorActiveColor: '#0078d4',
                        separatorHeight: 6,
                        enableResize: true, 
                    }
                },
                grid: { 
                    vertLines: { color: '#2b2b43' }, 
                    horzLines: { color: '#2b2b43' } 
                },
                timeScale: { 
                    timeVisible: true, 
                    secondsVisible: interval.includes('min'), 
                    borderColor: '#485158',
                    rightOffset: 50 
                },
                rightPriceScale: { 
                    borderColor: '#485158' 
                },
                width: currentChartContainer.clientWidth,
                height: currentChartContainer.clientHeight,
            });
            console.log("AFTER createChart.");
            chartRef.current = chartInstance;
            
            // --- MODIFIED: Use internalChartType state ---
            if (internalChartType === 'line') {
                seriesRefs.current.mainSeries = chartInstance.addSeries(LineSeries, {
                    color: '#26a69a', 
                    lineWidth: 2,
                    priceLineVisible: false,
                });
            } else { 
                seriesRefs.current.mainSeries = chartInstance.addSeries(CandlestickSeries, { 
                    upColor: '#26a69a', downColor: '#ef5350',
                    borderVisible: false,
                    wickUpColor: '#26a69a', wickDownColor: '#ef5350'
                });
            }

            seriesRefs.current.hotspotSeries = chartInstance.addSeries(CandlestickSeries, {
                wickUpColor: 'transparent',
                wickDownColor: 'transparent',
                upColor: 'transparent',
                downColor: 'transparent',
                borderVisible: false,
                autoscaleInfoProvider: () => null,
                visible: showHotspots,
                priceLineVisible: false,
                lastValueVisible: false,
            });

            chartInstance.priceScale('right').applyOptions({ mode: 1 });
            
            seriesRefs.current.trend = chartInstance.addSeries(LineSeries, { 
                lineWidth: 2, 
                priceLineVisible: false, 
                lastValueVisible: true, 
                lineType: 0,
                visible: showTrend, 
            });
            
            seriesRefs.current.reconstructed = chartInstance.addSeries(LineSeries, {
                color: '#1c86ffff',
                lineWidth: 3,
                lineStyle: 1,
                priceLineVisible: false,
                lastValueVisible: false,
                crosshairMarkerVisible: false,
                visible: showReconstructed, 
            });

            seriesRefs.current.cyclic = chartInstance.addSeries(HistogramSeries, { 
                priceLineVisible: false, lastValueVisible: true, priceScaleId: 'cyclic', base: 0
            }, 1);

            seriesRefs.current.cyclicZeroLine = chartInstance.addSeries(LineSeries, {
                priceScaleId: 'cyclic', 
                lineWidth: 4,           
                lineStyle: 0,           
                pointMarkersVisible: false,
                priceLineVisible: false,
                lastValueVisible: false,
                crosshairMarkerVisible: false,
                autoscaleInfoProvider: () => null, 
            }, 1); 

            seriesRefs.current.noise = chartInstance.addSeries(HistogramSeries, { 
                priceLineVisible: false, lastValueVisible: true, priceScaleId: 'noise', base: 0
            }, 2);
            
            seriesRefs.current.noiseZeroLine = chartInstance.addSeries(LineSeries, {
                priceScaleId: 'noise', 
                lineWidth: 4,        
                lineStyle: 0,        
                pointMarkersVisible: false,
                priceLineVisible: false,
                lastValueVisible: false,
                crosshairMarkerVisible: false,
                autoscaleInfoProvider: () => null, 
            }, 2); 
            
            console.log("All series added.");

            resizeObserver.current = new ResizeObserver(entries => {
                 const { width, height } = entries[0].contentRect;
                 if (chartRef.current) { 
                     chartRef.current.applyOptions({ width, height });
                 }
             });
            resizeObserver.current.observe(currentChartContainer);
            console.log("ResizeObserver attached.");

            console.log("Chart setup complete. Calling initial fetchData...");
            setChartReady(true);
            fetchData(); // Fetch the initial data

        } catch (err) {
            console.error("!!! ERROR caught during setup:", err);
            setError(`Init Error: ${err.message}`);
            setLoading(false);
            if (chartInstance) { 
                chartInstance.remove(); 
            }
            return;
        }

        // Cleanup for THIS effect
        return () => {
             console.log("Cleaning up main chart setup...");
             if (resizeObserver.current && currentChartContainer) {
                 resizeObserver.current.unobserve(currentChartContainer);
             }
             if (chartRef.current) {
                 console.log("Removing chart instance...");
                 chartRef.current.remove();
             }
             chartRef.current = null;
             seriesRefs.current = {};
             setChartReady(false);
             console.log("Main setup cleanup complete.");
        };
    }, [symbol, interval, lValue, useAdaptiveL]); 

    // --- MODIFIED: Effect for dynamically swapping chart type ---
    // Now uses internalChartType state instead of chartType prop
    useEffect(() => {
        if (!chartReady || !chartRef.current || !seriesRefs.current.mainSeries || !lastDataRef.current) {
            return;
        }

        const chartInstance = chartRef.current;
        const currentSeries = seriesRefs.current.mainSeries;
        const currentSeriesType = currentSeries.seriesType(); 

        console.log(`Chart type change detected. State: ${internalChartType}, Current: ${currentSeriesType}`);

        if (internalChartType === 'line' && currentSeriesType === 'Candlestick') {
            console.log('Swapping from Candle to Line');
            chartInstance.removeSeries(currentSeries);
            
            const newLineSeries = chartInstance.addSeries(LineSeries, {
                color: '#26a69a',
                lineWidth: 2,
                priceLineVisible: false,
            });

            if (lastDataRef.current && lastDataRef.current.ohlc) {
                const lineData = lastDataRef.current.ohlc
                    .map(c => ({ time: normalizeTimestamp(c.time), value: c.close }))
                    .filter(p => p.time !== null)
                    .sort((a, b) => a.time - b.time); // SORT
                newLineSeries.setData(lineData);
            }
            seriesRefs.current.mainSeries = newLineSeries;
        
        } else if (internalChartType === 'candle' && currentSeriesType === 'Line') {
            console.log('Swapping from Line to Candle');
            chartInstance.removeSeries(currentSeries);
            
            const newCandleSeries = chartInstance.addSeries(CandlestickSeries, { 
                upColor: '#26a69a', downColor: '#ef5350',
                borderVisible: false,
                wickUpColor: '#26a69a', wickDownColor: '#ef5350'
            });

            if (lastDataRef.current && lastDataRef.current.ohlc) {
                const candleData = lastDataRef.current.ohlc
                    .map(c => ({ ...c, time: normalizeTimestamp(c.time) }))
                    .filter(p => p !== null)
                    .sort((a, b) => a.time - b.time); // SORT
                newCandleSeries.setData(candleData);
            }
            seriesRefs.current.mainSeries = newCandleSeries;
        }

    }, [internalChartType, chartReady]); // <-- MODIFIED Dependency

    // Effect to toggle Hotspot visibility
    useEffect(() => {
        if (!chartReady || !seriesRefs.current.hotspotSeries) {
            return;
        }
        console.log("Toggling Hotspots visibility to:", showHotspots);
        seriesRefs.current.hotspotSeries.applyOptions({
            visible: showHotspots
        });
    }, [showHotspots, chartReady]);

    // --- Effect to toggle Trend visibility ---
    useEffect(() => {
        if (!chartReady || !seriesRefs.current.trend) {
            return;
        }
        console.log("Toggling Trend visibility to:", showTrend);
        seriesRefs.current.trend.applyOptions({
            visible: showTrend
        });
    }, [showTrend, chartReady]);

    // --- Effect to toggle Reconstructed visibility ---
    useEffect(() => {
        if (!chartReady || !seriesRefs.current.reconstructed) {
            return;
        }
        console.log("Toggling Reconstructed visibility to:", showReconstructed);
        seriesRefs.current.reconstructed.applyOptions({
            visible: showReconstructed
        });
    }, [showReconstructed, chartReady]);


    // --- WEBSOCKET/AUTO-UPDATE HOOK ---
    useEffect(() => {
        console.log("WebSocket/AutoUpdate effect triggered", { enableRealtime, autoUpdate, apiKey: apiKey ? 'provided' : 'missing', chartReady });

        const currentSymbol = symbol;
        let timeoutId = null; 
        
        // --- Clear countdown interval on cleanup ---
        if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
        }
        
        if ((!enableRealtime && !autoUpdate) || !chartReady) {
            console.log("WebSocket and AutoUpdate not starting.");
            
            if (wsRef.current) {
                console.log("Cleaning up WS from guard clause...");
                const currentWs = wsRef.current;
                if (currentWs.readyState === WebSocket.OPEN) {
                    try {
                        const unsubscribeMessage = { action: "unsubscribe", params: { symbols: symbol } };
                        currentWs.send(JSON.stringify(unsubscribeMessage));
                    } catch (e) { console.log("Error unsubscribing:", e); }
                }
                currentWs.close();
                wsRef.current = null;
            }
            if (realtimeIntervalRef.current) {
                console.log("Cleaning up interval from guard clause...");
                clearInterval(realtimeIntervalRef.current);
                realtimeIntervalRef.current = null;
            }
            
            setIsRealtime(false);
            setCountdown(60); // Reset countdown
            currentCandleRef.current = null;
            return;
        }
        
        if (enableRealtime && apiKey) {
            timeoutId = setTimeout(() => {
                console.log("Setting up WebSocket connection for real-time updates...");
                
                const intervalMs = intervalToMs(interval);
                const wsSymbol = currentSymbol;
                
                const wsUrl = `wss://ws.twelvedata.com/v1/quotes/price?apikey=${apiKey}`;
                console.log("Connecting to WebSocket:", wsUrl.replace(apiKey, 'HIDDEN'));
                const ws = new WebSocket(wsUrl);
                wsRef.current = ws;

                ws.onopen = () => {
                    console.log("WebSocket connected");
                    setIsRealtime(true); // <-- This sets the state for the "LIVE" text
                    const subscribeMessage = {
                        action: "subscribe",
                        params: { symbols: wsSymbol }
                    };
                    ws.send(JSON.stringify(subscribeMessage));
                };

                ws.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        
                        if (data.event === "subscribe-status") {
                            console.log("Subscription status:", data);
                            if (data.status === "error" && data.fails) {
                                const errorMsg = data.fails[0]?.message || data.fails[0]?.msg || 'Unknown subscription error';
                                setError(`WebSocket subscription failed: ${errorMsg}`);
                            }
                            return;
                        }
                        if (data.event === "heartbeat") return;

                        if (data.event === "price" || data.price) {
                            const price = parseFloat(data.price);
                            const timestampMs = data.timestamp ? (data.timestamp * 1000) : Date.now();
                            
                            if (isNaN(price)) return;

                            const candleStartMs = getCandleStartTime(timestampMs, intervalMs);
                            const candleStartTime = Math.floor(candleStartMs / 1000);
                            
                            let canProceed = true;
                            if (lastDataRef.current?.ohlc) {
                                // --- FIX: Check if lastDataRef.current.ohlc is an array ---
                                if (Array.isArray(lastDataRef.current.ohlc) && lastDataRef.current.ohlc.length > 0) {
                                    const lastHistoricalCandle = lastDataRef.current.ohlc[lastDataRef.current.ohlc.length - 1];
                                    const lastHistoricalTime = normalizeTimestamp(lastHistoricalCandle?.time);
                                    
                                    if (lastHistoricalTime && candleStartTime < lastHistoricalTime) {
                                        console.warn(`Skipping update: new time ${candleStartTime} is older than last historical ${lastHistoricalTime}`);
                                        canProceed = false;
                                    }
                                }
                            }
                            
                            if (!canProceed) return;
                            
                            // --- MODIFIED: Use internalChartType state ---
                            if (internalChartType === 'line') {
                                if (seriesRefs.current.mainSeries) {
                                    seriesRefs.current.mainSeries.update({
                                        time: candleStartTime,
                                        value: price
                                    });
                                }
                            } else {
                                if (!currentCandleRef.current || currentCandleRef.current.time !== candleStartTime) {
                                    currentCandleRef.current = {
                                        time: candleStartTime,
                                        open: price, high: price, low: price, close: price
                                    };
                                    if (seriesRefs.current.mainSeries) {
                                        seriesRefs.current.mainSeries.update(currentCandleRef.current);
                                    }
                                } else {
                                    currentCandleRef.current.high = Math.max(currentCandleRef.current.high, price);
                                    currentCandleRef.current.low = Math.min(currentCandleRef.current.low, price);
                                    currentCandleRef.current.close = price;
                                    if (seriesRefs.current.mainSeries) {
                                        seriesRefs.current.mainSeries.update(currentCandleRef.current);
                                    }
                                }
                            }
                        }
                    } catch (err) {
                        console.error("Error parsing WebSocket message:", err);
                    }
                };
                ws.onerror = (error) => { console.error("WebSocket error:", error); setIsRealtime(false); };
                ws.onclose = () => { console.log("WebSocket disconnected"); setIsRealtime(false); };
            }, 300);
        } else {
            setIsRealtime(false);
        }
        
        console.log(`Setting up periodic refresh interval (60s) for: ${enableRealtime ? 'Live' : ''} ${autoUpdate ? 'AutoUpdate' : ''}`);
        
        const runPeriodicRefresh = async () => {
            console.log("=== Periodic full data refresh starting ===");
            setCountdown(60); // <-- NEW: Reset countdown
            
            const savedCandle = currentCandleRef.current ? { ...currentCandleRef.current } : null;
            
            try {
                const data = await getChartData(symbol, interval, lValue, useAdaptiveL);
                
                if (data && data.ohlc && data.ssa) {
                    lastDataRef.current = data; 
                    
                    if (seriesRefs.current.mainSeries) {
                        const normalizedOhlc = data.ohlc.map(candle => ({
                            ...candle,
                            time: normalizeTimestamp(candle.time)
                        })).filter(c => c.time !== null)
                          .sort((a, b) => a.time - b.time); // SORT

                        // --- MODIFIED: Use internalChartType state ---
                        if (internalChartType === 'line') {
                            const lineData = normalizedOhlc.map(c => ({
                                time: c.time,
                                value: c.close
                            }));
                            seriesRefs.current.mainSeries.setData(lineData);
                        } else {
                            seriesRefs.current.mainSeries.setData(normalizedOhlc);
                        }
                        
                        // --- MODIFIED: Use internalChartType state ---
                        if (savedCandle && internalChartType === 'candle') { 
                            const lastHistoricalTime = normalizedOhlc.length > 0 ? normalizedOhlc[normalizedOhlc.length - 1].time : null;
                            if (lastHistoricalTime && savedCandle.time >= lastHistoricalTime) {
                                seriesRefs.current.mainSeries.update(savedCandle);
                                currentCandleRef.current = savedCandle;
                            } else {
                                currentCandleRef.current = null;
                            }
                        }
                    }
                    
                    if (seriesRefs.current.trend && data.ssa.trend) {
                        const trendData = data.ssa.trend || [];
                        const coloredTrendData = trendData.map((point, index) => {
                            const normalizedTime = normalizeTimestamp(point.time);
                            if (index === 0 || normalizedTime === null) return { ...point, time: normalizedTime, color: '#888888' };
                            const prevValue = trendData[index - 1].value;
                            const currentValue = point.value;
                            const color = currentValue >= prevValue ? '#26a69a' : '#ef5350';
                            return { ...point, time: normalizedTime, color };
                        }).filter(p => p.time !== null)
                          .sort((a, b) => a.time - b.time); // SORT
                        seriesRefs.current.trend.setData(coloredTrendData);
                    }
                    
                    if (seriesRefs.current.cyclic && data.ssa.cyclic) {
                        const cyclicData = data.ssa.cyclic || [];
                        const coloredCyclicData = cyclicData.map((point, index) => {
                            const normalizedTime = normalizeTimestamp(point.time);
                            if (index === 0 || normalizedTime === null) return { time: normalizedTime, value: point.value, color: '#808080' };
                            const y1 = cyclicData[index - 1].value;
                            const y2 = point.value;
                            let color;
                            if (y2 < 0) color = y2 < y1 ? '#006400' : '#00FF00';
                            else if (y2 > 0) color = y2 > y1 ? '#8B0000' : '#FFA500';
                            else color = '#808080';
                            return { time: normalizedTime, value: point.value, color };
                        }).filter(p => p.time !== null)
                          .sort((a, b) => a.time - b.time); // SORT
 
                        seriesRefs.current.cyclic.setData(coloredCyclicData);
                    }
                    
                    if (seriesRefs.current.noise && data.ssa.noise) {
                        const noiseData = data.ssa.noise || [];
                        const coloredNoiseData = noiseData.map((point) => {
                            const normalizedTime = normalizeTimestamp(point.time); 
                            if (normalizedTime === null) return null;
                            
                            let color;
                            if (point.value < 0) {
                                color = '#00FF00';
                            } else if (point.value > 0) {
                                color = '#FF0000';
                            } else {
                                color = '#808080';
                            }
                            return { time: normalizedTime, value: point.value, color };
                        }).filter(p => p !== null)
                          .sort((a, b) => a.time - b.time); // SORT
                        
                        seriesRefs.current.noise.setData(coloredNoiseData);
                    }
                    
                    if (seriesRefs.current.reconstructed && data.ssa.trend && data.ssa.cyclic) {
                        const trendDataRaw = data.ssa.trend || [];
                        const cyclicDataRaw = data.ssa.cyclic || [];
                        const reconstructedData = [];

                        for (let i = 0; i < trendDataRaw.length; i++) {
                            const trendPoint = trendDataRaw[i];
                            const cyclicPoint = cyclicDataRaw[i];

                            if (!trendPoint || !cyclicPoint || trendPoint.time !== cyclicPoint.time) {
                                continue; 
                            }

                            const normalizedTime = normalizeTimestamp(trendPoint.time);
                            if (normalizedTime === null) {
                                continue;
                            }

                            reconstructedData.push({
                                time: normalizedTime,
                                value: trendPoint.value + cyclicPoint.value
                            });
                        }
                        reconstructedData.sort((a, b) => a.time - b.time); // SORT
                        seriesRefs.current.reconstructed.setData(reconstructedData);

                        // Re-calculate Hotspots on Refresh
                        const hotspotData = calculateHotspotData(
                            data.ohlc, 
                            data.ssa.trend, 
                            reconstructedData
                        );
                        
                        if (seriesRefs.current.hotspotSeries) {
                            seriesRefs.current.hotspotSeries.setData(hotspotData);
                        }

                        // Re-calculate and set data for the zero-line *lines*
                        const trendData = data.ssa.trend || [];
                        const coloredTrendData = trendData.map((point, index) => {
                            const normalizedTime = normalizeTimestamp(point.time);
                            if (index === 0 || normalizedTime === null) return { ...point, time: normalizedTime, color: '#888888' };
                            const prevValue = trendData[index - 1].value;
                            const currentValue = point.value;
                            const color = currentValue >= prevValue ? '#26a69a' : '#ef5350';
                            return { ...point, time: normalizedTime, color };
                        }).filter(p => p.time !== null)
                          .sort((a, b) => a.time - b.time); // SORT

                        const cyclicData = data.ssa.cyclic || [];
                        const coloredCyclicData = cyclicData.map((point, index) => {
                            const normalizedTime = normalizeTimestamp(point.time);
                            if (index === 0 || normalizedTime === null) return { time: normalizedTime, value: point.value, color: '#808080' };
                            const y1 = cyclicData[index - 1].value;
                            const y2 = point.value;
                            let color;
                            if (y2 < 0) color = y2 < y1 ? '#006400' : '#00FF00';
                            else if (y2 > 0) color = y2 > y1 ? '#8B0000' : '#FFA500';
                            else color = '#808080';
                            return { time: normalizedTime, value: point.value, color };
                        }).filter(p => p.time !== null)
                          .sort((a, b) => a.time - b.time); // SORT

                        const cyclicZeroLineData = coloredTrendData.map(point => ({
                            time: point.time,
                            value: 0,
                            color: point.color
                        })); 
                        seriesRefs.current.cyclicZeroLine.setData(cyclicZeroLineData);

                        const noiseZeroLineData = coloredCyclicData.map(point => ({
                            time: point.time,
                            value: 0,
                            color: point.color
                        })); 
                        seriesRefs.current.noiseZeroLine.setData(noiseZeroLineData);
                    }
                    
                    setLUsed(data.l_used);
                    console.log("Periodic refresh complete");
                }
            } catch (err) {
                console.error("Error during periodic refresh:", err);
            }
        };

        const setupAlignedTimer = () => {
            // --- Clear any existing timers ---
            if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
            if (realtimeIntervalRef.current) clearInterval(realtimeIntervalRef.current);
            
            const now = new Date();
            const secondsRemaining = 60 - now.getSeconds();
            const firstDelay = secondsRemaining * 1000;
            
            console.log(`Aligning refresh timer: first run in ${secondsRemaining}s.`);
            setCountdown(secondsRemaining); // Set initial countdown

            // Start the 1-second visual countdown
            countdownIntervalRef.current = setInterval(() => {
                setCountdown(s => (s > 0 ? s - 1 : 60)); // Tick down, wrap to 60
            }, 1000);

            const alignTimeoutId = setTimeout(() => {
                console.log("Aligned refresh: Firing first run.");
                runPeriodicRefresh(); // Run it once
                
                const intervalId = setInterval(runPeriodicRefresh, 60000);
                realtimeIntervalRef.current = intervalId; 

            }, firstDelay);

            realtimeIntervalRef.current = alignTimeoutId;
        };

        if (autoUpdate || enableRealtime) {
            setupAlignedTimer();
        }

        // Cleanup for THIS effect
        return () => {
            console.log("Cleaning up WebSocket/AutoUpdate effect...");
            
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            
            if (wsRef.current) {
                const currentWs = wsRef.current;
                console.log(`Cleaning up WebSocket for symbol: ${currentSymbol}...`);
                if (currentWs.readyState === WebSocket.OPEN) {
                    try {
                        const unsubscribeMessage = {
                            action: "unsubscribe",
                            params: { symbols: currentSymbol }
                        };
                        currentWs.send(JSON.stringify(unsubscribeMessage));
                    } catch (e) {
                        console.log("Error unsubscribing:", e);
                    }
                }
                currentWs.close();
                wsRef.current = null;
            }
            
            // --- Clear all timers on cleanup ---
            if (realtimeIntervalRef.current) {
                clearInterval(realtimeIntervalRef.current);
                realtimeIntervalRef.current = null;
            }
            if (countdownIntervalRef.current) {
                clearInterval(countdownIntervalRef.current);
                countdownIntervalRef.current = null;
            }
            
            setIsRealtime(false);
            currentCandleRef.current = null;
            console.log(`WebSocket/AutoUpdate cleanup complete for ${currentSymbol}`);
        };
    }, [
        enableRealtime, 
        autoUpdate, 
        apiKey, 
        symbol, 
        interval, 
        lValue, 
        useAdaptiveL, 
        chartReady, 
        internalChartType // <-- MODIFIED Dependency
    ]); 
    // --- END OF WEBSOCKET/AUTO-UPDATE HOOK ---

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <style>{`
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.3; }
                }
                .chart-toggle-button {
                    position: absolute;
                    left: 10px;
                    z-index: 10;
                    background: rgba(40, 40, 40, 0.8);
                    color: #d1d4dc;
                    border: 1px solid #555;
                    border-radius: 4px;
                    padding: 4px 8px;
                    cursor: pointer;
                    font-size: 11px;
                    width: 90px;
                    text-align: center;
                }
                .chart-toggle-button.active {
                    background: #0078d4;
                    color: white;
                    border: 1px solid #0078d4;
                }
                /* --- NEW: Style for smaller chart type toggles --- */
                .chart-type-toggle {
                    position: static; /* Remove absolute positioning */
                    width: 55px; /* Make it smaller */
                }
            `}</style>
            
            {!loading && !error && (
                <>
                    <div style={{
                        position: 'absolute',
                        top: '10px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        zIndex: 10,
                        color: '#d1d4dc',
                        fontSize: '16px',
                        fontWeight: 'bold',
                        pointerEvents: 'none', 
                    }}>
                        {symbol} ({interval})
                    </div>
                </>
            )}

            {!loading && !error && (
                <>
                    <button
                        onClick={() => setShowTrend(prev => !prev)}
                        className={`chart-toggle-button ${showTrend ? 'active' : ''}`}
                        style={{ top: '60px' }}
                    >
                        {showTrend ? 'Trend: ON' : 'Trend: OFF'}
                    </button>
                    <button
                        onClick={() => setShowReconstructed(prev => !prev)}
                        className={`chart-toggle-button ${showReconstructed ? 'active' : ''}`}
                        style={{ top: '90px' }}
                    >
                        {showReconstructed ? 'Cyclic: ON' : 'Cyclic: OFF'}
                    </button>
                    
                    {/* --- NEW: Chart Type Toggles --- */}
                    <div style={{ 
                        position: 'absolute', 
                        left: '10px', 
                        top: '120px', 
                        zIndex: 10, 
                        display: 'flex', 
                        gap: '5px' 
                    }}>
                        <button
                            onClick={() => setInternalChartType('candle')}
                            className={`chart-toggle-button chart-type-toggle ${internalChartType === 'candle' ? 'active' : ''}`}
                            title="Candlestick Chart"
                        >
                            Candle
                        </button>
                        <button
                            onClick={() => setInternalChartType('line')}
                            className={`chart-toggle-button chart-type-toggle ${internalChartType === 'line' ? 'active' : ''}`}
                            title="Line Chart"
                        >
                            Line
                        </button>
                    </div>
                </>
            )}

            {isRealtime && (
                <div style={{ 
                    position: 'absolute', 
                    top: '10px', 
                    right: '60px', 
                    zIndex: 10, 
                    background: 'rgba(0,128,0,0.7)', 
                    color: 'white', 
                    padding: '2px 8px', 
                    fontSize: '12px', 
                    borderRadius: '3px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px'
                }}> 
                    <span style={{ 
                        width: '8px', 
                        height: '8px', 
                        borderRadius: '50%', 
                        background: '#00ff00',
                        animation: 'pulse 1.5s ease-in-out infinite'
                    }}></span>
                    LIVE
                </div> 
            )}
            
            {/* --- MODIFIED: Added Countdown Timer Display --- */}
            {autoUpdate && !isRealtime && (
                <div style={{ 
                    position: 'absolute', 
                    top: '10px', 
                    right: '60px', 
                    zIndex: 10, 
                    background: 'rgba(0, 188, 212, 0.7)', 
                    color: 'white', 
                    padding: '2px 8px', 
                    fontSize: '12px', 
                    borderRadius: '3px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px'
                }}> 
                    <span style={{ 
                        width: '8px', 
                        height: '8px', 
                        borderRadius: '50%', 
                        background: '#00bcd4',
                        animation: 'pulse 2s ease-in-out infinite'
                    }}></span>
                    AUTO (1m)
                    {/* Added tabular-nums to stop the text from "jiggling" */}
                    <span style={{color: '#d1d4dc', marginLeft: '5px', fontVariantNumeric: 'tabular-nums'}}>
                        (Next: {countdown}s)
                    </span>
                </div> 
            )}
            {/* --- END MODIFICATION --- */}


            <button
                onClick={handleResetView}
                style={{
                    position: 'absolute',
                    bottom: '10px',
                    left: '10px',
                    zIndex: 10,
                    background: 'rgba(40, 40, 40, 0.8)',
                    color: '#d1d4dc',
                    border: '1px solid #555',
                    borderRadius: '4px',
                    padding: '4px 8px',
                    cursor: 'pointer',
                    fontSize: '11px'
                }}
            >
                Reset View
            </button>

            {loading && !error && (
                <div style={{ 
                    position: 'absolute', 
                    top: '50%', 
                    left: '50%', 
                    transform: 'translate(-50%, -50%)', 
                    color: 'white', 
                    background: 'rgba(0,0,0,0.5)', 
                    padding: '10px', 
                    borderRadius: '5px' 
                }}>
                    Loading chart data...
                </div>
            )}
            {error && (
                <div style={{ 
                    position: 'absolute', 
                    top: '40%', 
                    left: '50%', 
                    transform: 'translate(-50%, -50%)', 
                    color: 'red', 
                    background: 'rgba(0,0,0,0.7)', 
                    padding: '10px', 
                    borderRadius: '5px', 
                    zIndex: 20,
                    maxWidth: '80%'
                }}>
Error: {error}
                </div>
            )}
            <div ref={chartContainerRef} style={{ width: '100%', height: '100%' }} />
        </div>
    );
};

export default TradingChart;