def extract_connections(edges):
    """เส้นในรูปที่เทียบกันได้ — สนใจแค่ตรรกะ ไม่สนว่าลากจากหูไหนของบล็อก"""
    connections = set()
    for e in edges or []:
        if not isinstance(e, dict):
            continue
        connections.add((e.get('source'), e.get('target'), e.get('label') or ''))
    return connections


def validate_flowchart(student_edges, solution_edges):
    """
    Validates a student's flowchart by comparing their edges
    against the teacher's solution edges.
    Returns (is_valid, message)
    """
    if not student_edges:
        return False, "Flowchart is empty. Please connect the symbols."

    if not solution_edges:
        return True, "No solution required for this mission."

    student_conns = extract_connections(student_edges)
    solution_conns = extract_connections(solution_edges)

    if solution_conns - student_conns:
        return False, "Incorrect connections or missing arrows."

    if student_conns - solution_conns:
        return False, "You have extra incorrect arrows."

    return True, "Mission Passed! Excellent Logic."


def flowchart_score(solution_edges, student_edges):
    """คะแนนบางส่วนของผังงาน คืน (ถูก, เต็ม) เป็นจำนวนเต็ม

    หารด้วย union ไม่ใช่จำนวนเส้นเฉลย มิฉะนั้นนักเรียนลากเส้นเชื่อมทุกคู่
    ที่เป็นไปได้จะครอบคลุมเฉลยทั้งหมดแล้วได้เต็มทันที
    """
    if not isinstance(student_edges, list):
        student_edges = []
    solution_conns = extract_connections(solution_edges)
    student_conns = extract_connections(student_edges)
    union = solution_conns | student_conns
    if not union:
        return 0, 0
    return len(solution_conns & student_conns), len(union)


def sudoku_score(meta, grid):
    """คะแนนบางส่วนของซูโดกุ คืน (ถูก, เต็ม) เป็นจำนวนช่อง

    เทียบรายช่องกับ solution_grid ไม่ใช่ validate_board เพราะการตรวจกฎ
    บอกได้แค่ว่าชนกันตรงไหน ไม่ได้บอกว่าช่องไหนถูก
    """
    given = (meta or {}).get('given_grid') or []
    solution = (meta or {}).get('solution_grid') or []
    size = len(solution)
    blanks = sum(1 for r in range(size) for c in range(size) if given[r][c] == -1)
    if blanks == 0:
        return 0, 0

    if (not isinstance(grid, list) or len(grid) != size
            or any(not isinstance(row, list) or len(row) != size for row in grid)):
        return 0, blanks

    # แก้ช่องที่ครูเปิดเผยไว้ = เปลี่ยนโจทย์ ให้คะแนนบางส่วนไม่ได้
    for r in range(size):
        for c in range(size):
            if given[r][c] != -1 and grid[r][c] != given[r][c]:
                return 0, blanks

    earned = sum(1 for r in range(size) for c in range(size)
                 if given[r][c] == -1 and grid[r][c] == solution[r][c])
    return earned, blanks
