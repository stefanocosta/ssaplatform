import React, { useState } from 'react'; // Added useState
import { Link } from 'react-router-dom';
import './LandingPage.css';
import ManualModal from './ManualModal'; // Import the new component

const LandingPage = () => {
    // State to control Modal visibility
    const [showManual, setShowManual] = useState(false);

    return (
        <div className="landing-container">
            {/* --- Render Modal if state is true --- */}
            {showManual && <ManualModal onClose={() => setShowManual(false)} />}

            {/* --- Navigation Bar --- */}
            <nav className="landing-nav">
                <div className="nav-logo">SSA Trading Platform</div>
                <div className="nav-links">
                    {/* UPDATED: Manual button now works */}
                    <button 
                        className="nav-item btn-text" 
                        onClick={() => setShowManual(true)}
                    >
                        Manual
                    </button>
                    
                    <span className="nav-item disabled">FAQs (Coming Soon)</span>
                    
                    <Link to="/auth" className="nav-btn-cta">Login / Register</Link>
                </div>
            </nav>

            {/* ... Rest of your Hero, Features, Footer remains exactly the same ... */}
            <header className="hero-section">
                <div className="hero-overlay"></div>
                <div className="hero-content">
                    <h1>Master Market Cycles with <br />Mathematical Precision.</h1>
                    <p className="hero-subtext">
                        Identify low-risk mathematical "Hotspots" and actionable signals.
                        Stop guessing and start structuring your trades with state-of-the-art analysis.
                    </p>
                    <Link to="/auth" className="hero-cta-button">Get Started Now</Link>
                </div>
            </header>

            <section className="features-section">
                <div className="feature-card">
                    <h2>Mathematical "Hotspots"</h2>
                    <p>
                        Go beyond basic technical analysis. Our algorithms derive Hotspots—statistically significant zones indicating mathematical exhaustion points in price action. These serve as high-probability, low-risk areas for potential entries or exits.
                    </p>
                </div>
                <div className="feature-card">
                    <h2>Actionable Signals</h2>
                    <p>
                        Eliminate guesswork. The platform synthesizes trend, cycle, and noise components into clear, actionable signals, helping you time your execution precisely within identified Hotspots.
                    </p>
                </div>
            </section>

            <footer className="landing-footer">
                <div className="disclaimer-area">
                    <strong>Risk Disclosure & Disclaimer:</strong>
                    <p>
                        The SSA Trading Platform is an advanced analytical tool designed to identify potential mathematical entry and exit zones based on historical data analysis. It does not constitute financial, investment, or trading advice. Trading in financial markets involves a substantial risk of loss and is not suitable for every investor. All analysis, chart patterns, and signals provided are for educational and informational purposes only. Past performance is no guarantee of future results. Users are solely responsible for their own trading decisions.
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