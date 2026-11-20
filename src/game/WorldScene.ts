import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  GRID_MAX,
  GRID_MIN,
  GRID_SIZE,
  TILE_SIZE,
  TOOL_CATALOG,
  VOXELS_PER_PLOT,
  VOXEL_SIZE,
  gridKey,
  isTownPlazaTile,
} from './catalog';
import {
  applyDayNightShader,
  computeDayNightState,
  type DayNightUniforms,
} from './dayNightShader';
import {
  computeVoxelGrowth,
  gridToWorldCenter,
  isPlotAdjacentToOwned,
  normalizePlot,
  resolvePlayerMovement,
  voxelToWorldCenter,
  worldToVoxel,
} from './rules';
import type { DayTimeMode, GamePhase, LandSquare, PlayerProfile } from './types';
import { buildVoxelCropMesh, createFarmerRig, createTownHallGroup, type FarmerRig } from './voxelModels';
import { createVoxelTextureSet } from './voxelTextures';

export interface WorldSceneCallbacks {
  onHoverSquare: (key: string | null, vIdx: number) => void;
  onSelectSquare: (key: string, vIdx: number) => void;
  onLocalPlayerMove: (x: number, z: number, yaw: number, isMoving: boolean) => void;
  onStandingSquareChange: (key: string | null, vIdx: number) => void;
  onDayPhaseLabelChange?: (label: string) => void;
}

interface ParticleSlot {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  scale: number;
  color: THREE.Color;
}

const PARTICLE_POOL_SIZE = 96;
const FIREFLY_COUNT = 36;

// Reusable scratch objects outside the render loop (Zero-GC)
const _vec3 = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _color = new THREE.Color();
const _raycaster = new THREE.Raycaster();
const _pointerNdc = new THREE.Vector2();
const _groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _hitPoint = new THREE.Vector3();

function detectSoftwareGl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export class WorldSceneController {
  private container: HTMLElement;
  private callbacks: WorldSceneCallbacks;
  private isSoftwareGl: boolean;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private textures: ReturnType<typeof createVoxelTextureSet>;

  // Dynamic Day/Night Shaders & Lights
  private dayTimeMode: DayTimeMode = 'auto';
  private cycleClockSec = 0;
  private lastDayPhaseLabel = 'День';
  private shaderUniforms: DayNightUniforms;
  private hemiLight!: THREE.HemisphereLight;
  private sunLight!: THREE.DirectionalLight;
  private rimLight!: THREE.DirectionalLight;
  private townHallEmissiveMats: THREE.MeshStandardMaterial[] = [];
  private fireflyMesh!: THREE.InstancedMesh;
  private fireflySeeds: Array<{ x: number; y: number; z: number; phase: number; speed: number }> = [];

  private phase: GamePhase = 'title';
  private localUid = 'demo_local_player';
  private playersData: Record<string, PlayerProfile> = {};
  private plotsData: Record<string, LandSquare> = {};

  private farmerRigs = new Map<string, FarmerRig>();
  private badgeLayerEl: HTMLElement | null = null;
  private badgeEls = new Map<string, HTMLDivElement>();

  // Instanced ground voxels (24x24 squares * 9 voxels = 5184 cells)
  private grassVoxels!: THREE.InstancedMesh;
  private tilledVoxels!: THREE.InstancedMesh;
  private wateredVoxels!: THREE.InstancedMesh;
  private stakeInstances!: THREE.InstancedMesh;
  private tileIndexMap = new Map<string, number>();

  // Crop visual groups keyed by `${plotKey}#${vIdx}`
  private cropGroupMap = new Map<string, { group: THREE.Group; signature: string }>();
  private cropsLayer = new THREE.Group();

  // Outer 3x3 plot cursor + inner 1x1 sub-voxel highlight
  private cursorMesh: THREE.Group;
  private cursorMat: THREE.MeshBasicMaterial;
  private voxelCursorMesh: THREE.Group;
  private voxelCursorMat: THREE.MeshBasicMaterial;
  private hoveredKey: string | null = null;
  private hoveredVIdx = 4;
  private standingKey: string | null = null;
  private standingVIdx = 4;

  // Pooled particles
  private particleMesh: THREE.InstancedMesh;
  private particles: ParticleSlot[] = [];
  private particleCursor = 0;

  // Camera & input state
  private camZoom = 1.05;
  private camTargetZoom = 1.05;
  private camAngleIdx = 0;
  private camCurrentAngle = Math.PI / 4;
  private camLookPos = new THREE.Vector3(0, 0, 0);
  private titleTime = 0;
  private frustumHalf = 12.2;

  private keysHeld = new Set<string>();
  private walkTarget: { x: number; z: number; interactKey?: string; interactVIdx?: number } | null = null;
  private lastCropCheckAt = 0;
  private lastMovedEmitAt = 0;
  private localPos = { x: 1.5, z: 1.5, yaw: 0 };

  private frameId = 0;
  private lastTickTime = performance.now();
  private destroyed = false;
  private resizeObserver: ResizeObserver;

  constructor(
    container: HTMLElement,
    badgeLayer: HTMLElement | null,
    callbacks: WorldSceneCallbacks,
  ) {
    this.container = container;
    this.badgeLayerEl = badgeLayer;
    this.callbacks = callbacks;
    this.isSoftwareGl = detectSoftwareGl();

    // Town Hall sits around (-10.5 * TILE_SIZE, -10.7 * TILE_SIZE)
    this.shaderUniforms = {
      uTime: { value: 0 },
      uNightFactor: { value: 0 },
      uSunsetFactor: { value: 0 },
      uDawnFactor: { value: 0 },
      uLanternPos: { value: new THREE.Vector3(-10.5 * TILE_SIZE, 2.2, -10.0 * TILE_SIZE) },
      uPlayerPos: { value: new THREE.Vector3(this.localPos.x, 1.4, this.localPos.z) },
    };

    const width = Math.max(container.clientWidth, 320);
    const height = Math.max(container.clientHeight, 240);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setSize(width, height);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    const skyColor = new THREE.Color('#cce7f8');
    this.scene.background = skyColor;
    this.scene.fog = new THREE.Fog('#cce7f8', 58, 138);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const aspect = width / height;
    const h = this.frustumHalf / this.camZoom;
    this.camera = new THREE.OrthographicCamera(-h * aspect, h * aspect, h, -h, 0.5, 200);
    this.updateCameraTransform(1);

    const maxAniso = this.isSoftwareGl ? 1 : this.renderer.capabilities.getMaxAnisotropy();
    this.textures = createVoxelTextureSet(maxAniso);

    this.setupLighting();
    this.buildWorldEnvironment();
    this.scene.add(this.cropsLayer);

    // Outer 3x3 square selection frame
    this.cursorMesh = new THREE.Group();
    this.cursorMat = new THREE.MeshBasicMaterial({ color: '#22c55e', transparent: true, opacity: 0.92 });
    const barW = TILE_SIZE;
    const barThick = 0.12;
    const barH = 0.08;
    const barNS = new THREE.BoxGeometry(barW, barH, barThick);
    const barEW = new THREE.BoxGeometry(barThick, barH, barW);
    const nBar = new THREE.Mesh(barNS, this.cursorMat);
    nBar.position.set(0, 0.05, -barW / 2 + barThick / 2);
    const sBar = new THREE.Mesh(barNS, this.cursorMat);
    sBar.position.set(0, 0.05, barW / 2 - barThick / 2);
    const wBar = new THREE.Mesh(barEW, this.cursorMat);
    wBar.position.set(-barW / 2 + barThick / 2, 0.05, 0);
    const eBar = new THREE.Mesh(barEW, this.cursorMat);
    eBar.position.set(barW / 2 - barThick / 2, 0.05, 0);
    this.cursorMesh.add(nBar, sBar, wBar, eBar);
    this.cursorMesh.visible = false;
    this.scene.add(this.cursorMesh);

    // Inner 1x1 sub-voxel selection highlight
    this.voxelCursorMesh = new THREE.Group();
    this.voxelCursorMat = new THREE.MeshBasicMaterial({ color: '#fef08a', transparent: true, opacity: 0.95 });
    const vThick = 0.08;
    const vH = 0.1;
    const vNS = new THREE.BoxGeometry(VOXEL_SIZE - 0.04, vH, vThick);
    const vEW = new THREE.BoxGeometry(vThick, vH, VOXEL_SIZE - 0.04);
    const vn = new THREE.Mesh(vNS, this.voxelCursorMat);
    vn.position.set(0, 0.06, -VOXEL_SIZE / 2 + vThick / 2 + 0.02);
    const vs = new THREE.Mesh(vNS, this.voxelCursorMat);
    vs.position.set(0, 0.06, VOXEL_SIZE / 2 - vThick / 2 - 0.02);
    const vw = new THREE.Mesh(vEW, this.voxelCursorMat);
    vw.position.set(-VOXEL_SIZE / 2 + vThick / 2 + 0.02, 0.06, 0);
    const ve = new THREE.Mesh(vEW, this.voxelCursorMat);
    ve.position.set(VOXEL_SIZE / 2 - vThick / 2 - 0.02, 0.06, 0);
    this.voxelCursorMesh.add(vn, vs, vw, ve);
    this.voxelCursorMesh.visible = false;
    this.scene.add(this.voxelCursorMesh);

    // Pooled voxel particle system
    const pGeo = new THREE.BoxGeometry(0.18, 0.18, 0.18);
    const pMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.55, metalness: 0.1 });
    this.particleMesh = new THREE.InstancedMesh(pGeo, pMat, PARTICLE_POOL_SIZE);
    this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particleMesh.frustumCulled = false;
    for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: -50,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 1,
        scale: 0,
        color: new THREE.Color('#ffffff'),
      });
      _mat4.makeScale(0, 0, 0);
      this.particleMesh.setMatrixAt(i, _mat4);
      this.particleMesh.setColorAt(i, _color);
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.particleMesh);

    // Night fireflies
    const ffGeo = new THREE.BoxGeometry(0.14, 0.14, 0.14);
    const ffMat = new THREE.MeshBasicMaterial({ color: '#fde047', transparent: true, opacity: 0.92 });
    this.fireflyMesh = new THREE.InstancedMesh(ffGeo, ffMat, FIREFLY_COUNT);
    this.fireflyMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.fireflyMesh.frustumCulled = false;
    for (let i = 0; i < FIREFLY_COUNT; i++) {
      this.fireflySeeds.push({
        x: ((i * 19) % 64) - 32,
        y: 0.7 + ((i * 7) % 12) * 0.14,
        z: ((i * 29) % 64) - 32,
        phase: i * 0.85,
        speed: 0.9 + (i % 5) * 0.22,
      });
      _mat4.makeScale(0, 0, 0);
      this.fireflyMesh.setMatrixAt(i, _mat4);
    }
    this.fireflyMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.fireflyMesh);

    this.applyDayNightLighting(0);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);
    this.bindEvents();
    this.updateCameraTransform(1);
    this.renderer.render(this.scene, this.camera);
    this.scheduleNextTick();
  }

  private setupLighting() {
    this.hemiLight = new THREE.HemisphereLight('#bfe4ff', '#6b8e4e', 0.88);
    this.hemiLight.position.set(0, 40, 0);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight('#fff4d6', 1.65);
    this.sunLight.position.set(24, 38, 20);
    this.sunLight.castShadow = !this.isSoftwareGl;
    this.sunLight.shadow.mapSize.width = 1024;
    this.sunLight.shadow.mapSize.height = 1024;
    const d = 42;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.camera.near = 2;
    this.sunLight.shadow.camera.far = 115;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.02;
    this.scene.add(this.sunLight);

    this.rimLight = new THREE.DirectionalLight('#93c5fd', 0.45);
    this.rimLight.position.set(-24, 16, -26);
    this.scene.add(this.rimLight);
  }

  private buildWorldEnvironment() {
    // 1. Extended meadow apron around 24x24 grid (24 * 3 = 72x72 playable world)
    const apronGeo = new THREE.PlaneGeometry(220, 220);
    const apronMat = applyDayNightShader(
      new THREE.MeshStandardMaterial({ color: '#5fa041', roughness: 0.94, metalness: 0 }),
      this.shaderUniforms,
    );
    const apron = new THREE.Mesh(apronGeo, apronMat);
    apron.rotation.x = -Math.PI / 2;
    apron.position.y = -0.08;
    apron.receiveShadow = !this.isSoftwareGl;
    this.scene.add(apron);

    // 2. Town Plaza cobblestone pad (4x4 squares in NW corner: gx -12..-9, gz -12..-9)
    const plazaGeo = new THREE.BoxGeometry(4 * TILE_SIZE, 0.16, 4 * TILE_SIZE);
    const plazaTex = this.textures.cobbleTile.clone();
    plazaTex.repeat.set(6, 6);
    plazaTex.needsUpdate = true;
    const plazaMat = applyDayNightShader(
      new THREE.MeshStandardMaterial({
        map: plazaTex,
        roughness: 0.85,
        metalness: 0.05,
      }),
      this.shaderUniforms,
    );
    const plaza = new THREE.Mesh(plazaGeo, plazaMat);
    plaza.position.set(-10 * TILE_SIZE, -0.02, -10 * TILE_SIZE);
    plaza.receiveShadow = !this.isSoftwareGl;
    this.scene.add(plaza);

    // 3. Town Hall / Market Pavilion Landmark
    const townHall = createTownHallGroup(this.textures, !this.isSoftwareGl, this.shaderUniforms);
    townHall.position.set(-10.45 * TILE_SIZE, 0.06, -10.65 * TILE_SIZE);
    this.townHallEmissiveMats = (townHall.userData.emissiveMats as THREE.MeshStandardMaterial[]) || [];
    this.scene.add(townHall);

    // 4. Shimmering voxel pond outside SE edge
    const pondMat = applyDayNightShader(
      new THREE.MeshStandardMaterial({
        color: '#38bdf8',
        roughness: 0.16,
        metalness: 0.25,
        transparent: true,
        opacity: 0.88,
      }),
      this.shaderUniforms,
    );
    const pond = new THREE.Mesh(new THREE.BoxGeometry(15, 0.14, 11), pondMat);
    pond.position.set(44, -0.02, 39);
    this.scene.add(pond);

    // 5. Instanced Grid Voxels (24*24 squares * 9 voxels = 5,184 voxel cells!)
    const tileCount = GRID_SIZE * GRID_SIZE;
    const voxelCount = tileCount * VOXELS_PER_PLOT;
    const voxelGeo = new THREE.BoxGeometry(VOXEL_SIZE - 0.05, 0.14, VOXEL_SIZE - 0.05);

    const grassMat = applyDayNightShader(
      new THREE.MeshStandardMaterial({ map: this.textures.grassTile, roughness: 0.9, metalness: 0 }),
      this.shaderUniforms,
    );
    const tilledMat = applyDayNightShader(
      new THREE.MeshStandardMaterial({ map: this.textures.tilledSoil, roughness: 0.95, metalness: 0 }),
      this.shaderUniforms,
    );
    const wateredMat = applyDayNightShader(
      new THREE.MeshStandardMaterial({ map: this.textures.wateredSoil, roughness: 0.45, metalness: 0.08 }),
      this.shaderUniforms,
    );

    this.grassVoxels = new THREE.InstancedMesh(voxelGeo, grassMat, voxelCount);
    this.tilledVoxels = new THREE.InstancedMesh(voxelGeo, tilledMat, voxelCount);
    this.wateredVoxels = new THREE.InstancedMesh(voxelGeo, wateredMat, voxelCount);
    this.grassVoxels.receiveShadow = !this.isSoftwareGl;
    this.tilledVoxels.receiveShadow = !this.isSoftwareGl;
    this.wateredVoxels.receiveShadow = !this.isSoftwareGl;

    const stakeGeo = new THREE.BoxGeometry(0.18, 0.48, 0.18);
    const stakeMat = applyDayNightShader(
      new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.72, metalness: 0.05 }),
      this.shaderUniforms,
    );
    this.stakeInstances = new THREE.InstancedMesh(stakeGeo, stakeMat, tileCount * 4);

    let idx = 0;
    for (let gx = GRID_MIN; gx <= GRID_MAX; gx++) {
      for (let gz = GRID_MIN; gz <= GRID_MAX; gz++) {
        const k = gridKey(gx, gz);
        this.tileIndexMap.set(k, idx);
        const plazaTile = isTownPlazaTile(gx, gz);

        for (let vIdx = 0; vIdx < VOXELS_PER_PLOT; vIdx++) {
          const vGlobal = idx * VOXELS_PER_PLOT + vIdx;
          if (plazaTile) {
            _mat4.makeScale(0, 0, 0);
          } else {
            const vc = voxelToWorldCenter(gx, gz, vIdx);
            _mat4.makeTranslation(vc.x, -0.07, vc.z);
          }
          this.grassVoxels.setMatrixAt(vGlobal, _mat4);
          _mat4.makeScale(0, 0, 0);
          this.tilledVoxels.setMatrixAt(vGlobal, _mat4);
          this.wateredVoxels.setMatrixAt(vGlobal, _mat4);
        }

        _mat4.makeScale(0, 0, 0);
        for (let s = 0; s < 4; s++) {
          this.stakeInstances.setMatrixAt(idx * 4 + s, _mat4);
          this.stakeInstances.setColorAt(idx * 4 + s, _color.set('#ffffff'));
        }
        idx++;
      }
    }

    this.grassVoxels.instanceMatrix.needsUpdate = true;
    this.tilledVoxels.instanceMatrix.needsUpdate = true;
    this.wateredVoxels.instanceMatrix.needsUpdate = true;
    this.stakeInstances.instanceMatrix.needsUpdate = true;
    if (this.stakeInstances.instanceColor) this.stakeInstances.instanceColor.needsUpdate = true;
    this.grassVoxels.computeBoundingSphere();
    this.tilledVoxels.computeBoundingSphere();
    this.wateredVoxels.computeBoundingSphere();
    this.stakeInstances.computeBoundingSphere();

    this.scene.add(this.grassVoxels, this.tilledVoxels, this.wateredVoxels, this.stakeInstances);

    this.buildPerimeterFoliage();
  }

  private buildPerimeterFoliage() {
    const spots: Array<[number, number]> = [];
    const minEdge = GRID_MIN * TILE_SIZE - 4.0;
    const maxEdge = (GRID_MAX + 1) * TILE_SIZE + 4.0;

    for (let i = 0; i < 56; i++) {
      const side = i % 4;
      const t = (i / 56) * (maxEdge - minEdge) + minEdge;
      const jitter = ((i * 17) % 7) * 1.1;
      if (side === 0) spots.push([t, minEdge - jitter]);
      else if (side === 1) spots.push([t, maxEdge + jitter]);
      else if (side === 2) spots.push([minEdge - jitter, t]);
      else spots.push([maxEdge + jitter, t]);
    }

    const trunkGeo = new THREE.BoxGeometry(0.7, 2.0, 0.7);
    const trunkMat = applyDayNightShader(
      new THREE.MeshStandardMaterial({ map: this.textures.woodPlank, roughness: 0.9 }),
      this.shaderUniforms,
    );
    const leafGeo = new THREE.BoxGeometry(2.3, 2.1, 2.3);
    const leafMat = applyDayNightShader(
      new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, metalness: 0.02 }),
      this.shaderUniforms,
    );

    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);
    const canopies = new THREE.InstancedMesh(leafGeo, leafMat, spots.length);
    trunks.castShadow = !this.isSoftwareGl;
    canopies.castShadow = !this.isSoftwareGl;

    const greens = ['#3b873e', '#2f7a38', '#4d9b47', '#35793a'];
    spots.forEach(([tx, tz], idx) => {
      const s = 0.86 + ((idx * 13) % 10) * 0.032;
      _scale.set(s, s, s);
      _quat.identity();
      _vec3.set(tx, 1.0 * s, tz);
      _mat4.compose(_vec3, _quat, _scale);
      trunks.setMatrixAt(idx, _mat4);

      _vec3.set(tx, 2.55 * s, tz);
      _mat4.compose(_vec3, _quat, _scale);
      canopies.setMatrixAt(idx, _mat4);
      canopies.setColorAt(idx, _color.set(greens[idx % greens.length]));
    });
    trunks.instanceMatrix.needsUpdate = true;
    canopies.instanceMatrix.needsUpdate = true;
    if (canopies.instanceColor) canopies.instanceColor.needsUpdate = true;
    trunks.computeBoundingSphere();
    canopies.computeBoundingSphere();
    this.scene.add(trunks, canopies);

    // Scatter 36 perimeter boulders around the 24x24 border
    const rockGeo = new THREE.BoxGeometry(1.0, 0.7, 0.9);
    const rockMat = applyDayNightShader(
      new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.92, metalness: 0.05 }),
      this.shaderUniforms,
    );
    const rocks = new THREE.InstancedMesh(rockGeo, rockMat, 36);
    const greys = ['#94a3b8', '#78716c', '#a1a1aa'];
    for (let i = 0; i < 36; i++) {
      const ang = (i / 36) * Math.PI * 2;
      const rad = 45 + (i % 5) * 2.5;
      const rx = Math.cos(ang) * rad;
      const rz = Math.sin(ang) * rad;
      const sc = 0.85 + (i % 4) * 0.12;
      _vec3.set(rx, 0.32 * sc, rz);
      _quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ang);
      _scale.set(sc, sc * 0.85, sc);
      _mat4.compose(_vec3, _quat, _scale);
      rocks.setMatrixAt(i, _mat4);
      rocks.setColorAt(i, _color.set(greys[i % greys.length]));
    }
    rocks.instanceMatrix.needsUpdate = true;
    if (rocks.instanceColor) rocks.instanceColor.needsUpdate = true;
    rocks.computeBoundingSphere();
    this.scene.add(rocks);
  }

  public setDayTimeMode(mode: DayTimeMode) {
    this.dayTimeMode = mode;
    this.applyDayNightLighting(0);
    if (this.isSoftwareGl) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  public getDayTimeMode(): DayTimeMode {
    return this.dayTimeMode;
  }

  public getDayPhaseLabel(): string {
    return this.lastDayPhaseLabel;
  }

  private applyDayNightLighting(dt: number) {
    this.cycleClockSec += dt;
    const state = computeDayNightState(this.dayTimeMode, this.cycleClockSec);

    this.shaderUniforms.uTime.value = this.cycleClockSec;
    this.shaderUniforms.uNightFactor.value = state.nightFactor;
    this.shaderUniforms.uSunsetFactor.value = state.sunsetFactor;
    this.shaderUniforms.uDawnFactor.value = state.dawnFactor;
    this.shaderUniforms.uPlayerPos.value.set(this.localPos.x, 1.4, this.localPos.z);

    if (this.scene.background instanceof THREE.Color) {
      this.scene.background.set(state.skyHex);
    }
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.color.set(state.fogHex);
    }
    this.scene.environmentIntensity = state.envIntensity;

    this.sunLight.color.set(state.sunHex);
    this.sunLight.intensity = state.sunIntensity;
    this.sunLight.position.set(
      Math.cos(state.sunAngle) * 32,
      Math.max(12, Math.sin(state.sunAngle) * 38 + 16),
      Math.sin(state.sunAngle) * 26 + 10,
    );

    this.hemiLight.color.set(state.hemiSkyHex);
    this.hemiLight.groundColor.set(state.hemiGroundHex);
    this.hemiLight.intensity = state.hemiIntensity;

    this.rimLight.intensity = 0.35 + state.nightFactor * 0.4 + state.sunsetFactor * 0.25;
    this.rimLight.color.set(state.sunsetFactor > 0.4 ? '#fb923c' : '#93c5fd');

    for (const m of this.townHallEmissiveMats) {
      m.emissiveIntensity = state.lanternEmissiveIntensity;
    }

    // Animate fireflies during twilight & night
    const ffScaleBase = THREE.MathUtils.clamp(state.nightFactor * 1.15 + state.sunsetFactor * 0.45, 0, 1);
    for (let i = 0; i < FIREFLY_COUNT; i++) {
      if (ffScaleBase < 0.08) {
        _mat4.makeScale(0, 0, 0);
      } else {
        const s = this.fireflySeeds[i];
        const t = this.cycleClockSec * s.speed + s.phase;
        const pulse = (0.45 + 0.55 * Math.sin(t * 2.4)) * ffScaleBase;
        _vec3.set(
          s.x + Math.sin(t * 0.8) * 1.4,
          s.y + Math.sin(t * 1.6) * 0.45,
          s.z + Math.cos(t * 0.7) * 1.4,
        );
        _quat.identity();
        _scale.set(pulse, pulse, pulse);
        _mat4.compose(_vec3, _quat, _scale);
      }
      this.fireflyMesh.setMatrixAt(i, _mat4);
    }
    this.fireflyMesh.instanceMatrix.needsUpdate = true;

    if (state.phaseLabel !== this.lastDayPhaseLabel) {
      this.lastDayPhaseLabel = state.phaseLabel;
      this.callbacks.onDayPhaseLabelChange?.(state.phaseLabel);
    }
  }

  public setPhase(phase: GamePhase) {
    this.phase = phase;
  }

  public setLocalUid(uid: string) {
    this.localUid = uid;
  }

  public syncPlayers(players: Record<string, PlayerProfile>, localPosOverride?: { x: number; z: number; yaw: number }) {
    this.playersData = players;
    if (localPosOverride) {
      this.localPos.x = localPosOverride.x;
      this.localPos.z = localPosOverride.z;
      this.localPos.yaw = localPosOverride.yaw;
    } else if (players[this.localUid]) {
      this.localPos.x = players[this.localUid].x;
      this.localPos.z = players[this.localUid].z;
      this.localPos.yaw = players[this.localUid].yaw;
    }

    const activeIds = new Set<string>();
    for (const p of Object.values(players)) {
      if (!p.isOnline && p.uid !== this.localUid) continue;
      activeIds.add(p.uid);
      let rig = this.farmerRigs.get(p.uid);
      if (!rig) {
        rig = createFarmerRig(p.color, this.textures, !this.isSoftwareGl, this.shaderUniforms);
        rig.root.position.set(p.x, 0, p.z);
        rig.root.rotation.y = p.yaw;
        this.scene.add(rig.root);
        this.farmerRigs.set(p.uid, rig);
      }
      rig.shirtMat.color.set(p.color);
      const toolDef = p.activeSlotItemId ? TOOL_CATALOG[p.activeSlotItemId] : null;
      if (toolDef?.toolFamily === 'watering_can') {
        rig.hoeHeadMat.color.set('#38bdf8');
      } else if ((toolDef?.tier ?? p.bestToolTier) >= 4) {
        rig.hoeHeadMat.color.set('#facc15');
      } else if ((toolDef?.tier ?? p.bestToolTier) === 3) {
        rig.hoeHeadMat.color.set('#e2e8f0');
      } else if ((toolDef?.tier ?? p.bestToolTier) === 2) {
        rig.hoeHeadMat.color.set('#94a3b8');
      } else {
        rig.hoeHeadMat.color.set('#9a5b32');
      }
      this.ensureBadgeEl(p);
    }

    for (const [uid, rig] of this.farmerRigs.entries()) {
      if (!activeIds.has(uid)) {
        this.scene.remove(rig.root);
        this.farmerRigs.delete(uid);
        const badge = this.badgeEls.get(uid);
        if (badge) {
          badge.remove();
          this.badgeEls.delete(uid);
        }
      }
    }
  }

  private ensureBadgeEl(player: PlayerProfile) {
    if (!this.badgeLayerEl) return;
    let el = this.badgeEls.get(player.uid);
    if (!el) {
      el = document.createElement('div');
      el.className =
        'absolute -translate-x-1/2 -translate-y-full px-2 py-0.5 rounded text-[11px] font-bold tracking-wide whitespace-nowrap shadow-md border pointer-events-none select-none';
      el.style.backgroundColor = 'rgba(20, 28, 22, 0.86)';
      el.style.color = '#fef9c3';
      el.style.borderColor = player.color;
      el.textContent = player.nickname;
      this.badgeLayerEl.appendChild(el);
      this.badgeEls.set(player.uid, el);
    } else if (el.textContent !== player.nickname) {
      el.textContent = player.nickname;
      el.style.borderColor = player.color;
    }
  }

  public syncPlots(plots: Record<string, LandSquare>) {
    this.plotsData = plots;
    const now = Date.now();

    for (const rawPlot of Object.values(plots)) {
      const plot = normalizePlot(rawPlot);
      const idx = this.tileIndexMap.get(plot.key);
      if (idx === undefined) continue;
      const { x, z } = gridToWorldCenter(plot.gx, plot.gz);

      for (let vIdx = 0; vIdx < VOXELS_PER_PLOT; vIdx++) {
        const vGlobal = idx * VOXELS_PER_PLOT + vIdx;
        const cell = plot.voxels[vIdx];
        const vc = voxelToWorldCenter(plot.gx, plot.gz, vIdx);

        if (cell.soil === 'grass') _mat4.makeTranslation(vc.x, -0.07, vc.z);
        else _mat4.makeScale(0, 0, 0);
        this.grassVoxels.setMatrixAt(vGlobal, _mat4);

        if (cell.soil === 'tilled') _mat4.makeTranslation(vc.x, -0.055, vc.z);
        else _mat4.makeScale(0, 0, 0);
        this.tilledVoxels.setMatrixAt(vGlobal, _mat4);

        if (cell.soil === 'watered') _mat4.makeTranslation(vc.x, -0.055, vc.z);
        else _mat4.makeScale(0, 0, 0);
        this.wateredVoxels.setMatrixAt(vGlobal, _mat4);
      }

      if (plot.ownerId) {
        const half = TILE_SIZE * 0.46;
        const corners: Array<[number, number]> = [
          [x - half, z - half],
          [x + half, z - half],
          [x - half, z + half],
          [x + half, z + half],
        ];
        _color.set(plot.ownerColor || '#f59e0b');
        corners.forEach(([cx, cz], s) => {
          _mat4.makeTranslation(cx, 0.24, cz);
          this.stakeInstances.setMatrixAt(idx * 4 + s, _mat4);
          this.stakeInstances.setColorAt(idx * 4 + s, _color);
        });
      } else {
        _mat4.makeScale(0, 0, 0);
        for (let s = 0; s < 4; s++) {
          this.stakeInstances.setMatrixAt(idx * 4 + s, _mat4);
        }
      }
    }

    this.grassVoxels.instanceMatrix.needsUpdate = true;
    this.tilledVoxels.instanceMatrix.needsUpdate = true;
    this.wateredVoxels.instanceMatrix.needsUpdate = true;
    this.stakeInstances.instanceMatrix.needsUpdate = true;
    if (this.stakeInstances.instanceColor) this.stakeInstances.instanceColor.needsUpdate = true;

    this.refreshCropMeshes(now);
  }

  private refreshCropMeshes(now: number) {
    const activeKeys = new Set<string>();
    for (const rawPlot of Object.values(this.plotsData)) {
      const plot = normalizePlot(rawPlot);
      for (let vIdx = 0; vIdx < VOXELS_PER_PLOT; vIdx++) {
        const cell = plot.voxels[vIdx];
        if (!cell || !cell.cropId) continue;
        const cKey = `${plot.key}#${vIdx}`;
        activeKeys.add(cKey);
        const { stage } = computeVoxelGrowth(cell, now);
        const sig = `${cell.cropId}_${stage}`;
        const existing = this.cropGroupMap.get(cKey);
        if (!existing || existing.signature !== sig) {
          if (existing) {
            this.cropsLayer.remove(existing.group);
          }
          const mesh = buildVoxelCropMesh(cell.cropId, stage, !this.isSoftwareGl, this.shaderUniforms);
          const vc = voxelToWorldCenter(plot.gx, plot.gz, vIdx);
          mesh.position.set(vc.x, 0.02, vc.z);
          this.cropsLayer.add(mesh);
          this.cropGroupMap.set(cKey, { group: mesh, signature: sig });
        }
      }
    }

    for (const [k, entry] of this.cropGroupMap.entries()) {
      if (!activeKeys.has(k)) {
        this.cropsLayer.remove(entry.group);
        this.cropGroupMap.delete(k);
      }
    }
  }

  public triggerToolSwing(uid = this.localUid) {
    const rig = this.farmerRigs.get(uid);
    if (rig) {
      rig.swingTimer = 0.28;
    }
  }

  public spawnParticles(wx: number, wz: number, hexColor: string, count = 12) {
    for (let i = 0; i < count; i++) {
      const slot = this.particles[this.particleCursor];
      this.particleCursor = (this.particleCursor + 1) % PARTICLE_POOL_SIZE;
      const ang = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const spd = 1.6 + Math.random() * 2.4;
      slot.active = true;
      slot.x = wx + (Math.random() - 0.5) * 0.6;
      slot.y = 0.3 + Math.random() * 0.35;
      slot.z = wz + (Math.random() - 0.5) * 0.6;
      slot.vx = Math.cos(ang) * spd;
      slot.vy = 2.8 + Math.random() * 2.2;
      slot.vz = Math.sin(ang) * spd;
      slot.life = 0;
      slot.maxLife = 0.42 + Math.random() * 0.25;
      slot.scale = 0.75 + Math.random() * 0.65;
      slot.color.set(hexColor);
    }
  }

  public rotateCameraStep(dir: 1 | -1) {
    this.camAngleIdx = (this.camAngleIdx + dir + 4) % 4;
  }

  public teleportLocalPlayer(x: number, z: number) {
    this.localPos.x = x;
    this.localPos.z = z;
    this.walkTarget = null;
    const rig = this.farmerRigs.get(this.localUid);
    if (rig) {
      rig.root.position.set(x, 0, z);
    }
    this.callbacks.onLocalPlayerMove(x, z, this.localPos.yaw, false);
  }

  public clearInputs() {
    this.keysHeld.clear();
  }

  private bindEvents() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onWindowBlur);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.renderer.domElement.addEventListener('pointermove', this.onPointerMove);
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.addEventListener('wheel', this.onWheel, { passive: true });
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.code === 'KeyQ') this.rotateCameraStep(-1);
    else if (e.code === 'KeyE' && this.phase === 'playing') {
      if (this.standingKey) this.callbacks.onSelectSquare(this.standingKey, this.standingVIdx);
    }
    this.keysHeld.add(e.code);
    if (
      this.keysHeld.has('KeyW') ||
      this.keysHeld.has('KeyA') ||
      this.keysHeld.has('KeyS') ||
      this.keysHeld.has('KeyD') ||
      this.keysHeld.has('ArrowUp') ||
      this.keysHeld.has('ArrowDown') ||
      this.keysHeld.has('ArrowLeft') ||
      this.keysHeld.has('ArrowRight')
    ) {
      this.walkTarget = null;
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keysHeld.delete(e.code);
  };

  private onWindowBlur = () => {
    this.keysHeld.clear();
  };

  private onVisibilityChange = () => {
    if (document.hidden) this.keysHeld.clear();
  };

  private onWheel = (e: WheelEvent) => {
    this.camTargetZoom = THREE.MathUtils.clamp(
      this.camTargetZoom - Math.sign(e.deltaY) * 0.12,
      0.55,
      1.95,
    );
  };

  private pickVoxelAtPointer(clientX: number, clientY: number): { key: string; vIdx: number } | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    _pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    _pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    _raycaster.setFromCamera(_pointerNdc, this.camera);
    const hit = _raycaster.ray.intersectPlane(_groundPlane, _hitPoint);
    if (!hit) return null;
    const { gx, gz, vIdx } = worldToVoxel(_hitPoint.x, _hitPoint.z);
    const k = gridKey(gx, gz);
    return this.plotsData[k] ? { key: k, vIdx } : null;
  }

  private onPointerMove = (e: PointerEvent) => {
    if (this.phase !== 'playing') return;
    const hit = this.pickVoxelAtPointer(e.clientX, e.clientY);
    const nextKey = hit?.key ?? null;
    const nextVIdx = hit?.vIdx ?? 4;
    if (nextKey !== this.hoveredKey || nextVIdx !== this.hoveredVIdx) {
      this.hoveredKey = nextKey;
      this.hoveredVIdx = nextVIdx;
      this.callbacks.onHoverSquare(nextKey, nextVIdx);
    }
  };

  private onPointerDown = (e: PointerEvent) => {
    if (this.phase !== 'playing' || e.button !== 0) return;
    const hit = this.pickVoxelAtPointer(e.clientX, e.clientY);
    if (!hit) return;
    const plot = this.plotsData[hit.key];
    if (!plot) return;

    const localP = this.playersData[this.localUid];
    // During starter 4-plot claiming, clicking any unowned square claims immediately without long walks
    if (localP && localP.freeClaimsRemaining > 0 && !plot.ownerId) {
      this.callbacks.onSelectSquare(hit.key, hit.vIdx);
      return;
    }

    const vc = voxelToWorldCenter(plot.gx, plot.gz, hit.vIdx);
    const dist = Math.hypot(vc.x - this.localPos.x, vc.z - this.localPos.z);
    if (dist <= TILE_SIZE * 1.9) {
      this.callbacks.onSelectSquare(hit.key, hit.vIdx);
    } else {
      this.walkTarget = { x: vc.x, z: vc.z, interactKey: hit.key, interactVIdx: hit.vIdx };
    }
  };

  private handleResize() {
    const w = Math.max(this.container.clientWidth, 320);
    const h = Math.max(this.container.clientHeight, 240);
    this.renderer.setSize(w, h);
    this.updateCameraFrustum(w, h);
    this.renderer.render(this.scene, this.camera);
  }

  private updateCameraFrustum(w: number, h: number) {
    const aspect = w / h;
    const halfH = this.frustumHalf / this.camZoom;
    this.camera.left = -halfH * aspect;
    this.camera.right = halfH * aspect;
    this.camera.top = halfH;
    this.camera.bottom = -halfH;
    this.camera.updateProjectionMatrix();
  }

  private updateCameraTransform(dt: number) {
    const targetAngle = Math.PI / 4 + this.camAngleIdx * (Math.PI / 2);
    let diff = targetAngle - this.camCurrentAngle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.camCurrentAngle += diff * (1 - Math.exp(-9 * dt));

    this.camZoom = THREE.MathUtils.damp(this.camZoom, this.camTargetZoom, 8, dt);
    const w = Math.max(this.container.clientWidth, 320);
    const h = Math.max(this.container.clientHeight, 240);
    this.updateCameraFrustum(w, h);

    if (this.phase === 'title') {
      this.titleTime += dt;
      const tourAngle = Math.PI / 4 + Math.sin(this.titleTime * 0.2) * 0.22;
      const tourX = -25 + Math.cos(this.titleTime * 0.16) * 2.5;
      const tourZ = -19 + Math.sin(this.titleTime * 0.16) * 2.5;
      this.camLookPos.x = THREE.MathUtils.damp(this.camLookPos.x, tourX, 5, dt);
      this.camLookPos.z = THREE.MathUtils.damp(this.camLookPos.z, tourZ, 5, dt);
      const dist = 36;
      this.camera.position.set(
        this.camLookPos.x + Math.cos(tourAngle) * dist,
        30,
        this.camLookPos.z + Math.sin(tourAngle) * dist,
      );
      this.camera.lookAt(this.camLookPos.x, 1.0, this.camLookPos.z);
    } else {
      this.camLookPos.x = THREE.MathUtils.damp(this.camLookPos.x, this.localPos.x, 8, dt);
      this.camLookPos.z = THREE.MathUtils.damp(this.camLookPos.z, this.localPos.z, 8, dt);
      const dist = 36;
      this.camera.position.set(
        this.camLookPos.x + Math.cos(this.camCurrentAngle) * dist,
        30,
        this.camLookPos.z + Math.sin(this.camCurrentAngle) * dist,
      );
      this.camera.lookAt(this.camLookPos.x, 0.5, this.camLookPos.z);
    }
  }

  private stepSimulation(dt: number, nowMs: number) {
    // 0. Step Day/Night GLSL shaders, sunlight arc & fireflies
    this.applyDayNightLighting(dt);

    // 1. Local farmer movement
    if (this.phase === 'playing') {
      let inX = 0;
      let inZ = 0;
      if (this.keysHeld.has('KeyW') || this.keysHeld.has('ArrowUp')) inZ -= 1;
      if (this.keysHeld.has('KeyS') || this.keysHeld.has('ArrowDown')) inZ += 1;
      if (this.keysHeld.has('KeyA') || this.keysHeld.has('ArrowLeft')) inX -= 1;
      if (this.keysHeld.has('KeyD') || this.keysHeld.has('ArrowRight')) inX += 1;

      let worldDx = 0;
      let worldDz = 0;
      if (inX !== 0 || inZ !== 0) {
        const fwdX = -Math.cos(this.camCurrentAngle);
        const fwdZ = -Math.sin(this.camCurrentAngle);
        const rightX = Math.sin(this.camCurrentAngle);
        const rightZ = -Math.cos(this.camCurrentAngle);
        worldDx = fwdX * -inZ + rightX * inX;
        worldDz = fwdZ * -inZ + rightZ * inX;
      } else if (this.walkTarget) {
        const tx = this.walkTarget.x - this.localPos.x;
        const tz = this.walkTarget.z - this.localPos.z;
        const dist = Math.hypot(tx, tz);
        if (dist <= 1.2) {
          const ik = this.walkTarget.interactKey;
          const iv = this.walkTarget.interactVIdx ?? 4;
          this.walkTarget = null;
          if (ik) this.callbacks.onSelectSquare(ik, iv);
        } else {
          worldDx = tx;
          worldDz = tz;
        }
      }

      const moveRes = resolvePlayerMovement(this.localPos.x, this.localPos.z, worldDx, worldDz, dt, 7.2);
      if (moveRes.moved) {
        this.localPos.x = moveRes.x;
        this.localPos.z = moveRes.z;
        this.localPos.yaw = moveRes.yaw;
      }

      const localRig = this.farmerRigs.get(this.localUid);
      if (localRig) {
        localRig.root.position.set(this.localPos.x, 0, this.localPos.z);
        let yDiff = this.localPos.yaw - localRig.root.rotation.y;
        while (yDiff > Math.PI) yDiff -= Math.PI * 2;
        while (yDiff < -Math.PI) yDiff += Math.PI * 2;
        localRig.root.rotation.y += yDiff * (1 - Math.exp(-14 * dt));
        this.animateFarmerRig(localRig, moveRes.moved, dt);
      }

      if (moveRes.moved || nowMs - this.lastMovedEmitAt > 250) {
        if (moveRes.moved || this.playersData[this.localUid]?.isMoving) {
          this.lastMovedEmitAt = nowMs;
          this.callbacks.onLocalPlayerMove(this.localPos.x, this.localPos.z, this.localPos.yaw, moveRes.moved);
        }
      }

      const { gx, gz, vIdx } = worldToVoxel(this.localPos.x, this.localPos.z);
      const sKey = gridKey(gx, gz);
      const validStand = this.plotsData[sKey] ? sKey : null;
      if (validStand !== this.standingKey || vIdx !== this.standingVIdx) {
        this.standingKey = validStand;
        this.standingVIdx = vIdx;
        this.callbacks.onStandingSquareChange(validStand, vIdx);
      }
    }

    // 2. Smooth remote players + animate rigs
    for (const [uid, rig] of this.farmerRigs.entries()) {
      if (uid === this.localUid) continue;
      const p = this.playersData[uid];
      if (!p) continue;
      const prevX = rig.root.position.x;
      const prevZ = rig.root.position.z;
      rig.root.position.x = THREE.MathUtils.damp(prevX, p.x, 10, dt);
      rig.root.position.z = THREE.MathUtils.damp(prevZ, p.z, 10, dt);
      const movedDist = Math.hypot(rig.root.position.x - prevX, rig.root.position.z - prevZ);
      rig.root.rotation.y = p.yaw;
      this.animateFarmerRig(rig, movedDist > 0.008 || p.isMoving, dt);
    }

    // 3. Outer 3x3 square & inner 1x1 voxel highlight cursors
    const focusKey = this.hoveredKey || this.standingKey;
    const focusVIdx = this.hoveredKey ? this.hoveredVIdx : this.standingVIdx;
    const focusPlot = focusKey ? this.plotsData[focusKey] : null;
    if (focusPlot && this.phase === 'playing') {
      const c = gridToWorldCenter(focusPlot.gx, focusPlot.gz);
      this.cursorMesh.position.set(c.x, 0.01, c.z);
      this.cursorMesh.visible = true;

      if (focusPlot.ownerId === this.localUid) {
        this.cursorMat.color.set('#22c55e');
        const vc = voxelToWorldCenter(focusPlot.gx, focusPlot.gz, focusVIdx);
        this.voxelCursorMesh.position.set(vc.x, 0.02, vc.z);
        this.voxelCursorMesh.visible = true;
      } else if (!focusPlot.ownerId) {
        const adj = isPlotAdjacentToOwned(focusPlot.gx, focusPlot.gz, this.localUid, this.plotsData);
        this.cursorMat.color.set(adj ? '#facc15' : '#ef4444');
        this.voxelCursorMesh.visible = false;
      } else {
        this.cursorMat.color.set('#38bdf8');
        this.voxelCursorMesh.visible = false;
      }
    } else {
      this.cursorMesh.visible = false;
      this.voxelCursorMesh.visible = false;
    }

    // 4. Periodic crop growth mesh updates
    if (nowMs - this.lastCropCheckAt > 400) {
      this.lastCropCheckAt = nowMs;
      this.refreshCropMeshes(nowMs);
    }

    // 5. Update pooled particle burst
    let particlesDirty = false;
    for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      particlesDirty = true;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        _mat4.makeScale(0, 0, 0);
        this.particleMesh.setMatrixAt(i, _mat4);
        continue;
      }
      p.vy -= 12 * dt;
      p.x += p.vx * dt;
      p.y = Math.max(0.05, p.y + p.vy * dt);
      p.z += p.vz * dt;
      const t = 1 - p.life / p.maxLife;
      const sc = p.scale * t;
      _vec3.set(p.x, p.y, p.z);
      _quat.identity();
      _scale.set(sc, sc, sc);
      _mat4.compose(_vec3, _quat, _scale);
      this.particleMesh.setMatrixAt(i, _mat4);
      this.particleMesh.setColorAt(i, p.color);
    }
    if (particlesDirty) {
      this.particleMesh.instanceMatrix.needsUpdate = true;
      if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
    }
  }

  private animateFarmerRig(rig: FarmerRig, isMoving: boolean, dt: number) {
    if (isMoving) {
      rig.walkPhase += dt * 12;
      const swing = Math.sin(rig.walkPhase) * 0.55;
      rig.leftLeg.rotation.x = swing;
      rig.rightLeg.rotation.x = -swing;
      rig.leftArm.rotation.x = -swing * 0.7;
      if (rig.swingTimer <= 0) rig.rightArm.rotation.x = swing * 0.7;
      rig.bodyPivot.position.y = Math.abs(Math.sin(rig.walkPhase)) * 0.06;
    } else {
      rig.leftLeg.rotation.x = THREE.MathUtils.damp(rig.leftLeg.rotation.x, 0, 12, dt);
      rig.rightLeg.rotation.x = THREE.MathUtils.damp(rig.rightLeg.rotation.x, 0, 12, dt);
      rig.leftArm.rotation.x = THREE.MathUtils.damp(rig.leftArm.rotation.x, 0, 12, dt);
      rig.bodyPivot.position.y = THREE.MathUtils.damp(rig.bodyPivot.position.y, 0, 12, dt);
    }

    if (rig.swingTimer > 0) {
      rig.swingTimer = Math.max(0, rig.swingTimer - dt);
      const p = rig.swingTimer / 0.28;
      rig.rightArm.rotation.x = -Math.sin(p * Math.PI) * 1.45;
    } else if (!isMoving) {
      rig.rightArm.rotation.x = THREE.MathUtils.damp(rig.rightArm.rotation.x, 0, 12, dt);
    }
  }

  private updateOverheadBadges() {
    if (!this.badgeLayerEl) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width <= 0 || height <= 0) return;

    for (const [uid, rig] of this.farmerRigs.entries()) {
      const el = this.badgeEls.get(uid);
      if (!el) continue;
      if (this.phase === 'title') {
        el.style.display = 'none';
        continue;
      }
      _vec3.set(rig.root.position.x, 2.25, rig.root.position.z);
      _vec3.project(this.camera);
      if (_vec3.z < -1 || _vec3.z > 1) {
        el.style.display = 'none';
        continue;
      }
      const sx = (_vec3.x * 0.5 + 0.5) * width;
      const sy = (-_vec3.y * 0.5 + 0.5) * height;
      if (sx < 24 || sx > width - 24 || sy < 24 || sy > height - 24) {
        el.style.display = 'none';
        continue;
      }
      el.style.display = 'block';
      el.style.left = `${sx.toFixed(1)}px`;
      el.style.top = `${sy.toFixed(1)}px`;
    }
  }

  private afterDraw(cb: () => void) {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl || typeof gl.fenceSync !== 'function') {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.destroyed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private tick = () => {
    if (this.destroyed) return;
    const nowPerf = performance.now();
    const rawDt = (nowPerf - this.lastTickTime) / 1000;
    this.lastTickTime = nowPerf;
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

    this.stepSimulation(dt, Date.now());
    this.updateCameraTransform(dt);
    this.renderer.render(this.scene, this.camera);
    this.updateOverheadBadges();

    this.scheduleNextTick();
  };

  private scheduleNextTick() {
    if (this.destroyed) return;
    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  }

  public dispose() {
    this.destroyed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.resizeObserver.disconnect();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onWindowBlur);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.renderer.domElement.removeEventListener('pointermove', this.onPointerMove);
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.removeEventListener('wheel', this.onWheel);
    this.textures.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
