// app.js - Main orchestrator
import { initAuth } from './auth.js';
import { initHub } from './hub.js';
import { initHome } from './home.js';
import { initMarketplace } from './marketplace.js';
import { initFriends } from './friends.js';
import { initAvatarEditor } from './avatar-editor.js';

export function showToast(msg) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2800);
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active');
    s.style.display = '';
  });
  const screen = document.getElementById(id);
  screen.classList.add('active');
}

function onLogin() {
  showScreen('hub-screen');
  initHub();
  initHome();
  
  // Lazy init other pages on first nav
  const navBtns = document.querySelectorAll('.nav-btn');
  let marketplaceInited = false;
  let friendsInited = false;
  let avatarInited = false;

  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const page = btn.dataset.page;
      if (page === 'marketplace' && !marketplaceInited) {
        initMarketplace();
        marketplaceInited = true;
      }
      if (page === 'friends' && !friendsInited) {
        initFriends();
        friendsInited = true;
      }
      if (page === 'avatar' && !avatarInited) {
        initAvatarEditor();
        avatarInited = true;
      }
    });
  });
}

function onLogout() {
  showScreen('auth-screen');
  // Reset nav
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.remove('active');
    if (b.dataset.page === 'home') b.classList.add('active');
  });
  document.querySelectorAll('.hub-page').forEach(p => {
    p.classList.remove('active');
    if (p.id === 'page-home') p.classList.add('active');
  });
}

// Boot
initAuth(onLogin, onLogout);

// Add grid pattern cubes to auth background
(function initAuthBg() {
  const container = document.querySelector('.floating-cubes');
  if (!container) return;
  for (let i = 0; i < 12; i++) {
    const cube = document.createElement('div');
    cube.style.cssText = `
      position: absolute;
      width: ${20 + Math.random() * 60}px;
      height: ${20 + Math.random() * 60}px;
      background: rgba(108,99,255,${0.03 + Math.random() * 0.07});
      border: 1px solid rgba(108,99,255,${0.1 + Math.random() * 0.15});
      border-radius: 6px;
      left: ${Math.random() * 100}%;
      top: ${Math.random() * 100}%;
      animation: floatCube ${6 + Math.random() * 6}s ease-in-out infinite;
      animation-delay: ${-Math.random() * 8}s;
      transform: rotate(${Math.random() * 45}deg);
    `;
    container.appendChild(cube);
  }
})();
