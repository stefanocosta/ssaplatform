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
                        Stop guessing. Use <strong>Dual-System Strategies</strong> (Basic & Fast) to identify mathematical "Hotspots", 
                        scan the market in seconds, and validate performance with <strong>Real-Time Forward Testing</strong>.
                    </p>
                    <Link to="/auth" className="hero-cta-button">Start Your Free Trial</Link>
                </div>
            </header>

            {/* --- The "Why Us" Section --- */}
            <section className="impact-section">
                <h2>Physics applied to Finance.</h2>
                <p>
                    Standard indicators lag. We don't. By using <strong>Singular Spectrum Analysis (SSA)</strong>, our platform decomposes price into 
                    Trend, Cycle, and Noise components in real-time, adapting to the market as it moves.
                </p>
            </section>

            {/* --- Features Grid --- */}
            <section className="features-section">
                <div className="feature-card">
                    <h3>⚡ Dual Strategy Engines</h3>
                    <p>
                        Choose your edge. Use the <strong>Basic System</strong> for high-probability Mean Reversion swings, 
                        or switch to the <strong>Fast System</strong> for rapid momentum scalping based on noise exhaustion patterns.
                    </p>
                </div>
                
                <div className="feature-card">
                    <h3>📈 Live Forward Testing</h3>
                    <p>
                        Transparency is key. Our server simulates a live trading bot 24/7. View real-time equity curves, 
                        win-rates, and performers for every strategy and timeframe. No hindsight bias—just raw data.
                    </p>
                </div>

                <div className="feature-card">
                    <h3>🚀 Intelligent Scanner</h3>
                    <p>
                        Don't waste time flipping through charts. Scan the entire market in milliseconds to find 
                        assets matching your selected strategy. Filter by Trend direction, Cycle position, and Forecast.
                    </p>
                </div>

                <div className="feature-card">
                    <h3>🧠 Deep Context Analysis</h3>
                    <p>
                        Get an instant AI-like breakdown of any asset. Our Deep Analysis engine checks 
                        <strong>Multi-Timeframe Alignment</strong> (e.g., 1H vs 4H), calculates signal age, and generates actionable strategic advice.
                    </p>
                </div>
            </section>

            {/* --- Footer --- */}
            <footer className="landing-footer">
                <div className="disclaimer-area">
                    <strong>Risk Disclosure & Disclaimer:</strong>
                    <p>
                        The SSA Trading Platform is an advanced analytical tool designed to identify potential mathematical entry and exit zones 
                        based on historical data analysis. It does not constitute financial, investment, or trading advice. Trading in financial 
                        markets involves a substantial risk of loss and is not suitable for every investor. All analysis, chart patterns, 
                        and signals provided are for educational and informational purposes only. Past performance is no guarantee of future results. 
                        Users are solely responsible for their own trading decisions.
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