# Project Specification: UGs Kitchen (V2 - Zero Friction)

## 1. Core Architectural Shift
The goal of this rebuild is absolute simplicity. We are eliminating multi-step wizards, authentication walls, cart review pages, and manual proof-of-payment (screenshot uploading) steps. The flow mimics a hyper-streamlined version of Hubtel: click a dish, type a phone number, click pay, and receive a push notification to authorize money directly on the phone.

---

## 2. Infrastructure & Hosting Environment
- **Hosting Platform:** Hostinger Shared Hosting (optimized for single-domain routing via standard web server builds).
- **Backend Infrastructure:** Supabase (Handling dynamic menu storage, configurations, and instant order logging).
- **Payment Processing:** Paystack API. The system utilizes automated API payment requests to trigger immediate Mobile Money (MoMo) STK push prompts directly to the user's mobile device, removing manual confirmation entirely.

---

## 3. The 3-Step Kid-Friendly User Flow (Single Page Application)

To maintain absolute simplicity, the entire user experience lives on a single, scrollable layout:

### Step 1: The Menu Grid (Visual & Instant)
- Big, clear food items displaying a picture, name, price, and a large "+" button.
- Clicking "+" instantly adds the item to a persistent bottom drawer or side cart sheet. No popups or configuration settings.

### Step 2: The Checkout Drawer (Minimal Input)
When the user clicks "View Order", a drawer slides up. It collects only three vital pieces of information:
1. **Name** (For the delivery package/pickup identifier).
2. **Delivery Location** (A clean text input or simple dropdown selector).
3. **MoMo Number** (The direct mobile wallet phone number to charge).

### Step 3: Automated Paystack Trigger
- The user clicks a high-visibility **"Place Order & Pay"** button.
- **Backend Action:** The system automatically initializes a transaction with the Paystack API via webhooks, passing the customer's phone number and the exact order total.
- **User Experience:** A loading spinner appears stating *"Check your phone for the payment prompt..."* The customer receives their native telecom network push notification to enter their PIN and authorize the transaction. 
- **Success State:** Upon validation of the successful Paystack webhook payment event, the UI transitions automatically to a clean success confirmation page.

---

## 4. UI/UX & Styling Guidelines
- **Framework:** Tailwind CSS combined with highly responsive Shadcn primitives.
- **Aesthetic:** Clean, ultra-bold typography with high-contrast buttons designed for flawless mobile navigation.
- **State Management:** Fully reactive localized cart states to ensure instant responsiveness with zero loading lags between clicking a food item and updating the order total.

---

## 5. Directory Structure Setup
All development must be strictly maintained within the following independent architecture block:

```text
ugs-kitchen-v2/
├── public/                 # Static assets and site manifest
├── src/
│   ├── components/
│   │   ├── MenuGrid.jsx     # Visual food list grid
│   │   ├── OrderDrawer.jsx  # Simplified checkout form drawer
│   │   └── PayStatus.jsx    # Post-payment confirmation window
│   ├── context/
│   │   └── CartContext.jsx  # Local reactive cart global state
│   ├── lib/
│   │   └── supabase.js      # Supabase Client initializations
│   └── api/
│       └── paystack.js      # Serverless function handling Paystack initializations
└── seed_ugs_v2.sql          # Base Supabase schema definition