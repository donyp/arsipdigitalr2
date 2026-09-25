# Setup Moderator Role - Action Required

## ⚠️ IMPORTANT: Run this SQL in Supabase

The system now supports 3 user roles:
- **super_admin** - Full system access, can access main dashboard
- **moderator** - Partial system access, can access main dashboard  
- **admin_zona** - Zone management only, redirected to dashboard-admin-zona.html

## Database Update Required

To enable the `moderator` role, you **MUST** run this SQL in Supabase:

### Steps:
1. Open https://app.supabase.com
2. Select your project (ccfwwsmpjhxqeyxgapeb)
3. Go to **SQL Editor** in the left sidebar
4. Click **New query** (or **+** button)
5. Paste the SQL below
6. Click **Run**

### SQL Command:
```sql
ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('super_admin', 'moderator', 'admin_zona'));
```

## What Changed

### Backend (backend/server.js)
- Fixed PUT /api/users/:id - removed non-existent `contact_email` column reference
- Fixed POST /api/users - removed non-existent `contact_email` column reference
- Added error logging for PUT endpoint

### Frontend (users.html)
- Added `moderator` role to user creation/edit form dropdown
- Updated role display to show all 3 role types
- Updated stats to count moderator users

### Frontend (dashboard.html)  
- Added role check: only `moderator` and `super_admin` can access main dashboard
- `admin_zona` users redirected to dashboard-admin-zona.html (as before)

## Testing

After running the SQL, test with:

### Super Admin Account
- Email: `admin@arksipainka.com`
- Password: `Admin@123456`
- Role: `super_admin`
- Can access: dashboard.html, users.html, all management pages

### Moderator Account  
- Email: `moderator@arksipainka.com`
- Password: `null123`
- Role: `admin_zona` (needs to be changed to `moderator` after SQL update)
- Can access: dashboard.html

To change moderator account role:
1. Login as super_admin
2. Go to http://localhost:3000/users.html
3. Edit moderator@arksipainka.com user
4. Change role from "Admin Zona" to "Moderator"
5. Click Save

## Database Schema

**users** table now accepts roles:
```sql
role TEXT NOT NULL CHECK (role IN ('super_admin', 'moderator', 'admin_zona'))
```
