from dotenv import load_dotenv
from groq import Groq
import os

# Cargar el .env
load_dotenv()

key = os.getenv("GROQ_API_KEY")
print("KEY:", repr(key), "len=", len(key))

client = Groq(api_key=key)

try:
    models = client.models.list()
    print("OK, primeros modelos:", [m.id for m in models.data][:5])
except Exception as e:
    print("ERROR llamando a Groq:")
    print(e)
