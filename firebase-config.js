// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyAWeouu2n0MEZAbzgk0jaEp0Nir6Dl4BFQ",
  authDomain: "voxelcore-9dad7.firebaseapp.com",
  projectId: "voxelcore-9dad7",
  storageBucket: "voxelcore-9dad7.firebasestorage.app",
  messagingSenderId: "551389120091",
  appId: "1:551389120091:web:0fb60d3e2f2c0c5bc2217e",
  databaseURL: "https://voxelcore-9dad7-default-rtdb.firebaseio.com"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const rtdb = getDatabase(app);
export default app;
