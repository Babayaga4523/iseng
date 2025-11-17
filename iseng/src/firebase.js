// Import the functions you need from the SDKs you need
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue, update } from 'firebase/database';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyB1Mh6mX3m9w_E8VB-j07IwUeLnzP_vR8k",
  authDomain: "babayaga-21764.firebaseapp.com",
  databaseURL: "https://babayaga-21764-default-rtdb.firebaseio.com",
  projectId: "babayaga-21764",
  storageBucket: "babayaga-21764.firebasestorage.app",
  messagingSenderId: "316734132236",
  appId: "1:316734132236:web:7df9870b944b61c2f49e29",
  measurementId: "G-HFV0R8ZFQY"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Realtime Database and get a reference to the service
const database = getDatabase(app);

// Initialize Cloud Storage and get a reference to the service
const storage = getStorage(app);

export { database, ref, onValue, update, storage, storageRef, uploadBytes, getDownloadURL };