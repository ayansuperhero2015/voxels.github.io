// marketplace.js
import { userProfile, saveUserProfile } from './auth.js';
import { updateVoxbuxDisplay } from './hub.js';
import { showToast } from './app.js';

export const SHOP_ITEMS = [
  // Accessories (3D model keys for avatar)
  { id: 'hat_cowboy', name: 'Cowboy Hat', type: 'Hat', emoji: '🤠', price: 50, model: 'hat_cowboy' },
  { id: 'hat_wizard', name: 'Wizard Hat', type: 'Hat', emoji: '🧙', price: 80, model: 'hat_wizard' },
  { id: 'hat_crown', name: 'Royal Crown', type: 'Hat', emoji: '👑', price: 200, model: 'hat_crown' },
  { id: 'hat_cap', name: 'Baseball Cap', type: 'Hat', emoji: '🧢', price: 0, model: 'hat_cap' },
  { id: 'glasses_cool', name: 'Sunglasses', type: 'Accessory', emoji: '😎', price: 30, model: 'glasses_cool' },
  { id: 'glasses_nerd', name: 'Nerd Glasses', type: 'Accessory', emoji: '🤓', price: 0, model: 'glasses_nerd' },
  { id: 'bag_backpack', name: 'Adventure Pack', type: 'Back', emoji: '🎒', price: 60, model: 'bag_backpack' },
  { id: 'wings_angel', name: 'Angel Wings', type: 'Back', emoji: '👼', price: 150, model: 'wings_angel' },
  { id: 'wings_demon', name: 'Demon Wings', type: 'Back', emoji: '😈', price: 150, model: 'wings_demon' },
  // Clothes
  { id: 'tshirt_white', name: 'White T-Shirt', type: 'Shirt', emoji: '👕', price: 0, model: 'shirt_white' },
  { id: 'tshirt_red', name: 'Red T-Shirt', type: 'Shirt', emoji: '👕', price: 20, model: 'shirt_red' },
  { id: 'hoodie_black', name: 'Black Hoodie', type: 'Shirt', emoji: '🧥', price: 60, model: 'hoodie_black' },
  { id: 'suit_tuxedo', name: 'Tuxedo Suit', type: 'Shirt', emoji: '🤵', price: 120, model: 'suit_tuxedo' },
  { id: 'jeans_blue', name: 'Blue Jeans', type: 'Pants', emoji: '👖', price: 0, model: 'pants_jeans' },
  { id: 'pants_cargo', name: 'Cargo Pants', type: 'Pants', emoji: '👖', price: 35, model: 'pants_cargo' },
  { id: 'pants_sweat', name: 'Sweatpants', type: 'Pants', emoji: '🩳', price: 25, model: 'pants_sweat' },
];

export const VOXBUX_BUNDLES = [
  { id: 'small', amount: 100, price: '$0.99', label: 'Starter Pack' },
  { id: 'medium', amount: 500, price: '$3.99', label: 'Explorer Pack', popular: true },
  { id: 'large', amount: 1200, price: '$7.99', label: 'Builder Pack' },
  { id: 'mega', amount: 3000, price: '$17.99', label: 'Mega Pack' },
];

export function initMarketplace() {
  const page = document.getElementById('page-marketplace');
  
  page.innerHTML = `
    <div class="marketplace-header">
      <h2>🛒 Marketplace</h2>
      <div class="voxbux-balance">🪙 ${(userProfile?.voxbux || 0).toLocaleString()} VoxBux</div>
    </div>
    
    <div class="marketplace-tabs">
      <button class="market-tab active" data-tab="voxbux">💰 Buy VoxBux</button>
      <button class="market-tab" data-tab="hats">🎩 Hats</button>
      <button class="market-tab" data-tab="accessories">✨ Accessories</button>
      <button class="market-tab" data-tab="clothes">👕 Clothes</button>
    </div>

    <div id="market-voxbux" class="market-section active">
      <p style="color:var(--text2);margin-bottom:24px;">Purchase VoxBux to buy exclusive avatar items!</p>
      <div class="voxbux-bundles" id="bundles-grid"></div>
    </div>

    <div id="market-hats" class="market-section">
      <div class="items-grid" id="hats-grid"></div>
    </div>

    <div id="market-accessories" class="market-section">
      <div class="items-grid" id="accessories-grid"></div>
    </div>

    <div id="market-clothes" class="market-section">
      <div class="items-grid" id="clothes-grid"></div>
    </div>
  `;

  // Tabs
  page.querySelectorAll('.market-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      page.querySelectorAll('.market-tab').forEach(t => t.classList.remove('active'));
      page.querySelectorAll('.market-section').forEach(s => s.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`market-${tab.dataset.tab}`).classList.add('active');
    });
  });

  renderBundles();
  renderItems('hats-grid', SHOP_ITEMS.filter(i => i.type === 'Hat'));
  renderItems('accessories-grid', SHOP_ITEMS.filter(i => i.type === 'Accessory' || i.type === 'Back'));
  renderItems('clothes-grid', SHOP_ITEMS.filter(i => i.type === 'Shirt' || i.type === 'Pants'));
}

function renderBundles() {
  document.getElementById('bundles-grid').innerHTML = VOXBUX_BUNDLES.map(b => `
    <div class="bundle-card ${b.popular ? 'popular' : ''}">
      ${b.popular ? '<div class="popular-badge">⭐ MOST POPULAR</div>' : ''}
      <div class="bundle-coins">🪙</div>
      <div class="bundle-amount">${b.amount.toLocaleString()}</div>
      <div class="bundle-label">${b.label}</div>
      <button class="bundle-price" data-id="${b.id}" data-amount="${b.amount}">${b.price}</button>
    </div>
  `).join('');

  document.querySelectorAll('.bundle-price').forEach(btn => {
    btn.addEventListener('click', async () => {
      const amount = parseInt(btn.dataset.amount);
      // Simulated purchase (no real payment)
      const newBux = (userProfile.voxbux || 0) + amount;
      await saveUserProfile({ voxbux: newBux });
      updateVoxbuxDisplay();
      updateBalanceDisplay();
      showToast(`🪙 +${amount} VoxBux added!`);
    });
  });
}

function renderItems(containerId, items) {
  const owned = userProfile?.ownedItems || [];
  const container = document.getElementById(containerId);
  if (!container) return;
  
  container.innerHTML = items.map(item => {
    const isOwned = owned.includes(item.id);
    return `
      <div class="shop-item">
        <div class="shop-item-thumb">${item.emoji}</div>
        <div class="shop-item-info">
          <h4>${item.name}</h4>
          <div class="item-type">${item.type}</div>
          <div class="item-price">
            <span class="price-tag ${item.price === 0 ? 'free' : ''}">
              ${item.price === 0 ? '🎁 FREE' : `🪙 ${item.price}`}
            </span>
            <button class="buy-btn ${isOwned ? 'owned' : ''}" 
              data-id="${item.id}" 
              data-price="${item.price}"
              ${isOwned ? 'disabled' : ''}>
              ${isOwned ? '✓ Owned' : 'Get'}
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.buy-btn:not(.owned)').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const price = parseInt(btn.dataset.price);
      const balance = userProfile.voxbux || 0;

      if (price > 0 && balance < price) {
        showToast('💸 Not enough VoxBux!');
        return;
      }

      const newOwned = [...(userProfile.ownedItems || []), id];
      const updates = { ownedItems: newOwned };
      if (price > 0) updates.voxbux = balance - price;

      await saveUserProfile(updates);
      updateVoxbuxDisplay();
      updateBalanceDisplay();
      btn.textContent = '✓ Owned';
      btn.classList.add('owned');
      btn.disabled = true;
      showToast(`✅ ${SHOP_ITEMS.find(i => i.id === id)?.name} added to wardrobe!`);
    });
  });
}

function updateBalanceDisplay() {
  const bal = document.querySelector('.voxbux-balance');
  if (bal) bal.textContent = `🪙 ${(userProfile?.voxbux || 0).toLocaleString()} VoxBux`;
}
