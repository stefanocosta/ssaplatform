import os
from app import create_app
from flask_apscheduler import APScheduler
from app.tasks import update_market_data

app = create_app()

scheduler = APScheduler()
scheduler.init_app(app)
scheduler.start()

# --- REMOVED THE "BOOT" BLOCK ---
# We removed the manual "update_market_data()" call here 
# to prevent it from clashing with the scheduled job below.

# Scheduled Job (Runs every minute at :00)
scheduler.add_job(
    id='market_update_job', 
    func=update_market_data, 
    trigger='cron', 
    second='0' 
)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)