// avatar-editor.js - 3D avatar editor using Three.js
import { userProfile, saveUserProfile } from './auth.js';
import { SHOP_ITEMS } from './marketplace.js';
import { showToast } from './app.js';

const SKIN_COLORS = [
  '#FDDBB4', '#F5CBA7', '#E8A87C', '#C68642',
  '#A0522D', '#8B4513', '#5C2D0A', '#3B1A0A',
  '#FFD9B3', '#F4C2A1', '#DDA982', '#C08050'
];

let scene, camera, renderer, animId;
let avatarGroup, headMesh, bodyMesh, leftArmMesh, rightArmMesh, leftLegMesh, rightLegMesh;
let isDragging = false, lastMouse = {x:0, y:0};
let rotY = 0;
let accessoryMeshes = {};
const THREE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';

async function loadThree() {
  if (window.THREE) return window.THREE;
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = THREE_CDN;
    s.onload = () => res(window.THREE);
    s.onerror = rej;
    document.head.appendChild(s);
  });
}

export async function initAvatarEditor() {
  const page = document.getElementById('page-avatar');
  const owned = userProfile?.ownedItems || [];
  const equipped = userProfile?.equippedItems || [];
  const skinColor = userProfile?.skinColor || '#c68642';
  const bodyType = userProfile?.bodyType || 'normal';

  page.innerHTML = `
    <div class="avatar-page">
      <div class="avatar-viewport">
        <canvas id="avatar-canvas"></canvas>
        <div class="avatar-controls">
          <button class="avatar-ctrl-btn" id="reset-rot-btn">⟳ Reset View</button>
        </div>
      </div>
      <div class="avatar-sidebar">
        <div class="avatar-section">
          <h3>🎨 Skin Color</h3>
          <div class="skin-colors">
            ${SKIN_COLORS.map(c => `
              <div class="skin-swatch ${c === skinColor ? 'active' : ''}" 
                   style="background:${c}" data-color="${c}"></div>
            `).join('')}
          </div>
        </div>

        <div class="avatar-section">
          <h3>🧍 Body Type</h3>
          <div class="body-types">
            <button class="body-type-btn ${bodyType === 'normal' ? 'active' : ''}" data-type="normal">Normal</button>
            <button class="body-type-btn ${bodyType === 'slim' ? 'active' : ''}" data-type="slim">Slim</button>
            <button class="body-type-btn ${bodyType === 'large' ? 'active' : ''}" data-type="large">Large</button>
          </div>
        </div>

        <div class="avatar-section">
          <h3>🎒 My Wardrobe</h3>
          <div class="wardrobe-grid" id="wardrobe-grid">
            ${owned.length === 0 ? '<p style="color:var(--text2);font-size:12px">No items yet. Visit the Marketplace!</p>' :
              SHOP_ITEMS.filter(i => owned.includes(i.id)).map(item => `
                <div class="wardrobe-item ${equipped.includes(item.id) ? 'equipped' : ''}" data-id="${item.id}">
                  <span class="item-icon">${item.emoji}</span>
                  <div class="item-name">${item.name}</div>
                  ${equipped.includes(item.id) ? '<div class="equipped-badge">ON</div>' : ''}
                </div>
              `).join('')
            }
          </div>
        </div>
      </div>
    </div>
  `;

  // Init Three.js
  const THREE = await loadThree();
  initThreeScene(THREE, skinColor, bodyType, equipped);

  // Skin color picker
  page.querySelectorAll('.skin-swatch').forEach(sw => {
    sw.addEventListener('click', async () => {
      page.querySelectorAll('.skin-swatch').forEach(s => s.classList.remove('active'));
      sw.classList.add('active');
      const color = sw.dataset.color;
      await saveUserProfile({ skinColor: color });
      updateSkinColor(THREE, color);
    });
  });

  // Body type
  page.querySelectorAll('.body-type-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      page.querySelectorAll('.body-type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const type = btn.dataset.type;
      await saveUserProfile({ bodyType: type });
      updateBodyType(THREE, type);
    });
  });

  // Wardrobe equip/unequip
  page.querySelectorAll('.wardrobe-item').forEach(item => {
    item.addEventListener('click', async () => {
      const id = item.dataset.id;
      const equipped = userProfile.equippedItems || [];
      let newEquipped;
      const shopItem = SHOP_ITEMS.find(i => i.id === id);

      if (equipped.includes(id)) {
        newEquipped = equipped.filter(e => e !== id);
        item.classList.remove('equipped');
        item.querySelector('.equipped-badge')?.remove();
        removeAccessory(THREE, shopItem);
        showToast(`Removed ${shopItem?.name}`);
      } else {
        // Unequip same type
        const sameType = SHOP_ITEMS.filter(i => i.type === shopItem?.type && equipped.includes(i.id));
        newEquipped = equipped.filter(e => !sameType.map(s => s.id).includes(e));
        sameType.forEach(s => {
          removeAccessory(THREE, s);
          page.querySelectorAll(`.wardrobe-item[data-id="${s.id}"]`).forEach(el => {
            el.classList.remove('equipped');
            el.querySelector('.equipped-badge')?.remove();
          });
        });
        newEquipped.push(id);
        item.classList.add('equipped');
        if (!item.querySelector('.equipped-badge')) {
          const badge = document.createElement('div');
          badge.className = 'equipped-badge';
          badge.textContent = 'ON';
          item.appendChild(badge);
        }
        addAccessory(THREE, shopItem);
        showToast(`Equipped ${shopItem?.name}!`);
      }
      await saveUserProfile({ equippedItems: newEquipped });
    });
  });

  // Reset rotation
  document.getElementById('reset-rot-btn').addEventListener('click', () => { rotY = 0; });

  // Drag to rotate
  const canvas = document.getElementById('avatar-canvas');
  canvas.addEventListener('mousedown', e => { isDragging = true; lastMouse = {x: e.clientX, y: e.clientY}; });
  window.addEventListener('mouseup', () => { isDragging = false; });
  window.addEventListener('mousemove', e => {
    if (!isDragging) return;
    const dx = e.clientX - lastMouse.x;
    rotY += dx * 0.01;
    lastMouse = {x: e.clientX, y: e.clientY};
  });
}

function initThreeScene(THREE, skinColor, bodyType, equipped) {
  const canvas = document.getElementById('avatar-canvas');
  if (!canvas) return;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x13162a);

  const w = canvas.parentElement.clientWidth;
  const h = canvas.parentElement.clientHeight;
  camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
  camera.position.set(0, 1.5, 5);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(w, h);
  renderer.shadowMap.enabled = true;

  // Lights
  const ambient = new THREE.AmbientLight(0x6c63ff, 0.4);
  scene.add(ambient);
  const dir = new THREE.DirectionalLight(0xffffff, 0.8);
  dir.position.set(3, 6, 4);
  dir.castShadow = true;
  scene.add(dir);
  const fill = new THREE.DirectionalLight(0xff6584, 0.2);
  fill.position.set(-3, 0, -2);
  scene.add(fill);

  // Floor
  const floorGeo = new THREE.PlaneGeometry(6, 6);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x1a1e35 });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.5;
  floor.receiveShadow = true;
  scene.add(floor);

  // Grid on floor
  const grid = new THREE.GridHelper(6, 12, 0x2d3461, 0x2d3461);
  grid.position.y = -1.49;
  scene.add(grid);

  buildAvatar(THREE, skinColor, bodyType);
  
  // Equip accessories
  equipped.forEach(id => {
    const item = SHOP_ITEMS.find(i => i.id === id);
    if (item) addAccessory(THREE, item);
  });

  cancelAnimationFrame(animId);
  animate(THREE);

  // Resize
  window.addEventListener('resize', () => {
    if (!renderer) return;
    const vp = document.querySelector('.avatar-viewport');
    if (!vp) return;
    const w2 = vp.clientWidth; const h2 = vp.clientHeight;
    camera.aspect = w2 / h2;
    camera.updateProjectionMatrix();
    renderer.setSize(w2, h2);
  });
}

function buildAvatar(THREE, skinColor, bodyType) {
  if (avatarGroup) scene.remove(avatarGroup);
  avatarGroup = new THREE.Group();
  accessoryMeshes = {};

  const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color(skinColor) });
  const shirt = new THREE.MeshStandardMaterial({ color: 0x4444cc });
  const pants = new THREE.MeshStandardMaterial({ color: 0x226622 });

  const scale = bodyType === 'large' ? 1.2 : bodyType === 'slim' ? 0.85 : 1.0;

  // Head
  const headGeo = new THREE.BoxGeometry(0.7 * scale, 0.7, 0.7 * scale);
  headMesh = new THREE.Mesh(headGeo, skin);
  headMesh.position.y = 0.95;
  headMesh.castShadow = true;
  avatarGroup.add(headMesh);

  // Body
  const bodyGeo = new THREE.BoxGeometry(0.7 * scale, 0.8, 0.4 * scale);
  bodyMesh = new THREE.Mesh(bodyGeo, shirt);
  bodyMesh.position.y = 0.2;
  bodyMesh.castShadow = true;
  avatarGroup.add(bodyMesh);

  // Arms
  const armGeo = new THREE.BoxGeometry(0.25 * scale, 0.65, 0.25 * scale);
  leftArmMesh = new THREE.Mesh(armGeo, skin);
  leftArmMesh.position.set(-0.5 * scale, 0.25, 0);
  leftArmMesh.castShadow = true;
  avatarGroup.add(leftArmMesh);

  rightArmMesh = new THREE.Mesh(armGeo, skin);
  rightArmMesh.position.set(0.5 * scale, 0.25, 0);
  rightArmMesh.castShadow = true;
  avatarGroup.add(rightArmMesh);

  // Legs
  const legGeo = new THREE.BoxGeometry(0.28 * scale, 0.7, 0.28 * scale);
  leftLegMesh = new THREE.Mesh(legGeo, pants);
  leftLegMesh.position.set(-0.2 * scale, -0.55, 0);
  leftLegMesh.castShadow = true;
  avatarGroup.add(leftLegMesh);

  rightLegMesh = new THREE.Mesh(legGeo, pants);
  rightLegMesh.position.set(0.2 * scale, -0.55, 0);
  rightLegMesh.castShadow = true;
  avatarGroup.add(rightLegMesh);

  // Eyes
  const eyeGeo = new THREE.BoxGeometry(0.12, 0.12, 0.05);
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
  const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
  leftEye.position.set(-0.17, 0.97, 0.35);
  avatarGroup.add(leftEye);
  const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
  rightEye.position.set(0.17, 0.97, 0.35);
  avatarGroup.add(rightEye);

  scene.add(avatarGroup);
}

function addAccessory(THREE, item) {
  if (!avatarGroup || !item) return;
  if (accessoryMeshes[item.id]) return;

  const geo = getAccessoryGeometry(THREE, item);
  if (!geo) return;
  const mat = getAccessoryMaterial(THREE, item);
  const mesh = new THREE.Mesh(geo, mat);
  positionAccessory(mesh, item);
  mesh.castShadow = true;
  avatarGroup.add(mesh);
  accessoryMeshes[item.id] = mesh;
}

function removeAccessory(THREE, item) {
  if (!item || !accessoryMeshes[item.id]) return;
  avatarGroup.remove(accessoryMeshes[item.id]);
  delete accessoryMeshes[item.id];
}

function getAccessoryGeometry(THREE, item) {
  if (!window.THREE) return null;
  switch(item.type) {
    case 'Hat':
      if (item.id === 'hat_crown') return new THREE.CylinderGeometry(0.2, 0.4, 0.3, 8);
      if (item.id === 'hat_wizard') return new THREE.ConeGeometry(0.3, 0.8, 8);
      if (item.id === 'hat_cowboy') return new THREE.CylinderGeometry(0.15, 0.15, 0.4, 8);
      return new THREE.BoxGeometry(0.72, 0.25, 0.72); // cap
    case 'Accessory':
      return new THREE.BoxGeometry(0.6, 0.15, 0.15); // glasses bar
    case 'Back':
      if (item.id.includes('wing')) {
        const geo = new THREE.BoxGeometry(0.15, 0.5, 0.05);
        return geo;
      }
      return new THREE.BoxGeometry(0.35, 0.45, 0.15);
    default: return null;
  }
}

function getAccessoryMaterial(THREE, item) {
  const colors = {
    hat_crown: 0xFFD700,
    hat_wizard: 0x6c63ff,
    hat_cowboy: 0x8B4513,
    hat_cap: 0xff4757,
    glasses_cool: 0x333333,
    glasses_nerd: 0x222222,
    bag_backpack: 0x8B4513,
    wings_angel: 0xffffff,
    wings_demon: 0x220000,
  };
  return new THREE.MeshStandardMaterial({ color: colors[item.id] || 0x888888, metalness: item.id === 'hat_crown' ? 0.8 : 0, roughness: 0.4 });
}

function positionAccessory(mesh, item) {
  if (item.type === 'Hat') {
    mesh.position.set(0, 1.38, 0);
  } else if (item.type === 'Accessory') {
    mesh.position.set(0, 0.93, 0.38);
  } else if (item.type === 'Back') {
    if (item.id.includes('wing')) {
      mesh.position.set(-0.5, 0.35, -0.25);
      mesh.rotation.z = 0.4;
      // Add second wing
      const THREE = window.THREE;
      const wing2 = mesh.clone();
      wing2.position.set(0.5, 0.35, -0.25);
      wing2.rotation.z = -0.4;
      avatarGroup.add(wing2);
    } else {
      mesh.position.set(0, 0.15, -0.3);
    }
  }
}

function updateSkinColor(THREE, color) {
  if (!headMesh) return;
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color) });
  headMesh.material = mat;
  leftArmMesh.material = mat;
  rightArmMesh.material = mat;
}

function updateBodyType(THREE, type) {
  const skinColor = userProfile?.skinColor || '#c68642';
  const equipped = userProfile?.equippedItems || [];
  buildAvatar(THREE, skinColor, type);
  equipped.forEach(id => {
    const item = SHOP_ITEMS.find(i => i.id === id);
    if (item) addAccessory(THREE, item);
  });
}

let breathT = 0;
function animate(THREE) {
  animId = requestAnimationFrame(() => animate(THREE));
  breathT += 0.02;
  if (avatarGroup) {
    avatarGroup.rotation.y = rotY;
    // Idle breathing
    avatarGroup.position.y = Math.sin(breathT) * 0.02;
  }
  renderer?.render(scene, camera);
}

export function cleanupAvatarEditor() {
  cancelAnimationFrame(animId);
  renderer?.dispose();
  renderer = null;
}

export function buildGameAvatar(THREE, skinColor, bodyType, equippedItems) {
  const group = new THREE.Group();
  const scale = bodyType === 'large' ? 1.2 : bodyType === 'slim' ? 0.85 : 1.0;
  const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color(skinColor || '#c68642') });
  const shirt = new THREE.MeshStandardMaterial({ color: 0x4444cc });
  const pants = new THREE.MeshStandardMaterial({ color: 0x226622 });

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.6 * scale, 0.6, 0.6 * scale), skin);
  head.position.y = 0.8;
  group.add(head);
  group.userData.head = head;

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6 * scale, 0.7, 0.35 * scale), shirt);
  body.position.y = 0.15;
  group.add(body);

  const armGeo = new THREE.BoxGeometry(0.22 * scale, 0.55, 0.22 * scale);
  const lArm = new THREE.Mesh(armGeo, skin); lArm.position.set(-0.45 * scale, 0.2, 0); group.add(lArm);
  const rArm = new THREE.Mesh(armGeo, skin); rArm.position.set(0.45 * scale, 0.2, 0); group.add(rArm);

  const legGeo = new THREE.BoxGeometry(0.24 * scale, 0.6, 0.24 * scale);
  const lLeg = new THREE.Mesh(legGeo, pants); lLeg.position.set(-0.18 * scale, -0.48, 0); group.add(lLeg);
  const rLeg = new THREE.Mesh(legGeo, pants); rLeg.position.set(0.18 * scale, -0.48, 0); group.add(rLeg);

  group.userData.lLeg = lLeg;
  group.userData.rLeg = rLeg;
  group.userData.lArm = lArm;
  group.userData.rArm = rArm;

  return group;
}
