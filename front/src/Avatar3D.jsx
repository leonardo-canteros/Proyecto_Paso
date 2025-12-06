// src/Avatar3D.jsx
import React, { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { AvatarModel } from "./AvatarModel";
import "./Avatar3D.css";

export default function Avatar3D({ state }) {
  return (
    <Canvas
      camera={{ position: [0, 1.1, 1.8], fov: 30 }}
      style={{ width: "100%", height: "100%" }}
    >
      <ambientLight intensity={5} />
      <directionalLight position={[1, 6, 10]} intensity={1} />

      <Suspense fallback={null}>
        <AvatarModel state={state} />
        <OrbitControls enableZoom={false} enablePan={false} enableRotate={false} />
      </Suspense>
    </Canvas>
  );
}