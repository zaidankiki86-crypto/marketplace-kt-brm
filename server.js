/**
 * server.js - Dedicated Backend Router for Pasar Domba Bagus Rejo Mulyo
 * Stack: Node.js + Express + pg (PostgreSQL Connection Pool)
 * Designed for deployment on Vercel Serverless Functions.
 */

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for frontend integration
app.use(cors());

// Set request size limits to 50MB to accommodate large Base64 high-resolution photo uploads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Database connection URL check
if (!process.env.DATABASE_URL) {
  console.warn("WARNING: DATABASE_URL environment variable is not defined. Server will fail database queries.");
}

// Initialize PostgreSQL Connection Pool optimized for Vercel Serverless environment
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 2,                     // Limit connections per serverless container to prevent Supabase connection exhaustion
  idleTimeoutMillis: 10000,   // Close idle connections quickly
  connectionTimeoutMillis: 5000, // Timeout quickly if DB is unreachable
  ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost') ? {
    rejectUnauthorized: false
  } : false
});

// Database connectivity check on startup
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error("Database connection check failed on startup:", err.message);
  } else {
    console.log("Database connection test successful. Server time:", res.rows[0].now);
    console.log("Pasar Domba Bagus Rejo Mulyo backend initialized.");
  }
});

// Helper to sanitize price inputs (BIGINT compatible)
function sanitizePrice(val) {
  if (val === null || val === undefined) return 0n;
  if (typeof val === 'bigint') return val;
  if (typeof val === 'number') return BigInt(Math.round(val));
  
  let str = String(val).trim().replace(/^Rp\s*/i, "");
  // Remove Indonesian thousands separator dots (e.g. 3.500.000 -> 3500000)
  if (str.includes('.') && !str.includes(',')) {
    str = str.replace(/\./g, "");
  }
  const digits = str.replace(/[^0-9-]/g, "");
  if (!digits) return 0n;
  try {
    return BigInt(digits);
  } catch (e) {
    return 0n;
  }
}

// --------------------------------------------------------------------------
// REST API ENDPOINTS
// --------------------------------------------------------------------------

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date(), project: 'Pasar Domba Bagus Rejo Mulyo' });
});

/**
 * GET /api/market
 * Fetches listings sorted by availability status ('Tersedia' first, then 'Terjual'), 
 * and then by created_at timestamp/id descending.
 */
app.get('/api/market', async (req, res) => {
  try {
    // Only query columns that exist in the exact schema
    const queryText = `
      SELECT id, nama_penjual, alamat_penjual, jenis_ras, bobot_kg, harga::text, whatsapp_penjual, foto_url, status, created_at
      FROM penjualan_domba
      ORDER BY 
        CASE WHEN status = 'Tersedia' THEN 1 ELSE 2 END ASC,
        created_at DESC,
        id DESC
    `;
    const result = await pool.query(queryText);
    
    // Map BIGINT text casting back to numbers for JSON compatibility
    const formattedRows = result.rows.map(row => ({
      ...row,
      harga: parseInt(row.harga, 10) || 0
    }));

    res.json(formattedRows);
  } catch (err) {
    console.error("Error fetching market listings:", err.message);
    res.status(500).json({ error: "Failed to fetch marketplace listings", details: err.message });
  }
});

/**
 * POST /api/market
 * Inserts a brand new listing. Validates mandatory fields and stores the photo as Base64 string.
 */
app.post('/api/market', async (req, res) => {
  const { nama_penjual, alamat_penjual, jenis_ras, bobot_kg, harga, whatsapp_penjual, foto_url } = req.body;

  // Validation
  if (!nama_penjual || String(nama_penjual).trim() === '') {
    return res.status(400).json({ error: "Validation Error", message: "Nama Pemilik/Penjual wajib diisi." });
  }
  if (!alamat_penjual || String(alamat_penjual).trim() === '') {
    return res.status(400).json({ error: "Validation Error", message: "Alamat Pemilik/Penjual wajib diisi." });
  }
  if (!jenis_ras || String(jenis_ras).trim() === '') {
    return res.status(400).json({ error: "Validation Error", message: "Jenis ras domba wajib dipilih." });
  }
  if (!whatsapp_penjual || String(whatsapp_penjual).trim() === '') {
    return res.status(400).json({ error: "Validation Error", message: "Nomor WhatsApp wajib diisi." });
  }

  // bobot_kg is an INT column in exact schema, cast float inputs to nearest rounded integer
  const parsedWeight = parseFloat(bobot_kg);
  if (isNaN(parsedWeight) || parsedWeight <= 0) {
    return res.status(400).json({ error: "Validation Error", message: "Bobot domba harus angka valid lebih dari 0." });
  }
  const sanitizedWeight = Math.round(parsedWeight);

  // harga is BIGINT in exact schema
  const sanitizedPriceVal = sanitizePrice(harga);
  if (sanitizedPriceVal <= 0n) {
    return res.status(400).json({ error: "Validation Error", message: "Harga jual domba harus angka valid lebih dari 0." });
  }

  try {
    const insertQuery = `
      INSERT INTO penjualan_domba (
        nama_penjual, 
        alamat_penjual,
        jenis_ras, 
        bobot_kg, 
        harga, 
        whatsapp_penjual, 
        foto_url, 
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'Tersedia')
      RETURNING id, nama_penjual, alamat_penjual, jenis_ras, bobot_kg, harga::text, whatsapp_penjual, foto_url, status, created_at
    `;

    const values = [
      String(nama_penjual).trim(),
      String(alamat_penjual).trim(),
      String(jenis_ras).trim(),
      sanitizedWeight,
      sanitizedPriceVal.toString(), // Store as string for PostgreSQL numeric/bigint bindings
      String(whatsapp_penjual).trim(),
      foto_url || null
    ];

    const result = await pool.query(insertQuery, values);
    
    // Format BigInt back to number for JSON response
    const responseData = {
      ...result.rows[0],
      harga: parseInt(result.rows[0].harga, 10) || 0
    };

    console.log(`Successfully added sheep listing. Seller: ${nama_penjual}, Address: ${alamat_penjual}`);
    res.status(201).json(responseData);
  } catch (err) {
    console.error("Error creating market listing:", err.message);
    res.status(500).json({ error: "Failed to create marketplace listing", details: err.message });
  }
});

/**
 * PUT /api/market/:id/status
 * Sets a specific sheep row status to 'Terjual'.
 */
app.put('/api/market/:id/status', async (req, res) => {
  const { id } = req.params;
  const status = req.body.status || 'Terjual';

  try {
    const updateQuery = `
      UPDATE penjualan_domba
      SET status = $1
      WHERE id = $2
      RETURNING id, nama_penjual, alamat_penjual, jenis_ras, bobot_kg, harga::text, whatsapp_penjual, foto_url, status, created_at
    `;
    const result = await pool.query(updateQuery, [status, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Not Found", message: `Domba dengan ID ${id} tidak ditemukan.` });
    }

    const responseData = {
      ...result.rows[0],
      harga: parseInt(result.rows[0].harga, 10) || 0
    };

    console.log(`Successfully marked sheep ID ${id} status as ${status}`);
    res.json(responseData);
  } catch (err) {
    console.error(`Error updating status for listing ID ${id}:`, err.message);
    res.status(500).json({ error: "Failed to update listing status", details: err.message });
  }
});

/**
 * DELETE /api/market/:id
 * Deletes a specific sheep row completely.
 */
app.delete('/api/market/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const deleteQuery = `
      DELETE FROM penjualan_domba
      WHERE id = $1
      RETURNING id, nama_penjual, alamat_penjual, jenis_ras, bobot_kg, harga::text, whatsapp_penjual, foto_url, status, created_at
    `;
    const result = await pool.query(deleteQuery, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Not Found", message: `Domba dengan ID ${id} tidak ditemukan.` });
    }

    const responseData = {
      ...result.rows[0],
      harga: parseInt(result.rows[0].harga, 10) || 0
    };

    console.log(`Successfully deleted sheep listing ID ${id}`);
    res.json({ message: "Listing successfully deleted", deletedItem: responseData });
  } catch (err) {
    console.error(`Error deleting listing ID ${id}:`, err.message);
    res.status(500).json({ error: "Failed to delete listing", details: err.message });
  }
});

// Start Express Listener (for local development tests)
app.listen(PORT, () => {
  console.log("Pasar Domba Backend server is running on http://localhost:" + PORT);
});

module.exports = app; // For serverless handlers
