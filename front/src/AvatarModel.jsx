// src/AvatarModel.jsx
import React, { useEffect, useMemo, useRef } from "react";
import { useGLTF, useAnimations } from "@react-three/drei";
import { useGraph } from "@react-three/fiber";
import { SkeletonUtils } from "three-stdlib";

const MODELS = {
  greeting: "/models/Greeting.glb",
  inactivo: "/models/Idle.glb",
  thinking: "/models/thinking.glb",
  talking: "/models/Talking.glb",
  pointing: "/models/Pointing.glb",
};

export function AvatarModel({ state }) {
  // 1. Cargamos TODOS los modelos al mismo tiempo
  const greetingGLTF = useGLTF(MODELS.greeting);
  const idleGLTF = useGLTF(MODELS.inactivo);
  const thinkingGLTF = useGLTF(MODELS.thinking);
  const talkingGLTF = useGLTF(MODELS.talking);
  const pointingGLTF = useGLTF(MODELS.pointing);

  // 2. Definimos cuál será nuestro modelo "base" (el cuerpo visible)
  // Usamos useMemo para clonar la escena y asegurarnos de que es única
  const scene = useMemo(() => SkeletonUtils.clone(idleGLTF.scene), [idleGLTF.scene]);
  
  // Necesitamos conectar la geometría clonada al gráfico de three.js
  const { nodes } = useGraph(scene);

  // 3. Unificamos todas las animaciones en una sola lista
  const animations = useMemo(() => {
    const allAnimations = [];
    
    // Función auxiliar para renombrar y agregar clips
    const addClip = (gltf, name) => {
      if (gltf.animations.length > 0) {
        const clip = gltf.animations[0].clone(); // Clonamos para no mutar el original
        clip.name = name; // Le ponemos el nombre de nuestro estado (ej: "greeting")
        allAnimations.push(clip);
      }
    };

    addClip(greetingGLTF, "greeting");
    addClip(idleGLTF, "inactivo");
    addClip(thinkingGLTF, "thinking");
    addClip(talkingGLTF, "talking");
    addClip(pointingGLTF, "pointing");

    return allAnimations;
  }, [greetingGLTF, idleGLTF, thinkingGLTF, talkingGLTF, pointingGLTF]);

  // 4. Hook de animaciones usando la escena base y la lista combinada
  const { actions } = useAnimations(animations, scene);

  // 5. Lógica de transición (Blending)
  useEffect(() => {
    // Si la acción solicitada no existe, usar 'inactivo' por defecto
    const actionName = actions[state] ? state : "inactivo";
    const nextAction = actions[actionName];

    if (!nextAction) return;

    // Configurar la nueva animación
    // .reset() reinicia el tiempo si ya se había reproducido
    // .fadeIn(0.5) hace que la animación entre suavemente en 0.5 segundos
    // .play() la inicia
    nextAction.reset().fadeIn(0.5).play();

    // CLEANUP: Esta función se ejecuta cuando 'state' cambia, justo antes del siguiente efecto
    return () => {
      // Hacemos fadeOut de la animación que estaba sonando para mezclarla con la nueva
      nextAction.fadeOut(0.5);
    };
  }, [state, actions]);

  return (
    <primitive
      object={scene}
      position={[0, -1.55, 0]}
      scale={1.15}
    />
  );
}

// Pre-cargamos todos para evitar parpadeos iniciales
Object.values(MODELS).forEach((p) => useGLTF.preload(p));