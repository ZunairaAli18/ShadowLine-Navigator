"use client";

import { OrbitControls, useTexture } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeElements } from "@react-three/fiber";
import { forwardRef, Suspense, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import * as THREE from "three";

import { GlBoundary } from "@/components/fx/GlBoundary";
import { bodyToScene, latLonToScene, type Vec3 } from "@/lib/sun";

/**
 * Live 3D Moon (DESIGN.md signature element 1).
 * - NASA SVS CGI Moon Kit colour + displacement maps (public domain; credited in the footer).
 * - Lit by the real Sun: `sunDir` is the Sun direction in the Moon body frame (see lib/sun.ts). The light
 *   lives inside the Moon's group, so the day/night line stays true while the Moon spins or is dragged.
 * - mode "hero": slow sway + drag to rotate. mode "fly": camera follows progressRef (0..1) from the full
 *   Moon down to the south pole (scroll scene).
 * - Renders only while on screen and the tab is visible (frameloop "never" otherwise). DPR capped at 2.
 * - lite (phones/tablets): DPR capped at 1.5, fewer sphere segments, no drag (the canvas ignores touches so the
 *   page scrolls over it), slow sway only. A WebGL failure calls onFail so the caller can show the 2D scene.
 */

export type GlobeSite = { id: string; lat: number; lon: number };

type Props = {
  sunDir?: Vec3;
  sites?: GlobeSite[];
  mode?: "hero" | "fly";
  progressRef?: RefObject<number>;
  onReady?: () => void;
  /** Lighter rendering for touch devices (see above). */
  lite?: boolean;
  /** WebGL / three.js failed to start. */
  onFail?: (message: string) => void;
  className?: string;
};

const DEFAULT_SUN: Vec3 = [1, 0.35, 0.1];
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

function SiteMarker({ position, phase }: { position: Vec3; phase: number }) {
  const halo = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!halo.current) return;
    const s = 1 + 0.35 * Math.sin(clock.elapsedTime * 2 + phase);
    halo.current.scale.setScalar(s);
    (halo.current.material as THREE.MeshBasicMaterial).opacity = 0.35 - 0.15 * Math.sin(clock.elapsedTime * 2 + phase);
  });
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[0.009, 12, 12]} />
        <meshBasicMaterial color="#d9ccff" toneMapped={false} />
      </mesh>
      <mesh ref={halo}>
        <sphereGeometry args={[0.022, 16, 16]} />
        <meshBasicMaterial color="#b9a6ff" transparent opacity={0.3} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>
    </group>
  );
}

/**
 * The textured lunar sphere (NASA SVS CGI Moon Kit colour + displacement), radius 1, MOON_ME orientation
 * in scene axes (lon 0 at +X, see lib/sun.ts). Shared by the hero/fly globe and the navigator's Moon map.
 * Suspends while the textures load.
 */
export const MoonSurface = forwardRef<THREE.Mesh, ThreeElements["mesh"] & { lite?: boolean }>(function MoonSurface({ lite = false, ...props }, ref) {
  const [color, disp] = useTexture(["/textures/moon-color-2k.jpg", "/textures/moon-displacement-1k.jpg"], (tex) => {
    const [c] = tex as THREE.Texture[];
    c.colorSpace = THREE.SRGBColorSpace;
    c.anisotropy = 4;
  });
  return (
    <mesh ref={ref} {...props}>
      <sphereGeometry args={lite ? [1, 96, 48] : [1, 192, 96]} />
      <meshStandardMaterial
        map={color}
        displacementMap={disp}
        displacementScale={0.014}
        displacementBias={-0.007}
        bumpMap={disp}
        bumpScale={3}
        roughness={1}
        metalness={0}
      />
    </mesh>
  );
});

function Moon({ sunDir, sites, mode, progressRef, onReady, lite }: Required<Pick<Props, "mode">> & Omit<Props, "className" | "mode" | "onFail">) {
  const group = useRef<THREE.Group>(null);
  const light = useRef<THREE.DirectionalLight>(null);
  const target = useMemo(() => new THREE.Vector3(...bodyToScene(sunDir ?? DEFAULT_SUN)).normalize(), [sunDir]);
  // View angle: turn the Moon so the subsolar meridian sits ~80° left of centre (terminator just right of centre). The lighting stays the real
  // Sun direction relative to the surface; we only choose which side faces the camera, so the lit side and
  // the true day/night line are in view (near new Moon the Earth-facing side is dark).
  const viewRot = useMemo(() => {
    const [sx, sy] = sunDir ?? DEFAULT_SUN;
    const subsolarLon = Math.atan2(sy, sx);
    return -Math.PI / 2 - (subsolarLon + THREE.MathUtils.degToRad(80));
  }, [sunDir]);
  const rot = useRef<number | null>(null);
  const current = useRef<THREE.Vector3 | null>(null);
  const lookAt = useMemo(() => new THREE.Vector3(), []);
  const { camera } = useThree();

  const readyCalled = useRef(false);
  useEffect(() => {
    if (!readyCalled.current) {
      readyCalled.current = true;
      onReady?.();
    }
  }, [onReady]);

  useFrame(({ clock }, dt) => {
    // Glide the light to the latest real Sun direction (no jumps).
    if (!current.current) current.current = target.clone();
    current.current.lerp(target, Math.min(1, dt * 1.5)).normalize();
    light.current?.position.copy(current.current).multiplyScalar(10);

    // Glide to the chosen view angle; in the hero, add a slow sway (±20°) instead of a full spin.
    if (group.current) {
      const sway = mode === "hero" ? 0.35 * Math.sin(clock.elapsedTime * 0.06) : 0;
      if (rot.current === null) rot.current = viewRot;
      rot.current += (viewRot - rot.current) * Math.min(1, dt * 1.2);
      group.current.rotation.y = rot.current + sway;
    }

    if (mode === "fly") {
      const p = ease(Math.min(1, Math.max(0, progressRef?.current ?? 0)));
      const lat = THREE.MathUtils.degToRad(-64 * p);
      const dist = THREE.MathUtils.lerp(4.4, 1.62, p);
      camera.position.set(0, dist * Math.sin(lat), dist * Math.cos(lat));
      lookAt.set(0, THREE.MathUtils.lerp(0, -0.93, p), THREE.MathUtils.lerp(0, 0.22, p));
      camera.lookAt(lookAt);
    }
  });

  return (
    // group.rotation.y is set every frame from viewRot (see above).
    <group ref={group}>
      <directionalLight ref={light} intensity={3.4} color="#fff6e8" />
      <MoonSurface lite={lite} />
      {sites?.map((s, i) => (
        <SiteMarker key={s.id} position={latLonToScene(s.lat, s.lon, 1.006)} phase={i * 0.9} />
      ))}
    </group>
  );
}

export default function MoonGlobe({ sunDir, sites, mode = "hero", progressRef, onReady, lite = false, onFail, className = "" }: Props) {
  const wrapper = useRef<HTMLDivElement>(null);
  const [onScreen, setOnScreen] = useState(false);
  const [tabVisible, setTabVisible] = useState(true);

  useEffect(() => {
    const el = wrapper.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting), { rootMargin: "100px" });
    io.observe(el);
    const onVis = () => setTabVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVis);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const active = onScreen && tabVisible;

  return (
    <div ref={wrapper} className={`${className} ${lite ? "pointer-events-none [&_*]:!pointer-events-none" : ""}`} data-globe-active={active ? "true" : "false"} data-globe-lite={lite ? "true" : undefined}>
      <GlBoundary onError={(m) => onFail?.(m)}>
      <Canvas
        dpr={lite ? [1, 1.5] : [1, 2]}
        frameloop={active ? "always" : "never"}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        camera={{ position: [0, 0, mode === "fly" ? 4.4 : 4.1], fov: 32, near: 0.05, far: 50 }}
        role={mode === "fly" ? undefined : "img"}
        aria-label={mode === "fly" ? undefined : `3D Moon, lit by the Sun's real current position.${lite ? "" : " Drag to rotate."}`}
      >
        <ambientLight intensity={0.05} color="#9fb8ff" />
        <Suspense fallback={null}>
          <Moon sunDir={sunDir} sites={sites} mode={mode} progressRef={progressRef} onReady={onReady} lite={lite} />
        </Suspense>
        {mode === "hero" && !lite && <OrbitControls enableZoom={false} enablePan={false} rotateSpeed={0.45} enableDamping />}
      </Canvas>
      </GlBoundary>
    </div>
  );
}
