import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { PerspectiveCamera } from 'three';
import {
  Polyclinic,
  POLYCLINIC_COLLIDERS,
  DOCTOR_CHAIR_POS,
  PATIENT_CHAIR_POS,
} from './three/Polyclinic';
import { Player } from './three/Player';

function AdaptiveCameraFov() {
  const { camera, size } = useThree();
  const zoomedRef = useRef(false);
  const baseFovRef = useRef(55);
  const targetFovRef = useRef(55);

  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height);
    const targetHFov = (82 * Math.PI) / 180;
    const vFovRad = 2 * Math.atan(Math.tan(targetHFov / 2) / aspect);
    const baseFovDeg = Math.max(42, Math.min(68, (vFovRad * 180) / Math.PI));
    baseFovRef.current = baseFovDeg;
    targetFovRef.current = zoomedRef.current ? baseFovDeg * 0.4 : baseFovDeg;
  }, [size.width, size.height]);

  const zoomLevelRef = useRef(0);
  const applyZoom = () => {
    const z = zoomLevelRef.current;
    const base = baseFovRef.current;
    const min = base * 0.4;
    targetFovRef.current = base + (min - base) * z;
  };

  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (!document.pointerLockElement) return;
      e.preventDefault();
      const dir = e.deltaY > 0 ? -1 : 1;
      zoomLevelRef.current = Math.max(0, Math.min(1, zoomLevelRef.current + dir * 0.15));
      zoomedRef.current = zoomLevelRef.current > 0;
      applyZoom();
    };
    const isZoomKey = (e: KeyboardEvent) => e.key === 'z' || e.key === 'Z';
    const onDown = (e: KeyboardEvent) => {
      if (!isZoomKey(e) || !document.pointerLockElement) return;
      zoomLevelRef.current = 1;
      zoomedRef.current = true;
      applyZoom();
    };
    const onUp = (e: KeyboardEvent) => {
      if (!isZoomKey(e)) return;
      zoomLevelRef.current = 0;
      zoomedRef.current = false;
      applyZoom();
    };

    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, []);

  useFrame(() => {
    const cam = camera as PerspectiveCamera;
    if (!cam.isPerspectiveCamera) return;
    const target = targetFovRef.current;
    const diff = target - cam.fov;
    if (Math.abs(diff) < 0.05) {
      if (cam.fov !== target) {
        cam.fov = target;
        cam.updateProjectionMatrix();
      }
      return;
    }
    cam.fov += diff * 0.22;
    cam.updateProjectionMatrix();
  });

  return null;
}

function Loader() {
  return (
    <Html center>
      <div
        style={{
          fontFamily: 'Manrope, sans-serif',
          fontWeight: 800,
          color: 'var(--teal-700)',
          background: 'rgba(255,255,255,0.94)',
          padding: '10px 16px',
          border: '2px solid rgba(22,53,65,0.16)',
          borderRadius: 999,
          boxShadow: '0 18px 36px rgba(10, 24, 32, 0.12)',
          fontSize: 13,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        Loading simulation bay...
      </div>
    </Html>
  );
}

export function EncounterWorld({
  voiceActive,
  examineOpen,
  onInteract,
  onTalk,
}: {
  voiceActive: boolean;
  examineOpen: boolean;
  onInteract: (kind: 'desk' | 'bed' | 'triage', bedIndex?: number) => void;
  onTalk: (bedIndex: number | null) => void;
}) {
  const seatedHeight = 1.45;
  const playerSpawn = useMemo<[number, number, number]>(
    () => [DOCTOR_CHAIR_POS[0], seatedHeight, DOCTOR_CHAIR_POS[2]],
    [],
  );
  const doctorLookAt = useMemo<[number, number, number]>(
    () => [PATIENT_CHAIR_POS[0], 1.3, PATIENT_CHAIR_POS[2]],
    [],
  );

  return (
    <Canvas
      shadows
      camera={{ position: playerSpawn, fov: 55 }}
      style={{
        background:
          'radial-gradient(circle at top left, rgba(255,255,255,0.22), transparent 22%), linear-gradient(180deg, #d7e8ef 0%, #c4dce5 45%, #adcdd8 100%)',
      }}
    >
      <AdaptiveCameraFov />
      <Suspense fallback={<Loader />}>
        <Polyclinic
          voiceActive={voiceActive && !examineOpen}
          onCloseVoice={() => onTalk(null)}
        />
        <Player
          spawn={playerSpawn}
          colliders={POLYCLINIC_COLLIDERS}
          onInteract={onInteract}
          onTalk={onTalk}
          height={seatedHeight}
          locked
          lookAt={doctorLookAt}
          enableLook={!examineOpen}
        />
      </Suspense>
    </Canvas>
  );
}
