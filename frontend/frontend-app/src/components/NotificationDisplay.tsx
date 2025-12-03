'use client';

import React from 'react';
import { useFirebaseMessaging } from '../hooks/useFirebaseMessaging';

const NotificationDisplay: React.FC = () => {
  const { count, status } = useFirebaseMessaging();

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-100">
      <div className="text-center p-8 bg-white rounded-lg shadow-md">
        <div className="text-6xl font-bold text-gray-800" id="counter">{count}</div>
        <div className="text-lg text-gray-600 mt-4" id="status">{status}</div>
      </div>
    </div>
  );
};

export default NotificationDisplay;
