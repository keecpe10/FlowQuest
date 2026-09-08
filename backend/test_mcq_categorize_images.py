"""Image upload, persistence, student filtering and grading for categorize items.
Run: docker compose exec -T backend python test_mcq_categorize_images.py
Uses disposable fixtures and removes the uploaded test file after completion.
"""
import base64
import copy
import io
import os
import unittest

from app import create_app, db
from mcq_routes import grade_answer
from models import MCQQuestion
from test_mcq_blocks import setup_fixtures, teardown_fixtures, auth


class CategorizeImagesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = create_app()
        cls.ctx = cls.app.app_context()
        cls.ctx.push()
        cls.client = cls.app.test_client()
        cls.fixture = setup_fixtures()
        cls.endpoint = f"/api/v1/mcq/{cls.fixture['mission'].mission_id}/questions"
        cls.upload_path = None

    @classmethod
    def tearDownClass(cls):
        db.session.rollback()
        teardown_fixtures(cls.fixture)
        if cls.upload_path and os.path.isfile(cls.upload_path):
            os.remove(cls.upload_path)
        db.session.remove()
        db.engine.dispose()
        cls.ctx.pop()

    def test_image_roundtrip_and_legacy_grading(self):
        png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0N8AAAAASUVORK5CYII=')
        res = self.client.post('/api/v1/upload', data={'file': (io.BytesIO(png), 'categorize-test.png')}, headers=auth(self.fixture['teacher_token']))
        self.assertEqual(res.status_code, 200, res.get_json())
        image_url = res.get_json()['url']
        type(self).upload_path = os.path.join(self.app.config['UPLOAD_FOLDER'], image_url.rsplit('/', 1)[-1])
        with self.client.get(image_url) as image_response:
            self.assertEqual(image_response.status_code, 200)
        payload = {
            'question_type': 'categorize', 'question_text': 'จัดรูปลงหมวดหมู่', 'xp_points': 10,
            'choices': [], 'question_metadata': {
                'categories': ['สัตว์', 'ผลไม้'],
                'items': [{'text': 'แมว', 'category': 'สัตว์', 'image_url': image_url}, {'text': 'มะม่วง', 'category': 'ผลไม้'}],
            },
        }
        res = self.client.post(self.endpoint, json=payload, headers=auth(self.fixture['teacher_token']))
        self.assertEqual(res.status_code, 201, res.get_json())
        question = res.get_json()
        self.assertFalse(question['is_draft'])
        self.assertEqual(question['question_metadata']['items'][0]['image_url'], image_url)
        qid = question['question_id']
        teacher = self.client.get(self.endpoint, headers=auth(self.fixture['teacher_token'])).get_json()
        self.assertEqual(next(q for q in teacher if q['question_id'] == qid)['question_metadata'], payload['question_metadata'])
        student_res = self.client.get(self.endpoint, headers=auth(self.fixture['student_token']))
        self.assertEqual(student_res.status_code, 200, student_res.get_json())
        student = next(q for q in student_res.get_json() if q['question_id'] == qid)['question_metadata']
        self.assertCountEqual(student['items'], ['แมว', 'มะม่วง'])
        self.assertEqual(student['item_images'], {'แมว': image_url})
        self.assertEqual(set(student), {'categories', 'items', 'item_images'})
        stored = db.session.get(MCQQuestion, qid)
        self.assertEqual(grade_answer(stored, None, {'แมว': 'สัตว์', 'มะม่วง': 'ผลไม้'})[:2], (True, 10))
        self.assertEqual(grade_answer(stored, None, {'แมว': 'ผลไม้', 'มะม่วง': 'สัตว์'})[:2], (False, 0))
        payload['question_metadata']['items'][0]['image_url'] = ''
        res = self.client.put(f'{self.endpoint}/{qid}', json=payload, headers=auth(self.fixture['teacher_token']))
        self.assertEqual(res.status_code, 200, res.get_json())
        self.assertFalse(res.get_json()['question_metadata']['items'][0]['image_url'])
        self.assertEqual(grade_answer(stored, None, {'แมว': 'สัตว์', 'มะม่วง': 'ผลไม้'})[:2], (True, 10))

    def test_reject_external_image_and_duplicate_names(self):
        payload = {'question_type': 'categorize', 'question_text': 'จัดหมวดหมู่', 'xp_points': 10, 'choices': [],
                   'question_metadata': {'categories': ['A', 'B'], 'items': [{'text': 'one', 'category': 'A'}, {'text': 'two', 'category': 'B'}]}}
        for url in ['https://example.com/picture.png', '/api/v1/uploads/../private.png', {'bad': 'url'}]:
            invalid = copy.deepcopy(payload)
            invalid['question_metadata']['items'][0]['image_url'] = url
            res = self.client.post(self.endpoint, json=invalid, headers=auth(self.fixture['teacher_token']))
            self.assertEqual(res.status_code, 400, res.get_json())
        payload['question_metadata']['items'][1]['text'] = 'one'
        res = self.client.post(self.endpoint, json=payload, headers=auth(self.fixture['teacher_token']))
        self.assertEqual(res.status_code, 201, res.get_json())
        self.assertTrue(res.get_json()['is_draft'])


if __name__ == '__main__':
    unittest.main(verbosity=2)
