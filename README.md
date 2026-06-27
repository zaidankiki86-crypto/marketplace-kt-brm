# Pasar Domba Bagus Rejo Mulyo

**Pasar Domba Bagus Rejo Mulyo** is a brand-new, standalone community-driven open marketplace application. It allows members of the "Bagus Rejo Mulyo" livestock group to list their sheep for sale, share contact details, and connect directly with buyers through WhatsApp.

The application uses a serverless backend deployed on Vercel (communicating with the existing Supabase database instance) and a frontend hosted directly on Blogger.

---

## Project Structure

```text
pasar-domba-bagusrejo-mulyo/
├── server.js                 # Express.js REST API router
├── pasardomba-template.xml   # Blogger Theme XML layout (Frontend SPA)
├── package.json              # Project dependencies & start scripts
├── vercel.json               # Vercel serverless configurations
└── README.md                 # Deployment & setup documentation
```

---

## Prerequisites

- **Node.js**: Version 18.x or newer is recommended.
- **Supabase / PostgreSQL Database**: Ensure the `penjualan_domba` table exists in your database with the following schema:
  
  ```sql
  CREATE TABLE penjualan_domba (
      id SERIAL PRIMARY KEY,
      nama_penjual VARCHAR(255) NOT NULL,
      alamat_penjual TEXT NOT NULL,
      jenis_ras VARCHAR(100) NOT NULL,
      bobot_kg NUMERIC NOT NULL,
      harga NUMERIC NOT NULL,
      whatsapp_penjual VARCHAR(50) NOT NULL,
      foto_url TEXT,
      status VARCHAR(50) DEFAULT 'Tersedia',
      tanggal_posting DATE DEFAULT CURRENT_DATE
  );
  CREATE INDEX idx_penjualan_status ON penjualan_domba(status);
  ```

---

## Local Development Setup

### 1. Install Dependencies
Open a terminal in the project directory (`pasar-domba-bagusrejo-mulyo`) and install the packages:
```bash
npm install
```

### 2. Set Up Environment Variables
Create a local environment variable or `.env` configuration mapping the database connection string.
- Environment Key: `DATABASE_URL`
- Format: `postgresql://postgres:[password]@db.[supabase-ref].supabase.co:5432/postgres`

On Windows PowerShell:
```powershell
$env:DATABASE_URL="your-supabase-connection-string"
```

On Linux/macOS:
```bash
export DATABASE_URL="your-supabase-connection-string"
```

### 3. Run the Backend Server
Start the local Express server:
```bash
npm run dev
```
The server will boot on `http://localhost:3000`.

### 4. Test the Frontend Locally
1. Open `pasardomba-template.xml` in your browser.
2. The frontend will automatically detect that you are running on `localhost` or `127.0.0.1` and direct API calls to your local server at `http://localhost:3000`.
3. Try opening the splash welcome screen, clicking the CTA, adding listings with addresses, marking items as sold, and deleting sheep listings.

---

## Vercel Backend Deployment

### 1. Deploy the Server
Initialize the project in Vercel. You can use Vercel's CLI or connect your Git repository.
For Vercel Serverless hosting, ensure `vercel.json` is configured in the root of the project to route endpoints to `server.js`:

```json
{
  "version": 2,
  "builds": [
    {
      "src": "server.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "server.js"
    }
  ]
}
```

### 2. Define Environment Variable
Configure `DATABASE_URL` in your Vercel Project Dashboard under **Settings > Environment Variables**.

---

## Blogger Frontend Deployment

### 1. Link Your Backend API URL
1. Copy your deployed Vercel production URL (e.g. `https://your-project.vercel.app`).
2. Open `pasardomba-template.xml`.
3. Locate line `354-356` containing:
   ```javascript
   const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
     ? 'http://localhost:3000'
     : 'https://pasar-domba-backend.vercel.app'; // REPLACE_WITH_YOUR_VERCEL_URL
   ```
4. Replace `'https://pasar-domba-backend.vercel.app'` with your actual Vercel deployment URL.
5. Save the file.

### 2. Install on Blogger
1. Log into your Google Blogger dashboard.
2. Select or create a new blog.
3. Go to the **Theme** section in the left-hand menu.
4. Click the dropdown arrow next to the **Customize** button and select **Edit HTML**.
5. Copy the entire contents of `pasardomba-template.xml` and paste it inside the Blogger editor, completely replacing the default code.
6. Click **Save** (floppy disk icon in the top right).
7. Visit your Blog domain. You will see the beautiful **Pasar Domba Bagus Rejo Mulyo** marketplace ready for use!
