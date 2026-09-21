"""Pure, bounded validators for curriculum games. Never execute student code."""
TOKENS={'E':['E'],'S':['S'],'W':['W'],'N':['N'],'E2':['E','E'],'E3':['E','E','E'],'ES2':['E','S','E','S']}
LABELS={'E':'ขวา','S':'ลง','W':'ซ้าย','N':'ขึ้น','E2':'ทำซ้ำขวา 2 ครั้ง','E3':'ทำซ้ำขวา 3 ครั้ง','ES2':'ทำซ้ำ [ขวา, ลง] 2 ครั้ง'}

def grade(q,choice):
    kind=q.get('kind','choice');trace=[];detail='';collision=None
    if kind in ('choice','scenario'):
        if type(choice) is not int or not 0<=choice<len(q['options']):raise ValueError('กรุณาเลือกคำตอบที่มีในภารกิจ')
        correct=choice==q['answer'];solution=q['options'][q['answer']]
    elif kind in ('sequence','sort','chart','picture'):
        size=len(q['categories']) if kind=='chart' else len(q['cards'])
        if not isinstance(choice,list) or len(choice)!=size or any(type(v) is not int for v in choice):
            raise ValueError('กรุณาจัดบัตรหรือกรอกจำนวนให้ครบทุกช่อง')
        if kind=='sequence':
            if sorted(choice)!=list(range(size)):raise ValueError('บัตรแต่ละใบต้องใช้หนึ่งครั้ง ไม่ซ้ำหรือขาด')
            solution=' → '.join(q['cards'][i] for i in q['answer'])
        elif kind in ('sort','picture'):
            if any(v<0 or v>=len(q['categories']) for v in choice):raise ValueError('กลุ่มข้อมูลไม่ถูกต้อง')
            solution=' · '.join(f"{c}: {q['categories'][v]}" for c,v in zip(q['cards'],q['answer']))
        else:
            if any(v<0 or v>len(q['records']) for v in choice):raise ValueError('จำนวนต้องอยู่ระหว่าง 0 กับจำนวนรายการทั้งหมด')
            solution=' · '.join(f'{c}: {v}' for c,v in zip(q['categories'],q['answer']))
        correct=choice==q['answer']
    elif kind=='worksheet':
        if type(choice) is not list or len(choice)!=len(q['fields']) or any(type(n) is not int or not 0<=n<=100000 for n in choice):
            raise ValueError('กรอกจำนวนเต็ม 0–100,000 ให้ครบทุกช่อง')
        correct=choice==q['answer'];solution=' · '.join(f'{label}: {value}' for label,value in zip(q['fields'],q['answer']))
    elif kind=='numbergrid':
        if type(choice) is not list or len(choice)!=16 or any(type(n) is not int or not 1<=n<=4 for n in choice):
            raise ValueError('เติมตัวเลข 1–4 ให้ครบทุกช่อง')
        if any(g and choice[i]!=g for i,g in enumerate(q['givens'])):raise ValueError('เปลี่ยนตัวเลขที่โจทย์กำหนดไม่ได้')
        groups=[choice[r*4:r*4+4] for r in range(4)]+[choice[c::4] for c in range(4)]
        groups += [[choice[(r+dr)*4+c+dc] for dr in range(2) for dc in range(2)] for r in (0,2) for c in (0,2)]
        correct=all(set(group)=={1,2,3,4} for group in groups)
        solution=' / '.join(' '.join(str(n) for n in q['answer'][r*4:r*4+4]) for r in range(4))
    elif kind=='program':
        if not isinstance(choice,list) or not 1<=len(choice)<=q['max_commands'] or any(type(t) is not str or t not in q['palette'] or t not in TOKENS for t in choice):
            raise ValueError(f"ใช้บล็อกที่มีในภารกิจ 1–{q['max_commands']} บล็อก")
        pos=q['start'][:];trace=[pos[:]];correct=True
        for token in choice:
            for direction in TOKENS[token]:
                dx,dy={'E':(1,0),'S':(0,1),'W':(-1,0),'N':(0,-1)}[direction]
                nxt=[pos[0]+dx,pos[1]+dy]
                if not (0<=nxt[0]<q['size'] and 0<=nxt[1]<q['size']):
                    collision=dict(kind='boundary',at=nxt);correct=False;detail='หุ่นยนต์เดินออกนอกตาราง ให้ตรวจทิศทางและจำนวนก้าว';break
                if nxt in q['walls']:
                    collision=dict(kind='wall',at=nxt);correct=False;detail='หุ่นยนต์ชนหิน ให้เลือกเส้นทางอ้อมก่อนถึงช่องนี้';break
                pos=nxt;trace.append(pos[:])
            if not correct:break
        if correct and pos!=q['goal']:correct=False;detail='หุ่นยนต์ยังไม่หยุดที่ธง ตรวจตำแหน่งสุดท้ายกับเป้าหมายอีกครั้ง'
        solution=' → '.join(LABELS[t] for t in q['answer'])
    else:raise ValueError('ไม่รองรับรูปแบบภารกิจนี้')
    return dict(correct=correct,solution=solution,trace=trace,collision=collision,explanation=(detail+' ' if detail else '')+q['explanation'])
