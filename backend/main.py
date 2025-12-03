import os
import base64
import shutil
import uuid
import json
from urllib.parse import quote

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from groq import Groq
from dotenv import load_dotenv
import whisper
import edge_tts

from catalogo_paso import CATALOGO

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
    "*",
    "http://localhost:3000",
    "https://localhost:3000",
    "https://localhost:4000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Groq
api_key = os.getenv("GROQ_API_KEY")
client = Groq(api_key=api_key)

# Whisper
whisper_model = whisper.load_model("base")

# ====== INTENCIÓN ======
def detectar_intencion(texto):
    t = texto.lower()

    # Sinónimos + errores comunes de Whisper
    palabras_gastro = [
        "comer", "almorzar", "almuerzo",
        "morzar", "mosar", "al morzar", "al mosar", "morso", "almorzo",
        "cenar", "cena", "pescado", "resto", "restaurant", "parrilla"
    ]
    if any(p in t for p in palabras_gastro):
        return "gastronomia"

    palabras_aloj = [
        "hotel", "cabaña", "caba", "aloj", "alojar",
        "hospedar", "hospedaje", "dormir", "habitación", "habita", "posada"
    ]
    if any(p in t for p in palabras_aloj):
        return "alojamientos"

    palabras_inmob = ["inmobiliaria", "inmob", "alquilar", "alquiler", "casa"]
    if any(p in t for p in palabras_inmob):
        return "inmobiliarias"

    palabras_transp = ["colectivo", "bondi", "bus", "minibus", "transporte"]
    if any(p in t for p in palabras_transp):
        return "transporte"

    return None

# ====== LINK de Google Maps ======
def generar_link_maps(nombre, direccion):
    consulta = f"{nombre}, Paso de la Patria, Corrientes, Argentina {direccion or ''}"
    encoded = quote(consulta)
    return f"https://www.google.com/maps/search/?api=1&query={encoded}"

# ====== AUDIO ======
async def generate_audio_base64(text):
    voice = "es-AR-ElenaNeural"
    communicate = edge_tts.Communicate(text, voice)

    audio_bytes = b""
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio_bytes += chunk["data"]

    return base64.b64encode(audio_bytes).decode("utf-8")

# ====== PAGINACIÓN ======
session_state = {
    "categoria": None,
    "page": 1
}

def listar_lugares_categoria(categoria, page=1, per_page=5):
    lugares = CATALOGO.get(categoria, [])
    start = (page - 1) * per_page
    end = start + per_page
    bloque = lugares[start:end]

    if not bloque:
        return "No hay más resultados para mostrar.", [], "No hay más resultados para mostrar."

    # 🔹 Texto largo para el CHAT
    texto_chat = f"Lugares de {categoria}:\n\n"

    # 🔹 Texto corto para la VOZ
    texto_voz = f"Te dejo algunas opciones de {categoria}. "

    maps_list = []

    for i, lugar in enumerate(bloque, start=1):
        nombre = lugar["nombre"]
        direccion = lugar.get("direccion", "Sin dirección")
        telefono = ", ".join(lugar.get("telefonos", []))
        lat = lugar.get("lat", None)
        lng = lugar.get("lng", None)

        # Chat (completo)
        texto_chat += (
            f"• {nombre}\n"
            f"  Dirección: {direccion}\n"
            f"  Teléfono: {telefono}\n\n"
        )

        # Voz (solo nombre + dirección)
        texto_voz += f"Opción {i}: {nombre}, en {direccion}. "

        maps_list.append({
            "nombre": nombre,
            "direccion": direccion,
            "lat": lat,
            "lng": lng,
            "maps_url": generar_embed_url(nombre, direccion)
        })

    if end < len(lugares):
        texto_chat += "Decime 'mostrar más' para ver más lugares."

    return texto_chat.strip(), maps_list, texto_voz.strip()


def generar_embed_url(nombre, direccion):
    base = "https://www.google.com/maps/embed/v1/place"
    key = os.getenv("MAPS_EMBED_KEY")
    consulta = quote(f"{nombre} {direccion} Paso de la Patria Corrientes")
    return f"{base}?key={key}&q={consulta}"



# ====== ENDPOINT PRINCIPAL ======
@app.post("/api/chat/audio")
async def chat_audio(file: UploadFile = File(...)):
    temp = f"temp_{uuid.uuid4().hex}.wav"

    try:
        with open(temp, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        result = whisper_model.transcribe(temp)
        user_text = result["text"].strip()

        global session_state

        # Mostrar más
        if "más" in user_text.lower() or "mas" in user_text.lower():
            categoria = session_state["categoria"]
            if not categoria:
                ai_reply = "Primero pedime gastronomía, alojamiento, pesca o transporte."
                maps_list = []
                voice_text = ai_reply
            else:
                session_state["page"] += 1
                ai_reply, maps_list, voice_text = listar_lugares_categoria(
                    categoria,
                    session_state["page"]
                )

        else:
            categoria = detectar_intencion(user_text)
            if categoria:
                session_state["categoria"] = categoria
                session_state["page"] = 1
                ai_reply, maps_list, voice_text = listar_lugares_categoria(categoria, 1)
            else:
                ai_reply = "Decime si buscás gastronomía, alojamiento, pesca o transporte."
                maps_list = []
                voice_text = ai_reply


        audio_b64 = await generate_audio_base64(voice_text)


        os.remove(temp)

        return {
            "user_text": user_text,
            "reply_text": ai_reply,
            "maps_links": maps_list,
            "audio_base64": audio_b64
        }

    except Exception as e:
        if os.path.exists(temp):
            os.remove(temp)
        raise HTTPException(status_code=500, detail=str(e))
