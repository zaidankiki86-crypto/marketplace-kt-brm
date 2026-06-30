/**
 * server.js - Upgraded Backend Router for Pasar Domba Bagus Rejo Mulyo
 * Stack: Node.js + Express + @supabase/supabase-js Client
 * Designed for deployment on Vercel Serverless Functions.
 */

const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn("WARNING: SUPABASE_URL or SUPABASE_KEY environment variables are not defined.");
}

const supabase = createClient(supabaseUrl || '', supabaseKey || '');

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
      throw new Error("Supabase credentials missing on the server.");
    }

    // Try selecting all active columns
    let selectFields = 'id, nama_penjual, alamat_penjual, jenis_ras, bobot_kg, harga, whatsapp_penjual, foto_url, status, created_at, kondisi_kesehatan, detail_kesehatan, status_harga, sudah_poel';
    let { data, error } = await supabase
      .from('penjualan_domba')
      .select(selectFields);

    // Fallback if sudah_poel column doesn't exist yet
    if (error && error.message && error.message.includes('sudah_poel')) {
      console.log("sudah_poel column not found, falling back...");
      selectFields = 'id, nama_penjual, alamat_penjual, jenis_ras, bobot_kg, harga, whatsapp_penjual, foto_url, status, created_at, kondisi_kesehatan, detail_kesehatan, status_harga';
      const retryResult = await supabase
        .from('penjualan_domba')
        .select(selectFields);
      data = retryResult.data;
      error = retryResult.error;
    }

    // Fallback if status_harga column doesn't exist yet
    if (error && error.message && error.message.includes('status_harga')) {
      console.log("status_harga column not found, falling back...");
      selectFields = 'id, nama_penjual, alamat_penjual, jenis_ras, bobot_kg, harga, whatsapp_penjual, foto_url, status, created_at, kondisi_kesehatan, detail_kesehatan';
      const retryResult = await supabase
        .from('penjualan_domba')
        .select(selectFields);
      data = retryResult.data;
      error = retryResult.error;
    }

    // Fallback if health columns don't exist yet
    if (error && error.message && (error.message.includes('kondisi_kesehatan') || error.message.includes('detail_kesehatan'))) {
      console.log("Health condition columns not found, falling back...");
      selectFields = 'id, nama_penjual, alamat_penjual, jenis_ras, bobot_kg, harga, whatsapp_penjual, foto_url, status, created_at';
      const retryResult = await supabase
        .from('penjualan_domba')
        .select(selectFields);
      data = retryResult.data;
      error = retryResult.error;
    }

    // Fallback if created_at does not exist yet
    if (error && error.message && error.message.includes('created_at')) {
      console.log("created_at column not found, falling back...");
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

    if (data && Array.isArray(data)) {
      data.sort((a, b) => {
        if (a.status === 'Tersedia' && b.status !== 'Tersedia') return -1;
        if (a.status !== 'Tersedia' && b.status === 'Tersedia') return 1;

        if (a.created_at && b.created_at) {
          return new Date(b.created_at) - new Date(a.created_at);
        }
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
      throw new Error("Supabase credentials missing on the server.");
    }

    const { 
      nama_penjual, 
      alamat_penjual, 
      jenis_ras, 
      bobot_kg, 
      harga, 
      whatsapp_penjual, 
      foto_url,
      kondisi_kesehatan,
      detail_kesehatan,
      status_harga,
      sudah_poel
    } = req.body;

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

    const sanitizedKondisi = kondisi_kesehatan || 'Sehat';
    let sanitizedDetail = '';
    if (sanitizedKondisi === 'Sakit' || sanitizedKondisi === 'Cacat') {
      if (!detail_kesehatan || String(detail_kesehatan).trim() === '') {
        return res.status(400).json({ success: false, error: "Detail penjelasan kondisi wajib diisi." });
      }
      sanitizedDetail = String(detail_kesehatan).trim();
    }

    const parsedWeight = parseFloat(bobot_kg);
    if (isNaN(parsedWeight) || parsedWeight <= 0) {
      return res.status(400).json({ success: false, error: "Bobot domba harus angka valid lebih dari 0." });
    }
    const sanitizedWeight = Math.round(parsedWeight);

    const parsedPrice = parseInt(harga, 10);
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      return res.status(400).json({ success: false, error: "Harga jual domba harus angka valid lebih dari 0." });
    }

    const insertPayload = {
      nama_penjual: String(nama_penjual).trim(),
      alamat_penjual: String(alamat_penjual).trim(),
      jenis_ras: String(jenis_ras).trim(),
      bobot_kg: sanitizedWeight,
      harga: parsedPrice,
      whatsapp_penjual: String(whatsapp_penjual).trim(),
      foto_url: foto_url || null,
      status: 'Tersedia',
      kondisi_kesehatan: sanitizedKondisi,
      detail_kesehatan: sanitizedDetail,
      status_harga: status_harga || 'Harga Pas',
      sudah_poel: sudah_poel || 'Belum Poel'
    };

    let result = await supabase
      .from('penjualan_domba')
      .insert([insertPayload])
      .select();

    // Fallback if sudah_poel column is not migrated yet
    if (result.error && result.error.message && result.error.message.includes('sudah_poel')) {
      console.warn("sudah_poel column not found. Retrying insertion without it...");
      const fallbackPayload = { ...insertPayload };
      delete fallbackPayload.sudah_poel;
      
      result = await supabase
        .from('penjualan_domba')
        .insert([fallbackPayload])
        .select();
    }

    // Fallback if status_harga column is not migrated yet
    if (result.error && result.error.message && result.error.message.includes('status_harga')) {
      console.warn("status_harga column not found. Retrying insertion without it...");
      const fallbackPayload = { ...insertPayload };
      delete fallbackPayload.status_harga;
      delete fallbackPayload.sudah_poel;
      
      result = await supabase
        .from('penjualan_domba')
        .insert([fallbackPayload])
        .select();
    }

    if (result.error) {
      throw new Error(result.error.message);
    }

    res.status(201).json(result.data[0]);
  } catch (err) {
    console.error("POST /api/market error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PUT /api/market/:id/status
 * Sets status to 'Terjual'
 */
app.put('/api/market/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const status = req.body.status || 'Terjual';

    const { data, error } = await supabase
      .from('penjualan_domba')
      .update({ status: status })
      .eq('id', id)
      .select();

    if (error) throw new Error(error.message);
    if (!data || data.length === 0) {
      return res.status(404).json({ success: false, error: "Domba tidak ditemukan." });
    }
    res.json(data[0]);
  } catch (err) {
    console.error("PUT /api/market status error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/market/:id
 * Deletes a listing
 */
app.delete('/api/market/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('penjualan_domba')
      .delete()
      .eq('id', id)
      .select();

    if (error) throw new Error(error.message);
    if (!data || data.length === 0) {
      return res.status(404).json({ success: false, error: "Domba tidak ditemukan." });
    }
    res.json({ success: true, deletedItem: data[0] });
  } catch (err) {
    console.error("DELETE /api/market error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log("Server running on http://localhost:" + PORT);
});

module.exports = app;
