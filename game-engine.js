// game-engine.js - Full 3D game engine with Three.js + Firebase RTDB multiplayer
import { rtdb, db } from './firebase-config.js';
import { currentUser, userProfile, isGuest, saveUserProfile } from './auth.js';
import { GAMES } from './home.js';
import { buildGameAvatar } from './avatar-editor.js';
import { ref, set, onValue, off, onDisconnect, remove, push, serverTimestamp as rtServerTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const THREE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';

let THREE;
let scene, camera, renderer, animId;
let player = { x: 0, y: 1, z: 0, rotY: 0, vel: {x:0, y:0, z:0} };
let playerMesh, playerGroup;
let otherPlayers = {};
let gameId, sessionId;
let playerDbRef, chatDbRef, playersDbRef;
let keys = {};
let isPointerLocked = false;
let gameType = 'obby';
let worldChunks = [];
let speechBubbles = {};
const GRAVITY = -20;
const JUMP_FORCE = 8;
const MOVE_SPEED = 6;
let onGround = false;
let lastTime = 0;

export async function loadGame(id) {
  const game = GAMES.find(g => g.id === id);
  if (!game) return;
  gameId = id;
  gameType = game.genre.toLowerCase();

  document.getElementById('hub-screen').style.display = 'none';
  document.getElementById('game-screen').style.display = 'flex';
  document.getElementById('game-title-display').textContent = game.title;

  if (!window.THREE) {
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = THREE_CDN;
      s.onload = () => res(); s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  THREE = window.THREE;

  await saveUserProfile({ currentGame: id, online: true });
  initGameScene();
  initMultiplayer(id);
  initChatSystem(id);
  initControls();

  document.getElementById('leave-game-btn').addEventListener('click', leaveGame, { once: true });

  // Detect tab close
  window.addEventListener('beforeunload', handleUnload);
  document.addEventListener('visibilitychange', handleVisibility);
}

function initGameScene() {
  const canvas = document.getElementById('game-canvas');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  scene = new THREE.Scene();

  // Fog based on game type
  const fogColors = { horror: 0x050510, shooter: 0x101020, tycoon: 0x87ceeb, obby: 0xafd5ff, rpg: 0x0a0a20, racing: 0x87ceeb, survival: 0x87ceeb, minigames: 0xafd5ff };
  const fogColor = fogColors[gameType] || 0x87ceeb;
  scene.fog = new THREE.Fog(fogColor, 20, 80);
  scene.background = new THREE.Color(fogColor);

  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 2, 0);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // Lighting
  const ambient = new THREE.AmbientLight(0xffffff, gameType === 'horror' ? 0.1 : 0.5);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(gameType === 'horror' ? 0x200030 : 0xffffff, gameType === 'horror' ? 0.3 : 0.8);
  sun.position.set(50, 80, 30);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 2048;
  sun.shadow.mapSize.height = 2048;
  sun.shadow.camera.far = 200;
  scene.add(sun);

  if (gameType === 'horror') {
    const pointLight = new THREE.PointLight(0xff2200, 1, 10);
    pointLight.position.set(5, 3, 5);
    scene.add(pointLight);
  }

  buildWorld();
  buildPlayerMesh();

  // Camera pitch
  camera.userData.pitch = 0;

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  cancelAnimationFrame(animId);
  gameLoop(performance.now());
}

function buildWorld() {
  const palette = getWorldPalette();

  // Ground
  const groundGeo = new THREE.PlaneGeometry(200, 200, 40, 40);
  const groundMat = new THREE.MeshStandardMaterial({ color: palette.ground });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.userData.isGround = true;
  scene.add(ground);
  worldChunks.push({ y: 0, minX: -100, maxX: 100, minZ: -100, maxZ: 100, height: 0, isFloor: true });

  buildGameSpecificWorld(palette);
}

function getWorldPalette() {
  const palettes = {
    horror: { ground: 0x111111, wall: 0x1a1a2e, accent: 0x440000, platform: 0x222222 },
    shooter: { ground: 0x334422, wall: 0x445533, accent: 0xff4400, platform: 0x556644 },
    tycoon: { ground: 0x55aa55, wall: 0x886644, accent: 0xffdd00, platform: 0x66bb66 },
    obby: { ground: 0x44aaff, wall: 0xff88ff, accent: 0xffaa00, platform: 0xff6688 },
    rpg: { ground: 0x335522, wall: 0x554433, accent: 0xffdd00, platform: 0x446633 },
    racing: { ground: 0x333333, wall: 0x555555, accent: 0xffaa00, platform: 0x444444 },
    survival: { ground: 0x559944, wall: 0x886633, accent: 0xffaa55, platform: 0x447733 },
    minigames: { ground: 0xaaddff, wall: 0xff88aa, accent: 0xffee00, platform: 0x88eebb }
  };
  return palettes[gameType] || palettes.obby;
}

function buildGameSpecificWorld(p) {
  const addBox = (x, y, z, w, h, d, color) => {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.MeshStandardMaterial({ color });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y + h/2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.solid = true;
    scene.add(mesh);
    worldChunks.push({ x, y: y + h, minX: x - w/2, maxX: x + w/2, minZ: z - d/2, maxZ: z + d/2, height: y + h });
    return mesh;
  };

  if (gameType === 'obby') {
    // Rainbow obstacle course
    const colors = [0xff6688, 0xffaa00, 0xaaff44, 0x44aaff, 0xaa44ff];
    for (let i = 0; i < 20; i++) {
      addBox(i * 4, i * 0.5, 0, 2, 0.4, 2, colors[i % colors.length]);
    }
    // Spinning walls (decorative)
    for (let i = 0; i < 5; i++) {
      addBox(i * 16, i * 2.5 + 3, 0, 0.3, 3, 4, 0xff4444);
    }
    player.x = 0; player.y = 2; player.z = 0;

  } else if (gameType === 'tycoon') {
    // Business district
    for (let i = 0; i < 8; i++) {
      const h = Math.random() * 8 + 4;
      addBox((i - 4) * 10, 0, -20, 6, h, 6, p.wall);
    }
    addBox(0, 0, 10, 20, 0.5, 10, 0xffdd00); // Gold platform - store
    addBox(-15, 0, 0, 8, 3, 12, 0x885522); // Building
    addBox(15, 0, 0, 8, 5, 12, 0x334499); // Building 2
    player.x = 0; player.y = 2; player.z = 5;

  } else if (gameType === 'shooter') {
    // Arena with cover
    for (let i = 0; i < 12; i++) {
      const x = (Math.random() - 0.5) * 40;
      const z = (Math.random() - 0.5) * 40;
      addBox(x, 0, z, 3, 2, 1, p.wall);
    }
    // Center tower
    addBox(0, 0, 0, 2, 6, 2, p.accent);
    // Boundary walls
    addBox(0, 0, -25, 50, 4, 1, p.wall);
    addBox(0, 0, 25, 50, 4, 1, p.wall);
    addBox(-25, 0, 0, 1, 4, 50, p.wall);
    addBox(25, 0, 0, 1, 4, 50, p.wall);
    player.x = 0; player.y = 2; player.z = 10;

  } else if (gameType === 'horror') {
    // Asylum corridors
    addBox(0, 0, -10, 8, 4, 20, p.wall); // main hall
    addBox(15, 0, -5, 20, 4, 1, p.wall); // side corridor
    addBox(-15, 0, -5, 20, 4, 1, p.wall);
    addBox(0, 0, -25, 1, 4, 10, p.wall);
    // Creepy objects
    addBox(5, 0, -8, 0.5, 1.5, 0.5, 0x442200);
    addBox(-5, 0, -15, 2, 0.5, 0.5, 0x220000);
    player.x = 0; player.y = 2; player.z = 2;

  } else if (gameType === 'survival') {
    // Trees
    for (let i = 0; i < 15; i++) {
      const tx = (Math.random() - 0.5) * 60;
      const tz = (Math.random() - 0.5) * 60;
      addBox(tx, 0, tz, 0.8, 4, 0.8, 0x4a2c0a); // trunk
      addBox(tx, 4, tz, 3, 2, 3, 0x1a5c1a); // leaves
    }
    // Huts
    addBox(-10, 0, -10, 5, 3, 5, 0x8B6914);
    player.x = 0; player.y = 2; player.z = 0;

  } else {
    // Default fun world
    for (let i = 0; i < 10; i++) {
      addBox((i - 5) * 6, 0, -10, 4, 2, 4, p.platform);
    }
    addBox(0, 2, -10, 20, 0.5, 20, p.accent);
    player.x = 0; player.y = 2; player.z = 5;
  }
}

function buildPlayerMesh() {
  const skin = userProfile?.skinColor || '#c68642';
  const body = userProfile?.bodyType || 'normal';
  const equipped = userProfile?.equippedItems || [];
  playerGroup = buildGameAvatar(THREE, skin, body, equipped);
  playerGroup.position.set(player.x, player.y - 1.1, player.z);
  playerGroup.visible = false; // Don't show our own body (first person)
  scene.add(playerGroup);
}

function initControls() {
  keys = {};
  document.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.code === 'Space') e.preventDefault();
  });
  document.addEventListener('keyup', e => { keys[e.code] = false; });

  const canvas = document.getElementById('game-canvas');
  canvas.addEventListener('click', () => {
    if (!isPointerLocked) canvas.requestPointerLock();
  });

  document.addEventListener('pointerlockchange', () => {
    isPointerLocked = document.pointerLockElement === canvas;
  });

  document.addEventListener('mousemove', e => {
    if (!isPointerLocked) return;
    player.rotY -= e.movementX * 0.002;
    camera.userData.pitch = Math.max(-Math.PI/3, Math.min(Math.PI/3, (camera.userData.pitch || 0) - e.movementY * 0.002));
  });
}

function gameLoop(time) {
  animId = requestAnimationFrame(gameLoop);
  const dt = Math.min((time - lastTime) / 1000, 0.05);
  lastTime = time;

  updatePlayer(dt);
  updateCamera();
  updateOtherPlayers(dt);
  updateSpeechBubbles();
  broadcastPosition();

  renderer.render(scene, camera);
}

function updatePlayer(dt) {
  const speed = MOVE_SPEED;
  const cos = Math.cos(player.rotY);
  const sin = Math.sin(player.rotY);

  let moveX = 0, moveZ = 0;
  if (keys['KeyW'] || keys['ArrowUp']) { moveX -= sin; moveZ -= cos; }
  if (keys['KeyS'] || keys['ArrowDown']) { moveX += sin; moveZ += cos; }
  if (keys['KeyA'] || keys['ArrowLeft']) { moveX -= cos; moveZ += sin; }
  if (keys['KeyD'] || keys['ArrowRight']) { moveX += cos; moveZ -= sin; }

  const len = Math.sqrt(moveX*moveX + moveZ*moveZ);
  if (len > 0) { moveX = (moveX/len) * speed; moveZ = (moveZ/len) * speed; }

  player.vel.x = moveX;
  player.vel.z = moveZ;

  if ((keys['Space'] || keys['KeyQ']) && onGround) {
    player.vel.y = JUMP_FORCE;
    onGround = false;
  }

  player.vel.y += GRAVITY * dt;
  player.x += player.vel.x * dt;
  player.y += player.vel.y * dt;
  player.z += player.vel.z * dt;

  // Ground collision
  if (player.y <= 1) {
    player.y = 1;
    player.vel.y = 0;
    onGround = true;
  }

  // Platform collisions
  for (const chunk of worldChunks) {
    if (chunk.isFloor) continue;
    if (player.x > chunk.minX - 0.4 && player.x < chunk.maxX + 0.4 &&
        player.z > chunk.minZ - 0.4 && player.z < chunk.maxZ + 0.4) {
      if (player.y - 0.1 <= chunk.height && player.y > chunk.height - 0.5 && player.vel.y <= 0) {
        player.y = chunk.height + 1;
        player.vel.y = 0;
        onGround = true;
      }
    }
  }

  // Respawn if fallen
  if (player.y < -20) {
    player.x = 0; player.y = 3; player.z = 0;
    player.vel = {x:0, y:0, z:0};
  }
}

function updateCamera() {
  camera.position.set(player.x, player.y + 0.5, player.z);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = player.rotY;
  camera.rotation.x = camera.userData.pitch || 0;
}

function broadcastPosition() {
  if (!playerDbRef) return;
  const username = userProfile?.username || 'Guest';
  const now = Date.now();
  // Throttle to 20fps
  if (now - (broadcastPosition.last || 0) < 50) return;
  broadcastPosition.last = now;

  set(playerDbRef, {
    x: Math.round(player.x * 100) / 100,
    y: Math.round(player.y * 100) / 100,
    z: Math.round(player.z * 100) / 100,
    rotY: Math.round(player.rotY * 100) / 100,
    username,
    skinColor: userProfile?.skinColor || '#c68642',
    bodyType: userProfile?.bodyType || 'normal',
    ts: Date.now()
  });
}

function initMultiplayer(gid) {
  sessionId = currentUser?.uid || ('guest_' + Math.random().toString(36).substr(2, 8));
  playersDbRef = ref(rtdb, `games/${gid}/players`);
  playerDbRef = ref(rtdb, `games/${gid}/players/${sessionId}`);

  onDisconnect(playerDbRef).remove();

  onValue(playersDbRef, (snap) => {
    const all = snap.val() || {};
    const count = Object.keys(all).length;
    document.getElementById('player-count-num').textContent = count;

    // Remove old players
    for (const id of Object.keys(otherPlayers)) {
      if (!all[id]) {
        scene.remove(otherPlayers[id].group);
        delete otherPlayers[id];
      }
    }

    // Add/update other players
    for (const [id, data] of Object.entries(all)) {
      if (id === sessionId) continue;
      if (!otherPlayers[id]) {
        const group = buildGameAvatar(THREE, data.skinColor || '#c68642', data.bodyType || 'normal', []);
        group.visible = true;
        scene.add(group);

        // Name tag (floating text via canvas texture)
        const tag = createNameTag(data.username || 'Player');
        tag.position.y = 1.5;
        group.add(tag);
        group.userData.head = group.children[0];
        
        otherPlayers[id] = { group, data: {...data}, tag };
      } else {
        // Smooth interpolation
        const op = otherPlayers[id];
        op.targetX = data.x; op.targetY = data.y - 1.1; op.targetZ = data.z;
        op.data = data;
      }
    }
  });
}

function updateOtherPlayers(dt) {
  const walkT = performance.now() / 1000;
  for (const [id, op] of Object.entries(otherPlayers)) {
    const g = op.group;
    if (op.targetX !== undefined) {
      g.position.x += (op.targetX - g.position.x) * 0.2;
      g.position.y += ((op.targetY || 0) - g.position.y) * 0.2;
      g.position.z += (op.targetZ - g.position.z) * 0.2;
      g.rotation.y = op.data.rotY || 0;

      // Leg animation
      const moving = Math.abs(op.targetX - g.position.x) > 0.01 || Math.abs(op.targetZ - g.position.z) > 0.01;
      if (moving && g.userData.lLeg) {
        g.userData.lLeg.rotation.x = Math.sin(walkT * 6) * 0.5;
        g.userData.rLeg.rotation.x = -Math.sin(walkT * 6) * 0.5;
        g.userData.lArm.rotation.x = -Math.sin(walkT * 6) * 0.4;
        g.userData.rArm.rotation.x = Math.sin(walkT * 6) * 0.4;
      }
    }
  }
}

function createNameTag(name) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(13,15,26,0.85)';
  ctx.roundRect(4, 4, 248, 56, 12);
  ctx.fill();
  ctx.fillStyle = '#e8eaf6';
  ctx.font = 'bold 28px Nunito, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(name.slice(0, 16), 128, 36);

  const texture = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2.5, 0.6, 1);
  return sprite;
}

let chatDbRef2;
export function initChatSystem(gid) {
  chatDbRef2 = ref(rtdb, `games/${gid}/chat`);
  const chatMessages = document.getElementById('chat-messages');
  const chatInput = document.getElementById('chat-input');
  const chatSend = document.getElementById('chat-send');

  // Add system message
  addChatMessage('System', 'Welcome to the game! Press Enter to chat.', 'system');

  onValue(chatDbRef2, (snap) => {
    const msgs = snap.val() || {};
    const sorted = Object.values(msgs).sort((a, b) => a.ts - b.ts).slice(-50);
    
    // Only add new messages
    sorted.forEach(msg => {
      if (!msg._seen) {
        msg._seen = true;
        const isSelf = msg.uid === sessionId;
        if (!isSelf) {
          addChatMessage(msg.username, msg.text, isSelf ? 'self' : '');
          showSpeechBubble(msg.uid, msg.username, msg.text);
        }
      }
    });
  });

  const sendMsg = () => {
    const text = chatInput.value.trim();
    if (!text) return;
    chatInput.value = '';

    const username = userProfile?.username || 'Guest';
    addChatMessage(username, text, 'self');
    showSpeechBubble(sessionId, username, text, true);

    push(chatDbRef2, {
      uid: sessionId,
      username,
      text,
      ts: Date.now()
    });
  };

  chatSend.addEventListener('click', sendMsg);
  chatInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') sendMsg();
    e.stopPropagation(); // Don't pass to movement keys
  });
  chatInput.addEventListener('focus', () => { keys = {}; }); // Clear keys when typing
}

function addChatMessage(sender, text, cls = '') {
  const chatMessages = document.getElementById('chat-messages');
  if (!chatMessages) return;
  const div = document.createElement('div');
  div.className = `chat-msg ${cls}`;
  div.innerHTML = `<span class="chat-sender">${sender}:</span>${text}`;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  // Limit to 100 messages
  while (chatMessages.children.length > 100) {
    chatMessages.removeChild(chatMessages.firstChild);
  }
}

function showSpeechBubble(uid, username, text, isSelf = false) {
  // Remove old bubble for this player
  const existing = document.getElementById(`bubble-${uid}`);
  if (existing) existing.remove();

  const overlay = document.querySelector('.speech-bubble-overlay') || (() => {
    const el = document.createElement('div');
    el.className = 'speech-bubble-overlay';
    document.getElementById('game-screen').appendChild(el);
    return el;
  })();

  const bubble = document.createElement('div');
  bubble.className = 'speech-bubble';
  bubble.id = `bubble-${uid}`;
  bubble.textContent = text;
  bubble.dataset.uid = uid;
  bubble.dataset.isSelf = isSelf;
  bubble.dataset.expires = Date.now() + 5000;
  overlay.appendChild(bubble);
}

function updateSpeechBubbles() {
  const bubbles = document.querySelectorAll('.speech-bubble');
  const now = Date.now();

  bubbles.forEach(bubble => {
    if (now > parseInt(bubble.dataset.expires)) {
      bubble.remove();
      return;
    }

    const uid = bubble.dataset.uid;
    const isSelf = bubble.dataset.isSelf === 'true';

    let worldPos;
    if (isSelf) {
      worldPos = new THREE.Vector3(player.x, player.y + 1, player.z);
    } else if (otherPlayers[uid]) {
      const g = otherPlayers[uid].group;
      worldPos = new THREE.Vector3(g.position.x, g.position.y + 2.5, g.position.z);
    } else {
      bubble.remove();
      return;
    }

    // Project to screen
    const proj = worldPos.project(camera);
    const x = (proj.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-proj.y * 0.5 + 0.5) * window.innerHeight;

    if (proj.z > 1) { bubble.style.display = 'none'; return; }
    bubble.style.display = '';
    bubble.style.left = x + 'px';
    bubble.style.top = (y - 30) + 'px';
  });
}

async function leaveGame() {
  cancelAnimationFrame(animId);
  if (renderer) { renderer.dispose(); renderer = null; }

  if (playerDbRef) remove(playerDbRef);
  if (playersDbRef) off(playersDbRef);
  if (chatDbRef2) off(chatDbRef2);

  // Clear speech bubbles
  document.querySelectorAll('.speech-bubble').forEach(b => b.remove());
  document.querySelector('.speech-bubble-overlay')?.remove();

  scene = null; camera = null;
  otherPlayers = {};

  await saveUserProfile({ currentGame: null });

  window.removeEventListener('beforeunload', handleUnload);
  document.removeEventListener('visibilitychange', handleVisibility);

  if (document.exitPointerLock) document.exitPointerLock();

  document.getElementById('game-screen').style.display = 'none';
  document.getElementById('hub-screen').style.display = 'flex';

  document.getElementById('chat-messages').innerHTML = '';
}

function handleUnload() {
  if (playerDbRef) remove(playerDbRef);
  if (currentUser && !isGuest) {
    // Best effort
    const { doc, setDoc } = window;
    saveUserProfile({ currentGame: null });
  }
}

function handleVisibility() {
  if (document.visibilityState === 'hidden') {
    if (playerDbRef) remove(playerDbRef);
  } else if (document.visibilityState === 'visible' && playerDbRef) {
    onDisconnect(playerDbRef).remove();
  }
}
