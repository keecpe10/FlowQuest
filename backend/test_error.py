from app import create_app
app = create_app()
app.config['TESTING'] = True
with app.app_context():
    with app.test_client() as client:
        res = client.get("/api/v1/game/leaderboard-3d")
        print("Status:", res.status_code)
        if res.status_code == 500:
            print(res.data)
