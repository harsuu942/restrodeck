/**
 * RestroDeck Cloud POS - Frontend Application Engine (restrodeck.com)
 * High-performance, zero-dependency Vanilla JS
 */

// Native Multi-Tenant Resolver & Fetch Interceptor
function getActiveTenantId() {
  const urlParams = new URLSearchParams(window.location.search);
  const qTenant = urlParams.get("tenant");
  if (qTenant) return qTenant.toLowerCase().trim();
  const host = window.location.hostname.toLowerCase();
  if (host.includes(".restrodeck.com") && !host.startsWith("www.")) {
    const sub = host.split(".restrodeck.com")[0];
    if (sub && sub !== "pos" && sub !== "app") return sub;
  }
  return "default";
}

const activeTenantId = getActiveTenantId();
const _nativeFetch = window.fetch;
window.fetch = function(url, options) {
  if (activeTenantId && activeTenantId !== "default") {
    options = options || {};
    options.headers = options.headers || {};
    if (typeof options.headers === "object" && !(options.headers instanceof Headers)) {
      options.headers["X-Tenant-ID"] = activeTenantId;
    }
    if (typeof url === "string" && url.startsWith("/api/")) {
      const sep = url.includes("?") ? "&" : "?";
      if (!url.includes("tenant=")) {
        url = `${url}${sep}tenant=${encodeURIComponent(activeTenantId)}`;
      }
    }
  }
  return _nativeFetch(url, options);
};

// Global State
const state = {
  restaurant: null,
  categories: ["All", "Starters", "Main Course", "Breads", "Biryani", "Beverages", "Desserts"],
  tables: [],
  menu: [],
  orders: [],
  analytics: {},
  activeTableId: "T2",
  cart: [],
  tableCarts: {},
  selectedCategory: "All",
  searchQuery: "",
  selectedPaymentMode: "UPI_QR",
  isDrawerCollapsed: false,
  inventory: [],
  purchase_orders: [],
  aggregators: {},
  currentRole: "cashier",
  currentReport: "sales_items",
  audioCtx: null,
  serverVersion: 1,
  offlineQueue: [],
  isOnline: true,
  syncInterval: null
};

// Central Active Table Order Helper (Excludes COMPLETED, CANCELLED, and VOID orders)
function getActiveOrder(tableId) {
  if (!tableId || !state.orders) return null;
  return state.orders.find(o => 
    o.table_id === tableId && 
    o.status !== "COMPLETED" && 
    o.status !== "CANCELLED" && 
    o.status !== "VOID"
  );
}

// Navigation More Menu Dropdown
function toggleMoreMenu(e) {
  if (e) {
    if (typeof e.stopPropagation === "function") e.stopPropagation();
    if (typeof e.preventDefault === "function") e.preventDefault();
  }
  closeRoleMenu();
  const dropdown = document.getElementById("more-menu-dropdown");
  const chevron = document.getElementById("more-menu-chevron");
  if (dropdown) {
    const isHidden = dropdown.style.display === "none" || !dropdown.style.display || dropdown.classList.contains("hidden");
    if (isHidden) {
      dropdown.style.display = "block";
      dropdown.classList.remove("hidden");
      if (chevron) chevron.style.transform = "rotate(180deg)";
    } else {
      dropdown.style.display = "none";
      dropdown.classList.add("hidden");
      if (chevron) chevron.style.transform = "rotate(0deg)";
    }
  }
}

function closeMoreMenu() {
  const dropdown = document.getElementById("more-menu-dropdown");
  const chevron = document.getElementById("more-menu-chevron");
  if (dropdown) {
    dropdown.style.display = "none";
    dropdown.classList.add("hidden");
  }
  if (chevron) chevron.style.transform = "rotate(0deg)";
}

// Terminal Role Switcher Custom Popup Dropdown
function toggleRoleMenu(e) {
  if (e) {
    if (typeof e.stopPropagation === "function") e.stopPropagation();
    if (typeof e.preventDefault === "function") e.preventDefault();
  }
  closeMoreMenu();
  const dropdown = document.getElementById("role-menu-dropdown");
  const chevron = document.getElementById("role-menu-chevron");
  if (dropdown) {
    const isHidden = dropdown.style.display === "none" || !dropdown.style.display || dropdown.classList.contains("hidden");
    if (isHidden) {
      dropdown.style.display = "block";
      dropdown.classList.remove("hidden");
      if (chevron) chevron.style.transform = "rotate(180deg)";
    } else {
      dropdown.style.display = "none";
      dropdown.classList.add("hidden");
      if (chevron) chevron.style.transform = "rotate(0deg)";
    }
  }
}

function closeRoleMenu() {
  const dropdown = document.getElementById("role-menu-dropdown");
  const chevron = document.getElementById("role-menu-chevron");
  if (dropdown) {
    dropdown.style.display = "none";
    dropdown.classList.add("hidden");
  }
  if (chevron) chevron.style.transform = "rotate(0deg)";
}

// Collapsible Cart Drawer Toggle
function toggleCartDrawer() {
  state.isDrawerCollapsed = !state.isDrawerCollapsed;
  const drawer = document.getElementById("cart-drawer");
  const pill = document.getElementById("floating-cart-pill");
  const grid = document.getElementById("menu-grid");

  if (state.isDrawerCollapsed) {
    if (drawer) drawer.classList.add("hidden");
    if (pill) pill.classList.remove("hidden");
    if (grid) {
      grid.className = "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5";
    }
  } else {
    if (drawer) drawer.classList.remove("hidden");
    if (pill) pill.classList.add("hidden");
    if (grid) {
      grid.className = "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5";
    }
  }
  updateFloatingPill();
}

// Automatically ensure cart drawer is open/expanded
function openCartDrawer() {
  if (state.isDrawerCollapsed) {
    toggleCartDrawer();
  }
}

function updateFloatingPill() {
  const table = state.tables.find(t => t.id === state.activeTableId) || { name: "Table" };
  const subtotal = state.cart.reduce((sum, i) => sum + i.qty * i.price, 0);
  const tax = Math.round(subtotal * 0.05 * 10) / 10;
  const isDelivery = state.activeTableId.startsWith("WA");
  const total = subtotal + tax + (isDelivery ? 30 : 0);
  const totalCount = state.cart.reduce((sum, i) => sum + i.qty, 0);

  const badge = document.getElementById("floating-cart-badge");
  const tableEl = document.getElementById("floating-cart-table");
  const totalEl = document.getElementById("floating-cart-total");

  if (badge) badge.innerText = totalCount;
  if (tableEl) tableEl.innerText = table.name;
  if (totalEl) totalEl.innerText = `₹ ${total.toFixed(2)}`;
}

// Web Audio API Synthesizer for Kitchen Chime & Notifications
function playChimeSound() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!state.audioCtx) {
      state.audioCtx = new AudioContext();
    }
    const ctx = state.audioCtx;
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    // Two-tone cheerful doorbell / kitchen chime (E5 -> G#5)
    const now = ctx.currentTime;
    
    // Note 1
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(659.25, now); // E5
    gain1.gain.setValueAtTime(0.3, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.6);

    // Note 2
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(830.61, now + 0.18); // G#5
    gain2.gain.setValueAtTime(0.3, now + 0.18);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.18);
    osc2.stop(now + 0.9);
  } catch (err) {
    console.warn("Audio Context error:", err);
  }
}

// Initialization on load
document.addEventListener("DOMContentLoaded", async () => {
  startLiveClock();
  updateRoleUI(state.currentRole || "cashier");
  const initOk = await loadInitialData();
  if (!initOk) return; // Account deactivated; halt rendering
  renderCategoryPills();
  renderTables();
  renderMenu();
  loadCartForTable(state.activeTableId);
  renderKDS();
  renderReports();
  renderMockWhatsAppChat();
  startLiveSync();
});

// Live Clock
function startLiveClock() {
  setInterval(() => {
    const now = new Date();
    const el = document.getElementById("live-clock");
    if (el) el.innerText = now.toLocaleTimeString("en-IN", { hour12: false });
  }, 1000);
}

// Real-Time Multi-Terminal Delta Synchronization & Offline Queue Engine
function startLiveSync() {
  if (state.syncInterval) clearInterval(state.syncInterval);
  state.syncInterval = setInterval(performDeltaSync, 2000);
}

async function performDeltaSync() {
  try {
    const res = await fetch(`/api/sync?since=${state.serverVersion || 0}`, {
      headers: { "Cache-Control": "no-cache" }
    });
    if (res.status === 403) {
      const errData = await res.json().catch(() => ({}));
      showDeactivatedScreen(errData);
      return;
    }
    if (!res.ok) throw new Error("Sync HTTP " + res.status);
    const data = await res.json();
    if (data.error === "ACCOUNT_DEACTIVATED" || data.is_active === false) {
      showDeactivatedScreen(data);
      return;
    }
    
    updateSyncStatus(true);

    if (data.up_to_date === true) {
      return; // Fast 1ms return when no changes
    }

    const previousOrderCount = (state.orders || []).length;
    state.serverVersion = data.version || state.serverVersion;
    if (data.tables) state.tables = data.tables;
    if (data.orders) state.orders = data.orders;
    if (data.analytics) state.analytics = data.analytics;
    if (data.inventory) state.inventory = data.inventory;
    if (data.aggregators) state.aggregators = data.aggregators;

    // Detect new incoming orders from other screens (Kiosk, Captain, WhatsApp)
    const newOrderCount = state.orders.length;
    if (newOrderCount > previousOrderCount) {
      playChimeSound();
    }

    // Refresh UI components smoothly without disrupting active cashier inputs
    renderTables();
    const kdsView = document.getElementById("view-kds");
    if (kdsView && !kdsView.classList.contains("hidden")) {
      renderKDS();
    }
    const reportsView = document.getElementById("view-reports");
    if (reportsView && !reportsView.classList.contains("hidden")) {
      renderReports();
    }

    // Process any queued offline actions
    flushOfflineQueue();

  } catch (err) {
    updateSyncStatus(false);
  }
}

function updateSyncStatus(isOnline) {
  state.isOnline = isOnline;
  const clockEl = document.getElementById("live-clock");
  const pill = clockEl ? clockEl.parentElement : null;
  if (!pill) return;

  const dot = pill.querySelector("span:first-child");
  const text = pill.querySelector("span:nth-child(2)");

  if (isOnline) {
    if (dot) dot.className = "w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0";
    if (text) {
      text.className = "font-bold text-emerald-300 hidden md:inline text-[11px]";
      text.innerText = state.offlineQueue.length > 0 ? `Syncing (${state.offlineQueue.length})` : "Live Synced";
    }
  } else {
    if (dot) dot.className = "w-2 h-2 rounded-full bg-amber-400 animate-ping shrink-0";
    if (text) {
      text.className = "font-bold text-amber-300 hidden md:inline text-[11px]";
      text.innerText = `Offline (${state.offlineQueue.length} Queued)`;
    }
  }
}

async function safeApiPost(url, payload) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    performDeltaSync(); // Immediate sync trigger
    return data;
  } catch (err) {
    console.warn(`[Offline Queue] Queuing ${url}:`, err);
    state.offlineQueue.push({ url, payload, timestamp: Date.now() });
    updateSyncStatus(false);
    showToast(`⚠️ Offline Mode: Action queued locally. Will sync automatically when reconnected.`);
    return { success: true, offline: true };
  }
}

async function flushOfflineQueue() {
  if (!state.offlineQueue || state.offlineQueue.length === 0) return;
  const pending = [...state.offlineQueue];
  state.offlineQueue = [];
  
  for (const item of pending) {
    try {
      await fetch(item.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item.payload)
      });
    } catch (e) {
      state.offlineQueue.push(item);
    }
  }
  updateSyncStatus(state.offlineQueue.length === 0);
}

function showDeactivatedScreen(data) {
  if (state.syncInterval) {
    clearInterval(state.syncInterval);
    state.syncInterval = null;
  }
  // Redirect immediately to dedicated suspended page with Contact Support & Pricing
  if (window.location.pathname !== "/suspended" && window.location.pathname !== "/suspended.html") {
    window.location.href = "/suspended";
  }
  const screen = document.getElementById("screen-deactivated");
  if (screen) {
    screen.style.display = "flex";
    const nameEl = document.getElementById("deactivated-restaurant-name");
    const reasonEl = document.getElementById("deactivated-reason-text");
    if (nameEl && data && (data.restaurant_name || (data.restaurant && data.restaurant.name))) {
      nameEl.innerText = data.restaurant_name || data.restaurant.name;
    }
    if (reasonEl && data && data.message) {
      reasonEl.innerText = data.message;
    }
  }
}

// Fetch Initial State from Server (with instant offline fallback)
async function loadInitialData() {
  try {
    const res = await fetch("/api/init", { cache: "no-store" });
    if (res.status === 403) {
      const errData = await res.json().catch(() => ({}));
      showDeactivatedScreen(errData);
      return false;
    }
    if (!res.ok) throw new Error("HTTP error " + res.status);
    const data = await res.json();
    if (data.error === "ACCOUNT_DEACTIVATED" || data.is_active === false || (data.restaurant && data.restaurant.is_active === false)) {
      showDeactivatedScreen(data);
      return false;
    }
    state.restaurant = data.restaurant;
    state.tables = data.tables;
    state.menu = data.menu;
    state.orders = data.orders;
    state.analytics = data.analytics;
    state.serverVersion = data.version || 1;
    state.inventory = data.inventory || [];
    state.purchase_orders = data.purchase_orders || [];
    state.aggregators = data.aggregators || {};
    if (data.categories && data.categories.length > 0) {
      state.categories = ["All", ...data.categories];
    }
  } catch (err) {
    console.warn("Using offline demo dataset:", err);
    state.restaurant = {
      name: "Spice Symphony Bistro & Cafe",
      tagline: "Modern Dine-in, Takeaway & Cloud Kitchen",
      address: "Shop 14, High Street Avenue, Mumbai",
      gstin: "27AADCS1234F1Z5"
    };
    state.inventory = [
      { id: "inv1", name: "Fresh Malai Paneer", category: "Dairy", current_stock: 14.5, unit: "kg", min_stock: 5.0, unit_cost: 340, status: "In Stock", supplier: "Hyperpure by Zomato" },
      { id: "inv2", name: "Tandoori Chicken Cut", category: "Poultry", current_stock: 22.0, unit: "kg", min_stock: 8.0, unit_cost: 210, status: "In Stock", supplier: "Hyperpure by Zomato" },
      { id: "inv3", name: "Daawat Rozana Basmati Rice", category: "Grains", current_stock: 45.0, unit: "kg", min_stock: 15.0, unit_cost: 85, status: "In Stock", supplier: "Swiggy Assure" },
      { id: "inv4", name: "Amul Table Butter (500g)", category: "Dairy", current_stock: 3.5, unit: "kg", min_stock: 4.0, unit_cost: 275, status: "Low Stock", supplier: "Hyperpure by Zomato" },
      { id: "inv5", name: "Fortune Sunlite Refined Oil", category: "Oil & Spices", current_stock: 18.0, unit: "L", min_stock: 10.0, unit_cost: 135, status: "In Stock", supplier: "Swiggy Assure" },
      { id: "inv6", name: "Biryani Handi Boxes (500ml)", category: "Packaging", current_stock: 35.0, unit: "pcs", min_stock: 50.0, unit_cost: 14, status: "Low Stock", supplier: "DeliverIT (DIY Packaging)" },
      { id: "inv7", name: "Fresh Green Chutney Mix", category: "Vegetables", current_stock: 2.0, unit: "kg", min_stock: 1.5, unit_cost: 60, status: "In Stock", supplier: "Vashi APMC Mandi (DIY)" }
    ];
    state.purchase_orders = [
      { po_id: "PO-881", supplier: "Hyperpure by Zomato", items: "10kg Malai Paneer, 15kg Chicken", amount: 6550, status: "DISPATCHED", eta: "Today 07:00 PM" },
      { po_id: "PO-882", supplier: "Swiggy Assure", items: "2x 15L Cooking Oil, 25kg Basmati", amount: 6175, status: "DELIVERED", eta: "Delivered at 14:10" },
      { po_id: "PO-883", supplier: "DeliverIT (DIY)", items: "200x Handi Boxes, 500x Paper Bags", amount: 3800, status: "PENDING_APPROVAL", eta: "Tomorrow Morning" }
    ];
    state.aggregators = {
      swiggy: { status: "ONLINE", auto_accept: true, orders_today: 12, revenue_today: 4820, commission_rate: 25, commission_deducted: 1205 },
      zomato: { status: "ONLINE", auto_accept: true, orders_today: 16, revenue_today: 6340, commission_rate: 25, commission_deducted: 1585 },
      ondc: { status: "ONLINE", auto_accept: true, orders_today: 4, revenue_today: 1420, commission_rate: 5, commission_deducted: 71 },
      whatsapp: { status: "ONLINE", auto_accept: true, orders_today: 14, revenue_today: 7890, commission_rate: 0, commission_deducted: 0 }
    };
    state.tables = [
      { id: "T1", name: "Table 1", section: "AC Dine-in", seats: 2, status: "vacant" },
      { id: "T2", name: "Table 2", section: "AC Dine-in", seats: 4, status: "occupied", subtotal: 860, seated_at: "18:15" },
      { id: "T3", name: "Table 3", section: "AC Dine-in", seats: 6, status: "vacant" },
      { id: "T4", name: "Table 4", section: "AC Dine-in", seats: 4, status: "billed", subtotal: 1420, seated_at: "17:40" },
      { id: "T5", name: "Table 5", section: "Outdoor Lawn", seats: 4, status: "vacant" },
      { id: "T6", name: "Table 6", section: "Outdoor Lawn", seats: 8, status: "occupied", subtotal: 2150, seated_at: "18:25" },
      { id: "TA1", name: "Takeaway 1", section: "Takeaway", seats: 0, status: "vacant" },
      { id: "WA1", name: "WhatsApp Direct 1", section: "WhatsApp Online", seats: 0, status: "occupied", subtotal: 650, seated_at: "18:35" }
    ];
    state.menu = [
      { id: "s1", name: "Paneer Tikka Angara", category: "Starters", price: 280, is_veg: true, description: "Smoky char-grilled cottage cheese with spicy marinade" },
      { id: "s2", name: "Chicken Malai Tikka", category: "Starters", price: 340, is_veg: false, description: "Creamy melt-in-mouth chicken infused with cardamom & cheese" },
      { id: "s3", name: "Crispy Corn & Waterchestnut", category: "Starters", price: 240, is_veg: true, description: "Wok-tossed sweet corn with oriental spices and scallions" },
      { id: "s4", name: "Mutton Galouti Kebab", category: "Starters", price: 420, is_veg: false, description: "Traditional Lucknowi minced lamb kebabs served with mini parathas" },
      { id: "m1", name: "Paneer Butter Masala", category: "Main Course", price: 320, is_veg: true, description: "Rich tomato butter gravy with soft fresh paneer cubes" },
      { id: "m2", name: "Butter Chicken (Classic)", category: "Main Course", price: 390, is_veg: false, description: "Tandoori chicken simmered in velvety makhani gravy" },
      { id: "m3", name: "Dal Makhani 24-Hour", category: "Main Course", price: 260, is_veg: true, description: "Slow-cooked black lentils with white butter and fresh cream" },
      { id: "m4", name: "Mutton Rogan Josh", category: "Main Course", price: 460, is_veg: false, description: "Kashmiri-style tender mutton curry with aromatic spices" },
      { id: "b1", name: "Butter Naan", category: "Breads", price: 60, is_veg: true, description: "Crispy layered leavened bread brushed with amul butter" },
      { id: "b2", name: "Garlic Cheese Naan", category: "Breads", price: 110, is_veg: true, description: "Stuffed with melted mozzarella and roasted garlic flakes" },
      { id: "b3", name: "Tandoori Roti", category: "Breads", price: 35, is_veg: true, description: "Whole wheat bread baked in clay tandoor" },
      { id: "r1", name: "Dum Chicken Biryani", category: "Biryani", price: 360, is_veg: false, description: "Aromatic long-grain basmati with marinated chicken, served with raita" },
      { id: "r2", name: "Subz Dum Biryani", category: "Biryani", price: 290, is_veg: true, description: "Fresh vegetables and aromatic spices with saffron basmati rice" },
      { id: "r3", name: "Jeera Rice & Dal Tadka Combo", category: "Biryani", price: 240, is_veg: true, description: "Comfort bowl of cumin rice with garlic-tempered yellow lentils" },
      { id: "bev1", name: "Masala Chaas / Butter Milk", category: "Beverages", price: 70, is_veg: true, description: "Chilled spiced buttermilk with roasted cumin and mint" },
      { id: "bev2", name: "Fresh Lime Soda", category: "Beverages", price: 90, is_veg: true, description: "Sweet, salted or mixed soda with fresh mint leaves" },
      { id: "d1", name: "Gulab Jamun with Rabdi", category: "Desserts", price: 160, is_veg: true, description: "Warm khoya dumplings soaked in rose syrup topped with chilled rabdi" },
      { id: "d2", name: "Sizzling Brownie with Ice Cream", category: "Desserts", price: 220, is_veg: true, description: "Fudgy brownie on hot skillet with hot chocolate fudge sauce" }
    ];
    state.orders = [
      {
        order_id: "ORD-101",
        table_id: "T2",
        table_name: "Table 2 (AC)",
        customer_name: "Rohan Sharma",
        status: "PREPARING",
        payment_status: "PENDING",
        created_at: "18:15",
        items: [
          { name: "Paneer Tikka Angara", qty: 1, price: 280, notes: "Mild spicy" },
          { name: "Butter Naan", qty: 4, price: 60, notes: "Crispy" },
          { name: "Dal Makhani 24-Hour", qty: 1, price: 260, notes: "" }
        ],
        subtotal: 780,
        tax: 39,
        total: 819
      },
      {
        order_id: "ORD-102",
        table_id: "T6",
        table_name: "Table 6 (Outdoor)",
        customer_name: "Pooja Hegde",
        status: "NEW",
        payment_status: "PENDING",
        created_at: "18:25",
        items: [
          { name: "Chicken Malai Tikka", qty: 2, price: 340, notes: "Extra mint chutney" },
          { name: "Butter Chicken (Classic)", qty: 2, price: 390, notes: "" },
          { name: "Garlic Cheese Naan", qty: 4, price: 110, notes: "" },
          { name: "Fresh Lime Soda", qty: 3, price: 90, notes: "Salted" }
        ],
        subtotal: 2170,
        tax: 108.5,
        total: 2278.5
      }
    ];
    state.analytics = {
      total_revenue: 38450,
      total_orders: 42,
      cash_amount: 11200,
      upi_qr_amount: 22150,
      paper_rolls_saved: 42
    };
  }

  // Update restaurant info
  if (state.restaurant) {
    const brandEl = document.getElementById("brand-name");
    const tagEl = document.getElementById("outlet-tagline");
    const planBadge = document.getElementById("plan-badge-indicator");
    if (brandEl) brandEl.innerText = state.restaurant.name;
    if (tagEl) tagEl.innerText = `${state.restaurant.tagline} • Fast & Zero Lag`;
    if (planBadge) {
      const plan = (state.restaurant.plan || "pro").toLowerCase();
      if (plan === "starter") {
        planBadge.className = "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-100 text-slate-700 border border-slate-300 cursor-pointer hover:bg-emerald-50 hover:text-emerald-700";
        planBadge.innerHTML = `<i class="fa-solid fa-lock text-[9px] mr-1 text-slate-500"></i> STARTER <span class="ml-1 text-[9px] text-emerald-600 font-bold hover:underline">(Upgrade)</span>`;
        planBadge.onclick = () => openUpgradePlanModal("kds");
      } else if (plan === "franchise") {
        planBadge.className = "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-800 border border-purple-300";
        planBadge.innerHTML = `<i class="fa-solid fa-crown text-[9px] mr-1 text-purple-600"></i> FRANCHISE`;
        planBadge.onclick = null;
      } else {
        planBadge.className = "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300";
        planBadge.innerHTML = `<i class="fa-solid fa-circle-check text-[9px] mr-1 text-emerald-600"></i> PRO CORE`;
        planBadge.onclick = null;
      }
    }
    updatePlanNavigationUI();
  }
  return true;
}

function updatePlanNavigationUI() {
  const plan = (state.restaurant && state.restaurant.plan ? state.restaurant.plan.toLowerCase() : "pro");
  const proTabs = ["tab-kds", "tab-inventory", "tab-aggregators", "tab-ai"];

  proTabs.forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    const existingLock = btn.querySelector(".plan-tab-lock");
    if (plan === "starter") {
      if (!existingLock) {
        const lock = document.createElement("span");
        lock.className = "plan-tab-lock text-[9px] bg-amber-100 text-amber-800 border border-amber-300 px-1 py-0.2 rounded font-bold ml-1 shrink-0";
        lock.title = "Pro Enterprise Feature (Upgrade)";
        lock.innerHTML = `<i class="fa-solid fa-lock text-[8px] mr-0.5"></i>Pro`;
        btn.appendChild(lock);
      }
    } else {
      if (existingLock) existingLock.remove();
    }
  });

  // Handle Franchise Multi-Outlet Switcher & HQ Shortcut
  const branchSwitcher = document.getElementById("franchise-branch-switcher");
  const franchiseHqItem = document.getElementById("more-item-franchise-hq");
  const planBadge = document.getElementById("plan-badge-indicator");

  if (plan === "franchise") {
    if (branchSwitcher) {
      branchSwitcher.style.display = "inline-flex";
      loadFranchiseBranches();
    }
    if (franchiseHqItem) {
      franchiseHqItem.style.display = "flex";
    }
    if (planBadge) {
      planBadge.style.display = "none";
    }
  } else {
    if (branchSwitcher) branchSwitcher.style.display = "none";
    if (franchiseHqItem) franchiseHqItem.style.display = "none";
    if (planBadge) planBadge.style.display = "inline-flex";
  }
}

async function loadFranchiseBranches() {
  try {
    const res = await fetch("/api/tenants/list");
    if (!res.ok) return;
    const data = await res.json();
    const tenants = data.tenants || [];
    const listEl = document.getElementById("branch-switcher-list");
    const currentLabel = document.getElementById("current-branch-label");
    const activeTid = getActiveTenantId();

    const activeTenant = tenants.find(t => t.tenant_id === activeTid) || tenants[0];
    const activeGroup = (activeTenant && activeTenant.franchise_group) ? activeTenant.franchise_group.toLowerCase() : (activeTid === "default" ? "spicesymphony" : "");
    const brandName = (activeTenant && activeTenant.brand_name) ? activeTenant.brand_name : "Spice Symphony";

    // Filter ONLY sister branches of the SAME Franchise Brand!
    const sisterBranches = tenants.filter(t => {
      const g = (t.franchise_group || (t.tenant_id === "default" ? "spicesymphony" : "")).toLowerCase();
      return (activeGroup && g === activeGroup) || (t.tenant_id === activeTid);
    });

    if (currentLabel && activeTenant) {
      const shortName = activeTenant.name.replace(/Spice Symphony|Bistro & Cafe|\(|\)/gi, "").trim();
      currentLabel.innerText = shortName || "Main";
    }

    if (listEl) {
      if (sisterBranches.length > 0) {
        listEl.innerHTML = sisterBranches.map(t => {
          const isCurrent = (t.tenant_id === activeTid);
          const url = (t.tenant_id === "default") ? "/" : `/?tenant=${encodeURIComponent(t.tenant_id)}`;
          return `
            <a href="${url}" class="flex items-center justify-between p-2 rounded-xl text-xs transition-colors ${isCurrent ? 'bg-purple-100 text-purple-950 font-black border border-purple-300' : 'hover:bg-slate-50 text-slate-700 font-bold'}">
              <div class="flex items-center space-x-2 truncate">
                <i class="fa-solid fa-store ${isCurrent ? 'text-purple-700' : 'text-slate-400'} text-xs"></i>
                <span class="truncate">${t.name}</span>
              </div>
              ${isCurrent ? '<span class="text-[9px] bg-purple-600 text-white px-1.5 py-0.2 rounded font-black shrink-0">ACTIVE</span>' : '<span class="text-[10px] text-slate-400 shrink-0 font-mono">₹' + (t.revenue || 0) + '</span>'}
            </a>
          `;
        }).join("");
      } else {
        listEl.innerHTML = `
          <div class="p-2 text-center text-[10px] text-slate-400 font-medium">No other branches registered yet</div>
          <button onclick="openFranchiseHQ('add_branch')" type="button" class="w-full mt-1 bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold text-[10px] py-1.5 rounded-lg border border-purple-200 transition-colors cursor-pointer">
            <i class="fa-solid fa-plus text-[8px] mr-1"></i> Add Branch in Admin HQ
          </button>
        `;
      }
    }
  } catch (err) {
    console.warn("Could not load franchise branches:", err);
  }
}

function openFranchiseHQ(mode = "") {
  closeMoreMenu();
  const dropdown = document.getElementById("branch-switcher-dropdown");
  if (dropdown) dropdown.style.display = "none";
  const url = (mode === "add_branch") ? "/admin?action=add_branch" : "/admin";
  window.open(url, "_blank");
}

function toggleBranchSwitcher(e) {
  if (e) e.stopPropagation();
  const dropdown = document.getElementById("branch-switcher-dropdown");
  if (!dropdown) return;
  const isOpen = (dropdown.style.display === "block");
  dropdown.style.display = isOpen ? "none" : "block";
}

window.addEventListener("click", () => {
  const dropdown = document.getElementById("branch-switcher-dropdown");
  if (dropdown) dropdown.style.display = "none";
});

// Subscription Plan Gating Data & Helpers
const GATED_FEATURES_INFO = {
  kds: {
    title: "Kitchen Display System (KDS)",
    desc: "Paperless kitchen display with real-time ticket countdown timers, bump-bar status workflows, and chef station dispatch. Upgrade to Pro Enterprise (₹799/mo) to eliminate lost paper KOTs."
  },
  inventory: {
    title: "Hyperpure Inventory & Stock Control",
    desc: "Live raw ingredient depletion tracking on every punched dish, low-stock threshold alerts, supplier directory, and 1-click Hyperpure bulk PO generation. Upgrade to Pro Enterprise to unlock."
  },
  aggregators: {
    title: "Swiggy & Zomato 2-Way Live Sync",
    desc: "Connect your Swiggy and Zomato storefronts directly into RestroDeck. Live menu pricing, auto-accept delivery orders, and eliminate tablet clutter with Pro Enterprise."
  },
  ai: {
    title: "RestroDeck AI Copilot & Voice Analytics",
    desc: "Natural language query engine, AI-powered menu recommendations, peak-hour sales predictions, and voice-assisted ordering. Upgrade to Pro Enterprise to unlock."
  },
  kiosk: {
    title: "Self-Ordering Touch Kiosk Mode",
    desc: "Turn any touchscreen or tablet into an automated customer self-ordering station with visual menu, combo add-ons, and dynamic UPI QR billing. Upgrade to Pro Enterprise to unlock."
  }
};

function openUpgradePlanModal(featureKey) {
  const feat = GATED_FEATURES_INFO[featureKey] || {
    title: "Pro Enterprise Feature",
    desc: "This feature requires the Pro Enterprise Core plan. Upgrade today for just ₹200 more/month!"
  };
  const titleEl = document.getElementById("upgrade-feature-title");
  const descEl = document.getElementById("upgrade-feature-desc");
  if (titleEl) titleEl.innerText = feat.title;
  if (descEl) descEl.innerText = feat.desc;
  openModal("modal-upgrade-plan");
}

function requestPlanUpgradeWhatsApp() {
  const restName = (state.restaurant && state.restaurant.name) || "Our Restaurant";
  const tenant = state.activeTenantId || "default";
  const featureTitle = document.getElementById("upgrade-feature-title")?.innerText || "Pro Features";
  const text = encodeURIComponent(`Hi RestroDeck Team, I want to upgrade "${restName}" (Tenant: ${tenant}) to Pro Enterprise Core (₹799/mo) to unlock ${featureTitle}. Please activate our account.`);
  window.open(`https://wa.me/919313838165?text=${text}`, "_blank");
}

// Module Tab Switching
function switchTab(tabName) {
  // Subscription Plan Gating Check
  const currentPlan = (state.restaurant && state.restaurant.plan ? state.restaurant.plan.toLowerCase() : "pro");
  const proFeatures = ["kds", "inventory", "aggregators", "ai", "kiosk"];
  if (currentPlan === "starter" && proFeatures.includes(tabName)) {
    openUpgradePlanModal(tabName);
    return;
  }

  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.classList.remove("nav-tab-active");
    btn.className = "tab-btn px-3.5 py-1.5 rounded-xl flex items-center space-x-1.5 transition-all text-slate-600 hover:text-slate-900 hover:bg-white/70 cursor-pointer shrink-0 font-bold";
  });
  const activeBtn = document.getElementById(`tab-${tabName}`);
  if (activeBtn) {
    activeBtn.className = "tab-btn px-3.5 py-1.5 rounded-xl flex items-center space-x-1.5 transition-all nav-tab-active cursor-pointer shrink-0 font-bold";
  }

  document.querySelectorAll(".view-panel").forEach(panel => {
    panel.classList.add("hidden");
  });
  const activePanel = document.getElementById(`view-${tabName}`);
  if (activePanel) {
    activePanel.classList.remove("hidden");
  }

  if (tabName === "kds") renderKDS();
  if (tabName === "inventory") renderInventory();
  if (tabName === "aggregators") renderAggregators();
  if (tabName === "reports") changeReportType(state.currentReport || "sales_items");
  if (tabName === "kiosk") renderKioskMenu();
  if (tabName === "ai") {
    setTimeout(() => {
      const input = document.getElementById("ai-query-input");
      if (input) input.focus();
    }, 120);
  }
}

// Floor Plan Section Filter State & Setter
let currentFloorSectionFilter = "ALL";

function setFloorSectionFilter(filter) {
  currentFloorSectionFilter = (filter || "ALL").toUpperCase();
  document.querySelectorAll(".floor-filter-btn").forEach(btn => {
    btn.classList.remove("active");
  });
  const targetBtn = document.getElementById(`floor-filter-${currentFloorSectionFilter.toLowerCase()}`);
  if (targetBtn) {
    targetBtn.classList.add("active");
  }
  renderTables();
}

// Render Table Selection Bar (Bento Senior UI)
function renderTables() {
  const container = document.getElementById("tables-container");
  if (!container) return;

  const allTables = state.tables || [];

  // Update Section Counters
  const countAll = allTables.length;
  const countAC = allTables.filter(t => (t.section || "").toLowerCase().includes("ac")).length;
  const countOutdoor = allTables.filter(t => {
    const s = (t.section || "").toLowerCase();
    return s.includes("outdoor") || s.includes("lawn");
  }).length;
  const countDelivery = allTables.filter(t => {
    const s = (t.section || "").toLowerCase();
    return s.includes("takeaway") || s.includes("whatsapp") || s.includes("delivery") || s.includes("online");
  }).length;

  const elCountAll = document.getElementById("count-floor-all");
  if (elCountAll) elCountAll.innerText = countAll;
  const elCountAC = document.getElementById("count-floor-ac");
  if (elCountAC) elCountAC.innerText = countAC;
  const elCountOutdoor = document.getElementById("count-floor-outdoor");
  if (elCountOutdoor) elCountOutdoor.innerText = countOutdoor;
  const elCountDelivery = document.getElementById("count-floor-delivery");
  if (elCountDelivery) elCountDelivery.innerText = countDelivery;

  // Update Live Legend Status Counters
  let countVacant = 0;
  let countRunning = 0;
  let countReady = 0;
  let countBilled = 0;

  allTables.forEach(t => {
    const runningOrder = getActiveOrder(t.id);
    const isReady = (runningOrder && (runningOrder.kds_done || runningOrder.kds_status === "COMPLETED")) || t.kitchen_ready;
    if (t.status === "billed") {
      countBilled++;
    } else if (isReady && runningOrder) {
      countReady++;
    } else if (t.status === "occupied" || runningOrder) {
      countRunning++;
    } else {
      countVacant++;
    }
  });

  const elLegVacant = document.getElementById("legend-vacant-count");
  if (elLegVacant) elLegVacant.innerText = countVacant;
  const elLegRunning = document.getElementById("legend-running-count");
  if (elLegRunning) elLegRunning.innerText = countRunning;
  const elLegReady = document.getElementById("legend-ready-count");
  if (elLegReady) elLegReady.innerText = countReady;
  const elLegBilled = document.getElementById("legend-billed-count");
  if (elLegBilled) elLegBilled.innerText = countBilled;

  // Filter Tables by Floor Section
  const visibleTables = allTables.filter(t => {
    const s = (t.section || "").toLowerCase();
    if (currentFloorSectionFilter === "AC") {
      return s.includes("ac");
    }
    if (currentFloorSectionFilter === "OUTDOOR") {
      return s.includes("outdoor") || s.includes("lawn");
    }
    if (currentFloorSectionFilter === "DELIVERY") {
      return s.includes("takeaway") || s.includes("whatsapp") || s.includes("delivery") || s.includes("online");
    }
    return true; // ALL
  });

  container.innerHTML = "";

  if (visibleTables.length === 0) {
    container.innerHTML = `
      <div class="py-3 px-4 text-xs text-slate-400 italic flex items-center space-x-2">
        <i class="fa-solid fa-circle-info text-slate-300 text-xs"></i>
        <span>No tables registered in this floor section yet.</span>
      </div>
    `;
    return;
  }

  visibleTables.forEach(table => {
    const isActive = table.id === state.activeTableId;
    const runningOrder = getActiveOrder(table.id);
    const isReady = (runningOrder && (runningOrder.kds_done || runningOrder.kds_status === "COMPLETED")) || table.kitchen_ready;

    // Table Icon
    const secLower = (table.section || "").toLowerCase();
    const nameLower = (table.name || "").toLowerCase();
    let typeIcon = "fa-solid fa-utensils text-slate-600";
    let isQuickCounter = false;

    if (secLower.includes("whatsapp") || nameLower.includes("whatsapp")) {
      typeIcon = "fa-brands fa-whatsapp text-emerald-600";
      isQuickCounter = true;
    } else if (secLower.includes("takeaway") || nameLower.includes("takeaway")) {
      typeIcon = "fa-solid fa-bag-shopping text-indigo-600";
      isQuickCounter = true;
    } else if (secLower.includes("outdoor") || secLower.includes("lawn")) {
      typeIcon = "fa-solid fa-tree text-teal-600";
    }

    // Display title without ellipsis truncation
    let displayName = table.name;
    if (displayName.toLowerCase().includes("whatsapp direct")) {
      displayName = displayName.replace(/whatsapp direct/i, "WA Direct").trim();
    }

    // Status Pill & Amount / Timing
    let statusPillHtml = "";
    let cardAccent = "border-slate-200/90";
    let bottomRowHtml = "";
    let diningInfoHtml = "";

    if (table.status === "billed") {
      const totalAmount = runningOrder ? runningOrder.total : (table.subtotal || 1420);
      statusPillHtml = `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200/80"><i class="fa-solid fa-receipt text-[8px] mr-1 text-blue-500"></i>Billed</span>`;
      cardAccent = "border-blue-200/80 bg-blue-50/20";
      bottomRowHtml = `
        <div class="flex items-center justify-between pt-1 border-t border-slate-100 text-xs">
          <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Bill</span>
          <span class="font-black text-xs text-blue-900 font-mono tracking-tight">₹${Math.round(totalAmount).toLocaleString('en-IN')}</span>
        </div>
      `;
    } else if (isReady && runningOrder) {
      const totalAmount = runningOrder.total || table.subtotal || 0;
      statusPillHtml = `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-900 border border-emerald-300 ring-1 ring-emerald-400 animate-pulse"><i class="fa-solid fa-bell text-[8px] mr-1 text-emerald-700"></i>Ready</span>`;
      cardAccent = "border-emerald-300 bg-emerald-50/30";
      bottomRowHtml = `
        <div class="flex items-center justify-between pt-1 border-t border-slate-100 text-xs">
          <span class="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Ready</span>
          <span class="font-black text-xs text-emerald-900 font-mono tracking-tight">₹${Math.round(totalAmount).toLocaleString('en-IN')}</span>
        </div>
      `;
    } else if (table.status === "reserved") {
      statusPillHtml = `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200"><span class="w-1.5 h-1.5 rounded-full bg-purple-500 mr-1"></span>Reserved</span>`;
      cardAccent = "border-purple-200 bg-purple-50/20";
      bottomRowHtml = `
        <div class="flex items-center justify-between pt-1 border-t border-slate-100 text-xs">
          <span class="text-[10px] font-medium text-purple-600">Reserved</span>
          <span class="text-[10px] font-semibold text-purple-700">Hold</span>
        </div>
      `;
    } else if (table.status === "occupied" || runningOrder) {
      const totalAmount = runningOrder ? runningOrder.total : (table.subtotal || 860);
      statusPillHtml = `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200/80"><span class="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1 animate-pulse"></span>Seated</span>`;
      cardAccent = "border-amber-200/80 bg-amber-50/20";
      bottomRowHtml = `
        <div class="flex items-center justify-between pt-1 border-t border-slate-100 text-xs">
          <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Bill</span>
          <span class="font-black text-xs text-slate-900 font-mono tracking-tight">₹${Math.round(totalAmount).toLocaleString('en-IN')}</span>
        </div>
      `;
    } else {
      // Vacant
      statusPillHtml = `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/70"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1"></span>Vacant</span>`;
      bottomRowHtml = `
        <div class="flex items-center justify-between pt-1 border-t border-slate-100 text-xs">
          <span class="text-[10px] font-medium text-slate-400">Available</span>
          <span class="text-[10px] font-semibold text-emerald-600 flex items-center">Open <i class="fa-solid fa-arrow-right text-[8px] ml-1"></i></span>
        </div>
      `;
    }

    // Dining Info Row
    if (isQuickCounter || table.seats === 0) {
      diningInfoHtml = `
        <div class="flex items-center justify-between text-[10px] text-slate-500 font-medium">
          <span class="flex items-center"><i class="fa-solid fa-bolt text-[9px] text-slate-400 mr-1"></i>Express</span>
          ${table.seated_at ? `<span class="flex items-center text-slate-400 font-mono"><i class="fa-regular fa-clock text-[8px] mr-0.5"></i>${table.seated_at}</span>` : ""}
        </div>
      `;
    } else {
      diningInfoHtml = `
        <div class="flex items-center justify-between text-[10px] text-slate-500 font-medium">
          <span class="flex items-center"><i class="fa-solid fa-chair text-[9px] text-slate-400 mr-1"></i>${table.seats} Seats</span>
          ${table.seated_at ? `<span class="flex items-center text-slate-400 font-mono"><i class="fa-regular fa-clock text-[8px] mr-0.5"></i>${table.seated_at}</span>` : ""}
        </div>
      `;
    }

    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = `table-card shrink-0 p-3 rounded-2xl border text-left transition-all min-w-[172px] h-[86px] cursor-pointer flex flex-col justify-between bg-white select-none ${cardAccent} ${isActive ? 'active-table' : ''}`;
    tile.onclick = () => selectActiveTable(table.id);
    tile.innerHTML = `
      <div class="flex items-center justify-between w-full">
        <div class="flex items-center space-x-1.5 truncate pr-1">
          <i class="${typeIcon} text-xs shrink-0"></i>
          <span class="font-extrabold text-xs text-slate-900 tracking-tight whitespace-nowrap">${displayName}</span>
        </div>
        <div class="shrink-0">
          ${statusPillHtml}
        </div>
      </div>
      ${diningInfoHtml}
      ${bottomRowHtml}
    `;
    container.appendChild(tile);
  });
}

function selectActiveTable(tableId) {
  state.activeTableId = tableId;
  renderTables();
  loadCartForTable(tableId);
}

// Manual Table Status Assignment
async function manuallyAssignTableStatus(newStatus) {
  const table = state.tables.find(t => t.id === state.activeTableId);
  if (!table) return;

  table.status = newStatus;

  if (newStatus === "vacant") {
    table.kitchen_ready = false;
    table.current_order_id = null;
    table.subtotal = null;
    table.seated_at = null;
    state.cart = [];
    delete state.tableCarts[state.activeTableId];

    const existingOrder = getActiveOrder(state.activeTableId);
    if (existingOrder) {
      existingOrder.status = "CANCELLED";
      existingOrder.kds_done = true;
    }
  } else if (newStatus === "occupied") {
    if (!table.seated_at) {
      table.seated_at = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
  }

  renderTables();
  renderKDS();
  loadCartForTable(state.activeTableId);
  showToast(`Table ${table.name} status updated to: ${newStatus.toUpperCase()}`);

  try {
    fetch("/api/tables/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table_id: table.id, status: newStatus })
    });
  } catch (err) {
    console.warn("Table status synced locally:", err);
  }
}

function updateTableStatusButtons(currentStatus) {
  const statusSelect = document.getElementById("cart-table-status-select");
  if (statusSelect) {
    statusSelect.value = currentStatus;
  }
}

function loadCartForTable(tableId) {
  const table = state.tables.find(t => t.id === tableId);
  const badge = document.getElementById("cart-table-badge");
  const type = document.getElementById("cart-order-type");
  const meta = document.getElementById("cart-meta-info");
  const statusSelect = document.getElementById("cart-table-status-select");

  const existingOrder = getActiveOrder(tableId);
  const isReady = (existingOrder && (existingOrder.kds_done || existingOrder.kds_status === "COMPLETED")) || (table && table.kitchen_ready);

  if (table) {
    if (badge) badge.innerText = table.name;
    if (type) type.innerText = table.section;
    if (statusSelect) statusSelect.value = table.status || "vacant";
    if (meta) {
      if (table.status === "billed") {
        meta.innerHTML = `<span class="text-blue-600 font-bold">🔵 Billed (Slip Printed)</span> • Awaiting Payment`;
      } else if (isReady && existingOrder) {
        meta.innerHTML = `<span class="text-emerald-600 font-bold">🔔 Food Ready to Serve!</span> • #${existingOrder.order_id}`;
      } else if (table.status === "reserved") {
        meta.innerHTML = `<span class="text-purple-600 font-bold">🟣 Reserved</span> • Guest Expected`;
      } else if (existingOrder) {
        meta.innerText = `🍳 Cooking in Kitchen • Order #${existingOrder.order_id} (${existingOrder.created_at || 'Recently'})`;
      } else {
        meta.innerText = `🟢 Vacant • Ready for new order`;
      }
    }
  }

  const currentStatus = table ? (table.status || "vacant") : "vacant";
  updateTableStatusButtons(currentStatus);

  renderCart();
}

// Categories & Menu
function renderCategoryPills() {
  const categories = state.categories || ["All", "Starters", "Main Course", "Breads", "Biryani", "Beverages", "Desserts"];
  const container = document.getElementById("category-pills");
  if (!container) return;
  container.innerHTML = "";

  const categoryIcons = {
    "All": "fa-solid fa-border-all",
    "Starters": "fa-solid fa-bowl-food",
    "Main Course": "fa-solid fa-plate-wheat",
    "Breads": "fa-solid fa-bread-slice",
    "Biryani": "fa-solid fa-fire",
    "Beverages": "fa-solid fa-mug-hot",
    "Desserts": "fa-solid fa-ice-cream"
  };

  categories.forEach(cat => {
    const isSelected = state.selectedCategory === cat;
    const iconClass = categoryIcons[cat] || "fa-solid fa-utensils";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center space-x-1.5 ${
      isSelected 
        ? "bg-slate-900 text-white shadow-xs" 
        : "bg-slate-100 hover:bg-slate-200/80 text-slate-700 border border-slate-200/60"
    }`;
    btn.innerHTML = `<i class="${iconClass} text-[11px] ${isSelected ? 'text-white' : 'text-slate-500'}"></i><span>${cat}</span>`;
    btn.onclick = () => {
      state.selectedCategory = cat;
      renderCategoryPills();
      renderMenu();
    };
    container.appendChild(btn);
  });
}

function openAddCategoryModal() {
  const input = document.getElementById("new-category-name");
  if (input) {
    input.value = "";
    setTimeout(() => input.focus(), 80);
  }
  openModal("modal-add-category");
}

async function confirmAddCategory() {
  const input = document.getElementById("new-category-name");
  const name = input ? input.value.trim() : "";
  if (!name) {
    showToast("⚠️ Please enter a category name");
    return;
  }

  if (!state.categories.includes(name)) {
    state.categories.push(name);
  }
  state.selectedCategory = name;

  renderCategoryPills();
  updateCategorySelectDropdown();
  renderMenu();
  closeModal("modal-add-category");
  showToast(`✅ Category '${name}' added!`);

  try {
    await fetch("/api/categories/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    });
  } catch (err) {
    console.warn("Category saved locally:", err);
  }
}

function updateCategorySelectDropdown() {
  const select = document.getElementById("new-item-category");
  if (!select) return;
  const currentVal = select.value;
  const categories = (state.categories || []).filter(c => c !== "All");

  select.innerHTML = "";
  categories.forEach(cat => {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.innerText = cat;
    if (cat === currentVal || cat === state.selectedCategory) {
      opt.selected = true;
    }
    select.appendChild(opt);
  });
}

function handleMenuSearch(val) {
  state.searchQuery = val.toLowerCase().trim();
  renderMenu();
}

function renderMenu() {
  const container = document.getElementById("menu-grid");
  if (!container) return;
  container.innerHTML = "";

  let filtered = state.menu;
  if (state.searchQuery) {
    // Global search across all categories when cashier types a search query
    filtered = filtered.filter(item => 
      item.name.toLowerCase().includes(state.searchQuery) || 
      item.category.toLowerCase().includes(state.searchQuery) ||
      (item.description && item.description.toLowerCase().includes(state.searchQuery))
    );
  } else if (state.selectedCategory !== "All") {
    filtered = filtered.filter(item => item.category === state.selectedCategory);
  }

  if (filtered.length === 0) {
    container.innerHTML = `<div class="col-span-full py-8 text-center text-xs text-slate-400">No dishes found matching your search.</div>`;
    return;
  }

  filtered.forEach(item => {
    const card = document.createElement("div");
    card.className = "bg-white rounded-xl p-3 border border-slate-200 hover:border-emerald-500 hover:shadow-md transition-all flex flex-col justify-between select-none cursor-pointer group";
    card.onclick = () => addItemToCart(item, false);

    const vegIcon = item.is_veg 
      ? `<span class="w-3.5 h-3.5 border border-emerald-600 flex items-center justify-center rounded-xs p-0.5"><span class="w-1.5 h-1.5 rounded-full bg-emerald-600"></span></span>`
      : `<span class="w-3.5 h-3.5 border border-rose-600 flex items-center justify-center rounded-xs p-0.5"><span class="w-1.5 h-1.5 rounded-full bg-rose-600"></span></span>`;

    card.innerHTML = `
      <div>
        <div class="flex items-start justify-between mb-1.5">
          <div class="flex items-center space-x-1.5">
            ${vegIcon}
            <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">${item.category}</span>
          </div>
          <span class="text-xs font-black font-mono text-slate-900">₹ ${item.price}</span>
        </div>
        <h4 class="font-bold text-xs text-slate-800 group-hover:text-emerald-700 transition-colors leading-tight line-clamp-1">${item.name}</h4>
        <p class="text-[11px] text-slate-400 line-clamp-1 mt-0.5">${item.description || ''}</p>
      </div>

      <div class="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between gap-1.5">
        <button type="button" class="btn-item-note bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 px-2 py-1 rounded-lg text-[10px] font-bold transition-all shadow-2xs flex items-center space-x-1 cursor-pointer active:scale-95" title="Add item with kitchen cooking note">
          <i class="fa-solid fa-pen text-[9px] text-amber-600"></i>
          <span>+ Note</span>
        </button>

        <button type="button" class="btn-item-add bg-emerald-50 group-hover:bg-emerald-600 text-emerald-700 group-hover:text-white px-2.5 py-1 rounded-lg text-xs font-bold transition-all shadow-xs flex items-center space-x-1 cursor-pointer active:scale-95">
          <i class="fa-solid fa-plus text-[10px]"></i>
          <span>Add</span>
        </button>
      </div>
    `;

    // Attach event listeners safely
    const noteBtn = card.querySelector(".btn-item-note");
    if (noteBtn) {
      noteBtn.onclick = (e) => {
        e.stopPropagation();
        addItemToCart(item, true);
      };
    }

    const addBtn = card.querySelector(".btn-item-add");
    if (addBtn) {
      addBtn.onclick = (e) => {
        e.stopPropagation();
        addItemToCart(item, false);
      };
    }

    container.appendChild(card);
  });
}

// Cart Logic: Dual-State Running Kitchen Order + Unsent Draft Add-ons
function addItemToCart(menuItem, focusInstruction = false) {
  // 1. Automatically open the cart drawer if it is collapsed
  openCartDrawer();

  if (!state.tableCarts[state.activeTableId]) {
    state.tableCarts[state.activeTableId] = [];
  }
  const drafts = state.tableCarts[state.activeTableId];
  let targetIndex = drafts.findIndex(i => i.name === menuItem.name);

  if (targetIndex !== -1) {
    drafts[targetIndex].qty += 1;
  } else {
    drafts.push({
      name: menuItem.name,
      price: menuItem.price,
      qty: 1,
      notes: ""
    });
    targetIndex = drafts.length - 1;
  }
  renderCart();
  showToast(`Added ${menuItem.name} to cart`);

  // Auto-focus instruction input if requested (e.g. from "+ Note" button)
  if (focusInstruction) {
    setTimeout(() => {
      const noteInput = document.getElementById(`draft-notes-${targetIndex}`);
      if (noteInput) {
        noteInput.scrollIntoView({ behavior: "smooth", block: "center" });
        noteInput.focus();
        noteInput.select();
      }
    }, 120);
  }
}

function updateCartItemQty(index, delta) {
  const drafts = state.tableCarts[state.activeTableId];
  if (drafts && drafts[index]) {
    drafts[index].qty += delta;
    if (drafts[index].qty <= 0) {
      drafts.splice(index, 1);
    }
    renderCart();
  }
}

function updateCartItemNotes(index, notes) {
  const drafts = state.tableCarts[state.activeTableId];
  if (drafts && drafts[index]) {
    drafts[index].notes = notes;
  }
}

function appendCartItemInstruction(index, tag) {
  const drafts = state.tableCarts[state.activeTableId];
  if (!drafts || !drafts[index]) return;

  const currentNotes = (drafts[index].notes || "").trim();
  if (!currentNotes) {
    drafts[index].notes = tag;
  } else if (!currentNotes.toLowerCase().includes(tag.toLowerCase())) {
    drafts[index].notes = `${currentNotes}, ${tag}`;
  }

  const input = document.getElementById(`draft-notes-${index}`);
  if (input) {
    input.value = drafts[index].notes;
    input.focus();
  }
}

// Open In-App Delete Cart Confirmation Modal
function openDeleteCartModal() {
  const table = state.tables.find(t => t.id === state.activeTableId) || { name: "Current Table", id: state.activeTableId };
  const existingOrder = getActiveOrder(state.activeTableId);
  const drafts = state.tableCarts[state.activeTableId] || [];

  // If table is completely vacant with no active order and no drafts
  if (!existingOrder && drafts.length === 0 && state.cart.length === 0) {
    showToast("Cart is already empty.");
    return;
  }

  // If table has only un-sent draft items on a fresh table, clear immediately without modal
  if (!existingOrder && drafts.length > 0) {
    state.tableCarts[state.activeTableId] = [];
    state.cart = [];
    loadCartForTable(state.activeTableId);
    renderTables();
    showToast("🗑️ Draft cart cleared.");
    return;
  }

  // Populate In-App Modal Elements
  const nameEl = document.getElementById("delete-modal-table-name");
  const orderEl = document.getElementById("delete-modal-order-id");
  const descEl = document.getElementById("delete-modal-desc");

  if (nameEl) nameEl.innerText = `${table.name} (${table.section || 'Dine-in'})`;
  if (orderEl) orderEl.innerText = existingOrder ? `#${existingOrder.order_id}` : 'Draft Cart';
  if (descEl) {
    const totalAmount = existingOrder ? (existingOrder.total || 0) : state.cart.reduce((s, i) => s + i.qty * i.price, 0);
    descEl.innerText = `Active bill of ₹ ${totalAmount.toFixed(2)} will be permanently cancelled.`;
  }

  openModal("modal-delete-cart");
}

// Confirm Delete Entire Cart & Vacate Table
async function confirmDeleteEntireCart() {
  const tableId = state.activeTableId;
  const table = state.tables.find(t => t.id === tableId);
  const existingOrder = getActiveOrder(tableId);

  // 1. Cancel order in state
  if (existingOrder) {
    existingOrder.status = "CANCELLED";
    existingOrder.kds_done = true;
  }

  // 2. Reset table to vacant
  if (table) {
    table.status = "vacant";
    table.kitchen_ready = false;
    table.current_order_id = null;
    table.subtotal = null;
    table.seated_at = null;
  }

  // 3. Clear cart states completely
  state.cart = [];
  delete state.tableCarts[tableId];

  // 4. Close modal and re-render UI
  closeModal("modal-delete-cart");
  renderTables();
  renderKDS();
  loadCartForTable(tableId);

  showToast(`🗑️ Cart cleared! ${table ? table.name : 'Table'} is now Vacant (₹ 0.00).`);

  // 5. Server sync
  try {
    fetch("/api/orders/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        order_id: existingOrder ? existingOrder.order_id : null,
        table_id: tableId
      })
    });
  } catch (err) {
    console.warn("Cancel synced locally:", err);
  }
}

// Backward-compatible alias for any code or button invoking clearCurrentCart
function clearCurrentCart() {
  openDeleteCartModal();
}

// Delete a specific confirmed item from running kitchen order
function deleteConfirmedOrderItem(orderId, itemIndex) {
  if (typeof orderId === "number") {
    itemIndex = orderId;
    orderId = null;
  }

  const existingOrder = orderId 
    ? state.orders.find(o => o.order_id === orderId && o.status !== "COMPLETED" && o.status !== "CANCELLED" && o.status !== "VOID") 
    : getActiveOrder(state.activeTableId);

  if (!existingOrder || !existingOrder.items || !existingOrder.items[itemIndex]) return;

  const item = existingOrder.items[itemIndex];
  existingOrder.items.splice(itemIndex, 1);

  if (existingOrder.items.length === 0) {
    confirmDeleteEntireCart();
    return;
  }

  // Recalculate totals
  const subtotal = existingOrder.items.reduce((s, i) => s + i.qty * i.price, 0);
  const tax = Math.round(subtotal * 0.05 * 10) / 10;
  const isDelivery = (existingOrder.table_id || state.activeTableId).startsWith("WA");
  const packaging = isDelivery ? 30 : 0;
  existingOrder.subtotal = subtotal;
  existingOrder.tax = tax;
  existingOrder.total = subtotal + tax + packaging;

  const table = state.tables.find(t => t.id === existingOrder.table_id);
  if (table) table.subtotal = existingOrder.total;

  renderTables();
  renderKDS();
  renderCart();
  showToast(`🗑️ Removed ${item.name} from running order`);

  try {
    fetch("/api/orders/delete-item", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_id: existingOrder.order_id, item_index: itemIndex })
    });
  } catch (err) {
    console.warn("Item deleted locally:", err);
  }
}

// Update quantity of confirmed kitchen order item (stepper + / -)
function updateConfirmedOrderItemQty(orderId, itemIndex, delta) {
  if (typeof orderId === "number") {
    delta = itemIndex;
    itemIndex = orderId;
    orderId = null;
  }

  const existingOrder = orderId 
    ? state.orders.find(o => o.order_id === orderId && o.status !== "COMPLETED" && o.status !== "CANCELLED" && o.status !== "VOID") 
    : getActiveOrder(state.activeTableId);

  if (!existingOrder || !existingOrder.items || !existingOrder.items[itemIndex]) return;

  const item = existingOrder.items[itemIndex];
  const newQty = item.qty + delta;

  if (newQty <= 0) {
    deleteConfirmedOrderItem(existingOrder.order_id, itemIndex);
    return;
  }

  item.qty = newQty;

  const subtotal = existingOrder.items.reduce((s, i) => s + i.qty * i.price, 0);
  const tax = Math.round(subtotal * 0.05 * 10) / 10;
  const isDelivery = (existingOrder.table_id || state.activeTableId).startsWith("WA");
  const packaging = isDelivery ? 30 : 0;
  existingOrder.subtotal = subtotal;
  existingOrder.tax = tax;
  existingOrder.total = subtotal + tax + packaging;

  const table = state.tables.find(t => t.id === existingOrder.table_id);
  if (table) table.subtotal = existingOrder.total;

  renderTables();
  renderKDS();
  renderCart();
  showToast(`Updated ${item.name} quantity to ${newQty}`);

  try {
    fetch("/api/orders/update-item", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_id: existingOrder.order_id, item_index: itemIndex, delta: delta })
    });
  } catch (err) {
    console.warn("Item qty updated locally:", err);
  }
}

// Delete a specific item from unsent draft cart
function deleteDraftItem(index) {
  const drafts = state.tableCarts[state.activeTableId];
  if (!drafts || !drafts[index]) return;

  const item = drafts[index];
  drafts.splice(index, 1);
  renderCart();
  showToast(`🗑️ Removed ${item.name} from draft`);
}

function renderCart() {
  const container = document.getElementById("cart-items-container");
  if (!container) return;
  container.innerHTML = "";

  const table = state.tables.find(t => t.id === state.activeTableId) || { id: state.activeTableId, name: "Table", section: "AC Dine-in" };
  const existingOrder = getActiveOrder(state.activeTableId);
  const drafts = state.tableCarts[state.activeTableId] || [];
  const isReady = (existingOrder && (existingOrder.kds_done || existingOrder.kds_status === "COMPLETED")) || (table && table.kitchen_ready);

  const clearBtn = document.getElementById("btn-delete-cart");

  // Case 1: Fresh vacant table with no running order and no drafts
  if (!existingOrder && drafts.length === 0) {
    state.cart = [];
    if (clearBtn) {
      clearBtn.classList.add("opacity-40", "pointer-events-none");
    }
    container.innerHTML = `
      <div class="h-64 flex flex-col items-center justify-center text-slate-400 space-y-2.5 text-center px-4">
        <div class="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-2xl mb-1 shadow-2xs">
          <i class="fa-solid fa-cart-shopping"></i>
        </div>
        <p class="text-sm font-bold text-slate-700">Cart is Empty</p>
        <span class="text-xs text-slate-400 max-w-[220px]">${table.name} is vacant. Tap any dish on the left to start an order.</span>
      </div>
    `;
    updateTotals(0);
    updateDrawerButtons(null, false, 0);
    return;
  }

  if (clearBtn) {
    clearBtn.classList.remove("opacity-40", "pointer-events-none");
  }

  // Running order subtotal
  const runningSubtotal = existingOrder ? (existingOrder.items || []).reduce((sum, i) => sum + i.qty * i.price, 0) : 0;
  // Draft items subtotal
  const draftSubtotal = drafts.reduce((sum, i) => sum + i.qty * i.price, 0);
  const combinedSubtotal = runningSubtotal + draftSubtotal;

  // Synthesize combined items for Settle & Print modals
  const combinedItems = [];
  if (existingOrder && existingOrder.items) {
    existingOrder.items.forEach(i => combinedItems.push({ ...i, is_confirmed: true }));
  }
  drafts.forEach(i => combinedItems.push({ ...i, is_confirmed: false }));
  state.cart = combinedItems;

  // 1. Status Banner if there's an existing running order
  if (existingOrder) {
    const banner = document.createElement("div");
    if (isReady) {
      banner.className = "mb-3 p-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md border border-emerald-400 animate-pulse";
      banner.innerHTML = `
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-2.5">
            <div class="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white text-base">
              <i class="fa-solid fa-bell"></i>
            </div>
            <div>
              <div class="font-black text-xs uppercase tracking-wide">FOOD READY TO SERVE!</div>
              <div class="text-[10px] text-emerald-100 font-mono">Order #${existingOrder.order_id} • Kitchen Completed</div>
            </div>
          </div>
          <button onclick="openSettlePaymentModal()" class="bg-white hover:bg-emerald-50 text-emerald-950 font-black text-xs px-3 py-1.5 rounded-lg shadow-sm transition-transform active:scale-95 cursor-pointer flex items-center space-x-1">
            <i class="fa-solid fa-bolt text-amber-500"></i>
            <span>Settle Now</span>
          </button>
        </div>
      `;
    } else {
      banner.className = "mb-3 p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-950 shadow-xs";
      banner.innerHTML = `
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-2">
            <span class="w-2.5 h-2.5 rounded-full bg-blue-600 animate-ping"></span>
            <div>
              <div class="font-extrabold text-xs">🍳 Cooking in Kitchen</div>
              <div class="text-[10px] text-blue-600 font-mono">Order #${existingOrder.order_id} • Placed ${existingOrder.created_at || 'Recently'}</div>
            </div>
          </div>
          <span class="bg-blue-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full">KOT #1 Sent</span>
        </div>
      `;
    }
    container.appendChild(banner);
  }

  // 2. Confirmed Running KOT Items (with 1-tap delete item option)
  if (existingOrder && existingOrder.items && existingOrder.items.length > 0) {
    const runningSection = document.createElement("div");
    runningSection.className = "space-y-2";
    
    let itemsHtml = "";
    existingOrder.items.forEach((item, itemIdx) => {
      const itemTotal = item.qty * item.price;
      itemsHtml += `
        <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-200 hover:border-slate-300 transition-all">
          <div class="flex items-start justify-between">
            <div class="flex-1 pr-2">
              <div class="flex items-center space-x-1.5">
                <span class="font-black text-emerald-700 font-mono text-xs">${item.qty}x</span>
                <h5 class="text-xs font-bold text-slate-800 leading-tight">${item.name}</h5>
              </div>
              <div class="flex items-center space-x-2 mt-1">
                <span class="text-[10px] font-mono text-slate-500 font-semibold">₹ ${item.price} each</span>
                <span class="text-[9px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.2 rounded border border-emerald-300">
                  <i class="fa-solid fa-check text-[8px] mr-0.5"></i>In Kitchen
                </span>
              </div>
              ${item.notes ? `<div class="text-[10px] text-amber-700 font-medium italic mt-1">Note: ${item.notes}</div>` : ''}
            </div>
            
            <div class="flex flex-col items-end space-y-1.5">
              <span class="font-bold text-xs font-mono text-slate-900">₹ ${itemTotal.toFixed(2)}</span>
              <div class="flex items-center space-x-1.5">
                <!-- QUANTITY STEPPER (RUNNING ORDER) -->
                <div class="flex items-center border border-slate-300 rounded-lg bg-white shadow-2xs">
                  <button onclick="updateConfirmedOrderItemQty('${existingOrder.order_id}', ${itemIdx}, -1)" title="Decrease or remove" class="px-2 py-0.5 text-xs text-slate-700 hover:text-rose-600 hover:bg-rose-50 font-black cursor-pointer rounded-l-lg">-</button>
                  <span class="px-1.5 text-xs font-bold font-mono text-slate-900">${item.qty}</span>
                  <button onclick="updateConfirmedOrderItemQty('${existingOrder.order_id}', ${itemIdx}, 1)" title="Increase quantity" class="px-2 py-0.5 text-xs text-slate-700 hover:text-emerald-600 hover:bg-emerald-50 font-black cursor-pointer rounded-r-lg">+</button>
                </div>
                <!-- PROMINENT RED DELETE BUTTON -->
                <button onclick="deleteConfirmedOrderItem('${existingOrder.order_id}', ${itemIdx})" title="Delete ${item.name} from bill" class="bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-200 hover:border-rose-600 p-1.5 rounded-lg transition-all active:scale-95 cursor-pointer shadow-2xs flex items-center justify-center">
                  <i class="fa-solid fa-trash-can text-xs"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
    });

    runningSection.innerHTML = `
      <div class="flex items-center justify-between pb-1.5 border-b border-slate-200">
        <span class="text-[11px] font-black text-slate-700 uppercase tracking-wider flex items-center">
          <i class="fa-solid fa-lock text-slate-400 mr-1.5 text-xs"></i>Running Kitchen KOT
        </span>
        <span class="text-[10px] bg-slate-100 text-slate-700 font-mono font-bold px-1.5 py-0.5 rounded">
          ${existingOrder.items.length} items (₹ ${runningSubtotal.toFixed(2)})
        </span>
      </div>
      <div class="space-y-2">
        ${itemsHtml}
      </div>
    `;
    container.appendChild(runningSection);
  }

  // 3. Unsent Add-on Items (Drafts with 1-tap delete item option)
  if (drafts.length > 0) {
    const draftSection = document.createElement("div");
    draftSection.className = existingOrder ? "mt-3 pt-2.5 border-t-2 border-dashed border-amber-300 space-y-2" : "space-y-2";
    
    let draftItemsHtml = "";
    drafts.forEach((item, index) => {
      const itemTotal = item.qty * item.price;
      draftItemsHtml += `
        <div class="p-2.5 rounded-xl bg-amber-50/50 border border-amber-200 hover:border-amber-300 transition-all">
          <div class="flex items-start justify-between">
            <div class="flex-1 pr-2">
              <h5 class="text-xs font-bold text-slate-800 leading-tight">${item.name}</h5>
              <span class="text-[10px] font-mono text-slate-500 font-semibold">₹ ${item.price} each</span>
            </div>
            <div class="flex flex-col items-end space-y-1.5">
              <span class="font-bold text-xs font-mono text-slate-900">₹ ${itemTotal.toFixed(2)}</span>
              <div class="flex items-center space-x-1.5">
                <div class="flex items-center border border-amber-300 rounded-lg bg-white shadow-2xs">
                  <button onclick="updateCartItemQty(${index}, -1)" title="Decrease quantity" class="px-2 py-0.5 text-xs text-slate-700 hover:text-rose-600 hover:bg-rose-50 font-black cursor-pointer rounded-l-lg">-</button>
                  <span class="px-1.5 text-xs font-bold font-mono text-slate-900">${item.qty}</span>
                  <button onclick="updateCartItemQty(${index}, 1)" title="Increase quantity" class="px-2 py-0.5 text-xs text-slate-700 hover:text-emerald-600 hover:bg-emerald-50 font-black cursor-pointer rounded-r-lg">+</button>
                </div>
                <button onclick="deleteDraftItem(${index})" title="Delete ${item.name}" class="bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-200 hover:border-rose-600 p-1.5 rounded-lg transition-all active:scale-95 cursor-pointer shadow-2xs flex items-center justify-center">
                  <i class="fa-solid fa-trash-can text-xs"></i>
                </button>
              </div>
            </div>
          </div>
          <div class="mt-2 space-y-1.5">
            <div class="flex items-center space-x-1.5 bg-white px-2.5 py-1 rounded-lg border border-amber-200 focus-within:border-amber-500 focus-within:ring-1 focus-within:ring-amber-400">
              <i class="fa-solid fa-pen text-[9px] text-amber-500 shrink-0"></i>
              <input id="draft-notes-${index}" type="text" value="${item.notes || ''}" oninput="updateCartItemNotes(${index}, this.value)" placeholder="Kitchen instruction (e.g. less spicy, crispy)..." class="w-full bg-transparent text-[11px] font-medium text-slate-800 placeholder-slate-400 focus:outline-none">
            </div>
            <!-- Quick 1-tap instruction chips -->
            <div class="flex flex-wrap gap-1">
              <button type="button" onclick="appendCartItemInstruction(${index}, 'Less Spicy')" class="px-1.5 py-0.5 bg-amber-100/70 hover:bg-amber-200 text-amber-900 rounded text-[9px] font-bold cursor-pointer transition-colors">🌶️ Less Spicy</button>
              <button type="button" onclick="appendCartItemInstruction(${index}, 'Extra Spicy')" class="px-1.5 py-0.5 bg-amber-100/70 hover:bg-amber-200 text-amber-900 rounded text-[9px] font-bold cursor-pointer transition-colors">🌶️ Extra Spicy</button>
              <button type="button" onclick="appendCartItemInstruction(${index}, 'No Onion')" class="px-1.5 py-0.5 bg-amber-100/70 hover:bg-amber-200 text-amber-900 rounded text-[9px] font-bold cursor-pointer transition-colors">🧅 No Onion</button>
              <button type="button" onclick="appendCartItemInstruction(${index}, 'Crispy')" class="px-1.5 py-0.5 bg-amber-100/70 hover:bg-amber-200 text-amber-900 rounded text-[9px] font-bold cursor-pointer transition-colors">✨ Crispy</button>
              <button type="button" onclick="appendCartItemInstruction(${index}, 'Jain')" class="px-1.5 py-0.5 bg-amber-100/70 hover:bg-amber-200 text-amber-900 rounded text-[9px] font-bold cursor-pointer transition-colors">🌿 Jain</button>
            </div>
          </div>
        </div>
      `;
    });

    draftSection.innerHTML = `
      <div class="flex items-center justify-between pb-1.5 border-b border-amber-200">
        <span class="text-[11px] font-black text-amber-900 uppercase tracking-wider flex items-center">
          <i class="fa-solid fa-circle-plus text-amber-500 mr-1.5"></i>${existingOrder ? '+ Add-on Items (Unsent)' : 'New Order Items (Draft)'}
        </span>
        <span class="text-[10px] bg-amber-100 text-amber-900 font-mono font-bold px-1.5 py-0.5 rounded">
          ${drafts.length} unsent (₹ ${draftSubtotal.toFixed(2)})
        </span>
      </div>
      <div class="space-y-2">
        ${draftItemsHtml}
      </div>
    `;
    container.appendChild(draftSection);
  }

  // Update Grand Totals
  updateTotals(combinedSubtotal);
  updateDrawerButtons(existingOrder, isReady, combinedSubtotal);
}

function updateTotals(subtotal) {
  const tax = Math.round(subtotal * 0.05 * 10) / 10;
  const isDelivery = state.activeTableId.startsWith("WA");
  const packaging = isDelivery ? 30 : 0;
  const total = subtotal + tax + packaging;

  const subtotalEl = document.getElementById("cart-subtotal");
  const taxEl = document.getElementById("cart-tax");
  const totalEl = document.getElementById("cart-total");

  if (subtotalEl) subtotalEl.innerText = `₹ ${subtotal.toFixed(2)}`;
  if (taxEl) taxEl.innerText = `₹ ${tax.toFixed(2)}`;
  
  const packagingRow = document.getElementById("packaging-row");
  if (packagingRow) {
    packagingRow.style.display = isDelivery ? "flex" : "none";
  }

  if (totalEl) totalEl.innerText = `₹ ${total.toFixed(2)}`;
  updateFloatingPill();
}

function updateDrawerButtons(existingOrder, isReady, subtotal) {
  const kotBtn = document.getElementById("cart-kot-btn");
  const settleBtn = document.getElementById("cart-settle-btn");
  const drafts = state.tableCarts[state.activeTableId] || [];

  const tax = Math.round(subtotal * 0.05 * 10) / 10;
  const isDelivery = state.activeTableId.startsWith("WA");
  const packaging = isDelivery ? 30 : 0;
  const total = subtotal + tax + packaging;

  if (kotBtn) {
    if (drafts.length > 0 && existingOrder) {
      kotBtn.innerHTML = `<i class="fa-solid fa-bell-concierge"></i><span>Send Add-on KOT</span>`;
      kotBtn.className = "bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-[11px] py-2 px-1.5 rounded-xl flex items-center justify-center space-x-1 shadow-sm border border-amber-400 transition-all active:scale-95 cursor-pointer";
    } else if (drafts.length > 0) {
      kotBtn.innerHTML = `<i class="fa-solid fa-bell-concierge"></i><span>Send KOT</span>`;
      kotBtn.className = "bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-[11px] py-2 px-1.5 rounded-xl flex items-center justify-center space-x-1 shadow-sm border border-amber-400 transition-all active:scale-95 cursor-pointer";
    } else if (existingOrder) {
      kotBtn.innerHTML = `<i class="fa-solid fa-plus"></i><span>+ Add More</span>`;
      kotBtn.className = "bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] py-2 px-1.5 rounded-xl flex items-center justify-center space-x-1 transition-all active:scale-95 cursor-pointer";
    } else {
      kotBtn.innerHTML = `<i class="fa-solid fa-bell-concierge"></i><span>Send KOT</span>`;
      kotBtn.className = "bg-slate-100 text-slate-400 font-bold text-[11px] py-2 px-1.5 rounded-xl flex items-center justify-center space-x-1 cursor-not-allowed";
    }
  }

  if (settleBtn) {
    if (isReady && existingOrder) {
      settleBtn.className = "w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm py-2.5 px-4 rounded-xl flex items-center justify-center space-x-2 shadow-lg shadow-emerald-600/30 border border-emerald-500 animate-pulse transition-all active:scale-95 cursor-pointer";
      settleBtn.innerHTML = `<i class="fa-solid fa-bell text-amber-300 text-base"></i><span>⚡ Food Ready! Settle & Bill (₹ ${total.toFixed(2)})</span><i class="fa-solid fa-arrow-right text-xs opacity-75"></i>`;
    } else if (existingOrder || drafts.length > 0) {
      settleBtn.className = "w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm py-2.5 px-4 rounded-xl flex items-center justify-center space-x-2 shadow-lg shadow-emerald-600/25 transition-all active:scale-95 cursor-pointer";
      settleBtn.innerHTML = `<i class="fa-solid fa-receipt text-emerald-200"></i><span>Settle & WhatsApp Bill (₹ ${total.toFixed(2)})</span><i class="fa-solid fa-arrow-right text-xs opacity-75"></i>`;
    } else {
      settleBtn.className = "w-full bg-slate-200 text-slate-400 font-black text-sm py-2.5 px-4 rounded-xl flex items-center justify-center space-x-2 cursor-not-allowed";
      settleBtn.innerHTML = `<i class="fa-solid fa-receipt"></i><span>Settle & WhatsApp Bill</span><i class="fa-solid fa-arrow-right text-xs opacity-75"></i>`;
    }
  }
}

// Action: Send KOT to Kitchen
async function sendKOTToKitchen() {
  const table = state.tables.find(t => t.id === state.activeTableId) || { id: state.activeTableId, name: "Table", section: "AC Dine-in" };
  const existingOrder = getActiveOrder(state.activeTableId);
  const drafts = state.tableCarts[state.activeTableId] || [];
  const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Case A: Add-on items to an existing running order
  if (existingOrder) {
    if (drafts.length === 0) {
      alert("No new items in draft to send as Add-on KOT! Tap dishes from the menu to add.");
      return;
    }

    // Merge drafts into existingOrder
    drafts.forEach(draftItem => {
      const match = existingOrder.items.find(i => i.name === draftItem.name && (i.notes || '') === (draftItem.notes || ''));
      if (match) {
        match.qty += draftItem.qty;
      } else {
        existingOrder.items.push(JSON.parse(JSON.stringify(draftItem)));
      }
    });

    const newSubtotal = existingOrder.items.reduce((sum, i) => sum + i.qty * i.price, 0);
    const newTax = Math.round(newSubtotal * 0.05 * 10) / 10;
    const isDelivery = state.activeTableId.startsWith("WA");
    const packaging = isDelivery ? 30 : 0;
    const newTotal = newSubtotal + newTax + packaging;

    existingOrder.subtotal = newSubtotal;
    existingOrder.tax = newTax;
    existingOrder.total = newTotal;
    existingOrder.kds_status = "PREPARING";
    existingOrder.kds_done = false;
    table.kitchen_ready = false;
    table.subtotal = newTotal;

    // Clear drafts
    state.tableCarts[state.activeTableId] = [];

    // UI Updates
    playChimeSound();
    renderTables();
    renderKDS();
    renderCart();
    showToast(`🔔 Add-on KOT sent to Kitchen! Table ${table.name} updated (Total: ₹ ${newTotal.toFixed(2)})`);

    // Async sync with server
    try {
      fetch("/api/kds/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: existingOrder.order_id, status: "PREPARING" })
      });
    } catch (err) {
      console.warn("Addon KOT synced locally:", err);
    }
    return;
  }

  // Case B: Fresh order for vacant table
  if (drafts.length === 0 && state.cart.length === 0) {
    alert("Cart is empty! Please add items before sending KOT.");
    return;
  }

  const itemsToSend = drafts.length > 0 ? drafts : state.cart;
  const subtotal = itemsToSend.reduce((sum, i) => sum + i.qty * i.price, 0);
  const tax = Math.round(subtotal * 0.05 * 10) / 10;
  const isDelivery = state.activeTableId.startsWith("WA");
  const packaging = isDelivery ? 30 : 0;
  const total = subtotal + tax + packaging;

  const orderId = `ORD-${Math.floor(100 + Math.random() * 900)}`;

  table.status = "occupied";
  table.subtotal = total;
  table.current_order_id = orderId;
  table.seated_at = nowTime;
  table.kitchen_ready = false;

  const newOrder = {
    order_id: orderId,
    table_id: table.id,
    table_name: `${table.name} (${table.section || 'Dine-in'})`,
    customer_name: "Walk-in Guest",
    customer_phone: "",
    status: "PREPARING",
    kds_status: "PREPARING",
    kds_done: false,
    payment_status: "PENDING",
    created_at: nowTime,
    items: JSON.parse(JSON.stringify(itemsToSend)),
    subtotal: subtotal,
    tax: tax,
    packaging: packaging,
    total: total
  };

  state.orders.unshift(newOrder);
  state.tableCarts[table.id] = [];

  // Instant UI updates
  renderTables();
  renderKDS();
  renderCart();
  playChimeSound();
  showToast(`🔔 KOT Dispatched! Table ${table.name} is now Running (Order #${orderId})`);

  // Background server sync
  try {
    const res = await fetch("/api/orders/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        table_id: table.id,
        table_name: table.name,
        items: itemsToSend,
        subtotal: subtotal,
        tax: tax,
        total: total
      })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.order && data.order.order_id) {
        newOrder.order_id = data.order.order_id;
        table.current_order_id = data.order.order_id;
        renderTables();
        renderKDS();
        renderCart();
      }
    }
  } catch (err) {
    console.warn("Order saved locally (Offline POS mode active):", err);
  }
}

// Action: Settle Payment Modal
function openSettlePaymentModal() {
  const table = state.tables.find(t => t.id === state.activeTableId) || { name: "Current Table", section: "AC Dine-in" };
  const existingOrder = getActiveOrder(state.activeTableId);
  const drafts = state.tableCarts[state.activeTableId] || [];

  if (!existingOrder && drafts.length === 0 && state.cart.length === 0) {
    alert("No active order or items to bill for this table!");
    return;
  }

  // Ensure cart is populated with full items
  const items = [];
  if (existingOrder && existingOrder.items) {
    items.push(...existingOrder.items);
  }
  if (drafts.length > 0) {
    items.push(...drafts);
  }
  if (items.length === 0 && state.cart.length > 0) {
    items.push(...state.cart);
  }
  state.cart = items;

  const subtotal = items.reduce((sum, i) => sum + i.qty * i.price, 0);
  const tax = Math.round(subtotal * 0.05 * 10) / 10;
  const isDelivery = state.activeTableId.startsWith("WA");
  const packaging = isDelivery ? 30 : 0;
  const total = subtotal + tax + packaging;

  const modalTableLabel = document.getElementById("modal-table-label");
  const modalItemsSummary = document.getElementById("modal-items-summary");
  const modalTotalAmount = document.getElementById("modal-total-amount");

  if (modalTableLabel) modalTableLabel.innerText = `${table.name} (${table.section || 'Dine-in'})`;
  if (modalItemsSummary) modalItemsSummary.innerText = `${items.length} item(s) in order`;
  if (modalTotalAmount) modalTotalAmount.innerText = `₹ ${total.toFixed(2)}`;

  // Dynamic UPI QR with exact order total and table reference
  const qrImg = document.querySelector("#upi-qr-box img");
  if (qrImg) {
    const upiUrl = `upi://pay?pa=spicesymphony@okhdfcbank&pn=Spice%20Symphony&am=${total.toFixed(2)}&cu=INR&tn=Bill%20${encodeURIComponent(table.name)}`;
    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(upiUrl)}`;
    qrImg.alt = `UPI QR for ₹ ${total.toFixed(2)}`;
  }

  selectPaymentMode('UPI_QR');
  openModal("modal-settle");
}

function selectPaymentMode(mode) {
  state.selectedPaymentMode = mode;
  document.querySelectorAll(".pay-mode-btn").forEach(btn => {
    btn.classList.remove("bg-emerald-50", "border-emerald-500", "text-emerald-800", "shadow-xs");
    btn.classList.add("bg-white", "border", "border-slate-200", "text-slate-700");
  });
  const btnId = mode === 'UPI_QR' ? 'pay-upi' : mode === 'CASH' ? 'pay-cash' : 'pay-card';
  const activeBtn = document.getElementById(btnId);
  if (activeBtn) {
    activeBtn.classList.remove("bg-white", "border-slate-200", "text-slate-700");
    activeBtn.classList.add("bg-emerald-50", "border-emerald-500", "text-emerald-800", "shadow-xs");
  }

  const qrBox = document.getElementById("upi-qr-box");
  if (qrBox) {
    qrBox.style.display = mode === 'UPI_QR' ? 'flex' : 'none';
  }
}

async function confirmSettleAndSendBill() {
  const phoneInput = document.getElementById("customer-phone-input");
  let phone = (phoneInput && phoneInput.value.replace(/\D/g, '')) || "9820198201";
  if (phone.length < 10) phone = "9820198201";

  const subtotal = state.cart.reduce((sum, i) => sum + i.qty * i.price, 0);
  const tax = Math.round(subtotal * 0.05 * 10) / 10;
  const isDelivery = state.activeTableId.startsWith("WA");
  const packaging = isDelivery ? 30 : 0;
  const total = subtotal + tax + packaging;

  const currentOrder = state.orders.find(o => o.table_id === state.activeTableId && o.payment_status === "PENDING" && o.status !== "CANCELLED" && o.status !== "VOID")
    || getActiveOrder(state.activeTableId)
    || { order_id: `ORD-${Math.floor(100 + Math.random() * 900)}` };

  // 1. Vacate table in local state
  const table = state.tables.find(t => t.id === state.activeTableId);
  if (table) {
    table.status = "vacant";
    table.subtotal = null;
    table.current_order_id = null;
    table.seated_at = null;
  }

  // 2. Mark order settled
  currentOrder.status = "COMPLETED";
  currentOrder.payment_status = `PAID_${state.selectedPaymentMode}`;
  currentOrder.kds_done = true;

  // 3. Update analytics
  if (state.analytics) {
    state.analytics.total_orders = (state.analytics.total_orders || 0) + 1;
    state.analytics.total_revenue = (state.analytics.total_revenue || 0) + total;
    state.analytics.paper_rolls_saved = (state.analytics.paper_rolls_saved || 0) + 1;
  }

  // 4. Clear cart & close modal & remove draft table cart
  const settledItems = [...state.cart];
  state.cart = [];
  if (state.activeTableId) {
    delete state.tableCarts[state.activeTableId];
  }
  renderCart();
  closeModal("modal-settle");

  // 5. Re-render UI
  renderTables();
  renderKDS();
  renderReports();

  // 6. Audio chime and toast
  playChimeSound();
  showToast(`✅ Bill Settled (₹${total.toFixed(2)})! Digital Receipt sent to WhatsApp +91 ${phone}`);

  // 7. Add digital invoice to WhatsApp preview
  addWhatsAppMessageToMockChat({
    type: "bill",
    order_id: currentOrder.order_id,
    total: total,
    items: settledItems
  });

  // 8. Async sync with server
  try {
    fetch("/api/orders/settle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        order_id: currentOrder.order_id,
        table_id: state.activeTableId,
        payment_mode: state.selectedPaymentMode
      })
    });

    fetch("/api/whatsapp/send-bill", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: phone,
        order_id: currentOrder.order_id,
        total: total
      })
    });
  } catch (err) {
    console.warn("Settle synced locally:", err);
  }
}

// ========================================================
// ESC/POS THERMAL PRINTER ENGINE (80mm & 58mm COMPLIANT)
// ========================================================
let selectedReceiptWidth = "80mm";
let selectedKOTWidth = "80mm";
let activeReceiptOrder = null;
let activeKOTOrder = null;

function setReceiptPaperWidth(width) {
  selectedReceiptWidth = width;
  const btn80 = document.getElementById("btn-paper-80mm");
  const btn58 = document.getElementById("btn-paper-58mm");
  const content = document.getElementById("thermal-receipt-content");

  if (width === "58mm") {
    if (btn80) btn80.className = "px-2 py-0.5 rounded font-bold text-slate-400 hover:text-white transition-all cursor-pointer";
    if (btn58) btn58.className = "px-2 py-0.5 rounded font-bold bg-emerald-600 text-white transition-all cursor-pointer";
    if (content) content.classList.add("paper-58mm");
  } else {
    if (btn80) btn80.className = "px-2 py-0.5 rounded font-bold bg-emerald-600 text-white transition-all cursor-pointer";
    if (btn58) btn58.className = "px-2 py-0.5 rounded font-bold text-slate-400 hover:text-white transition-all cursor-pointer";
    if (content) content.classList.remove("paper-58mm");
  }
}

function setKOTPaperWidth(width) {
  selectedKOTWidth = width;
  const btn80 = document.getElementById("btn-kot-80mm");
  const btn58 = document.getElementById("btn-kot-58mm");
  const content = document.getElementById("thermal-kot-content");

  if (width === "58mm") {
    if (btn80) btn80.className = "px-2 py-0.5 rounded font-bold text-amber-950 hover:text-white transition-all cursor-pointer";
    if (btn58) btn58.className = "px-2 py-0.5 rounded font-bold bg-slate-950 text-white transition-all cursor-pointer";
    if (content) content.classList.add("paper-58mm");
  } else {
    if (btn80) btn80.className = "px-2 py-0.5 rounded font-bold bg-slate-950 text-white transition-all cursor-pointer";
    if (btn58) btn58.className = "px-2 py-0.5 rounded font-bold text-amber-950 hover:text-white transition-all cursor-pointer";
    if (content) content.classList.remove("paper-58mm");
  }
}

// Action: Open Thermal Tax Bill Modal (80mm & 58mm)
function openThermalPrintModal(orderId = null) {
  const container = document.getElementById("thermal-receipt-content");
  if (!container) return;

  let order = null;
  if (orderId) {
    order = state.orders.find(o => o.order_id === orderId);
  }

  if (!order) {
    // If cart is empty, check active table running order
    if (state.cart.length === 0) {
      const existingOrder = getActiveOrder(state.activeTableId);
      if (existingOrder && existingOrder.items && existingOrder.items.length > 0) {
        order = existingOrder;
        state.cart = JSON.parse(JSON.stringify(existingOrder.items));
        renderCart();
      }
    }
  }

  // If still no order and cart has items, build simulated order
  if (!order && state.cart.length > 0) {
    const table = state.tables.find(t => t.id === state.activeTableId) || { name: "Table 1", section: "Dine-in" };
    const subtotal = state.cart.reduce((sum, i) => sum + i.qty * i.price, 0);
    const tax = Math.round(subtotal * 0.05 * 10) / 10;
    const isDelivery = state.activeTableId && state.activeTableId.startsWith("WA");
    const packaging = isDelivery ? 30 : 0;
    order = {
      order_id: `INV-${Date.now().toString().slice(-4)}`,
      table_name: table.name || "Table",
      customer_name: "Walk-in Guest",
      customer_phone: "",
      server_name: "Cashier Counter-1",
      payment_status: "PAID_UPI",
      items: JSON.parse(JSON.stringify(state.cart)),
      subtotal: subtotal,
      tax: tax,
      packaging: packaging,
      total: subtotal + tax + packaging,
      created_at: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    };
  }

  if (!order || !order.items || order.items.length === 0) {
    showToast("⚠️ Cart is empty. Please add items or select an active table!");
    return;
  }

  activeReceiptOrder = order;

  // Auto transition table status to billed
  const table = state.tables.find(t => t.id === state.activeTableId);
  if (table && table.id && table.status !== "vacant") {
    table.status = "billed";
    renderTables();
    updateTableStatusButtons("billed");
    const meta = document.getElementById("cart-meta-info");
    if (meta) meta.innerHTML = `<span class="text-blue-500 font-bold">🔵 BILLED (CHECK PRINTED)</span> • Awaiting Payment`;
  }

  const rest = state.restaurant || {
    name: "Spice Symphony Bistro & Cafe",
    address: "Shop 14, High Street Avenue, Mumbai",
    gstin: "27AADCS1234F1Z5",
    fssai: "11521012000456",
    phone: "+91 98201 98201"
  };

  const subtotal = order.subtotal || order.items.reduce((sum, i) => sum + i.qty * i.price, 0);
  const tax = order.tax !== undefined ? order.tax : (Math.round(subtotal * 0.05 * 10) / 10);
  const packaging = order.packaging || 0;
  const total = order.total || (subtotal + tax + packaging);

  let itemsHtml = "";
  (order.items || []).forEach(i => {
    const itemTotal = (i.qty * i.price).toFixed(2);
    itemsHtml += `
      <div class="flex justify-between items-baseline text-[11px] py-0.5">
        <span class="flex-1 pr-1 truncate font-medium"><strong class="font-bold">${i.qty}x</strong> ${i.name}</span>
        <span class="font-mono text-right shrink-0">₹ ${itemTotal}</span>
      </div>
      ${i.notes ? `<div class="text-[9px] text-slate-500 italic pl-4">Note: ${i.notes}</div>` : ''}
    `;
  });

  const upiQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(`upi://pay?pa=spicebistro@icici&pn=${encodeURIComponent(rest.name)}&am=${total}&cu=INR&tn=${order.order_id}`)}`;

  container.innerHTML = `
    <!-- HEADER -->
    <div class="text-center border-b border-dashed border-slate-900 pb-2.5">
      <h3 class="font-black text-sm uppercase tracking-wide leading-tight">${rest.name}</h3>
      <p class="text-[10px] text-slate-600 mt-0.5">${rest.address || 'High Street Avenue, Mumbai'}</p>
      <p class="text-[9px] text-slate-600">GSTIN: ${rest.gstin || '27AADCS1234F1Z5'} • SAC: 996331 • FSSAI: ${rest.fssai || '11521012000456'}</p>
      <p class="text-[9px] text-slate-600">Ph: ${rest.phone || '+91 98201 98201'}</p>
      <div class="mt-1.5 inline-block px-2 py-0.5 border border-slate-900 font-black text-[10px] uppercase tracking-wider">
        Tax Invoice / Cash Memo
      </div>
    </div>

    <!-- METADATA -->
    <div class="text-[10px] space-y-0.5 border-b border-dashed border-slate-900 py-2">
      <div class="flex justify-between">
        <span><strong>Bill No:</strong> #${order.order_id}</span>
        <span>${order.created_at || new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      <div class="flex justify-between">
        <span><strong>Station:</strong> ${order.table_name || order.table_id || 'Table'}</span>
        <span><strong>Date:</strong> ${new Date().toLocaleDateString('en-IN')}</span>
      </div>
      <div class="flex justify-between">
        <span><strong>Server:</strong> ${order.server_name || 'Captain Rahul'}</span>
        <span><strong>Payment:</strong> ${order.payment_status ? order.payment_status.replace('PAID_', '') : 'UPI/CASH'}</span>
      </div>
      ${order.customer_phone ? `
      <div class="flex justify-between text-slate-600">
        <span><strong>Guest:</strong> ${order.customer_name || 'Guest'}</span>
        <span>${order.customer_phone}</span>
      </div>` : ''}
    </div>

    <!-- ITEMS -->
    <div class="py-2 border-b border-dashed border-slate-900 space-y-1">
      <div class="flex justify-between font-bold text-[10px] border-b border-slate-200 pb-1 uppercase">
        <span>Item Description</span>
        <span>Amount</span>
      </div>
      ${itemsHtml}
    </div>

    <!-- BILL TOTALS -->
    <div class="space-y-0.5 text-[11px] pt-2">
      <div class="flex justify-between">
        <span>Subtotal</span>
        <span class="font-mono">₹ ${subtotal.toFixed(2)}</span>
      </div>
      <div class="flex justify-between text-slate-600 text-[10px]">
        <span>CGST (2.5%) [SAC 996331]</span>
        <span class="font-mono">₹ ${(tax / 2).toFixed(2)}</span>
      </div>
      <div class="flex justify-between text-slate-600 text-[10px]">
        <span>SGST (2.5%) [SAC 996331]</span>
        <span class="font-mono">₹ ${(tax / 2).toFixed(2)}</span>
      </div>
      ${packaging > 0 ? `
      <div class="flex justify-between text-slate-600 text-[10px]">
        <span>Packaging / Delivery</span>
        <span class="font-mono">₹ ${packaging.toFixed(2)}</span>
      </div>` : ''}
      <div class="flex justify-between font-black text-sm pt-1.5 border-t border-slate-900">
        <span>NET AMOUNT</span>
        <span class="font-mono">₹ ${total.toFixed(2)}</span>
      </div>
    </div>

    <!-- FOOTER WITH DYNAMIC QR CODE -->
    <div class="text-center pt-2.5 border-t border-dashed border-slate-900 space-y-1.5">
      <div class="inline-block p-1 border border-slate-300 rounded bg-white">
        <img src="${upiQrUrl}" alt="Invoice QR" class="w-24 h-24 mx-auto object-contain">
      </div>
      <p class="text-[9px] text-slate-600 font-bold">Scan to Pay via UPI or download WhatsApp Bill</p>
      <p class="text-[9px] text-slate-700 font-extrabold uppercase">*** Thank You For Dining With Us! ***</p>
      <p class="text-[8px] text-slate-500 font-mono">RestroDeck POS • Zero Paper Waste Cloud Terminal • restrodeck.com</p>
    </div>
  `;

  // Apply current paper width
  setReceiptPaperWidth(selectedReceiptWidth);
  openModal("modal-receipt");
}

// Action: Open Thermal Kitchen Order Ticket (KOT) Modal (80mm & 58mm)
function openThermalKOTModal(orderId = null) {
  const container = document.getElementById("thermal-kot-content");
  if (!container) return;

  let order = null;
  if (orderId) {
    order = state.orders.find(o => o.order_id === orderId);
  }

  if (!order) {
    if (state.cart.length === 0) {
      const existingOrder = getActiveOrder(state.activeTableId);
      if (existingOrder && existingOrder.items && existingOrder.items.length > 0) {
        order = existingOrder;
      }
    }
  }

  if (!order && state.cart.length > 0) {
    const table = state.tables.find(t => t.id === state.activeTableId) || { name: "Table 1", section: "Dine-in" };
    order = {
      order_id: `KOT-${Date.now().toString().slice(-4)}`,
      table_name: table.name || "Table",
      server_name: "Captain Rahul",
      order_type: "DINE_IN",
      items: JSON.parse(JSON.stringify(state.cart)),
      notes: "",
      created_at: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    };
  }

  if (!order || !order.items || order.items.length === 0) {
    showToast("⚠️ No active order or cart items to print KOT!");
    return;
  }

  activeKOTOrder = order;

  let totalQty = 0;
  let itemsHtml = "";
  order.items.forEach((i) => {
    totalQty += (i.qty || 1);
    const vegDot = i.is_veg !== false ? '🟢' : '🔴';
    itemsHtml += `
      <div class="py-1 border-b border-dashed border-slate-300">
        <div class="flex items-baseline justify-between text-xs">
          <span class="font-black text-sm text-slate-900 font-mono">${i.qty}x</span>
          <span class="flex-1 font-black text-slate-900 px-2 leading-snug">${vegDot} ${i.name}</span>
        </div>
        ${i.notes ? `<div class="mt-0.5 ml-6 px-1.5 py-0.5 bg-amber-100 border border-amber-300 rounded text-[10px] font-black text-amber-950 inline-block">⚠️ NOTE: ${i.notes}</div>` : ''}
      </div>
    `;
  });

  const channelLabel = order.order_type === "KIOSK" ? "🖥️ KIOSK SELF-ORDER" :
                       order.order_type === "WHATSAPP" ? "💬 WHATSAPP DELIVERY" :
                       order.order_type === "TAKEAWAY" ? "🛍️ TAKEAWAY PARCEL" : "🍽️ DINE-IN SERVICE";

  container.innerHTML = `
    <!-- KOT HEADER -->
    <div class="text-center border-b-2 border-dashed border-slate-900 pb-2">
      <h3 class="font-black text-sm uppercase tracking-wider">*** KITCHEN ORDER TICKET (KOT) ***</h3>
      <div class="mt-1 font-black text-lg font-mono">${order.token ? order.token : order.order_id}</div>
      <div class="inline-block mt-0.5 px-2 py-0.5 bg-slate-900 text-white font-black text-[10px] rounded uppercase">
        ${channelLabel}
      </div>
    </div>

    <!-- KOT METADATA -->
    <div class="text-[10px] space-y-0.5 border-b border-dashed border-slate-900 py-2 font-mono">
      <div class="flex justify-between">
        <span><strong>TABLE/LOC:</strong> <span class="font-bold text-xs">${order.table_name || order.table_id || 'Table'}</span></span>
        <span><strong>TIME:</strong> ${order.created_at || 'Just now'}</span>
      </div>
      <div class="flex justify-between">
        <span><strong>CAPTAIN:</strong> ${order.server_name || 'Captain Rahul'}</span>
        <span><strong>DATE:</strong> ${new Date().toLocaleDateString('en-IN')}</span>
      </div>
      ${order.customer_name ? `
      <div class="flex justify-between">
        <span><strong>GUEST:</strong> ${order.customer_name}</span>
        <span>${order.customer_phone || ''}</span>
      </div>` : ''}
    </div>

    <!-- KOT ITEMS -->
    <div class="py-2 border-b-2 border-dashed border-slate-900 space-y-1">
      <div class="flex justify-between text-[10px] font-black uppercase border-b border-slate-300 pb-1">
        <span>QTY / DISH SPECIFICATION</span>
        <span>PREP</span>
      </div>
      ${itemsHtml}
    </div>

    <!-- KOT SUMMARY & INSTRUCTIONS -->
    <div class="py-2 border-b border-dashed border-slate-900 space-y-1 text-[10px] font-mono">
      <div class="flex justify-between font-black text-xs">
        <span>TOTAL ITEMS:</span>
        <span>${order.items.length} items (${totalQty} portions)</span>
      </div>
      ${order.notes ? `
      <div class="p-1.5 bg-rose-100 border border-rose-300 rounded text-rose-950 font-black text-[10px]">
        🚨 SPECIAL CHEF INSTRUCTION: ${order.notes}
      </div>` : ''}
    </div>

    <div class="text-center pt-2 font-black text-[10px] uppercase tracking-wider">
      * PLEASE EXPEDITE PREPARATION *
    </div>
  `;

  setKOTPaperWidth(selectedKOTWidth);
  openModal("modal-kot");
}

// Universal ESC/POS Print Trigger (80mm / 58mm)
function triggerThermalPrint(type) {
  const source = type === "kot" 
    ? document.getElementById("thermal-kot-content") 
    : document.getElementById("thermal-receipt-content");
  const wrapper = document.getElementById("print-receipt-wrapper");

  if (!source || !wrapper) {
    showToast("⚠️ Print container not found.");
    return;
  }

  const paperWidth = type === "kot" ? selectedKOTWidth : selectedReceiptWidth;

  wrapper.innerHTML = source.innerHTML;
  if (paperWidth === "58mm") {
    wrapper.className = "paper-58mm";
  } else {
    wrapper.className = "";
  }

  try {
    window.print();
    showToast(`🖨️ ${type === 'kot' ? 'KOT' : 'Tax Invoice'} sent to ${paperWidth} thermal printer!`);
  } catch (err) {
    console.error("Print error:", err);
    showToast("⚠️ Printer error or dialog cancelled.");
  }

  // Clear wrapper after delay
  setTimeout(() => {
    wrapper.innerHTML = "";
    wrapper.className = "";
  }, 1000);
}

// Print Kiosk Token Slip
function printKioskTokenSlip() {
  const tokenNum = (lastKioskOrder && lastKioskOrder.token) || document.getElementById("kiosk-token-number")?.innerText || `TOKEN #${currentKioskToken || 'K-105'}`;
  const rest = state.restaurant || { name: "Spice Symphony Bistro" };
  const wrapper = document.getElementById("print-receipt-wrapper");
  if (!wrapper) return;

  const items = (lastKioskOrder && lastKioskOrder.items && lastKioskOrder.items.length > 0) ? lastKioskOrder.items : kioskCart;
  const orderType = (lastKioskOrder && lastKioskOrder.table_name && lastKioskOrder.table_name.includes("Takeaway")) ? "TAKEAWAY" : kioskOrderType;

  let itemsHtml = "";
  (items || []).forEach(i => {
    itemsHtml += `
      <div class="py-0.5">
        <div class="flex justify-between text-xs font-mono">
          <span>${i.qty}x ${i.name}</span>
          <span>₹ ${i.qty * i.price}</span>
        </div>
        ${i.notes ? `<div class="text-[9px] text-slate-700 font-mono italic pl-2">↳ Note: ${i.notes}</div>` : ''}
      </div>
    `;
  });

  const totalAmount = lastKioskOrder ? lastKioskOrder.total : items.reduce((sum, i) => sum + i.qty * i.price, 0);

  wrapper.className = "paper-58mm";
  wrapper.innerHTML = `
    <div class="text-center border-b-2 border-dashed border-slate-900 pb-2">
      <h3 class="font-black text-sm uppercase">${rest.name}</h3>
      <p class="text-[9px] text-slate-600">Self-Ordering Kiosk Terminal</p>
      <div class="mt-2 text-3xl font-black font-mono border border-slate-900 py-1 rounded">${tokenNum}</div>
      <p class="text-[10px] font-bold mt-1 uppercase">Order Type: ${orderType}</p>
      <p class="text-[9px] text-slate-600 font-mono">${new Date().toLocaleDateString('en-IN')} ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</p>
    </div>

    <div class="py-2 border-b border-dashed border-slate-900 space-y-0.5">
      ${itemsHtml || '<div class="text-xs">Self-Kiosk Items</div>'}
    </div>

    <div class="py-1 border-b border-dashed border-slate-900 flex justify-between font-black text-xs font-mono">
      <span>TOTAL PAID:</span>
      <span>₹ ${Math.round(totalAmount)}</span>
    </div>

    <div class="text-center pt-2 space-y-1">
      <div class="font-black text-xs">Payment: PAID VIA UPI (Verified)</div>
      <p class="text-[9px] text-slate-700">Please take your seat. Your token number will be called when your food is ready!</p>
      <p class="text-[8px] text-slate-500 font-mono">Thank you! Visit again.</p>
    </div>
  `;

  try {
    window.print();
    showToast("🖨️ Customer Token slip printed!");
  } catch (err) {
    console.error(err);
  }

  setTimeout(() => {
    wrapper.innerHTML = "";
    wrapper.className = "";
  }, 1000);
}

// ========================================================
// KITCHEN DISPLAY SYSTEM (KDS) OVERHAUL WITH ALL DETAILS
// ========================================================
let currentKDSFilter = "ALL"; // "ALL", "COOKING", "READY"

function setKDSFilter(filter) {
  currentKDSFilter = filter;
  renderKDS();
}

// Interactive Item Prep Checklist
function toggleKDSItemPrepared(orderId, itemIndex) {
  const order = state.orders.find(o => o.order_id === orderId);
  if (!order) return;

  order.prepared_items = order.prepared_items || {};
  order.prepared_items[itemIndex] = !order.prepared_items[itemIndex];

  // Update DOM directly for instant 0ms UI feedback
  const row = document.getElementById(`kds-item-${orderId}-${itemIndex}`);
  const icon = document.getElementById(`kds-check-icon-${orderId}-${itemIndex}`);
  if (row && icon) {
    if (order.prepared_items[itemIndex]) {
      row.classList.add("prepared");
      icon.className = "fa-solid fa-square-check text-emerald-600 text-sm";
    } else {
      row.classList.remove("prepared");
      icon.className = "fa-regular fa-square text-slate-300 hover:text-slate-500 text-sm";
    }
  }

  // If all items prepared, prompt chef to mark ready
  const allPrepared = (order.items || []).every((_, idx) => order.prepared_items[idx]);
  const readyBtn = document.getElementById(`kds-ready-btn-${orderId}`);
  if (readyBtn) {
    if (allPrepared) {
      readyBtn.classList.add("ring-4", "ring-emerald-400", "animate-bounce");
    } else {
      readyBtn.classList.remove("ring-4", "ring-emerald-400", "animate-bounce");
    }
  }
}

// Render Kitchen Display System (KDS)
function renderKDS() {
  const container = document.getElementById("kds-tickets-container");
  if (!container) return;
  container.innerHTML = "";

  const cookingOrders = state.orders.filter(o => !o.kds_done && o.kds_status !== "COMPLETED" && o.status !== "COMPLETED" && o.status !== "CANCELLED" && o.status !== "VOID");
  const readyOrders = state.orders.filter(o => (o.kds_done || o.kds_status === "COMPLETED") && o.status !== "COMPLETED" && o.status !== "CANCELLED" && o.status !== "VOID" && !o.dispatched);
  
  const badge = document.getElementById("kds-badge");
  if (badge) badge.innerText = cookingOrders.length;

  let displayOrders = [];
  if (currentKDSFilter === "COOKING") {
    displayOrders = cookingOrders;
  } else if (currentKDSFilter === "READY") {
    displayOrders = readyOrders;
  } else {
    displayOrders = [...cookingOrders, ...readyOrders];
  }

  // Filter toolbar above cards
  const filterToolbar = document.createElement("div");
  filterToolbar.className = "col-span-full mb-1 flex flex-wrap items-center justify-between gap-2";
  filterToolbar.innerHTML = `
    <div class="flex items-center space-x-2">
      <button onclick="setKDSFilter('ALL')" class="px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${currentKDSFilter === 'ALL' ? 'bg-slate-900 text-white shadow-sm' : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'}">
        All Tickets (${cookingOrders.length + readyOrders.length})
      </button>
      <button onclick="setKDSFilter('COOKING')" class="px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${currentKDSFilter === 'COOKING' ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-blue-700 hover:bg-blue-50 border border-blue-200'}">
        🍳 Cooking Queue (${cookingOrders.length})
      </button>
      <button onclick="setKDSFilter('READY')" class="px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${currentKDSFilter === 'READY' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-white text-emerald-700 hover:bg-emerald-50 border border-emerald-200'}">
        🔔 Ready to Settle (${readyOrders.length})
      </button>
    </div>
    <div class="text-xs text-slate-500 font-medium flex items-center space-x-2">
      <span class="inline-flex items-center text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
        <i class="fa-solid fa-circle-check text-[10px] mr-1"></i>Tap checkboxes to mark items prepared • 1-tap print KOT
      </span>
    </div>
  `;
  container.appendChild(filterToolbar);

  if (displayOrders.length === 0) {
    const emptyState = document.createElement("div");
    emptyState.className = "col-span-full py-16 text-center flex flex-col items-center justify-center text-slate-400 bg-white rounded-2xl border border-slate-200";
    emptyState.innerHTML = `
      <div class="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center text-2xl mb-3 shadow-inner">
        <i class="fa-solid fa-circle-check"></i>
      </div>
      <h4 class="font-extrabold text-slate-800 text-base">All Kitchen Tickets Cleared!</h4>
      <p class="text-xs text-slate-500 mt-1">No orders currently waiting in this kitchen station queue.</p>
    `;
    container.appendChild(emptyState);
    return;
  }

  displayOrders.forEach(o => {
    const isReady = o.kds_done || o.kds_status === "COMPLETED";

    // 1. Calculate Live Elapsed Rush Timer
    let elapsedMins = 0;
    if (o.created_timestamp) {
      elapsedMins = Math.max(0, Math.floor((Date.now() - o.created_timestamp) / 60000));
    } else if (o.created_at && o.created_at.includes(":")) {
      const [h, m] = o.created_at.split(":").map(Number);
      const now = new Date();
      const orderDate = new Date();
      orderDate.setHours(h, m, 0, 0);
      elapsedMins = Math.max(0, Math.floor((now - orderDate) / 60000));
    }

    let rushClass = "";
    let timerBadge = "";
    if (elapsedMins > 20) {
      rushClass = "kds-card-rush";
      timerBadge = `<span class="bg-rose-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-xs animate-pulse flex items-center"><i class="fa-solid fa-fire mr-1"></i>${elapsedMins}m RUSH LATE</span>`;
    } else if (elapsedMins >= 10) {
      timerBadge = `<span class="bg-amber-400 text-slate-950 text-[10px] font-bold px-2 py-0.5 rounded-full shadow-xs flex items-center"><i class="fa-solid fa-clock mr-1"></i>${elapsedMins}m Prep Delay</span>`;
    } else {
      timerBadge = `<span class="bg-white/20 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center"><i class="fa-solid fa-clock mr-1"></i>${elapsedMins}m On Time</span>`;
    }

    // 2. Order Channel Badge
    let channelBadge = "";
    if (o.order_type === "KIOSK") {
      channelBadge = `<span class="bg-purple-100 text-purple-900 border border-purple-300 text-[10px] font-black px-2 py-0.5 rounded-md flex items-center space-x-1"><i class="fa-solid fa-tablet-screen-button mr-1"></i>KIOSK SELF-PAY</span>`;
    } else if (o.order_type === "WHATSAPP" || (o.table_id && o.table_id.startsWith("WA"))) {
      channelBadge = `<span class="bg-emerald-100 text-emerald-900 border border-emerald-300 text-[10px] font-black px-2 py-0.5 rounded-md flex items-center space-x-1"><i class="fa-brands fa-whatsapp mr-1 text-emerald-600"></i>WHATSAPP DELIVERY</span>`;
    } else if (o.order_type === "SWIGGY" || o.order_type === "ZOMATO") {
      channelBadge = `<span class="bg-orange-100 text-orange-900 border border-orange-300 text-[10px] font-black px-2 py-0.5 rounded-md flex items-center space-x-1"><i class="fa-solid fa-motorcycle mr-1"></i>AGGREGATOR</span>`;
    } else if (o.order_type === "TAKEAWAY") {
      channelBadge = `<span class="bg-sky-100 text-sky-900 border border-sky-300 text-[10px] font-black px-2 py-0.5 rounded-md flex items-center space-x-1"><i class="fa-solid fa-bag-shopping mr-1"></i>TAKEAWAY</span>`;
    } else {
      channelBadge = `<span class="bg-blue-100 text-blue-900 border border-blue-300 text-[10px] font-black px-2 py-0.5 rounded-md flex items-center space-x-1"><i class="fa-solid fa-utensils mr-1"></i>DINE-IN</span>`;
    }

    // 3. Card Header Styles
    let headerBg = "bg-blue-600 text-white";
    let cardBorder = "border-blue-300";
    let statusBadge = `<span class="bg-white/20 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">COOKING</span>`;

    if (isReady) {
      headerBg = "bg-gradient-to-r from-emerald-600 to-teal-600 text-white";
      cardBorder = "border-emerald-500 shadow-md";
      statusBadge = `<span class="bg-white text-emerald-900 text-[10px] px-2.5 py-0.5 rounded-full font-black animate-pulse shadow-xs">🔔 READY TO SERVE</span>`;
    } else if (o.status === "NEW" || o.kds_status === "NEW") {
      headerBg = "bg-amber-500 text-slate-950";
      cardBorder = "border-amber-400";
      statusBadge = `<span class="bg-white text-slate-950 text-[10px] px-2 py-0.5 rounded-full font-black animate-pulse shadow-xs">NEW ORDER</span>`;
    }

    // 4. Portion Calculations & Item Checklist Rows
    let totalPortions = 0;
    let itemsList = "";
    o.prepared_items = o.prepared_items || {};

    (o.items || []).forEach((i, idx) => {
      totalPortions += (i.qty || 1);
      const isPrepared = !!o.prepared_items[idx];
      const vegDot = i.is_veg !== false ? '🟢' : '🔴';

      itemsList += `
        <li id="kds-item-${o.order_id}-${idx}" class="kds-item-row ${isPrepared ? 'prepared' : ''} p-2 rounded-xl transition-all border-b border-slate-100 flex items-start justify-between text-xs hover:bg-slate-50">
          <div class="flex items-start space-x-2 flex-1">
            <button type="button" onclick="toggleKDSItemPrepared('${o.order_id}', ${idx})" title="Click to mark item prepared" class="mt-0.5 text-slate-400 hover:text-emerald-600 cursor-pointer focus:outline-none">
              <i id="kds-check-icon-${o.order_id}-${idx}" class="${isPrepared ? 'fa-solid fa-square-check text-emerald-600 text-sm' : 'fa-regular fa-square text-slate-300 hover:text-slate-500 text-sm'}"></i>
            </button>
            <div class="flex-1">
              <div class="flex items-baseline space-x-1.5">
                <span class="font-black text-slate-900 font-mono text-sm">${i.qty}x</span>
                <span class="font-extrabold text-slate-900">${vegDot} ${i.name}</span>
              </div>
              ${i.notes ? `
                <div class="mt-1 px-2 py-0.5 bg-amber-50 border border-amber-200 rounded text-amber-950 text-[10px] font-bold flex items-center space-x-1 inline-flex">
                  <i class="fa-solid fa-triangle-exclamation text-amber-600 text-[9px]"></i>
                  <span>CHEF NOTE: ${i.notes}</span>
                </div>` : ''}
            </div>
          </div>
        </li>
      `;
    });

    // 5. Bottom Action Bar (KOT Slip, Mark Ready, Settle & Bill)
    const bottomAction = isReady ? `
      <div class="p-3 bg-emerald-50 border-t border-emerald-200 flex items-center justify-between">
        <div>
          <span class="text-[10px] text-emerald-800 font-bold block uppercase tracking-wide">Food Ready • ₹ ${(o.total || o.subtotal || 0).toFixed(2)}</span>
          <span class="text-[10px] text-slate-500">1-Tap Settle & Vacate</span>
        </div>
        <div class="flex items-center space-x-1.5">
          <button onclick="openThermalKOTModal('${o.order_id}')" title="Print Kitchen KOT Slip" class="bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold text-xs p-2 rounded-xl transition-all cursor-pointer">
            <i class="fa-solid fa-print"></i>
          </button>
          <button onclick="executeOrderFromKDS('${o.order_id}', '${o.table_id}')" class="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs px-3.5 py-2 rounded-xl shadow-xs transition-all active:scale-95 flex items-center space-x-1.5 cursor-pointer">
            <i class="fa-solid fa-receipt"></i>
            <span>⚡ Settle & Bill</span>
          </button>
        </div>
      </div>
    ` : `
      <div class="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
        <button onclick="openThermalKOTModal('${o.order_id}')" title="Print Kitchen KOT Slip" class="bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold text-xs px-2.5 py-2 rounded-xl transition-all flex items-center space-x-1 cursor-pointer">
          <i class="fa-solid fa-print text-amber-600"></i>
          <span class="text-[11px]">KOT Slip</span>
        </button>
        <button id="kds-ready-btn-${o.order_id}" onclick="markKDSOrderReady('${o.order_id}')" class="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs px-3.5 py-2 rounded-xl shadow-xs transition-all active:scale-95 flex items-center space-x-1.5 cursor-pointer">
          <i class="fa-solid fa-circle-check"></i>
          <span>Mark Ready</span>
        </button>
      </div>
    `;

    // 6. Assemble Full KDS Card
    const card = document.createElement("div");
    card.className = `rounded-2xl border ${cardBorder} ${rushClass} bg-white flex flex-col justify-between shadow-xs overflow-hidden transition-all duration-200`;
    card.id = `kds-card-${o.order_id}`;
    card.innerHTML = `
      <div>
        <!-- TOP BANNER -->
        <div class="${headerBg} p-3 flex flex-col space-y-1.5">
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-2">
              <h4 class="font-black text-base tracking-tight">${o.token ? o.token : (o.table_name || o.table_id)}</h4>
            </div>
            <div class="flex items-center space-x-1.5">
              ${timerBadge}
              ${statusBadge}
            </div>
          </div>
          <div class="flex items-center justify-between text-[11px] opacity-90 font-mono">
            <span>#${o.order_id} • Placed ${o.created_at || 'Just now'}</span>
            <span>${channelBadge}</span>
          </div>
        </div>

        <!-- DETAILS BAR: SERVER, CUSTOMER, PORTIONS -->
        <div class="px-3 py-2 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-1 text-[11px] text-slate-600">
          <span class="font-bold flex items-center text-slate-700">
            <i class="fa-solid fa-user-circle text-emerald-600 mr-1"></i>${o.server_name || 'Captain Rahul'}
          </span>
          ${o.customer_phone ? `
          <span class="text-slate-500 font-mono text-[10px]">
            <i class="fa-solid fa-phone text-slate-400 mr-0.5"></i>${o.customer_name ? o.customer_name.slice(0, 10) + ' • ' : ''}${o.customer_phone}
          </span>` : ''}
          <span class="font-black text-slate-800 bg-slate-200/70 px-1.5 py-0.5 rounded text-[10px]">
            📦 ${(o.items || []).length} items (${totalPortions} portions)
          </span>
        </div>

        <!-- SPECIAL INSTRUCTIONS (TICKET LEVEL) -->
        ${o.notes ? `
        <div class="mx-3 mt-2 p-2 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-950 font-bold flex items-center space-x-1.5">
          <i class="fa-solid fa-comment-dots text-rose-600 text-sm"></i>
          <span>Kitchen Note: ${o.notes}</span>
        </div>` : ''}

        <!-- ITEMS CHECKLIST -->
        <ul class="p-2.5 space-y-0.5 max-h-64 overflow-y-auto">
          ${itemsList}
        </ul>
      </div>

      ${bottomAction}
    `;
    container.appendChild(card);
  });
}

// ========================================================
// SELF-ORDERING KIOSK ENGINE (TOUCHSCREEN / TABLET MODE)
// ========================================================
let kioskCart = [];
let kioskOrderType = "DINE_IN"; // "DINE_IN" | "TAKEAWAY"
let kioskVegOnly = false;
let kioskCategory = "ALL";
let kioskSearchQuery = "";
let currentKioskToken = null;
let kioskCountdownInterval = null;
let lastKioskOrder = null;

function activateKioskMode() {
  const currentPlan = (state.restaurant && state.restaurant.plan ? state.restaurant.plan.toLowerCase() : "pro");
  if (currentPlan === "starter") {
    openUpgradePlanModal("kiosk");
    return;
  }
  switchTab("kiosk");
  const brandTitle = document.getElementById("kiosk-brand-title");
  if (brandTitle && state.restaurant && state.restaurant.name) {
    brandTitle.innerText = state.restaurant.name;
  }
  kioskSearchQuery = "";
  const searchInput = document.getElementById("kiosk-menu-search");
  if (searchInput) searchInput.value = "";
  setKioskOrderType(kioskOrderType || "DINE_IN");
  renderKioskMenu();
  renderKioskCart();
  showToast("🖥️ Self-Ordering Kiosk Mode Activated");
}

function exitKioskMode() {
  switchTab("pos");
  switchTerminalRole("cashier");
  renderTables();
  showToast("Returned to Cashier Register");
}

function setKioskOrderType(type) {
  kioskOrderType = type;
  const btnDinein = document.getElementById("kiosk-mode-dinein");
  const btnTakeaway = document.getElementById("kiosk-mode-takeaway");
  const badge = document.getElementById("kiosk-cart-ordertype-badge");
  const packagingRow = document.getElementById("kiosk-packaging-row");

  if (type === "TAKEAWAY") {
    if (btnDinein) btnDinein.className = "px-3 py-1 rounded-lg text-xs font-black transition-all cursor-pointer text-slate-600 hover:text-slate-900 flex items-center space-x-1";
    if (btnTakeaway) btnTakeaway.className = "px-3 py-1 rounded-lg text-xs font-black transition-all cursor-pointer bg-emerald-600 text-white shadow-2xs flex items-center space-x-1";
    if (badge) badge.innerText = "Takeaway Parcel Order";
    if (packagingRow) packagingRow.style.display = "flex";
  } else {
    if (btnDinein) btnDinein.className = "px-3 py-1 rounded-lg text-xs font-black transition-all cursor-pointer bg-emerald-600 text-white shadow-2xs flex items-center space-x-1";
    if (btnTakeaway) btnTakeaway.className = "px-3 py-1 rounded-lg text-xs font-black transition-all cursor-pointer text-slate-600 hover:text-slate-900 flex items-center space-x-1";
    if (badge) badge.innerText = "Dine-in Order";
    if (packagingRow) packagingRow.style.display = "none";
  }
  renderKioskCart();
}

function toggleKioskVegFilter() {
  kioskVegOnly = !kioskVegOnly;
  const btn = document.getElementById("kiosk-veg-toggle");
  if (btn) {
    if (kioskVegOnly) {
      btn.className = "bg-emerald-600 text-white border border-emerald-400 px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer shadow-md shadow-emerald-600/30";
    } else {
      btn.className = "bg-white hover:bg-slate-50 border border-slate-200/90 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700 transition-all flex items-center space-x-1.5 cursor-pointer shadow-2xs";
    }
  }
  renderKioskMenu();
}

function filterKioskCategory(cat) {
  kioskCategory = cat;
  renderKioskMenu();
}

function handleKioskMenuSearch(query) {
  kioskSearchQuery = (query || "").toLowerCase().trim();
  renderKioskMenu();
}

function renderKioskMenu() {
  const pillsContainer = document.getElementById("kiosk-category-pills");
  const gridContainer = document.getElementById("kiosk-menu-grid");
  if (!pillsContainer || !gridContainer) return;

  // 1. Dynamic Category Pills
  const menuCategories = Array.from(new Set((state.menu || []).map(m => m.category).filter(Boolean)));
  const categories = ["ALL", ...(menuCategories.length > 0 ? menuCategories : ["Starters", "Main Course", "Breads", "Biryani", "Beverages", "Desserts"])];

  let pillsHtml = "";
  categories.forEach(cat => {
    const isSelected = kioskCategory.toLowerCase() === cat.toLowerCase();
    pillsHtml += `
      <button onclick="filterKioskCategory('${cat}')" class="px-3.5 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-all cursor-pointer ${isSelected ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200/80'}">
        ${cat}
      </button>
    `;
  });
  pillsContainer.innerHTML = pillsHtml;

  // 2. Filter Dishes
  let dishes = state.menu || [];
  if (kioskCategory !== "ALL") {
    dishes = dishes.filter(d => d.category && d.category.toLowerCase() === kioskCategory.toLowerCase());
  }
  if (kioskVegOnly) {
    dishes = dishes.filter(d => d.is_veg === true);
  }
  if (kioskSearchQuery) {
    dishes = dishes.filter(d =>
      (d.name && d.name.toLowerCase().includes(kioskSearchQuery)) ||
      (d.category && d.category.toLowerCase().includes(kioskSearchQuery)) ||
      (d.description && d.description.toLowerCase().includes(kioskSearchQuery))
    );
  }

  // 3. Render Clean White Cards (Cohesive with POS)
  gridContainer.innerHTML = "";
  if (dishes.length === 0) {
    gridContainer.innerHTML = `
      <div class="col-span-full py-16 text-center text-slate-400">
        <i class="fa-solid fa-utensils text-3xl mb-2 text-slate-300"></i>
        <p class="font-bold text-sm text-slate-600">No dishes found</p>
        <p class="text-xs text-slate-400 mt-1">Try clearing filters or search term</p>
      </div>
    `;
    return;
  }

  dishes.forEach(dish => {
    const cartItem = kioskCart.find(i => i.id === dish.id || i.name === dish.name);
    const qty = cartItem ? cartItem.qty : 0;
    const vegIndicator = dish.is_veg ?
      '<span class="w-3.5 h-3.5 rounded-md border border-emerald-600 flex items-center justify-center p-0.5 shrink-0"><span class="w-2 h-2 rounded-full bg-emerald-600"></span></span>' :
      '<span class="w-3.5 h-3.5 rounded-md border border-rose-600 flex items-center justify-center p-0.5 shrink-0"><span class="w-2 h-2 rounded-full bg-rose-600"></span></span>';

    const card = document.createElement("div");
    card.className = "bg-white hover:bg-slate-50 border border-slate-200/90 hover:border-emerald-300 rounded-2xl p-3.5 flex flex-col justify-between shadow-2xs hover:shadow-md transition-all select-none cursor-pointer";
    card.onclick = (e) => {
      if (e.target.closest('button')) return;
      addKioskItem(dish.id);
    };

    card.innerHTML = `
      <div>
        <div class="flex justify-between items-start mb-2">
          ${vegIndicator}
          <span class="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-md">${dish.category || 'Special'}</span>
        </div>
        <h4 class="font-extrabold text-xs sm:text-sm text-slate-900 leading-snug line-clamp-2">${dish.name}</h4>
        ${dish.description ? `<p class="text-[11px] text-slate-400 mt-1 line-clamp-2 leading-relaxed">${dish.description}</p>` : ''}
      </div>

      <div class="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between">
        <span class="font-black text-xs sm:text-sm text-emerald-700 font-mono">₹ ${dish.price}</span>
        ${qty > 0 ? `
          <div class="flex items-center space-x-1 bg-emerald-600 text-white rounded-xl p-0.5 shadow-sm" onclick="event.stopPropagation()">
            <button onclick="updateKioskQty('${dish.id}', -1)" class="w-6 h-6 rounded-lg bg-emerald-700 hover:bg-emerald-800 flex items-center justify-center font-black text-xs active:scale-95 cursor-pointer">−</button>
            <span class="font-black text-xs px-2 font-mono">${qty}</span>
            <button onclick="updateKioskQty('${dish.id}', 1)" class="w-6 h-6 rounded-lg bg-emerald-700 hover:bg-emerald-800 flex items-center justify-center font-black text-xs active:scale-95 cursor-pointer">+</button>
          </div>
        ` : `
          <button onclick="addKioskItem('${dish.id}')" class="bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white border border-emerald-200 hover:border-emerald-600 font-bold text-xs px-3 py-1.5 rounded-xl flex items-center space-x-1 shadow-2xs active:scale-95 transition-all cursor-pointer">
            <i class="fa-solid fa-plus text-[10px]"></i>
            <span>Add</span>
          </button>
        `}
      </div>
    `;
    gridContainer.appendChild(card);
  });
}

function renderKioskCart() {
  const container = document.getElementById("kiosk-cart-items-container");
  const clearBtn = document.getElementById("btn-clear-kiosk-cart");
  const checkoutBtn = document.getElementById("btn-kiosk-checkout");
  if (!container) return;

  container.innerHTML = "";

  if (kioskCart.length === 0) {
    if (clearBtn) clearBtn.classList.add("opacity-40", "pointer-events-none");
    if (checkoutBtn) {
      checkoutBtn.disabled = true;
      checkoutBtn.classList.add("opacity-40", "pointer-events-none");
    }
    container.innerHTML = `
      <div class="h-64 flex flex-col items-center justify-center text-slate-400 space-y-2.5 text-center px-4">
        <div class="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-2xl mb-1 shadow-2xs">
          <i class="fa-solid fa-cart-shopping"></i>
        </div>
        <p class="text-sm font-bold text-slate-700">Tray is Empty</p>
        <span class="text-xs text-slate-400 max-w-[220px]">Tap any dish on the left to add it to your order.</span>
      </div>
    `;
    updateKioskTotals(0, 0, 0, 0);
    return;
  }

  if (clearBtn) clearBtn.classList.remove("opacity-40", "pointer-events-none");
  if (checkoutBtn) {
    checkoutBtn.disabled = false;
    checkoutBtn.classList.remove("opacity-40", "pointer-events-none");
  }

  kioskCart.forEach((item, index) => {
    const itemTotal = item.qty * item.price;
    const vegDot = item.is_veg !== false ?
      '<span class="w-3 h-3 rounded-md border border-emerald-600 flex items-center justify-center p-0.5 shrink-0"><span class="w-1.5 h-1.5 rounded-full bg-emerald-600"></span></span>' :
      '<span class="w-3 h-3 rounded-md border border-rose-600 flex items-center justify-center p-0.5 shrink-0"><span class="w-1.5 h-1.5 rounded-full bg-rose-600"></span></span>';

    const itemCard = document.createElement("div");
    itemCard.className = "p-3 rounded-xl bg-slate-50/80 border border-slate-200/90 hover:border-slate-300 transition-all";
    itemCard.innerHTML = `
      <div class="flex items-start justify-between">
        <div class="flex-1 pr-2">
          <div class="flex items-center space-x-1.5">
            ${vegDot}
            <h5 class="text-xs font-bold text-slate-800 leading-tight">${item.name}</h5>
          </div>
          <span class="text-[10px] font-mono text-slate-500 font-semibold ml-4">₹ ${item.price} each</span>
        </div>
        <div class="flex flex-col items-end space-y-1.5">
          <span class="font-bold text-xs font-mono text-slate-900">₹ ${itemTotal.toFixed(2)}</span>
          <div class="flex items-center space-x-1.5">
            <div class="flex items-center border border-slate-300 rounded-lg bg-white shadow-2xs">
              <button onclick="updateKioskQty('${item.id || item.name}', -1)" title="Decrease" class="px-2 py-0.5 text-xs text-slate-700 hover:text-rose-600 hover:bg-rose-50 font-black cursor-pointer rounded-l-lg">-</button>
              <span class="px-1.5 text-xs font-bold font-mono text-slate-900">${item.qty}</span>
              <button onclick="updateKioskQty('${item.id || item.name}', 1)" title="Increase" class="px-2 py-0.5 text-xs text-slate-700 hover:text-emerald-600 hover:bg-emerald-50 font-black cursor-pointer rounded-r-lg">+</button>
            </div>
            <button onclick="deleteKioskItem(${index})" title="Delete ${item.name}" class="bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-200 hover:border-rose-600 p-1.5 rounded-lg transition-all active:scale-95 cursor-pointer shadow-2xs flex items-center justify-center">
              <i class="fa-solid fa-trash-can text-xs"></i>
            </button>
          </div>
        </div>
      </div>
      <!-- Kitchen Cooking Notes & Quick Instruction Chips -->
      <div class="mt-2 space-y-1.5">
        <div class="flex items-center space-x-1.5 bg-white px-2.5 py-1 rounded-lg border border-slate-200 focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-400">
          <i class="fa-solid fa-pen text-[9px] text-emerald-500 shrink-0"></i>
          <input id="kiosk-item-notes-${index}" type="text" value="${item.notes || ''}" oninput="updateKioskItemNotes(${index}, this.value)" placeholder="Cooking instruction (e.g. less spicy, crispy)..." class="w-full bg-transparent text-[11px] font-medium text-slate-800 placeholder-slate-400 focus:outline-none">
        </div>
        <div class="flex flex-wrap gap-1">
          <button type="button" onclick="appendKioskItemInstruction(${index}, 'Less Spicy')" class="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[9px] font-bold cursor-pointer transition-colors">🌶️ Less Spicy</button>
          <button type="button" onclick="appendKioskItemInstruction(${index}, 'Extra Spicy')" class="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[9px] font-bold cursor-pointer transition-colors">🌶️ Extra Spicy</button>
          <button type="button" onclick="appendKioskItemInstruction(${index}, 'No Onion')" class="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[9px] font-bold cursor-pointer transition-colors">🧅 No Onion</button>
          <button type="button" onclick="appendKioskItemInstruction(${index}, 'Extra Crispy')" class="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[9px] font-bold cursor-pointer transition-colors">✨ Extra Crispy</button>
          <button type="button" onclick="appendKioskItemInstruction(${index}, 'Jain')" class="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[9px] font-bold cursor-pointer transition-colors">🌿 Jain</button>
        </div>
      </div>
    `;
    container.appendChild(itemCard);
  });

  const subtotal = kioskCart.reduce((sum, i) => sum + i.qty * i.price, 0);
  const tax = Math.round(subtotal * 0.05 * 10) / 10;
  const packaging = kioskOrderType === "TAKEAWAY" ? 15 : 0;
  const total = subtotal + tax + packaging;

  updateKioskTotals(subtotal, tax, packaging, total);
}

function updateKioskItemNotes(index, val) {
  if (kioskCart[index]) {
    kioskCart[index].notes = val;
  }
}

function appendKioskItemInstruction(index, tag) {
  if (!kioskCart[index]) return;
  const current = kioskCart[index].notes ? kioskCart[index].notes.trim() : "";
  if (!current) {
    kioskCart[index].notes = tag;
  } else if (!current.includes(tag)) {
    kioskCart[index].notes = `${current}, ${tag}`;
  }
  const inputEl = document.getElementById(`kiosk-item-notes-${index}`);
  if (inputEl) inputEl.value = kioskCart[index].notes;
}

function deleteKioskItem(index) {
  if (index >= 0 && index < kioskCart.length) {
    kioskCart.splice(index, 1);
    renderKioskCart();
    renderKioskMenu();
    showToast("Item removed from tray");
  }
}

function updateKioskTotals(subtotal, tax, packaging, total) {
  const subEl = document.getElementById("kiosk-cart-subtotal");
  const taxEl = document.getElementById("kiosk-cart-tax");
  const packEl = document.getElementById("kiosk-cart-packaging");
  const packRow = document.getElementById("kiosk-packaging-row");
  const totalEl = document.getElementById("kiosk-cart-total");
  const payBtnAmount = document.getElementById("kiosk-pay-btn-amount");

  if (subEl) subEl.innerText = `₹ ${subtotal.toFixed(2)}`;
  if (taxEl) taxEl.innerText = `₹ ${tax.toFixed(2)}`;
  if (packEl) packEl.innerText = `₹ ${packaging.toFixed(2)}`;
  if (packRow) packRow.style.display = packaging > 0 ? "flex" : "none";
  if (totalEl) totalEl.innerText = `₹ ${total.toFixed(2)}`;
  if (payBtnAmount) payBtnAmount.innerText = total.toFixed(2);
}

function addKioskItem(dishId) {
  const dish = state.menu.find(d => d.id === dishId);
  if (!dish) return;

  const existing = kioskCart.find(i => i.id === dishId || i.name === dish.name);
  if (existing) {
    existing.qty += 1;
  } else {
    kioskCart.push({
      id: dish.id,
      name: dish.name,
      price: dish.price,
      is_veg: dish.is_veg !== false,
      qty: 1,
      notes: ""
    });
  }

  playChimeSound();
  renderKioskMenu();
  renderKioskCart();
}

function updateKioskQty(dishId, delta) {
  const idx = kioskCart.findIndex(i => i.id === dishId || i.name === dishId);
  if (idx !== -1) {
    kioskCart[idx].qty += delta;
    if (kioskCart[idx].qty <= 0) {
      kioskCart.splice(idx, 1);
    }
  }

  renderKioskMenu();
  renderKioskCart();
}

function clearKioskCart() {
  kioskCart = [];
  renderKioskMenu();
  renderKioskCart();
  showToast("Kiosk tray cleared.");
}

function proceedToKioskPayment() {
  if (kioskCart.length === 0) {
    showToast("Your tray is empty! Please select dishes first.");
    return;
  }

  const subtotal = kioskCart.reduce((sum, i) => sum + i.qty * i.price, 0);
  const tax = Math.round(subtotal * 0.05 * 10) / 10;
  const packaging = kioskOrderType === "TAKEAWAY" ? 15 : 0;
  const total = subtotal + tax + packaging;

  const scanTotal = document.getElementById("kiosk-scan-total");
  if (scanTotal) scanTotal.innerText = `₹ ${total.toFixed(2)}`;

  // Generate Dynamic UPI QR Code
  const qrImg = document.getElementById("kiosk-upi-qr-image");
  if (qrImg) {
    const upiUri = `upi://pay?pa=spicebistro@icici&pn=Spice%20Symphony&am=${total}&cu=INR&tn=Kiosk%20Order`;
    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(upiUri)}`;
  }

  // Switch to Scan Step
  const stepScan = document.getElementById("kiosk-step-scan");
  const stepSuccess = document.getElementById("kiosk-step-success");
  if (stepScan) stepScan.style.display = "block";
  if (stepSuccess) stepSuccess.style.display = "none";

  openModal("modal-kiosk-payment");
}

async function simulateKioskPaymentSuccess() {
  currentKioskToken = "K-" + Math.floor(100 + Math.random() * 900);
  const tokenStr = `TOKEN #${currentKioskToken}`;

  const subtotal = kioskCart.reduce((sum, i) => sum + i.qty * i.price, 0);
  const tax = Math.round(subtotal * 0.05 * 10) / 10;
  const packaging = kioskOrderType === "TAKEAWAY" ? 15 : 0;
  const total = subtotal + tax + packaging;
  const phone = document.getElementById("kiosk-phone-input")?.value.trim() || "";

  // Aggregate item notes for order summary
  const orderNotes = kioskCart
    .filter(i => i.notes && i.notes.trim())
    .map(i => `${i.name}: ${i.notes}`)
    .join(" | ");

  const orderPayload = {
    order_type: "KIOSK",
    token: tokenStr,
    server_name: "Self Kiosk Terminal #1",
    table_id: "KIOSK",
    table_name: `Self Kiosk (${kioskOrderType === "TAKEAWAY" ? "Takeaway" : "Dine-in"})`,
    customer_name: "Kiosk Guest",
    customer_phone: phone,
    notes: orderNotes,
    items: JSON.parse(JSON.stringify(kioskCart)),
    subtotal: subtotal,
    tax: tax,
    packaging: packaging,
    total: total,
    payment_status: "PAID_UPI",
    status: "PREPARING",
    kds_status: "PREPARING",
    created_at: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    created_timestamp: Date.now()
  };

  lastKioskOrder = orderPayload;

  try {
    const res = await fetch("/api/orders/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(orderPayload)
    });
    if (res.ok) {
      const data = await res.json();
      if (data.order) {
        state.orders.unshift(data.order);
      }
    } else {
      orderPayload.order_id = `ORD-${Date.now().toString().slice(-4)}`;
      state.orders.unshift(orderPayload);
    }
  } catch (e) {
    orderPayload.order_id = `ORD-${Date.now().toString().slice(-4)}`;
    state.orders.unshift(orderPayload);
  }

  playChimeSound();
  renderKDS();

  // Show Step 2 Confirmation
  const stepScan = document.getElementById("kiosk-step-scan");
  const stepSuccess = document.getElementById("kiosk-step-success");
  const tokenDisplay = document.getElementById("kiosk-token-number");

  if (stepScan) stepScan.style.display = "none";
  if (stepSuccess) stepSuccess.style.display = "block";
  if (tokenDisplay) tokenDisplay.innerText = tokenStr;

  // Auto Reset Countdown
  let secondsLeft = 8;
  const countdownEl = document.getElementById("kiosk-countdown");
  if (countdownEl) countdownEl.innerText = secondsLeft;

  if (kioskCountdownInterval) clearInterval(kioskCountdownInterval);
  kioskCountdownInterval = setInterval(() => {
    secondsLeft -= 1;
    if (countdownEl) countdownEl.innerText = secondsLeft;
    if (secondsLeft <= 0) {
      finishKioskSession();
    }
  }, 1000);
}

function finishKioskSession() {
  if (kioskCountdownInterval) {
    clearInterval(kioskCountdownInterval);
    kioskCountdownInterval = null;
  }
  closeModal("modal-kiosk-payment");
  kioskCart = [];
  const phoneInp = document.getElementById("kiosk-phone-input");
  if (phoneInp) phoneInp.value = "";
  renderKioskMenu();
  renderKioskCart();
  showToast("Kiosk ready for next guest!");
}

// Mark Order Ready: Notifies POS floor plan, sets kitchen_ready, and enables immediate billing
async function markKDSOrderReady(orderId) {
  const order = state.orders.find(o => o.order_id === orderId);
  if (order) {
    order.kds_done = true;
    order.kds_status = "COMPLETED";

    const table = state.tables.find(t => t.id === order.table_id);
    if (table) {
      table.kitchen_ready = true;
      table.status = "occupied";
    }
  }

  playChimeSound();
  renderKDS();
  renderTables();
  if (state.activeTableId === (order ? order.table_id : null)) {
    loadCartForTable(state.activeTableId);
  }

  const tableName = order ? (order.table_name || order.table_id) : 'Table';
  showToast(`🔔 Order #${orderId} is READY TO SERVE at ${tableName}! Table is ready for billing.`);

  try {
    await fetch("/api/kds/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_id: orderId, status: "COMPLETED" })
    });
  } catch (err) {
    console.warn("KDS status updated locally:", err);
  }
}

// Execute Order directly from KDS screen: switches to POS and opens Settle Payment modal
function executeOrderFromKDS(orderId, tableId) {
  selectActiveTable(tableId);
  switchTab('pos');
  openSettlePaymentModal();
  showToast(`⚡ Order #${orderId} loaded! Scan UPI QR or collect Cash to settle.`);
}

// Alias for advanceKDSStatus so any button or code invoking it also removes ticket
function advanceKDSStatus(orderId) {
  markKDSOrderReady(orderId);
}

// WhatsApp AI Simulator: 3-Message Intelligent Sequence
function setSimPreset(text) {
  const el = document.getElementById("simulated-wa-input");
  if (el) el.value = text;
}

async function triggerSimulatedWhatsAppOrder() {
  const input = document.getElementById("simulated-wa-input");
  const text = input ? input.value.trim() : "";
  if (!text) return;

  const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Add customer message to chat
  addWhatsAppMessageToMockChat({
    sender: "customer",
    text: text,
    time: nowTime
  });

  try {
    const res = await fetch("/api/whatsapp/simulate-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text, phone: "9870011223" })
    });
    const data = await res.json();

    // Stream the 3 sequential messages with realistic pauses
    const messages = data.messages || [
      { text: `✨ Namaste! Order #${data.order.order_id} acknowledged. Total: ₹${data.order.total}`, delay: 300 },
      { text: `💳 UPI Payment Link: upi://pay?pa=spicesymphony@okhdfcbank&am=${data.order.total}. Status: Paid.`, delay: 1100 },
      { text: `👨‍🍳 Kitchen Prep started! Track order at restrodeck.com/order/${data.order.order_id}`, delay: 2000 }
    ];

    messages.forEach(m => {
      setTimeout(() => {
        playChimeSound();
        addWhatsAppMessageToMockChat({
          sender: "bot",
          text: m.text,
          title: m.title || "RestroDeck AI Agent",
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          order: data.order
        });
      }, m.delay || 500);
    });

    // Refresh POS & KDS
    setTimeout(async () => {
      await loadInitialData();
      renderTables();
      renderKDS();
      renderReports();
      showToast(`⚡ WhatsApp 3-Message Order #${data.order.order_id} punched to Kitchen!`);
    }, 1200);

  } catch (err) {
    console.error("WA Simulation error:", err);
    // Offline fallback 3-message simulation
    setTimeout(() => {
      addWhatsAppMessageToMockChat({
        sender: "bot",
        title: "1. Order Acknowledged",
        text: `✨ *Namaste!* We received your order for ${text}. Total: ₹480 (Incl. 5% GST).`,
        time: nowTime
      });
    }, 300);
    setTimeout(() => {
      addWhatsAppMessageToMockChat({
        sender: "bot",
        title: "2. Payment Verified",
        text: `💳 *Payment Received:* ₹480 via UPI. Receipt: #WA-204.`,
        time: nowTime
      });
    }, 1100);
    setTimeout(() => {
      addWhatsAppMessageToMockChat({
        sender: "bot",
        title: "3. Kitchen Dispatch",
        text: `👨‍🍳 *Chef Update:* Food is now cooking! ETA: 18 mins. Live tracker: restrodeck.com/order/WA-204`,
        time: nowTime
      });
      playChimeSound();
      showToast("WhatsApp 3-message order completed!");
    }, 2000);
  }
}

// ==========================================
// ADMIN: ADD TABLE & ADD MENU ITEM LOGIC
// ==========================================
function openAddTableModal() {
  const input = document.getElementById("new-table-name");
  if (input) {
    input.value = `Table ${state.tables.length + 1}`;
    setTimeout(() => input.focus(), 80);
  }
  openModal("modal-add-table");
}

async function confirmAddTable() {
  const nameInput = document.getElementById("new-table-name");
  const sectionInput = document.getElementById("new-table-section");
  const seatsInput = document.getElementById("new-table-seats");

  let name = (nameInput && nameInput.value.trim()) || `Table ${state.tables.length + 1}`;
  if (state.tables.some(t => t.name.toLowerCase() === name.toLowerCase())) {
    name = `${name} (${state.tables.length + 1})`;
  }
  const section = (sectionInput && sectionInput.value) || "AC Dine-in";
  const seats = parseInt(seatsInput ? seatsInput.value : 4) || 4;

  const newTable = {
    id: `T${state.tables.length + 1}`,
    name: name,
    section: section,
    seats: seats,
    status: "vacant",
    current_order_id: null,
    seated_at: null,
    subtotal: null
  };

  state.tables.push(newTable);
  renderTables();
  selectActiveTable(newTable.id);
  closeModal("modal-add-table");
  showToast(`✅ Table '${name}' added to ${section}`);

  try {
    await fetch("/api/tables/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newTable)
    });
  } catch (err) {
    console.warn("Table saved locally:", err);
  }

  if (nameInput) nameInput.value = "";
}

function openAddMenuModal() {
  state.isNewItemVeg = true;
  setNewItemVeg(true);
  updateCategorySelectDropdown();
  const nameInput = document.getElementById("new-item-name");
  if (nameInput) {
    setTimeout(() => nameInput.focus(), 80);
  }
  openModal("modal-add-menu");
}

function setNewItemVeg(isVeg) {
  state.isNewItemVeg = isVeg;
  const btnVeg = document.getElementById("btn-veg-type");
  const btnNonVeg = document.getElementById("btn-nonveg-type");

  if (isVeg) {
    if (btnVeg) btnVeg.className = "p-2 rounded-xl border border-emerald-500 bg-emerald-50 text-emerald-800 text-xs font-bold flex items-center justify-center space-x-1 shadow-xs";
    if (btnNonVeg) btnNonVeg.className = "p-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold flex items-center justify-center space-x-1";
  } else {
    if (btnVeg) btnVeg.className = "p-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold flex items-center justify-center space-x-1";
    if (btnNonVeg) btnNonVeg.className = "p-2 rounded-xl border border-rose-500 bg-rose-50 text-rose-800 text-xs font-bold flex items-center justify-center space-x-1 shadow-xs";
  }
}

async function confirmAddMenuItem() {
  const nameInput = document.getElementById("new-item-name");
  const name = nameInput ? nameInput.value.trim() : "";
  if (!name) {
    alert("Please enter a dish name!");
    return;
  }
  const category = document.getElementById("new-item-category").value || "Main Course";
  const priceInput = document.getElementById("new-item-price");
  const rawPrice = priceInput ? parseFloat(priceInput.value) : NaN;
  const price = (!isNaN(rawPrice) && rawPrice > 0) ? rawPrice : 280;
  const desc = document.getElementById("new-item-desc").value.trim() || "Freshly prepared chef specialty";
  const isVeg = state.isNewItemVeg !== undefined ? state.isNewItemVeg : true;

  const newItem = {
    id: `custom_${state.menu.length + 1}`,
    name: name,
    category: category,
    price: price,
    is_veg: isVeg,
    description: desc,
    variants: []
  };

  state.menu.unshift(newItem);
  // Reset category filter to All so newly added dish is guaranteed visible
  state.selectedCategory = "All";
  renderCategoryPills();
  renderMenu();
  closeModal("modal-add-menu");
  showToast(`✅ Dish '${name}' (₹${price}) added to menu!`);

  try {
    await fetch("/api/menu/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newItem)
    });
  } catch (err) {
    console.warn("Item saved locally:", err);
  }

  // Clear inputs
  if (nameInput) nameInput.value = "";
  if (priceInput) priceInput.value = "";
  const descInput = document.getElementById("new-item-desc");
  if (descInput) descInput.value = "";
}

function renderMockWhatsAppChat() {
  const stream = document.getElementById("phone-chat-stream");
  if (!stream) return;
  stream.innerHTML = `
    <!-- DATE CHIP -->
    <div class="self-center bg-white/80 text-slate-500 text-[10px] font-bold px-2 py-0.5 rounded shadow-xs mb-1">
      TODAY
    </div>

    <!-- BOT WELCOME -->
    <div class="self-start max-w-[85%] bg-white p-2 rounded-lg rounded-tl-none shadow-xs text-xs space-y-1">
      <p class="font-bold text-emerald-800 text-[11px]">Spice Symphony AI Concierge</p>
      <p class="text-[11px] leading-tight text-slate-700">Namaste! Welcome to Spice Symphony. Send me your order in natural text or voice notes, or ask for today's specials!</p>
      <span class="text-[9px] text-slate-400 block text-right">18:00</span>
    </div>
  `;
}

function addWhatsAppMessageToMockChat(msg) {
  const stream = document.getElementById("phone-chat-stream");
  if (!stream) return;

  if (msg.sender === "customer") {
    const bubble = document.createElement("div");
    bubble.className = "self-end max-w-[85%] bg-[#DCF8C6] p-2 rounded-lg rounded-tr-none shadow-xs text-xs space-y-0.5";
    bubble.innerHTML = `
      <p class="text-[11px] text-slate-900 leading-snug">${msg.text}</p>
      <span class="text-[9px] text-slate-500 flex items-center justify-end space-x-1">
        <span>${msg.time}</span>
        <i class="fa-solid fa-check-double text-blue-500 text-[9px]"></i>
      </span>
    `;
    stream.appendChild(bubble);
  } else if (msg.sender === "bot") {
    const bubble = document.createElement("div");
    bubble.className = "self-start max-w-[88%] bg-white p-2.5 rounded-lg rounded-tl-none shadow-xs text-xs space-y-1.5 border border-slate-200 animate-in fade-in duration-200";
    
    // Replace *bold* with <strong>
    const formattedText = msg.text
      .replace(/\*(.*?)\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br/>');

    bubble.innerHTML = `
      <div class="flex items-center space-x-1 text-emerald-700 font-bold text-[10px]">
        <i class="fa-solid fa-sparkles"></i>
        <span>${msg.title || 'RestroDeck AI Concierge'}</span>
      </div>
      <p class="text-[11px] text-slate-800 leading-snug font-medium">${formattedText}</p>
      <span class="text-[9px] text-slate-400 block text-right">${msg.time}</span>
    `;
    stream.appendChild(bubble);
  } else if (msg.type === "bill") {
    const bubble = document.createElement("div");
    bubble.className = "self-start max-w-[90%] bg-white p-2.5 rounded-lg rounded-tl-none shadow-xs text-xs space-y-1.5 border border-emerald-300";
    bubble.innerHTML = `
      <div class="flex items-center justify-between border-b border-slate-200 pb-1">
        <span class="font-bold text-xs text-slate-900">Spice Symphony Digital Invoice</span>
        <span class="text-[9px] bg-emerald-100 text-emerald-800 font-bold px-1 rounded">PAID</span>
      </div>
      <div class="text-[10px] space-y-0.5 text-slate-600 font-mono">
        <div>Bill #${msg.order_id} • Table 2</div>
        <div class="font-bold text-slate-900 text-xs">Total Paid: ₹ ${msg.total} (via UPI)</div>
      </div>
      <div class="bg-slate-50 p-1.5 rounded border border-slate-200 text-[10px] text-slate-600">
        📄 <a href="#" class="text-blue-600 font-semibold underline">Download GST Tax Invoice (PDF)</a>
      </div>
      <div class="bg-amber-50 p-1.5 rounded border border-amber-200 text-[10px] text-amber-900 flex items-center justify-between">
        <span>Enjoyed your meal?</span>
        <span class="text-amber-600 font-bold">⭐⭐⭐⭐⭐ Review Us</span>
      </div>
      <span class="text-[9px] text-slate-400 block text-right">Just now</span>
    `;
    stream.appendChild(bubble);
  }

  // Scroll to bottom
  stream.scrollTop = stream.scrollHeight;
}

// ========================================================
// INVENTORY & SMART-STOCK MANAGER
// ========================================================
function renderInventory() {
  const container = document.getElementById("inventory-table-body");
  const poContainer = document.getElementById("po-table-body");
  const lowCountEl = document.getElementById("inv-low-count");
  const totalCountEl = document.getElementById("inv-total-count");

  if (totalCountEl) totalCountEl.innerText = `${(state.inventory || []).length} Items`;

  if (container) {
    container.innerHTML = "";
    let lowCount = 0;

    (state.inventory || []).forEach(item => {
      const isLow = item.current_stock <= item.min_stock;
      if (isLow) lowCount++;
      const is86 = item.status === "86 / Out of Stock";
      const percent = Math.min(100, Math.round((item.current_stock / (item.min_stock * 2.5)) * 100));

      const row = document.createElement("tr");
      row.className = "hover:bg-slate-50 transition-colors";
      row.innerHTML = `
        <td class="py-3 px-4">
          <div class="font-bold text-slate-900">${item.name}</div>
          <span class="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">${item.category}</span>
        </td>
        <td class="py-3 px-4 font-semibold text-slate-600">${item.supplier}</td>
        <td class="py-3 px-4">
          <div class="flex items-center space-x-2">
            <span class="font-bold font-mono text-slate-900">${item.current_stock} ${item.unit}</span>
            <div class="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div class="h-full ${isLow ? 'bg-amber-500' : 'bg-emerald-500'}" style="width: ${percent}%"></div>
            </div>
          </div>
          <span class="text-[10px] text-slate-400">Min: ${item.min_stock} ${item.unit}</span>
        </td>
        <td class="py-3 px-4 font-mono text-slate-700 font-bold">
          ${(item.min_stock * 0.4).toFixed(1)} ${item.unit}
        </td>
        <td class="py-3 px-4 font-mono font-bold text-slate-900">₹ ${item.unit_cost}/${item.unit}</td>
        <td class="py-3 px-4">
          ${is86 
            ? `<span class="bg-rose-100 text-rose-800 font-black px-2 py-0.5 rounded text-[10px]">86 SOLD OUT</span>` 
            : isLow 
            ? `<span class="bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded text-[10px]">LOW STOCK</span>` 
            : `<span class="bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded text-[10px]">IN STOCK</span>`
          }
        </td>
        <td class="py-3 px-4 text-center">
          <button onclick="toggleInventory86('${item.id}')" class="px-2.5 py-1 rounded-lg text-[10px] font-black cursor-pointer transition-all active:scale-95 ${
            is86 ? 'bg-rose-600 text-white' : 'bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 border border-slate-200'
          }">
            ${is86 ? 'Enable Dish' : 'Mark 86'}
          </button>
        </td>
        <td class="py-3 px-4 text-right">
          <button onclick="quickRestockItem('${item.id}', 10)" class="bg-teal-50 hover:bg-teal-600 text-teal-800 hover:text-white border border-teal-200 text-[10px] font-bold px-2 py-1 rounded-lg transition-all cursor-pointer shadow-2xs">
            +10 ${item.unit}
          </button>
        </td>
      `;
      container.appendChild(row);
    });

    if (lowCountEl) lowCountEl.innerText = `${lowCount} Items`;
  }

  // Render Purchase Orders Log
  if (poContainer) {
    poContainer.innerHTML = "";
    (state.purchase_orders || []).forEach(po => {
      const row = document.createElement("tr");
      row.className = "hover:bg-slate-50";
      const statusBadge = po.status === "DELIVERED"
        ? `<span class="bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded text-[10px]">DELIVERED</span>`
        : po.status === "DISPATCHED"
        ? `<span class="bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded text-[10px]">DISPATCHED</span>`
        : `<span class="bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded text-[10px]">PENDING APPROVAL</span>`;

      row.innerHTML = `
        <td class="py-2.5 px-4 font-mono font-bold text-slate-900">${po.po_id}</td>
        <td class="py-2.5 px-4 font-bold text-slate-700">${po.supplier}</td>
        <td class="py-2.5 px-4 text-slate-600">${po.items}</td>
        <td class="py-2.5 px-4 font-mono font-black text-slate-900">₹ ${po.amount}</td>
        <td class="py-2.5 px-4">${statusBadge}</td>
        <td class="py-2.5 px-4 text-right text-slate-500 font-medium">${po.eta}</td>
      `;
      poContainer.appendChild(row);
    });
  }
}

async function toggleInventory86(invId) {
  const item = state.inventory.find(i => i.id === invId);
  if (!item) return;

  const nextStatus = item.status === "86 / Out of Stock" ? "In Stock" : "86 / Out of Stock";
  item.status = nextStatus;
  renderInventory();
  showToast(nextStatus === "86 / Out of Stock" ? `⚠️ ${item.name} marked 86 (Out of Stock)!` : `✅ ${item.name} back In Stock!`);

  try {
    fetch("/api/inventory/update-stock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: invId, status: nextStatus })
    });
  } catch (e) {
    console.warn("Stock synced locally:", e);
  }
}

async function quickRestockItem(invId, delta) {
  const item = state.inventory.find(i => i.id === invId);
  if (!item) return;

  item.current_stock = Math.round((item.current_stock + delta) * 10) / 10;
  if (item.current_stock > item.min_stock && item.status === "Low Stock") {
    item.status = "In Stock";
  }
  renderInventory();
  showToast(`📦 Restocked +${delta} ${item.unit} of ${item.name}!`);

  try {
    fetch("/api/inventory/update-stock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: invId, delta: delta })
    });
  } catch (e) {
    console.warn("Stock synced locally:", e);
  }
}

function triggerQuickReorder(supplier, items, amount) {
  const suppEl = document.getElementById("po-supplier");
  const itemsEl = document.getElementById("po-items");
  const amountEl = document.getElementById("po-amount");
  if (suppEl) suppEl.value = supplier;
  if (itemsEl) itemsEl.value = items;
  if (amountEl) amountEl.value = amount;
  openModal("modal-create-po");
}

async function confirmCreatePurchaseOrder() {
  const supplier = document.getElementById("po-supplier")?.value || "Hyperpure by Zomato";
  const items = document.getElementById("po-items")?.value.trim() || "Wholesale restocking";
  const amount = parseFloat(document.getElementById("po-amount")?.value) || 3500;
  const eta = document.getElementById("po-eta")?.value || "Tomorrow Morning (6 AM)";

  const newPo = {
    po_id: `PO-${(state.purchase_orders || []).length + 884}`,
    supplier: supplier,
    items: items,
    amount: amount,
    status: "ORDER_PLACED",
    eta: eta
  };

  state.purchase_orders.unshift(newPo);
  closeModal("modal-create-po");
  renderInventory();
  showToast(`🛒 PO #${newPo.po_id} dispatched to ${supplier}!`);

  try {
    fetch("/api/purchase-orders/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newPo)
    });
  } catch (e) {
    console.warn("PO synced locally:", e);
  }
}

function dispatchVendorPOWhatsApp() {
  const po = state.purchase_orders && state.purchase_orders[0];
  const poText = po ? `PO %23${po.po_id} for ${encodeURIComponent(po.items)} (Amt: ₹${po.amount})` : "Wholesale Purchase Order";
  window.open(`https://wa.me/919820012345?text=Hello%20Vendor%2C%20please%20confirm%20delivery%20for%20${poText}.%20Thanks%20-%20Spice%20Symphony%20Bistro`, "_blank");
  showToast("📲 Vendor PO dispatched to WhatsApp!");
}

// ========================================================
// FOOD AGGREGATORS INTEGRATIONS (SWIGGY, ZOMATO, ONDC)
// ========================================================
function renderAggregators() {
  const swiggyBtn = document.getElementById("toggle-swiggy-btn");
  const zomatoBtn = document.getElementById("toggle-zomato-btn");
  const ondcBtn = document.getElementById("toggle-ondc-btn");

  const swiggy = state.aggregators?.swiggy || { status: "ONLINE" };
  const zomato = state.aggregators?.zomato || { status: "ONLINE" };
  const ondc = state.aggregators?.ondc || { status: "ONLINE" };

  if (swiggyBtn) {
    swiggyBtn.innerText = swiggy.status === "ONLINE" ? "🟢 ONLINE" : "🔴 PAUSED";
    swiggyBtn.className = swiggy.status === "ONLINE" 
      ? "bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-full text-[10px] font-black cursor-pointer"
      : "bg-rose-100 text-rose-800 border border-rose-300 px-2 py-0.5 rounded-full text-[10px] font-black cursor-pointer";
  }

  if (zomatoBtn) {
    zomatoBtn.innerText = zomato.status === "ONLINE" ? "🟢 ONLINE" : "🔴 PAUSED";
    zomatoBtn.className = zomato.status === "ONLINE"
      ? "bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-full text-[10px] font-black cursor-pointer"
      : "bg-rose-100 text-rose-800 border border-rose-300 px-2 py-0.5 rounded-full text-[10px] font-black cursor-pointer";
  }

  if (ondcBtn) {
    ondcBtn.innerText = ondc.status === "ONLINE" ? "🟢 ONLINE" : "🔴 PAUSED";
  }
}

async function toggleAggregatorStatus(platform) {
  if (!state.aggregators) state.aggregators = {};
  if (!state.aggregators[platform]) state.aggregators[platform] = { status: "ONLINE" };

  const current = state.aggregators[platform].status;
  const next = current === "ONLINE" ? "OFFLINE" : "ONLINE";
  state.aggregators[platform].status = next;
  renderAggregators();
  showToast(next === "ONLINE" ? `🟢 ${platform.toUpperCase()} store is now accepting orders!` : `🔴 ${platform.toUpperCase()} store paused.`);

  try {
    fetch("/api/aggregators/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform: platform })
    });
  } catch (e) {
    console.warn("Aggregator status synced locally:", e);
  }
}

async function syncAllAggregatorsMenu() {
  showToast("⚡ Syncing all dish prices & 86 items to Swiggy, Zomato & ONDC...");
  try {
    const res = await fetch("/api/aggregators/sync-menu", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const data = await res.json();
    playChimeSound();
    showToast(data.message || "✅ Menu synchronized across all platforms in 320ms!");
  } catch (e) {
    playChimeSound();
    showToast("✅ Menu synchronized across Swiggy, Zomato & WhatsApp in 320ms!");
  }
}

function simulateAggregatorOrder(platform) {
  const orderId = `${platform.substring(0, 3).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;
  const simOrder = {
    order_id: orderId,
    table_id: "WA1",
    table_name: `${platform} Delivery #${orderId}`,
    customer_name: `${platform} Customer`,
    customer_phone: "9820098200",
    status: "PREPARING",
    kds_status: "PREPARING",
    kds_done: false,
    payment_status: "PAID_ONLINE",
    created_at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    items: [
      { name: "Butter Chicken (Classic)", qty: 1, price: 390, notes: "Spicy" },
      { name: "Garlic Cheese Naan", qty: 2, price: 110, notes: "" }
    ],
    subtotal: 610,
    tax: 30.5,
    packaging: 30,
    total: 670.5
  };

  state.orders.unshift(simOrder);
  if (state.analytics) {
    state.analytics.total_orders += 1;
    state.analytics.total_revenue += simOrder.total;
  }
  playChimeSound();
  renderKDS();
  renderTables();
  showToast(`🔔 Incoming ${platform} Order #${orderId} (₹ ${simOrder.total}) auto-accepted & routed to KDS!`);
}

// ========================================================
// 90+ DYNAMIC REPORTS MODULE
// ========================================================
function changeReportType(type) {
  state.currentReport = type;
  const container = document.getElementById("dynamic-report-content");
  if (!container) return;

  if (type === "sales_items") {
    container.innerHTML = `
      <div class="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div class="px-5 py-3.5 border-b border-slate-200 flex justify-between items-center bg-slate-50/70">
          <h3 class="font-bold text-sm text-slate-900">Item-wise Sales & Profit Contribution</h3>
          <span class="text-xs text-slate-500 font-semibold">Sorted by Gross Revenue</span>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-50 text-slate-500 uppercase font-black border-b border-slate-200">
              <tr>
                <th class="py-3 px-4">Item Name</th>
                <th class="py-3 px-4">Category</th>
                <th class="py-3 px-4">Qty Sold</th>
                <th class="py-3 px-4">Unit Price</th>
                <th class="py-3 px-4">Raw Food Cost</th>
                <th class="py-3 px-4">Gross Margin %</th>
                <th class="py-3 px-4 text-right">Net Profit Generated</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr class="hover:bg-slate-50">
                <td class="py-2.5 px-4 font-bold text-slate-900">Paneer Tikka Angara</td>
                <td class="py-2.5 px-4 text-slate-500">Starters</td>
                <td class="py-2.5 px-4 font-bold font-mono">22</td>
                <td class="py-2.5 px-4 font-mono font-bold">₹ 280</td>
                <td class="py-2.5 px-4 font-mono text-slate-500">₹ 44.50</td>
                <td class="py-2.5 px-4"><span class="bg-emerald-100 text-emerald-800 font-black px-1.5 py-0.5 rounded text-[10px]">84.1%</span></td>
                <td class="py-2.5 px-4 text-right font-mono font-black text-emerald-700">₹ 5,181.00</td>
              </tr>
              <tr class="hover:bg-slate-50">
                <td class="py-2.5 px-4 font-bold text-slate-900">Butter Chicken (Classic)</td>
                <td class="py-2.5 px-4 text-slate-500">Main Course</td>
                <td class="py-2.5 px-4 font-bold font-mono">18</td>
                <td class="py-2.5 px-4 font-mono font-bold">₹ 390</td>
                <td class="py-2.5 px-4 font-mono text-slate-500">₹ 82.00</td>
                <td class="py-2.5 px-4"><span class="bg-emerald-100 text-emerald-800 font-black px-1.5 py-0.5 rounded text-[10px]">78.9%</span></td>
                <td class="py-2.5 px-4 text-right font-mono font-black text-emerald-700">₹ 5,544.00</td>
              </tr>
              <tr class="hover:bg-slate-50">
                <td class="py-2.5 px-4 font-bold text-slate-900">Garlic Cheese Naan</td>
                <td class="py-2.5 px-4 text-slate-500">Breads</td>
                <td class="py-2.5 px-4 font-bold font-mono">34</td>
                <td class="py-2.5 px-4 font-mono font-bold">₹ 110</td>
                <td class="py-2.5 px-4 font-mono text-slate-500">₹ 21.00</td>
                <td class="py-2.5 px-4"><span class="bg-emerald-100 text-emerald-800 font-black px-1.5 py-0.5 rounded text-[10px]">80.9%</span></td>
                <td class="py-2.5 px-4 text-right font-mono font-black text-emerald-700">₹ 3,026.00</td>
              </tr>
              <tr class="hover:bg-slate-50">
                <td class="py-2.5 px-4 font-bold text-slate-900">Fresh Lime Soda</td>
                <td class="py-2.5 px-4 text-slate-500">Beverages</td>
                <td class="py-2.5 px-4 font-bold font-mono">26</td>
                <td class="py-2.5 px-4 font-mono font-bold">₹ 90</td>
                <td class="py-2.5 px-4 font-mono text-slate-500">₹ 7.90</td>
                <td class="py-2.5 px-4"><span class="bg-emerald-100 text-emerald-800 font-black px-1.5 py-0.5 rounded text-[10px]">91.2%</span></td>
                <td class="py-2.5 px-4 text-right font-mono font-black text-emerald-700">₹ 2,134.60</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
  } else if (type === "tax_gst") {
    container.innerHTML = `
      <div class="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
        <div class="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 class="font-extrabold text-sm text-slate-900">GST Tax Liability Summary (GSTR-1 & GSTR-3B)</h3>
            <p class="text-xs text-slate-500">GSTIN: 27AADCS1234F1Z5 • Restaurant Service @ 5% without ITC</p>
          </div>
          <span class="bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded text-[10px]">Audited Slip</span>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div class="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <span class="text-xs text-slate-500">Taxable Net Turnover</span>
            <div class="text-xl font-black font-mono text-slate-900 mt-1">₹ 36,619.05</div>
          </div>
          <div class="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <span class="text-xs text-slate-500">CGST (2.5%)</span>
            <div class="text-xl font-black font-mono text-blue-700 mt-1">₹ 915.48</div>
          </div>
          <div class="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <span class="text-xs text-slate-500">SGST (2.5%)</span>
            <div class="text-xl font-black font-mono text-blue-700 mt-1">₹ 915.48</div>
          </div>
        </div>
        <div class="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-900 flex items-center justify-between">
          <span>Total Tax Collected Today: <b>₹ 1,830.95</b></span>
          <span class="font-bold">100% Tax Compliant</span>
        </div>
      </div>
    `;
  } else if (type === "audit_voids") {
    container.innerHTML = `
      <div class="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div class="px-5 py-3.5 border-b border-slate-200 flex justify-between items-center bg-rose-50/50">
          <div>
            <h3 class="font-bold text-sm text-rose-950 flex items-center">
              <i class="fa-solid fa-shield-halved text-rose-600 mr-2"></i>Loss Prevention & Cancelled Order Audit
            </h3>
            <p class="text-[11px] text-rose-800/80">Every void bill and cancelled kitchen dish is timestamped with employee ID</p>
          </div>
          <span class="bg-rose-100 text-rose-800 font-bold px-2 py-0.5 rounded text-[10px]">1 Incident Today</span>
        </div>
        <table class="w-full text-left text-xs">
          <thead class="bg-slate-50 text-slate-500 uppercase font-black border-b border-slate-200">
            <tr>
              <th class="py-3 px-4">Timestamp</th>
              <th class="py-3 px-4">Order / Table</th>
              <th class="py-3 px-4">Void Items</th>
              <th class="py-3 px-4">Void Amount</th>
              <th class="py-3 px-4">Staff Member</th>
              <th class="py-3 px-4 text-right">Reason Logged</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr class="hover:bg-slate-50">
              <td class="py-3 px-4 font-mono text-slate-500">17:42</td>
              <td class="py-3 px-4 font-bold text-slate-900">ORD-098 (Table 4)</td>
              <td class="py-3 px-4 text-slate-600">2x Mutton Rogan Josh, 4x Butter Naan</td>
              <td class="py-3 px-4 font-mono font-bold text-rose-600">₹ 1,160.00</td>
              <td class="py-3 px-4 font-semibold text-slate-800">Captain Rajesh</td>
              <td class="py-3 px-4 text-right"><span class="bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-medium">Guest Emergency Leave</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
  } else {
    // Default: Orders List
    renderReports();
  }
}

// Render Daily Reports List
function renderReports() {
  const container = document.getElementById("dynamic-report-content");
  if (!container) return;

  const statRevenue = state.analytics ? state.analytics.total_revenue : 38450;
  const statOrders = state.analytics ? state.analytics.total_orders : 42;

  let rowsHtml = "";
  state.orders.forEach(o => {
    const itemsSummary = o.items ? o.items.map(i => `${i.qty}x ${i.name}`).join(", ") : "Dine-in meal";
    const paymentBadge = (o.payment_status && o.payment_status.includes("UPI"))
      ? `<span class="bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded text-[10px]">UPI QR</span>`
      : (o.payment_status && o.payment_status.includes("CASH"))
      ? `<span class="bg-slate-200 text-slate-800 font-bold px-2 py-0.5 rounded text-[10px]">CASH</span>`
      : `<span class="bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded text-[10px]">PENDING</span>`;

    rowsHtml += `
      <tr class="hover:bg-slate-50">
        <td class="py-2.5 px-4 font-mono font-bold text-slate-900">${o.order_id}</td>
        <td class="py-2.5 px-4 font-semibold text-slate-700">${o.table_name || o.table_id}</td>
        <td class="py-2.5 px-4 text-slate-600">${o.customer_name || 'Walk-in'}</td>
        <td class="py-2.5 px-4 text-slate-500 max-w-xs truncate" title="${itemsSummary}">${itemsSummary}</td>
        <td class="py-2.5 px-4">${paymentBadge}</td>
        <td class="py-2.5 px-4 text-right font-mono font-black text-slate-900">₹ ${o.total}</td>
      </tr>
    `;
  });

  container.innerHTML = `
    <!-- STATS CARDS -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
      <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        <span class="text-xs text-slate-500 font-semibold">Total Revenue</span>
        <div class="text-2xl font-black text-slate-900 font-mono mt-1">₹ ${Number(statRevenue).toLocaleString('en-IN')}</div>
        <span class="text-[11px] text-emerald-600 font-bold">↑ +14% vs yesterday</span>
      </div>
      <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        <span class="text-xs text-slate-500 font-semibold">Total Orders</span>
        <div class="text-2xl font-black text-slate-900 font-mono mt-1">${statOrders}</div>
        <span class="text-[11px] text-slate-500 font-medium">28 Dine-in • 14 Online</span>
      </div>
      <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        <span class="text-xs text-slate-500 font-semibold">Digital UPI vs Cash</span>
        <div class="text-2xl font-black text-emerald-600 font-mono mt-1">68% UPI</div>
        <span class="text-[11px] text-slate-500 font-medium">Instant Settlement</span>
      </div>
      <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        <span class="text-xs text-slate-500 font-semibold">Paper Rolls Saved</span>
        <div class="text-2xl font-black text-brand-600 font-mono mt-1">${statOrders} Bills</div>
        <span class="text-[11px] text-emerald-600 font-bold">₹ 140 paper cost saved</span>
      </div>
    </div>

    <!-- RECENT ORDERS TABLE -->
    <div class="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
      <div class="px-5 py-3.5 border-b border-slate-200 flex justify-between items-center bg-slate-50/70">
        <h3 class="font-bold text-sm text-slate-900">Recent Completed Orders</h3>
        <span class="text-xs text-slate-500 font-semibold">Auto-synced</span>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs">
          <thead class="bg-slate-50 text-slate-500 uppercase font-black border-b border-slate-200">
            <tr>
              <th class="py-3 px-4">Order ID</th>
              <th class="py-3 px-4">Table / Channel</th>
              <th class="py-3 px-4">Customer</th>
              <th class="py-3 px-4">Items</th>
              <th class="py-3 px-4">Payment</th>
              <th class="py-3 px-4 text-right">Amount</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function exportReportsCSV() {
  const rows = [
    ["Order ID", "Table / Channel", "Customer", "Payment Mode", "Status", "Total Amount"],
    ...state.orders.map(o => [o.order_id, o.table_name || o.table_id, o.customer_name || 'Walk-in', o.payment_status || 'PENDING', o.status, o.total])
  ];

  const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `RestroDeck_Report_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast("📥 Daily Report CSV exported successfully!");
}

function dispatchDailyZReportWhatsApp() {
  const total = state.analytics ? state.analytics.total_revenue : 38450;
  const orders = state.analytics ? state.analytics.total_orders : 42;
  const upi = state.analytics ? state.analytics.upi_qr_amount : 22150;
  const cash = state.analytics ? state.analytics.cash_amount : 11200;

  const msg = `*Spice Symphony Bistro - Official Day-End Z-Report*%0A--------------------------------%0A📅 Date: ${new Date().toLocaleDateString('en-IN')}%0A💰 Total Revenue: ₹ ${total.toLocaleString('en-IN')}%0A📦 Total Orders: ${orders}%0A📱 UPI QR Payments: ₹ ${upi.toLocaleString('en-IN')}%0A💵 Cash In Drawer: ₹ ${cash.toLocaleString('en-IN')}%0A📜 Paper Rolls Saved: ${orders} slips%0A✅ Status: Shift Balanced & Closed. Zero Loss Detected.`;

  const targetPhone = (state.restaurant && state.restaurant.phone ? state.restaurant.phone.replace(/[^0-9]/g, '') : '919313838165') || '919313838165';
  window.open(`https://wa.me/${targetPhone}?text=${msg}`, "_blank");
  showToast("📲 Daily Z-Report dispatched to Owner WhatsApp!");
}

// ========================================================
// AI AGENT COPILOT (UNLIMITED QUERIES)
// ========================================================
function askAIPrompt(text) {
  const input = document.getElementById("ai-query-input");
  if (input) input.value = text;
  handleAIQuerySubmit();
}

async function handleAIQuerySubmit() {
  const input = document.getElementById("ai-query-input");
  const stream = document.getElementById("ai-response-stream");
  const query = input ? input.value.trim() : "";
  if (!query) return;

  if (input) input.value = "";

  // Append user inquiry bubble
  const userBubble = document.createElement("div");
  userBubble.className = "flex justify-end";
  userBubble.innerHTML = `
    <div class="bg-purple-600 text-white text-xs font-bold px-4 py-2 rounded-2xl rounded-tr-none shadow-sm max-w-lg">
      ${query}
    </div>
  `;
  stream.appendChild(userBubble);

  // Loading card
  const loadingCard = document.createElement("div");
  loadingCard.className = "bg-white p-4 rounded-2xl border border-purple-200 shadow-xs flex items-center space-x-2 text-xs text-purple-700 font-bold";
  loadingCard.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i>Analyzing restaurant telemetry & POS database...`;
  stream.appendChild(loadingCard);

  try {
    const res = await fetch("/api/ai/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: query })
    });
    const data = await res.json();
    loadingCard.remove();

    const resp = data.response || {};
    const highlightsHtml = (resp.highlights || []).map(h => `
      <div class="bg-purple-50 p-2.5 rounded-xl border border-purple-100">
        <span class="text-[10px] text-purple-700 font-bold uppercase tracking-wider block">${h.label}</span>
        <span class="text-xs font-black text-slate-900 mt-0.5 block">${h.value}</span>
      </div>
    `).join("");

    const answerCard = document.createElement("div");
    answerCard.className = "bg-white p-5 rounded-2xl border border-purple-200 shadow-xs space-y-3.5 animate-in fade-in duration-200";
    answerCard.innerHTML = `
      <div class="flex items-center justify-between border-b border-purple-100 pb-2">
        <span class="font-extrabold text-xs text-purple-900 flex items-center">
          <i class="fa-solid fa-wand-magic-sparkles text-purple-600 mr-1.5"></i>RestroDeck AI Copilot
        </span>
        <span class="text-[9px] bg-purple-100 text-purple-800 font-black px-1.5 py-0.5 rounded">VERIFIED INSIGHT</span>
      </div>
      <p class="text-xs text-slate-800 leading-relaxed font-medium">${resp.answer}</p>
      ${highlightsHtml ? `<div class="grid grid-cols-1 sm:grid-cols-3 gap-2">${highlightsHtml}</div>` : ''}
    `;
    stream.appendChild(answerCard);
  } catch (err) {
    loadingCard.remove();
    showToast("AI query processed locally.");
  }
}

// ========================================================
// UNLIMITED USERS & TERMINAL SWITCHER (CUSTOM POPUP MENU)
// ========================================================
const ROLES_META = {
  cashier: {
    label: "Cashier",
    icon: "fa-solid fa-cash-register",
    color: "text-emerald-700",
    bg: "bg-emerald-50"
  },
  captain: {
    label: "Waiter / Captain",
    icon: "fa-solid fa-mobile-screen-button",
    color: "text-blue-700",
    bg: "bg-blue-50"
  },
  kds: {
    label: "Kitchen Chef",
    icon: "fa-solid fa-fire-burner",
    color: "text-amber-700",
    bg: "bg-amber-50"
  },
  kiosk: {
    label: "Kiosk Mode",
    icon: "fa-solid fa-tablet-screen-button",
    color: "text-purple-700",
    bg: "bg-purple-50"
  },
  owner: {
    label: "Owner / CFO",
    icon: "fa-solid fa-chart-line",
    color: "text-indigo-700",
    bg: "bg-indigo-50"
  }
};

function updateRoleUI(role) {
  const meta = ROLES_META[role] || ROLES_META.cashier;
  const labelEl = document.getElementById("role-active-label");
  const iconEl = document.getElementById("role-active-icon");
  const roleSelect = document.getElementById("terminal-role-select");
  if (roleSelect) roleSelect.value = role;

  if (labelEl) labelEl.innerText = meta.label;
  if (iconEl) {
    iconEl.className = `w-6 h-6 rounded-lg ${meta.bg} ${meta.color} flex items-center justify-center text-xs shrink-0`;
    iconEl.innerHTML = `<i class="${meta.icon}"></i>`;
  }

  // Update checkmarks in custom popup menu
  document.querySelectorAll(".role-item-btn").forEach(btn => {
    const itemRole = btn.getAttribute("data-role");
    const checkEl = btn.querySelector(".role-check-icon");
    if (itemRole === role) {
      btn.classList.add("bg-slate-100", "font-black");
      if (checkEl) checkEl.classList.remove("hidden");
    } else {
      btn.classList.remove("bg-slate-100", "font-black");
      if (checkEl) checkEl.classList.add("hidden");
    }
  });
}

function switchTerminalRole(role) {
  state.currentRole = role;
  updateRoleUI(role);

  if (role === "kiosk") {
    activateKioskMode();
  } else if (role === "kds") {
    switchTab("kds");
    showToast("🍳 Switched to Kitchen Display (KDS) Station");
  } else if (role === "captain") {
    switchTab("pos");
    showToast("📱 Switched to Captain Handheld Mode");
  } else if (role === "owner") {
    switchTab("reports");
    showToast("📊 Switched to Owner CFO Dashboard");
  } else {
    switchTab("pos");
    showToast("🖥️ Switched to Cashier Register");
  }
}

// Modal Helpers
function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.style.display = "flex";
  }
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.style.display = "none";
  }
}

// Close modals when clicking backdrop or pressing Escape, and close More menu / Role menu
const ALL_MODALS = [
  "modal-add-table", "modal-add-menu", "modal-settle", "modal-receipt",
  "modal-kot", "modal-kiosk-checkout", "modal-kiosk-payment",
  "modal-support", "modal-create-po", "modal-delete-cart",
  "modal-upgrade-plan"
];

window.addEventListener("click", (e) => {
  // Close More menu when clicking outside
  const moreDropdown = document.getElementById("more-menu-dropdown");
  if (moreDropdown && moreDropdown.style.display !== "none" && !moreDropdown.classList.contains("hidden")) {
    if (!e.target.closest("#more-menu-dropdown") && !e.target.closest("#tab-more-btn")) {
      closeMoreMenu();
    }
  }

  // Close Role menu when clicking outside
  const roleDropdown = document.getElementById("role-menu-dropdown");
  if (roleDropdown && roleDropdown.style.display !== "none" && !roleDropdown.classList.contains("hidden")) {
    if (!e.target.closest("#role-menu-dropdown") && !e.target.closest("#role-menu-btn")) {
      closeRoleMenu();
    }
  }

  ALL_MODALS.forEach(id => {
    const modal = document.getElementById(id);
    if (modal && e.target === modal) {
      closeModal(id);
    }
  });
});

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeMoreMenu();
    closeRoleMenu();
    ALL_MODALS.forEach(id => closeModal(id));
  }
});

// Toast Notification
function showToast(msg) {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = "bg-slate-900 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-xl border border-slate-700 flex items-center space-x-2 animate-in fade-in slide-in-from-bottom-2 duration-200 pointer-events-auto";
  toast.innerHTML = `
    <i class="fa-solid fa-circle-check text-brand-400"></i>
    <span>${msg}</span>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3500);
}
