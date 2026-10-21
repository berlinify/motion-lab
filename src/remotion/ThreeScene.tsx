import { ThreeCanvas } from "@remotion/three";
import { Environment } from "@react-three/drei";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

// Use <ThreeCanvas> (not R3F's <Canvas>) so Remotion controls the render loop
// and context (useCurrentFrame) is available inside the 3D tree.
export const ThreeScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const rotation = interpolate(frame, [0, durationInFrames], [0, Math.PI * 2]);

  return (
    <AbsoluteFill style={{ background: "#101018" }}>
      <ThreeCanvas width={width} height={height} camera={{ position: [0, 0, 5], fov: 50 }}>
        <ambientLight intensity={0.4} />
        <directionalLight position={[3, 3, 3]} intensity={1.5} />
        <Environment preset="city" />
        <mesh rotation={[rotation * 0.5, rotation, 0]}>
          <torusKnotGeometry args={[1, 0.35, 256, 32]} />
          <meshStandardMaterial color="#6c5ce7" metalness={0.6} roughness={0.2} />
        </mesh>
      </ThreeCanvas>
    </AbsoluteFill>
  );
};
