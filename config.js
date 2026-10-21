import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
const firebaseConfig = {
  apiKey: "AIzaSyDbMBekLrUAiOa4HJOOEJcnrIJnmOGD81I",
  authDomain: "dr-samavia-clinic.firebaseapp.com",
  projectId: "dr-samavia-clinic-240b8",
  storageBucket: "dr-samavia-clinic.firebasestorage.app",
  messagingSenderId: "104424927726",
  appId: "1:104424927726:web:b6e3e06f9ac9635aae1eff",
  measurementId: "G-JXQCW39J0P"
};
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
