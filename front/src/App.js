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
  const [avatarState, setAvatarState] = useState("greeting");

  const API_URL = "https://localhost:4000";

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const currentAudioRef = useRef(null);
  const requestIdRef = useRef(0);
  const isAudioPlayingRef = useRef(false);
  const userIdRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => setAvatarState("inactivo"), 3000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    let uid = localStorage.getItem("paso_user_id");
    if (!uid) {
      uid = crypto.randomUUID();
      localStorage.setItem("paso_user_id", uid);
    }
    userIdRef.current = uid;
  }, []);

  const stopCurrentAudio = () => {
    const audio = currentAudioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    isAudioPlayingRef.current = false;
  };

  const setAvatarSafely = (newState) => {
    setAvatarState((prev) => {
      if (prev === "talking" && newState !== "inactivo") return prev;
      return newState;
    });
  };

  const toggleMute = () => {
    const audio = currentAudioRef.current;

    if (!audio) {
      setIsMuted((m) => !m);
      return;
    }

    if (isMuted) {
      audio.play();
      setAvatarState("talking");
    } else {
      audio.pause();
      setAvatarState("inactivo");
    }

    setIsMuted(!isMuted);
  };

  const startRecording = async (e) => {
    e?.preventDefault?.();
    if (isRecording) return;

    stopCurrentAudio();
    setIsMuted(false);

    requestIdRef.current += 1;
    const myRequestId = requestIdRef.current;

    setAvatarSafely("thinking");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorderRef.current.onstop = () => sendAudioToBackend(myRequestId);

      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (error) {
      console.error(error);
      alert("Error con el micrófono 🎤");
      setAvatarSafely("inactivo");
    }
  };

  const stopRecording = () => {
    if (!isRecording) return;
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setAvatarSafely("thinking");
    }
  };

  const sendAudioToBackend = async (requestId) => {
    setIsLoading(true);
    setAvatarSafely("thinking");

    const audioBlob = new Blob(audioChunksRef.current, { type: "audio/wav" });
    const formData = new FormData();
    formData.append("file", audioBlob, "mensaje.wav");

    try {
      const response = await axios.post(`${API_URL}/api/chat/audio`, formData, {
        headers: {
          "x-user-id": userIdRef.current || "anon",
        },
      });

      const data = response.data;

      // 👇 COINCIDE CON main.py (user_text / reply_text / maps_links)
      setMessages((prev) => [
        ...prev,
        { sender: "user", text: data.user_text },
        { sender: "ai", text: data.reply_text },
      ]);

      setMapsLinks(data.maps_links || []);

      if (data.audio_base64) {
        playAudioBase64(data.audio_base64, requestId);
      } else {
        setAvatarSafely("inactivo");
      }
    } catch (e) {
      console.error("Error en backend:", e);
      setAvatarState("inactivo");
    } finally {
      setIsLoading(false);
    }
  };

  const playAudioBase64 = (base64String, requestId) => {
    if (!base64String) return;

    if (requestId !== requestIdRef.current) {
      console.log("Respuesta vieja ignorada", requestId);
      return;
    }

    if (isRecording) {
      console.log("Grabando → no reproduzco audio IA");
      return;
    }

    stopCurrentAudio();

    if (!currentAudioRef.current) {
      currentAudioRef.current = new Audio();
    }

    const audio = currentAudioRef.current;
    const src = `data:audio/mp3;base64,${base64String}`;
    audio.src = src;
    audio.load();

    audio.onended = () => {
      isAudioPlayingRef.current = false;
      setAvatarSafely("inactivo");
    };

    audio.oncanplaythrough = () => {
      if (requestId !== requestIdRef.current || isRecording) {
        isAudioPlayingRef.current = false;
        return;
      }

      isAudioPlayingRef.current = true;
      setAvatarSafely("talking");

      audio.play().catch((err) => console.error("Error al reproducir:", err));
    };
  };

  return (
    <div className="App">
      <div className="header">
        <h1>🛶 Guía Paso de la Patria</h1>
        <span>Tu asistente turístico interactivo</span>
      </div>

      <div className="avatar-wrapper">
        <Avatar3D state={avatarState} />
      </div>

      <div className="chat-row">
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
        onMouseLeave={stopRecording}
        onTouchStart={startRecording}
        onTouchEnd={stopRecording}
      >
        🎙️
      </button>

      <p className="hint">Mantén presionado para hablar</p>
    </div>
  );
}

export default App;
