import React, { useEffect, useRef, useState } from 'react';
// *** CORRECTED: Import specific series types ***
import { createChart, ColorType, LineStyle, CandlestickSeries, LineSeries } from 'lightweight-charts';
// eslint-disable-next-line no-unused-vars
import { getChartData } from '../services/api'; // Assuming you still want the unused var ignored for now

const TradingChart = ({ symbol = 'BTC/USD', interval = '1day', lValue = 30, useAdaptiveL = true }) => {
    const chartContainerRef = useRef(null);
    const chartRef = useRef(null);
    const seriesRefs = useRef({});
    const resizeObserver = useRef(null); // Keep ResizeObserver logic

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [lUsed, setLUsed] = useState(null);
    const [isChartReady, setIsChartReady] = useState(false);

    // --- Chart Initialization and Cleanup (Using useEffect) ---
    useEffect(() => {
        const currentChartContainer = chartContainerRef.current; // Copy ref for cleanup
        if (!currentChartContainer) return;
        console.log("Initializing chart (Corrected addSeries)...");

        let chartInstance = null; // Use local variable

        try {
            chartInstance = createChart(currentChartContainer, {
                layout: { background: { type: ColorType.Solid, color: '#1a1a1a' }, textColor: '#d1d4dc' },
                grid: { vertLines: { color: '#2b2b43' }, horzLines: { color: '#2b2b43' } },
                timeScale: { timeVisible: true, secondsVisible: false, borderColor: '#485158' },
                rightPriceScale: { borderColor: '#485158' },
                width: currentChartContainer.clientWidth,
                height: 600,
            });
            console.log("Chart instance created.");
            chartRef.current = chartInstance;

            // Apply pane structure *before* adding series
            console.log("Applying pane structure...");
            chartInstance.applyOptions({
                panes: [ { height: 65 }, { height: 10 }, { height: 12.5 }, { height: 12.5 } ],
            });
            console.log("Pane structure applied.");


            // *** CORRECTED: Use CLASS constructors for addSeries ***
            console.log("Adding Candlestick series to pane 0...");
            seriesRefs.current.candlestick = chartInstance.addSeries(CandlestickSeries, {
                upColor: '#26a69a', downColor: '#ef5350', borderVisible: false,
                wickUpColor: '#26a69a', wickDownColor: '#ef5350',
                pane: 0,
                // Restore options from working version
                lastValueVisible: false,
                priceLineVisible: false,
            });
            console.log("Candlestick series added.");

            console.log("Adding Trend series to pane 1...");
            seriesRefs.current.trend = chartInstance.addSeries(LineSeries, {
                color: '#FF69B4', lineWidth: 2, lineStyle: LineStyle.Dashed,
                pane: 1, title: 'Trend', // Restore options
                lastValueVisible: false, priceLineVisible: false,
                priceScaleId: 'trend_scale', // Restore options
            });
            console.log("Trend series added.");

            console.log("Adding Cyclic series to pane 2...");
            seriesRefs.current.cyclic = chartInstance.addSeries(LineSeries, {
                 // color: '#FFD700', // Color comes from data
                 lineWidth: 2, pane: 2, title: 'Cyclic', // Restore options
                 lastValueVisible: false, priceLineVisible: false,
                 priceScaleId: 'cyclic_scale', // Restore options
            });
            console.log("Cyclic series added.");

            console.log("Adding Noise series to pane 3...");
            seriesRefs.current.noise = chartInstance.addSeries(LineSeries, {
                 // color: '#00BCD4', // Color comes from data
                 lineWidth: 2, pane: 3, title: 'Noise', // Restore options
                 lastValueVisible: false, priceLineVisible: false,
                 priceScaleId: 'noise_scale', // Restore options
            });
            console.log("Noise series added.");

            // Apply Price Scale Options *after* series are added
            // Ensure autoScale is true for vertical expansion
            console.log("Applying Price Scale options...");
            chartInstance.priceScale('right').applyOptions({ autoScale: true });
            chartInstance.priceScale('trend_scale').applyOptions({ autoScale: true, scaleMargins: { top: 0.9, bottom: 0.1 }, visible: false });
            chartInstance.priceScale('cyclic_scale').applyOptions({ autoScale: true, scaleMargins: { top: 0.7, bottom: 0.3 }, visible: false });
            chartInstance.priceScale('noise_scale').applyOptions({ autoScale: true, scaleMargins: { top: 0.8, bottom: 0.2 }, visible: false });
            console.log("Price Scale options applied.");


            // --- Handle Resizing (Keep corrected version) ---
            resizeObserver.current = new ResizeObserver(entries => {
                const { width, height } = entries[0].contentRect;
                if (chartRef.current) {
                     chartRef.current.applyOptions({ width, height });
                }
            });
            resizeObserver.current.observe(currentChartContainer); // Use copied ref variable

            setIsChartReady(true); // Mark ready *after* all setup
            console.log("Chart marked as ready.");


        } catch (err) { // Catch errors during create or addSeries
            console.error("!!! Error during chart init or adding series:", err);
            setError(`Failed init/series add: ${err.message}`);
            setIsChartReady(false);
            if (chartInstance && !chartRef.current) { chartInstance.remove(); }
            else if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; }
            return;
        }

        // --- Cleanup Function ---
        return () => {
             console.log("Cleaning up chart effect...");
             if (resizeObserver.current && currentChartContainer) {
                  resizeObserver.current.unobserve(currentChartContainer); // Use unobserve
             }
             if (chartRef.current) {
                 console.log("Removing chart instance...");
                 chartRef.current.remove();
             } else {
                 console.log("Cleanup: No chart instance to remove.");
             }
             chartRef.current = null;
             seriesRefs.current = {};
             setIsChartReady(false);
             console.log("Chart cleanup complete.");
        };
    }, []); // Empty dependency array

    // --- Data Fetching Effect (No changes needed) ---
    useEffect(() => {
        if (!isChartReady) { /* ... */ return; }
        // ... same data fetching logic ...
         const fetchData = async () => { /* ... */ };
         fetchData();
     }, [isChartReady, symbol, interval, lValue, useAdaptiveL]);

    // --- Component Rendering (No changes needed) ---
    return (
        <div style={{ position: 'relative', width: '95%', height: '650px', margin: 'auto' }}>
            {lUsed !== null && ( <div /* L Value Display */> L: {lUsed} {useAdaptiveL ? '(Adaptive)' : ''} </div> )}
            {loading && !error && <div /* Loading Indicator */>Loading chart data...</div>}
            {error && <div /* Error Message */>Error: {error}</div>}
            <div ref={chartContainerRef} style={{ width: '100%', height: '100%' }} />
        </div>
    );
};

export default TradingChart;