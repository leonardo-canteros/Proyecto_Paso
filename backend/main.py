from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# Habilitar CORS (para que React pueda llamar al backend)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    message: str

class ChatResponse(BaseModel):
    reply: str

@app.get("/")
def root():
    return {"message": "API Guia Paso IA funcionando 👋"}

@app.post("/api/chat/text", response_model=ChatResponse)
async def chat_text(req: ChatRequest):
    # Respuesta provisoria hasta conectar Groq
    return ChatResponse(reply=f"Hola! Dijiste: {req.message}")
