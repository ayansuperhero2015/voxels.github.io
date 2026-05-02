// friends.js
import { currentUser, userProfile, saveUserProfile } from './auth.js';
import { db } from './firebase-config.js';
import { doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showToast } from './app.js';

export function initFriends() {
  const page = document.getElementById('page-friends');
  page.innerHTML = `
    <div class="friends-page-header">
      <h2>👥 Friends</h2>
    </div>

    <div class="friend-search-bar">
      <input type="text" id="friend-search-input" placeholder="Search by username...">
      <button id="friend-search-btn">Find</button>
    </div>

    <div id="search-results-section" style="display:none">
      <div class="search-results-box">
        <h4>Search Results</h4>
        <div class="friends-list" id="search-results-list"></div>
      </div>
    </div>

    <div class="friends-section">
      <h3>📬 Pending Requests (<span id="pending-count">0</span>)</h3>
      <div class="friends-list" id="pending-list">
        <div class="no-friends-msg">No pending requests</div>
      </div>
    </div>

    <div class="friends-section">
      <h3>🟢 Friends (<span id="friends-count">0</span>)</h3>
      <div class="friends-list" id="friends-list">
        <div class="no-friends-msg">No friends yet. Find players to add!</div>
      </div>
    </div>
  `;

  document.getElementById('friend-search-btn').addEventListener('click', searchUsers);
  document.getElementById('friend-search-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') searchUsers();
  });

  loadFriends();
}

async function searchUsers() {
  const query_val = document.getElementById('friend-search-input').value.trim().toLowerCase();
  if (!query_val || query_val.length < 2) return;

  const section = document.getElementById('search-results-section');
  const list = document.getElementById('search-results-list');
  
  try {
    // Search usernames
    const snap = await getDoc(doc(db, 'usernames', query_val));
    section.style.display = '';
    
    if (!snap.exists()) {
      list.innerHTML = '<div class="no-friends-msg">No user found with that username</div>';
      return;
    }

    const found = snap.data();
    if (found.uid === currentUser.uid) {
      list.innerHTML = '<div class="no-friends-msg">That\'s you! 😄</div>';
      return;
    }

    const alreadyFriend = (userProfile.friends || []).includes(found.uid);
    const sentRequest = (userProfile.sentRequests || []).includes(found.uid);

    list.innerHTML = `
      <div class="friend-row">
        <div class="friend-avatar-icon">🧑</div>
        <div class="friend-info">
          <div class="f-name">${found.username}</div>
          <div class="f-status">${alreadyFriend ? '✅ Already friends' : sentRequest ? '⏳ Request sent' : ''}</div>
        </div>
        <div class="friend-actions">
          ${!alreadyFriend && !sentRequest ? `<button class="f-btn add" data-uid="${found.uid}" data-name="${found.username}">Add Friend</button>` : ''}
        </div>
      </div>
    `;

    list.querySelectorAll('.f-btn.add').forEach(btn => {
      btn.addEventListener('click', () => sendFriendRequest(btn.dataset.uid, btn.dataset.name));
    });
  } catch(e) {
    console.error(e);
    list.innerHTML = '<div class="no-friends-msg">Error searching. Try again.</div>';
    section.style.display = '';
  }
}

async function sendFriendRequest(targetUid, targetName) {
  try {
    // Add to our sent requests
    const newSent = [...(userProfile.sentRequests || []), targetUid];
    await saveUserProfile({ sentRequests: newSent });

    // Add to their pending
    await updateDoc(doc(db, 'users', targetUid), {
      pendingRequests: arrayUnion(currentUser.uid)
    });

    showToast(`📨 Friend request sent to ${targetName}!`);
    searchUsers(); // Refresh
  } catch(e) {
    console.error(e);
    showToast('Failed to send request');
  }
}

async function acceptFriendRequest(uid, name) {
  try {
    // Add to both friends lists
    const newFriends = [...(userProfile.friends || []), uid];
    const newPending = (userProfile.pendingRequests || []).filter(id => id !== uid);
    await saveUserProfile({ friends: newFriends, pendingRequests: newPending });

    // Update other user
    await updateDoc(doc(db, 'users', uid), {
      friends: arrayUnion(currentUser.uid),
      sentRequests: arrayRemove(currentUser.uid)
    });

    showToast(`🎉 You're now friends with ${name}!`);
    loadFriends();
  } catch(e) { console.error(e); }
}

async function declineFriendRequest(uid) {
  const newPending = (userProfile.pendingRequests || []).filter(id => id !== uid);
  await saveUserProfile({ pendingRequests: newPending });
  loadFriends();
}

async function loadFriends() {
  const pendingList = document.getElementById('pending-list');
  const friendsList = document.getElementById('friends-list');
  if (!pendingList || !friendsList) return;

  const pending = userProfile.pendingRequests || [];
  const friends = userProfile.friends || [];

  document.getElementById('pending-count').textContent = pending.length;
  document.getElementById('friends-count').textContent = friends.length;

  // Render pending
  if (pending.length === 0) {
    pendingList.innerHTML = '<div class="no-friends-msg">No pending requests</div>';
  } else {
    const pendingProfiles = await Promise.all(pending.map(uid => getDoc(doc(db, 'users', uid))));
    pendingList.innerHTML = pendingProfiles.map(snap => {
      const data = snap.exists() ? snap.data() : { username: 'Unknown' };
      return `
        <div class="friend-row">
          <div class="friend-avatar-icon">🧑</div>
          <div class="friend-info">
            <div class="f-name">${data.username || 'Unknown'}</div>
            <div class="f-status">Wants to be your friend</div>
          </div>
          <div class="friend-actions">
            <button class="f-btn accept" data-uid="${snap.id}" data-name="${data.username}">Accept</button>
            <button class="f-btn decline" data-uid="${snap.id}">Decline</button>
          </div>
        </div>
      `;
    }).join('');

    pendingList.querySelectorAll('.f-btn.accept').forEach(btn =>
      btn.addEventListener('click', () => acceptFriendRequest(btn.dataset.uid, btn.dataset.name)));
    pendingList.querySelectorAll('.f-btn.decline').forEach(btn =>
      btn.addEventListener('click', () => declineFriendRequest(btn.dataset.uid)));
  }

  // Render friends
  if (friends.length === 0) {
    friendsList.innerHTML = '<div class="no-friends-msg">No friends yet. Find players to add!</div>';
  } else {
    const friendProfiles = await Promise.all(friends.map(uid => getDoc(doc(db, 'users', uid))));
    friendsList.innerHTML = friendProfiles.map(snap => {
      const data = snap.exists() ? snap.data() : { username: 'Unknown' };
      const isOnline = data.online;
      const inGame = data.currentGame;
      return `
        <div class="friend-row">
          <div class="friend-avatar-icon">🧑</div>
          <div class="friend-info">
            <div class="f-name">${data.username || 'Unknown'}</div>
            <div class="f-status ${isOnline ? 'online' : ''}">
              ${isOnline ? (inGame ? `🎮 Playing a game` : '🟢 Online') : '⚫ Offline'}
            </div>
          </div>
          <div class="friend-actions">
            ${inGame ? `<button class="f-btn join" data-game="${inGame}">Join</button>` : ''}
          </div>
        </div>
      `;
    }).join('');

    friendsList.querySelectorAll('.f-btn.join').forEach(btn => {
      btn.addEventListener('click', () => {
        import('./game-engine.js').then(mod => mod.loadGame(btn.dataset.game));
      });
    });
  }
}
