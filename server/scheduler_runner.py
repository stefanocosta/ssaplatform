import time
import signal
import sys
import logging
from datetime import datetime
from app import create_app
from flask_apscheduler import APScheduler
from apscheduler.events import EVENT_JOB_EXECUTED, EVENT_JOB_ERROR
from app.tasks import update_market_data

# 1. Setup Logging (Unbuffered)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
    stream=sys.stdout
)
logger = logging.getLogger('ssa_scheduler')

def run_scheduler():
    app = create_app()
    scheduler = APScheduler()
    scheduler.init_app(app)

    # 2. Add Event Listener (To see success/failure logs)
    def job_listener(event):
        if event.exception:
            logger.error(f"❌ Job '{event.job_id}' FAILED: {event.exception}")
        else:
            logger.info(f"✅ Job '{event.job_id}' completed successfully.")

    scheduler.scheduler.add_listener(job_listener, EVENT_JOB_EXECUTED | EVENT_JOB_ERROR)

    # 3. FIX: Add Job BEFORE Starting
    # This ensures the scheduler picks it up immediately upon start.
    scheduler.add_job(
        id='market_update_job', 
        func=update_market_data, 
        trigger='cron', 
        second='0',
        replace_existing=True,
        next_run_time=datetime.now() # <--- FORCE RUN IMMEDIATELY
    )
    logger.info("📝 Job added to queue (Waiting for start)...")

    # 4. Start Scheduler
    scheduler.start()
    logger.info("🚀 Scheduler Started! (Job should run immediately)")

    # Signal Handling
    def signal_handler(sig, frame):
        logger.info('🛑 Stop signal received. Exiting...')
        sys.exit(0)

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    # Heartbeat loop
    try:
        while True:
            time.sleep(1)
    except (KeyboardInterrupt, SystemExit):
        pass

if __name__ == "__main__":
    run_scheduler()