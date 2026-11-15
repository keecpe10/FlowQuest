"""Validation and scoring for website evidence questions."""

MAX_TARGETS = 8
UPLOAD_PREFIX = '/api/v1/uploads/'
TARGET_KEYS = frozenset(str(index) for index in range(MAX_TARGETS))


def _coordinates(value, count, where):
    if (not isinstance(value, list) or len(value) != count
            or any(type(n) not in (int, float) or not 0 <= n <= 1 for n in value)):
        raise ValueError(f'{where}: ตำแหน่งบนภาพไม่ถูกต้อง')
    return value


def clean_metadata(meta, where):
    if not isinstance(meta, dict) or not isinstance(meta.get('targets', []), list):
        raise ValueError(f'{where}: รูปแบบจุดหลักฐานไม่ถูกต้อง')
    image = meta.get('image_url', '')
    if not isinstance(image, str) or (image and (
        not image.startswith(UPLOAD_PREFIX) or '..' in image
        or not image[len(UPLOAD_PREFIX):]
    )):
        raise ValueError(f'{where}: ใช้ภาพที่อัปโหลดในระบบ')
    if len(meta.get('targets', [])) > MAX_TARGETS:
        raise ValueError(f'{where}: เพิ่มได้ไม่เกิน {MAX_TARGETS} จุด')
    targets = []
    for target in meta.get('targets', []):
        if not isinstance(target, dict) or not isinstance(target.get('label'), str) or len(target['label']) > 120:
            raise ValueError(f'{where}: ชื่อหลักฐานไม่ถูกต้อง')
        rect = target.get('rect')
        if rect is not None:
            left, top, right, bottom = _coordinates(rect, 4, where)
            if left >= right or top >= bottom:
                raise ValueError(f'{where}: พื้นที่หลักฐานต้องมีความกว้างและความสูง')
        targets.append({'label': target['label'].strip(), 'rect': rect})
    return {'image_url': image, 'targets': targets}


def is_complete(meta):
    targets = meta.get('targets', [])
    return bool(meta.get('image_url') and targets and all(
        target['label'] and target['rect'] for target in targets
    ))


def student_metadata(meta):
    return {
        'image_url': meta['image_url'],
        'targets': [{'label': target['label']} for target in meta['targets']],
    }


def clean_answer(answer, where):
    if not isinstance(answer, dict) or any(key not in TARGET_KEYS for key in answer):
        raise ValueError(f'{where}: รายการคำตอบไม่ถูกต้อง')
    return {key: _coordinates(point, 2, where) for key, point in answer.items()}


def score(meta, answer):
    targets = meta.get('targets', [])
    points = answer or {}
    earned = 0
    for index, target in enumerate(targets):
        point = points.get(str(index))
        if point is not None and target['rect'] is not None:
            x, y = point
            left, top, right, bottom = target['rect']
            earned += left <= x <= right and top <= y <= bottom
    return earned, len(targets)
