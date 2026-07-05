import random
import copy

def count_solutions(board, bw, bh, limit=2):
    N = bw * bh
    grid = [[0 if v is None else v for v in row] for row in board]
    def ok(r, c, v):
        for i in range(N):
            if grid[r][i] == v or grid[i][c] == v: return False
        br, bc = (r // bh) * bh, (c // bw) * bw
        for i in range(br, br + bh):
            for j in range(bc, bc + bw):
                if grid[i][j] == v: return False
        return True
    
    cnt = 0
    def solve():
        nonlocal cnt
        for r in range(N):
            for c in range(N):
                if grid[r][c] == 0:
                    for v in range(1, N + 1):
                        if ok(r, c, v):
                            grid[r][c] = v
                            solve()
                            grid[r][c] = 0
                            if cnt >= limit: return
                    return
        cnt += 1
    
    solve()
    return cnt

def generate_full_board(bw, bh):
    N = bw * bh
    grid = [[0 for _ in range(N)] for _ in range(N)]
    
    def ok(r, c, v):
        for i in range(N):
            if grid[r][i] == v or grid[i][c] == v: return False
        br, bc = (r // bh) * bh, (c // bw) * bw
        for i in range(br, br + bh):
            for j in range(bc, bc + bw):
                if grid[i][j] == v: return False
        return True

    def solve():
        for r in range(N):
            for c in range(N):
                if grid[r][c] == 0:
                    values = list(range(1, N + 1))
                    random.shuffle(values)
                    for v in values:
                        if ok(r, c, v):
                            grid[r][c] = v
                            if solve(): return True
                            grid[r][c] = 0
                    return False
        return True

    solve()
    return grid

def generate_sudoku(bw, bh, num_givens):
    """
    Generates a unique Sudoku puzzle.
    Returns (given_grid, solution_grid)
    -1 is used for empty cells in given_grid to be consistent with frontend spec
    (0-indexed values in frontend, 1-indexed in solver - will map below)
    """
    N = bw * bh
    max_attempts = 20
    
    for _ in range(max_attempts):
        solution = generate_full_board(bw, bh)
        given = copy.deepcopy(solution)
        
        cells = [(r, c) for r in range(N) for c in range(N)]
        random.shuffle(cells)
        
        holes = N * N - num_givens
        holes_made = 0
        
        for r, c in cells:
            if holes_made >= holes:
                break
                
            temp = given[r][c]
            given[r][c] = 0
            
            # Check uniqueness
            if count_solutions(given, bw, bh, limit=2) != 1:
                given[r][c] = temp # revert
            else:
                holes_made += 1
                
        # Format the grid to 0-indexed for frontend, and -1 for empty
        # Because we want indices of the symbol_set (e.g., 0 to N-1)
        final_given = [[-1 if val == 0 else val - 1 for val in row] for row in given]
        final_solution = [[val - 1 for val in row] for row in solution]
        
        if count_solutions(given, bw, bh, limit=2) == 1:
            return final_given, final_solution
            
    # Fallback if somehow it failed to make exactly num_givens
    # Just return whatever it could do that is unique
    solution = generate_full_board(bw, bh)
    given = copy.deepcopy(solution)
    cells = [(r, c) for r in range(N) for c in range(N)]
    random.shuffle(cells)
    for r, c in cells:
        temp = given[r][c]
        given[r][c] = 0
        if count_solutions(given, bw, bh, limit=2) != 1:
            given[r][c] = temp
    final_given = [[-1 if val == 0 else val - 1 for val in row] for row in given]
    final_solution = [[val - 1 for val in row] for row in solution]
    return final_given, final_solution

def validate_board(grid, bw, bh):
    """
    Validates a grid (0-indexed values, -1 for empty).
    Returns a list of conflict cells: [{"row": r, "col": c}, ...]
    """
    N = bw * bh
    conflicts = set()
    
    # Check rows
    for r in range(N):
        seen = {}
        for c in range(N):
            v = grid[r][c]
            if v != -1:
                if v in seen:
                    conflicts.add((r, c))
                    conflicts.add((r, seen[v]))
                else:
                    seen[v] = c
                    
    # Check cols
    for c in range(N):
        seen = {}
        for r in range(N):
            v = grid[r][c]
            if v != -1:
                if v in seen:
                    conflicts.add((r, c))
                    conflicts.add((seen[v], c))
                else:
                    seen[v] = r
                    
    # Check boxes
    for br in range(0, N, bh):
        for bc in range(0, N, bw):
            seen = {}
            for i in range(bh):
                for j in range(bw):
                    r = br + i
                    c = bc + j
                    v = grid[r][c]
                    if v != -1:
                        if v in seen:
                            conflicts.add((r, c))
                            conflicts.add(seen[v])
                        else:
                            seen[v] = (r, c)
                            
    return [{"row": r, "col": c} for r, c in conflicts]
