import type { NextApiRequest, NextApiResponse } from 'next';
import { query, initializeDatabase } from '../../lib/db';

// Define types for the waitlist entry
interface WaitlistEntry {
  email: string;
  first_name: string;
  last_name: string;
  role: string;
}

interface ApiResponse {
  success: boolean;
  message?: string;
  error?: string;
  data?: WaitlistEntry | WaitlistEntry[] | Record<string, unknown>;
}

// Initialize database on first load (non-blocking)
let dbInitialized = false;
initializeDatabase().then((result: boolean) => {
  dbInitialized = result;
  if (!result) {
    console.warn('Database initialization failed - waitlist API may not work');
  }
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>
) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  try {
    const { email, first_name, last_name, role }: WaitlistEntry = req.body;

    // Validate required fields
    if (!email || !first_name || !last_name || !role) {
      return res.status(400).json({
        success: false,
        error: 'All fields are required'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format'
      });
    }

    // Validate role
    const validRoles = ['ml_engineer', 'data_scientist', 'data_engineer', 'product_manager', 'founder', 'other', 'student', 'ai_scientist', 'ai_engineer', 'ai_researcher', 'vp_engineering', 'ceo'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid role selected'
      });
    }

    // Check database connection first
    if (!dbInitialized) {
      // Try to initialize again
      dbInitialized = await initializeDatabase();
      if (!dbInitialized) {
        return res.status(503).json({
          success: false,
          error: 'Database is currently unavailable. Please try again later.'
        });
      }
    }

    // Check if email already exists
    const existingUser = await query(
      'SELECT email FROM waitlist WHERE email = $1',
      [email.toLowerCase()]
    );

    if (existingUser.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'This email is already on the waitlist'
      });
    }

    // Insert new waitlist entry
    const insertQuery = `
      INSERT INTO waitlist (email, first_name, last_name, role)
      VALUES ($1, $2, $3, $4)
      RETURNING id, email, first_name, last_name, role, created_at
    `;

    const result = await query(
      insertQuery,
      [email.toLowerCase(), first_name.trim(), last_name.trim(), role]
    );

    // Send success response
    return res.status(201).json({
      success: true,
      message: 'Successfully added to waitlist',
      data: result[0]
    });

  } catch (error) {
    console.error('Waitlist API error:', error);
    
    // Handle database connection errors
    if (error instanceof Error && error.message.includes('connect')) {
      return res.status(503).json({
        success: false,
        error: 'Database connection error. Please try again later.'
      });
    }

    return res.status(500).json({
      success: false,
      error: 'An unexpected error occurred. Please try again.'
    });
  }
}
