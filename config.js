// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDbMBekLrUAiOa4HJOOEJcnrIJnmOGD81I",
  authDomain: "dr-samavia-clinic.firebaseapp.com",
  projectId: "dr-samavia-clinic",
  storageBucket: "dr-samavia-clinic.firebasestorage.app",
  messagingSenderId: "104424927726",
  appId: "1:104424927726:web:50e832380e25bf66ae1eff",
  measurementId: "G-27GW6S1CGC"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
