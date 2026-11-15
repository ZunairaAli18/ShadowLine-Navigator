"use client";

import { Html, Line, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import { MoonSurface } from "@/components/moon/MoonGlobe";
import { hitToLatLon, latLonToSceneVec } from "@/lib/globeMath";
import { bodyToScene, type Vec3 } from "@/lib/sun";

/**
 * Navigator "Moon map": interactive 3D Moon.
 * - Lit by the real Sun at the selected time (subsolar direction), Earth-visible zone tinted blue
 *   (shader on an overlay sphere: dot(normal, earthDir) > 0), thin boundary + terminator lines.
 * - Site markers (hover label, click = select), click anywhere else = custom site (raycast -> lat/lon).
 * - Camera presets with a smooth fly-to (instant under reduced motion). Zoom clamped, no auto-spin.
 * - frameloop "demand": renders only when something changes; "never" while hidden or off-screen.
 */

export type MapSite = { id: string; name: string; region: string; lat: number; lon: number };
export type CameraPreset = "near" | "far" | "pole" | "site";

type Props = {
  sunDirBody: Vec3;
  earthDirBody: Vec3;
  sites: MapSite[];
  currentSiteId: string | null;
  current: { lat: number; lon: number };
  preset: { kind: CameraPreset; nonce: number };
  reduced: boolean;
  onSelectSite: (id: string) => void;
  onPick: (lat: number, lon: number) => void;
  className?: string;
};

const DIST = { near: 3.9, far: 3.9, pole: 3.3, site: 2.8 } as const; // whole disk fits the frame at fov 35

const zoneVertex = /* glsl */ `
  varying vec3 vN;
  void main() {
    vN = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const zoneFragment = /* glsl */ `
  uniform vec3 uEarth;
  uniform vec3 uSun;
  varying vec3 vN;
  void main() {
    float d = dot(vN, uEarth);
    float tint = smoothstep(-0.005, 0.02, d) * 0.17;          // Earth in view: soft blue
    float edge = 1.0 - smoothstep(0.0, 0.0055, abs(d));       // Earth exactly on the horizon
    float term = 1.0 - smoothstep(0.0, 0.0035, abs(dot(vN, uSun))); // day/night line
    vec3 col = mix(vec3(0.37, 0.78, 1.0), vec3(1.0, 0.77, 0.42), term);
    float a = max(tint + edge * 0.75, term * 0.55);
    if (a < 0.003) discard;
    gl_FragColor = vec4(col, a);
  }
`;

function EarthZone({ earth, sun }: { earth: THREE.Vector3; sun: THREE.Vector3 }) {
  const uniforms = useMemo(() => ({ uEarth: { value: new THREE.Vector3(1, 0, 0) }, uSun: { value: new THREE.Vector3(1, 0, 0) } }), []);
  useEffect(() => {
    uniforms.uEarth.value.copy(earth);
    uniforms.uSun.value.copy(sun);
  }, [earth, sun, uniforms]);
  return (
    <mesh renderOrder={2} raycast={() => null}>
      <sphereGeometry args={[1.012, 128, 64]} />
      <shaderMaterial vertexShader={zoneVertex} fragmentShader={zoneFragment} uniforms={uniforms} transparent depthWrite={false} />
    </mesh>
  );
}

function Marker({
  site,
  isCurrent,
  hovered,
  onHover,
  onSelect,
  occluder,
}: {
  site: MapSite;
  isCurrent: boolean;
  hovered: boolean;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  occluder: React.RefObject<THREE.Mesh | null>;
}) {
  const pos = useMemo(() => latLonToSceneVec(site.lat, site.lon).map((v) => v * 1.012) as Vec3, [site.lat, site.lon]);
  return (
    <group position={pos}>
      <mesh>
        <sphereGeometry args={[isCurrent ? 0.018 : 0.011, 16, 16]} />
        <meshBasicMaterial color={isCurrent ? "#ffe2a8" : "#d9ccff"} toneMapped={false} />
      </mesh>
      {/* generous invisible hit target */}
      <mesh
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover(site.id);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          onHover(null);
          document.body.style.cursor = "";
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (e.delta > 4) return; // it was a drag
          onSelect(site.id);
        }}
      >
        <sphereGeometry args={[0.04, 12, 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {isCurrent && (
        <Html center occlude={[occluder as React.RefObject<THREE.Object3D>]} zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
          <span className="block h-7 w-7 rounded-full border-2 border-sun/80 motion-safe:animate-ping" aria-hidden />
        </Html>
      )}
      {(hovered || isCurrent) && (
        <Html center occlude={[occluder as React.RefObject<THREE.Object3D>]} zIndexRange={[30, 0]} style={{ pointerEvents: "none", transform: "translateY(-26px)" }}>
          <span className="glass whitespace-nowrap rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-text">
            {isCurrent ? "◎ " : ""}
            {site.name} · {site.region.replace("_", " ")}
          </span>
        </Html>
      )}
    </group>
  );
}

function Scene({ sunDirBody, earthDirBody, sites, currentSiteId, current, preset, reduced, onSelectSite, onPick }: Props) {
  const { camera, invalidate } = useThree();
  const controls = useThree((s) => s.controls) as unknown as { update: () => void } | null;
  const moon = useRef<THREE.Mesh>(null);
  const [hover, setHover] = useState<string | null>(null);

  const sun = useMemo(() => new THREE.Vector3(...bodyToScene(sunDirBody)).normalize(), [sunDirBody]);
  const earth = useMemo(() => new THREE.Vector3(...bodyToScene(earthDirBody)).normalize(), [earthDirBody]);
  const earthPos = useMemo(() => earth.clone().multiplyScalar(2.35), [earth]);
  const earthFoot = useMemo(() => earth.clone().multiplyScalar(1.012), [earth]);

  // Re-render when inputs change (demand frameloop).
  useEffect(() => invalidate(), [sun, earth, currentSiteId, current.lat, current.lon, hover, invalidate]);

  // ---- camera fly-to
  const fly = useRef<{ from: THREE.Vector3; to: THREE.Vector3; d0: number; d1: number; t: number } | null>(null);
  useEffect(() => {
    const dir =
      preset.kind === "near"
        ? new THREE.Vector3(1, 0.15, 0)
        : preset.kind === "far"
          ? new THREE.Vector3(-1, 0.15, 0)
          : preset.kind === "pole"
            ? new THREE.Vector3(0.03, -1, 0.01)
            : new THREE.Vector3(...latLonToSceneVec(current.lat, current.lon));
    dir.normalize();
    const d1 = DIST[preset.kind];
    if (reduced) {
      camera.position.copy(dir.multiplyScalar(d1));
      camera.lookAt(0, 0, 0);
      controls?.update();
      invalidate();
      return;
    }
    fly.current = { from: camera.position.clone().normalize(), to: dir, d0: camera.position.length(), d1, t: 0 };
    invalidate();
    // nonce re-triggers the same preset; site changes re-trigger "site"
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset.kind, preset.nonce, preset.kind === "site" ? `${current.lat},${current.lon}` : ""]);

  useFrame((_, dt) => {
    const f = fly.current;
    if (!f) return;
    f.t = Math.min(1, f.t + dt / 0.9);
    const e = f.t < 0.5 ? 4 * f.t ** 3 : 1 - (-2 * f.t + 2) ** 3 / 2;
    const q = new THREE.Quaternion().setFromUnitVectors(f.from, f.to);
    const dir = f.from.clone().applyQuaternion(new THREE.Quaternion().slerp(q, e));
    camera.position.copy(dir.multiplyScalar(THREE.MathUtils.lerp(f.d0, f.d1, e)));
    camera.lookAt(0, 0, 0);
    controls?.update();
    if (f.t >= 1) fly.current = null;
    invalidate();
  });

  const onSurfaceClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 4) return; // drag, not a click
    e.stopPropagation();
    const local = e.object.worldToLocal(e.point.clone());
    const ll = hitToLatLon([local.x, local.y, local.z]);
    onPick(ll.lat, ll.lon);
  };

  const showCustom = currentSiteId === null;
  const customPos = useMemo(() => latLonToSceneVec(current.lat, current.lon).map((v) => v * 1.012) as Vec3, [current.lat, current.lon]);

  return (
    <>
      <ambientLight intensity={0.07} color="#9fb8ff" />
      <directionalLight position={sun.clone().multiplyScalar(10)} intensity={3.2} color="#fff6e8" />
      <Suspense fallback={null}>
        <MoonSurface ref={moon} onClick={onSurfaceClick} />
      </Suspense>
      <EarthZone earth={earth} sun={sun} />

      {/* Earth floating in its direction, with a faint line to the sub-Earth point */}
      <mesh position={earthPos} raycast={() => null}>
        <sphereGeometry args={[0.07, 24, 24]} />
        <meshBasicMaterial color="#5ec8ff" toneMapped={false} />
      </mesh>
      <Line points={[earthFoot, earthPos]} color="#5ec8ff" transparent opacity={0.35} lineWidth={1} dashed dashSize={0.04} gapSize={0.03} raycast={() => null} />

      {sites.map((s) => (
        <Marker key={s.id} site={s} isCurrent={s.id === currentSiteId} hovered={hover === s.id} onHover={setHover} onSelect={onSelectSite} occluder={moon} />
      ))}
      {showCustom && (
        <group position={customPos}>
          <mesh raycast={() => null}>
            <sphereGeometry args={[0.016, 16, 16]} />
            <meshBasicMaterial color="#b9a6ff" toneMapped={false} />
          </mesh>
          <Html center occlude={[moon as React.RefObject<THREE.Object3D>]} style={{ pointerEvents: "none", transform: "translateY(-24px)" }}>
            <span className="glass whitespace-nowrap rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-accent">◎ Custom site</span>
          </Html>
        </group>
      )}

      <OrbitControls makeDefault enablePan={false} enableDamping dampingFactor={0.12} minDistance={1.35} maxDistance={6} rotateSpeed={0.5} zoomSpeed={0.6} />
    </>
  );
}

export default function MoonMap(props: Props) {
  const wrapper = useRef<HTMLDivElement>(null);
  const [onScreen, setOnScreen] = useState(false);
  const [tabVisible, setTabVisible] = useState(true);

  useEffect(() => {
    const el = wrapper.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting));
    io.observe(el);
    const onVis = () => setTabVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVis);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      document.body.style.cursor = "";
    };
  }, []);

  const active = onScreen && tabVisible;

  return (
    <div ref={wrapper} className={props.className} data-globe-active={active ? "true" : "false"}>
      <Canvas
        dpr={[1, 2]}
        frameloop={active ? "demand" : "never"}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        camera={{ position: [3.9, 0.58, 0], fov: 35, near: 0.05, far: 50 }}
        aria-label="Interactive 3D Moon: drag to rotate, scroll to zoom, click a site to select it or the surface to set a custom site."
      >
        <Scene {...props} />
      </Canvas>
    </div>
  );
}
