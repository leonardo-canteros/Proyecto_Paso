// src/AvatarModel.jsx
import React, { useEffect, useMemo, useRef } from "react";
import { useGLTF, useAnimations } from "@react-three/drei";
import { useFrame, useGraph } from "@react-three/fiber";
import { MathUtils } from "three"; 
import { SkeletonUtils } from "three-stdlib";

const MODELS = {
  base: "/models/basemodel.glb",
  greeting: "/models/Greeting.glb",
  inactivo: "/models/Idle.glb",
  thinking: "/models/thinking.glb",
  talking: "/models/Talking.glb",
  pointing: "/models/Pointing.glb",
};

export function AvatarModel({ state }) {
  const baseModelGLTF = useGLTF(MODELS.base);
  const greetingGLTF = useGLTF(MODELS.greeting);
  const idleGLTF = useGLTF(MODELS.inactivo);
  const thinkingGLTF = useGLTF(MODELS.thinking);
  const talkingGLTF = useGLTF(MODELS.talking);
  const pointingGLTF = useGLTF(MODELS.pointing);

  const scene = useMemo(() => SkeletonUtils.clone(baseModelGLTF.scene), [baseModelGLTF.scene]);
  const { nodes } = useGraph(scene);

  const animations = useMemo(() => {
    const allAnimations = [];
    const addClip = (gltf, name) => {
      if (gltf.animations.length > 0) {
        const clip = gltf.animations[0].clone();
        clip.name = name;
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

  const { actions } = useAnimations(animations, scene);
  
  // Referencia para guardar el nombre de la acción anterior y actual
  const currentAction = useRef("inactivo");

  // 1. Lógica de activación inicial y cambio de estado
  useEffect(() => {
    // Determinamos el nombre de la acción válida o usamos fallback
    const actionName = actions[state] ? state : "inactivo";
    
    // Aseguramos que la animación objetivo se esté reproduciendo (peso 0 al inicio, pero 'running')
    if (actions[actionName]) {
      actions[actionName].reset().play(); // Play inicia, pero el peso lo maneja useFrame
    }
    
    currentAction.current = actionName;

  }, [state, actions]);


  // 2. Loop de animación (sucede 60 veces por segundo)
  useFrame((state, delta) => {
    // Velocidad de la transición (ajusta este número: más bajo = más lento/suave)
    const transitionSpeed = 2; 

    for (const name in actions) {
      const action = actions[name];
      if (!action) continue;

      // Si es la acción actual, queremos peso 1, si no, peso 0
      const targetWeight = name === currentAction.current ? 1 : 0;

      // MathUtils.lerp hace la transición suave hacia el objetivo
      action.setEffectiveWeight(
        MathUtils.lerp(action.getEffectiveWeight(), targetWeight, delta * transitionSpeed)
      );

      // Optimización: Si el peso es muy bajo (casi invisible), detenemos la animación para ahorrar CPU
      if (action.getEffectiveWeight() < 0.01 && targetWeight === 0) {
        action.stop();
      } else if (targetWeight === 1 && !action.isRunning()) {
        action.play();
      }
    }

    const headMesh = nodes.Wolf3D_Head; 
    const morphName = "mouthOpen"; 
    const morphIndex = headMesh.morphTargetDictionary[morphName];
    
    if (currentAction.current === "talking") {
      // 1. Obtenemos el tiempo actual del reloj de Three.js
      const time = state.clock.elapsedTime;

      // 2. Creamos una onda oscilante (Seno) que va de 0 a 1 repetidamente
      // Multiplicamos 'time' por 15 para que sea rápido (velocidad de habla)
      // Sumamos 1 y dividimos por 2 para que el valor siempre sea positivo (0 a 1)
      const movimiento = (Math.sin(time * 15) + 1) / 2;

      // 3. Asignamos el valor. Multiplicamos por 0.6 para que no abra la boca excesivamente (el 2 era mucho)
      headMesh.morphTargetInfluences[morphIndex] = movimiento * 0.6;
      
    } else {
      // Si no habla, boca cerrada (valor 0)
      headMesh.morphTargetInfluences[morphIndex] = 0;
    }
  });

  return (
    <primitive
      object={scene}
      position={[0, -1.55, 0]}
      scale={1.15}
    />
  );
}

Object.values(MODELS).forEach((p) => useGLTF.preload(p));