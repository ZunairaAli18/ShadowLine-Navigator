"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";

import { LiveSkeleton } from "@/components/learn/LiveState";
import { ApiError, getTerrainHeights, getTerrainPatch, type TerrainPatch } from "@/lib/api";
import { createFpsWatch } from "@/lib/fpsWatch";
import { interpAt, interpAz } from "@/lib/interp";
import { SCROLL_LOCK_EVENT } from "@/components/fx/SmoothScroll";
import { angleDelta, azElToEnu, decodeHeights, downsampleHeights, enuToThree, threeToAzEl, type Vec3 } from "@/lib/terrain";

/**
 * 3D terrain view (F12): the 40 km LOLA patch around the site, lit by the real Sun at the navigator's selected
 * (fractional) time, with cast shadows, the Sun and Earth in their true directions, and a skyline ring built from
 * the site's 360-value horizon so the silhouette from the lander matches our visibility calculations.
 *
 * Frame: patch ENU metres mapped to three.js (east +X, up +Y, north -Z), origin = the site's surface point.
 * Labels are plain DOM positioned from useFrame (no drei <Html>: its teardown crashes React on unmount).
 * Rendering is on demand (invalidate on changes); "never" while hidden or off-screen.
 * Lite mode (touch / narrow screens): see TerrainViewProps.lite. Both modes have an Expand button (fills the
 * viewport, locks page scrolling, Esc or Close to leave).
 */

export type TerrainViewProps = {
  siteId: string;
  /** 360 values, the same /horizon profile the visibility calculation uses. */
  horizon: number[];
  sun: { az: number[]; el: number[]; fraction: number[] };
  earth: { az: number[]; el: number[]; visible: boolean[] };
  /** Earth visibility margin at the selected time (deg, from the navigator; includes any Earth margin). */
  earthMargin: number | null;
  pos: number;
  playing: boolean;
  reduced: boolean;
  /**
   * Called when the patch can't load, WebGL fails, or (lite) the device is too slow; the navigator falls back to
   * the sky plot. `exact` = show the message as-is (otherwise it's wrapped in "couldn't start (...)").
   */
  onUnavailable: (message: string, exact?: boolean) => void;
  /**
   * Phones / tablets / narrow screens: 256x256 grid (downsampled on the client), 1-2K shadow map, DPR <= 1.25,
   * simpler material, no relief exaggeration, bigger buttons, and an FPS watchdog.
   */
  lite?: boolean;
};

const LITE_GRID = 256;
const TOO_SLOW_FPS = 20;
const TOO_HEAVY = "3D terrain is too heavy for this device; showing the sky plot.";
const GL_FAILED = "3D terrain couldn't start on this device (WebGL error); showing the sky plot.";

type CameraMode = "overview" | "lander";
type Patch = { meta: TerrainPatch; heights: Float32Array };

const EYE_M = 2; // lander's-eye height above the site (same as the horizon calculation's observer)
const RING_R = 30_500; // skyline ring radius: just beyond the patch corners (28.3 km)
const SKY_D = 220_000; // distance for the Sun, Earth and stars (beyond everything, inside the far plane)
const SUN_RADIUS_DEG = 0.265;
const EARTH_RADIUS_DEG = 0.95;
const LIGHT_D = 70_000;
const SHADOW_HALF = 34_000;
const OVERVIEW_POS = new THREE.Vector3(-14_000, 17_000, 22_000);
const CLOSE_POS = new THREE.Vector3(-11, 6, 15); // a few metres from the lander, looking at it
const CLOSE_TARGET = new THREE.Vector3(0, 1.3, 0);
const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

/** Set a perspective camera's field of view (outside components: hook values can't be mutated in place there). */
function setCameraFov(camera: THREE.Camera, fov: number) {
  const cam = camera as THREE.PerspectiveCamera;
  cam.fov = fov;
  cam.updateProjectionMatrix();
}

const v3 = (v: Vec3) => new THREE.Vector3(v[0], v[1], v[2]);
const dirThree = (az: number, el: number) => v3(enuToThree(azElToEnu(az, el)));

// ---------------------------------------------------------------- error boundary (WebGL failures)

class GlBoundary extends Component<{ onError: (m: string) => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(e: unknown) {
    this.props.onError(e instanceof Error ? `3D couldn't start (${e.message}).` : "3D couldn't start on this device.");
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

// ---------------------------------------------------------------- textures

function regolithTexture(): THREE.CanvasTexture {
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < size * size; i++) {
    const v = 200 + (rnd() - 0.5) * 40; // subtle grain around a light grey (tinted by the material colour)
    img.data.set([v, v, v, 255], i * 4);
  }
  ctx.putImageData(img, 0, 0);
  // a few soft craterlets
  for (let k = 0; k < 40; k++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const r = 3 + rnd() * 12;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(0,0,0,0.18)");
    g.addColorStop(0.8, "rgba(0,0,0,0.04)");
    g.addColorStop(1, "rgba(255,255,255,0.06)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,240,210,1)");
  g.addColorStop(0.12, "rgba(255,214,150,0.55)");
  g.addColorStop(0.4, "rgba(255,197,107,0.12)");
  g.addColorStop(1, "rgba(255,197,107,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Solid disc with a soft 1-2 px edge (the Sun's true-size disk). */
function discTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.85, "rgba(255,255,255,1)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------- scene parts

function Ground({ patch, exaggerate, lite }: { patch: Patch; exaggerate: number; lite: boolean }) {
  const { meta, heights } = patch;
  const geometry = useMemo(() => {
    const n = meta.grid_size;
    const g = new THREE.PlaneGeometry(meta.extent_m, meta.extent_m, n - 1, n - 1);
    g.rotateX(-Math.PI / 2); // plane's +Y (top row) becomes north (-Z): rows run north -> south like the file
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < n * n; i++) p.setY(i, heights[i]);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }, [meta, heights]);
  const map = useMemo(() => {
    const t = regolithTexture();
    t.repeat.set(meta.extent_m / 600, meta.extent_m / 600);
    return t;
  }, [meta.extent_m]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => map.dispose(), [map]);
  return (
    <mesh geometry={geometry} scale={[1, exaggerate, 1]} castShadow receiveShadow>
      {lite ? <meshLambertMaterial color="#8e8e96" /> : <meshStandardMaterial color="#9a9aa2" map={map} roughness={1} metalness={0} />}
    </mesh>
  );
}

/**
 * Skyline wall at RING_R whose top edge is the 360-value horizon seen from the lander's eye. It always casts
 * shadows (distant ridges shade the site); it is only drawn in the lander's eye, where it is the far skyline.
 */
function SkylineRing({ horizon, bottom, exaggerate, drawn }: { horizon: number[]; bottom: number; exaggerate: number; drawn: boolean }) {
  const geometry = useMemo(() => {
    const pos: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= 360; i++) {
      const az = i % 360;
      const top = EYE_M + RING_R * Math.tan((horizon[az] * Math.PI) / 180);
      const [x, , z] = enuToThree(azElToEnu(az, 0));
      pos.push(x * RING_R, top, z * RING_R, x * RING_R, bottom, z * RING_R);
      if (i < 360) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }, [horizon, bottom]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} scale={[1, exaggerate, 1]} castShadow renderOrder={drawn ? 0 : -2}>
      {/* Not drawn = invisible to the camera (no colour or depth) but still in the shadow pass. */}
      <meshStandardMaterial color="#4a4a52" roughness={1} side={THREE.DoubleSide} colorWrite={drawn} depthWrite={drawn} />
    </mesh>
  );
}

function Lander() {
  const gold = <meshStandardMaterial color="#c9a24a" metalness={0.6} roughness={0.45} />;
  const grey = <meshStandardMaterial color="#b9bac4" metalness={0.3} roughness={0.6} />;
  const legs: [number, number][] = [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];
  return (
    <group>
      <mesh position={[0, 1.4, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.8, 1.1, 1.8]} />
        {gold}
      </mesh>
      {legs.map(([sx, sz]) => (
        <group key={`${sx}${sz}`}>
          <mesh position={[sx * 1.15, 0.6, sz * 1.15]} rotation={[sz * 0.45, 0, -sx * 0.45]} castShadow>
            <cylinderGeometry args={[0.05, 0.05, 1.5, 6]} />
            {grey}
          </mesh>
          <mesh position={[sx * 1.45, 0.04, sz * 1.45]} receiveShadow>
            <cylinderGeometry args={[0.22, 0.22, 0.06, 12]} />
            {grey}
          </mesh>
        </group>
      ))}
      <mesh position={[0, 2.2, 0]} castShadow>
        <cylinderGeometry args={[0.04, 0.04, 0.6, 6]} />
        {grey}
      </mesh>
      <mesh position={[0, 2.55, 0]} rotation={[-Math.PI / 2.4, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.6, 1.2, 0.04]} />
        <meshStandardMaterial color="#1f2a5c" metalness={0.4} roughness={0.35} emissive="#0b1030" />
      </mesh>
    </group>
  );
}

/** "You are here": a thin beam and a ground ring, sized for the overview (hundreds of metres). */
function HereMarker() {
  return (
    <group>
      <mesh position={[0, 300, 0]}>
        <cylinderGeometry args={[6, 6, 600, 8, 1, true]} />
        <meshBasicMaterial color="#b9a6ff" transparent opacity={0.55} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 4, 0]}>
        <ringGeometry args={[140, 175, 48]} />
        <meshBasicMaterial color="#b9a6ff" transparent opacity={0.7} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function Stars() {
  const geometry = useMemo(() => {
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const p: number[] = [];
    for (let i = 0; i < 2400; i++) {
      const u = rnd() * 2 - 1;
      const t = rnd() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      p.push(r * Math.cos(t), u, r * Math.sin(t));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
    return g;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <points geometry={geometry} scale={SKY_D * 1.1} frustumCulled={false} renderOrder={-1}>
      <pointsMaterial color="#e8e6ff" size={1.4} sizeAttenuation={false} transparent opacity={0.75} depthWrite={false} />
    </points>
  );
}

type SkyRefs = {
  sunLabel: React.RefObject<HTMLDivElement | null>;
  earthLabel: React.RefObject<HTMLDivElement | null>;
  hereLabel: React.RefObject<HTMLDivElement | null>;
  compass: React.RefObject<HTMLDivElement | null>;
  wrapper: React.RefObject<HTMLDivElement | null>;
};

type LookRequest = { target: "sun" | "earth"; nonce: number } | null;
type FocusRequest = { close: boolean; nonce: number } | null;

type SceneProps = {
  patch: Patch;
  horizon: number[];
  sunAz: number;
  sunEl: number;
  sunVisible: boolean;
  earthAz: number;
  earthEl: number;
  earthVisible: boolean;
  minHorizon: number;
  mode: CameraMode;
  exaggerate: number;
  fov: number;
  look: LookRequest;
  focus: FocusRequest;
  reduced: boolean;
  playing: boolean;
  /** On screen and the tab visible; becoming active re-renders (changes made while paused show up). */
  active: boolean;
  lite: boolean;
  /** Lite: average FPS stayed under TOO_SLOW_FPS for 3 s of continuous rendering. */
  onTooSlow: () => void;
  refs: SkyRefs;
};

const _p = new THREE.Vector3();

function placeOverlay(el: HTMLDivElement | null, world: THREE.Vector3 | null, camera: THREE.Camera, w: number, h: number) {
  if (!el) return;
  if (!world) {
    el.style.opacity = "0";
    return;
  }
  _p.copy(world).project(camera);
  const inFront = _p.z < 1 && _p.z > -1;
  el.style.transform = `translate3d(${(((_p.x + 1) / 2) * w).toFixed(1)}px, ${(((1 - _p.y) / 2) * h).toFixed(1)}px, 0)`;
  el.style.opacity = inFront ? "1" : "0";
}

function Scene(props: SceneProps) {
  const { patch, horizon, sunAz, sunEl, sunVisible, earthAz, earthEl, earthVisible, minHorizon, mode, exaggerate, fov, look, focus, reduced, playing, active, lite, onTooSlow, refs } = props;
  const { camera, invalidate, size, gl } = useThree();
  const maxTex = gl.capabilities.maxTextureSize;
  const shadowSize = lite ? (maxTex >= 2048 ? 2048 : 1024) : maxTex >= 4096 ? 4096 : 2048;
  const light = useRef<THREE.DirectionalLight>(null);
  const earthLight = useRef<THREE.DirectionalLight>(null);
  const sunSprite = useRef<THREE.Sprite>(null);
  const glowSprite = useRef<THREE.Sprite>(null);
  const earthMesh = useRef<THREE.Mesh>(null);
  const stars = useRef<THREE.Group>(null);
  const marker = useRef<THREE.Group>(null);
  const glow = useMemo(() => glowTexture(), []);
  const disc = useMemo(() => discTexture(), []);
  useEffect(
    () => () => {
      glow.dispose();
      disc.dispose();
    },
    [glow, disc],
  );

  const sunDir = useMemo(() => dirThree(sunAz, sunEl), [sunAz, sunEl]);
  const earthDir = useMemo(() => dirThree(earthAz, earthEl), [earthAz, earthEl]);
  // Sunlight on: whenever any part of the disk can be above the lowest point of the skyline (shadows do the rest).
  const sunUp = THREE.MathUtils.smoothstep(sunEl, minHorizon - SUN_RADIUS_DEG - 0.2, minHorizon + SUN_RADIUS_DEG);

  // ---- shadow camera fitted to the patch + ring (set once; R3F doesn't refresh shadow cameras from props)
  useEffect(() => {
    const l = light.current;
    if (!l) return;
    const cam = l.shadow.camera;
    cam.left = cam.bottom = -SHADOW_HALF;
    cam.right = cam.top = SHADOW_HALF;
    cam.near = 1000;
    cam.far = LIGHT_D * 2;
    cam.updateProjectionMatrix();
    l.shadow.mapSize.set(shadowSize, shadowSize);
    l.shadow.bias = -0.0004;
    // Bigger texels need a bigger offset to keep low-Sun shadows free of acne (18 m at 4096 px).
    l.shadow.normalBias = Math.min(40, (18 * 4096) / shadowSize / 2 + 9);
    l.shadow.map?.dispose();
    l.shadow.map = null;
    invalidate();
  }, [shadowSize, invalidate]);

  useEffect(() => {
    light.current?.position.copy(sunDir).multiplyScalar(LIGHT_D);
    earthLight.current?.position.copy(earthDir).multiplyScalar(LIGHT_D);
    invalidate();
  }, [sunDir, earthDir, sunUp, sunVisible, earthVisible, exaggerate, invalidate]);

  // ---- cameras
  const yaw = useRef(180);
  const pitch = useRef(2);
  const turn = useRef<{ fromYaw: number; toYaw: number; fromPitch: number; toPitch: number; t: number } | null>(null);
  // Last overview camera position (kept up to date every overview frame, restored when leaving the lander).
  const overviewCam = useRef(OVERVIEW_POS.clone());
  const fly = useRef<{ p0: THREE.Vector3; p1: THREE.Vector3; t0: THREE.Vector3; t1: THREE.Vector3; t: number } | null>(null);
  const getState = useThree((s) => s.get);

  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    if (mode === "lander") {
      cam.position.set(0, EYE_M, 0);
      // Face the Sun's azimuth when entering, so the interesting part of the skyline is in view.
      yaw.current = sunAz;
      pitch.current = 2;
    } else {
      cam.position.copy(overviewCam.current);
      cam.lookAt(0, 0, 0);
      setCameraFov(cam, 45);
      const c = getState().controls as unknown as { target: THREE.Vector3; update: () => void } | null;
      c?.target.set(0, 0, 0);
      c?.update();
    }
    invalidate();
    // Only on mode switches (sunAz is read once when entering the lander view).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    if (mode !== "lander") return;
    setCameraFov(camera, fov);
    invalidate();
  }, [fov, mode, camera, invalidate]);

  useEffect(() => {
    if (!look || mode !== "lander") return;
    const t = look.target === "sun" ? { az: sunAz, el: sunEl } : { az: earthAz, el: earthEl };
    const toYaw = yaw.current + angleDelta(yaw.current, t.az);
    const toPitch = THREE.MathUtils.clamp(t.el, -60, 80);
    if (reduced) {
      yaw.current = toYaw;
      pitch.current = toPitch;
      turn.current = null;
    } else {
      turn.current = { fromYaw: yaw.current, toYaw, fromPitch: pitch.current, toPitch, t: 0 };
    }
    invalidate();
    // A new nonce starts a new turn; the target is read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [look?.nonce]);

  // Overview: fly to the lander (or back out). Log-distance easing so a 25 km -> 15 m move feels even.
  useEffect(() => {
    if (!focus || mode !== "overview") return;
    const c = getState().controls as unknown as { target: THREE.Vector3; update: () => void } | null;
    const p1 = focus.close ? CLOSE_POS.clone() : OVERVIEW_POS.clone();
    const t1 = focus.close ? CLOSE_TARGET.clone() : new THREE.Vector3();
    if (reduced || !c) {
      camera.position.copy(p1);
      c?.target.copy(t1);
      c?.update();
    } else {
      fly.current = { p0: camera.position.clone(), p1, t0: c.target.clone(), t1, t: 0 };
    }
    invalidate();
    // A new nonce starts a new move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.nonce]);

  // Drag to look around (lander's eye) and wheel to zoom the field of view.
  useEffect(() => {
    const el = refs.wrapper.current;
    if (!el || mode !== "lander") return;
    let drag: { x: number; y: number } | null = null;
    const down = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest("button, input, label")) return;
      drag = { x: e.clientX, y: e.clientY };
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* pointer already gone (e.g. a synthetic or cancelled touch): dragging still works without capture */
      }
    };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      const k = (camera as THREE.PerspectiveCamera).fov / el.clientHeight;
      yaw.current -= (e.clientX - drag.x) * k;
      pitch.current = THREE.MathUtils.clamp(pitch.current + (e.clientY - drag.y) * k, -60, 80);
      drag = { x: e.clientX, y: e.clientY };
      turn.current = null;
      invalidate();
    };
    const up = () => (drag = null);
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
  }, [mode, camera, invalidate, refs.wrapper]);

  // ---- per frame: lander camera, sky objects follow the camera (true directions from the viewpoint), overlays
  const watch = useRef({ fps: createFpsWatch({ minFps: TOO_SLOW_FPS }), probeUntil: 0, tripped: false });
  const fps = useRef({ frames: 0, t0: 0 });
  const tmp = useMemo(() => new THREE.Vector3(), []);
  useFrame((state, dt) => {
    const cam = camera as THREE.PerspectiveCamera;
    if (mode === "lander") {
      const tr = turn.current;
      if (tr) {
        tr.t = Math.min(1, tr.t + dt / 0.8);
        const e = tr.t < 0.5 ? 4 * tr.t ** 3 : 1 - (-2 * tr.t + 2) ** 3 / 2;
        yaw.current = tr.fromYaw + (tr.toYaw - tr.fromYaw) * e;
        pitch.current = tr.fromPitch + (tr.toPitch - tr.fromPitch) * e;
        if (tr.t >= 1) turn.current = null;
        invalidate();
      }
      cam.position.set(0, EYE_M, 0);
      cam.lookAt(tmp.copy(dirThree(yaw.current, pitch.current)).add(cam.position));
    } else {
      const f = fly.current;
      const c = getState().controls as unknown as { target: THREE.Vector3; update: () => void } | null;
      if (f && c) {
        f.t = Math.min(1, f.t + dt / 1.6);
        const e = f.t < 0.5 ? 4 * f.t ** 3 : 1 - (-2 * f.t + 2) ** 3 / 2;
        // Interpolate the direction linearly and the distance logarithmically.
        const d0 = f.p0.length();
        const d1 = f.p1.length();
        const dir = f.p0.clone().normalize().lerp(f.p1.clone().normalize(), e).normalize();
        cam.position.copy(dir.multiplyScalar(Math.exp(Math.log(d0) + (Math.log(d1) - Math.log(d0)) * e)));
        c.target.lerpVectors(f.t0, f.t1, e);
        c.update();
        if (f.t >= 1) fly.current = null;
        invalidate();
      }
      overviewCam.current.copy(cam.position);
    }
    // The marker is sized for the wide view; hide it once you're close enough to see the lander itself.
    const near = cam.position.length() < 1500;
    if (marker.current) marker.current.visible = !near;
    const sunPos = tmp.copy(sunDir).multiplyScalar(SKY_D).add(cam.position);
    const discScale = 2 * SKY_D * Math.tan((SUN_RADIUS_DEG * Math.PI) / 180);
    sunSprite.current?.position.copy(sunPos);
    sunSprite.current?.scale.setScalar(discScale); // true angular size (0.53 deg)
    glowSprite.current?.position.copy(sunPos);
    glowSprite.current?.scale.setScalar(discScale * 16);
    const earthPos = earthDir.clone().multiplyScalar(SKY_D).add(cam.position);
    earthMesh.current?.position.copy(earthPos);
    stars.current?.position.copy(cam.position);

    const w = size.width;
    const h = size.height;
    placeOverlay(refs.sunLabel.current, sunPos.clone().add(new THREE.Vector3(0, discScale * 3, 0)), cam, w, h);
    placeOverlay(refs.earthLabel.current, earthPos.clone(), cam, w, h);
    placeOverlay(refs.hereLabel.current, mode === "overview" ? new THREE.Vector3(0, near ? 6 : 620 * exaggerate, 0) : null, cam, w, h);

    // Compass strip: tick k sits at its azimuth relative to the view direction.
    const strip = refs.compass.current;
    if (strip && mode === "lander") {
      const view = threeToAzEl([cam.getWorldDirection(_p).x, _p.y, _p.z]).az;
      const hfov = (2 * Math.atan(Math.tan((cam.fov * Math.PI) / 360) * cam.aspect) * 180) / Math.PI;
      const sw = strip.clientWidth;
      for (const child of Array.from(strip.children) as HTMLElement[]) {
        const az = Number(child.dataset.az);
        const d = angleDelta(view, az);
        const x = sw / 2 + (d / hfov) * sw;
        child.style.transform = `translateX(${x.toFixed(1)}px)`;
        child.style.opacity = Math.abs(d) < hfov / 2 + 4 ? "1" : "0";
      }
    }

    // Lite watchdog (lib/fpsWatch.ts): frames are continuous during a probe after the view becomes active and
    // while playing; a 3 s window averaging under TOO_SLOW_FPS (without throttling gaps) falls back to the sky plot.
    if (lite) {
      const w = watch.current;
      const nowMs = performance.now();
      const probing = nowMs < w.probeUntil;
      if (probing) invalidate();
      if (probing || playing) {
        const r = w.fps.frame(nowMs);
        if (r.avg !== null) refs.wrapper.current?.setAttribute("data-avg-fps", String(Math.round(r.avg)));
        if (r.tooSlow && !w.tripped) {
          w.tripped = true;
          onTooSlow();
        }
      } else {
        w.fps.stop();
      }
    }

    // Rough FPS while rendering continuously (exposed on the wrapper for testing).
    const f = fps.current;
    f.frames++;
    const now = state.clock.elapsedTime;
    if (now - f.t0 >= 1) {
      refs.wrapper.current?.setAttribute("data-fps", String(Math.round(f.frames / (now - f.t0))));
      f.frames = 0;
      f.t0 = now;
    }
  });

  useEffect(() => {
    if (active && lite) {
      const now = performance.now();
      watch.current.fps.start(now); // 1 s warm-up, then a 3 s window
      watch.current.probeUntil = now + 4400;
      invalidate();
    }
  }, [active, lite, invalidate]);

  // Keep rendering while playing (positions change every frame anyway) and invalidate on prop changes.
  useEffect(() => {
    invalidate();
  }, [sunAz, sunEl, earthAz, earthEl, playing, active, invalidate]);

  const bottom = patch.meta.z_min - 600;

  return (
    <>
      {/* Starlight: very faint, from above, so slopes keep a little shape when the Sun is down. */}
      <ambientLight intensity={0.015} color="#8fa2ff" />
      <hemisphereLight args={["#5a6aa0", "#000000", 1.1]} />
      <directionalLight ref={light} intensity={3.1 * sunUp} color="#fff4e6" castShadow={sunUp > 0} />
      {/* Earthshine: a faint bluish fill from Earth's direction when it's above the horizon. */}
      <directionalLight ref={earthLight} intensity={earthEl > 0 ? 0.05 : 0} color="#9fd6ff" />

      <Ground patch={patch} exaggerate={exaggerate} lite={lite} />
      <SkylineRing horizon={horizon} bottom={bottom} exaggerate={exaggerate} drawn={mode === "lander"} />
      {mode === "overview" && (
        <>
          <Lander />
          <group ref={marker} scale={[1, exaggerate, 1]}>
            <HereMarker />
          </group>
        </>
      )}

      <group ref={stars}>
        <Stars />
      </group>
      {/* Sun disk + glow: hidden ones are drawn faintly through the terrain so you can see where they are. */}
      <sprite ref={glowSprite} renderOrder={2}>
        <spriteMaterial map={glow} color="#ffd9a0" transparent opacity={sunVisible ? 0.9 : 0} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </sprite>
      <sprite ref={sunSprite} renderOrder={3}>
        <spriteMaterial map={disc} color={sunVisible ? "#fffaf0" : "#ffc56b"} transparent opacity={sunVisible ? 1 : 0.75} depthTest={sunVisible} depthWrite={false} toneMapped={false} />
      </sprite>
      <mesh ref={earthMesh} renderOrder={3}>
        <sphereGeometry args={[SKY_D * Math.tan((EARTH_RADIUS_DEG * Math.PI) / 180), 32, 16]} />
        <meshBasicMaterial color="#5ec8ff" transparent opacity={earthVisible ? 1 : 0.3} depthTest={earthVisible} depthWrite={false} toneMapped={false} />
      </mesh>

      {mode === "overview" && (
        <OrbitControls makeDefault enablePan={false} enableDamping dampingFactor={0.1} minDistance={15} maxDistance={70_000} maxPolarAngle={Math.PI * 0.46} zoomSpeed={lite ? 1 : 2.5} rotateSpeed={0.5} />
      )}
    </>
  );
}

// ---------------------------------------------------------------- main component

export default function TerrainView({ siteId, horizon, sun, earth, earthMargin, pos, playing, reduced, onUnavailable, lite = false }: TerrainViewProps) {
  const [patch, setPatch] = useState<Patch | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [mode, setMode] = useState<CameraMode>("overview");
  const [exaggerate, setExaggerate] = useState(false);
  const [fov, setFov] = useState(60);
  const [look, setLook] = useState<LookRequest>(null);
  const [focus, setFocus] = useState<FocusRequest>(null);
  const [expanded, setExpanded] = useState(false);
  const [onScreen, setOnScreen] = useState(false);
  const [tabVisible, setTabVisible] = useState(true);
  const wrapper = useRef<HTMLDivElement>(null);
  const sunLabel = useRef<HTMLDivElement>(null);
  const earthLabel = useRef<HTMLDivElement>(null);
  const hereLabel = useRef<HTMLDivElement>(null);
  const compass = useRef<HTMLDivElement>(null);
  const refs = useMemo<SkyRefs>(() => ({ sunLabel, earthLabel, hereLabel, compass, wrapper }), []);

  // ---- load the patch (metadata + binary heights) once per site
  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const meta = await getTerrainPatch(siteId, { signal: ctrl.signal });
        const buf = await getTerrainHeights(meta.bin_url, { signal: ctrl.signal });
        const full = decodeHeights(buf, meta.grid_size, meta.z_scale, meta.z_offset);
        if (lite && meta.grid_size > LITE_GRID) {
          // Same 40 km extent with a quarter of the vertices.
          const heights = downsampleHeights(full, meta.grid_size, LITE_GRID);
          setPatch({ meta: { ...meta, grid_size: LITE_GRID, spacing_m: meta.extent_m / (LITE_GRID - 1) }, heights });
        } else {
          setPatch({ meta, heights: full });
        }
        setLoadedFor(siteId);
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
        onUnavailable(e instanceof ApiError ? e.message : "The 3D terrain couldn't be loaded.");
      }
    })();
    return () => ctrl.abort();
  }, [siteId, onUnavailable, lite]);

  // ---- expanded: fill the viewport, lock page scrolling (native + Lenis), Esc closes
  useEffect(() => {
    if (!expanded) return;
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    html.dataset.terrainExpanded = "true";
    window.dispatchEvent(new CustomEvent(SCROLL_LOCK_EVENT, { detail: true }));
    // An ancestor with backdrop-filter / transform / filter (e.g. the glass card) would trap position:fixed
    // inside it; switch those off while expanded and restore them afterwards.
    const trapped: { el: HTMLElement; css: string }[] = [];
    for (let el = wrapper.current?.parentElement; el && el !== html; el = el.parentElement) {
      const cs = getComputedStyle(el);
      if (cs.backdropFilter !== "none" || cs.transform !== "none" || cs.filter !== "none") {
        trapped.push({ el, css: el.style.cssText });
        el.style.setProperty("backdrop-filter", "none");
        el.style.setProperty("-webkit-backdrop-filter", "none");
        el.style.setProperty("transform", "none");
        el.style.setProperty("filter", "none");
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      html.style.overflow = prev;
      delete html.dataset.terrainExpanded;
      trapped.forEach(({ el, css }) => (el.style.cssText = css));
      window.dispatchEvent(new CustomEvent(SCROLL_LOCK_EVENT, { detail: false }));
      window.removeEventListener("keydown", onKey);
    };
  }, [expanded]);

  const onTooSlow = useCallback(() => {
    setExpanded(false);
    onUnavailable(TOO_HEAVY, true);
  }, [onUnavailable]);

  // ---- pause when off-screen or the tab is hidden
  const ready = !!patch && loadedFor === siteId;
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
    };
  }, [ready]);

  const sunAz = interpAz(sun.az, pos);
  const sunEl = interpAt(sun.el, pos);
  const sunFraction = interpAt(sun.fraction, pos);
  const earthAz = interpAz(earth.az, pos);
  const earthEl = interpAt(earth.el, pos);
  const sunVisible = sunFraction > 0;
  const earthVisible = earthMargin !== null && earthMargin > 0;
  const minHorizon = useMemo(() => Math.min(...horizon), [horizon]);
  const active = onScreen && tabVisible;
  const ex = !lite && mode === "overview" && exaggerate ? 3 : 1;

  if (!ready) return <LiveSkeleton className="aspect-[16/9]" label="Loading 40 km of LOLA terrain…" />;

  const fmt = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}°`;
  // Lite = touch: 40 px tap targets.
  const chip = `${lite ? "min-h-10 px-4 text-sm" : "min-h-8 px-3 text-xs"} rounded-full font-semibold transition-colors`;

  return (
    <div
      ref={wrapper}
      className={`touch-none select-none overflow-hidden bg-black ${
        expanded ? "fixed inset-0 z-[70] h-[100dvh] w-screen" : `relative min-h-64 w-full rounded-xl ${lite ? "aspect-[4/3] sm:aspect-[16/9]" : "aspect-[16/9]"}`
      } ${mode === "lander" ? "cursor-grab active:cursor-grabbing" : ""}`}
      data-terrain-active={active ? "true" : "false"}
      data-terrain-lite={lite ? "true" : undefined}
      data-terrain-expanded-panel={expanded ? "true" : undefined}
      role={expanded ? "dialog" : undefined}
      aria-modal={expanded ? true : undefined}
      aria-label={expanded ? "3D terrain, expanded" : undefined}
      data-lenis-prevent
      data-mode={mode}
    >
      <GlBoundary onError={() => onUnavailable(GL_FAILED, true)}>
        <Canvas
          shadows={lite ? "percentage" : "soft"}
          dpr={lite ? [1, 1.25] : [1, 2]}
          frameloop={active ? "demand" : "never"}
          gl={{ antialias: true, logarithmicDepthBuffer: true, powerPreference: "high-performance" }}
          camera={{ position: [-14_000, 17_000, 22_000], fov: 45, near: 0.1, far: 800_000 }}
          aria-label="3D terrain around the site, lit by the Sun at the selected time"
        >
          <Scene
            patch={patch}
            horizon={horizon}
            sunAz={sunAz}
            sunEl={sunEl}
            sunVisible={sunVisible}
            earthAz={earthAz}
            earthEl={earthEl}
            earthVisible={earthVisible}
            minHorizon={minHorizon}
            mode={mode}
            exaggerate={ex}
            fov={fov}
            look={look}
            focus={focus}
            reduced={reduced}
            playing={playing}
            active={active}
            lite={lite}
            onTooSlow={onTooSlow}
            refs={refs}
          />
        </Canvas>
      </GlBoundary>

      {/* overlay labels (positioned per frame) */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div ref={sunLabel} className="absolute left-0 top-0 opacity-0">
          <span className={`absolute -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] ${sunVisible ? "text-sun" : "glass text-lunar-300"}`}>
            {sunVisible ? "☀ Sun" : "☀ Sun (behind the skyline)"}
          </span>
        </div>
        <div ref={earthLabel} className="absolute left-0 top-0 opacity-0">
          <span className={`absolute -translate-x-1/2 translate-y-3 whitespace-nowrap rounded-md px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] ${earthVisible ? "text-earth" : "glass text-lunar-300"}`}>
            {earthVisible ? "◉ Earth" : "◌ Earth (hidden)"}
          </span>
        </div>
        <div ref={hereLabel} className="absolute left-0 top-0 opacity-0">
          <span className="glass absolute -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-accent">
            ◎ You are here
          </span>
        </div>
      </div>

      {/* compass strip (lander's eye) */}
      {mode === "lander" && (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-7 border-b border-border/60 bg-bg/60 backdrop-blur-sm" aria-hidden>
          <div ref={compass} className="relative h-full">
            {Array.from({ length: 24 }, (_, k) => k * 15).map((az) => (
              <span key={az} data-az={az} className="absolute left-0 top-0 flex h-full -translate-x-1/2 flex-col items-center justify-center opacity-0" style={{ marginLeft: 0 }}>
                <span className={`font-mono text-[10px] ${az % 90 === 0 ? "text-text" : az % 45 === 0 ? "text-lunar-300" : "text-lunar-500"}`}>
                  {az % 45 === 0 ? COMPASS[az / 45] : "·"}
                </span>
              </span>
            ))}
          </div>
          <span className="absolute left-1/2 top-full h-2 w-px -translate-x-1/2 bg-accent" />
        </div>
      )}

      {/* controls */}
      <button
        type="button"
        onClick={() => setExpanded((x) => !x)}
        aria-label={expanded ? "Close the expanded 3D view" : "Expand the 3D view to fill the screen"}
        className={`glass absolute right-2 z-10 ${chip} ${expanded ? "text-text" : "text-muted hover:text-text"} ${mode === "lander" ? "top-9" : "top-2"}`}
      >
        {expanded ? (
          "✕ Close"
        ) : (
          <>
            <span aria-hidden className="sm:hidden">⤢</span>
            <span className="hidden sm:inline">⤢ Expand</span>
          </>
        )}
      </button>
      <div className={`absolute left-2 flex flex-wrap items-center gap-2 ${expanded ? "right-28" : lite ? "right-14 sm:right-28" : "right-24"} ${mode === "lander" ? "top-9" : "top-2"}`}>
        <div className="glass flex rounded-full p-0.5" role="radiogroup" aria-label="Camera">
          {(["overview", "lander"] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={`${chip} whitespace-nowrap ${mode === m ? "bg-accent text-bg" : "text-muted hover:text-text"}`}>
              {m === "overview" ? "Overview" : "Lander's eye"}
            </button>
          ))}
        </div>
        {mode === "overview" ? (
          <>
          <button type="button" onClick={() => setFocus((f) => ({ close: !f?.close, nonce: Date.now() }))} className={`glass ${chip} text-text`}>
            {focus?.close ? "↗ Back to overview" : "◎ Zoom to lander"}
          </button>
          {!lite && (
            <label className="glass flex min-h-8 cursor-pointer items-center gap-2 rounded-full px-3 text-xs text-muted">
              <input type="checkbox" checked={exaggerate} onChange={(e) => setExaggerate(e.target.checked)} className="accent-[var(--color-accent)]" />
              Exaggerate relief ×3 <span className="text-lunar-500">(visual only)</span>
            </label>
          )}
          </>
        ) : (
          <>
            <button type="button" onClick={() => setLook({ target: "sun", nonce: Date.now() })} className={`glass ${chip} text-sun`}>
              ☀ Look at Sun
            </button>
            <button type="button" onClick={() => setLook({ target: "earth", nonce: Date.now() })} className={`glass ${chip} text-earth`}>
              ◉ Look at Earth
            </button>
            <label className={`glass flex ${lite ? "min-h-10" : "min-h-8"} items-center gap-2 rounded-full px-3 text-xs text-muted`}>
              FOV
              <input type="range" min={20} max={100} step={1} value={fov} onChange={(e) => setFov(Number(e.target.value))} aria-label="Field of view (degrees)" className="h-6 w-20 accent-[var(--color-accent)]" />
              <span className="w-7 font-mono text-lunar-300">{fov}°</span>
            </label>
          </>
        )}
      </div>

      {/* HUD */}
      <div
        className={`glass pointer-events-none absolute bottom-2 left-2 rounded-lg px-3 py-2 font-mono text-[10px] uppercase leading-5 tracking-[0.1em] ${expanded ? "" : "max-sm:hidden"}`}
        aria-live="off"
      >
        <div>
          <span className="text-sun">☀ Sun</span> <span className="text-lunar-300">az {sunAz.toFixed(1)}° el {fmt(sunEl)}</span>{" "}
          <span className={sunVisible ? "text-good" : "text-notviable"}>{sunVisible ? "visible" : "hidden"}</span>
        </div>
        <div>
          <span className="text-earth">◉ Earth</span> <span className="text-lunar-300">az {earthAz.toFixed(1)}° el {fmt(earthEl)}</span>{" "}
          <span className={earthVisible ? "text-good" : "text-notviable"}>{earthVisible ? "visible" : "hidden"}</span>
        </div>
      </div>
      <p className="pointer-events-none absolute bottom-2 right-2 hidden max-w-[45%] text-right text-[10px] text-lunar-400 sm:block">
        {mode === "overview" ? (lite ? "One finger to orbit · pinch to zoom" : "Drag to orbit · scroll to zoom") : "Drag to look around · slider for FOV"} · LOLA 80 m
        {lite ? " (lite: 157 m grid)" : ""}, 40 km patch; distant skyline from the 150 km horizon
      </p>
    </div>
  );
}
