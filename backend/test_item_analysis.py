import unittest
from item_analysis import analyze_items, correlation


def question(qid, kind='multiple_choice'):
    return {'question_id': qid, 'question_type': kind, 'xp_points': 10, 'choices': [
        {'choice_id': qid * 10, 'is_correct': True}, {'choice_id': qid * 10 + 1, 'is_correct': False},
    ] if kind == 'multiple_choice' else []}


def attempt(values):
    return {'answers': {qid: {'is_correct': score == 1, 'xp_awarded': score * 10,
                             'selected_choice_id': qid * 10 + (0 if score == 1 else 1), 'answer_data': 'answer'}
                        for qid, score in values.items()}}


class ItemAnalysisTests(unittest.TestCase):
    def test_known_correlation(self):
        self.assertAlmostEqual(correlation([0, 0, 1, 1], [0, 1, 2, 3]), 0.8944271909999159)
        self.assertIsNone(correlation([1, 1], [0, 1]))
        self.assertIsNone(correlation([], []))

    def test_counts_difficulty_and_corrected_correlation(self):
        report = analyze_items([question(1), question(2)], [attempt({1: i % 2, 2: i % 2}) for i in range(20)])
        item = report['items'][0]
        self.assertEqual((item['n'], item['correct'], item['incorrect'], item['unanswered']), (20, 10, 10, 0))
        self.assertEqual((item['difficulty'], item['discrimination'], item['recommendation']), (.5, 1, 'retain'))
        self.assertEqual([c['count'] for c in item['choices']], [10, 10])
        self.assertEqual([c['label'] for c in item['choices']], ['A', 'B'])
        self.assertEqual([c['percentage'] for c in item['choices']], [50, 50])

    def test_negative_discrimination_and_small_sample_guard(self):
        data = [attempt({1: i % 2, 2: 1 - i % 2}) for i in range(20)]
        q = [question(1), question(2)]
        item = analyze_items(q, data)['items'][0]
        self.assertEqual(item['discrimination'], -1)
        self.assertEqual(item['recommendation'], 'discard')
        self.assertEqual(analyze_items(q, data[:19])['items'][0]['recommendation'], 'insufficient')

    def test_omissions_and_no_data(self):
        report = analyze_items([question(1)], [attempt({1:1}), attempt({})])
        item = report['items'][0]
        self.assertEqual((item['correct'],item['incorrect'],item['unanswered'],item['difficulty']), (1,1,1,.5))
        self.assertIsNone(item['discrimination'])
        empty = analyze_items([question(1)], [])['items'][0]
        self.assertIsNone(empty['difficulty'])
        self.assertEqual(empty['recommendation'], 'insufficient')
        self.assertEqual(analyze_items([], [])['question_count'], 0)

    def test_no_variance_is_not_zero_discrimination(self):
        item = analyze_items([question(1), question(2)], [attempt({1:1,2:1}) for _ in range(20)])['items'][0]
        self.assertIsNone(item['discrimination'])
        self.assertEqual(item['recommendation'], 'insufficient')

    def test_item_is_removed_from_total(self):
        # The other item is constant. An uncorrected total would incorrectly give r=1.
        item = analyze_items([question(1),question(2)], [attempt({1:i%2,2:1}) for i in range(20)])['items'][0]
        self.assertIsNone(item['discrimination'])

    def test_partial_credit_and_weight_normalization(self):
        qs = [question(1,'sudoku'), question(2,'flowchart')]
        qs[1]['xp_points'] = 100
        data = []
        for i in range(20):
            a = attempt({1:(i%4)/3, 2:(i%4)/3})
            a['answers'][2]['xp_awarded'] *= 10
            data.append(a)
        item = analyze_items(qs, data)['items'][0]
        self.assertEqual(item['difficulty'], .5)
        self.assertEqual(item['correct'], 5)
        self.assertEqual(item['discrimination'], 1)
        self.assertTrue(item['partial_credit'])

    def test_unrecognized_choices_are_accounted_for(self):
        a = attempt({1:0})
        a['answers'][1]['selected_choice_id'] = 999
        item = analyze_items([question(1)],[a])['items'][0]
        self.assertEqual(item['unknown_choices'], 1)
        self.assertEqual(item['unanswered'], 0)

    def test_hard_but_discriminating_item_requires_review(self):
        data = [attempt({1:float(i==0),2:float(i==0)}) for i in range(20)]
        item = analyze_items([question(1),question(2)], data)['items'][0]
        self.assertEqual(item['difficulty'], .05)
        self.assertEqual(item['recommendation'], 'revise')

if __name__ == '__main__':
    unittest.main(verbosity=2)
