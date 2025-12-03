import { useEffect, useState, useRef, useCallback } from 'react';
import { getToken, onMessage, getMessaging } from 'firebase/messaging'; // Import getMessaging
import { app } from '../lib/firebase'; // Import the app instance, not messaging
import { useRouter } from 'next/navigation';

interface NotificationState {
  count: number;
  status: string;
}

const DEMO_GROUP_ID = 'group_A';     // Hardcoded for demo
const BACKEND_URL = 'http://localhost:3000/register'; // Corrected to point to local backend

// Function to generate a random employee ID
const generateRandomEmployeeId = (): string => {
  // Generate a random number between 100 and 99999
  const randomNum = Math.floor(Math.random() * 99900) + 100;
  return `user_${randomNum}`;
};

export const useFirebaseMessaging = () => {
  const [notificationState, setNotificationState] = useState<NotificationState>({
    count: 0,
    status: 'Waiting for events...',
  });
  const [employeeId, setEmployeeId] = useState<string>(''); // Store employee ID in state
  const isMounted = useRef(true);

  // Initialize counter and employee ID on component mount
  useEffect(() => {
    isMounted.current = true;
    
    const storedCount = localStorage.getItem('notificationCount');
    if (storedCount) {
      setNotificationState(prevState => ({ ...prevState, count: parseInt(storedCount) }));
    }

    const storedEmployeeId = localStorage.getItem('employeeId');
    if (storedEmployeeId) {
      setEmployeeId(storedEmployeeId);
    } else {
      const newEmployeeId = generateRandomEmployeeId();
      setEmployeeId(newEmployeeId);
      localStorage.setItem('employeeId', newEmployeeId);
    }

    // Cleanup ref on unmount
    return () => {
      isMounted.current = false;
    };
  }, []);

  const incrementCounter = useCallback(() => {
    setNotificationState(prevState => {
      const newCount = prevState.count + 1;
      localStorage.setItem('notificationCount', newCount.toString());
      return { ...prevState, count: newCount };
    });
  }, []);

  useEffect(() => {
    // Exit if employeeId is not yet available
    if (!employeeId) {
      setNotificationState(prevState => ({ ...prevState, status: 'Initializing user...' }));
      return;
    }

    // Function to register the FCM token with the backend
    const registerTokenWithBackend = async (token: string) => {
      try {
        const response = await fetch(BACKEND_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employee_id: employeeId,
            group_id: DEMO_GROUP_ID,
            fcm_token: token,
          }),
        });

        if (!response.ok) {
          throw new Error(`Backend registration failed with status: ${response.status}`);
        }
        
        const data = await response.json();
        if (data.success) {
          if (isMounted.current) {
            setNotificationState(prevState => ({
              ...prevState,
              status: `Ready. Listening in group: ${DEMO_GROUP_ID} (User: ${employeeId})`,
            }));
          }
          console.log('Backend registration successful:', data);
        } else {
          throw new Error(data.message || 'Backend registration returned an error.');
        }
      } catch (err) {
        if (isMounted.current) {
          setNotificationState(prevState => ({ ...prevState, status: 'Error communicating with backend.' }));
        }
        console.error('Error during backend registration:', err);
      }
    };

    // Initialize messaging only on the client side once employeeId is set
    let messagingInstance;
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && app) {
      messagingInstance = getMessaging(app);
    } else {
      console.warn('Firebase Messaging is not supported in this browser.');
      setNotificationState(prevState => ({ ...prevState, status: 'Notifications not supported.' }));
      return;
    }

    const initializeMessaging = async () => {
      setNotificationState(prevState => ({ ...prevState, status: 'Requesting notification permission...' }));
      try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          setNotificationState(prevState => ({ ...prevState, status: 'Permission granted. Getting token...' }));
          
          const currentToken = await getToken(messagingInstance, { vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY });

          if (currentToken) {
            console.log('FCM Token:', currentToken);
            setNotificationState(prevState => ({ ...prevState, status: 'Registering with backend...' }));
            await registerTokenWithBackend(currentToken);
          } else {
            setNotificationState(prevState => ({ ...prevState, status: 'No FCM token. Please enable notifications.' }));
            console.warn('No registration token available.');
          }
        } else {
          setNotificationState(prevState => ({ ...prevState, status: 'Permission to notify denied.' }));
          console.error('Unable to get permission to notify.');
        }
      } catch (err) {
        setNotificationState(prevState => ({ ...prevState, status: 'Error during messaging initialization.' }));
        console.error('Error during messaging initialization:', err);
      }
    };

    initializeMessaging();

    const unsubscribe = onMessage(messagingInstance, payload => {
      console.log('Message received in foreground:', payload);
      if (isMounted.current) {
        setNotificationState(prevState => ({
          ...prevState,
          status: `Received: ${payload.notification?.body || 'New message'}`,
        }));
      }
      incrementCounter();

      setTimeout(() => {
        window.location.reload();
      }, 1500);
    });

    return () => {
      unsubscribe();
    };
  }, [employeeId, incrementCounter, app]);

  return { ...notificationState, employeeId };
};
