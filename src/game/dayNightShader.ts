import * as THREE from 'three';
import type { DayTimeMode } from './types';

export interface DayNightUniforms {
  uTime: { value: number };
  uNightFactor: { value: number };
  uSunsetFactor: { value: number };
  uDawnFactor: { value: number };
  uLanternPos: { value: THREE.Vector3 };
  uPlayerPos: { value: THREE.Vector3 };
}

export const DAY_CYCLE_DURATION_SEC = 96; // Full 24h cycle in 96s when in 'auto' mode

export interface DayNightVisualState {
  normalizedPhase: number;
  dayFactor: number;
  dawnFactor: number;
  sunsetFactor: number;
  nightFactor: number;
  sunAngle: number;
  phaseLabel: string;
  skyHex: string;
  fogHex: string;
  sunHex: string;
  hemiSkyHex: string;
  hemiGroundHex: string;
  sunIntensity: number;
  hemiIntensity: number;
  envIntensity: number;
  lanternEmissiveIntensity: number;
}

const FIXED_PHASE: Record<Exclude<DayTimeMode, 'auto'>, number> = {
  dawn: 0.24,
  day: 0.5,
  sunset: 0.77,
  night: 0.02,
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function bell(x: number, center: number, width: number): number {
  let d = Math.abs(x - center);
  if (d > 0.5) d = 1 - d;
  const norm = Math.max(0, 1 - d / width);
  return norm * norm * (3 - 2 * norm);
}

const _cA = new THREE.Color();
const _cB = new THREE.Color();

function mixHex(hexA: string, hexB: string, t: number): string {
  _cA.set(hexA);
  _cB.set(hexB);
  _cA.lerp(_cB, THREE.MathUtils.clamp(t, 0, 1));
  return `#${_cA.getHexString()}`;
}

export function computeDayNightState(
  mode: DayTimeMode,
  cycleClockSec: number,
): DayNightVisualState {
  const phase =
    mode === 'auto'
      ? (((cycleClockSec % DAY_CYCLE_DURATION_SEC) / DAY_CYCLE_DURATION_SEC + 0.45) % 1)
      : FIXED_PHASE[mode];

  const dawnFactor = bell(phase, 0.24, 0.13);
  const sunsetFactor = bell(phase, 0.77, 0.14);
  const sunElev = Math.sin((phase - 0.22) * Math.PI * 1.9);
  const dayFactor = THREE.MathUtils.clamp(sunElev * 1.15, 0, 1);
  const nightFactor = THREE.MathUtils.clamp(
    1 - dayFactor - Math.max(dawnFactor, sunsetFactor) * 0.45,
    0,
    1,
  );

  let phaseLabel = 'День';
  if (nightFactor >= 0.55) phaseLabel = 'Ніч';
  else if (sunsetFactor >= 0.42) phaseLabel = 'Захід сонця';
  else if (dawnFactor >= 0.42) phaseLabel = 'Світанок';

  let skyHex = mixHex('#091026', '#cce7f8', dayFactor);
  skyHex = mixHex(skyHex, '#f29f95', dawnFactor * 0.8);
  skyHex = mixHex(skyHex, '#d96b38', sunsetFactor * 0.88);

  const fogHex = mixHex(skyHex, '#ea8250', sunsetFactor * 0.35);

  let sunHex = mixHex('#6b93f2', '#fff4d6', dayFactor);
  sunHex = mixHex(sunHex, '#ffad85', dawnFactor * 0.8);
  sunHex = mixHex(sunHex, '#ff6a2b', sunsetFactor * 0.92);

  let hemiSkyHex = mixHex('#1a2854', '#bfe4ff', dayFactor);
  hemiSkyHex = mixHex(hemiSkyHex, '#f4a29e', dawnFactor * 0.65);
  hemiSkyHex = mixHex(hemiSkyHex, '#f48453', sunsetFactor * 0.75);

  const hemiGroundHex = mixHex('#0c1226', '#6b8e4e', Math.max(dayFactor, sunsetFactor * 0.4));

  const sunIntensity = lerp(0.24, 1.72, dayFactor) + sunsetFactor * 0.48 + dawnFactor * 0.24;
  const hemiIntensity = lerp(0.22, 0.92, dayFactor) + sunsetFactor * 0.15;
  const envIntensity = lerp(0.22, 1.0, dayFactor) + sunsetFactor * 0.25;
  const lanternEmissiveIntensity = 0.25 + nightFactor * 2.1 + sunsetFactor * 1.15 + dawnFactor * 0.6;

  return {
    normalizedPhase: phase,
    dayFactor,
    dawnFactor,
    sunsetFactor,
    nightFactor,
    sunAngle: (phase - 0.25) * Math.PI * 2,
    phaseLabel,
    skyHex,
    fogHex,
    sunHex,
    hemiSkyHex,
    hemiGroundHex,
    sunIntensity,
    hemiIntensity,
    envIntensity,
    lanternEmissiveIntensity,
  };
}

export function applyDayNightShader<T extends THREE.MeshStandardMaterial>(
  material: T,
  uniforms: DayNightUniforms,
): T {
  material.customProgramCacheKey = () => 'kovel-daynight-v2';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uNightFactor = uniforms.uNightFactor;
    shader.uniforms.uSunsetFactor = uniforms.uSunsetFactor;
    shader.uniforms.uDawnFactor = uniforms.uDawnFactor;
    shader.uniforms.uLanternPos = uniforms.uLanternPos;
    shader.uniforms.uPlayerPos = uniforms.uPlayerPos;

    shader.vertexShader = shader.vertexShader
      .replace(
        'void main() {',
        'varying vec3 vDayWorldPos;\nvarying vec3 vDayWorldNormal;\nvoid main() {',
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 dayWp = vec4( transformed, 1.0 );
        #ifdef USE_INSTANCING
          dayWp = instanceMatrix * dayWp;
        #endif
        dayWp = modelMatrix * dayWp;
        vDayWorldPos = dayWp.xyz;
        vec3 dayWn = objectNormal;
        #ifdef USE_INSTANCING
          dayWn = mat3( instanceMatrix ) * dayWn;
        #endif
        vDayWorldNormal = normalize( mat3( modelMatrix ) * dayWn );`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        `uniform float uTime;
        uniform float uNightFactor;
        uniform float uSunsetFactor;
        uniform float uDawnFactor;
        uniform vec3 uLanternPos;
        uniform vec3 uPlayerPos;
        varying vec3 vDayWorldPos;
        varying vec3 vDayWorldNormal;
        void main() {`,
      )
      .replace(
        '#include <tonemapping_fragment>',
        `vec3 dayN = normalize(vDayWorldNormal);
        float sideMask = pow(clamp(1.0 - max(dayN.y, 0.0), 0.0, 1.0), 1.3);

        // Dawn gentle rose-peach mist & horizon blush
        vec3 dawnTint = gl_FragColor.rgb * vec3(0.95, 0.72, 0.80) + vec3(0.08, 0.03, 0.05) * sideMask;
        gl_FragColor.rgb = mix(gl_FragColor.rgb, dawnTint, uDawnFactor * 0.62);

        // Golden Hour Sunset rich amber-coral glow & warm rim light
        vec3 sunsetShade = gl_FragColor.rgb * vec3(1.12, 0.66, 0.42) + vec3(0.26, 0.09, 0.02) * (0.35 + 0.65 * sideMask);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, sunsetShade, uSunsetFactor * 0.78);

        // Midnight deep moonlit indigo grading with silver-blue rim
        vec3 nightShade = gl_FragColor.rgb * vec3(0.16, 0.24, 0.50) + vec3(0.008, 0.015, 0.045);
        float moonRim = pow(clamp(abs(dayN.x + dayN.z) * 0.5, 0.0, 1.0), 1.8);
        nightShade += vec3(0.035, 0.065, 0.14) * moonRim;
        gl_FragColor.rgb = mix(gl_FragColor.rgb, nightShade, uNightFactor * 0.88);

        // Warm flickering Town Hall lantern + Farmer personal lantern radiance at dusk/night
        float flicker = 0.92 + 0.08 * sin(uTime * 7.2 + sin(uTime * 13.7) * 1.2);
        float distTown = distance(vDayWorldPos, uLanternPos);
        float attenTown = smoothstep(26.0, 1.8, distTown);
        float distPlayer = distance(vDayWorldPos, uPlayerPos);
        float attenPlayer = smoothstep(10.5, 0.8, distPlayer);
        float lanternStrength = clamp(uNightFactor * 1.0 + uSunsetFactor * 0.6 + uDawnFactor * 0.35, 0.0, 1.0);
        gl_FragColor.rgb += vec3(1.0, 0.60, 0.20) * (attenTown * attenTown * 0.72 + attenPlayer * attenPlayer * 0.52) * flicker * lanternStrength;

        #include <tonemapping_fragment>`,
      );
  };
  material.needsUpdate = true;
  return material;
}
