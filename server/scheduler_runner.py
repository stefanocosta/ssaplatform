import sys
import logging
import signal
from datetime import datetime
from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.events import EVENT_JOB_EXECUTED, EVENT_JOB_ERROR
from app import create_app
from app.tasks import update_market_data

# 1. Setup Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
    stream=sys.stdout
)
logger = logging.getLogger('ssa_daemon')

# 2. Define the Wrapper
# We wrap the task to inject the App Context explicitly.
# This avoids the "Global App" issues in tasks.py.
def job_wrapper():
    app = create_app()
    with app.app_context():
        try:
            update_market_data()
        except Exception as e:
            logger.error(f"❌ Critical Task Error: {e}")

def run_scheduler():
    # Initialize the BlockingScheduler (Runs in the foreground)
    scheduler = BlockingScheduler()

    # 3. Add Event Listener
    def job_listener(event):
        if event.exception:
            logger.error(f"❌ Job FAILED: {event.exception}")
        else:
            logger.info(f"✅ Job completed successfully.")

    scheduler.add_listener(job_listener, EVENT_JOB_EXECUTED | EVENT_JOB_ERROR)

    # 4. Schedule the Job
    # misfire_grace_time=None: "If you miss the start time, run it anyway!"
    scheduler.add_job(
        func=job_wrapper,
        trigger='cron',
        second='0',
        id='market_update_job',
        replace_existing=True,
        misfire_grace_time=None, 
        next_run_time=datetime.now() # <--- FORCE IMMEDIATE RUN
    )

    logger.info("🚀 PURE Scheduler Started (Blocking Mode)...")

    # 5. Handle Shutdown Signals
    def signal_handler(sig, frame):
        logger.info('🛑 Shutting down...')
        scheduler.shutdown(wait=False)
        sys.exit(0)

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    # Start (This blocks the thread, so no while True loop needed)
    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        pass

if __name__ == "__main__":
    run_scheduler()