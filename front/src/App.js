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

  // 🟩 ESTADO DEL AVATAR 3D
  const [avatarState, setAvatarState] = useState("inactivo");

  const API_URL = "https://localhost:4000";

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const currentAudioRef = useRef(null);

  // 🔇 detener audio actual
  const stopCurrentAudio = () => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
    }
  };

  // 🔇 Mute/Unmute
  const toggleMute = () => {
    if (!currentAudioRef.current) return;

    if (isMuted) {
      currentAudioRef.current.play();
    } else {
      currentAudioRef.current.pause();
    }

    setIsMuted(!isMuted);
  };

  // 🎤 INICIO DE GRABACIÓN
  const startRecording = async () => {
    stopCurrentAudio();
    setAvatarState("thinking"); // 🟩 SEÑAL: escuchando/pensando

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
      setAvatarState("thinking"); // 🟩 esperando respuesta
    }
  };

  // 📤 ENVÍO AL BACKEND
  const sendAudioToBackend = async () => {
    setIsLoading(true);

    const audioBlob = new Blob(audioChunksRef.current, { type: "audio/wav" });
    const formData = new FormData();
    formData.append("file", audioBlob, "mensaje.wav");

    try {
      const response = await axios.post(
        `${API_URL}/api/chat/audio`,
        formData,
        {
          headers: {
            "ngrok-skip-browser-warning": "69420"
          }
        }
      );

      const data = response.data;

      setMessages((prev) => [
        ...prev,
        { sender: "user", text: data.user_text },
        { sender: "ai", text: data.reply_text },
      ]);

      setMapsLinks(data.maps_links || []);

      // ▶ reproducir voz de la IA
      if (data.audio_base64) playAudioBase64(data.audio_base64);
    } catch (error) {
      console.error("Error en backend:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // 🔊 REPRODUCCIÓN DE AUDIO
  const playAudioBase64 = (base64String) => {
    const audioSrc = `data:audio/mp3;base64,${base64String}`;

    if (!currentAudioRef.current) {
      currentAudioRef.current = new Audio();
      currentAudioRef.current.onended = () => {
        setAvatarState("inactivo"); // 🟩 vuelve a idle
      };
    }

    if (currentAudioRef.current.src !== audioSrc) {
      currentAudioRef.current.src = audioSrc;
    }

    setAvatarState("talking"); // 🟩 está hablando
    currentAudioRef.current.play();
  };

  return (
    <div className="App">
      <div className="header">
        <h1>🛶 Guía Paso de la Patria</h1>
        <span>Tu asistente turístico interactivo</span>
      </div>

      {/* 🟦 AVATAR 3D */}
      <div className="avatar-container" style={{ height: "500px" }}>
        <Avatar3D state={avatarState} />
      </div>

      {/* 🟦 TARJETAS + CHAT */}
      <div className="chat-row">
        {mapsLinks.length > 0 && (
          <div className="cards-container">
            {mapsLinks.map((m, i) => (
              <div key={i} className="card" onClick={() => setMapUrl(m.maps_url)}>
                <h4>{m.nombre}</h4>
                <p>{m.direccion}</p>
                <button>Ver en Maps</button>
              </div>
            ))}
          </div>
        )}

        <div className="chat-box">
          {messages.map((msg, i) => (
            <div key={i} className={`message ${msg.sender}`}>
              <span className={`bubble ${msg.sender}`}>{msg.text}</span>
            </div>
          ))}

          {isLoading && <p className="loading">Procesando...</p>}
        </div>
      </div>

      {mapUrl && <MiniMapa url={mapUrl} onClose={() => setMapUrl(null)} />}

      <button className="mute-button" onClick={toggleMute}>
        {isMuted ? "🔊 Reanudar" : "🔇 Pausar voz"}
      </button>

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
