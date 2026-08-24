# IMMENSE — WhatsApp Business Onboarding & Document Vault Portal

Production-ready enterprise internal web portal built for **Immense Air Pvt Ltd (IMMENSE Smart Business Communication Solutions)** to securely manage WhatsApp Business onboarding lifecycles, client details, encrypted platform secrets, corporate employee permissions, private KYC/GST compliance vaults, and immutable audit logs.

---

## 🚀 Key Features

1. **Enterprise Branding & Modern SaaS Design**
   - Official Immense corporate identity with Deep Navy (`#071A3D`), Primary Blue (`#1677FF`), and clean card architecture.
   - Fully responsive on desktop, tablet, and mobile with card fallbacks for tabular data.

2. **Supabase Authentication & Corporate Domain Enforcement**
   - Restricts registration and sign-in strictly to `@immenseair.com` (configurable via `VITE_ALLOWED_EMAIL_DOMAIN`).
   - **Dual-layer enforcement**: Validated on the frontend + Enforced server-side via PostgreSQL `BEFORE INSERT` trigger on `auth.users`. Non-corporate emails (e.g. `gmail.com`, `yahoo.com`) are rejected at the database level.
   - Zero exposure of service-role keys — uses only the public anon key.

3. **Role-Based Access Control (RBAC) via Supabase RLS**
   - **Super Admin**: Full CRUD on records, documents, staff profiles, and audit logs.
   - **Manager**: Manage onboarding records, upload/download documents, assign employees.
   - **Employee**: Scoped strictly to assigned onboarding records and documents.
   - **Viewer**: Read-only access to assigned records.
   - All permissions enforced at the database level using PostgreSQL Row Level Security (RLS).

4. **Secret Vault & Credential Access Auditing**
   - WhatsApp / Meta Business credentials stored encrypted via `pgcrypto` AES-256 server-side.
   - Passwords hidden by default. Revealing or copying credentials calls a secure database RPC that immediately writes an immutable compliance event to `audit_logs`.

5. **Private Document Vault & GST Search**
   - Private Supabase Storage bucket (`onboarding-documents`) with MIME-type allowlist (PDF, JPG, PNG, DOCX, XLSX).
   - Temporary expiring signed URLs generated for previews and downloads.
   - **Global Compliance Search**: Instantly find any client’s GST certificate (e.g., search `"Prestige"` → view GST / PAN / KYC → 1-click signed download).

6. **Employee Exit Protection (Zero Data Loss Guarantee)**
   - Deactivating an employee immediately blocks their portal login.
   - Preserves all client records, vaulted documents, and audit logs.
   - 1-click reassignment wizard to transfer onboarding records to active staff.

7. **Excel Import & Export**
   - Bulk import onboarding records from `.xlsx` files with client-side validation and duplicate detection preview.
   - Safe data export with credentials excluded by default.

---

## 🛠️ Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS v4, Lucide React
- **State & Routing**: TanStack React Query v5, React Router DOM v6
- **Forms & Validation**: React Hook Form, Zod
- **Data & Charts**: Recharts, SheetJS (xlsx), date-fns
- **Backend & Storage**: Supabase (Auth, PostgreSQL, Private Storage, Row Level Security, RPC functions)

---

## 📋 Setup & Deployment Guide

### 1. Database Setup (Supabase)

1. Open your [Supabase Project Dashboard](https://supabase.com/dashboard).
2. Navigate to **SQL Editor** → **New Query**.
3. Copy and run the entire contents of [`supabase/migrations/001_initial_schema.sql`](./supabase/migrations/001_initial_schema.sql).
4. (Optional) Set your server-side database encryption key for credential encryption:
   ```sql
   ALTER DATABASE postgres SET app.encryption_key = 'your-secure-256-bit-key-here';
   ```

### 2. Configure Environment Variables

Create a `.env` file in the project root based on `.env.example`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-publishable-key
VITE_ALLOWED_EMAIL_DOMAIN=immenseair.com
```

> ⚠️ **SECURITY WARNING**: Never put your Supabase `service_role` key in frontend `.env` files.

### 3. Install & Run Locally

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

### 4. Create First Super Admin User

1. Navigate to the portal login page and register with your `@immenseair.com` email.
2. In your Supabase SQL Editor, run:
   ```sql
   UPDATE public.profiles
   SET role = 'super_admin'
   WHERE corporate_email = 'your-email@immenseair.com';
   ```
3. Refresh the portal — you now have full Super Admin privileges to manage staff, records, and vault documents.

---

## 🔒 Security Architecture Highlights

| Feature | Implementation | Enforcement Level |
|---|---|---|
| Domain Gate | Database trigger on `auth.users` | Server-Side (PostgreSQL) |
| Data Access | 15 Granular Row Level Security Policies | Server-Side (PostgreSQL) |
| Documents | Private Storage Bucket + Expiring Signed URLs | Server-Side (Supabase Storage API) |
| Credentials | Server-side RPC + `pgcrypto` AES encryption | Server-Side (PostgreSQL) |
| Audit Trail | Append-only `audit_logs` table (no update/delete) | Server-Side (PostgreSQL) |
| Front-end Safety | Anon public key only; zero secrets bundled | Build & Client Layer |

---

© Immense Air Pvt Ltd. Confidential & Proprietary.
