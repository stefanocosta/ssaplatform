import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, LineStyle, CandlestickSeries, LineSeries } from 'lightweight-charts';
// eslint-disable-next-line no-unused-vars
import { getChartData } from '../services/api';

const TradingChart = ({ symbol = 'BTC/USD', interval = '1day', lValue = 30, useAdaptiveL = true }) => {
    const chartContainerRef = useRef(null);
    const chartRef = useRef(null);
    const seriesRefs = useRef({});
    const resizeObserver = useRef(null);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [lUsed, setLUsed] = useState(null);
    // No isChartReady state needed anymore

    // --- Combined Chart Initialization and Initial Data Fetch ---
    useEffect(() => {
        const currentChartContainer = chartContainerRef.current;
        if (!currentChartContainer) return;
        console.log("Combined Effect: START");

        let chartInstance = null;
        let initialFetchCompleted = false; // Flag to prevent cleanup issues

        // --- Define fetchData *inside* the effect ---
        const fetchData = async () => {
            // Check if chartInstance exists before fetching
            if (!chartRef.current) {
                console.warn("fetchData: Chart ref is missing, cannot fetch.");
                setError("Chart initialization failed before data fetch.");
                setLoading(false); // Ensure loading stops
                return;
            }
            console.log("fetchData (Combined Effect): Setting loading to true.");
            setLoading(true); setError(null); setLUsed(null);
            console.log(`Fetching initial data - Symbol: ${symbol}, Interval: ${interval}, L: ${lValue}, Adaptive: ${useAdaptiveL}`);

            const currentSeriesRefs = seriesRefs.current; // Capture refs
            const currentChartRef = chartRef.current;

            try {
                const data = await getChartData(symbol, interval, lValue, useAdaptiveL);
                console.log("fetchData: API call successful, Data received:", data);

                if (!currentChartRef || !currentSeriesRefs || Object.keys(currentSeriesRefs).length === 0 || !currentSeriesRefs.candlestick) {
                     console.warn("fetchData: Refs missing after fetch, skipping setData.");
                     initialFetchCompleted = true; // Mark as done even if refs missing now
                     return;
                }

                if (data && data.ohlc && data.ssa) {
                    console.log("fetchData: Valid data structure. OHLC length:", data.ohlc.length);
                    if (data.ohlc.length === 0) {
                         console.error("fetchData: OHLC data array is empty!");
                         setError("Received empty OHLC data.");
                    } else {
                        console.log("fetchData: Attempting to set data to series...");
                        currentSeriesRefs.candlestick.setData(data.ohlc);
                        currentSeriesRefs.trend.setData(data.ssa.trend || []);
                        currentSeriesRefs.cyclic.setData(data.ssa.cyclic || []);
                        currentSeriesRefs.noise.setData(data.ssa.noise || []);
                        console.log("fetchData: setData calls completed.");
                        setLUsed(data.l_used);
                        console.log("fetchData: Attempting to fit content...");
                        currentChartRef.timeScale().fitContent();
                        console.log("fetchData: Content fitted.");
                    }
                } else {
                     console.error("fetchData: Invalid data structure received:", data);
                     setError("Received invalid data structure from backend.");
                     Object.values(currentSeriesRefs).forEach(series => series?.setData([]));
                }
            } catch (err) {
                 console.error("fetchData: Error caught during fetch/processing:", err);
                 setError(err.message || "Failed to fetch chart data.");
                 if (currentSeriesRefs) {
                    Object.values(currentSeriesRefs).forEach(series => series?.setData([]));
                 }
            } finally {
                console.log("fetchData: Reached finally block. Setting loading to false.");
                setLoading(false);
                initialFetchCompleted = true; // Mark fetch as done
            }
        };

        // --- Chart Setup Logic ---
        try {
            console.log("Combined Effect: Before createChart...");
            chartInstance = createChart(currentChartContainer, { /* ... options ... */
                layout: { background: { type: ColorType.Solid, color: '#1a1a1a' }, textColor: '#d1d4dc' },
                grid: { vertLines: { color: '#2b2b43' }, horzLines: { color: '#2b2b43' } },
                timeScale: { timeVisible: true, secondsVisible: false, borderColor: '#485158' },
                rightPriceScale: { borderColor: '#485158' },
                width: currentChartContainer.clientWidth,
                height: 600,
            });
            console.log("Combined Effect: AFTER createChart.");
            chartRef.current = chartInstance; // Set ref immediately

            console.log("Combined Effect: Before applyOptions panes...");
            chartInstance.applyOptions({ panes: [ { height: 65 }, { height: 10 }, { height: 12.5 }, { height: 12.5 } ] });
            console.log("Combined Effect: AFTER applyOptions panes.");

            // Add Series using Class constructors
            console.log("Combined Effect: Before addSeries Candlestick...");
            seriesRefs.current.candlestick = chartInstance.addSeries(CandlestickSeries, { /* ... */ pane: 0 });
            console.log("Combined Effect: AFTER addSeries Candlestick.");

            console.log("Combined Effect: Before addSeries Trend...");
            seriesRefs.current.trend = chartInstance.addSeries(LineSeries, { /* ... */ pane: 1, priceScaleId: 'trend_scale' });
            console.log("Combined Effect: AFTER addSeries Trend.");

            console.log("Combined Effect: Before addSeries Cyclic...");
            seriesRefs.current.cyclic = chartInstance.addSeries(LineSeries, { /* ... */ pane: 2, priceScaleId: 'cyclic_scale' });
            console.log("Combined Effect: AFTER addSeries Cyclic.");

            console.log("Combined Effect: Before addSeries Noise...");
            seriesRefs.current.noise = chartInstance.addSeries(LineSeries, { /* ... */ pane: 3, priceScaleId: 'noise_scale' });
            console.log("Combined Effect: AFTER addSeries Noise.");

            console.log("Combined Effect: Before applyOptions scales...");
            chartInstance.priceScale('right').applyOptions({ autoScale: true });
            chartInstance.priceScale('trend_scale').applyOptions({ autoScale: true, scaleMargins: { top: 0.9, bottom: 0.1 }, visible: false });
            chartInstance.priceScale('cyclic_scale').applyOptions({ autoScale: true, scaleMargins: { top: 0.7, bottom: 0.3 }, visible: false });
            chartInstance.priceScale('noise_scale').applyOptions({ autoScale: true, scaleMargins: { top: 0.8, bottom: 0.2 }, visible: false });
            console.log("Combined Effect: AFTER applyOptions scales.");

            // Handle Resizing
            resizeObserver.current = new ResizeObserver(entries => {
                 const { width, height } = entries[0].contentRect;
                 if (chartRef.current) { chartRef.current.applyOptions({ width, height }); }
             });
            resizeObserver.current.observe(currentChartContainer);
            console.log("Combined Effect: ResizeObserver attached.");

            // *** CALL fetchData DIRECTLY AFTER SETUP ***
            console.log("Combined Effect: Chart setup complete. Calling initial fetchData...");
            fetchData(); // Fetch data immediately

        } catch (err) {
            console.error("!!! Combined Effect: ERROR caught during setup:", err);
            setError(`Init Error: ${err.message}`);
            setLoading(false); // Stop loading indicator on setup error
            if (chartInstance && !chartRef.current) { chartInstance.remove(); }
            else if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; }
            return;
        }

        // --- Cleanup Function ---
        return () => {
             console.log("Combined Effect: Cleaning up...");
             if (resizeObserver.current && currentChartContainer) {
                 resizeObserver.current.unobserve(currentChartContainer);
             }
             if (chartRef.current) {
                 console.log("Removing chart instance...");
                 chartRef.current.remove();
             } else {
                 console.log("Cleanup: No chart instance to remove.");
             }
             chartRef.current = null;
             seriesRefs.current = {};
             console.log("Combined Effect: Cleanup complete.");
        };
    // *** Effect now depends on props changing to re-initialize ***
    // This will cause a full chart rebuild if symbol/interval etc change via Lookup button
    }, [symbol, interval, lValue, useAdaptiveL]);

    // --- REMOVED separate Data Fetching Effect ---

    // --- Component Rendering ---
    return (
        <div style={{ position: 'relative', width: '95%', height: '650px', margin: 'auto' }}>
            {lUsed !== null && ( <div style={{ position: 'absolute', top: '10px', left: '60px', zIndex: 10, background: 'rgba(40,40,40,0.7)', color: 'orange', padding: '2px 5px', fontSize: '12px', borderRadius: '3px'}}> L: {lUsed} {useAdaptiveL ? '(Adaptive)' : ''} </div> )}
            {loading && !error && <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: 'white', background: 'rgba(0,0,0,0.5)', padding: '10px', borderRadius: '5px' }}>Loading chart data...</div>}
            {error && <div style={{ position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%, -50%)', color: 'red', background: 'rgba(0,0,0,0.7)', padding: '10px', borderRadius: '5px', zIndex: 20 }}>Error: {error}</div>}
            <div ref={chartContainerRef} style={{ width: '100%', height: '100%' }} />
        </div>
    );
};

export default TradingChart;