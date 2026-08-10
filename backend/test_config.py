import os
from dotenv import load_dotenv

load_dotenv()

api_key = os.getenv("OPENAI_API_KEY")

if api_key:
    print("OPENAI_API_KEY: FOUND")
    print("Key length:", len(api_key))
else:
    print("OPENAI_API_KEY: NOT FOUND")