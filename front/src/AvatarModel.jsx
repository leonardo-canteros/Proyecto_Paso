import React, { useEffect } from "react";
import { useGLTF, useAnimations } from "@react-three/drei";

export function AvatarModel({ state }) {
  const gltf = useGLTF("/models/idle_para_chat.glb");
  const { scene, animations } = gltf;

  const { actions } = useAnimations(animations, scene);

  useEffect(() => {
    if (actions && actions["idle"]) {
      actions["idle"].reset().play();
    } else {
      // Reproduce la primera animación si no tiene nombre
      const first = Object.values(actions)[0];
      if (first) first.reset().play();
    }
  }, [actions]);

  return (
    <primitive
      object={scene}
      position={[0, -1.6, 0]}
      scale={1.2}
    />
  );
}
