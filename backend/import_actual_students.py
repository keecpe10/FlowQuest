import sys
import os
import zipfile
import xml.etree.ElementTree as ET
from werkzeug.security import generate_password_hash

# Add backend directory to sys.path if running from outside
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import create_app, db
from models import User, Role, Class

excel_file_path = "/Users/panupongdonkrathok16/Desktop/FlowChart/นักเรียน_7_ระดับประถมศึกษาปีที่ 5_ห้องประถมศึกษาปีที่ 5.xlsx"

def import_students():
    app = create_app()
    with app.app_context():
        # Ensure student role exists
        student_role = Role.query.filter_by(role_name='student').first()
        if not student_role:
            student_role = Role(role_name='student')
            db.session.add(student_role)
            db.session.commit()
            print("Created 'student' role.")

        shared_strings = []
        try:
            with zipfile.ZipFile(excel_file_path, "r") as z:
                if "xl/sharedStrings.xml" in z.namelist():
                    root = ET.fromstring(z.read("xl/sharedStrings.xml"))
                    for si in root.findall("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}si"):
                        t = si.find("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t")
                        if t is not None and t.text:
                            shared_strings.append(t.text.strip())
                        else:
                            shared_strings.append("")

                sheet = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))
                rows = sheet.findall(".//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}row")
                
                count_added = 0
                count_skipped = 0

                for idx, row in enumerate(rows):
                    if idx == 0:
                        continue # Skip header
                    
                    cells = row.findall("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}c")
                    col_map = {'A': 0, 'B': 1, 'C': 2, 'D': 3, 'E': 4, 'F': 5, 'G': 6}
                    data_list = ["" for _ in range(7)]
                    
                    for cell in cells:
                        r_attr = cell.get("r")
                        col_letter = "".join(filter(str.isalpha, r_attr))
                        if col_letter not in col_map:
                            continue
                        col_idx = col_map[col_letter]
                        
                        v = cell.find("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}v")
                        if v is not None:
                            val = v.text
                            if cell.get("t") == "s":
                                val = shared_strings[int(val)]
                            data_list[col_idx] = str(val).strip()
                            
                    if not data_list[1]: # No student ID
                        continue
                        
                    student_id = data_list[1]
                    title = data_list[2]
                    first_name = data_list[3]
                    last_name = data_list[4]
                    class_level = data_list[5]
                    room = data_list[6]
                    
                    # Handle Class
                    class_name = f"{class_level}/{room}"
                    school_class = Class.query.filter_by(class_name=class_name).first()
                    if not school_class:
                        # Extract grade level if possible, e.g. "ป.5" -> 5
                        grade_level = 5
                        if "5" in class_level:
                            grade_level = 5
                        school_class = Class(class_name=class_name, grade_level=grade_level)
                        db.session.add(school_class)
                        db.session.commit()
                    
                    # Check if user already exists
                    existing_user = User.query.filter_by(username=student_id).first()
                    if existing_user:
                        count_skipped += 1
                        continue

                    # Create user
                    new_user = User(
                        username=student_id,
                        password_hash=generate_password_hash(student_id),
                        first_name=first_name,
                        last_name=last_name,
                        role_id=student_role.role_id,
                        class_id=school_class.class_id
                    )
                    db.session.add(new_user)
                    count_added += 1
                
                db.session.commit()
                print(f"Successfully imported {count_added} students. Skipped {count_skipped} (already exist).")

        except Exception as e:
            print(f"Error parsing Excel file or inserting to DB: {e}")

if __name__ == "__main__":
    import_students()
