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
        "http://localhost:3000",
        "https://localhost:5000",
        "https://127.0.0.1:5000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ================== Groq ==================
api_key = os.getenv("GROQ_API_KEY")
client = Groq(api_key=api_key)

# ================== Whisper ==================
# Cambiado de "base" a "medium"
WHISPER_MODEL_NAME = "medium"  
whisper_model = whisper.load_model(WHISPER_MODEL_NAME)

# ================== ESTADO DE SESIÓN (paginación catálogo) ==================
session_state = {
    "categoria": None,
    "page": 1,
    "modo": None,  # "catalogo" o "chat"
}

# ================== LINK de Google Maps (no embebido) ==================
def generar_link_maps(nombre, direccion):
    consulta = f"{nombre}, Paso de la Patria, Corrientes, Argentina {direccion or ''}"
    encoded = quote(consulta)
    return f"https://www.google.com/maps/search/?api=1&query={encoded}"

# ================== Google Maps EMBED ==================
def generar_embed_url(nombre, direccion):
    base = "https://www.google.com/maps/embed/v1/place"
    key = os.getenv("MAPS_EMBED_KEY")
    consulta = quote(f"{nombre} {direccion} Paso de la Patria Corrientes")
    return f"{base}?key={key}&q={consulta}"

# ================== AUDIO (TTS) ==================
async def generate_audio_base64(text):
    voice = "es-AR-ElenaNeural"
    communicate = edge_tts.Communicate(text, voice)

    audio_bytes = b""
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio_bytes += chunk["data"]

    return base64.b64encode(audio_bytes).decode("utf-8")

# ================== LISTADO / PAGINACIÓN CATÁLOGO ==================
def listar_lugares_categoria(categoria, page=1, per_page=5):
    lugares = CATALOGO.get(categoria, [])
    start = (page - 1) * per_page
    end = start + per_page
    bloque = lugares[start:end]

    if not bloque:
        return "No hay más resultados para mostrar.", [], "No hay más resultados para mostrar."

    # Texto largo para el CHAT
    texto_chat = f"Lugares de {categoria} en Paso de la Patria:\n\n"

    # Texto corto para la VOZ
    texto_voz = f"Te dejo algunas opciones de {categoria} en Paso de la Patria. "

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

# ================== LLM: Análisis de intención + respuesta ==================
def analizar_entrada_llm(texto_usuario: str) -> dict:
    """
    Usa el LLM para:
    - decidir si es para catálogo (gastronomía, alojamientos, etc.) o charla libre
    - devolver un JSON con:
        modo: "catalogo" | "chat"
        categoria: "gastronomia" | "alojamientos" | "inmobiliarias" | "transporte" | "pesca" | "playas" | "otra"
        respuesta_chat: texto completo para mostrar en pantalla
        respuesta_voz: texto corto y natural para leer por TTS
    """

    system_prompt = """
Eres una guía turística experta EXCLUSIVAMENTE de Paso de la Patria, Corrientes, Argentina.
Tu único tema es Paso de la Patria y su zona inmediata (Corrientes capital, río Paraná frente a Paso, islas cercanas).
NO hablas de otras ciudades, países, política, fútbol, tecnología general, ni de temas que no tengan relación con Paso de la Patria.
Siempre que el usuario pregunte algo que NO tenga que ver con Paso de la Patria o su zona cercana, debes responder algo como:
"Solo puedo ayudarte con información turística y general sobre Paso de la Patria, Corrientes, Argentina."

Responde siempre en español rioplatense, con tono amable y sencillo.

Debes analizar el mensaje del usuario y devolver SIEMPRE un JSON con este formato EXACTO:

{
  "modo": "catalogo" o "chat",
  "categoria": "gastronomia" | "alojamientos" | "inmobiliarias" | "transporte" | "pesca" | "playas" | "otra",
  "respuesta_chat": "texto para mostrar en pantalla",
  "respuesta_voz": "texto corto para leer en voz"
}

Reglas:
- Usa "modo": "catalogo" cuando el usuario claramente pide lugares PARA IR EN PASO DE LA PATRIA,
  por ejemplo: restaurantes, bares, heladerías, parrillas, campings, hoteles,
  cabañas, posadas, inmobiliarias para alquilar casas, servicios de pesca, lanchas,
  colectivos, transporte, playas o balnearios en Paso de la Patria.
- En ese caso elegí una "categoria" de las permitidas que mejor encaje.
- Usa "modo": "chat" para preguntas generales SOBRE PASO DE LA PATRIA
  (historia del lugar, clima, consejos, qué hacer, cuándo ir, precios aproximados, fiestas, etc).
- Si el usuario pregunta sobre otro lugar (por ejemplo Resistencia, Buenos Aires, España, etc.),
  o sobre temas que no sean Paso de la Patria, debes:
    - Usar "modo": "chat"
    - Usar "categoria": "otra"
    - Explicar claramente que solo puedes hablar de Paso de la Patria y su zona cercana.
- Si no estás seguro, usa "modo": "chat" y "categoria": "otra", pero SIEMPRE mantén el tema centrado en Paso de la Patria.
- "respuesta_voz" debe ser más corta que "respuesta_chat", natural para leerla,
  sin enumerar 20 cosas seguidas.
- NO envíes nada de texto fuera del JSON, ni explicaciones.
"""

    user_message = texto_usuario.strip()

    resp = client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        temperature=0.3,
    )

    contenido = resp.choices[0].message.content.strip()

    # Asegurarnos de quedarnos solo con el JSON (por si viniera con ```json ```).
    try:
        start = contenido.find("{")
        end = contenido.rfind("}") + 1
        json_str = contenido[start:end]
        data = json.loads(json_str)
    except Exception:
        # Fallback muy simple si algo sale mal
        data = {
            "modo": "chat",
            "categoria": "otra",
            "respuesta_chat": "Perdón, tuve un problema para procesar tu mensaje. Solo puedo ayudarte con información de Paso de la Patria, Corrientes, Argentina. ¿Podés repetir o reformular la pregunta?",
            "respuesta_voz": "Perdón, solo puedo ayudarte con Paso de la Patria. ¿Podés repetir la pregunta?"
        }

    # Defaults por si faltara algo
    if not isinstance(data, dict):
        data = {}
    data.setdefault("modo", "chat")
    data.setdefault("categoria", "otra")
    data.setdefault("respuesta_chat", "No entendí bien, pero solo puedo ayudarte con información de Paso de la Patria, Corrientes, Argentina.")
    data.setdefault("respuesta_voz", data["respuesta_chat"])

    return data

# ================== ENDPOINT PRINCIPAL ==================
@app.post("/api/chat/audio")
async def chat_audio(file: UploadFile = File(...)):
    temp = f"temp_{uuid.uuid4().hex}.wav"

    try:
        # Guardar audio temporal
        with open(temp, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Transcribir con Whisper (medium)
        result = whisper_model.transcribe(temp, language="es")
        user_text = result["text"].strip()

        global session_state
        lower_text = user_text.lower()

        # ---- Caso "mostrar más" para seguir en la misma categoría de catálogo ----
        if (
            "mostrar más" in lower_text
            or "mostrame más" in lower_text
            or "mostrar mas" in lower_text
            or "mostrame mas" in lower_text
            or lower_text.strip() in ["mas", "más"]
        ):
            if session_state["modo"] == "catalogo" and session_state["categoria"]:
                session_state["page"] += 1
                ai_reply_list, maps_list, voice_text = listar_lugares_categoria(
                    session_state["categoria"],
                    session_state["page"]
                )
                # En este caso, usamos solo la continuación del listado
                ai_reply = ai_reply_list
            else:
                ai_reply = (
                    "No tengo una lista activa para seguir mostrando, pero podés pedirme "
                    "lugares de gastronomía, alojamiento, pesca, playas o transporte en Paso de la Patria."
                )
                maps_list = []
                voice_text = ai_reply

        else:
            # ---- Analizar intención con LLM ----
            analisis = analizar_entrada_llm(user_text)

            modo = analisis.get("modo", "chat")
            categoria = analisis.get("categoria", "otra")
            respuesta_chat_llm = analisis.get("respuesta_chat")
            respuesta_voz_llm = analisis.get("respuesta_voz") or respuesta_chat_llm

            # Forzar a que solo use catálogo si la categoría existe en CATALOGO
            if modo == "catalogo" and categoria in CATALOGO:
                # Guardamos estado para paginación
                session_state["modo"] = "catalogo"
                session_state["categoria"] = categoria
                session_state["page"] = 1

                texto_lista, maps_list, voz_catalogo = listar_lugares_categoria(categoria, 1)

                # Combinamos la explicación del LLM + la lista de lugares
                ai_reply = f"{respuesta_chat_llm}\n\n{texto_lista}"
                voice_text = voz_catalogo

            else:
                # Modo charla libre (sin catálogo), SIEMPRE sobre Paso de la Patria
                session_state["modo"] = "chat"
                session_state["categoria"] = None
                session_state["page"] = 1

                ai_reply = respuesta_chat_llm
                maps_list = []
                voice_text = respuesta_voz_llm

        # Generar audio TTS
        audio_b64 = await generate_audio_base64(voice_text)

        # Limpiar archivo temporal
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
