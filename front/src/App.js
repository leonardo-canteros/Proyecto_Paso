import React, { useState, useRef, useEffect } from "react";
import axios from "axios";
import Lottie from "lottie-react";
import animationData from "./avatar.json";
import MiniMapa from "./MiniMapa";
import "./App.css";

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [messages, setMessages] = useState([]);
  const [mapsLinks, setMapsLinks] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [mapUrl, setMapUrl] = useState(null);

  // 🔇 estado para mute
  const [isMuted, setIsMuted] = useState(false);

  const API_URL = "https://localhost:4000";
  
  const lottieRef = useRef();
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const currentAudioRef = useRef(null);

  useEffect(() => {
    if (lottieRef.current) lottieRef.current.pause();
  }, []);

  const stopCurrentAudio = () => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
    }
  };
  
  const toggleMute = () => {
    if (!currentAudioRef.current) return;
  
    if (isMuted) {
      // Reanudar desde donde se pausó
      currentAudioRef.current.play();
    } else {
      // Pausar en el segundo actual
      currentAudioRef.current.pause();
    }
  
    setIsMuted(!isMuted);
  };
  

  const startRecording = async () => {
    stopCurrentAudio();
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

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

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

      if (data.audio_base64) playAudioBase64(data.audio_base64);
    } catch (error) {
      console.error("Error en backend:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const playAudioBase64 = (base64String) => {
    const audioSrc = `data:audio/mp3;base64,${base64String}`;
  
    // Si ya existe un audio cargado, solo cambiá la fuente si es un audio nuevo.
    if (!currentAudioRef.current) {
      currentAudioRef.current = new Audio();
      currentAudioRef.current.onended = () => lottieRef.current?.pause();
    }
  
    // Setear solo si cambió el audio
    if (currentAudioRef.current.src !== audioSrc) {
      currentAudioRef.current.src = audioSrc;
    }
  
    currentAudioRef.current.play();
  };

  return (
    <div className="App">

      <div className="header">
        <h1>🛶 Guía Paso de la Patria</h1>
        <span>Tu asistente turístico interactivo</span>
      </div>

      <div className="avatar-container">
        <Lottie
          lottieRef={lottieRef}
          animationData={animationData}
          loop
          autoplay={false}
        />
      </div>

      {/* 🟦 TARJETAS + CHAT EN FILA */}
      <div className="chat-row">

        {/* 🟩 TARJETAS IZQUIERDA */}
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

        {/* 🟦 CHAT */}
        <div className="chat-box">
          {messages.map((msg, i) => (
            <div key={i} className={`message ${msg.sender}`}>
              <span className={`bubble ${msg.sender}`}>{msg.text}</span>
            </div>
          ))}

          {isLoading && <p className="loading">Procesando...</p>}
        </div>

      </div>

      {/* MINI MAPA */}
      {mapUrl && <MiniMapa url={mapUrl} onClose={() => setMapUrl(null)} />}



      <button className="mute-button" onClick={toggleMute}>
        {isMuted ? "🔊 Reanudar" : "🔇 Pausar voz"}
      </button>


      {/* MIC BOTÓN */}
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
