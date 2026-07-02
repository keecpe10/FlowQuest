import zipfile
import xml.etree.ElementTree as ET
import os

file_path = "นักเรียน_7_ระดับประถมศึกษาปีที่ 5_ห้องประถมศึกษาปีที่ 5.xlsx"
sql_output_path = "insert_students.sql"

def parse_excel_to_sql():
    if not os.path.exists(file_path):
        print(f"File not found: {file_path}")
        return

    shared_strings = []
    try:
        with zipfile.ZipFile(file_path, "r") as z:
            if "xl/sharedStrings.xml" in z.namelist():
                root = ET.fromstring(z.read("xl/sharedStrings.xml"))
                for si in root.findall("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}si"):
                    t = si.find("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t")
                    if t is not None:
                        shared_strings.append(t.text)
                    else:
                        shared_strings.append("")

            sheet = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))
            rows = sheet.findall(".//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}row")
            
            with open(sql_output_path, "w", encoding="utf-8") as f:
                f.write("-- SQL generated from Excel file\n")
                f.write("CREATE TABLE IF NOT EXISTS students (\n")
                f.write("    id INTEGER PRIMARY KEY AUTOINCREMENT,\n")
                f.write("    student_id VARCHAR(50) UNIQUE,\n")
                f.write("    username VARCHAR(50) UNIQUE,\n")
                f.write("    password VARCHAR(255),\n")
                f.write("    title VARCHAR(50),\n")
                f.write("    first_name VARCHAR(100),\n")
                f.write("    last_name VARCHAR(100),\n")
                f.write("    class_level VARCHAR(50),\n")
                f.write("    room VARCHAR(50)\n")
                f.write(");\n\n")

                for idx, row in enumerate(rows):
                    if idx == 0:
                        continue # Skip header
                    
                    cells = row.findall("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}c")
                    # Columns logic: A=0, B=1, C=2, D=3, E=4, F=5, G=6
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
                            data_list[col_idx] = val
                            
                    if not data_list[1]: # No student ID
                        continue
                        
                    student_id = data_list[1]
                    title = data_list[2]
                    first_name = data_list[3]
                    last_name = data_list[4]
                    class_level = data_list[5]
                    room = data_list[6]
                    
                    # Username and password as student ID
                    username = student_id
                    password = student_id
                    
                    # Simple escape for SQL
                    def escape(s):
                        if s is None:
                            return ""
                        return str(s).replace("'", "''")
                    
                    sql = f"INSERT INTO students (student_id, username, password, title, first_name, last_name, class_level, room) VALUES ('{escape(student_id)}', '{escape(username)}', '{escape(password)}', '{escape(title)}', '{escape(first_name)}', '{escape(last_name)}', '{escape(class_level)}', '{escape(room)}');\n"
                    f.write(sql)
                    
        print(f"Successfully generated {sql_output_path}")
    except Exception as e:
        print(f"Error parsing Excel file: {e}")

if __name__ == "__main__":
    parse_excel_to_sql()
