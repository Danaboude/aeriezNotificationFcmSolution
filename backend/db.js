const mysql = require('mysql2/promise');

// --- DATABASE CONFIGURATION ---
// Replace with your actual database connection details.
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: '', // <-- IMPORTANT: Replace with your MySQL root password
  database: 'fcm_notifications'   // <-- IMPORTANT: The database name you will use
};

// Create a connection pool
const pool = mysql.createPool(dbConfig);

// Export the pool to be used in other files
module.exports = pool;
