# RestroDeck Cloud POS (restrodeck.com)

> **The All-in-One Operating Deck for Modern Restaurants**  
> **Zero Hardware Lock-in • Zero Paper Waste • Zero Dependency • Instant Cloud & Offline Sync**  
> Designed specifically for restaurants, cafes, QSRs, and cloud kitchens seeking a lightning-fast, modern alternative to legacy systems like Petpooja, Posist, and FoodyQueen.

---

## ⚡ Quick Start (Pilot Launch)

### Run the Server
RestroDeck runs with **pure Python 3 standard library** (no `pip install` or external dependencies required):

```bash
./start.sh
# or
python3 server.py
```

Open your browser and navigate to:
👉 **[http://localhost:3000](http://localhost:3000)**

### Run Automated QA Test Suite
```bash
python3 test_e2e_suite.py
```
*Executes 21 unit and integration tests verifying all API contracts, table lifecycle transitions, KDS sync, item mutations, and billing integrity in < 0.01s.*

---

## 🍽️ The 5 Core Modules

### 1. POS Billing & Table Floor Plan (`/`)
- **Table Floor Plan**: Visual status tracking with 5 color-coded states:
  - 🟢 **Vacant**: Free, sanitized, and ready for guests.
  - 🍳 **Running**: Active dining with real-time subtotal (`🍳 ₹ 860`).
  - 🔔 **Food Ready**: Pulsing emerald alert when kitchen marks order ready.
  - 🔵 **Billed**: Blue badge indicating thermal check slip printed and guest awaiting payment (`🔵 ₹ 1,420`).
  - 🟣 **Reserved**: Table booked in advance for upcoming reservation.
- **Manual Table Status Switcher**: 1-click status override (`[🟢 Vacant] [🍳 Running] [🔵 Billed] [🟣 Reserved]`) inside the Cart Drawer.
- **Dynamic Menu Catalog**: Instant search across dishes, category filter pills (`All`, `Starters`, `Main Course`, `Breads`, `Biryani`, `Beverages`, `Desserts`), and 1-tap dish addition.
- **Dynamic Category & Dish Creation**:
  - `+ Add Category`: Add new menu categories on the fly via top toolbar, category scroller pill, or within the dish modal.
  - `+ Add Dish`: Add dishes with pricing, pure veg/non-veg dietary flags, and descriptions.
  - `+ Add Table`: Add tables with customizable seating capacity and section assignment (AC Dine-in, Outdoor Lawn, Rooftop, Takeaway).
- **Cart & Order Management**:
  - Confirmed running KOT items with **`[-]` and `[+]` quantity steppers** and **high-visibility red delete buttons (`🗑️`)**.
  - Draft items with custom kitchen notes (e.g. *"less spicy"*, *"crispy"*).
  - One-click **Send KOT**, **Print 80mm Slip**, and **Delete Cart & Vacate Table**.
  - **Settle & WhatsApp Bill**: Instant UPI QR generation, Cash, and Card settlement with automated WhatsApp digital invoice dispatch.

### 2. Kitchen Display System (KDS)
- Real-time ticket board for chef and kitchen staff.
- **Cooking Queue**: Live elapsed timers and per-dish dietary tags.
- **Mark Ready Action**: One-tap triggers an audible chime, notifies the floor plan with an emerald pulsing glow, and advances the ticket to the ready queue.
- **⚡ Settle & Bill**: Waiters can settle directly from the KDS screen with automatic table selection.

### 3. WhatsApp AI Superpower (Zero Paper Waste)
- **3-Message Intelligent Sequence**:
  - **Msg 1**: Customer craving / inquiry.
  - **Msg 2**: AI recommendation, pairing upsell, and delivery address capture.
  - **Msg 3**: Digital tax invoice link with instant order firing into KDS.
- **Paperless Tax Invoice**: Saves restaurants ₹800–₹1,500/month on thermal paper rolls while capturing verified customer WhatsApp numbers for repeat marketing.

### 4. Petpooja vs RestroDeck Comparison Calculator
- Interactive financial comparison tool built specifically to showcase ROI to restaurant owners:
  - **Annual Software Savings**: Eliminates high annual renewals (₹15,000–₹25,000/yr) and AMC fees.
  - **WhatsApp SMS Savings**: Replaces expensive third-party SMS packs (₹0.25/msg) with direct WhatsApp integration.
  - **Hardware Independence**: Runs on existing laptops, tablets, iPads, and mobile phones with zero proprietary POS hardware lock-in.

### 5. Today's Sales & Analytics
- Live revenue counter, total order volume, and average order value (AOV).
- Payment breakdown: UPI QR vs Cash vs Card vs WhatsApp Pay.
- Sustainability metric: Live counter of paper rolls saved.
- Top-selling dishes breakdown.

---

## 🎯 5-Minute Pitch Walkthrough (For Restaurant Owners)

When pitching to a restaurant owner frustrated with Petpooja:

1. **Step 1: Open POS Floor Plan (`http://localhost:3000`)**
   - Click `Table 2`. Show the running order (`Paneer Tikka`, `Butter Naan`, `Dal Makhani`).
   - Demonstrate the **`[-]` / `[+]` quantity steppers** and the red **`🗑️ Delete`** button to show how effortless voiding and portion changes are compared to Petpooja.
2. **Step 2: Fire KOT & Kitchen Flow**
   - Click `Table 1` (Vacant). Tap 2 dishes from the menu (`Crispy Corn`, `Dum Biryani`).
   - Click **Send KOT**. Notice `Table 1` instantly turns amber (`🍳 Running`).
   - Switch to **Kitchen KDS** tab. Point out the new ticket in the Cooking Queue.
   - Click **Mark Ready**. The chime plays, and switching back to POS shows `Table 1` glowing emerald (`🔔 Food Ready`).
3. **Step 3: Print Slip & WhatsApp Settlement**
   - Click **Print Slip**. Show the clean 80mm thermal receipt preview. The table automatically marks as `🔵 Billed`.
   - Click **Settle & WhatsApp Bill**. Click **Confirm Payment (UPI QR)**.
   - Point out: *The table is automatically vacated, analytics updated, and the digital invoice sent to the guest's WhatsApp!*
4. **Step 4: Show the Petpooja Calculator Tab**
   - Switch to **Petpooja vs RestroDeck** tab.
   - Show how the restaurant saves over ₹35,000 to ₹60,000 per year by eliminating Petpooja subscriptions, AMC fees, SMS packs, and thermal paper rolls.

---

## 🛠️ Architecture & Tech Stack

- **Backend**: Python 3 standard library `http.server` (Zero pip dependencies, instantaneous startup).
- **Frontend**: Vanilla JavaScript (ES6+), HTML5, Tailwind CSS via CDN, FontAwesome 6 icons.
- **Port**: `3000` (configurable via `server.py`).
- **Tests**: `test_e2e_suite.py` (21 tests, 100% pass rate).
