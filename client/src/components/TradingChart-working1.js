import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, CandlestickSeries, LineSeries } from 'lightweight-charts';
// eslint-disable-next-line no-unused-vars
import { getChartData } from '../services/api';

const TradingChart = ({ symbol = 'BTC/USD', interval = '1day', lValue = 30, useAdaptiveL = true }) => {
    const mainChartRef = useRef(null);
    const cyclicChartRef = useRef(null);
    const noiseChartRef = useRef(null);
    
    const mainChartInstance = useRef(null);
    const cyclicChartInstance = useRef(null);
    const noiseChartInstance = useRef(null);
    
    const seriesRefs = useRef({});
    
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [lUsed, setLUsed] = useState(null);

    useEffect(() => {
        const mainContainer = mainChartRef.current;
        const cyclicContainer = cyclicChartRef.current;
        const noiseContainer = noiseChartRef.current;
        
        if (!mainContainer || !cyclicContainer || !noiseContainer) return;
        
        console.log("Setting up charts...");

        const fetchData = async () => {
            if (!mainChartInstance.current || !cyclicChartInstance.current || !noiseChartInstance.current) {
                console.warn("Chart instances missing, cannot fetch.");
                setError("Chart initialization failed before data fetch.");
                setLoading(false);
                return;
            }
            
            console.log("Fetching data...");
            setLoading(true); 
            setError(null); 
            setLUsed(null);

            try {
                const data = await getChartData(symbol, interval, lValue, useAdaptiveL);
                console.log("Data received:", data);

                if (data && data.ohlc && data.ssa) {
                    if (data.ohlc.length === 0) {
                        setError("Received empty OHLC data.");
                    } else {
                        // Set data for main chart (candlesticks and trend)
                        seriesRefs.current.candlestick?.setData(data.ohlc);
                        seriesRefs.current.trend?.setData(data.ssa.trend || []);
                        
                        // Set data for cyclic chart
                        seriesRefs.current.cyclic?.setData(data.ssa.cyclic || []);
                        
                        // Set data for noise chart
                        seriesRefs.current.noise?.setData(data.ssa.noise || []);
                        
                        setLUsed(data.l_used);
                        
                        // Fit content on all charts
                        mainChartInstance.current.timeScale().fitContent();
                        cyclicChartInstance.current.timeScale().fitContent();
                        noiseChartInstance.current.timeScale().fitContent();
                    }
                } else {
                    setError("Received invalid data structure from backend.");
                }
            } catch (err) {
                console.error("Error fetching data:", err);
                setError(err.message || "Failed to fetch chart data.");
            } finally {
                setLoading(false);
            }
        };

        try {
            // Common chart options
            const commonOptions = {
                layout: { 
                    background: { type: ColorType.Solid, color: '#1a1a1a' }, 
                    textColor: '#d1d4dc' 
                },
                grid: { 
                    vertLines: { color: '#2b2b43' }, 
                    horzLines: { color: '#2b2b43' } 
                },
                timeScale: { 
                    timeVisible: true, 
                    secondsVisible: false, 
                    borderColor: '#485158',
                    visible: true
                },
                rightPriceScale: { 
                    borderColor: '#485158' 
                },
                width: mainContainer.clientWidth,
            };

            // Create MAIN chart (price + trend)
            console.log("Creating main chart...");
            mainChartInstance.current = createChart(mainContainer, {
                ...commonOptions,
                height: 400,
            });

            // Set logarithmic scale for the main price chart
            mainChartInstance.current.priceScale('right').applyOptions({
                mode: 1, // 0 = Normal, 1 = Logarithmic, 2 = Percentage, 3 = IndexedTo100
            });

            seriesRefs.current.candlestick = mainChartInstance.current.addSeries(CandlestickSeries, { 
                upColor: '#26a69a',
                downColor: '#ef5350',
                borderVisible: false,
                wickUpColor: '#26a69a',
                wickDownColor: '#ef5350'
            });

            seriesRefs.current.trend = mainChartInstance.current.addSeries(LineSeries, { 
                color: '#2962FF',
                lineWidth: 2,
                priceLineVisible: false,
                lastValueVisible: true
            });

            // Create CYCLIC chart
            console.log("Creating cyclic chart...");
            cyclicChartInstance.current = createChart(cyclicContainer, {
                ...commonOptions,
                height: 120,
                timeScale: {
                    ...commonOptions.timeScale,
                    visible: false // Hide time scale for indicator charts
                }
            });

            seriesRefs.current.cyclic = cyclicChartInstance.current.addSeries(LineSeries, { 
                color: '#FF6D00',
                lineWidth: 2,
                priceLineVisible: false,
                lastValueVisible: true
            });

            // Create NOISE chart
            console.log("Creating noise chart...");
            noiseChartInstance.current = createChart(noiseContainer, {
                ...commonOptions,
                height: 120,
            });

            seriesRefs.current.noise = noiseChartInstance.current.addSeries(LineSeries, { 
                color: '#9C27B0',
                lineWidth: 2,
                priceLineVisible: false,
                lastValueVisible: true
            });

            // Synchronize crosshair movement across all charts
            const syncCrosshair = (chart, series, point) => {
                if (!point) {
                    chart.clearCrosshairPosition();
                    return;
                }
                chart.setCrosshairPosition(point.value, point.time, series);
            };

            // Subscribe to crosshair moves
            mainChartInstance.current.subscribeCrosshairMove((param) => {
                if (!param || !param.time) {
                    cyclicChartInstance.current?.clearCrosshairPosition();
                    noiseChartInstance.current?.clearCrosshairPosition();
                    return;
                }
                
                const cyclicData = param.seriesData.get(seriesRefs.current.cyclic);
                const noiseData = param.seriesData.get(seriesRefs.current.noise);
                
                if (cyclicData) syncCrosshair(cyclicChartInstance.current, seriesRefs.current.cyclic, cyclicData);
                if (noiseData) syncCrosshair(noiseChartInstance.current, seriesRefs.current.noise, noiseData);
            });

            // Synchronize visible time range across all charts
            mainChartInstance.current.timeScale().subscribeVisibleLogicalRangeChange((logicalRange) => {
                cyclicChartInstance.current?.timeScale().setVisibleLogicalRange(logicalRange);
                noiseChartInstance.current?.timeScale().setVisibleLogicalRange(logicalRange);
            });

            // Handle window resize
            const handleResize = () => {
                const width = mainContainer.clientWidth;
                mainChartInstance.current?.applyOptions({ width });
                cyclicChartInstance.current?.applyOptions({ width });
                noiseChartInstance.current?.applyOptions({ width });
            };

            window.addEventListener('resize', handleResize);

            console.log("Charts setup complete. Fetching data...");
            fetchData();

            return () => {
                console.log("Cleanup...");
                window.removeEventListener('resize', handleResize);
                mainChartInstance.current?.remove();
                cyclicChartInstance.current?.remove();
                noiseChartInstance.current?.remove();
                mainChartInstance.current = null;
                cyclicChartInstance.current = null;
                noiseChartInstance.current = null;
                seriesRefs.current = {};
            };

        } catch (err) {
            console.error("Error during chart setup:", err);
            setError(`Init Error: ${err.message}`);
            setLoading(false);
        }

    }, [symbol, interval, lValue, useAdaptiveL]);

    return (
        <div style={{ position: 'relative', width: '95%', margin: 'auto' }}>
            {lUsed !== null && ( 
                <div style={{ 
                    position: 'absolute', 
                    top: '10px', 
                    left: '60px', 
                    zIndex: 10, 
                    background: 'rgba(40,40,40,0.7)', 
                    color: 'orange', 
                    padding: '2px 5px', 
                    fontSize: '12px', 
                    borderRadius: '3px'
                }}> 
                    L: {lUsed} {useAdaptiveL ? '(Adaptive)' : ''} 
                </div> 
            )}
            {loading && !error && (
                <div style={{ 
                    position: 'absolute', 
                    top: '50%', 
                    left: '50%', 
                    transform: 'translate(-50%, -50%)', 
                    color: 'white', 
                    background: 'rgba(0,0,0,0.5)', 
                    padding: '10px', 
                    borderRadius: '5px',
                    zIndex: 100
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
                    zIndex: 100 
                }}>
                    Error: {error}
                </div>
            )}
            
            {/* Main Price Chart */}
            <div style={{ marginBottom: '2px' }}>
                <div style={{ 
                    fontSize: '11px', 
                    color: '#888', 
                    padding: '2px 5px',
                    background: '#1a1a1a'
                }}>
                    Price & Trend
                </div>
                <div ref={mainChartRef} style={{ width: '100%' }} />
            </div>
            
            {/* Cyclic Indicator Chart */}
            <div style={{ marginBottom: '2px' }}>
                <div style={{ 
                    fontSize: '11px', 
                    color: '#FF6D00', 
                    padding: '2px 5px',
                    background: '#1a1a1a'
                }}>
                    Cyclic Component
                </div>
                <div ref={cyclicChartRef} style={{ width: '100%' }} />
            </div>
            
            {/* Noise Indicator Chart */}
            <div>
                <div style={{ 
                    fontSize: '11px', 
                    color: '#9C27B0', 
                    padding: '2px 5px',
                    background: '#1a1a1a'
                }}>
                    Noise Component
                </div>
                <div ref={noiseChartRef} style={{ width: '100%' }} />
            </div>
        </div>
    );
};

export default TradingChart;