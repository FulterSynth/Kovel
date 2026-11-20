import * as THREE from 'three';

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

function finalizeVoxelTexture(
  canvas: HTMLCanvasElement,
  maxAniso: number,
  repeatX = 1,
  repeatY = 1,
  isColor = true,
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = maxAniso;
  tex.needsUpdate = true;
  return tex;
}

export interface VoxelTextureSet {
  grassTile: THREE.CanvasTexture;
  cobbleTile: THREE.CanvasTexture;
  tilledSoil: THREE.CanvasTexture;
  wateredSoil: THREE.CanvasTexture;
  woodPlank: THREE.CanvasTexture;
  terracotta: THREE.CanvasTexture;
  contactShadow: THREE.CanvasTexture;
  dispose: () => void;
}

export function createVoxelTextureSet(maxAniso: number): VoxelTextureSet {
  // 1. Grass voxel pixel grain (16x16 crisp pixels)
  const [gCan, gCtx] = makeCanvas(16);
  const grassShades = ['#6ab04c', '#74ba54', '#5fa342', '#7ec45d'];
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const idx = ((x * 7 + y * 13 + (x ^ y)) & 3);
      gCtx.fillStyle = grassShades[idx];
      gCtx.fillRect(x, y, 1, 1);
    }
  }
  // Subtle border frame so grid squares read clearly
  gCtx.fillStyle = 'rgba(42, 82, 32, 0.16)';
  gCtx.fillRect(0, 0, 16, 1);
  gCtx.fillRect(0, 0, 1, 16);
  const grassTile = finalizeVoxelTexture(gCan, maxAniso);

  // 2. Town Cobblestone
  const [cCan, cCtx] = makeCanvas(16);
  cCtx.fillStyle = '#9ca3af';
  cCtx.fillRect(0, 0, 16, 16);
  const stones = [
    [1, 1, 6, 6, '#b8bec8'],
    [8, 1, 7, 5, '#cbd1da'],
    [1, 8, 7, 7, '#adb4bf'],
    [9, 7, 6, 8, '#c2c8d2'],
  ] as const;
  for (const [sx, sy, sw, sh, col] of stones) {
    cCtx.fillStyle = col;
    cCtx.fillRect(sx, sy, sw, sh);
    cCtx.fillStyle = 'rgba(255,255,255,0.22)';
    cCtx.fillRect(sx, sy, sw, 1);
  }
  const cobbleTile = finalizeVoxelTexture(cCan, maxAniso);

  // 3. Tilled Soil (furrowed rows)
  const [tCan, tCtx] = makeCanvas(16);
  tCtx.fillStyle = '#7c5333';
  tCtx.fillRect(0, 0, 16, 16);
  for (let y = 0; y < 16; y += 4) {
    tCtx.fillStyle = '#5c3b22';
    tCtx.fillRect(0, y, 16, 1);
    tCtx.fillStyle = '#946540';
    tCtx.fillRect(0, y + 1, 16, 2);
  }
  const tilledSoil = finalizeVoxelTexture(tCan, maxAniso);

  // 4. Watered Soil (rich dark moist earth)
  const [wCan, wCtx] = makeCanvas(16);
  wCtx.fillStyle = '#472d1b';
  wCtx.fillRect(0, 0, 16, 16);
  for (let y = 0; y < 16; y += 4) {
    wCtx.fillStyle = '#2d1b0f';
    wCtx.fillRect(0, y, 16, 1);
    wCtx.fillStyle = '#583823';
    wCtx.fillRect(0, y + 1, 16, 2);
  }
  const wateredSoil = finalizeVoxelTexture(wCan, maxAniso);

  // 5. Wood plank
  const [pCan, pCtx] = makeCanvas(16);
  pCtx.fillStyle = '#8b5a2b';
  pCtx.fillRect(0, 0, 16, 16);
  for (let y = 0; y < 16; y += 4) {
    pCtx.fillStyle = '#6f451f';
    pCtx.fillRect(0, y, 16, 1);
    pCtx.fillStyle = '#a06a38';
    pCtx.fillRect(0, y + 1, 16, 1);
  }
  const woodPlank = finalizeVoxelTexture(pCan, maxAniso);

  // 6. Terracotta roof tile
  const [rCan, rCtx] = makeCanvas(16);
  rCtx.fillStyle = '#c8553d';
  rCtx.fillRect(0, 0, 16, 16);
  for (let y = 0; y < 16; y += 4) {
    rCtx.fillStyle = '#a6412c';
    rCtx.fillRect(0, y, 16, 1);
    rCtx.fillStyle = '#dc6b52';
    rCtx.fillRect(0, y + 2, 16, 1);
  }
  const terracotta = finalizeVoxelTexture(rCan, maxAniso);

  // 7. Radial Contact Shadow
  const [sCan, sCtx] = makeCanvas(64);
  const grad = sCtx.createRadialGradient(32, 32, 4, 32, 32, 30);
  grad.addColorStop(0, 'rgba(15, 23, 42, 0.55)');
  grad.addColorStop(0.55, 'rgba(15, 23, 42, 0.22)');
  grad.addColorStop(1, 'rgba(15, 23, 42, 0)');
  sCtx.fillStyle = grad;
  sCtx.fillRect(0, 0, 64, 64);
  const contactShadow = new THREE.CanvasTexture(sCan);
  contactShadow.colorSpace = THREE.SRGBColorSpace;
  contactShadow.needsUpdate = true;

  return {
    grassTile,
    cobbleTile,
    tilledSoil,
    wateredSoil,
    woodPlank,
    terracotta,
    contactShadow,
    dispose: () => {
      grassTile.dispose();
      cobbleTile.dispose();
      tilledSoil.dispose();
      wateredSoil.dispose();
      woodPlank.dispose();
      terracotta.dispose();
      contactShadow.dispose();
    },
  };
}
