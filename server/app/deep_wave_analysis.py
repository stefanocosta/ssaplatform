import sys
import os
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from scipy.linalg import hankel, svd

# Ensure we can import from the app
sys.path.append(os.getcwd())

from app import create_app, db
from app.models import MarketData

# --- CONFIGURATION ---
TARGET_ASSET = "BTC/USD"  # The asset to analyze
TARGET_INTERVAL = "1day"  # Timeframe
L_WINDOW = 39             # Your fixed embedding dimension
ANALYSIS_LENGTH = 500     # How much history to analyze (N)

# Set style for professional charts
plt.style.use('bmh')
sns.set_theme(style="darkgrid")

class DeepSSA:
    """
    A self-contained SSA class for Deep Diagnostics.
    We re-implement the math here to ensure we have access to
    Eigenvalues (Sigma) and Elementary Matrices which usually aren't exposed.
    """
    def __init__(self, series, L):
        self.series = np.array(series)
        self.N = len(self.series)
        self.L = L
        self.K = self.N - self.L + 1
        self.X_traj = None
        self.U = None
        self.Sigma = None
        self.VT = None
        self.eigenvalues = None
        self.contributions = None
        
        # Run SVD immediately
        self._embed()
        self._decompose()

    def _embed(self):
        """Step 1: Embedding (Trajectory Matrix)"""
        self.X_traj = hankel(self.series[:self.L], self.series[self.L-1:])
        # Verify shape (L x K)
        
    def _decompose(self):
        """Step 2: Decomposition (SVD)"""
        # X = U * Sigma * V.T
        self.U, self.Sigma, self.VT = svd(self.X_traj)
        
        # Calculate Eigenvalues (Power)
        # Eigenvalues lambda_i = s_i^2
        self.eigenvalues = self.Sigma ** 2
        
        # Calculate Relative Contribution (%)
        total_power = np.sum(self.eigenvalues)
        self.contributions = (self.eigenvalues / total_power) * 100

    def get_component_series(self, indices):
        """
        Reconstruct specific components using Diagonal Averaging
        """
        # Elementary matrices reconstruction
        X_elem = np.zeros_like(self.X_traj)
        for i in indices:
            # X_i = s_i * u_i * v_i.T
            X_i = self.Sigma[i] * np.outer(self.U[:, i], self.VT[i, :])
            X_elem += X_i
            
        # Diagonal Averaging (Hankelization)
        # Quick method for diagonal averaging of a matrix to get a series
        rev_X = X_elem[::-1]
        reconstructed = [rev_X.diagonal(i).mean() for i in range(-rev_X.shape[0]+1, rev_X.shape[1])]
        return np.array(reconstructed)

    def w_correlation(self, num_components=20):
        """
        Calculates the W-Correlation matrix.
        High values (Red) indicate components that are 'separable' or distinct.
        """
        # Reconstruct the first N components individually
        components = [self.get_component_series([i]) for i in range(num_components)]
        n = len(components)
        w_corr = np.zeros((n, n))
        
        # Weights for W-Correlation
        L_star = min(self.L, self.K)
        K_star = max(self.L, self.K)
        w = np.concatenate([
            np.arange(1, L_star + 1),
            np.full(K_star - L_star, L_star),
            np.arange(L_star - 1, 0, -1)
        ])

        # Compute weighted inner products
        for i in range(n):
            for j in range(i, n):
                F1 = components[i]
                F2 = components[j]
                norm_F1 = np.sqrt(np.sum(w * F1**2))
                norm_F2 = np.sqrt(np.sum(w * F2**2))
                inner_prod = np.sum(w * F1 * F2)
                
                corr = abs(inner_prod) / (norm_F1 * norm_F2)
                w_corr[i, j] = corr
                w_corr[j, i] = corr
                
        return w_corr

def run_deep_analysis():
    app = create_app()
    with app.app_context():
        print(f"🔬 Starting Deep Wave Analysis for {TARGET_ASSET}...")
        
        # 1. Fetch Data
        candles = MarketData.query.filter_by(
            symbol=TARGET_ASSET, 
            interval=TARGET_INTERVAL
        ).order_by(MarketData.time.desc()).limit(ANALYSIS_LENGTH).all()
        
        # Reverse to get chronological order (Old -> New)
        candles = candles[::-1]
        
        if len(candles) < L_WINDOW * 2:
            print("❌ Not enough data for analysis.")
            return

        closes = np.array([c.close for c in candles], dtype=float)
        dates = [c.time for c in candles]
        
        # 2. Run SSA
        print("🧮 Decomposing Signal...")
        ssa = DeepSSA(closes, L_WINDOW)
        
        # --- PLOTTING ---
        fig = plt.figure(figsize=(18, 12))
        plt.suptitle(f"SSA Deep Wave Analysis: {TARGET_ASSET} (L={L_WINDOW})", fontsize=16, fontweight='bold')
        
        # CHART 1: Scree Plot (The Histogram of Strength)
        ax1 = plt.subplot2grid((2, 3), (0, 0), colspan=2)
        indices = np.arange(L_WINDOW)
        
        # Color logic: Trend (0) = Red, Cycles (1-9) = Green, Noise (10+) = Grey
        colors = ['#d32f2f'] + ['#388e3c'] * 9 + ['#757575'] * (L_WINDOW - 10)
        
        bars = ax1.bar(indices, ssa.contributions, color=colors, alpha=0.8)
        
        # Add labels for top components
        for i, v in enumerate(ssa.contributions):
            if v > 1.0: # Only label meaningful ones
                ax1.text(i, v + 0.5, f"{v:.1f}%", ha='center', fontsize=9, fontweight='bold')
                
        ax1.set_title("Component Relative Strength (Scree Plot)", fontsize=12)
        ax1.set_xlabel("Component Index")
        ax1.set_ylabel("Contribution to Variance (%)")
        ax1.set_xlim(-1, 20) # Zoom in on the first 20 components
        
        # Legend
        from matplotlib.patches import Patch
        legend_elements = [
            Patch(facecolor='#d32f2f', label='Trend (Comp 0)'),
            Patch(facecolor='#388e3c', label='Dominant Cycles'),
            Patch(facecolor='#757575', label='Noise Floor')
        ]
        ax1.legend(handles=legend_elements)

        # CHART 2: Cumulative Energy
        ax2 = plt.subplot2grid((2, 3), (0, 2))
        cumulative = np.cumsum(ssa.contributions)
        ax2.plot(indices, cumulative, marker='o', color='#1976d2', linewidth=2, markersize=4)
        ax2.axhline(95, color='r', linestyle='--', alpha=0.5, label='95% Threshold')
        ax2.set_title("Cumulative Signal Energy", fontsize=12)
        ax2.set_xlabel("Number of Components")
        ax2.set_ylabel("Total Explained Variance (%)")
        ax2.legend()
        
        # CHART 3: W-Correlation Matrix (Signal Separability)
        # This shows which components are grouped. 
        # Bright squares off the diagonal indicate paired cycles (Sine/Cosine)
        print("🔍 Calculating W-Correlation Matrix (This separates Signal from Noise)...")
        ax3 = plt.subplot2grid((2, 3), (1, 0))
        w_corr_matrix = ssa.w_correlation(num_components=20)
        sns.heatmap(w_corr_matrix, ax=ax3, cmap="gray_r", vmin=0, vmax=1, square=True, cbar=False)
        ax3.set_title("W-Correlation Matrix (Clustering)", fontsize=12)
        ax3.set_xlabel("Component Index")
        ax3.set_ylabel("Component Index")
        
        # CHART 4: Top Reconstructed Components
        ax4 = plt.subplot2grid((2, 3), (1, 1), colspan=2)
        
        # Reconstruct interesting parts
        trend = ssa.get_component_series([0])
        cycle_1 = ssa.get_component_series([1, 2]) # Usually the first pair
        cycle_2 = ssa.get_component_series([3, 4]) # Usually the second pair
        
        # Normalize for comparison
        norm_close = (closes - np.mean(closes))
        norm_trend = (trend - np.mean(trend))
        
        ax4.plot(norm_close, color='black', alpha=0.2, label='Original (Detrended)')
        ax4.plot(cycle_1, color='#388e3c', linewidth=1.5, label=f'Cycle 1 (Comp 1-2)')
        ax4.plot(cycle_2, color='#fbc02d', linewidth=1.5, label=f'Cycle 2 (Comp 3-4)')
        
        ax4.set_title("Dominant Cycles Reconstruction", fontsize=12)
        ax4.legend()
        
        # Save
        filename = f"ssa_deep_analysis_{TARGET_ASSET.replace('/','-')}_{TARGET_INTERVAL}.png"
        plt.tight_layout()
        plt.savefig(filename)
        print(f"\n✅ Analysis saved to: {filename}")
        print("-" * 50)
        print(f"1. Trend Strength: {ssa.contributions[0]:.2f}%")
        print(f"2. First Cycle (1+2): {ssa.contributions[1]+ssa.contributions[2]:.2f}%")
        print(f"3. Noise Floor starts approx at Component #{np.argmax(cumulative > 98)}")
        
if __name__ == "__main__":
    run_deep_analysis()