import requests
import pandas as pd
from datetime import datetime, timedelta
import time
import pytz
from ..utils import convert_ticker_to_twelvedata # Use relative import

def get_twelvedata_ohlc(symbol, interval, api_key, output_size=300):
    """Fetches OHLCV data from Twelve Data with retries."""
    td_symbol = convert_ticker_to_twelvedata(symbol)
    print(f"Fetching {interval} data for {td_symbol} (outputsize={output_size})...")

    # Adjust outputsize for specific intervals if needed (e.g., more for weekly)
    if interval == '1week':
         output_size = max(output_size, 500) # Get more weekly data if possible
    elif interval in ['15min', '1h', '4h']:
         output_size = max(output_size, 1000) # Get more intraday data

    url = f"https://api.twelvedata.com/time_series?symbol={td_symbol}&interval={interval}&outputsize={output_size}&apikey={api_key}"

    max_retries = 5
    retry_delay = 5 # seconds

    for attempt in range(max_retries):
        try:
            response = requests.get(url, timeout=20) # Add timeout
            response.raise_for_status() # Raise HTTPError for bad responses (4xx or 5xx)
            data_json = response.json()

            if isinstance(data_json, dict) and data_json.get('status') == 'error':
                code = data_json.get('code')
                message = data_json.get('message', 'Unknown API error')
                print(f"API Error for {td_symbol} (Code: {code}): {message}")
                if code == 429: # Rate limit
                    print(f"Rate limit hit. Retrying in {retry_delay}s... ({attempt + 1}/{max_retries})")
                    time.sleep(retry_delay)
                    retry_delay *= 2 # Exponential backoff
                    continue
                else:
                    return None # Other API error

            if 'values' not in data_json or not data_json['values']:
                print(f"No 'values' data returned for {td_symbol}")
                return None

            df = pd.DataFrame(data_json['values'])
            df = df.rename(columns={'datetime': 'time', # TradingView expects 'time'
                                    'open': 'open', 'high': 'high',
                                    'low': 'low', 'close': 'close',
                                    'volume':'volume'}) # Optional volume

            # Convert time to UNIX timestamp (seconds) for TradingView
            df['time'] = pd.to_datetime(df['time']).astype(int) // 10**9
            # Convert OHLC to numeric, coercing errors
            for col in ['open', 'high', 'low', 'close']:
                 df[col] = pd.to_numeric(df[col], errors='coerce')

            # Handle potential missing volume
            if 'volume' in df.columns:
                 df['volume'] = pd.to_numeric(df['volume'], errors='coerce').fillna(0)
            else:
                 df['volume'] = 0.0

            df = df.dropna(subset=['time', 'open', 'high', 'low', 'close']) # Drop rows with NaN in essential columns
            df = df.sort_values(by='time', ascending=True) # Ensure chronological order

            print(f"Successfully fetched {len(df)} points for {td_symbol}")
            return df[['time', 'open', 'high', 'low', 'close', 'volume']].to_dict('records')

        except requests.exceptions.RequestException as e:
            print(f"Network error fetching {td_symbol}: {e}. Retrying in {retry_delay}s... ({attempt + 1}/{max_retries})")
            time.sleep(retry_delay)
            retry_delay *= 2
        except Exception as e:
            print(f"Unexpected error processing {td_symbol}: {e}")
            return None # Non-retryable error

    print(f"Failed to fetch data for {td_symbol} after {max_retries} attempts.")
    return None