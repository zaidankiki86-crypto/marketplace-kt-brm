/**
 * server.js - Dedicated Bulletproof Backend Router for Pasar Domba Bagus Rejo Mulyo
 * Stack: Node.js + Express + @supabase/supabase-js Client
 * Designed for deployment on Vercel Serverless Functions.
 */

const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for frontend integration
app.use(cors());

// Set request size limits to 50MB to accommodate large Base64 high-resolution photo uploads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Retrieve standard Supabase credentials
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn("WARNING: SUPABASE_URL or SUPABASE_KEY environment variables are not defined.");
}

// Initialize Supabase Client (HTTP-based connection, serverless-safe)
const supabase = createClient(supabaseUrl || '', supabaseKey || '');

// --------------------------------------------------------------------------
// REST API ENDPOINTS
// --------------------------------------------------------------------------

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date(), 
    project: 'Pasar Domba Bagus Rejo Mulyo',
    hasCredentials: !!(supabaseUrl && supabaseKey)
  });
});

/**
 * GET /api/market
 * Fetches listings sorted by availability status ('Tersedia' first, then 'Terjual'), 
 * and then by created_at timestamp descending.
 */
app.get('/api/market', async (req, res) => {
  try {
    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Supabase credentials missing on the server. Please define SUPABASE_URL and SUPABASE_KEY environment variables.");
    }

    // Try selecting all active columns, including created_at if it exists
    let selectFields = 'id, nama_penjual, alamat_penjual, jenis_ras, bobot_kg, harga, whatsapp_penjual, foto_url, status, created_at';
    let { data, error } = await supabase
      .from('penjualan_domba')
      .select(selectFields);

    // Fallback if created_at does not exist in the database schema yet
    if (error && error.message && error.message.includes('created_at')) {
      console.log("created_at column not found, falling back to schema without created_at");
      selectFields = 'id, nama_penjual, alamat_penjual, jenis_ras, bobot_kg, harga, whatsapp_penjual, foto_url, status';
      const retryResult = await supabase
        .from('penjualan_domba')
        .select(selectFields);
      data = retryResult.data;
      error = retryResult.error;
    }

    if (error) {
      throw new Error(error.message);
    }

    // Safe sorting in Javascript: 'Tersedia' items first, then newest listings
    if (data && Array.isArray(data)) {
      data.sort((a, b) => {
        // 1. Sort by status availability: 'Tersedia' is placed first
        if (a.status === 'Tersedia' && b.status !== 'Tersedia') return -1;
        if (a.status !== 'Tersedia' && b.status === 'Tersedia') return 1;

        // 2. Sort by created_at timestamp if present
        if (a.created_at && b.created_at) {
          return new Date(b.created_at) - new Date(a.created_at);
        }

        // 3. Fallback sorting by numerical id descending
        return b.id - a.id;
      });
    }

    res.json(data || []);
  } catch (err) {
    console.error("GET /api/market error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/market
 * Inserts a brand new listing. Validates mandatory fields and stores the photo as Base64 string.
 */
app.post('/api/market', async (req, res) => {
  try {
    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Supabase credentials missing on the server. Please define SUPABASE_URL and SUPABASE_KEY environment variables.");
    }

    const { nama_penjual, alamat_penjual, jenis_ras, bobot_kg, harga, whatsapp_penjual, foto_url } = req.body;

    // Validation checks
    if (!nama_penjual || String(nama_penjual).trim() === '') {
      return res.status(400).json({ success: false, error: "Nama Pemilik/Penjual wajib diisi." });
    }
    if (!alamat_penjual || String(alamat_penjual).trim() === '') {
      return res.status(400).json({ success: false, error: "Alamat Pemilik/Penjual wajib diisi." });
    }
    if (!jenis_ras || String(jenis_ras).trim() === '') {
      return res.status(400).json({ success: false, error: "Jenis ras domba wajib dipilih." });
    }
    if (!whatsapp_penjual || String(whatsapp_penjual).trim() === '') {
      return res.status(400).json({ success: false, error: "Nomor WhatsApp wajib diisi." });
    }

    const parsedWeight = parseFloat(bobot_kg);
    if (isNaN(parsedWeight) || parsedWeight <= 0) {
      return res.status(400).json({ success: false, error: "Bobot domba harus angka valid lebih dari 0." });
    }
    // Convert to rounded integer if column type is INT
    const sanitizedWeight = Math.round(parsedWeight);

    const parsedPrice = parseInt(harga, 10);
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      return res.status(400).json({ success: false, error: "Harga jual domba harus angka valid lebih dari 0." });
    }

    // Insert only the precise active columns (ABSOLUTELY NO tag_id reference)
    const { data, error } = await supabase
      .from('penjualan_domba')
      .insert([
        {
          nama_penjual: String(nama_penjual).trim(),
          alamat_penjual: String(alamat_penjual).trim(),
          jenis_ras: String(jenis_ras).trim(),
          bobot_kg: sanitizedWeight,
          harga: parsedPrice,
          whatsapp_penjual: String(whatsapp_penjual).trim(),
          foto_url: foto_url || null,
          status: 'Tersedia'
        }
      ])
      .select();

    if (error) {
      throw new Error(error.message);
    }

    console.log(`Successfully added sheep listing. Seller: ${nama_penjual}, Address: ${alamat_penjual}`);
    res.status(201).json(data[0]);
  } catch (err) {
    console.error("POST /api/market error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PUT /api/market/:id/status
 * Sets a specific sheep row status to 'Terjual'.
 */
app.put('/api/market/:id/status', async (req, res) => {
  try {
    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Supabase credentials missing on the server. Please define SUPABASE_URL and SUPABASE_KEY environment variables.");
    }

    const { id } = req.params;
    const status = req.body.status || 'Terjual';

    const { data, error } = await supabase
      .from('penjualan_domba')
      .update({ status: status })
      .eq('id', id)
      .select();

    if (error) {
      throw new Error(error.message);
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ success: false, error: `Domba dengan ID ${id} tidak ditemukan.` });
    }

    console.log(`Successfully marked sheep ID ${id} status as ${status}`);
    res.json(data[0]);
  } catch (err) {
    console.error("PUT /api/market status error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/market/:id
 * Deletes a specific sheep row completely.
 */
app.delete('/api/market/:id', async (req, res) => {
  try {
    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Supabase credentials missing on the server. Please define SUPABASE_URL and SUPABASE_KEY environment variables.");
    }

    const { id } = req.params;

    const { data, error } = await supabase
      .from('penjualan_domba')
      .delete()
      .eq('id', id)
      .select();

    if (error) {
      throw new Error(error.message);
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ success: false, error: `Domba dengan ID ${id} tidak ditemukan.` });
    }

    console.log(`Successfully deleted sheep listing ID ${id}`);
    res.json({ success: true, message: "Listing successfully deleted", deletedItem: data[0] });
  } catch (err) {
    console.error("DELETE /api/market error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Start Express Listener (for local development tests)
app.listen(PORT, () => {
  console.log("Pasar Domba Backend server is running on http://localhost:" + PORT);
});

module.exports = app; // For serverless handlers
