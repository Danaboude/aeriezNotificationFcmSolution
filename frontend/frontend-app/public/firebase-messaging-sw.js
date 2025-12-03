// This script runs in the background as a service worker.
// It's responsible for handling notifications when the app is not in the foreground.

// IMPORTANT: You must import the Firebase scripts. Update versions as needed.
importScripts('https://www.gstatic.com/firebasejs/9.6.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.6.1/firebase-messaging-compat.js');

// --- FIREBASE CONFIGURATION ---
// This configuration must match the one in your .env.local
// IMPORTANT: Replace with your Firebase project's web app configuration.
const firebaseConfig = {
    apiKey: "AIzaSyDdYxvSqME0d-Rmgryev69QcLCIG5Nn32s",
    authDomain: "flutter-app-81ef7.firebaseapp.com",
    databaseURL: "https://flutter-app-81ef7-default-rtdb.firebaseio.com",
    projectId: "flutter-app-81ef7",
    storageBucket: "flutter-app-81ef7.firebasestorage.app",
    messagingSenderId: "686787632104",
    appId: "1:686787632104:web:e08781b44a47f40401225d"
};

// Initialize the Firebase app in the service worker
firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// --- BACKGROUND MESSAGE HANDLER ---
// This handler will be called when a notification is received and the
// page is not in the foreground.
messaging.onBackgroundMessage(function(payload) {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);

  // Customize the notification here
  const notificationTitle = payload.notification.title || 'New Message';
  const notificationOptions = {
    body: payload.notification.body || 'You have a new update.',
    icon: '/firebase-logo.png' // Optional: add an icon file to your public folder
  };

  // The service worker's registration is used to show the notification
  return self.registration.showNotification(notificationTitle, notificationOptions);
});
