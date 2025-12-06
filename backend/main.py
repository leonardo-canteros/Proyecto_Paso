import os
import uuid
import json
import base64
import shutil
from typing import Dict, Any, List
from urllib.parse import quote

from fastapi import FastAPI, UploadFile, File, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.concurrency import run_in_threadpool

from groq import AsyncGroq
from dotenv import load_dotenv
import whisper
import edge_tts


from catalogo_paso import CATALOGO  # tu catálogo

# ================== CONFIG BÁSICA ==================

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
python - << "EOF"
from dotenv import load_dotenv
from groq import Groq
import os

load_dotenv()
key = os.getenv("GROQ_API_KEY")
print("KEY:", repr(key), "len=", len(key))

client = Groq(api_key=key)

try:
    models = client.models.list()
    print("OK, modelos:", [m.id for m in models.data][:5])
except Exception as e:
    print("ERROR:", e)
EOF

print("GROQ_API_KEY DEBUG:", repr(GROQ_API_KEY), "len=", len(GROQ_API_KEY))


MAPS_EMBED_KEY = os.getenv("MAPS_EMBED_KEY")  #

client = AsyncGroq(api_key=GROQ_API_KEY)

WHISPER_MODEL_NAME = "medium"
print(f"Cargando modelo Whisper ({WHISPER_MODEL_NAME})...")
whisper_model = whisper.load_model(WHISPER_MODEL_NAME)
print("Whisper cargado.")

TEMP_DIR = "temp_audio"
TTS_DIR = "tts_output"
os.makedirs(TEMP_DIR, exist_ok=True)
os.makedirs(TTS_DIR, exist_ok=True)

PAGE_SIZE = 3

app = FastAPI()

# CORS para tu esquema con Caddy
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://localhost:3000",
        "https://localhost:5000",
        "https://localhost:4000",
        "http://localhost:3000",
        "http://localhost:8000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ================== SESIONES POR USUARIO ==================

sesiones_activas: Dict[str, Dict[str, Any]] = {}


def get_session(user_id: str) -> Dict[str, Any]:
    if user_id not in sesiones_activas:
        sesiones_activas[user_id] = {
            "categoria": None,
            "page": 1,
            "modo": None,  # "catalogo" o "chat"
        }
    return sesiones_activas[user_id]


# ================== UTILIDADES ==================

async def transcribir_audio(ruta_audio: str) -> str:
    try:
        result = await run_in_threadpool(
            whisper_model.transcribe,
            ruta_audio,
            language="es",
        )
        return (result.get("text") or "").strip()
    except Exception as e:
        print(f"Error en transcripción: {e}")
        return ""


async def texto_a_voz(texto: str) -> str:
    if not texto:
        return ""

    nombre_archivo = f"{uuid.uuid4()}.mp3"
    ruta_salida = os.path.join(TTS_DIR, nombre_archivo)

    try:
        communicate = edge_tts.Communicate(
            texto,
            voice="es-AR-ElenaNeural",
        )
        await communicate.save(ruta_salida)

        with open(ruta_salida, "rb") as f:
            audio_bytes = f.read()

        audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
        return audio_b64
    except Exception as e:
        print(f"Error en TTS: {e}")
        return ""
    finally:
        try:
            if os.path.exists(ruta_salida):
                os.remove(ruta_salida)
        except OSError:
            pass


def obtener_items_catalogo(categoria: str, page: int) -> List[Dict[str, Any]]:
    items = CATALOGO.get(categoria, [])
    start = (page - 1) * PAGE_SIZE
    end = start + PAGE_SIZE
    return items[start:end]


def generar_embed_url(nombre: str, direccion: str) -> str:
    """
    Igual idea que tu versión vieja:
    - Usa Google Maps Embed API si hay MAPS_EMBED_KEY
    - Siempre acota la búsqueda a PASO DE LA PATRIA, CORRIENTES, ARGENTINA
    """
    consulta_texto = f"{nombre}, Paso de la Patria, Corrientes, Argentina {direccion or ''}"
    encoded = quote(consulta_texto)

    if MAPS_EMBED_KEY:
        base = "https://www.google.com/maps/embed/v1/place"
        return f"{base}?key={MAPS_EMBED_KEY}&q={encoded}"
    else:
        # Fallback sin key: search normal (no embebido)
        return f"https://www.google.com/maps/search/?api=1&query={encoded}"


def construir_links_maps(items: List[Dict[str, Any]]) -> List[str]:
    links = []
    for item in items:
        nombre = item.get("nombre") or ""
        direccion = item.get("direccion") or ""
        url = generar_embed_url(nombre, direccion)
        links.append(url)
    return links


async def llamar_llm_intencion(
    texto_usuario: str,
    sesion: Dict[str, Any],
) -> Dict[str, Any]:
    # 👇 acá dejamos bien fuerte el contexto de PASO DE LA PÁTRIA
    prompt_sistema = (
        "Eres un asistente turístico ESPECIALIZADO en PASO DE LA pátria, "
        "CORRIENTES, ARGENTINA. "
        "Siempre respondes pensando en esa localidad y NUNCA recomiendas lugares "
        "de otras ciudades o provincias. "
        "Tu trabajo es decidir la intención del usuario y devolver SIEMPRE un JSON."
    )

    prompt_usuario = f"""
Texto del usuario: "{texto_usuario}"

Estado actual de la sesión:
- modo: {sesion.get("modo")}
- categoria: {sesion.get("categoria")}
- page: {sesion.get("page")}

Debes responder SOLO un JSON con este formato:

{{
  "modo": "catalogo" o "chat",
  "categoria": "gastronomia" o "alojamientos" o "pesca" o "transporte" o "ninguna",
  "pagina_delta": -1, 0 o 1,
  "reset_paginacion": true o false,
  "respuesta": "texto que le dirás al usuario"
}}

Reglas:
- TODO lo que recomiendes es de PASO DE LA PÁTRIA, CORRIENTES, ARGENTINA.
- Si el usuario dice algo como "mostrar más", "siguiente", "otra opción", etc.,
  usa modo = "catalogo", pagina_delta = 1 y NO cambies la categoría.
- Si el usuario cambia de tema ("ahora quiero ver hoteles"), entonces
  modo = "catalogo", categoria adecuada, reset_paginacion = true.
- Si el usuario hace preguntas generales, modo = "chat" y categoria = "ninguna".
- No hables de JSON en la respuesta, solo devuelve el JSON. en lo posible que la voz hable con la tilde en la a en PÁTRIA
"""

    try:
        completion = await client.chat.completions.create(
            model="llama-3.1-8b-instant",
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": prompt_sistema},
                {"role": "user", "content": prompt_usuario},
            ],
        )

        content = completion.choices[0].message.content
        data = json.loads(content)
    except Exception as e:
        print(f"Error LLM: {e}")
        data = {
            "modo": "chat",
            "categoria": "ninguna",
            "pagina_delta": 0,
            "reset_paginacion": False,
            "respuesta": "Tuve un pequeño error técnico, ¿podrías repetir la pregunta?",
        }

    modo = data.get("modo") or "chat"
    if modo not in ("catalogo", "chat"):
        modo = "chat"

    categoria = (data.get("categoria") or "ninguna").lower()
    valid_cats = ("gastronomia", "alojamientos", "pesca", "transporte", "ninguna")
    if categoria not in valid_cats:
        categoria = "ninguna"

    pagina_delta = data.get("pagina_delta", 0)
    if pagina_delta not in (-1, 0, 1):
        pagina_delta = 0

    reset_paginacion = bool(data.get("reset_paginacion", False))
    respuesta = data.get("respuesta") or "..."

    return {
        "modo": modo,
        "categoria": categoria,
        "pagina_delta": pagina_delta,
        "reset_paginacion": reset_paginacion,
        "respuesta": respuesta,
    }


# ================== ENDPOINT PRINCIPAL ==================

@app.post("/api/chat/audio")
async def chat_audio(
    file: UploadFile = File(...),
    user_id: str = Header(default="anon", alias="x-user-id"),
):
    if not file.content_type.startswith("audio/"):
        raise HTTPException(status_code=400, detail="El archivo debe ser un audio")

    nombre_temp = f"{uuid.uuid4()}_{file.filename}"
    ruta_temp = os.path.join(TEMP_DIR, nombre_temp)

    try:
        with open(ruta_temp, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        sesion = get_session(user_id)

        texto_usuario = await transcribir_audio(ruta_temp)
        if not texto_usuario:
            return {
                "user_text": "",
                "reply_text": "No pude escuchar nada, ¿podrías repetir?",
                "audio_base64": "",
                "maps_links": [],
            }

        decision = await llamar_llm_intencion(texto_usuario, sesion)

        sesion["modo"] = decision["modo"]
        if decision["modo"] == "catalogo":
            if decision["reset_paginacion"]:
                sesion["page"] = 1
            else:
                sesion["page"] = max(1, sesion["page"] + decision["pagina_delta"])
            if decision["categoria"] != "ninguna":
                sesion["categoria"] = decision["categoria"]

        catalog_items: List[Dict[str, Any]] = []
        maps_urls: List[str] = []
        mini_map_data: Dict[str, Any] = {}

        if sesion["modo"] == "catalogo" and sesion["categoria"]:
            catalog_items = obtener_items_catalogo(
                categoria=sesion["categoria"],
                page=sesion["page"],
            )
            maps_urls = construir_links_maps(catalog_items)
            if catalog_items:
                mini_map_data = {
                    "nombre": catalog_items[0].get("nombre"),
                    "direccion": catalog_items[0].get("direccion"),
                    "map_url": maps_urls[0] if maps_urls else None,
                }

        maps_links_cards = []
        for item, url in zip(catalog_items, maps_urls):
            maps_links_cards.append(
                {
                    "nombre": item.get("nombre"),
                    "direccion": item.get("direccion"),
                    "maps_url": url,
                }
            )

        audio_base64 = await texto_a_voz(decision["respuesta"])

        return {
            "user_text": texto_usuario,
            "reply_text": decision["respuesta"],
            "audio_base64": audio_base64,
            "maps_links": maps_links_cards,
            "modo": sesion["modo"],
            "categoria": sesion.get("categoria"),
            "page": sesion.get("page"),
            "mini_map_data": mini_map_data,
        }

    except Exception as e:
        print(f"Error crítico en endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        try:
            if os.path.exists(ruta_temp):
                os.remove(ruta_temp)
        except Exception:
            pass
