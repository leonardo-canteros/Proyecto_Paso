// src/AvatarModel.jsx
import React, { useEffect } from "react";
import { useGLTF, useAnimations } from "@react-three/drei";

const MODELS = {
  greeting: "/models/greeting_control_gpt.glb",
  inactivo: "/models/idle_para_chat.glb",
  thinking: "/models/thinking_control_gpt.glb",
  talking: "/models/talking_control_gpt.glb",
  pointing: "/models/poiting_control_gpt.glb",
};

export function AvatarModel({ state }) {
  const file = MODELS[state] ?? MODELS.inactivo;

  const { scene, animations } = useGLTF(file);
  const { actions, names } = useAnimations(animations, scene);

  useEffect(() => {
    if (!actions || !names || names.length === 0) return;

    names.forEach((name) => actions[name]?.stop());

    const clip = actions[names[0]];
    if (clip) clip.reset().fadeIn(0.2).play();

    return () => clip?.fadeOut(0.2);
  }, [file, actions, names]);

  return (
    <primitive
      object={scene}
      position={[0, -1.55, 0]}
      scale={1.15}
    />
  );
}

Object.values(MODELS).forEach((p) => useGLTF.preload(p));
