# Jadwal Shift ESC

PWA jadwal shift karyawan — realtime lewat Firebase Firestore, di-hosting pakai Node.js/Express, bisa di-"Add to Home Screen" dari Safari dan tampil full screen.

## 1. Setup Firebase

1. Buka [Firebase Console](https://console.firebase.google.com) → buat project baru (boleh pakai nama apa saja, misal `esc-jadwal`).
2. Di sidebar, buka **Build → Firestore Database** → **Create database** → pilih mode **production** → pilih lokasi server terdekat (misal `asia-southeast2`).
3. Buka tab **Rules** di Firestore, dan untuk versi awal tanpa login, pakai rule berikut (semua orang yang tahu link bisa baca & tulis):

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /{document=**} {
         allow read, write: if true;
       }
     }
   }
   ```

   ⚠️ Ini sengaja terbuka karena belum ada login. Kalau nanti mau ditambah proteksi (PIN atau login), rule ini yang pertama perlu diubah.

4. Balik ke **Project Overview** → klik ikon **Web (`</>`)** → daftarkan app → copy config yang muncul (`apiKey`, `authDomain`, dst).
5. Tempel config itu ke `public/firebase-config.js`, gantikan nilai `GANTI_DENGAN_...`.

## 2. Jalankan lokal

```bash
npm install
npm start
```

Buka `http://localhost:3000`.

## 3. Deploy (hosting Node.js)

Karena ini server Express biasa, bisa di-deploy ke layanan yang mendukung Node.js, misalnya:

- **Railway.app** — connect repo, otomatis detect `npm start`
- **Render.com** — buat Web Service baru, build command `npm install`, start command `npm start`
- **Fly.io** / **Vercel** (dengan adapter Node) juga bisa

Pastikan environment `PORT` dibiarkan otomatis (Express sudah baca `process.env.PORT`).

## 4. Add to Home Screen (Safari, iPhone/iPad)

1. Buka URL hasil deploy di Safari.
2. Tap ikon **Share** (kotak dengan panah ke atas).
3. Pilih **Add to Home Screen**.
4. Buka dari ikon di home screen — akan tampil full screen tanpa address bar.

## Struktur project

```
esc-jadwal/
├── server.js              # Express static server
├── package.json
└── public/
    ├── index.html          # Shell app (tab Jadwal / Karyawan / Auto-Assign)
    ├── styles.css          # Tema "liquid glass" hijau tua + putih
    ├── app.js              # Logic Firestore, render tabel, auto-assign, export PDF
    ├── firebase-config.js  # ISI dengan config Firebase kamu sendiri
    ├── manifest.json        # PWA manifest
    ├── sw.js                # Service worker (offline app-shell)
    └── icons/                # Ikon PWA (dari logo ESC)
```

## Cara pakai fitur Auto-Assign

1. Buka tab **Auto-Assign**.
2. Pilih nama karyawan.
3. Centang hari-hari dia **tidak bisa** kerja minggu itu.
4. Klik **Lihat preview** — di bawah akan muncul simulasi penempatan (nama yang baru ditambahkan ditandai warna solid).
5. Kalau sudah sesuai, klik **Terapkan ke jadwal** untuk menyimpan ke Firestore.

Logika penempatan saat ini: karyawan otomatis ditaruh di **setiap hari yang tidak dicentang**, masuk ke shift (1 atau 2) yang jumlah orangnya paling sedikit di hari itu. Kalau mau logikanya diubah (misal dibatasi maksimal berapa hari per minggu, atau mempertimbangkan siapa saja yang sudah ada di shift itu), tinggal ubah fungsi `previewBtn` click-handler di `app.js`.

## Catatan

- Belum ada sistem login — siapa pun yang punya link bisa lihat & edit jadwal. Cocok untuk versi awal/internal tim kecil.
- Data karyawan yang dinonaktifkan (bukan dihapus) tetap muncul di riwayat jadwal lama, tapi tidak muncul lagi di dropdown pengisian shift baru.
