import os
from app import create_app
# REMOVE scheduler imports from here

app = create_app()

# Gunicorn expects 'app' to be importable here.
# Do NOT start the scheduler here.

if __name__ == '__main__':
    # You can keep this for local testing if you want, 
    # but strictly speaking, local dev should also use the separate script 
    # to mimic prod.
    app.run(host='0.0.0.0', port=5000, debug=True)