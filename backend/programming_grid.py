from collections import deque

DIRECTIONS = {'up': (-1, 0), 'down': (1, 0), 'left': (0, -1), 'right': (0, 1)}
CELLS = ('empty', 'start', 'goal', 'wall')
MAX_COMMANDS = 100


def clean_metadata(meta, where):
    grid = meta.get('grid') if isinstance(meta, dict) else None
    if (
        not isinstance(grid, list) or not 2 <= len(grid) <= 10
        or not isinstance(grid[0], list) or not 2 <= len(grid[0]) <= 10
        or any(not isinstance(row, list) or len(row) != len(grid[0])
               or any(cell not in CELLS for cell in row) for row in grid)
    ):
        raise ValueError(f'{where}: แผนที่ต้องเป็นตารางขนาด 2–10 แถว และ 2–10 คอลัมน์')
    for cell in ('start', 'goal'):
        if sum(row.count(cell) for row in grid) > 1:
            raise ValueError(f'{where}: กำหนดจุดเริ่มต้นและเส้นชัยได้อย่างละหนึ่งช่อง')
    return {'grid': grid}


def find_cell(grid, cell):
    return next(((r, c) for r, row in enumerate(grid)
                 for c, value in enumerate(row) if value == cell), None)


def move(grid, position, delta):
    r, c = position[0] + delta[0], position[1] + delta[1]
    if 0 <= r < len(grid) and 0 <= c < len(grid[r]) and grid[r][c] != 'wall':
        return (r, c)
    return None


def is_complete(meta):
    grid = meta.get('grid') or []
    start, goal = find_cell(grid, 'start'), find_cell(grid, 'goal')
    if start is None or goal is None:
        return False
    queue = deque([start])
    visited = {start}
    while queue:
        position = queue.popleft()
        if position == goal:
            return True
        for delta in DIRECTIONS.values():
            next_position = move(grid, position, delta)
            if next_position is not None and next_position not in visited:
                queue.append(next_position)
                visited.add(next_position)
    return False


def valid_commands(answer):
    return (isinstance(answer, list) and len(answer) <= MAX_COMMANDS
            and all(isinstance(command, str) and command in DIRECTIONS for command in answer))


def clean_answer(answer, where):
    if not valid_commands(answer):
        raise ValueError(f'{where}: ใช้การ์ดคำสั่ง ขึ้น ลง ซ้าย ขวา ได้ไม่เกิน {MAX_COMMANDS} ใบ')
    return answer


def score(meta, answer):
    if not answer or not valid_commands(answer):
        return 0, 1
    grid = meta.get('grid') or []
    position = find_cell(grid, 'start')
    if position is None:
        return 0, 1
    for command in answer:
        position = move(grid, position, DIRECTIONS[command])
        if position is None:
            return 0, 1
    return int(grid[position[0]][position[1]] == 'goal'), 1
