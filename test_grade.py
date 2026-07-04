import urllib.request
import json

req = urllib.request.Request('http://127.0.0.1:5001/api/v1/auth/login', data=json.dumps({'email': 'teacher@example.com', 'password': 'password123'}).encode('utf-8'), headers={'Content-Type': 'application/json'})
try:
    res = urllib.request.urlopen(req)
    token = json.loads(res.read()).get('token')
    
    req2 = urllib.request.Request('http://127.0.0.1:5001/api/v1/mcq/10/grade-manual', data=json.dumps({'student_id': 2, 'question_id': 1}).encode('utf-8'), headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {token}'})
    try:
        res2 = urllib.request.urlopen(req2)
        print(res2.status, res2.read())
    except urllib.error.HTTPError as e:
        print(e.code, e.read().decode('utf-8'))
except Exception as e:
    print(e)
