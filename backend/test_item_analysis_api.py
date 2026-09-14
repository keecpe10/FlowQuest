"""Read-only authorization/cohort contract. Creates and removes disposable local fixtures."""
from datetime import datetime, timedelta
import unittest
from app import create_app, db
from models import Class, CourseEnrollment, UserMission, MCQQuestion, MCQChoice, MCQUserAnswer
from test_mcq_blocks import setup_fixtures, teardown_fixtures, auth


class ItemAnalysisApiTests(unittest.TestCase):
    def test_authorization_cohort_filtering_and_read_only(self):
        app = create_app()
        with app.app_context():
            first = setup_fixtures()
            other = setup_fixtures()
            school_class = Class(class_name='ItemAnalysisTest', grade_level='Test')
            db.session.add(school_class)
            db.session.flush()
            first['student'].class_id = school_class.class_id
            q1 = MCQQuestion(mission_id=first['mission'].mission_id, question_text='image question', question_type='multiple_choice', xp_points=10, order_index=0, is_draft=False)
            q2 = MCQQuestion(mission_id=first['mission'].mission_id, question_text='second', question_type='fill_blank', question_metadata={'correct_text':'yes'}, xp_points=10, order_index=1, is_draft=False)
            draft = MCQQuestion(mission_id=first['mission'].mission_id, question_text='draft', question_type='fill_blank', xp_points=10, order_index=2, is_draft=True)
            db.session.add_all([q1,q2,draft])
            db.session.flush()
            choice = MCQChoice(question_id=q1.question_id,choice_text='image',image_url='/api/v1/uploads/test.png',is_correct=True)
            db.session.add(choice)
            db.session.flush()
            done = datetime.utcnow() + timedelta(seconds=2)
            um = UserMission(user_id=first['student'].user_id,mission_id=first['mission'].mission_id,status='completed',completed_at=done,attempt_count=2,score_awarded=10)
            preview = UserMission(user_id=first['teacher'].user_id,mission_id=first['mission'].mission_id,status='completed',completed_at=done)
            outsider = UserMission(user_id=other['student'].user_id,mission_id=first['mission'].mission_id,status='failed',completed_at=done)
            db.session.add_all([um,preview,outsider])
            db.session.flush()
            db.session.add(MCQUserAnswer(user_mission_id=um.user_mission_id, question_id=q1.question_id,selected_choice_id=choice.choice_id,is_correct=True,xp_awarded=10))
            db.session.add(MCQUserAnswer(user_mission_id=um.user_mission_id, question_id=draft.question_id,is_correct=True,xp_awarded=10))
            db.session.commit()
            client=app.test_client()
            url=f"/api/v1/mcq/{first['mission'].mission_id}/item-analysis"
            try:
                self.assertEqual(client.get(url).status_code,401)
                self.assertEqual(client.get(url,headers=auth(first['student_token'])).status_code,403)
                self.assertEqual(client.get(url,headers=auth(other['teacher_token'])).status_code,403)
                res=client.get(url,headers=auth(first['teacher_token']))
                self.assertEqual(res.status_code,200,res.get_json())
                report=res.get_json()
                self.assertEqual((report['n'],report['roster_count'],report['question_count']),(1,1,2))
                self.assertEqual(report['items'][0]['choices'][0]['count'],1)
                self.assertEqual(report['items'][0]['choices'][0]['image_url'],'/api/v1/uploads/test.png')
                self.assertEqual(report['items'][1]['unanswered'],1)
                self.assertEqual(report['items'][1]['difficulty'],0)
                self.assertEqual((um.attempt_count,um.score_awarded,um.status),(2,10,'completed'))
                db.session.add(CourseEnrollment(course_id=first['course'].course_id,user_id=other['student'].user_id))
                outsider.status='pending'
                db.session.commit()
                report=client.get(url,headers=auth(first['teacher_token'])).get_json()
                self.assertEqual((report['roster_count'],report['pending_count'],report['n']),(2,1,1))
                report=client.get(url,query_string={'class_id':school_class.class_id},headers=auth(first['teacher_token'])).get_json()
                self.assertEqual((report['roster_count'],report['pending_count'],report['n']),(1,0,1))
                self.assertEqual(client.get(url,query_string={'class_id':'bad'},headers=auth(first['teacher_token'])).status_code,400)
                um.completed_at=datetime.utcnow()-timedelta(days=1)
                db.session.commit()
                report=client.get(url,headers=auth(first['teacher_token'])).get_json()
                self.assertEqual((report['n'],report['excluded_before_questions']),(0,1))
                self.assertEqual(outsider.status,'pending')
            finally:
                db.session.rollback()
                first['student'].class_id=None
                db.session.commit()
                teardown_fixtures(first)
                teardown_fixtures(other)
                db.session.delete(school_class)
                db.session.commit()
                db.session.remove()
                db.engine.dispose()

if __name__ == '__main__':
    unittest.main(verbosity=2)
