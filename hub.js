// hub.js - Hub navigation and page management
import { currentUser, userProfile, isGuest } from './auth.js';
import { showToast } from './app.js';

export function initHub() {
  const navBtns = document.querySelectorAll('.nav-btn');
  
  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const page = btn.dataset.page;
      
      // Guest restrictions
      if (isGuest && (page === 'friends' || page === 'marketplace' || page === 'avatar')) {
        showToast('🔒 Create an account to access this feature!');
        return;
      }

      navBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      document.querySelectorAll('.hub-page').forEach(p => p.classList.remove('active'));
      document.getElementById(`page-${page}`).classList.add('active');
    });
  });

  // Dim restricted buttons for guests
  if (isGuest) {
    ['nav-marketplace', 'nav-friends', 'nav-avatar'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.add('disabled');
    });
    document.getElementById('nav-voxbux').style.display = 'none';
  } else {
    ['nav-marketplace', 'nav-friends', 'nav-avatar'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('disabled');
    });
    document.getElementById('nav-voxbux').style.display = '';
    updateVoxbuxDisplay();
  }

  // Set username
  const profile = userProfile;
  document.getElementById('nav-username').textContent = profile?.username || 'Player';
  
  // Set avatar mini
  const mini = document.getElementById('nav-avatar-mini');
  mini.textContent = profile?.username?.[0]?.toUpperCase() || '?';
}

export function updateVoxbuxDisplay() {
  if (!isGuest && userProfile) {
    document.getElementById('voxbux-display').textContent = (userProfile.voxbux || 0).toLocaleString();
  }
}
