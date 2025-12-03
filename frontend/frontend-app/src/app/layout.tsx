'use client'; // This is a Client Component

import { Inter } from "next/font/google";
import "./globals.css";
import { useEffect } from 'react';

const inter = Inter({ subsets: ["latin"] });

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/firebase-messaging-sw.js')
        .then((registration) => {
          console.log('Firebase Messaging Service Worker registered:', registration);
        })
        .catch((error) => {
          console.error('Firebase Messaging Service Worker registration failed:', error);
        });
    }
    // Set Page Title
    document.title = "Aeriez";

  }, []);

  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}