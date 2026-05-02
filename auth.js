// auth.js - Handles authentication
import { auth, db } from './firebase-config.js';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, setDoc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export let currentUser = null; // Firebase user
export let userProfile = null; // Firestore profile
export let isGuest = false;

const DEFAULT_PROFILE = {
  voxbux: 0,
  skinColor: '#c68642',
  bodyType: 'normal',
  equippedItems: [],
  ownedItems: ['tshirt_white', 'jeans_blue'],
  friends: [],
  pendingRequests: [],
  sentRequests: [],
  online: false,
  currentGame: null,
  createdAt: null
};

export async function loadUserProfile(uid) {
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    userProfile = snap.data();
  } else {
    // New user - create profile
    userProfile = { ...DEFAULT_PROFILE, createdAt: serverTimestamp() };
    await setDoc(ref, userProfile);
  }
  return userProfile;
}

export async function saveUserProfile(updates) {
  if (!currentUser || isGuest) return;
  const ref = doc(db, 'users', currentUser.uid);
  Object.assign(userProfile, updates);
  await setDoc(ref, userProfile, { merge: true });
}

export function initAuth(onLogin, onLogout) {
  // Tab switching
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`${tab.dataset.tab}-form`).classList.add('active');
    });
  });

  // Sign up
  document.getElementById('signup-btn').addEventListener('click', async () => {
    const username = document.getElementById('signup-username').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;
    const err = document.getElementById('signup-error');

    if (!username || username.length < 3) { err.textContent = 'Username must be at least 3 characters'; return; }
    if (!email) { err.textContent = 'Email is required'; return; }
    if (password.length < 6) { err.textContent = 'Password must be at least 6 characters'; return; }

    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      // Store username
      await setDoc(doc(db, 'users', cred.user.uid), {
        ...DEFAULT_PROFILE,
        username,
        email,
        createdAt: serverTimestamp()
      });
      // Store username lookup
      await setDoc(doc(db, 'usernames', username.toLowerCase()), { uid: cred.user.uid, username });
      err.textContent = '';
    } catch (e) {
      err.textContent = e.message.replace('Firebase: ', '');
    }
  });

  // Log in
  document.getElementById('login-btn').addEventListener('click', async () => {
    const usernameOrEmail = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const err = document.getElementById('login-error');

    let email = usernameOrEmail;
    // If not an email, look up username
    if (!usernameOrEmail.includes('@')) {
      try {
        const snap = await getDoc(doc(db, 'usernames', usernameOrEmail.toLowerCase()));
        if (!snap.exists()) { err.textContent = 'Username not found'; return; }
        // Get user profile to find email
        const uid = snap.data().uid;
        const profileSnap = await getDoc(doc(db, 'users', uid));
        email = profileSnap.data().email;
      } catch (e) {
        err.textContent = 'Could not find user';
        return;
      }
    }

    try {
      await signInWithEmailAndPassword(auth, email, password);
      err.textContent = '';
    } catch (e) {
      err.textContent = 'Invalid credentials';
    }
  });

  // Guest
  document.getElementById('guest-btn').addEventListener('click', () => {
    isGuest = true;
    currentUser = null;
    userProfile = { ...DEFAULT_PROFILE, username: 'Guest_' + Math.floor(Math.random() * 9999) };
    onLogin();
  });

  // Logout
  document.getElementById('logout-btn').addEventListener('click', async () => {
    if (!isGuest) {
      await saveUserProfile({ online: false, currentGame: null });
      await signOut(auth);
    }
    isGuest = false;
    currentUser = null;
    userProfile = null;
    onLogout();
  });

  // Auth state
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      currentUser = user;
      isGuest = false;
      await loadUserProfile(user.uid);
      await saveUserProfile({ online: true });
      onLogin();
    } else if (!isGuest) {
      currentUser = null;
      onLogout();
    }
  });
}
