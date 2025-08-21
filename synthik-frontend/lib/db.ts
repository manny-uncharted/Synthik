import { Pool } from 'pg';

// Check if we're in production or development
const isProduction = process.env.NODE_ENV === 'production';

// Create a connection pool for better performance
const pool = new Pool({
  connectionString: process.env.NEXT_DATABASE_URL || process.env.DATABASE_URL,
  ssl: isProduction ? {
    rejectUnauthorized: false
  } : undefined,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // How long a client is allowed to remain idle before being closed
  connectionTimeoutMillis: 10000, // Increased timeout to 10 seconds
});

// Add error handling for the pool
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

// Helper function to execute queries with better error handling
export async function query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]> {
  let client;
  try {
    client = await pool.connect();
    const result = await client.query(text, params);
    return result.rows;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  } finally {
    if (client) {
      client.release();
    }
  }
}

// Test database connection
export async function testConnection(): Promise<boolean> {
  try {
    const result = await query('SELECT NOW()');
    console.log('Database connected successfully at:', result[0].now);
    return true;
  } catch (error) {
    console.error('Database connection test failed:', error);
    return false;
  }
}

// Check if a table exists
export async function tableExists(tableName: string): Promise<boolean> {
  try {
    const result = await query<{ exists: boolean }>(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = $1
      )`,
      [tableName]
    );
    return result[0]?.exists || false;
  } catch (error) {
    console.error('Error checking table existence:', error);
    return false;
  }
}

// Initialize the database connection (no table creation)
export async function initializeDatabase() {
  // Only test the connection, don't create tables
  const isConnected = await testConnection();
  if (!isConnected) {
    console.error('Database connection failed');
    return false;
  }
  
  // Check if table exists for logging purposes
  const exists = await tableExists('waitlist');
  if (exists) {
    console.log('Waitlist table found and ready');
  } else {
    console.warn('Waitlist table does not exist - please create it manually');
  }
  
  return isConnected;
}

export default pool;
