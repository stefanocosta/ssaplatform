import time
import signal
import sys
import logging
from app import create_app
from flask_apscheduler import APScheduler
from apscheduler.events import EVENT_JOB_EXECUTED, EVENT_JOB_ERROR, EVENT_JOB_SUBMITTED
from app.tasks import update_market_data

# 1. Configure Logging
# This ensures logs have timestamps and levels (INFO, ERROR)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
    stream=sys.stdout  # Force logs to standard output for Journalctl
)
logger = logging.getLogger('ssa_scheduler')

def run_scheduler():
    app = create_app()
    
    scheduler = APScheduler()
    scheduler.init_app(app)
    
    # 2. Add Event Listener
    # This function triggers every time a job runs, errors, or is submitted
    def job_listener(event):
        if event.exception:
            logger.error(f"❌ Job '{event.job_id}' FAILED due to error: {event.exception}")
        else:
            logger.info(f"✅ Job '{event.job_id}' completed successfully.")

    # Attach the listener to the scheduler
    scheduler.scheduler.add_listener(job_listener, EVENT_JOB_EXECUTED | EVENT_JOB_ERROR)

    scheduler.start()

    # 3. Add the Job
    scheduler.add_job(
        id='market_update_job', 
        func=update_market_data, 
        trigger='cron', 
        second='0',
        replace_existing=True
    )

    logger.info("🚀 Market Data Scheduler Started (Standalone with Logging)...")

    # Graceful Shutdown Handler
    def signal_handler(sig, frame):
        logger.info('🛑 Stopping Scheduler...')
        scheduler.shutdown(wait=False)
        sys.exit(0)

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    # 4. Main Loop Heartbeat
    # Optional: Prints a "pulse" every 5 minutes just so you know the process is alive
    # even if no jobs are running.
    counter = 0
    try:
        while True:
            time.sleep(1)
            counter += 1
            if counter >= 300: # Every 5 minutes
                logger.info("💓 Scheduler process is alive and waiting for next job...")
                counter = 0
    except (KeyboardInterrupt, SystemExit):
        pass

if __name__ == "__main__":
    run_scheduler()