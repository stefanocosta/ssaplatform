import time
import signal
import sys
from app import create_app
from flask_apscheduler import APScheduler
from app.tasks import update_market_data

def run_scheduler():
    app = create_app()
    
    # Initialize Scheduler
    scheduler = APScheduler()
    scheduler.init_app(app)
    scheduler.start()

    # Add the job explicitly
    # replace_existing=True ensures we update the job definition if code changes
    scheduler.add_job(
        id='market_update_job', 
        func=update_market_data, 
        trigger='cron', 
        second='0',
        replace_existing=True
    )

    print("🚀 Market Data Scheduler Started (Standalone)...")

    # Graceful Shutdown Handler
    def signal_handler(sig, frame):
        print('Stopping Scheduler...')
        scheduler.shutdown(wait=False)
        sys.exit(0)

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    # Keep main thread alive
    try:
        while True:
            time.sleep(1)
    except (KeyboardInterrupt, SystemExit):
        pass

if __name__ == "__main__":
    run_scheduler()