from app import create_app
from flask_apscheduler import APScheduler
from app.tasks import update_market_data

app = create_app()

# Initialize Scheduler
scheduler = APScheduler()
scheduler.init_app(app)
scheduler.start()

# --- CHANGE IS HERE ---
# trigger='cron', second='0' ensures it runs exactly at XX:XX:00
scheduler.add_job(
    id='market_update_job', 
    func=update_market_data, 
    trigger='cron', 
    second='0' 
)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)