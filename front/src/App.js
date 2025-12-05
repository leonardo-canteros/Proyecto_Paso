import React, { useState, useRef, useEffect } from "react";
import axios from "axios";
import MiniMapa from "./MiniMapa";
import "./App.css";
import Avatar3D from "./Avatar3D";

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [messages, setMessages] = useState([]);
  const [mapsLinks, setMapsLinks] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [mapUrl, setMapUrl] = useState(null);
  const [isMuted, setIsMuted] = useState(false);

  // 🟩 Estado del Avatar 3D
  const [avatarState, setAvatarState] = useState("greeting");

  // 🟦 Greeting inicial → Idle
  useEffect(() => {
    const t = setTimeout(() => setAvatarState("inactivo"), 3000);
    return () => clearTimeout(t);
  }, []);

  const API_URL = "https://localhost:4000";

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const currentAudioRef = useRef(null);

  // 🟥 Detener audio si está sonando
  const stopCurrentAudio = () => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
    }
  };

  // 🔇 Mute / Unmute
  const toggleMute = () => {
    if (!currentAudioRef.current) return;

    if (isMuted) {
      currentAudioRef.current.play();
      setAvatarState("talking");
    }
    else {
      currentAudioRef.current.pause();
      setAvatarState("inactivo");
    }
  

    setIsMuted(!isMuted);
  };

  // 🎤 INICIO DE GRABACIÓN
  const startRecording = async () => {
    stopCurrentAudio();
    setAvatarSafely("thinking");
  
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];
  
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
  
      mediaRecorderRef.current.onstop = sendAudioToBackend;
      mediaRecorderRef.current.start();
      setIsRecording(true);
  
    } catch (error) {
      alert("Error con el micrófono 🎤");
    }
  };
  

  // 🎤 FIN DE GRABACIÓN
  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setAvatarSafely("thinking"); // sigue pensando hasta que llegue la respuesta
    }
  };

  // 📤 ENVÍA EL AUDIO AL BACKEND
  const sendAudioToBackend = async () => {
    setIsLoading(true);
    setAvatarSafely("thinking");

    const audioBlob = new Blob(audioChunksRef.current, { type: "audio/wav" });

    const formData = new FormData();
    formData.append("file", audioBlob, "mensaje.wav");

    try {
      const response = await axios.post(`${API_URL}/api/chat/audio`, formData, {
        headers: { "ngrok-skip-browser-warning": "69420" },
      });

      const data = response.data;

      // Mensajes
      setMessages((prev) => [
        ...prev,
        { sender: "user", text: data.user_text },
        { sender: "ai", text: data.reply_text },
      ]);

      setMapsLinks(data.maps_links || []);

      // Reproducir voz si viene audio
      if (data.audio_base64) playAudioBase64(data.audio_base64);

    } catch (e) {
      console.error("Error en backend:", e);
      setAvatarState("inactivo");
    } finally {
      setIsLoading(false);
    }
  };

  
  // --- CONTROL SEGURO DEL ESTADO DEL AVATAR ---
  const setAvatarSafely = (newState) => {
    setAvatarState((prev) => {
      // ❌ Si está hablando, NADIE puede cambiar el estado  
      if (prev === "talking" && newState !== "inactivo") {
        return prev;
      }
      return newState;
    });
  };


    // 🔊 REPRODUCIR AUDIO DEL BACKEND
    const playAudioBase64 = (base64String) => {
      const audioSrc = `data:audio/mp3;base64,${base64String}`;
    
      // Crear audio una sola vez
      if (!currentAudioRef.current) {
        currentAudioRef.current = new Audio();
      }
    
      const audio = currentAudioRef.current;
    
      // Al terminar de hablar → idle
      audio.onended = () => {
        console.log("▶ Audio terminado → vuelve a inactivo");
        setAvatarSafely("inactivo");
      };
    
      // Cargar el nuevo audio
      audio.src = audioSrc;
      audio.load();
    
      // Cuando el audio YA se puede reproducir → recién ahí poner talking
      audio.oncanplaythrough = () => {
        console.log("▶ Audio listo → talking activado!");
        setAvatarSafely("talking");
    
        // Reproducir sí o sí
        audio.play().catch(err => {
          console.error("Error al reproducir:", err);
        });
      };
    };
  

  return (
    <div className="App">

      {/* HEADER */}
      <div className="header">
        <h1>🛶 Guía Paso de la Patria</h1>
        <span>Tu asistente turístico interactivo</span>
      </div>

      {/* AVATAR */}
      <div className="avatar-container" style={{ height: "500px" }}>
        <Avatar3D state={avatarState} />
      </div>

      {/* TARJETAS + CHAT */}
      <div className="chat-row">
        {/* TARJETAS DE MAPS */}
        {mapsLinks.length > 0 && (
          <div className="cards-container">
            {mapsLinks.map((m, i) => (
              <div
                key={i}
                className="card"
                onClick={() => {
                  setAvatarState("pointing");
                  setMapUrl(m.maps_url);

                  setTimeout(() => setAvatarState("inactivo"), 1500);
                }}
              >
                <h4>{m.nombre}</h4>
                <p>{m.direccion}</p>
                <button>Ver en Maps</button>
              </div>
            ))}
          </div>
        )}

        {/* CHAT */}
        <div className="chat-box">
          {messages.map((msg, i) => (
            <div key={i} className={`message ${msg.sender}`}>
              <span className={`bubble ${msg.sender}`}>{msg.text}</span>
            </div>
          ))}

          {isLoading && <p className="loading">Procesando...</p>}
        </div>
      </div>

      {/* MAPA */}
      {mapUrl && <MiniMapa url={mapUrl} onClose={() => setMapUrl(null)} />}

      {/* BOTÓN DE MUTE */}
      <button className="mute-button" onClick={toggleMute}>
        {isMuted ? "🔊 Reanudar" : "🔇 Pausar voz"}
      </button>

      {/* MIC */}
      <button
        className={`mic-button ${isRecording ? "recording" : ""}`}
        onMouseDown={startRecording}
        onMouseUp={stopRecording}
      >
        🎙️
      </button>

      <p className="hint">Mantén presionado para hablar</p>

    </div>
  );
}

export default App;
