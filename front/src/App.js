import React, { useState, useRef } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  // 1. Función para empezar a grabar
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = sendAudioToBackend;
      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (error) {
      console.error("Error al acceder al micrófono:", error);
      alert("No pudimos acceder al micrófono 🎤");
    }
  };

  // 2. Función para detener grabación
  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // 3. Enviar audio al Backend (FastAPI)
  const sendAudioToBackend = async () => {
    setIsLoading(true);
    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
    const formData = new FormData();
    formData.append("file", audioBlob, "mensaje.wav");

    // Agregamos mensaje temporal del usuario
    setMessages(prev => [...prev, { sender: 'user', text: '🎤 Audio enviado...' }]);

    try {
      // LLAMADA AL CEREBRO (Tu Backend)
      const response = await axios.post('http://127.0.0.1:8000/api/chat/audio', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const data = response.data;
      
      // Mostrar respuesta de la IA
      setMessages(prev => [
        ...prev.slice(0, -1), // Quitamos el "Enviando..."
        { sender: 'user', text: data.user_text },
        { sender: 'ai', text: data.reply_text }
      ]);

      // 4. Reproducir el audio de respuesta
      const audioUrl = `http://127.0.0.1:8000${data.audio_url}`;
      const audio = new Audio(audioUrl);
      audio.play();

    } catch (error) {
      console.error("Error conectando con el backend:", error);
      setMessages(prev => [...prev, { sender: 'system', text: '❌ Error: El backend no responde.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="App" style={{ backgroundColor: '#282c34', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', color: 'white', padding: '20px' }}>
      <h1>🐟 Guía Paso de la Patria IA</h1>
      
      <div style={{ width: '100%', maxWidth: '500px', flex: 1, overflowY: 'auto', marginBottom: '20px', border: '1px solid #555', borderRadius: '10px', padding: '10px' }}>
        {messages.length === 0 && <p style={{textAlign: 'center', color: '#aaa'}}>Presiona el micrófono y pregunta sobre pesca o turismo.</p>}
        {messages.map((msg, index) => (
          <div key={index} style={{ 
            textAlign: msg.sender === 'user' ? 'right' : 'left',
            margin: '10px 0' 
          }}>
            <span style={{ 
              backgroundColor: msg.sender === 'user' ? '#007bff' : '#444', 
              padding: '10px', 
              borderRadius: '10px',
              display: 'inline-block'
            }}>
              {msg.text}
            </span>
          </div>
        ))}
        {isLoading && <p style={{textAlign: 'center'}}>🤖 Pensando...</p>}
      </div>

      <button 
        onMouseDown={startRecording} 
        onMouseUp={stopRecording}
        onTouchStart={startRecording}
        onTouchEnd={stopRecording}
        style={{
          backgroundColor: isRecording ? '#dc3545' : '#28a745',
          color: 'white',
          border: 'none',
          borderRadius: '50%',
          width: '80px',
          height: '80px',
          fontSize: '40px',
          cursor: 'pointer',
          boxShadow: '0 4px 10px rgba(0,0,0,0.3)'
        }}
      >
        {isRecording ? '⏹️' : '🎙️'}
      </button>
      <p>{isRecording ? 'Soltá para enviar' : 'Mantené apretado para hablar'}</p>
    </div>
  );
}

export default App;