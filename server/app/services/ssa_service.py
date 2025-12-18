import numpy as np
import pywt
from scipy.linalg import hankel, svd
# Add other necessary imports from your original script's SSA logic

def ssa_decomposition(series, L):

    series = series.flatten()
    N = len(series)
    K = N - L + 1
    if K <= 0:
        raise ValueError("Window size L is larger than the series length N")
    X = np.lib.stride_tricks.sliding_window_view(series, window_shape=L).T
    U, Sigma, Vt = np.linalg.svd(X, full_matrices=False)
    V = Vt.T
    d = Sigma.size
    components = np.zeros((L, N)) # Change from (d, N) to (L, N) potentially? Check logic. Or ensure L components are returned.
    # Original code used (L, N), let's stick with that.
    for i in range(d):
        X_i = Sigma[i] * U[:, i].reshape(-1, 1) @ V[:, i].reshape(1, -1)
        #Hankelization (averaging along anti-diagonals) - Slightly adapted
        component_i = np.zeros(N)
        for k in range(N):
            count = 0
            val = 0
            # Iterate through possible (row, col) indices contributing to index k
            for row in range(max(0, k - K + 1), min(L, k + 1)):
                col = k - row
                if 0 <= col < K:
                     val += X_i[row, col]
                     count += 1
            if count > 0:
                component_i[k] = val / count
        # Store the reconstructed component - Make sure index matches shape
        if i < L: # Ensure we don't go out of bounds if d < L
             components[i, :] = component_i
        # If d > L, later components won't be stored, which is expected.
    return components


def calculate_adaptive_L(series):
    """
    Calculate adaptive window length L for SSA based on the TRUE strongest dominant cycle.
    
    Parameters:
        series (array-like): Input time series (e.g., daily stock prices)
    
    Returns:
        int: Adaptive window length L for optimal SSA decomposition based on strongest cycle
    """
    # Convert to numpy array and flatten
    series = np.array(series).flatten()
    N = len(series)
    
    # Handle edge cases
    if N < 10:
        return max(2, N // 2)  # fallback for very short series
    
    # Use exactly the same parameters as in the display_wavelet_analysis function
    min_scale = 2
    max_scale = min(128, N//3)
    num_scales = 64
    
    # Generate logarithmically spaced scales
    scales = np.logspace(np.log10(min_scale), np.log10(max_scale), num=num_scales)
    
    # Use Morlet wavelet
    wavelet = 'cmor1.5-1.0'
    
    try:
        # Compute wavelet transform
        coeffs, freqs = pywt.cwt(series, scales, wavelet)
        
        # Calculate power spectrum
        power = np.abs(coeffs) ** 2
        
        # Convert frequencies to periods
        periods = 1/freqs
        
        # Calculate global wavelet spectrum (average power across time)
        global_ws = np.mean(power, axis=1)
        
        # Find significant periods using the same threshold as in popup (75th percentile)
        significance_level = np.percentile(global_ws, 75)
        significant_periods = []
        
        for i, p in enumerate(periods):
            if global_ws[i] > significance_level:
                significant_periods.append(p)
        
        if significant_periods:
            # Sort significant periods by their values (ascending)
            significant_periods.sort()
            
            # Use the first (smallest period) significant period
            strongest_period = significant_periods[0]
            
            #print(f"Using true strongest period: {strongest_period:.1f}")
        else:
            # Fallback if no significant periods
            strongest_idx = np.argmax(global_ws)
            strongest_period = periods[strongest_idx]
            print(f"No significant periods, using max power: {strongest_period:.1f}")
        
        # Round the strongest period to the nearest integer for L
        L = int(round(strongest_period))
        
        # Constrain L between 5 and N/2
        L = min(max(L, 5), N // 2)
        
        #print(f"Final adaptive L = {L}")
        
        return L
        
    except Exception as e:
        # Fallback to a simple method if wavelet analysis fails
        print(f"Wavelet analysis failed in calculate_adaptive_L: {e}")
        return max(10, min(N // 4, 20))  # Conservative default
    
def get_ssa_diagnostics(series, L):
    """
    Returns detailed diagnostics including Eigenvalues and individual components.
    """
    N = len(series)
    K = N - L + 1
    
    # 1. Embed
    X = hankel(series[:L], series[L-1:])
    
    # 2. Decompose (SVD)
    U, Sigma, VT = svd(X)
    
    # 3. Calculate Power (Eigenvalues)
    eigenvalues = Sigma ** 2
    total_power = np.sum(eigenvalues)
    contributions = (eigenvalues / total_power) * 100
    
    # 4. Reconstruct Top Components Individually
    # We reconstruct the first 10 components individually for visualization
    # (Storing all 39 would be too heavy for the API response)
    individual_components = []
    
    for i in range(min(L, 10)):
        # Reconstruct single component
        X_i = Sigma[i] * np.outer(U[:, i], VT[i, :])
        X_i_rev = X_i[::-1]
        
        # Diagonal Averaging
        g = [X_i_rev.diagonal(j).mean() for j in range(-X_i_rev.shape[0]+1, X_i_rev.shape[1])]
        individual_components.append(list(g))
        
    return {
        "contributions": contributions.tolist(),
        "components": individual_components,
        "singular_values": Sigma.tolist()
    }