import * as THREE from 'three';
import { applyDayNightShader, type DayNightUniforms } from './dayNightShader';
import type { CropId } from './types';
import type { VoxelTextureSet } from './voxelTextures';

export interface FarmerRig {
  root: THREE.Group;
  bodyPivot: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Mesh;
  rightLeg: THREE.Mesh;
  toolMesh: THREE.Group;
  shirtMat: THREE.MeshStandardMaterial;
  hoeHeadMat: THREE.MeshStandardMaterial;
  walkPhase: number;
  swingTimer: number;
}

const sharedGeo = {
  box1: new THREE.BoxGeometry(1, 1, 1),
  shadowDisc: new THREE.CircleGeometry(0.58, 16),
};

function patchIf(mat: THREE.MeshStandardMaterial, uniforms?: DayNightUniforms) {
  if (uniforms) applyDayNightShader(mat, uniforms);
  return mat;
}

export function createFarmerRig(
  colorHex: string,
  textures: VoxelTextureSet,
  castShadows: boolean,
  uniforms?: DayNightUniforms,
): FarmerRig {
  const root = new THREE.Group();

  const shadowMat = new THREE.MeshBasicMaterial({
    map: textures.contactShadow,
    transparent: true,
    depthWrite: false,
    opacity: 0.72,
  });
  const shadow = new THREE.Mesh(sharedGeo.shadowDisc, shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  root.add(shadow);

  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);

  const skinMat = patchIf(new THREE.MeshStandardMaterial({ color: '#f3c6a5', roughness: 0.75, metalness: 0.02 }), uniforms);
  const shirtMat = patchIf(new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.72, metalness: 0.05 }), uniforms);
  const pantsMat = patchIf(new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.85, metalness: 0.05 }), uniforms);
  const hatMat = patchIf(new THREE.MeshStandardMaterial({ color: '#e9c46a', roughness: 0.88, metalness: 0.02 }), uniforms);
  const hatBandMat = patchIf(new THREE.MeshStandardMaterial({ color: '#b93829', roughness: 0.6, metalness: 0.1 }), uniforms);
  const eyeMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.2, metalness: 0.1 });
  const woodMat = patchIf(new THREE.MeshStandardMaterial({ map: textures.woodPlank, roughness: 0.85, metalness: 0.05 }), uniforms);
  const hoeHeadMat = patchIf(new THREE.MeshStandardMaterial({ color: '#94a3b8', roughness: 0.3, metalness: 0.85 }), uniforms);

  // Legs (pivoted at hip y = 0.45)
  const legGeo = new THREE.BoxGeometry(0.24, 0.45, 0.26);
  legGeo.translate(0, -0.225, 0);
  const leftLeg = new THREE.Mesh(legGeo, pantsMat);
  leftLeg.position.set(-0.15, 0.45, 0);
  leftLeg.castShadow = castShadows;
  bodyPivot.add(leftLeg);

  const rightLeg = new THREE.Mesh(legGeo, pantsMat);
  rightLeg.position.set(0.15, 0.45, 0);
  rightLeg.castShadow = castShadows;
  bodyPivot.add(rightLeg);

  // Torso
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.6, 0.34), shirtMat);
  torso.position.y = 0.75;
  torso.castShadow = castShadows;
  bodyPivot.add(torso);

  // Belt accent
  const belt = new THREE.Mesh(
    new THREE.BoxGeometry(0.61, 0.1, 0.37),
    patchIf(new THREE.MeshStandardMaterial({ color: '#4a2e19', roughness: 0.7, metalness: 0.15 }), uniforms),
  );
  belt.position.y = 0.52;
  bodyPivot.add(belt);

  // Head + eyes
  const headGroup = new THREE.Group();
  headGroup.position.y = 1.32;
  bodyPivot.add(headGroup);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), skinMat);
  head.castShadow = castShadows;
  headGroup.add(head);

  const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.04), eyeMat);
  eyeL.position.set(-0.11, 0.02, 0.25);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.11;
  headGroup.add(eyeL, eyeR);

  // Voxel Straw Hat
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.07, 0.84), hatMat);
  brim.position.y = 0.24;
  brim.castShadow = castShadows;
  const crown = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.2, 0.54), hatMat);
  crown.position.y = 0.36;
  crown.castShadow = castShadows;
  const ribbon = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.06, 0.56), hatBandMat);
  ribbon.position.y = 0.29;
  headGroup.add(brim, crown, ribbon);

  // Left Arm
  const armGeo = new THREE.BoxGeometry(0.2, 0.52, 0.22);
  armGeo.translate(0, -0.22, 0);
  const leftArm = new THREE.Group();
  leftArm.position.set(-0.4, 0.98, 0);
  const leftArmMesh = new THREE.Mesh(armGeo, shirtMat);
  leftArmMesh.castShadow = castShadows;
  leftArm.add(leftArmMesh);
  bodyPivot.add(leftArm);

  // Right Arm + Held Voxel Tool
  const rightArm = new THREE.Group();
  rightArm.position.set(0.4, 0.98, 0);
  const rightArmMesh = new THREE.Mesh(armGeo, shirtMat);
  rightArmMesh.castShadow = castShadows;
  rightArm.add(rightArmMesh);

  const toolMesh = new THREE.Group();
  toolMesh.position.set(0, -0.44, 0.14);
  toolMesh.rotation.x = Math.PI * 0.38;

  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.72, 0.08), woodMat);
  handle.position.y = 0.26;
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.09, 0.32), hoeHeadMat);
  blade.position.set(0, 0.6, 0.11);
  toolMesh.add(handle, blade);
  rightArm.add(toolMesh);
  bodyPivot.add(rightArm);

  return {
    root,
    bodyPivot,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    toolMesh,
    shirtMat,
    hoeHeadMat,
    walkPhase: 0,
    swingTimer: 0,
  };
}

export function createTownHallGroup(
  textures: VoxelTextureSet,
  castShadows: boolean,
  uniforms?: DayNightUniforms,
): THREE.Group {
  const group = new THREE.Group();

  const stoneMat = patchIf(new THREE.MeshStandardMaterial({ map: textures.cobbleTile, roughness: 0.85, metalness: 0.06 }), uniforms);
  const timberMat = patchIf(new THREE.MeshStandardMaterial({ map: textures.woodPlank, roughness: 0.8, metalness: 0.05 }), uniforms);
  const wallMat = patchIf(new THREE.MeshStandardMaterial({ color: '#f3ead8', roughness: 0.82, metalness: 0.02 }), uniforms);
  const roofMat = patchIf(new THREE.MeshStandardMaterial({ map: textures.terracotta, roughness: 0.68, metalness: 0.05 }), uniforms);
  const goldMat = patchIf(new THREE.MeshStandardMaterial({ color: '#f5b700', roughness: 0.22, metalness: 0.88 }), uniforms);
  const awningRed = patchIf(new THREE.MeshStandardMaterial({ color: '#dc2626', roughness: 0.75, metalness: 0.02 }), uniforms);

  const lanternGlow = new THREE.MeshStandardMaterial({
    color: '#fef08a',
    emissive: '#f59e0b',
    emissiveIntensity: 0.65,
    roughness: 0.2,
  });
  const windowGlow = new THREE.MeshStandardMaterial({
    color: '#fde68a',
    emissive: '#f59e0b',
    emissiveIntensity: 0.35,
    roughness: 0.3,
  });

  // 1. Stepped stone foundation plinth
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.45, 4.4), stoneMat);
  plinth.position.y = 0.225;
  plinth.receiveShadow = true;
  plinth.castShadow = castShadows;
  group.add(plinth);

  // 2. Main plaster hall body
  const body = new THREE.Mesh(new THREE.BoxGeometry(4.8, 2.5, 3.6), wallMat);
  body.position.y = 1.7;
  body.castShadow = castShadows;
  body.receiveShadow = true;
  group.add(body);

  // 3. Timber corner beams (4)
  const beamGeo = new THREE.BoxGeometry(0.28, 2.55, 0.28);
  const corners = [
    [-2.34, 1.72, -1.72],
    [2.34, 1.72, -1.72],
    [-2.34, 1.72, 1.72],
    [2.34, 1.72, 1.72],
  ];
  for (const [bx, by, bz] of corners) {
    const beam = new THREE.Mesh(beamGeo, timberMat);
    beam.position.set(bx, by, bz);
    beam.castShadow = castShadows;
    group.add(beam);
  }

  // Warm glowing Town Hall windows (side + front)
  for (const wx of [-1.45, 1.45]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.68, 0.08), windowGlow);
    win.position.set(wx, 2.25, 1.82);
    group.add(win);
  }
  const sideWin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.72, 0.85), windowGlow);
  sideWin.position.set(2.42, 1.85, 0);
  group.add(sideWin);

  // 4. Stepped Voxel Pitched Roof
  const roof1 = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.48, 4.2), roofMat);
  roof1.position.y = 3.18;
  roof1.castShadow = castShadows;
  const roof2 = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.46, 3.3), roofMat);
  roof2.position.y = 3.64;
  roof2.castShadow = castShadows;
  const roof3 = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.44, 2.3), roofMat);
  roof3.position.y = 4.08;
  roof3.castShadow = castShadows;
  group.add(roof1, roof2, roof3);

  // 5. Golden Coin Spire
  const spirePost = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.7, 0.24), timberMat);
  spirePost.position.y = 4.62;
  const coinDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.16, 12), goldMat);
  coinDisc.rotation.x = Math.PI / 2;
  coinDisc.position.y = 5.15;
  coinDisc.castShadow = castShadows;
  group.add(spirePost, coinDisc);

  // 6. Market Counter & Striped Awning on Front (+Z)
  const counter = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.75, 0.75), timberMat);
  counter.position.set(0, 0.82, 2.15);
  counter.castShadow = castShadows;
  const awning = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.22, 1.15), awningRed);
  awning.position.set(0, 2.25, 2.28);
  awning.rotation.x = 0.22;
  awning.castShadow = castShadows;
  group.add(counter, awning);

  // 7. Hanging Lanterns (front + side) + Crates
  const lanternFront = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.42, 0.32), lanternGlow);
  lanternFront.position.set(2.05, 2.1, 2.02);
  const lanternLeft = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.42, 0.32), lanternGlow);
  lanternLeft.position.set(-2.05, 2.1, 2.02);

  const crate = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.68, 0.68), timberMat);
  crate.position.set(-2.25, 0.78, 2.25);
  crate.castShadow = castShadows;
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.36, 0.72, 8), timberMat);
  barrel.position.set(2.25, 0.8, 2.25);
  barrel.castShadow = castShadows;
  group.add(lanternFront, lanternLeft, crate, barrel);

  group.userData.emissiveMats = [lanternGlow, windowGlow];
  return group;
}

const cropMatCache = new Map<string, THREE.MeshStandardMaterial>();
function getCropMat(
  color: string,
  roughness = 0.75,
  uniforms?: DayNightUniforms,
): THREE.MeshStandardMaterial {
  const key = `${color}_${roughness}_${uniforms ? 'dn' : 'std'}`;
  if (!cropMatCache.has(key)) {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.04 });
    if (uniforms) applyDayNightShader(m, uniforms);
    cropMatCache.set(key, m);
  }
  return cropMatCache.get(key)!;
}

// Built cleanly for a single 1.0 x 1.0 voxel sub-cell (centered at 0,0)
export function buildVoxelCropMesh(
  cropId: CropId,
  stage: 0 | 1 | 2 | 3,
  castShadows: boolean,
  uniforms?: DayNightUniforms,
): THREE.Group {
  const g = new THREE.Group();
  const sproutGreen = getCropMat('#5cb85c', 0.78, uniforms);
  const darkLeaf = getCropMat('#2f855a', 0.8, uniforms);

  if (stage === 0) {
    // Twin tiny seed mounds inside this voxel
    for (const [ox, oz] of [[-0.18, -0.15], [0.18, 0.16]]) {
      const m = new THREE.Mesh(sharedGeo.box1, getCropMat('#7c5836', 0.9, uniforms));
      m.scale.set(0.18, 0.11, 0.18);
      m.position.set(ox, 0.055, oz);
      g.add(m);
    }
    return g;
  }

  if (stage === 1) {
    // Crisp green sprout shoots
    for (const [ox, oz] of [[-0.17, -0.16], [0.17, 0.15]]) {
      const stem = new THREE.Mesh(sharedGeo.box1, sproutGreen);
      stem.scale.set(0.13, 0.28, 0.13);
      stem.position.set(ox, 0.14, oz);
      g.add(stem);
    }
    return g;
  }

  if (stage === 2) {
    // Bushy mid-growth voxel plant
    const tuft = new THREE.Mesh(sharedGeo.box1, sproutGreen);
    tuft.scale.set(0.42, 0.42, 0.42);
    tuft.position.set(0, 0.21, 0);
    tuft.castShadow = castShadows;
    g.add(tuft);
    return g;
  }

  // Stage 3: Ready to harvest voxel crop (fits inside 1x1 voxel cell!)
  if (cropId === 'radish') {
    const bulbMat = getCropMat('#e11d48', 0.55, uniforms);
    const bulb = new THREE.Mesh(sharedGeo.box1, bulbMat);
    bulb.scale.set(0.42, 0.32, 0.42);
    bulb.position.set(0, 0.16, 0);
    bulb.castShadow = castShadows;
    const leaf = new THREE.Mesh(sharedGeo.box1, darkLeaf);
    leaf.scale.set(0.3, 0.28, 0.3);
    leaf.position.set(0, 0.44, 0);
    g.add(bulb, leaf);
  } else if (cropId === 'wheat') {
    const goldWheat = getCropMat('#eab308', 0.72, uniforms);
    const stalkMat = getCropMat('#ca8a04', 0.8, uniforms);
    for (const [ox, oz] of [[-0.16, -0.14], [0.16, 0.15]]) {
      const stalk = new THREE.Mesh(sharedGeo.box1, stalkMat);
      stalk.scale.set(0.14, 0.48, 0.14);
      stalk.position.set(ox, 0.24, oz);
      const ear = new THREE.Mesh(sharedGeo.box1, goldWheat);
      ear.scale.set(0.24, 0.36, 0.24);
      ear.position.set(ox, 0.58, oz);
      ear.castShadow = castShadows;
      g.add(stalk, ear);
    }
  } else if (cropId === 'carrot') {
    const orange = getCropMat('#f97316', 0.62, uniforms);
    const root = new THREE.Mesh(sharedGeo.box1, orange);
    root.scale.set(0.36, 0.28, 0.36);
    root.position.set(0, 0.14, 0);
    const tops = new THREE.Mesh(sharedGeo.box1, darkLeaf);
    tops.scale.set(0.44, 0.36, 0.44);
    tops.position.set(0, 0.42, 0);
    tops.castShadow = castShadows;
    g.add(root, tops);
  } else if (cropId === 'sunflower') {
    const petal = getCropMat('#facc15', 0.55, uniforms);
    const center = getCropMat('#5c3317', 0.85, uniforms);
    const stem = new THREE.Mesh(sharedGeo.box1, darkLeaf);
    stem.scale.set(0.16, 0.76, 0.16);
    stem.position.set(0, 0.38, 0);
    const head = new THREE.Mesh(sharedGeo.box1, petal);
    head.scale.set(0.56, 0.56, 0.16);
    head.position.set(0, 0.9, 0);
    head.castShadow = castShadows;
    const core = new THREE.Mesh(sharedGeo.box1, center);
    core.scale.set(0.28, 0.28, 0.2);
    core.position.set(0, 0.9, 0);
    g.add(stem, head, core);
  } else {
    // Pumpkin: chunky voxel pumpkin filling this voxel
    const pumpMat = getCropMat('#ea580c', 0.62, uniforms);
    const stemMat = getCropMat('#15803d', 0.82, uniforms);
    const body = new THREE.Mesh(sharedGeo.box1, pumpMat);
    body.scale.set(0.68, 0.56, 0.68);
    body.position.set(0, 0.28, 0);
    body.castShadow = castShadows;
    const stem = new THREE.Mesh(sharedGeo.box1, stemMat);
    stem.scale.set(0.18, 0.18, 0.18);
    stem.position.set(0, 0.62, 0);
    g.add(body, stem);
  }
  return g;
}
