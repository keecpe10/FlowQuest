import os
from dotenv import load_dotenv
load_dotenv()
api_key = os.getenv("GEMINI_API_KEY")
import google.generativeai as genai
print("Key prefix:", api_key[:5] if api_key else "None")
try:
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel("gemini-1.5-flash")
    prompt = "Please summarize the following ideas from a student brainstorming session into 3-5 key bullet points. Keep it encouraging and easy to understand for students:\n\n- test"
    res = model.generate_content(prompt)
    print("Success:", res.text[:20])
except Exception as e:
    import traceback
    traceback.print_exc()
