"""Read-only classical item analysis; normalized item scores, corrected item-rest r.
Reference: https://www.washington.edu/assessment/scanning-scoring/scoring/reports/item-analysis/
Recommendation cutoffs and the N>=20 guard are local screening rules, not validity claims.
"""
from collections import Counter
from math import sqrt

MIN_RECOMMENDATION_N = 20
PARTIAL_TYPES = {'sudoku', 'flowchart'}


def correlation(xs, ys):
    if len(xs) < 2:
        return None
    mx, my = sum(xs) / len(xs), sum(ys) / len(ys)
    vx = sum((x - mx) ** 2 for x in xs)
    vy = sum((y - my) ** 2 for y in ys)
    if vx <= 1e-12 or vy <= 1e-12:
        return None
    return max(-1.0, min(1.0, sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sqrt(vx * vy)))


def recommendation(n, p, r, reason):
    if n < MIN_RECOMMENDATION_N:
        return 'insufficient', f'มีผู้สอบ {n} คน เก็บข้อมูลอย่างน้อย {MIN_RECOMMENDATION_N} คนก่อนใช้เกณฑ์คัดกรอง'
    if r is None:
        return 'insufficient', reason
    if r < 0:
        return 'discard', 'อำนาจจำแนกติดลบ ควรตรวจเฉลยและความกำกวม หากแก้ไขไม่ได้ควรตัดออก'
    if r < 0.10:
        return 'discard', 'อำนาจจำแนกต่ำกว่า 0.10 ควรพิจารณาตัดออกหรือเขียนใหม่แล้วทดลองซ้ำ'
    if p < 0.20 or p > 0.80:
        return 'revise', 'ยากหรือง่ายมาก ควรทบทวนตามจุดประสงค์การวัดก่อนนำกลับมาใช้'
    if r < 0.30:
        return 'revise', 'อำนาจจำแนกยังไม่ถึง 0.30 ควรปรับถ้อยคำ ตัวลวง หรือความสอดคล้องกับเนื้อหา'
    return 'retain', 'ความยากอยู่ระหว่าง 0.20–0.80 และอำนาจจำแนกตั้งแต่ 0.30 เหมาะใช้ต่อหลังตรวจเนื้อหา'


def analyze_items(questions, attempts):
    """Each attempt supplies an answers dict keyed by question_id; caller selects cohort."""
    n = len(attempts)
    columns = []
    for q in questions:
        values = []
        for attempt in attempts:
            answer = attempt['answers'].get(q['question_id'])
            if not answer:
                values.append(0.0)
            elif q['question_type'] in PARTIAL_TYPES:
                maximum = q.get('xp_points') or 0
                values.append(min(1.0, max(0.0, (answer.get('xp_awarded') or 0) / maximum)) if maximum > 0 else 0.0)
            else:
                values.append(float(bool(answer.get('is_correct'))))
        columns.append(values)
    totals = [sum(column[row] for column in columns) for row in range(n)]
    items = []
    for index, q in enumerate(questions):
        answers = [a['answers'].get(q['question_id']) for a in attempts]
        scores = columns[index]
        correct = sum(bool(a and a.get('is_correct')) for a in answers)
        choices = q.get('choices', [])
        choice_ids = {c['choice_id'] for c in choices}
        is_choice = q['question_type'] in {'multiple_choice', 'true_false'}
        def is_blank(a):
            if not a:
                return True
            if is_choice:
                return a.get('selected_choice_id') is None
            data = a.get('answer_data')
            return data is None or data == '' or data == {} or data == []
        blank = sum(is_blank(a) for a in answers)
        # A manually awarded blank is counted as correct; keep answer-state and correctness separate.
        incorrect = n - correct
        counts = Counter(a.get('selected_choice_id') for a in answers if a and a.get('selected_choice_id') is not None)
        unknown = sum(count for cid, count in counts.items() if cid not in choice_ids) if is_choice else 0
        p = sum(scores) / n if n else None
        rest = [total - score for total, score in zip(totals, scores)]
        r = correlation(scores, rest) if len(questions) > 1 else None
        reason = ('ต้องมีข้อสอบอย่างน้อย 2 ข้อเพื่อเทียบกับคะแนนข้ออื่น' if len(questions) < 2
                  else 'คะแนนข้อนี้หรือคะแนนข้ออื่นไม่มีความแตกต่าง จึงคำนวณอำนาจจำแนกไม่ได้')
        decision, explanation = recommendation(n, p, r, reason)
        if unknown:
            decision, explanation = 'insufficient', 'มีคำตอบที่ไม่ตรงกับตัวเลือกปัจจุบัน ควรตรวจรุ่นข้อสอบก่อนสรุปคุณภาพ'
        items.append({
            **q, 'number': index + 1, 'n': n, 'correct': correct, 'incorrect': incorrect,
            'unanswered': blank, 'answered': n - blank, 'unknown_choices': unknown,
            'difficulty': round(p, 4) if p is not None else None,
            'difficulty_label': 'ยังไม่มีข้อมูล' if p is None else 'ยากมาก' if p < .20 else 'ยาก' if p < .40 else 'ปานกลาง' if p <= .60 else 'ง่าย' if p <= .80 else 'ง่ายมาก',
            'discrimination': round(r, 4) if r is not None else None,
            'discrimination_reason': reason if r is None else None,
            'partial_credit': q['question_type'] in PARTIAL_TYPES,
            'recommendation': decision, 'recommendation_reason': explanation,
            'choices': [{**c, 'label': chr(65 + ci), 'count': counts[c['choice_id']],
                         'percentage': round(counts[c['choice_id']] * 100 / n, 2) if n else 0}
                        for ci, c in enumerate(choices)],
        })
    return {'items': items, 'n': n, 'question_count': len(questions),
            'recommendations': dict(Counter(item['recommendation'] for item in items)),
            'min_recommendation_n': MIN_RECOMMENDATION_N}
