// home.js - Home page with game grid
import { currentUser, userProfile, isGuest } from './auth.js';
import { db } from './firebase-config.js';
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const GAMES = [
  { id: 'tycoon_pizza', title: 'Pizza Empire Tycoon', genre: 'Tycoon', desc: 'Build your pizza restaurant empire from scratch! Hire workers, upgrade ovens, and dominate the city with delicious pies.', emoji: '🍕', color: '#ff6b35', bg: 'linear-gradient(135deg, #ff6b35, #f7c59f)' },
  { id: 'tycoon_space', title: 'Space Station Tycoon', genre: 'Tycoon', desc: 'Manage an orbiting space station. Recruit astronauts, research new tech, and expand your station to the stars.', emoji: '🚀', color: '#4fc3f7', bg: 'linear-gradient(135deg, #0a1628, #4fc3f7)' },
  { id: 'shooter_arena', title: 'Voxel Arena', genre: 'Shooter', desc: 'Fast-paced 3D shooter! Eliminate enemies and dominate the arena. Collect power-ups and be the last voxel standing.', emoji: '🔫', color: '#ff4757', bg: 'linear-gradient(135deg, #1a0010, #ff4757)' },
  { id: 'shooter_capture', title: 'Block Warfare', genre: 'Shooter', desc: 'Team-based capture the flag in a massive voxel battlefield. Coordinate with teammates to claim victory.', emoji: '⚔️', color: '#ffa502', bg: 'linear-gradient(135deg, #1a0a00, #ffa502)' },
  { id: 'obby_rainbow', title: 'Rainbow Obby', genre: 'Obby', desc: 'A colorful obstacle course with 100 stages of increasingly difficult platforming challenges. Can you reach the end?', emoji: '🌈', color: '#a29bfe', bg: 'linear-gradient(135deg, #6c5ce7, #fd79a8)' },
  { id: 'obby_lava', title: 'Don\'t Touch the Lava', genre: 'Obby', desc: 'Classic lava obby with moving platforms, spinning obstacles, and treacherous jumps. One mistake and you fall!', emoji: '🌋', color: '#ff7675', bg: 'linear-gradient(135deg, #2d0005, #ff7675)' },
  { id: 'horror_asylum', title: 'Haunted Asylum', genre: 'Horror', desc: 'Explore a terrifying abandoned psychiatric hospital. Solve puzzles, avoid the monster, and escape before midnight.', emoji: '👻', color: '#6c63ff', bg: 'linear-gradient(135deg, #0a000f, #2d1f3d)' },
  { id: 'horror_forest', title: 'Dark Forest', genre: 'Horror', desc: 'Something lurks in these woods. Navigate through the darkness, find the ritual items, and survive until dawn.', emoji: '🌲', color: '#00b894', bg: 'linear-gradient(135deg, #001208, #003d1e)' },
  { id: 'rpg_dungeon', title: 'Voxel Dungeons', genre: 'RPG', desc: 'Dive into procedurally generated dungeons. Level up your hero, loot rare gear, and battle powerful bosses.', emoji: '⚔️', color: '#fdcb6e', bg: 'linear-gradient(135deg, #1a0f00, #fdcb6e)' },
  { id: 'racing_kart', title: 'Kart Chaos', genre: 'Racing', desc: 'Adrenaline-packed kart racing on wild voxel tracks. Grab power-ups, dodge obstacles, and race to first place!', emoji: '🏎️', color: '#00cec9', bg: 'linear-gradient(135deg, #001a1a, #00cec9)' },
  { id: 'survival_island', title: 'Island Survival', genre: 'Survival', desc: 'Stranded on a voxel island! Gather resources, build shelter, hunt for food, and survive against nature.', emoji: '🏝️', color: '#55efc4', bg: 'linear-gradient(135deg, #003d2e, #55efc4)' },
  { id: 'minigames_fun', title: 'Mega Minigames', genre: 'Minigames', desc: 'A collection of 20+ crazy minigames! Floor is lava, murder mystery, hide and seek, and many more surprises.', emoji: '🎮', color: '#fd79a8', bg: 'linear-gradient(135deg, #1a0010, #fd79a8)' }
];

let currentGameId = null;

export function initHome() {
  renderHomeContent();
  initGameModal();
}

function renderHomeContent() {
  const page = document.getElementById('page-home');
  const profile = userProfile;

  page.innerHTML = `
    <div class="home-hero">
      <div>
        <h2>Welcome back, ${profile?.username || 'Player'}! 👋</h2>
        <p>Ready to play? Explore thousands of community games.</p>
      </div>
    </div>

    <div id="friends-online-section" style="display:none">
      <div class="section-title">🟢 Friends Online</div>
      <div class="friends-strip" id="friends-strip"></div>
    </div>

    <div class="section-title">🔥 Featured Games</div>
    <div class="game-grid" id="featured-games"></div>

    <div class="section-title">🏭 Tycoon</div>
    <div class="game-grid" id="tycoon-games"></div>

    <div class="section-title">🔫 Shooters</div>
    <div class="game-grid" id="shooter-games"></div>

    <div class="section-title">🏃 Obbies</div>
    <div class="game-grid" id="obby-games"></div>

    <div class="section-title">👻 Horror</div>
    <div class="game-grid" id="horror-games"></div>

    <div class="section-title">🎮 More Games</div>
    <div class="game-grid" id="more-games"></div>
  `;

  // Featured = first 4
  renderGameCards('featured-games', GAMES.slice(0, 4));
  renderGameCards('tycoon-games', GAMES.filter(g => g.genre === 'Tycoon'));
  renderGameCards('shooter-games', GAMES.filter(g => g.genre === 'Shooter'));
  renderGameCards('obby-games', GAMES.filter(g => g.genre === 'Obby'));
  renderGameCards('horror-games', GAMES.filter(g => g.genre === 'Horror'));
  renderGameCards('more-games', GAMES.filter(g => !['Tycoon','Shooter','Obby','Horror'].includes(g.genre)));

  // Load online friends
  if (!isGuest && currentUser) {
    loadOnlineFriends();
  }
}

function renderGameCards(containerId, games) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = games.map(game => `
    <div class="game-card" data-game-id="${game.id}">
      <div class="game-card-thumb" style="background: ${game.bg}">
        ${game.emoji}
      </div>
      <div class="game-card-info">
        <h4>${game.title}</h4>
        <div class="game-card-genre">${game.genre}</div>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.game-card').forEach(card => {
    card.addEventListener('click', () => showGameModal(card.dataset.gameId));
  });
}

async function loadOnlineFriends() {
  if (!userProfile?.friends?.length) return;
  const strip = document.getElementById('friends-strip');
  const section = document.getElementById('friends-online-section');
  
  try {
    const friends = [];
    for (const uid of userProfile.friends.slice(0, 8)) {
      const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
      const snap = await getDoc(doc(db, 'users', uid));
      if (snap.exists()) {
        const data = snap.data();
        if (data.online) friends.push({ uid, ...data });
      }
    }

    if (friends.length > 0) {
      section.style.display = '';
      strip.innerHTML = friends.map(f => `
        <div class="friend-card-mini" data-game="${f.currentGame || ''}">
          <div class="friend-avatar">🧑</div>
          <div class="friend-name">${f.username}</div>
          <div class="friend-status">${f.currentGame ? '🎮 Playing' : '🏠 In Hub'}</div>
          ${f.currentGame ? `<button class="join-btn" data-game="${f.currentGame}" data-uid="${f.uid}">Join</button>` : ''}
        </div>
      `).join('');

      strip.querySelectorAll('.join-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const gameId = btn.dataset.game;
          if (gameId) {
            import('./game-engine.js').then(mod => mod.loadGame(gameId));
          }
        });
      });
    }
  } catch(e) { console.error(e); }
}

function initGameModal() {
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('game-modal').addEventListener('click', (e) => {
    if (e.target.id === 'game-modal') closeModal();
  });
  document.getElementById('modal-play-btn').addEventListener('click', () => {
    if (currentGameId) {
      closeModal();
      import('./game-engine.js').then(mod => mod.loadGame(currentGameId));
    }
  });
}

export function showGameModal(gameId) {
  const game = GAMES.find(g => g.id === gameId);
  if (!game) return;
  currentGameId = gameId;

  document.getElementById('modal-game-image').style.background = game.bg;
  document.getElementById('modal-game-image').textContent = game.emoji;
  document.getElementById('modal-game-title').textContent = game.title;
  document.getElementById('modal-game-desc').textContent = game.desc;
  document.getElementById('game-modal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('game-modal').classList.add('hidden');
  currentGameId = null;
}
