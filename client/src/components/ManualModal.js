import React from 'react';

const ManualModal = ({ onClose }) => {
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <button className="modal-close-btn" onClick={onClose}>&times;</button>
                
                <div className="manual-header">
                    <h2>Platform Manual & Strategy Guide</h2>
                    <p>The Science of Adaptive Spectral Analysis</p>
                </div>

                <div className="manual-body">
                    <section>
                        <h3>1. The Zero-Lag Trend (The Backbone)</h3>
                        <p>
                            Unlike traditional Moving Averages which lag behind price, our <strong>SSA Trend Line</strong> is mathematically derived to offer zero-lag tracking of the dominant market direction.
                        </p>
                        <ul>
                            <li><strong style={{color: '#00c853'}}>Green Trend:</strong> The underlying market structure is Bullish (Rising).</li>
                            <li><strong style={{color: '#ff3d00'}}>Red Trend:</strong> The underlying market structure is Bearish (Falling).</li>
                        </ul>
                    </section>

                    <section>
                        <h3>2. The Cyclic Component & Sub-Panel</h3>
                        <p>
                            Markets move in waves. The <strong>Cyclic Component</strong> isolates these oscillations from the trend.
                        </p>
                        <p>
                            <strong>Visualizing the Data:</strong> The dotted line on the main chart is the Cycle superimposed on the Trend. The bottom panel shows the <em>same</em> Cycle but "Detrended" (flattened against a zero line).
                        </p>
                        <ul>
                            <li><strong>Below Zero (<span style={{color: '#00c853'}}>Green</span>/<span style={{color: '#b2ff59'}}>Lime</span>):</strong> Price is below the Trend (Potential value area).</li>
                            <li><strong>Above Zero (<span style={{color: '#ff3d00'}}>Red</span>/<span style={{color: '#ffab00'}}>Orange</span>):</strong> Price is above the Trend (Potential overextended area).</li>
                        </ul>
                    </section>

                    <section>
                        <h3>3. Mathematical "Hotspots"</h3>
                        <p>
                            Hotspots are not random; they are mathematical areas where Price, Cycle, and Trend diverge significantly.
                        </p>
                        <ul>
                            <li><strong style={{color: '#00c853'}}>Green Hotspot:</strong> Strong buy zone in a rising trend (Oversold).</li>
                            <li><strong style={{color: '#ff3d00'}}>Red Hotspot:</strong> High probability Short entry (Overbought).</li>
                            <li><strong style={{color: '#ffab00'}}>Orange/Lime:</strong> Counter-trend or Take-Profit zones.</li>
                        </ul>
                    </section>

                    {/* --- UPDATED SECTION 4 --- */}
                    <section>
                        <h3>4. Strategy Engines & The "Fast Cycle"</h3>
                        <p>
                            The platform now includes three distinct algorithmic engines. To understand them, you must understand the <strong>Fast Cycle</strong>:
                        </p>
                        <p style={{fontSize:'0.9rem', fontStyle:'italic', color:'#aaa', borderLeft:'3px solid #00bcd4', paddingLeft:'10px', marginBottom:'15px'}}>
                            <strong>What is the Fast Cycle?</strong><br/>
                            It is the high-frequency heartbeat of the market. Derived from Time Series Decomposition, it isolates the faster wave components that drive short-term price action, filtering out the slower, longer-term trend.
                        </p>

                        <div className="manual-grid" style={{gridTemplateColumns: '1fr 1fr 1fr', gap:'10px'}}>
                            <div style={{background:'rgba(255,255,255,0.05)', padding:'10px', borderRadius:'6px'}}>
                                <h4 style={{color:'#00bcd4', borderBottom:'1px solid #444', paddingBottom:'5px'}}>BASIC</h4>
                                <p style={{fontSize:'0.8rem', marginTop:'5px'}}>
                                    <strong>Multi-Entry Swing.</strong><br/>
                                    Waits for major deviations (Hotspots). It can trigger <em>multiple entries</em> within the same Fast Cycle oscillation if the price continues to offer better value.
                                    <br/><br/><span style={{color:'#aaa'}}>Best for: Accumulating positions.</span>
                                </p>
                            </div>

                            <div style={{background:'rgba(255,255,255,0.05)', padding:'10px', borderRadius:'6px'}}>
                                <h4 style={{color:'#ff9800', borderBottom:'1px solid #444', paddingBottom:'5px'}}>BASIC (S)</h4>
                                <p style={{fontSize:'0.8rem', marginTop:'5px'}}>
                                    <strong>Single-Entry Precision.</strong><br/>
                                    Identical logic to Basic, but stricter: it allows only <strong>ONE entry</strong> per Fast Cycle wave. It waits for the <em>optimal</em> synchronization point before firing.
                                    <br/><br/><span style={{color:'#aaa'}}>Best for: Sniper entries, less drawdown.</span>
                                </p>
                            </div>

                            <div style={{background:'rgba(255,255,255,0.05)', padding:'10px', borderRadius:'6px'}}>
                                <h4 style={{color:'#e040fb', borderBottom:'1px solid #444', paddingBottom:'5px'}}>FAST</h4>
                                <p style={{fontSize:'0.8rem', marginTop:'5px'}}>
                                    <strong>Momentum Scalp.</strong><br/>
                                    Analyzes the derivative (rate of change) of the "Noise" component. Detects rapid zero-line reversals and 5-bar exhaustion patterns.
                                    <br/><br/><span style={{color:'#aaa'}}>Best for: High volatility assets.</span>
                                </p>
                            </div>
                        </div>
                    </section>

                    <section>
                        <h3>5. The Market Scanner</h3>
                        <p>
                            The Scanner automates the search for opportunities based on your <strong>Selected Strategy</strong> (Basic, Basic S, or Fast).
                        </p>
                        <ul>
                            <li><strong>Trend & Forecast:</strong> Instant direction arrows based on SSA projection.</li>
                            <li><strong>Cycle %:</strong> Shows how "stretched" the current price is (0% = Bottom, 100% = Top).</li>
                            <li><strong>New Signals Only:</strong> Use the filter checkbox to see only assets triggering an entry <em>right now</em>.</li>
                        </ul>
                    </section>

                    <section>
                        <h3>6. Deep Analysis & Multi-Timeframe</h3>
                        <p>
                            Clicking "DA" performs a comprehensive health check on the asset.
                        </p>
                        <ul>
                            <li><strong>Multi-Timeframe Context:</strong> The new "Context Ribbon" instantly shows the Trade Status and Cycle direction of higher timeframes (e.g., viewing 1H shows 4H and Daily context).</li>
                            <li><strong>Smart Recommendations:</strong> The engine generates text advice, warning you if a trade is Counter-Trend or if the Fast Cycle suggests profit-taking.</li>
                            <li><strong>Deep Wave Lab:</strong> A dedicated environment to visualize the raw harmonic waves and synchronization bands.</li>
                        </ul>
                    </section>

                    <section>
                        <h3>7. Real-Time Forward Testing</h3>
                        <p>
                            We do not rely on standard backtests. This is a <strong>Real-Time Simulation</strong> designed to provide the most sincere validation of the trading strategies.
                        </p>
                        <p>
                            Unlike standard backtests which can be curve-fitted to past data, this system acts as a <strong>Live Trading Bot</strong>:
                        </p>
                        <ul>
                            <li>It monitors the portfolio 24/7 across multiple timeframes (15m, 1h, 4h).</li>
                            <li>It executes a trade immediately whenever the <strong>Trend, Cycle, and Fast Wave</strong> components align to trigger a signal.</li>
                            <li>It tracks the trade until the signal reverses, exactly as a human trader would be instructed to do.</li>
                        </ul>
                        <p>
                            <strong>Why this matters:</strong> This builds a track record "forward" in time. What you see here is exactly how the algorithm performs in live market conditions, with no hindsight bias.
                        </p>
                    </section>

                    <section style={{marginTop: '30px', borderTop: '1px solid #444', paddingTop: '20px', opacity: 0.8}}>
                        <h3>8. Risk Disclosure</h3>
                        <p style={{fontSize: '0.85rem', lineHeight: '1.4'}}>
                            The SSA Trading Platform is an advanced analytical tool designed to identify potential mathematical entry and exit zones based on historical data analysis. 
                            It does not constitute financial, investment, or trading advice. Trading in financial markets involves a substantial risk of loss and 
                            is not suitable for every investor. All analysis, chart patterns, and signals provided are for educational and informational purposes only. 
                            Past performance is no guarantee of future results. Users are solely responsible for their own trading decisions.
                        </p>
                    </section>
                </div>
            </div>
        </div>
    );
};

export default ManualModal;