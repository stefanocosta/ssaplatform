import numpy as np
import pywt
# Add other necessary imports from your original script's SSA logic

def ssa_decomposition(series, L):
    # ... (Your existing ssa_decomposition code) ...
    # Ensure it returns the components array
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
    # ... (Your existing calculate_adaptive_L code) ...
    series = np.array(series).flatten()
    N = len(series)
    if N < 10: return max(2, N // 2)
    min_scale = 2
    max_scale = min(128, N // 3)
    num_scales = 64
    scales = np.logspace(np.log10(min_scale), np.log10(max_scale), num=num_scales)
    wavelet = 'cmor1.5-1.0'
    try:
        coeffs, freqs = pywt.cwt(series, scales, wavelet)
        power = np.abs(coeffs) ** 2
        periods = 1 / (freqs + 1e-10) # Add epsilon to avoid division by zero
        global_ws = np.mean(power, axis=1)
        # Find the strongest period (index with max power)
        strongest_idx = np.argmax(global_ws)
        strongest_period = periods[strongest_idx]
        # Use the period directly for L calculation, rounding it
        L = int(round(strongest_period))
        # Constrain L
        L = min(max(L, 5), N // 2)
        return L
    except Exception as e:
        print(f"Wavelet analysis failed in calculate_adaptive_L: {e}")
        return max(10, min(N // 4, 20))