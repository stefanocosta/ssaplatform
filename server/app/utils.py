def convert_ticker_to_twelvedata(ticker):
    if ticker.endswith('=X'):
        base = ticker[:-2]
        return base[:3] + '/' + base[3:]
    elif '-' in ticker:
        return ticker.replace('-', '/')
    else:
        return ticker # Assuming stock/other