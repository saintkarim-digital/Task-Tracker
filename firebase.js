// Firebase setup shared by the tracker (index.html) and the weekly report (report.html).
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDjPXhtdonOJ3dMUk3oxe__Kr6cac95--M",
  authDomain: "tasktracker-73660.firebaseapp.com",
  projectId: "tasktracker-73660",
  storageBucket: "tasktracker-73660.firebasestorage.app",
  messagingSenderId: "395969671296",
  appId: "1:395969671296:web:5ae5b79a8519b292547665"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
// The only account allowed to tick tasks. Must match firestore.rules.
export const OWNER = "saintkarimdigital@gmail.com";
