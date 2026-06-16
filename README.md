# Expense Tracker v4

แอปพลิเคชันบันทึกและจัดการการเงินส่วนบุคคล รองรับการใช้งานหลายบัญชี พร้อมรายงานและกราฟวิเคราะห์

---

## Project Goal

พัฒนา Personal Finance Tracker ที่ใช้งานง่าย โดยไม่ต้องติดตั้งโปรแกรมเพิ่มเติม — เปิดผ่าน Browser ได้ทันที เป้าหมายหลัก:

- ติดตามรายรับ-รายจ่าย แยกตามบัญชีและหมวดหมู่
- วางแผนงบประมาณและแจ้งเตือนเมื่อใช้จ่ายเกิน
- ดูภาพรวมความมั่งคั่งสุทธิ (Net Worth) รวมพอร์ตการลงทุน
- จัดการตารางชำระบัตรเครดิตไม่ให้พลาดรอบบิล
- สำรอง/กู้คืนข้อมูลได้ด้วยตนเอง (JSON backup)

---

## Tech Stack

| Layer | เทคโนโลยี | หมายเหตุ |
|---|---|---|
| **Frontend** | HTML5 + Vanilla JavaScript (ES6+) | ไม่ใช้ Build Step, โหลดผ่าน CDN |
| **UI Framework** | [TailwindCSS](https://cdn.tailwindcss.com) | CDN — Responsive / Mobile-first |
| **Icons** | [Lucide Icons](https://cdn.jsdelivr.net/npm/lucide@latest) | CDN |
| **Charts** | [Chart.js 4.4](https://cdn.jsdelivr.net/npm/chart.js@4.4.0) | สำหรับกราฟใน Overview |
| **Charts (Reports)** | [Recharts](https://cdn.jsdelivr.net/npm/recharts@2) | ใช้ใน Reports (React-based) |
| **UI Components** | [React 18](https://unpkg.com/react@18) + ReactDOM + Babel Standalone | เฉพาะ Overview และ Reports |
| **Backend** | [Supabase](https://supabase.com) | PostgreSQL + Auth + Row Level Security |
| **Auth** | Google OAuth (ผ่าน Supabase Auth) | ไม่มี username/password |
| **Migration Tool** | Node.js 18+ + [sql.js](https://www.npmjs.com/package/sql.js) | สำหรับย้ายข้อมูลจาก SQLite เท่านั้น |

---

## โครงสร้างไฟล์ (File Structure)

```
Expense Tracker v4/
├── index.html              ← หน้า Login
├── dashboard.html          ← App Shell (Sidebar + Content Area)
├── css/
│   └── styles.css          ← Global CSS + CSS Variables (Theme Colors)
├── js/
│   ├── config.js           ← Supabase URL/Key, Theme, Format helpers
│   ├── auth.js             ← Login / Logout / Session management
│   ├── db.js               ← CRUD ทุก Table + Backup/Restore
│   ├── toast.js            ← Notification/Toast popup
│   └── components/
│       ├── overview.jsx    ← หน้า Overview (React)
│       ├── transactions.js ← หน้า Transactions
│       ├── accounts.js     ← หน้า Accounts
│       ├── investments.js  ← หน้า Investments
│       ├── creditcards.js  ← หน้า Credit Cards
│       ├── budgets.js      ← หน้า Budgets
│       ├── schedules.js    ← หน้า Schedules
│       ├── reports.js      ← หน้า Reports (React + Recharts)
│       └── settings.js     ← หน้า Settings + Data management
├── config/
│   └── SQL Structure.md   ← Schema SQL สำหรับตั้งค่า Supabase
├── scripts/
│   └── migrate-sqlite-to-supabase.mjs  ← Migration tool (Node.js)
└── package.json            ← Dependencies สำหรับ migration script เท่านั้น
```

---

## Main Menu → ไฟล์ที่เรียกใช้

แต่ละเมนูใน Sidebar ของ `dashboard.html` โหลด Component จาก `js/components/` ผ่านฟังก์ชัน `navigate()`

| Menu | ไฟล์ Component | รายละเอียด |
|---|---|---|
| **Overview** | `js/components/overview.jsx` | React Component — สรุปยอด, กราฟรายวัน, รายการล่าสุด |
| **Transactions** | `js/components/transactions.js` | รายการธุรกรรม, ค้นหา, กรอง, เพิ่ม/แก้ไข/ลบ |
| **Accounts** | `js/components/accounts.js` | จัดการบัญชีเงิน, Net Worth, Sync ยอดเงิน |
| **Investments** | `js/components/investments.js` | พอร์ตการลงทุน, ต้นทุน, มูลค่าปัจจุบัน, กำไร/ขาดทุน |
| **Credit Cards** | `js/components/creditcards.js` | วงเงิน, วันตัดรอบ, วันครบกำหนดชำระ |
| **Budgets** | `js/components/budgets.js` | ตั้งงบประมาณ, Progress Bar, แจ้งเตือนเกินงบ |
| **Schedules** | `js/components/schedules.js` | รายการซ้ำอัตโนมัติ (ค่าเช่า, เงินเดือน ฯลฯ) |
| **Reports** | `js/components/reports.js` | กราฟ Pie/Bar — React + Recharts |
| **Settings** | `js/components/settings.js` | โปรไฟล์, ซ่อน/แสดงเมนู, Backup/Restore, ลบข้อมูล |

> **หมายเหตุ:** การมองเห็นแต่ละเมนูสามารถปรับได้ใน Settings เมนู Settings ไม่สามารถซ่อนได้

---

## ค่าคงที่ที่ควรรู้ (Constants & Configuration)

### `js/config.js` — แก้ไขที่นี่ก่อนนำไปใช้งาน

```javascript
const SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co';   // ← URL ของ Supabase Project คุณ
const SUPABASE_ANON_KEY = 'eyJ...';                         // ← Anon Key จาก Supabase Dashboard
```

| ค่า | ตำแหน่ง | รายละเอียด |
|---|---|---|
| `SUPABASE_URL` | `js/config.js` บรรทัด 6 | URL ของ Supabase Project |
| `SUPABASE_ANON_KEY` | `js/config.js` บรรทัด 7 | Public API Key (safe ให้อยู่ใน client) |
| **App Version** | `index.html` บรรทัด 71 | ข้อความ `Expense Tracker v1.0` ในหน้า Login |
| **Backup Format Version** | `js/db.js` บรรทัด 738 | เลข `"3.5"` ใช้ตรวจสอบความเข้ากันได้ของไฟล์ Backup |
| Theme Colors | `css/styles.css` | CSS Variables `--color-primary`, `--color-success` ฯลฯ |

> **Default Password:** ไม่มี — แอปใช้ **Google OAuth เท่านั้น** ผ่าน Supabase Auth ไม่มีการตั้งรหัสผ่าน

---

## Setup

1. สร้าง Supabase Project และรัน SQL จาก `config/SQL Structure.md` ใน SQL Editor
2. แก้ไข `js/config.js` ใส่ค่า Supabase ของตัวเอง
3. เปิดโฟลเดอร์โปรเจกต์ด้วย `Live Server` จาก root ของ repo

### Local

- แอปจะตรวจ `localhost` / `127.0.0.1` อัตโนมัติและเข้าโหมด local
- ถ้าต้องการใช้ Supabase แยกสำหรับ local ให้ตั้งค่าผ่าน DevTools Console:

```javascript
localStorage.setItem('expense_tracker_supabase_url', 'https://YOUR_LOCAL_PROJECT.supabase.co');
localStorage.setItem('expense_tracker_supabase_anon_key', 'YOUR_LOCAL_ANON_KEY');
```

- เพิ่ม Redirect URL สำหรับ local ใน Supabase Auth เช่น:
  - `http://localhost:5500/index.html`
  - `http://localhost:5500/dashboard.html`

### GitHub / Vercel

- โค้ดนี้เป็น static site ไม่มี build step
- Push ขึ้น GitHub แล้ว import repo ไป Vercel ได้ทันที
- `vercel.json` ช่วยให้ deploy แบบ static ชัดเจน
- เพิ่ม Redirect URL ของ production ใน Supabase Auth เช่น:
  - `https://your-project.vercel.app/index.html`
  - `https://your-project.vercel.app/dashboard.html`

### Migration จาก SQLite (ถ้ามีข้อมูลเก่า)

```bash
npm install
npm run migrate:sqlite -- \
  --sqlite "C:\path\to\old.db" \
  --supabase-url "https://YOUR_PROJECT.supabase.co" \
  --service-role-key "YOUR_SERVICE_ROLE_KEY" \
  --user-id "YOUR_AUTH_USER_UUID"
```

> ใช้ `service role key` เฉพาะใน migration script เท่านั้น ห้ามใส่ในโค้ด client

---

## Database Schema

| Table | คำอธิบาย |
|---|---|
| `profiles` | ข้อมูลผู้ใช้ (ชื่อ, Avatar, สกุลเงิน) |
| `accounts` | บัญชีเงิน (เงินสด, ธนาคาร, บัตรเครดิต, ออมทรัพย์, ลงทุน) |
| `categories` | หมวดหมู่รายรับ/รายจ่าย (รองรับ Sub-category) |
| `transactions` | ธุรกรรมทั้งหมด (รายรับ, รายจ่าย, โอน) |
| `budgets` | งบประมาณแยกตามหมวดหมู่และรอบเวลา |
| `credit_cards` | รายละเอียดบัตรเครดิต (วงเงิน, รอบบิล, วันชำระ) |
| `investments` | พอร์ตการลงทุน (ต้นทุน, มูลค่าปัจจุบัน, รอบปันผล) |
| `schedules` | รายการซ้ำอัตโนมัติ (Daily/Weekly/Monthly/Yearly) |

ทุก Table ใช้ **Row Level Security (RLS)** — ผู้ใช้เห็นเฉพาะข้อมูลของตัวเอง
