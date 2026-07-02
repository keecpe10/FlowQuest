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
        
    # We only care about logical connections: (source, target, label)
    # This allows students to use different visual handles as long as the True/False logic is correct.
    def extract_connections(edges):
        connections = set()
        for e in edges:
            source = e.get('source')
            target = e.get('target')
            label = e.get('label') or '' # 'จริง' or 'เท็จ' or ''
            connections.add((source, target, label))
        return connections
        
    student_conns = extract_connections(student_edges)
    solution_conns = extract_connections(solution_edges)
    
    # Check if student is missing any solution edges
    missing = solution_conns - student_conns
    if missing:
        return False, "Incorrect connections or missing arrows."
        
    # Check if student added extra edges not in solution
    extra = student_conns - solution_conns
    if extra:
        return False, "You have extra incorrect arrows."
        
    return True, "Mission Passed! Excellent Logic."
