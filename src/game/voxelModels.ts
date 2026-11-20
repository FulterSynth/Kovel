import * as THREE from 'three';
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

export function createFarmerRig(
  colorHex: string,
  textures: VoxelTextureSet,
  castShadows: boolean,
): FarmerRig {
  const root = new THREE.Group();

  // Soft radial contact shadow on ground (y = 0.02 to prevent Z-fighting)
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

  const skinMat = new THREE.MeshStandardMaterial({ color: '#f3c6a5', roughness: 0.75, metalness: 0.02 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.72, metalness: 0.05 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.85, metalness: 0.05 });
  const hatMat = new THREE.MeshStandardMaterial({ color: '#e9c46a', roughness: 0.88, metalness: 0.02 });
  const hatBandMat = new THREE.MeshStandardMaterial({ color: '#b93829', roughness: 0.6, metalness: 0.1 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.2, metalness: 0.1 });
  const woodMat = new THREE.MeshStandardMaterial({ map: textures.woodPlank, roughness: 0.85, metalness: 0.05 });
  const hoeHeadMat = new THREE.MeshStandardMaterial({ color: '#94a3b8', roughness: 0.3, metalness: 0.85 });

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
    new THREE.MeshStandardMaterial({ color: '#4a2e19', roughness: 0.7, metalness: 0.15 }),
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

  // Voxel Straw Hat (2 parts: brim + crown + ribbon)
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

export function createTownHallGroup(textures: VoxelTextureSet, castShadows: boolean): THREE.Group {
  const group = new THREE.Group();

  const stoneMat = new THREE.MeshStandardMaterial({ map: textures.cobbleTile, roughness: 0.85, metalness: 0.06 });
  const timberMat = new THREE.MeshStandardMaterial({ map: textures.woodPlank, roughness: 0.8, metalness: 0.05 });
  const wallMat = new THREE.MeshStandardMaterial({ color: '#f3ead8', roughness: 0.82, metalness: 0.02 });
  const roofMat = new THREE.MeshStandardMaterial({ map: textures.terracotta, roughness: 0.68, metalness: 0.05 });
  const goldMat = new THREE.MeshStandardMaterial({ color: '#f5b700', roughness: 0.22, metalness: 0.88 });
  const awningRed = new THREE.MeshStandardMaterial({ color: '#dc2626', roughness: 0.75, metalness: 0.02 });
  const lanternGlow = new THREE.MeshStandardMaterial({
    color: '#fde047',
    emissive: '#f59e0b',
    emissiveIntensity: 0.85,
    roughness: 0.2,
  });

  // 1. Stepped stone foundation plinth
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.42, 3.8), stoneMat);
  plinth.position.y = 0.21;
  plinth.receiveShadow = true;
  plinth.castShadow = castShadows;
  group.add(plinth);

  // 2. Main plaster hall body
  const body = new THREE.Mesh(new THREE.BoxGeometry(4.0, 2.3, 3.1), wallMat);
  body.position.y = 1.57;
  body.castShadow = castShadows;
  body.receiveShadow = true;
  group.add(body);

  // 3. Timber corner beams (4)
  const beamGeo = new THREE.BoxGeometry(0.26, 2.35, 0.26);
  const corners = [
    [-1.95, 1.58, -1.48],
    [1.95, 1.58, -1.48],
    [-1.95, 1.58, 1.48],
    [1.95, 1.58, 1.48],
  ];
  for (const [bx, by, bz] of corners) {
    const beam = new THREE.Mesh(beamGeo, timberMat);
    beam.position.set(bx, by, bz);
    beam.castShadow = castShadows;
    group.add(beam);
  }

  // 4. Stepped Voxel Pitched Roof (3 stepped tiers for authentic voxel silhouette)
  const roof1 = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.45, 3.7), roofMat);
  roof1.position.y = 2.94;
  roof1.castShadow = castShadows;
  const roof2 = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.45, 2.9), roofMat);
  roof2.position.y = 3.38;
  roof2.castShadow = castShadows;
  const roof3 = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.42, 2.0), roofMat);
  roof3.position.y = 3.8;
  roof3.castShadow = castShadows;
  group.add(roof1, roof2, roof3);

  // 5. Golden Coin Spire / Crest on Roof
  const spirePost = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.65, 0.22), timberMat);
  spirePost.position.y = 4.32;
  const coinDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.14, 12), goldMat);
  coinDisc.rotation.x = Math.PI / 2;
  coinDisc.position.y = 4.82;
  coinDisc.castShadow = castShadows;
  group.add(spirePost, coinDisc);

  // 6. Market Counter & Striped Awning on Front (+Z)
  const counter = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.72, 0.7), timberMat);
  counter.position.set(0, 0.78, 1.85);
  counter.castShadow = castShadows;
  const awning = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.22, 1.05), awningRed);
  awning.position.set(0, 2.1, 1.98);
  awning.rotation.x = 0.22;
  awning.castShadow = castShadows;
  group.add(counter, awning);

  // 7. Lantern + Supply Crates beside steps
  const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.34, 0.24), lanternGlow);
  lantern.position.set(1.75, 1.95, 1.72);
  const crate = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.62), timberMat);
  crate.position.set(-1.85, 0.73, 1.95);
  crate.castShadow = castShadows;
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.34, 0.68, 8), timberMat);
  barrel.position.set(1.85, 0.76, 1.98);
  barrel.castShadow = castShadows;
  group.add(lantern, crate, barrel);

  return group;
}

const cropMatCache = new Map<string, THREE.MeshStandardMaterial>();
function getCropMat(color: string, roughness = 0.75): THREE.MeshStandardMaterial {
  const key = `${color}_${roughness}`;
  if (!cropMatCache.has(key)) {
    cropMatCache.set(key, new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.04 }));
  }
  return cropMatCache.get(key)!;
}

export function buildVoxelCropMesh(cropId: CropId, stage: 0 | 1 | 2 | 3, castShadows: boolean): THREE.Group {
  const g = new THREE.Group();
  const sproutGreen = getCropMat('#5cb85c', 0.78);
  const darkLeaf = getCropMat('#2f855a', 0.8);

  if (stage === 0) {
    // Seed mounds
    for (const [ox, oz] of [[-0.38, -0.32], [0.35, -0.28], [-0.3, 0.35], [0.36, 0.32]]) {
      const m = new THREE.Mesh(sharedGeo.box1, getCropMat('#7c5836', 0.9));
      m.scale.set(0.22, 0.14, 0.22);
      m.position.set(ox, 0.07, oz);
      g.add(m);
    }
    return g;
  }

  if (stage === 1) {
    // Small green sprouts
    for (const [ox, oz] of [[-0.4, -0.35], [0.38, -0.32], [-0.34, 0.35], [0.38, 0.34]]) {
      const stem = new THREE.Mesh(sharedGeo.box1, sproutGreen);
      stem.scale.set(0.14, 0.32, 0.14);
      stem.position.set(ox, 0.16, oz);
      g.add(stem);
    }
    return g;
  }

  if (stage === 2) {
    // Medium leafy tufts
    for (const [ox, oz] of [[-0.42, -0.38], [0.42, -0.36], [-0.38, 0.38], [0.4, 0.38]]) {
      const tuft = new THREE.Mesh(sharedGeo.box1, sproutGreen);
      tuft.scale.set(0.3, 0.48, 0.3);
      tuft.position.set(ox, 0.24, oz);
      tuft.castShadow = castShadows;
      g.add(tuft);
    }
    return g;
  }

  // Stage 3: Ready to harvest voxel crops!
  const spots: Array<[number, number]> = [
    [-0.44, -0.4],
    [0.44, -0.38],
    [-0.4, 0.42],
    [0.42, 0.4],
  ];

  if (cropId === 'radish') {
    const bulbMat = getCropMat('#e11d48', 0.55);
    for (const [ox, oz] of spots) {
      const bulb = new THREE.Mesh(sharedGeo.box1, bulbMat);
      bulb.scale.set(0.3, 0.26, 0.3);
      bulb.position.set(ox, 0.13, oz);
      bulb.castShadow = castShadows;
      const leaf = new THREE.Mesh(sharedGeo.box1, darkLeaf);
      leaf.scale.set(0.22, 0.26, 0.22);
      leaf.position.set(ox, 0.36, oz);
      g.add(bulb, leaf);
    }
  } else if (cropId === 'wheat') {
    const goldWheat = getCropMat('#eab308', 0.72);
    const stalkMat = getCropMat('#ca8a04', 0.8);
    for (const [ox, oz] of spots) {
      const stalk = new THREE.Mesh(sharedGeo.box1, stalkMat);
      stalk.scale.set(0.14, 0.56, 0.14);
      stalk.position.set(ox, 0.28, oz);
      const ear = new THREE.Mesh(sharedGeo.box1, goldWheat);
      ear.scale.set(0.24, 0.42, 0.24);
      ear.position.set(ox, 0.65, oz);
      ear.castShadow = castShadows;
      g.add(stalk, ear);
    }
  } else if (cropId === 'carrot') {
    const orange = getCropMat('#f97316', 0.62);
    for (const [ox, oz] of spots) {
      const root = new THREE.Mesh(sharedGeo.box1, orange);
      root.scale.set(0.26, 0.24, 0.26);
      root.position.set(ox, 0.12, oz);
      const tops = new THREE.Mesh(sharedGeo.box1, darkLeaf);
      tops.scale.set(0.32, 0.34, 0.32);
      tops.position.set(ox, 0.36, oz);
      tops.castShadow = castShadows;
      g.add(root, tops);
    }
  } else if (cropId === 'sunflower') {
    const petal = getCropMat('#facc15', 0.55);
    const center = getCropMat('#5c3317', 0.85);
    for (const [ox, oz] of spots) {
      const stem = new THREE.Mesh(sharedGeo.box1, darkLeaf);
      stem.scale.set(0.14, 0.82, 0.14);
      stem.position.set(ox, 0.41, oz);
      const head = new THREE.Mesh(sharedGeo.box1, petal);
      head.scale.set(0.42, 0.42, 0.14);
      head.position.set(ox, 0.92, oz);
      head.castShadow = castShadows;
      const core = new THREE.Mesh(sharedGeo.box1, center);
      core.scale.set(0.22, 0.22, 0.18);
      core.position.set(ox, 0.92, oz);
      g.add(stem, head, core);
    }
  } else {
    // Pumpkin (two large rich voxel pumpkins)
    const pumpMat = getCropMat('#ea580c', 0.62);
    const stemMat = getCropMat('#15803d', 0.82);
    for (const [ox, oz] of [[-0.4, -0.32], [0.38, 0.34]]) {
      const body = new THREE.Mesh(sharedGeo.box1, pumpMat);
      body.scale.set(0.62, 0.52, 0.62);
      body.position.set(ox, 0.26, oz);
      body.castShadow = castShadows;
      const stem = new THREE.Mesh(sharedGeo.box1, stemMat);
      stem.scale.set(0.16, 0.18, 0.16);
      stem.position.set(ox, 0.58, oz);
      g.add(body, stem);
    }
  }
  return g;
}
