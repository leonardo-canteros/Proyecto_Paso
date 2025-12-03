import React from "react";
import "./MiniMapa.css";

export default function MiniMapa({ url, onClose }) {
  if (!url) return null;

  return (
    <div className="mini-map">
      <button className="close-btn" onClick={onClose}>✖</button>

      <iframe
        src={url}
        width="100%"
        height="100%"
        style={{ border: 0 }}
        allowFullScreen
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      ></iframe>
    </div>
  );
}
