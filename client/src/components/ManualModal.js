import React from 'react';
// We don't need a specific CSS file here as it inherits from parent pages, 
// but inline styles ensure specific colors render correctly.

const ManualModal = ({ onClose }) => {
    return (
        /* NOTE: The CSS classes 'modal-overlay', 'modal-content', etc., 
           must exist in LandingPage.css (which is loaded globally or by the parent).
        */
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
                            <strong>Visualizing the Data:</strong> The dotted line on the main chart is the Cycle superimposed on the Trend. The bottom panel shows the <em>same</em> Cycle but "Detrended" (flattened against a zero line). The Zero Line in the bottom panel represents the Trend itself.
                        </p>
                        <ul>
                            <li><strong>Below Zero (<span style={{color: '#00c853'}}>Green</span>/<span style={{color: '#b2ff59'}}>Lime</span>):</strong> Price is below the Trend (Potential value area).</li>
                            <li><strong>Above Zero (<span style={{color: '#ff3d00'}}>Red</span>/<span style={{color: '#ffab00'}}>Orange</span>):</strong> Price is above the Trend (Potential overextended area).</li>
                        </ul>
                    </section>

                    <section>
                        <h3>3. Mathematical "Hotspots" (Oversold/Overbought)</h3>
                        <p>
                            Hotspots are not random; they are mathematical areas where Price, Cycle, and Trend diverge significantly, indicating exhaustion.
                        </p>
                        <div className="manual-grid">
                            <div>
                                <h4>Buying Zones (Oversold)</h4>
                                <ul>
                                    <li><strong>Condition:</strong> Price &lt; Cyclic &lt; Trend.</li>
                                    <li><strong style={{color: '#00c853'}}>Green Hotspot:</strong> Strong buy zone in a rising trend.</li>
                                    <li><strong style={{color: '#b2ff59'}}>Lime Hotspot:</strong> Counter-trend buy zone.</li>
                                </ul>
                            </div>
                            <div>
                                <h4>Selling Zones (Overbought)</h4>
                                <ul>
                                    <li><strong>Condition:</strong> Price &gt; Cyclic &gt; Trend.</li>
                                    <li><strong style={{color: '#ff3d00'}}>Red Hotspot:</strong> Trend is Falling. High probability Short entry.</li>
                                    <li><strong style={{color: '#ffab00'}}>Orange Hotspot:</strong> Trend is Rising. Indicates "Take Profit" rather than a direct Short.</li>
                                </ul>
                            </div>
                        </div>
                    </section>

                    <section>
                        <h3>4. Pinpoint Signals</h3>
                        <p>
                            The "S" (Signal) markers are the culmination of our algorithm. They generate a signal only when:
                        </p>
                        <ol>
                            <li>Price enters a mathematical <strong>Hotspot</strong>.</li>
                            <li>The <strong>Cyclic</strong> component reaches an extreme.</li>
                            <li>The <strong>Fast Cyclic (Noise)</strong> confirms a reversal trigger.</li>
                        </ol>
                        <p>This filters out premature entries, providing pinpoint precision for Low Risk / High Reward setups.</p>
                    </section>

                    <section>
                        <h3>5. The Forecast & Adaptability</h3>
                        <p>
                            <strong>The Forecast:</strong> Using a proprietary algorithm combining SSA decomposition with Fast Fourier Transform (FFT) forward projection, we mathematically project the likely path of the Trend and Cycle.
                        </p>
                        <p>
                            <strong>Unique Adaptability:</strong> The SSA Trading Platform is <em>Adaptive</em>. It recalculates the math with every new data point. You may notice recent signals shifting slightly as the market evolves. <br/>
                            <em>This is not a defect; it is a feature.</em> It provides you with the most accurate mathematical representation of the market's <strong>current</strong> intent, rather than locking in a past calculation that is no longer valid.
                        </p>
                    </section>

                    <section>
                        <h3>6. The Market Scanner</h3>
                        <p>
                            The Scanner automates the search for opportunities. Instead of manually checking every asset, the Scanner analyzes the entire asset list in seconds.
                        </p>
                        <ul>
                            <li><strong>Trend Column:</strong> Indicates the current slope of the Zero-Lag Trend. 
                                (<span style={{color: '#00c853'}}>Up Arrow</span> = Bullish, <span style={{color: '#ff3d00'}}>Down Arrow</span> = Bearish).
                            </li>
                            <li>
                                <strong>Cycle % & Fast %:</strong> These percentages show the component's position relative to its historical range.
                                <ul>
                                    <li><strong>0%</strong> = Historical Support (Valley).</li>
                                    <li><strong>100%</strong> = Historical Resistance (Peak).</li>
                                    <li><span style={{color: '#00c853'}}><strong>Green (&lt; 20%):</strong></span> The cycle is bottoming out (Oversold).</li>
                                    <li><span style={{color: '#ff3d00'}}><strong>Red (&gt; 80%):</strong></span> The cycle is topping out (Overbought).</li>
                                    <li><em>Note: Values can exceed 100% (strong overbought) or drop below 0% (strong oversold).</em></li>
                                </ul>
                            </li>
                            <li><strong>Signal Column:</strong> Only appears if a valid "Pinpoint Signal" (Section 4) is detected on the current bar.</li>
                        </ul>
                    </section>

                    <section>
                        <h3>7. Controls & Timeframes</h3>
                        <ul>
                            <li><strong>Auto Checkbox:</strong> When enabled, the platform connects to our server to pull 1-minute updates, refreshing the calculations in real-time.</li>
                            <li><strong>Investors:</strong> Focus on <strong>Weekly</strong> and <strong>Daily</strong> charts for macro-cycle positioning.</li>
                            <li><strong>Traders:</strong> Use <strong>4H</strong> and <strong>1H</strong> for swing trading, or lower timeframes for precision intraday entries.</li>
                        </ul>
                    </section>

                    {/* --- NEW SECTION: DISCLAIMER --- */}
                    <section style={{marginTop: '30px', borderTop: '1px solid #444', paddingTop: '20px', opacity: 0.8}}>
                        <h3>8. Risk Disclosure & Disclaimer</h3>
                        <p style={{fontSize: '0.85rem', lineHeight: '1.4'}}>
                            The SSA Trading Platform is an advanced analytical tool designed to identify potential mathematical entry and exit zones based on historical data analysis. It does not constitute financial, investment, or trading advice. Trading in financial markets involves a substantial risk of loss and is not suitable for every investor. All analysis, chart patterns, and signals provided are for educational and informational purposes only. Past performance is no guarantee of future results. Users are solely responsible for their own trading decisions.
                        </p>
                    </section>
                </div>
            </div>
        </div>
    );
};

export default ManualModal;