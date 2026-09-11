# ClipStudio — Panduan Setup dari HP

Kode ini asli (bukan AI builder), jadi kamu yang pegang penuh. Semua langkah di bawah bisa dilakukan lewat browser HP.

## 1. Buat 3 akun gratis (kalau belum ada)
- **github.com** — tempat nyimpen kode
- **vercel.com** — daftar pakai akun GitHub, buat hosting websitenya
- **supabase.com** — database + login user

## 2. Upload kode ke GitHub
1. Buka github.com dari browser HP, login.
2. Bikin repository baru, nama bebas (misal `clipstudio`).
3. Upload semua file di folder ini ke repo itu (GitHub punya tombol "Add file" > "Upload files", bisa dari HP).

## 3. Setup Supabase
1. Buat project baru di supabase.com (gratis).
2. Buka **SQL Editor**, jalankan skema tabel yang ada di komentar file `lib/supabaseClient.js` (copy-paste semua query `create table` dan `create policy`).
3. Buka **Storage**, buat bucket baru namanya `videos`, set jadi **public**.
4. Buka **Project Settings > API**, salin `Project URL` dan `anon public key` dan `service_role key` — ini dipakai di langkah 5.

## 4. Daftar API key layanan lain
- **AssemblyAI** (assemblyai.com) — buat transkripsi. Daftar gratis, salin API key dari dashboard.
- **Cloudinary** (cloudinary.com) — buat reframe video + subtitle burn. Daftar gratis, salin Cloud Name, API Key, API Secret dari dashboard.
- **Anthropic** (console.anthropic.com) — buat deteksi momen viral & bikin hook/judul. Daftar, isi saldo kecil (bayar sesuai pemakaian, murah untuk teks), salin API key.

## 5. Deploy ke Vercel
1. Buka vercel.com, login pakai akun GitHub.
2. "Add New Project" > pilih repo `clipstudio` yang tadi diupload.
3. Sebelum klik Deploy, buka bagian **Environment Variables**, isi semua yang ada di file `.env.example` dengan key yang sudah kamu kumpulkan di langkah 3-4.
4. Klik **Deploy**. Tunggu beberapa menit, nanti dapat link `namakamu.vercel.app` — itu website ClipStudio kamu, sudah live dan bisa dibuka dari HP mana saja.

## Catatan Jujur (biar nggak kejadian kayak sebelumnya)
- **Link YouTube** cuma buat pratinjau (judul/thumbnail). Video tetap wajib di-upload manual — sistem ini TIDAK mengunduh video dari YouTube, karena itu melanggar Ketentuan Layanan YouTube.
- **Auto-frame wajah**: kode ini pakai `gravity:auto` dari Cloudinary, yaitu content-aware cropping — bukan face-tracking dinamis sungguhan per-frame. Untuk itu betulan diimplementasikan, aku sudah tandai di kode (`render-clip/route.js`) bagian mana yang perlu diganti dengan provider face-tracking asli (misalnya lewat Replicate) kalau nanti mau ditingkatkan.
- Setiap fitur di sini benar-benar memanggil API asli (AssemblyAI, Cloudinary, Anthropic) — bukan simulasi. Kalau API key belum diisi di Vercel, fiturnya akan gagal dengan pesan error yang jelas, bukan pura-pura berhasil.

## Kalau ada error nanti
Kirim screenshot pesan errornya (dari browser atau dari Vercel > Deployments > Logs) ke Claude, nanti dibantu cari penyebabnya.
