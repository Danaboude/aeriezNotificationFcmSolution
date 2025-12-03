# FCM Notification Middleware: A Proof of Concept

## Project Purpose & Proposed Solution

This project, designed as a proof of concept for Aeriez, presents a robust and secure middleware solution to address the challenge of delivering real-time notifications within a restrictive corporate environment.

### The Problem

The primary issue is an inability to reliably send real-time updates from an Azure-hosted application to end-users due to security policies blocking common notification channels. The current workaround involves clients polling the server every 60 seconds, which is inefficient, creates unnecessary server load, and does not provide a true real-time experience.

### The Solution: A Trusted Middleware

This prototype demonstrates a middleware architecture that leverages **Google's Firebase Cloud Messaging (FCM)** to bypass these restrictions and provide efficient, real-time push notifications.

The backend acts as a **`وسيط` (trusted intermediary)**, which can be hosted on Azure. Here is the proposed workflow:

1.  **Trigger Event**: An action is initiated within the primary business application (e.g., a manager presses a button to publish an update).
2.  **API Call**: The application makes a single API call to the `/notify` endpoint of this middleware backend.
3.  **Secure Push via FCM**: The middleware securely instructs Firebase Cloud Messaging (FCM) to broadcast a notification to all devices belonging to a specific `group_id`.
4.  **Instant Delivery**: FCM, a globally trusted service, delivers the notification to the target employees' devices instantly.
5.  **UI Refresh**: The client application receives the push notification and can immediately refresh its UI or update its state, completely eliminating the need for polling.

### Key Benefits of the FCM Approach
Beyond bypassing security restrictions, this solution offers several key advantages for reliability and user experience:

-   **Offline Delivery**: Notifications are delivered even if the user's browser is closed or their phone is locked. The underlying service worker listens for messages as long as the user's device is on and connected.
-   **Guaranteed & Queued Messaging**: An active internet connection is required for immediate delivery. However, if a device is offline, FCM automatically queues the message and delivers it promptly upon reconnection.
-   **One-Time Permission**: Users only need to grant notification permission once. After that, the system can reliably send updates without further interruption.
-   **Efficient & Low Power**: This is a true push mechanism, which saves battery life on mobile devices and reduces CPU/memory usage in the browser compared to constant polling.

### Security Considerations

Using Google's Firebase Cloud Messaging (FCM) is an industry-standard, secure approach.
-   **Encrypted Communication**: All messages between the backend, FCM, and client devices are encrypted.
-   **High Deliverability**: As a core part of the Android and web ecosystem, FCM traffic is highly unlikely to be blocked by corporate firewalls, unlike custom or less common notification solutions. This architecture moves the notification delivery to a trusted, specialized provider, resolving the core blocking issue.

### Note on the Frontend

The frontend code included in this prototype is a **minimalistic example** built solely to demonstrate and validate the notification delivery mechanism. It is expected that this frontend component will be **replaced entirely** by your own production customer-facing system, which will integrate the logic for receiving FCM messages.

---

## Components

-   **`database.sql`**: The MySQL schema for the `employees` table.
-   **`backend/`**: A Node.js Express application to handle device registration and send notifications.
-   **`frontend/`**: A Next.js application to receive notifications.

---

## Setup and How to Run

### Step 1: Firebase Setup

1.  **Create a Firebase Project**: Go to the [Firebase Console](https://console.firebase.google.com/) and create a new project.
2.  **Get Backend Credentials**:
    -   In your Firebase project, go to **Project Settings** > **Service Accounts**.
    -   Click **"Generate new private key"**.
    -   A JSON file will be downloaded. Rename this file to `firebase-admin.json` and place it inside the `backend/` directory.
3.  **Get Frontend Credentials**:
    -   In your Firebase project, go to **Project Settings** > **General**.
    -   Scroll down to "Your apps". If you haven't added a web app, click the **Web** icon (`</>`) to create a new one.
    -   After creating the app, Firebase will give you a `firebaseConfig` object.
    -   Copy the values from this object and add them to `frontend/frontend-app/.env.local` as environment variables (e.g., `NEXT_PUBLIC_FIREBASE_API_KEY="YOUR_API_KEY"`).
    -   Also, go to **Project Settings** > **Cloud Messaging** tab. Under the "Web configuration" section, you will find the "Vapid key". Copy this key and add it to `frontend/frontend-app/.env.local` as `NEXT_PUBLIC_FIREBASE_VAPID_KEY="YOUR_VAPID_KEY_HERE"`.

### Step 2: Database Setup

1.  **Install MySQL**: Ensure you have a MySQL server running.
2.  **Create Database**: Log in to your MySQL server and create a new database named `fcm_notifications`.
    ```sql
    CREATE DATABASE fcm_notifications;
    ```
3.  **Import Schema**: Import the `database.sql` file into your new database.
    ```bash
    # Using the command line
    mysql -u your_username -p fcm_notifications < database.sql
    ```
4.  **Update Connection Details**:
    -   Open `backend/db.js`.
    -   Update the `dbConfig` object with your MySQL host, username, password, and the database name.

### Step 3: Run the Backend

1.  **Navigate to Backend Folder**:
    ```bash
    cd backend
    ```
2.  **Install Dependencies**:
    ```bash
    npm install
    ```
3.  **Start the Server**:
    ```bash
    node server.js
    ```
    The backend server will start on `http://localhost:3000`.

### Step 4: Run the Frontend

1.  **Navigate to Frontend Folder**:
    ```bash
    cd frontend/frontend-app
    ```
2.  **Install Dependencies**:
    ```bash
    npm install
    ```
3.  **Start the Development Server**:
    ```bash
    npm run dev
    ```
4.  **Access the Frontend**:
    -   Open your web browser to the URL provided (e.g., `http://localhost:3001`).
    -   The browser will ask for permission to show notifications. Click **"Allow"**.
    -   Check the browser's developer console. You should see the FCM token being logged and a message indicating successful registration with the backend.

### Step 5: Test Notifications

You can now send a notification to the registered device using the `/notify` endpoint. The frontend is hardcoded with `group_id: 'group_A'`.

1.  **Use `curl` (or any API client)** to send a POST request:
    ```bash
    curl -X POST http://localhost:3000/notify \
    -H "Content-Type: application/json" \
    -d '{ "group_id": "group_A", "message": "This is a test notification!" }'
    ```

2.  **Observe the Result**:
    -   **If the frontend page is open**: The status text will update, the counter will increase, and the page will reload.
    -   **If the frontend page is closed or in a background tab**: A system notification will appear.