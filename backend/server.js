const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const admin = require('firebase-admin');
const pool = require('./db');

// --- FIREBASE ADMIN SDK CONFIGURATION ---
const serviceAccount = require('./firebase-admin.json');

try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  console.log('Firebase Admin SDK initialized successfully');
} catch (error) {
  console.error('Firebase initialization error:', error);
  process.exit(1);
}

const app = express();
const port = 3000;

app.use(cors());
app.use(bodyParser.json());

let requestCount = 0; // Initialize request counter

// Test Firebase connection
async function testFirebaseConnection() {
  try {
    const appName = admin.app().name;
    console.log('Firebase app name:', appName);
    return true;
  } catch (error) {
    console.log('Firebase connection test failed:', error);
    return false;
  }
}

// Test Database connection
async function testDatabaseConnection() {
  try {
    await pool.query('SELECT 1 + 1 AS solution');
    return true;
  } catch (error) {
    console.error('Database connection test failed:', error);
    return false;
  }
}

// --- API ENDPOINTS ---

app.post('/register', async (req, res) => {
  const { employee_id, group_id, fcm_token } = req.body;

  if (!employee_id || !group_id || !fcm_token) {
    return res.status(400).json({ error: 'Missing required fields: employee_id, group_id, fcm_token' });
  }

  const query = `
    INSERT INTO employees (employee_id, group_id, fcm_token) 
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE group_id = VALUES(group_id), fcm_token = VALUES(fcm_token), updated_at = CURRENT_TIMESTAMP;
  `;

  try {
    const [result] = await pool.execute(query, [employee_id, group_id, fcm_token]);
    console.log(`Registered or updated employee: ${employee_id}`);
    res.status(200).json({ success: true, message: 'Employee registered or updated successfully.' });
  } catch (error) {
    console.error('Database error during registration:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * Endpoint to send a notification to a specific group.
 * Expects JSON: { group_id, message, title (optional) }
 */
app.post('/notify', async (req, res) => {
  const currentCount = ++requestCount;
  console.log(`Request #${currentCount} received at:`, new Date().toISOString());
  
  const { group_id, message, title } = req.body;

  if (!group_id || !message) {
    return res.status(400).json({ error: 'Missing required fields: group_id, message' });
  }

  try {
    // 1. Find all FCM tokens for the given group_id
    const [rows] = await pool.execute('SELECT fcm_token FROM employees WHERE group_id = ?', [group_id]);

    if (rows.length === 0) {
      console.log(`No employees found for group_id: ${group_id}`);
      return res.status(404).json({ error: 'No employees found for this group.' });
    }

    // Deduplicate tokens to prevent sending the same notification multiple times to one device
    const allTokens = rows.map(row => row.fcm_token).filter(token => token && token.trim() !== '');
    const tokens = [...new Set(allTokens)];
    
    if (tokens.length === 0) {
      console.log(`No valid FCM tokens found for group_id: ${group_id}`);
      return res.status(404).json({ error: 'No valid FCM tokens found for this group.' });
    }
    
    console.log(`Found ${tokens.length} unique tokens for group_id: ${group_id} (out of ${allTokens.length} total)`);
    
    // First, try to send via multicast (most efficient)
    let result;
    try {
      console.log('Attempting to send via multicast...');
      result = await sendMulticastNotifications(tokens, group_id, message, title);
      
      // If multicast failed completely, try individual sending
      if (result.sent === 0 && result.failed > 0) {
        console.log('Multicast failed, trying individual sending...');
        result = await sendIndividualNotifications(tokens, group_id, message, title);
      }
      
    } catch (multicastError) {
      console.log('Multicast error, falling back to individual sending:', multicastError.message);
      result = await sendIndividualNotifications(tokens, group_id, message, title);
    }
    
    // Return the results
    res.status(200).json({ 
      success: true, 
      total_tokens: tokens.length,
      sent: result.sent,
      failed: result.failed,
      method: result.method || 'multicast'
    });
    
  } catch (error) {
    console.error('Error during notification process:', error);
    
    if (error.errorInfo) {
      console.error('Firebase Error Info:', error.errorInfo);
    }
    
    res.status(500).json({ 
      error: 'Internal server error.',
      details: error.message,
      code: error.code
    });
  }
});

// --- HELPER FUNCTIONS ---

/**
 * Creates a standard notification message payload.
 */
function createNotificationPayload(group_id, message, title, type) {
  return {
    notification: {
      title: title || 'New Notification',
      body: message,
    },
    data: {
      groupId: group_id,
      receivedAt: new Date().toISOString(),
      type: type || 'default',
    },
    android: {
      priority: 'high'
    },
    apns: {
      payload: {
        aps: {
          sound: 'default',
          badge: 1
        }
      }
    }
  };
}

/**
 * Send multicast notifications (preferred method)
 */
/**
 * Send multicast notifications (preferred method)
 */
async function sendMulticastNotifications(tokens, group_id, message, title) {
  const BATCH_SIZE = 500;
  let totalSuccess = 0;
  let totalFailure = 0;

  // If we have only 1 token, send as single message instead
  if (tokens.length === 1) {
    try {
      const messageObj = {
        token: tokens[0],
        notification: {
          title: title || 'New Notification',
          body: message,
        },
        data: {
          groupId: group_id,
          receivedAt: new Date().toISOString(),
          type: 'single',
        }
      };

      await admin.messaging().send(messageObj);
      console.log(`Sent single message to token ${tokens[0].substring(0, 20)}...`);
      return { sent: 1, failed: 0, method: 'single' };
    } catch (error) {
      console.error(`Failed to send single message:`, error.message);
      return { sent: 0, failed: 1, method: 'single' };
    }
  }

  // For multiple tokens, use multicast
  for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
    const batchTokens = tokens.slice(i, i + BATCH_SIZE);
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;

    try {
      // CORRECTED: Proper multicast message structure
      const multicastMessage = {
        tokens: batchTokens,
        notification: {
          title: title || 'New Notification',
          body: message,
        },
        data: {
          groupId: group_id,
          receivedAt: new Date().toISOString(),
          type: 'multicast',
        },
        android: {
          priority: 'high'
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1
            }
          }
        }
      };

      console.log(`Sending batch ${batchNumber} to ${batchTokens.length} tokens`);
      const response = await admin.messaging().sendMulticast(multicastMessage);

      console.log(`Batch ${batchNumber}: Sent ${response.successCount}, Failed ${response.failureCount}`);
      
      totalSuccess += response.successCount;
      totalFailure += response.failureCount;

      // Log any errors for failed messages
      response.responses.forEach((resp, idx) => {
        if (resp.error) {
          const tokenShort = batchTokens[idx].substring(0, 20) + '...';
          console.error(`Failure sending to token ${tokenShort}: ${resp.error.code || resp.error.message}`);
          
          // Remove invalid tokens from database
          if (resp.error.code === 'messaging/registration-token-not-registered' || 
              resp.error.code === 'messaging/invalid-registration-token') {
            removeInvalidToken(batchTokens[idx]);
          }
        }
      });
    } catch (batchError) {
      console.error(`Error sending batch ${batchNumber}:`, batchError.message);
      console.error('Full error:', batchError);
      totalFailure += batchTokens.length;
    }
  }

  console.log(`Multicast completed: ${totalSuccess} sent, ${totalFailure} failed`);
  return { sent: totalSuccess, failed: totalFailure, method: 'multicast' };
}
/**
 * Send individual notifications (fallback method)
 */
async function sendIndividualNotifications(tokens, group_id, message, title,) {
  let sent = 0;
  let failed = 0;

  for (const token of tokens) {
    try {
      const messageObj = {
        token: token,
        notification: {
          title: title || 'New Notification',
          body: message,
        },
        data: {
          groupId: group_id,
          receivedAt: new Date().toISOString(),
          type: 'individual',
        },
        android: {
          priority: 'high'
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1
            }
          }
        }
      };

      await admin.messaging().send(messageObj);
      sent++;
      console.log(`Sent individual message to ${token.substring(0, 20)}...`);
    } catch (error) {
      failed++;
      const tokenShort = token.substring(0, 20) + '...';
      console.error(`Failed to send to ${tokenShort}: ${error.message}`);
      
      // Remove invalid tokens from database
      if (error.code === 'messaging/registration-token-not-registered' || 
          error.code === 'messaging/invalid-registration-token') {
        removeInvalidToken(token);
      }
    }
  }

  console.log(`Individual sending completed: ${sent} sent, ${failed} failed`);
  return { sent, failed, method: 'individual' };
}
/**
 * Remove invalid FCM tokens from database
 */
async function removeInvalidToken(token) {
  try {
    const [result] = await pool.execute('DELETE FROM employees WHERE fcm_token = ?', [token]);
    if (result.affectedRows > 0) {
      console.log(`Removed invalid token from database: ${token.substring(0, 20)}...`);
    }
  } catch (error) {
    console.error('Error removing invalid token:', error);
  }
}

/**
 * Debug endpoint to see all tokens in a group
 */
app.get('/debug/tokens/:group_id', async (req, res) => {
  const { group_id } = req.params;
  
  try {
    const [rows] = await pool.execute(
      'SELECT employee_id, fcm_token, LENGTH(fcm_token) as token_length FROM employees WHERE group_id = ?', 
      [group_id]
    );
    
    res.status(200).json({
      group_id,
      count: rows.length,
      tokens: rows.map(row => ({
        employee_id: row.employee_id,
        token_preview: row.fcm_token ? `${row.fcm_token.substring(0, 20)}...` : 'NULL',
        token_length: row.token_length,
        is_valid: row.fcm_token && row.fcm_token.trim().length > 0
      }))
    });
  } catch (error) {
    console.error('Debug endpoint error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Health check endpoint
 */
app.get('/health', async (req, res) => {
  try {
    const firebaseStatus = await testFirebaseConnection();
    const dbStatus = await testDatabaseConnection();
    
    res.status(200).json({ 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      firebase: firebaseStatus ? 'connected' : 'disconnected',
      database: dbStatus ? 'connected' : 'disconnected'
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'ERROR', 
      error: error.message 
    });
  }
});

// Initialize and test on startup
(async () => {
  console.log('Starting server initialization...');
  
  const firebaseConnected = await testFirebaseConnection();
  console.log('Firebase connection:', firebaseConnected ? 'OK' : 'FAILED');
  
  const dbConnected = await testDatabaseConnection();
  console.log('Database connection:', dbConnected ? 'OK' : 'FAILED');
  
  app.listen(port, () => {
    console.log(`Backend server running at http://localhost:${port}`);
    console.log('Available endpoints:');
    console.log(`  POST http://localhost:${port}/register`);
    console.log(`  POST http://localhost:${port}/notify`);
    console.log(`  GET  http://localhost:${port}/health`);
    console.log(`  GET  http://localhost:${port}/debug/tokens/:group_id`);
  });
})();