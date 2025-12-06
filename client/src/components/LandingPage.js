import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import './LandingPage.css';
import ManualModal from './ManualModal'; 

const LandingPage = () => {
    const [showManual, setShowManual] = useState(false);

    return (
        <div className="landing-container">
            {showManual && <ManualModal onClose={() => setShowManual(false)} />}

            {/* --- Navigation Bar --- */}
            <nav className="landing-nav">
                <div className="nav-logo">SSA Trading Platform</div>
                <div className="nav-links">
                    <button className="nav-item btn-text" onClick={() => setShowManual(true)}>Manual</button>
                    <Link to="/auth" className="nav-btn-cta">Login / Register</Link>
                </div>
            </nav>

            {/* --- Hero Section --- */}
            <header className="hero-section">
                <div className="hero-overlay"></div>
                <div className="hero-content">
                    <h1>Master Market Cycles with <br /><span className="text-gradient">Mathematical Precision</span></h1>
                    <p className="hero-subtext">
                        Stop guessing with lagging indicators. 
                        Identify mathematical "Hotspots" and actionable signals, scan the entire market in seconds, 
                        and forecast price action with state-of-the-art spectral analysis.
                    </p>
                    <Link to="/auth" className="hero-cta-button">Start Your Free Trial</Link>
                </div>
            </header>

            {/* --- The "Why Us" Section (Revolutionary Impact) --- */}
            <section className="impact-section">
                <h2>This is not another RSI. This is Physics applied to Finance.</h2>
                <p>
                    Standard indicators lag. We don't. By using <strong>Singular Spectrum Analysis (SSA)</strong>, our platform decomposes price into 
                    Trend, Cycle, and Noise components in real-time. It adapts to the market as it moves, 
                    giving you the "True Signal" hidden in the noise.
                </p>
            </section>

            {/* --- Features Grid --- */}
            <section className="features-section">
                <div className="feature-card">
                    <h3>🎯 Pinpoint Signals</h3>
                    <p>
                        Our algorithms derive "Hotspots"—statistically significant zones where Trend, Cycle, and Price diverge. 
                        Get clear Buy/Sell signals based on mathematical exhaustion, not gut feeling.
                    </p>
                </div>
                
                <div className="feature-card">
                    <h3>🚀 Market Scanner</h3>
                    <p>
                        Don't waste time flipping through charts. Scan the entire market in milliseconds to find 
                        assets that are mathematically primed for a move. Filter by Trend direction, 
                        Cyclic position, and Forecast.
                    </p>
                </div>

                <div className="feature-card">
                    <h3>🔮 Predictive Forecast</h3>
                    <p>
                        See what's next. Our proprietary engine projects the SSA components forward 
                        in time, giving you a probabilistic roadmap of where the Cycle and Trend are heading 
                        over the next 20 bars.
                    </p>
                </div>

                <div className="feature-card">
                    <h3>🧠 Deep Analysis</h3>
                    <p>
                        Need a second opinion? Click "Analyze" for an instant, AI-like breakdown of the asset. 
                        Get actionable recommendations, trend context, and profit-taking warnings based on 
                        the current Fast Cycle velocity.
                    </p>
                </div>
            </section>

            {/* --- Footer --- */}
            <footer className="landing-footer">
                <div className="disclaimer-area">
                    <strong>Risk Disclosure & Disclaimer:</strong>
                    <p>
                        The SSA Trading Platform is an advanced analytical tool designed to identify potential mathematical entry and exit zones based on historical data analysis. It does not constitute financial, investment, or trading advice. Trading in financial markets involves a substantial risk of loss and is not suitable for every investor. All analysis, chart patterns, and signals provided are for educational and informational purposes only. Past performance is no guarantee of future results.
                    </p>
                </div>
                <div className="copyright">
                    © {new Date().getFullYear()} SSA Trading Platform. All rights reserved.
                </div>
            </footer>
        </div>
    );
};

export default LandingPage;