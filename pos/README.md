# UGs Kitchen POS

Walk-in point of sale for UGs Kitchen. It is a separate Next.js app that shares the online ordering app's Supabase database. It never writes to the online app's tables. It only reads `branches`, `staff`, `categories`, `menu_items`, and `orders` (orders are read for the combined sales view).

## Walk-in flow

1. **Cashier** (`/cashier`): picks items and takes payment by cash or MoMo prompt (Paystack). The API still supports a MoMo reference or card if the shop needs them later. This prints a **food ticket** with a daily number (`W-001`…) and a QR code.
2. **Server** (`/server`): scans the QR or types the number, then serves all or part of the order. When the order is fully served, the **receipt** prints. The server keeps the paper ticket. If someone presents a ticket that was already used or voided, the server sees a red-flag warning.
3. **Shift** (`/shift`):
   - Cashiers open a shift with a cash float and close it with a cash count. This prints a Z-report showing expected cash, counted cash, and the variance.
   - Servers see a report of what they served, to check against the tickets they collected.
4. **Manager** (`/manager`):
   - Sales for the day: walk-in and **online** combined, with totals by payment method and per-staff breakdowns.
   - Voids: always need a manager PIN, only before any food is served, and are logged.
   - POS staff logins (`/manager/staff`).

## Setup

1. Run `../migrations/pos_001_walkin.sql` in the Supabase SQL editor. It only adds new `pos_*` objects and is safe to re-run.
2. Create the owner's **admin** login once in the SQL editor. The owner must already exist in the online app's staff list:
   ```sql
   select pos_set_staff('<staff.id>', '<4-6 digit PIN>', 'admin', null);
   ```
   The admin isn't tied to one branch. They switch between branches from the header and give staff their roles and PINs from **Staff** in the POS. They also see sales across **All branches**, and their PIN approves voids at any branch.

   A branch created in the online admin works in the POS straight away, using its menu, as soon as it has staff.
3. Copy `.env.example` to `.env.local` and fill it in. Use the same Supabase project as the online app, and a new `POS_SESSION_SECRET`.
4. Run it locally:
   ```bash
   npm install
   npm run dev   # http://localhost:3001
   ```

## Deploy (Vercel)

Create a **new** Vercel project from this repo with **Root Directory = `pos`**, then add the env vars above. The online app's project is not affected.

## Printing

The POS is built for 80mm thermal printers. Install the printer's Windows driver and set it as the default printer. Then start Chrome on each POS PC in kiosk-printing mode so tickets and receipts print without a dialog:

```
chrome.exe --kiosk-printing --app=https://<pos-domain>/cashier
```

USB barcode scanners work on the Serve screen with no setup, because they type the QR code's contents and then press Enter.

## Security notes

- Every `pos_*` table has RLS enabled with no anon access. All reads and writes go through `/api/pos/*` using the service role, after a signed httpOnly session check.
- PINs are stored as bcrypt hashes (`pgcrypto`). An account locks for 10 minutes after 5 wrong PINs.
- Prices are always taken from `menu_items` in the database, never from the browser.
- Every sale carries a `client_ref`, so a retried request can never create a duplicate sale.
- POS Paystack charges use `UGSPOS-` references and carry no `order_id`, so the online app's webhook ignores them.
