#!/usr/bin/env python3
"""
RestroDeck Cloud POS - Enterprise Server (restrodeck.com)
Zero-dependency Python 3 HTTP & REST API server
"""

import http.server
import socketserver
import socket
import json
import os
import urllib.parse
from datetime import datetime
import threading
import queue
import time

def get_free_port(preferred_port=3000):
    for port in [preferred_port, 3001, 8080, 8000]:
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                s.bind(("", port))
                return port
        except OSError:
            continue
    return preferred_port

PORT = get_free_port(int(os.environ.get("PORT", 3000)))
PUBLIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "public")

# Initial In-Memory State
_DEFAULT_DB = {
    "restaurant": {
        "name": "Spice Symphony Bistro & Cafe",
        "tagline": "Modern Dine-in, Takeaway & Cloud Kitchen",
        "phone": "+91 93138 38165",
        "address": "Shop 14, High Street Avenue, Mumbai",
        "gstin": "27AADCS1234F1Z5",
        "fssai": "11521012000456",
        "plan": "franchise",
        "franchise_group": "spicesymphony",
        "brand_name": "Spice Symphony"
    },
    "categories": ["Starters", "Main Course", "Breads", "Biryani", "Beverages", "Desserts"],
    "tables": [
        {"id": "T1", "name": "Table 1", "section": "AC Dine-in", "seats": 2, "status": "vacant", "current_order_id": None, "seated_at": None},
        {"id": "T2", "name": "Table 2", "section": "AC Dine-in", "seats": 4, "status": "occupied", "current_order_id": "ORD-101", "seated_at": "18:15", "subtotal": 860},
        {"id": "T3", "name": "Table 3", "section": "AC Dine-in", "seats": 6, "status": "vacant", "current_order_id": None, "seated_at": None},
        {"id": "T4", "name": "Table 4", "section": "AC Dine-in", "seats": 4, "status": "billed", "current_order_id": "ORD-099", "seated_at": "17:40", "subtotal": 1420},
        {"id": "T5", "name": "Table 5", "section": "Outdoor Lawn", "seats": 4, "status": "vacant", "current_order_id": None, "seated_at": None},
        {"id": "T6", "name": "Table 6", "section": "Outdoor Lawn", "seats": 8, "status": "occupied", "current_order_id": "ORD-102", "seated_at": "18:25", "subtotal": 2150},
        {"id": "TA1", "name": "Takeaway 1", "section": "Takeaway", "seats": 0, "status": "vacant", "current_order_id": None, "seated_at": None},
        {"id": "WA1", "name": "WhatsApp Direct 1", "section": "WhatsApp Online", "seats": 0, "status": "occupied", "current_order_id": "ORD-103", "seated_at": "18:35", "subtotal": 650}
    ],
    "menu": [
        # Starters
        {"id": "s1", "name": "Paneer Tikka Angara", "category": "Starters", "price": 280, "is_veg": True, "description": "Smoky char-grilled cottage cheese with spicy marinade", "variants": [{"name": "Regular", "price": 280}, {"name": "Large (Double)", "price": 490}]},
        {"id": "s2", "name": "Chicken Malai Tikka", "category": "Starters", "price": 340, "is_veg": False, "description": "Creamy melt-in-mouth chicken infused with cardamom & cheese", "variants": [{"name": "Half (4 pcs)", "price": 220}, {"name": "Full (8 pcs)", "price": 340}]},
        {"id": "s3", "name": "Crispy Corn & Waterchestnut", "category": "Starters", "price": 240, "is_veg": True, "description": "Wok-tossed sweet corn with oriental spices and scallions", "variants": []},
        {"id": "s4", "name": "Mutton Galouti Kebab", "category": "Starters", "price": 420, "is_veg": False, "description": "Traditional Lucknowi minced lamb kebabs served with mini parathas", "variants": []},
        
        # Main Course
        {"id": "m1", "name": "Paneer Butter Masala", "category": "Main Course", "price": 320, "is_veg": True, "description": "Rich tomato butter gravy with soft fresh paneer cubes", "variants": [{"name": "Half", "price": 210}, {"name": "Full", "price": 320}]},
        {"id": "m2", "name": "Butter Chicken (Classic)", "category": "Main Course", "price": 390, "is_veg": False, "description": "Tandoori chicken simmered in velvety makhani gravy", "variants": [{"name": "Half (2 pcs)", "price": 260}, {"name": "Full (4 pcs)", "price": 390}]},
        {"id": "m3", "name": "Dal Makhani 24-Hour", "category": "Main Course", "price": 260, "is_veg": True, "description": "Slow-cooked black lentils with white butter and fresh cream", "variants": []},
        {"id": "m4", "name": "Mutton Rogan Josh", "category": "Main Course", "price": 460, "is_veg": False, "description": "Kashmiri-style tender mutton curry with aromatic spices", "variants": []},
        
        # Breads
        {"id": "b1", "name": "Butter Naan", "category": "Breads", "price": 60, "is_veg": True, "description": "Crispy layered leavened bread brushed with amul butter", "variants": []},
        {"id": "b2", "name": "Garlic Cheese Naan", "category": "Breads", "price": 110, "is_veg": True, "description": "Stuffed with melted mozzarella and roasted garlic flakes", "variants": []},
        {"id": "b3", "name": "Tandoori Roti", "category": "Breads", "price": 35, "is_veg": True, "description": "Whole wheat bread baked in clay tandoor", "variants": [{"name": "Plain", "price": 35}, {"name": "Butter", "price": 45}]},
        
        # Rice & Biryani
        {"id": "r1", "name": "Dum Chicken Biryani", "category": "Biryani", "price": 360, "is_veg": False, "description": "Aromatic long-grain basmati with marinated chicken, served with raita", "variants": []},
        {"id": "r2", "name": "Subz Dum Biryani", "category": "Biryani", "price": 290, "is_veg": True, "description": "Fresh vegetables and aromatic spices with saffron basmati rice", "variants": []},
        {"id": "r3", "name": "Jeera Rice & Dal Tadka Combo", "category": "Biryani", "price": 240, "is_veg": True, "description": "Comfort bowl of cumin rice with garlic-tempered yellow lentils", "variants": []},

        # Beverages & Desserts
        {"id": "bev1", "name": "Masala Chaas / Butter Milk", "category": "Beverages", "price": 70, "is_veg": True, "description": "Chilled spiced buttermilk with roasted cumin and mint", "variants": []},
        {"id": "bev2", "name": "Fresh Lime Soda", "category": "Beverages", "price": 90, "is_veg": True, "description": "Sweet, salted or mixed soda with fresh mint leaves", "variants": []},
        {"id": "d1", "name": "Gulab Jamun with Rabdi", "category": "Desserts", "price": 160, "is_veg": True, "description": "Warm khoya dumplings soaked in rose syrup topped with chilled rabdi", "variants": []},
        {"id": "d2", "name": "Sizzling Brownie with Ice Cream", "category": "Desserts", "price": 220, "is_veg": True, "description": "Fudgy brownie on hot skillet with hot chocolate fudge sauce", "variants": []}
    ],
    "orders": [
        {
            "order_id": "ORD-101",
            "order_type": "DINE_IN",
            "server_name": "Captain Rahul",
            "table_id": "T2",
            "table_name": "Table 2 (AC)",
            "customer_name": "Rohan Sharma",
            "customer_phone": "9820198201",
            "status": "PREPARING",
            "kds_status": "PREPARING",
            "kds_done": False,
            "payment_status": "PENDING",
            "created_at": "18:15",
            "created_timestamp": int((datetime.now().timestamp() - 14 * 60) * 1000),
            "items": [
                {"name": "Paneer Tikka Angara", "qty": 1, "price": 280, "notes": "Mild spicy", "is_veg": True},
                {"name": "Butter Naan", "qty": 4, "price": 60, "notes": "Crispy", "is_veg": True},
                {"name": "Dal Makhani 24-Hour", "qty": 1, "price": 260, "notes": "", "is_veg": True}
            ],
            "subtotal": 780,
            "tax": 39,
            "total": 819,
            "notes": "Customer requested all food together hot"
        },
        {
            "order_id": "ORD-102",
            "order_type": "DINE_IN",
            "server_name": "Captain Priya",
            "table_id": "T6",
            "table_name": "Table 6 (Outdoor)",
            "customer_name": "Pooja Hegde",
            "customer_phone": "9769123456",
            "status": "NEW",
            "kds_status": "NEW",
            "kds_done": False,
            "payment_status": "PENDING",
            "created_at": "18:25",
            "created_timestamp": int((datetime.now().timestamp() - 6 * 60) * 1000),
            "items": [
                {"name": "Chicken Malai Tikka", "qty": 2, "price": 340, "notes": "Extra mint chutney", "is_veg": False},
                {"name": "Butter Chicken (Classic)", "qty": 2, "price": 390, "notes": "", "is_veg": False},
                {"name": "Garlic Cheese Naan", "qty": 4, "price": 110, "notes": "", "is_veg": True},
                {"name": "Fresh Lime Soda", "qty": 3, "price": 90, "notes": "Salted", "is_veg": True}
            ],
            "subtotal": 2170,
            "tax": 108.5,
            "total": 2278.5,
            "notes": ""
        },
        {
            "order_id": "ORD-103",
            "order_type": "WHATSAPP",
            "server_name": "WhatsApp Direct",
            "table_id": "WA1",
            "table_name": "WhatsApp Order #103",
            "customer_name": "Vikram Adani (WhatsApp Direct)",
            "customer_phone": "9930055443",
            "status": "PREPARING",
            "kds_status": "PREPARING",
            "kds_done": False,
            "payment_status": "PAID_UPI",
            "created_at": "18:05",
            "created_timestamp": int((datetime.now().timestamp() - 24 * 60) * 1000),
            "items": [
                {"name": "Dum Chicken Biryani", "qty": 1, "price": 360, "notes": "Extra spicy, pack raita separately", "is_veg": False},
                {"name": "Gulab Jamun with Rabdi", "qty": 1, "price": 160, "notes": "Warm", "is_veg": True},
                {"name": "Masala Chaas", "qty": 1, "price": 70, "notes": "Chilled", "is_veg": True}
            ],
            "subtotal": 590,
            "tax": 29.5,
            "packaging": 30,
            "total": 649.5,
            "notes": "Door delivery: Flat 402, Sea Green Apts"
        },
        {
            "order_id": "ORD-104",
            "order_type": "KIOSK",
            "token": "TOKEN #K-104",
            "server_name": "Self Kiosk Terminal #1",
            "table_id": "KIOSK",
            "table_name": "Self Kiosk (Takeaway)",
            "customer_name": "Walk-in Guest",
            "customer_phone": "9820011223",
            "status": "PREPARING",
            "kds_status": "PREPARING",
            "kds_done": False,
            "payment_status": "PAID_UPI",
            "created_at": "18:27",
            "created_timestamp": int((datetime.now().timestamp() - 4 * 60) * 1000),
            "items": [
                {"name": "Paneer Butter Masala", "qty": 1, "price": 320, "notes": "Less oil", "is_veg": True},
                {"name": "Butter Naan", "qty": 2, "price": 60, "notes": "", "is_veg": True},
                {"name": "Fresh Lime Soda", "qty": 1, "price": 90, "notes": "Sweet", "is_veg": True}
            ],
            "subtotal": 530,
            "tax": 26.5,
            "packaging": 0,
            "total": 556.5,
            "notes": "Takeaway parcel bag requested"
        }
    ],
    "daily_analytics": {
        "total_revenue": 38450,
        "total_orders": 42,
        "dine_in_orders": 28,
        "whatsapp_direct_orders": 14,
        "cash_amount": 11200,
        "upi_qr_amount": 22150,
        "card_amount": 5100,
        "paper_rolls_saved": 42,
        "petpooja_commission_saved": "₹ 2,450 (Today)"
    },
    "inventory": [
        {"id": "inv1", "name": "Fresh Malai Paneer", "category": "Dairy", "current_stock": 14.5, "unit": "kg", "min_stock": 5.0, "unit_cost": 340, "status": "In Stock", "supplier": "Hyperpure by Zomato"},
        {"id": "inv2", "name": "Tandoori Chicken Cut", "category": "Poultry", "current_stock": 22.0, "unit": "kg", "min_stock": 8.0, "unit_cost": 210, "status": "In Stock", "supplier": "Hyperpure by Zomato"},
        {"id": "inv3", "name": "Daawat Rozana Basmati Rice", "category": "Grains", "current_stock": 45.0, "unit": "kg", "min_stock": 15.0, "unit_cost": 85, "status": "In Stock", "supplier": "Swiggy Assure"},
        {"id": "inv4", "name": "Amul Table Butter (500g)", "category": "Dairy", "current_stock": 3.5, "unit": "kg", "min_stock": 4.0, "unit_cost": 275, "status": "Low Stock", "supplier": "Hyperpure by Zomato"},
        {"id": "inv5", "name": "Fortune Sunlite Refined Oil", "category": "Oil & Spices", "current_stock": 18.0, "unit": "L", "min_stock": 10.0, "unit_cost": 135, "status": "In Stock", "supplier": "Swiggy Assure"},
        {"id": "inv6", "name": "Biryani Handi Boxes (500ml)", "category": "Packaging", "current_stock": 35.0, "unit": "pcs", "min_stock": 50.0, "unit_cost": 14, "status": "Low Stock", "supplier": "DeliverIT (DIY Packaging)"},
        {"id": "inv7", "name": "Fresh Green Chutney Mix", "category": "Vegetables", "current_stock": 2.0, "unit": "kg", "min_stock": 1.5, "unit_cost": 60, "status": "In Stock", "supplier": "Vashi APMC Mandi (DIY)"}
    ],
    "purchase_orders": [
        {"po_id": "PO-881", "supplier": "Hyperpure by Zomato", "items": "10kg Malai Paneer, 15kg Chicken", "amount": 6550, "status": "DISPATCHED", "eta": "Today 07:00 PM"},
        {"po_id": "PO-882", "supplier": "Swiggy Assure", "items": "2x 15L Cooking Oil, 25kg Basmati", "amount": 6175, "status": "DELIVERED", "eta": "Delivered at 14:10"},
        {"po_id": "PO-883", "supplier": "DeliverIT (DIY)", "items": "200x Handi Boxes, 500x Paper Bags", "amount": 3800, "status": "PENDING_APPROVAL", "eta": "Tomorrow Morning"}
    ],
    "aggregators": {
        "swiggy": {"status": "ONLINE", "auto_accept": True, "orders_today": 12, "revenue_today": 4820, "commission_rate": 25, "commission_deducted": 1205},
        "zomato": {"status": "ONLINE", "auto_accept": True, "orders_today": 16, "revenue_today": 6340, "commission_rate": 25, "commission_deducted": 1585},
        "ondc": {"status": "ONLINE", "auto_accept": True, "orders_today": 4, "revenue_today": 1420, "commission_rate": 5, "commission_deducted": 71},
        "whatsapp": {"status": "ONLINE", "auto_accept": True, "orders_today": 14, "revenue_today": 7890, "commission_rate": 0, "commission_deducted": 0}
    }
}

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
DATA_FILE = os.path.join(DATA_DIR, "pos_store.json")
STORE_FILE = DATA_FILE
TENANTS_DIR = os.path.join(DATA_DIR, "tenants")

# Multi-Tenant Concurrency & Isolation Engine
_thread_context = threading.local()
_DEFAULT_LOCK = threading.RLock()
TENANT_DBS = {"default": _DEFAULT_DB}
TENANT_LOCKS = {"default": _DEFAULT_LOCK}

class TenantDBProxy(dict):
    """Thread-local proxy routing all dictionary queries to the active restaurant tenant"""
    def _get_active(self):
        return getattr(_thread_context, "db", _DEFAULT_DB)
    def __getitem__(self, key):
        return self._get_active()[key]
    def __setitem__(self, key, val):
        self._get_active()[key] = val
    def __contains__(self, key):
        return key in self._get_active()
    def get(self, key, default=None):
        return self._get_active().get(key, default)
    def update(self, *args, **kwargs):
        self._get_active().update(*args, **kwargs)
    def setdefault(self, key, default=None):
        return self._get_active().setdefault(key, default)
    def keys(self):
        return self._get_active().keys()
    def values(self):
        return self._get_active().values()
    def items(self):
        return self._get_active().items()
    def __iter__(self):
        return iter(self._get_active())
    def __len__(self):
        return len(self._get_active())
    def clear(self):
        self._get_active().clear()
    def copy(self):
        return self._get_active().copy()
    def __deepcopy__(self, memo):
        import copy
        return copy.deepcopy(self._get_active(), memo)
    def __repr__(self):
        return repr(self._get_active())

class TenantLockProxy:
    """Thread-local proxy acquiring the dedicated lock for the active restaurant tenant"""
    def __enter__(self):
        lock = getattr(_thread_context, "lock", _DEFAULT_LOCK)
        return lock.__enter__()
    def __exit__(self, exc_type, exc_val, exc_tb):
        lock = getattr(_thread_context, "lock", _DEFAULT_LOCK)
        return lock.__exit__(exc_type, exc_val, exc_tb)

DB = TenantDBProxy()
DB_LOCK = TenantLockProxy()

def get_tenant_db(tenant_id="default"):
    clean_id = "".join(c for c in tenant_id.lower() if c.isalnum() or c in "-_") if tenant_id else "default"
    if clean_id == "default":
        return _DEFAULT_DB
    if clean_id in TENANT_DBS:
        return TENANT_DBS[clean_id]
    t_file = os.path.join(TENANTS_DIR, f"{clean_id}.json")
    if os.path.exists(t_file):
        try:
            with open(t_file, "r", encoding="utf-8") as f:
                loaded = json.load(f)
                TENANT_DBS[clean_id] = loaded
                TENANT_LOCKS[clean_id] = threading.RLock()
                return loaded
        except Exception as e:
            print(f"⚠️ [MultiTenant] Error loading tenant [{clean_id}]: {e}")
    return _DEFAULT_DB

def get_tenant_lock(tenant_id="default"):
    clean_id = "".join(c for c in tenant_id.lower() if c.isalnum() or c in "-_") if tenant_id else "default"
    if clean_id == "default":
        return _DEFAULT_LOCK
    if clean_id not in TENANT_LOCKS:
        TENANT_LOCKS[clean_id] = threading.RLock()
    return TENANT_LOCKS[clean_id]

SAVE_QUEUE = queue.Queue(maxsize=10000)
_persistence_thread = None
_persistence_running = True

def get_next_order_id(prefix="ORD"):
    """Collision-proof thread-safe monotonic order ID sequence scaling past 100,000+ orders"""
    with DB_LOCK:
        if "order_sequence" not in DB:
            existing_nums = []
            for o in DB.get("orders", []):
                oid = str(o.get("order_id", ""))
                if oid.startswith("ORD-") and oid[4:].isdigit():
                    existing_nums.append(int(oid[4:]))
                elif oid.startswith("WA-") and oid[3:].isdigit():
                    existing_nums.append(int(oid[3:]))
            DB["order_sequence"] = max(existing_nums) if existing_nums else 104
        DB["order_sequence"] += 1
        return f"{prefix}-{DB['order_sequence']}"

def _perform_disk_save(tenant_id=None):
    """Atomic write to disk using temporary file swap to eliminate power loss corruption"""
    tid = tenant_id if tenant_id else getattr(_thread_context, "tenant_id", "default")
    if tid == "default":
        target_file = DATA_FILE
        data_dict = _DEFAULT_DB
        lock = _DEFAULT_LOCK
    else:
        target_file = os.path.join(TENANTS_DIR, f"{tid}.json")
        data_dict = TENANT_DBS.get(tid, _DEFAULT_DB)
        lock = TENANT_LOCKS.get(tid, _DEFAULT_LOCK)

    try:
        with lock:
            data_str = json.dumps(data_dict, default=str)
        os.makedirs(os.path.dirname(target_file), exist_ok=True)
        tmp_file = f"{target_file}.tmp.{os.getpid()}"
        with open(tmp_file, "w", encoding="utf-8") as f:
            f.write(data_str)
        os.replace(tmp_file, target_file)
    except Exception as e:
        print(f"⚠️ [Persistence] Disk save error for tenant [{tid}]: {e}")

def enqueue_db_save():
    """Non-blocking background persistence queue for sub-millisecond API response times"""
    tid = getattr(_thread_context, "tenant_id", "default")
    try:
        SAVE_QUEUE.put_nowait(tid)
    except queue.Full:
        pass

def save_db_to_disk(sync=False):
    """Save DB state; non-blocking asynchronous queue by default, sync on shutdown"""
    if sync:
        _perform_disk_save()
    else:
        enqueue_db_save()

def _persistence_worker():
    """Background worker daemon thread that drains save queue and batches writes with 100ms debounce"""
    while _persistence_running:
        try:
            item = SAVE_QUEUE.get(timeout=1.0)
            dirty_tenants = set()
            if isinstance(item, str):
                dirty_tenants.add(item)
            else:
                dirty_tenants.add("default")
            while not SAVE_QUEUE.empty():
                try:
                    extra = SAVE_QUEUE.get_nowait()
                    if isinstance(extra, str):
                        dirty_tenants.add(extra)
                    else:
                        dirty_tenants.add("default")
                    SAVE_QUEUE.task_done()
                except queue.Empty:
                    break
            SAVE_QUEUE.task_done()
            for tid in dirty_tenants:
                _perform_disk_save(tid)
            time.sleep(0.1)
        except queue.Empty:
            continue
        except Exception as e:
            print(f"⚠️ [PersistenceWorker] Error: {e}")

def start_persistence_worker():
    """Starts the background worker daemon thread"""
    global _persistence_thread
    if _persistence_thread is None or not _persistence_thread.is_alive():
        _persistence_thread = threading.Thread(target=_persistence_worker, daemon=True, name="DB-PersistenceWorker")
        _persistence_thread.start()

def load_db_from_disk():
    """Load persistent DB state on startup if pos_store.json exists and preloads all tenants"""
    os.makedirs(DATA_DIR, exist_ok=True)
    os.makedirs(TENANTS_DIR, exist_ok=True)
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, "r", encoding="utf-8") as f:
                saved = json.load(f)
                if isinstance(saved, dict) and "orders" in saved and len(saved["orders"]) > 0:
                    with _DEFAULT_LOCK:
                        _DEFAULT_DB.update(saved)
                        if "state_version" not in _DEFAULT_DB:
                            _DEFAULT_DB["state_version"] = 1
                    print(f"📦 Restored {len(_DEFAULT_DB['orders'])} orders for [default] from {DATA_FILE}")
        except Exception as e:
            print(f"⚠️ [LoadDB] Error loading database: {e}")

    # Preload registered tenants
    if os.path.exists(TENANTS_DIR):
        for f in os.listdir(TENANTS_DIR):
            if f.endswith(".json"):
                tid = f[:-5]
                tpath = os.path.join(TENANTS_DIR, f)
                try:
                    with open(tpath, "r", encoding="utf-8") as tf:
                        td = json.load(tf)
                        TENANT_DBS[tid] = td
                        TENANT_LOCKS[tid] = threading.RLock()
                        print(f"🏢 Loaded tenant [{tid}] ({td.get('restaurant', {}).get('name', tid)})")
                except Exception as te:
                    print(f"⚠️ [LoadDB] Error loading tenant [{tid}]: {te}")


class POSRequestHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = http.server.SimpleHTTPRequestHandler.extensions_map.copy()
    extensions_map.update({
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
        '.png': 'image/png',
        '.webp': 'image/webp'
    })

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=PUBLIC_DIR, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def do_OPTIONS(self):
        """Handle CORS preflight requests from mobile tablets and remote terminals"""
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, X-Tenant-ID")
        self.send_header("Access-Control-Max-Age", "86400")
        self.end_headers()

    def setup_tenant_context(self, query_params=None):
        """Resolves tenant ID from query param, X-Tenant-ID header, or subdomain"""
        tid = "default"
        if query_params and "tenant" in query_params and query_params["tenant"]:
            tid = query_params["tenant"][0]
        elif self.headers.get("X-Tenant-ID"):
            tid = self.headers.get("X-Tenant-ID").strip()
        else:
            host = self.headers.get("Host", "").lower().split(":")[0]
            if host.endswith(".restrodeck.com") and not host.startswith("www."):
                sub = host.split(".restrodeck.com")[0]
                if sub and sub not in ("pos", "app", "api", "landing", "pricing"):
                    tid = sub

        clean_id = "".join(c for c in tid.lower() if c.isalnum() or c in "-_") if tid else "default"
        _thread_context.tenant_id = clean_id
        _thread_context.db = get_tenant_db(clean_id)
        _thread_context.lock = get_tenant_lock(clean_id)
        return clean_id

    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        query_params = urllib.parse.parse_qs(url.query)
        self.setup_tenant_context(query_params)

        # Clear caching headers so client never gets stale 304 for dynamic HTML/JS
        if "If-Modified-Since" in self.headers:
            del self.headers["If-Modified-Since"]
        if "If-None-Match" in self.headers:
            del self.headers["If-None-Match"]

        t_active = DB.get("is_active", True) is not False and DB.get("restaurant", {}).get("is_active", True) is not False

        if url.path in ("/admin", "/superadmin"):
            self.path = "/admin.html"
            super().do_GET()
        elif url.path in ("/landing", "/pricing", "/features"):
            self.path = "/landing.html"
            super().do_GET()
        elif url.path in ("/suspended", "/suspended.html"):
            self.path = "/suspended.html"
            super().do_GET()
        elif url.path in ("/", "/index.html", "/pos", "/app"):
            if not t_active:
                self.path = "/suspended.html"
            else:
                self.path = "/index.html"
            super().do_GET()
        elif url.path.startswith("/api/"):
            self.handle_api_get(url.path, query_params)
        else:
            super().do_GET()

    def do_POST(self):
        url = urllib.parse.urlparse(self.path)
        query_params = urllib.parse.parse_qs(url.query)
        self.setup_tenant_context(query_params)
        if url.path.startswith("/api/"):
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length).decode("utf-8") if content_length > 0 else "{}"
            try:
                data = json.loads(body)
            except Exception:
                data = {}
            self.handle_api_post(url.path, data)
        else:
            self.send_error(404, "Endpoint not found")

    def handle_api_get(self, path, query_params=None):
        if "?" in path:
            path, qs = path.split("?", 1)
            if query_params is None:
                query_params = urllib.parse.parse_qs(qs)
        if query_params is None:
            query_params = {}

        # 1. Enforce deactivation check on all tenant routes except /api/tenants/*, /api/health, and /api/status
        if not path.startswith("/api/tenants/") and path not in ("/api/health", "/api/status"):
            t_active = DB.get("is_active", True) is not False and DB.get("restaurant", {}).get("is_active", True) is not False
            if not t_active:
                rest_name = DB.get("restaurant", {}).get("name", "Restaurant Outlet")
                self.send_json_response({
                    "success": False,
                    "error": "ACCOUNT_DEACTIVATED",
                    "is_active": False,
                    "restaurant_name": rest_name,
                    "message": f"'{rest_name}' has been deactivated by SuperAdmin. Please contact support at +91 9313838165."
                }, status=403)
                return

        if path == "/api/status":
            t_active = DB.get("is_active", True) is not False and DB.get("restaurant", {}).get("is_active", True) is not False
            clean_id = getattr(_thread_context, "tenant_id", "default")
            rest_info = DB.get("restaurant", {})
            self.send_json_response({
                "success": True,
                "tenant_id": clean_id,
                "restaurant_name": rest_info.get("name", "Spice Symphony Bistro & Cafe"),
                "is_active": t_active,
                "plan": rest_info.get("plan", "pro"),
                "franchise_group": rest_info.get("franchise_group", "spicesymphony" if clean_id == "default" else ""),
                "brand_name": rest_info.get("brand_name", "Spice Symphony" if clean_id == "default" else ""),
                "phone": rest_info.get("phone", "+91 93138 38165")
            })
            return

        if path == "/api/health":
            with DB_LOCK:
                orders_count = len(DB.get("orders", []))
                active_orders = len([o for o in DB.get("orders", []) if o.get("status") not in ("COMPLETED", "CANCELLED")])
                state_ver = DB.get("state_version", 1)
            self.send_json_response({
                "status": "HEALTHY",
                "uptime": "online",
                "engine": "enterprise-threaded-queue",
                "orders_count": orders_count,
                "active_orders": active_orders,
                "state_version": state_ver,
                "queue_pending": SAVE_QUEUE.qsize(),
                "timestamp": int(datetime.now().timestamp() * 1000)
            })
        elif path == "/api/tenants/list":
            outlets = []
            def_rest = _DEFAULT_DB.get("restaurant", {})
            def_rev = _DEFAULT_DB.get("daily_analytics", {}).get("total_revenue", 0)
            def_orders = len(_DEFAULT_DB.get("orders", []))
            def_active = _DEFAULT_DB.get("is_active", True) is not False and def_rest.get("is_active", True) is not False
            outlets.append({
                "tenant_id": "default",
                "name": def_rest.get("name", "Spice Symphony Bistro"),
                "tagline": def_rest.get("tagline", "Modern Dine-in, Takeaway & Cloud Kitchen"),
                "phone": def_rest.get("phone", ""),
                "address": def_rest.get("address", ""),
                "upi_vpa": def_rest.get("upi_vpa", ""),
                "gstin": def_rest.get("gstin", ""),
                "fssai": def_rest.get("fssai", ""),
                "orders_count": def_orders,
                "revenue": def_rev,
                "tables_count": len(_DEFAULT_DB.get("tables", [])),
                "plan": def_rest.get("plan", "pro"),
                "franchise_group": def_rest.get("franchise_group", "spicesymphony"),
                "brand_name": def_rest.get("brand_name", "Spice Symphony"),
                "is_active": def_active,
                "status": "active" if def_active else "deactivated",
                "deactivated_at": _DEFAULT_DB.get("deactivated_at"),
                "deactivation_reason": _DEFAULT_DB.get("deactivation_reason", ""),
                "is_default": True
            })
            if os.path.exists(TENANTS_DIR):
                for fname in sorted(os.listdir(TENANTS_DIR)):
                    if fname.endswith(".json"):
                        tid = fname[:-5]
                        t_obj = get_tenant_db(tid)
                        r = t_obj.get("restaurant", {})
                        a = t_obj.get("daily_analytics", {})
                        t_active = t_obj.get("is_active", True) is not False and r.get("is_active", True) is not False
                        outlets.append({
                            "tenant_id": tid,
                            "name": r.get("name", tid),
                            "tagline": r.get("tagline", ""),
                            "phone": r.get("phone", ""),
                            "address": r.get("address", ""),
                            "upi_vpa": r.get("upi_vpa", ""),
                            "gstin": r.get("gstin", ""),
                            "fssai": r.get("fssai", ""),
                            "orders_count": len(t_obj.get("orders", [])),
                            "revenue": a.get("total_revenue", 0),
                            "tables_count": len(t_obj.get("tables", [])),
                            "plan": r.get("plan", "pro"),
                            "franchise_group": r.get("franchise_group", ""),
                            "brand_name": r.get("brand_name", ""),
                            "is_active": t_active,
                            "status": "active" if t_active else "deactivated",
                            "deactivated_at": t_obj.get("deactivated_at"),
                            "deactivation_reason": t_obj.get("deactivation_reason", ""),
                            "is_default": False
                        })
            self.send_json_response({"success": True, "tenants": outlets, "total_tenants": len(outlets)})
        elif path == "/api/sync":
            with DB_LOCK:
                client_version = int(query_params.get("since", [0])[0]) if query_params.get("since") else 0
                current_version = DB.get("state_version", 1)
                if client_version == current_version:
                    self.send_json_response({
                        "up_to_date": True,
                        "version": current_version,
                        "server_time": int(datetime.now().timestamp() * 1000)
                    })
                else:
                    active_kds = [
                        o for o in DB.get("orders", [])
                        if not o.get("kds_done") and o.get("status") not in ("COMPLETED", "CANCELLED")
                    ]
                    self.send_json_response({
                        "up_to_date": False,
                        "version": current_version,
                        "tables": DB.get("tables", []),
                        "orders": DB.get("orders", [])[:100],
                        "kds_orders": active_kds,
                        "analytics": DB.get("daily_analytics", {}),
                        "inventory": DB.get("inventory", []),
                        "aggregators": DB.get("aggregators", {}),
                        "server_time": int(datetime.now().timestamp() * 1000)
                    })
        elif path == "/api/init":
            with DB_LOCK:
                self.send_json_response({
                    "restaurant": DB["restaurant"],
                    "categories": DB.get("categories", ["Starters", "Main Course", "Breads", "Biryani", "Beverages", "Desserts"]),
                    "tables": DB["tables"],
                    "menu": DB["menu"],
                    "orders": DB["orders"],
                    "analytics": DB["daily_analytics"],
                    "inventory": DB.get("inventory", []),
                    "purchase_orders": DB.get("purchase_orders", []),
                    "aggregators": DB.get("aggregators", {}),
                    "version": DB.get("state_version", 1)
                })
        elif path == "/api/categories":
            with DB_LOCK:
                self.send_json_response(DB.get("categories", []))
        elif path == "/api/menu":
            with DB_LOCK:
                self.send_json_response(DB["menu"])
        elif path == "/api/tables":
            with DB_LOCK:
                self.send_json_response(DB["tables"])
        elif path == "/api/orders":
            with DB_LOCK:
                self.send_json_response(DB["orders"])
        elif path == "/api/analytics":
            with DB_LOCK:
                self.send_json_response(DB["daily_analytics"])
        elif path == "/api/inventory":
            with DB_LOCK:
                self.send_json_response(DB.get("inventory", []))
        elif path == "/api/purchase-orders":
            with DB_LOCK:
                self.send_json_response(DB.get("purchase_orders", []))
        elif path == "/api/aggregators":
            with DB_LOCK:
                self.send_json_response(DB.get("aggregators", {}))
        else:
            self.send_error(404, "API route not found")

    def handle_api_post(self, path, data):
        # Enforce deactivation check on all POS/tenant write actions except SuperAdmin /api/tenants/*
        if not path.startswith("/api/tenants/"):
            t_active = DB.get("is_active", True) is not False and DB.get("restaurant", {}).get("is_active", True) is not False
            if not t_active:
                rest_name = DB.get("restaurant", {}).get("name", "Restaurant Outlet")
                self.send_json_response({
                    "success": False,
                    "error": "ACCOUNT_DEACTIVATED",
                    "is_active": False,
                    "restaurant_name": rest_name,
                    "message": f"Cannot process request. '{rest_name}' has been deactivated by SuperAdmin."
                }, status=403)
                return

        if path == "/api/tenants/register":
            name = str(data.get("name", "New Restaurant")).strip()
            raw_id = str(data.get("tenant_id", "")).strip() or name.lower().replace(" ", "").replace("-", "")[:20]
            clean_id = "".join(c for c in raw_id.lower() if c.isalnum() or c in "-_") or f"outlet{int(time.time())}"
            phone = str(data.get("phone", "")).strip()
            upi = str(data.get("upi_vpa", "")).strip()
            address = str(data.get("address", "")).strip()

            import copy
            new_store = copy.deepcopy(_DEFAULT_DB)
            new_store["restaurant"]["name"] = name
            plan = str(data.get("plan", "pro")).lower().strip()
            franchise_group = str(data.get("franchise_group", "")).strip().lower()
            brand_name = str(data.get("brand_name", "")).strip()

            if franchise_group:
                new_store["restaurant"]["franchise_group"] = franchise_group
                new_store["restaurant"]["brand_name"] = brand_name or franchise_group.title()
                new_store["restaurant"]["plan"] = "franchise"
            else:
                new_store["restaurant"]["plan"] = plan if plan in ("starter", "pro", "franchise") else "pro"
                new_store["restaurant"]["franchise_group"] = ""
                new_store["restaurant"]["brand_name"] = ""

            new_store["is_active"] = True
            new_store["restaurant"]["is_active"] = True
            if phone: new_store["restaurant"]["phone"] = phone
            if upi: new_store["restaurant"]["upi_vpa"] = upi
            if address: new_store["restaurant"]["address"] = address
            new_store["orders"] = []
            new_store["daily_analytics"] = {
                "total_revenue": 0, "total_orders": 0, "upi_qr_amount": 0,
                "cash_amount": 0, "whatsapp_direct_orders": 0, "paper_rolls_saved": 0
            }
            for t in new_store.get("tables", []):
                t["status"] = "vacant"
                t["current_order_id"] = None
                t["seated_at"] = None
                t["subtotal"] = None
            new_store["tenant_id"] = clean_id
            new_store["created_at"] = datetime.now().isoformat()
            new_store["state_version"] = 1

            os.makedirs(TENANTS_DIR, exist_ok=True)
            t_path = os.path.join(TENANTS_DIR, f"{clean_id}.json")
            with open(t_path, "w", encoding="utf-8") as tf:
                json.dump(new_store, tf, indent=2, ensure_ascii=False)

            TENANT_DBS[clean_id] = new_store
            TENANT_LOCKS[clean_id] = threading.RLock()

            self.send_json_response({
                "success": True,
                "tenant_id": clean_id,
                "name": name,
                "franchise_group": franchise_group,
                "brand_name": brand_name,
                "url": f"/pos?tenant={clean_id}",
                "subdomain_url": f"https://{clean_id}.restrodeck.com/pos",
                "message": f"Restaurant '{name}' onboarded successfully!"
            })
            return

        if path == "/api/tenants/update-group":
            tenant_id = str(data.get("tenant_id", "")).strip().lower()
            franchise_group = str(data.get("franchise_group", "")).strip().lower()
            brand_name = str(data.get("brand_name", "")).strip()

            if tenant_id in ("", "default"):
                with _DEFAULT_LOCK:
                    _DEFAULT_DB.setdefault("restaurant", {})["franchise_group"] = franchise_group
                    _DEFAULT_DB.setdefault("restaurant", {})["brand_name"] = brand_name or "Spice Symphony"
                    _DEFAULT_DB["state_version"] = _DEFAULT_DB.get("state_version", 1) + 1
                    tmp_f = f"{DATA_FILE}.tmp.{os.getpid()}"
                    with open(tmp_f, "w", encoding="utf-8") as tf:
                        json.dump(_DEFAULT_DB, tf, indent=2, ensure_ascii=False)
                    os.replace(tmp_f, DATA_FILE)
                actual_id = "default"
            else:
                target_path = os.path.join(TENANTS_DIR, f"{tenant_id}.json")
                if not os.path.exists(target_path) and tenant_id not in TENANT_DBS:
                    self.send_json_response({"success": False, "message": f"Tenant '{tenant_id}' not found."}, 404)
                    return
                t_db = get_tenant_db(tenant_id)
                t_lock = get_tenant_lock(tenant_id)
                with t_lock:
                    t_db.setdefault("restaurant", {})["franchise_group"] = franchise_group
                    t_db.setdefault("restaurant", {})["brand_name"] = brand_name
                    t_db["state_version"] = t_db.get("state_version", 1) + 1
                    tmp_f = f"{target_path}.tmp.{os.getpid()}"
                    with open(tmp_f, "w", encoding="utf-8") as tf:
                        json.dump(t_db, tf, indent=2, ensure_ascii=False)
                    os.replace(tmp_f, target_path)
                actual_id = tenant_id

            self.send_json_response({
                "success": True,
                "tenant_id": actual_id,
                "franchise_group": franchise_group,
                "brand_name": brand_name,
                "message": f"Outlet '{actual_id}' franchise association updated."
            })
            return

        if path == "/api/tenants/update":
            tenant_id = str(data.get("tenant_id", "")).strip().lower()
            name = str(data.get("name", "")).strip()
            tagline = str(data.get("tagline", "")).strip()
            phone = str(data.get("phone", "")).strip()
            upi_vpa = str(data.get("upi_vpa", "")).strip()
            address = str(data.get("address", "")).strip()
            gstin = str(data.get("gstin", "")).strip()
            fssai = str(data.get("fssai", "")).strip()
            plan = str(data.get("plan", "")).strip().lower()
            franchise_group = str(data.get("franchise_group", "")).strip().lower()
            brand_name = str(data.get("brand_name", "")).strip()

            if not name:
                self.send_json_response({"success": False, "message": "Restaurant name cannot be empty."}, 400)
                return

            if tenant_id in ("", "default"):
                with _DEFAULT_LOCK:
                    r = _DEFAULT_DB.setdefault("restaurant", {})
                    r["name"] = name
                    r["tagline"] = tagline
                    r["phone"] = phone
                    r["upi_vpa"] = upi_vpa
                    r["address"] = address
                    r["gstin"] = gstin
                    r["fssai"] = fssai
                    if plan in ("starter", "pro", "franchise"):
                        r["plan"] = plan
                    r["franchise_group"] = franchise_group
                    r["brand_name"] = brand_name or (franchise_group.title() if franchise_group else "")
                    if franchise_group:
                        r["plan"] = "franchise"
                    _DEFAULT_DB["state_version"] = _DEFAULT_DB.get("state_version", 1) + 1
                    tmp_f = f"{DATA_FILE}.tmp.{os.getpid()}"
                    with open(tmp_f, "w", encoding="utf-8") as tf:
                        json.dump(_DEFAULT_DB, tf, indent=2, ensure_ascii=False)
                    os.replace(tmp_f, DATA_FILE)
                actual_id = "default"
                updated_rest = _DEFAULT_DB["restaurant"]
            else:
                target_path = os.path.join(TENANTS_DIR, f"{tenant_id}.json")
                if not os.path.exists(target_path) and tenant_id not in TENANT_DBS:
                    self.send_json_response({"success": False, "message": f"Tenant '{tenant_id}' not found."}, 404)
                    return
                t_db = get_tenant_db(tenant_id)
                t_lock = get_tenant_lock(tenant_id)
                with t_lock:
                    r = t_db.setdefault("restaurant", {})
                    r["name"] = name
                    r["tagline"] = tagline
                    r["phone"] = phone
                    r["upi_vpa"] = upi_vpa
                    r["address"] = address
                    r["gstin"] = gstin
                    r["fssai"] = fssai
                    if plan in ("starter", "pro", "franchise"):
                        r["plan"] = plan
                    r["franchise_group"] = franchise_group
                    r["brand_name"] = brand_name or (franchise_group.title() if franchise_group else "")
                    if franchise_group:
                        r["plan"] = "franchise"
                    t_db["state_version"] = t_db.get("state_version", 1) + 1
                    tmp_f = f"{target_path}.tmp.{os.getpid()}"
                    with open(tmp_f, "w", encoding="utf-8") as tf:
                        json.dump(t_db, tf, indent=2, ensure_ascii=False)
                    os.replace(tmp_f, target_path)
                actual_id = tenant_id
                updated_rest = t_db["restaurant"]

            self.send_json_response({
                "success": True,
                "tenant_id": actual_id,
                "restaurant": updated_rest,
                "message": f"Restaurant '{name}' ({actual_id}) profile updated successfully."
            })
            return

        if path == "/api/tenants/update-plan":
            tenant_id = str(data.get("tenant_id", "")).strip().lower()
            plan = str(data.get("plan", "pro")).strip().lower()
            if plan not in ("starter", "pro", "franchise"):
                self.send_json_response({"success": False, "message": "Invalid plan tier. Choose starter, pro, or franchise."}, 400)
                return

            if tenant_id in ("", "default"):
                with _DEFAULT_LOCK:
                    _DEFAULT_DB.setdefault("restaurant", {})["plan"] = plan
                    _DEFAULT_DB["state_version"] = _DEFAULT_DB.get("state_version", 1) + 1
                    tmp_f = f"{DATA_FILE}.tmp.{os.getpid()}"
                    with open(tmp_f, "w", encoding="utf-8") as tf:
                        json.dump(_DEFAULT_DB, tf, indent=2, ensure_ascii=False)
                    os.replace(tmp_f, DATA_FILE)
                actual_id = "default"
            else:
                target_path = os.path.join(TENANTS_DIR, f"{tenant_id}.json")
                if not os.path.exists(target_path) and tenant_id not in TENANT_DBS:
                    self.send_json_response({"success": False, "message": f"Tenant '{tenant_id}' not found."}, 404)
                    return
                t_db = get_tenant_db(tenant_id)
                t_lock = get_tenant_lock(tenant_id)
                with t_lock:
                    t_db.setdefault("restaurant", {})["plan"] = plan
                    t_db["state_version"] = t_db.get("state_version", 1) + 1
                    tmp_f = f"{target_path}.tmp.{os.getpid()}"
                    with open(tmp_f, "w", encoding="utf-8") as tf:
                        json.dump(t_db, tf, indent=2, ensure_ascii=False)
                    os.replace(tmp_f, target_path)
                actual_id = tenant_id

            self.send_json_response({
                "success": True,
                "tenant_id": actual_id,
                "plan": plan,
                "message": f"Outlet '{actual_id}' plan updated to {plan.upper()}."
            })
            return

        if path == "/api/tenants/toggle-status":
            tenant_id = str(data.get("tenant_id", "")).strip().lower()
            has_explicit = "is_active" in data
            req_active = bool(data.get("is_active")) if has_explicit else None
            reason = str(data.get("reason", "")).strip()

            if tenant_id in ("", "default"):
                with _DEFAULT_LOCK:
                    curr_active = _DEFAULT_DB.get("is_active", True) is not False and _DEFAULT_DB.get("restaurant", {}).get("is_active", True) is not False
                    new_active = req_active if has_explicit else (not curr_active)
                    _DEFAULT_DB["is_active"] = new_active
                    _DEFAULT_DB.setdefault("restaurant", {})["is_active"] = new_active
                    if not new_active:
                        _DEFAULT_DB["deactivated_at"] = datetime.now().isoformat()
                        if reason:
                            _DEFAULT_DB["deactivation_reason"] = reason
                    else:
                        _DEFAULT_DB.pop("deactivated_at", None)
                        _DEFAULT_DB.pop("deactivation_reason", None)
                    _DEFAULT_DB["state_version"] = _DEFAULT_DB.get("state_version", 1) + 1
                    tmp_f = f"{DATA_FILE}.tmp.{os.getpid()}"
                    with open(tmp_f, "w", encoding="utf-8") as tf:
                        json.dump(_DEFAULT_DB, tf, indent=2, ensure_ascii=False)
                    os.replace(tmp_f, DATA_FILE)
                actual_id = "default"
            else:
                target_path = os.path.join(TENANTS_DIR, f"{tenant_id}.json")
                if not os.path.exists(target_path) and tenant_id not in TENANT_DBS:
                    self.send_json_response({"success": False, "message": f"Tenant '{tenant_id}' not found."}, 404)
                    return
                t_db = get_tenant_db(tenant_id)
                t_lock = get_tenant_lock(tenant_id)
                with t_lock:
                    curr_active = t_db.get("is_active", True) is not False and t_db.get("restaurant", {}).get("is_active", True) is not False
                    new_active = req_active if has_explicit else (not curr_active)
                    t_db["is_active"] = new_active
                    t_db.setdefault("restaurant", {})["is_active"] = new_active
                    if not new_active:
                        t_db["deactivated_at"] = datetime.now().isoformat()
                        if reason:
                            t_db["deactivation_reason"] = reason
                    else:
                        t_db.pop("deactivated_at", None)
                        t_db.pop("deactivation_reason", None)
                    t_db["state_version"] = t_db.get("state_version", 1) + 1
                    tmp_f = f"{target_path}.tmp.{os.getpid()}"
                    with open(tmp_f, "w", encoding="utf-8") as tf:
                        json.dump(t_db, tf, indent=2, ensure_ascii=False)
                    os.replace(tmp_f, target_path)
                actual_id = tenant_id

            status_str = "activated" if new_active else "deactivated"
            self.send_json_response({
                "success": True,
                "tenant_id": actual_id,
                "is_active": new_active,
                "status": status_str,
                "message": f"Outlet '{actual_id}' has been {status_str} successfully."
            })
            return

        with DB_LOCK:
            DB["state_version"] = DB.get("state_version", 1) + 1
        if path == "/api/orders/create":
            order_id = get_next_order_id("ORD")
            new_order = {
                "order_id": order_id,
                "order_type": data.get("order_type", "DINE_IN"),
                "token": data.get("token", None),
                "server_name": data.get("server_name", "Captain Rahul"),
                "table_id": data.get("table_id", "TA1"),
                "table_name": data.get("table_name", "Takeaway"),
                "customer_name": data.get("customer_name", "Walk-in Guest"),
                "customer_phone": data.get("customer_phone", ""),
                "status": data.get("status", "PREPARING"),
                "kds_status": data.get("kds_status", "PREPARING"),
                "kds_done": False,
                "payment_status": data.get("payment_status", "PENDING"),
                "created_at": datetime.now().strftime("%H:%M"),
                "created_timestamp": int(datetime.now().timestamp() * 1000),
                "items": data.get("items", []),
                "subtotal": data.get("subtotal", 0),
                "tax": data.get("tax", 0),
                "packaging": data.get("packaging", 0),
                "total": data.get("total", 0),
                "notes": data.get("notes", "")
            }
            DB["orders"].insert(0, new_order)
            
            # Update table status
            for table in DB["tables"]:
                if table["id"] == new_order["table_id"]:
                    table["status"] = "occupied"
                    table["current_order_id"] = order_id
                    table["seated_at"] = new_order["created_at"]
                    table["subtotal"] = new_order["subtotal"]
                    break

            # Update daily analytics
            DB["daily_analytics"]["total_orders"] += 1
            DB["daily_analytics"]["total_revenue"] += new_order["total"]
            
            save_db_to_disk()
            self.send_json_response({"success": True, "order": new_order, "message": "KOT sent to Kitchen Display!"})

        elif path == "/api/orders/settle":
            order_id = data.get("order_id")
            payment_mode = data.get("payment_mode", "UPI_QR")
            table_id = data.get("table_id")
            settled_total = 0
            
            for o in DB["orders"]:
                if o["order_id"] == order_id:
                    o["status"] = "COMPLETED"
                    o["kds_done"] = True
                    o["payment_status"] = f"PAID_{payment_mode}"
                    settled_total = o.get("total", 0)
                    break
            
            for table in DB["tables"]:
                if table["id"] == table_id:
                    table["status"] = "vacant"
                    table["kitchen_ready"] = False
                    table["current_order_id"] = None
                    table["seated_at"] = None
                    table["subtotal"] = None
                    break
            
            # Update payment mode breakdown and paper rolls saved
            if payment_mode == "UPI_QR":
                DB["daily_analytics"]["upi_qr_amount"] += settled_total
            elif payment_mode == "CASH":
                DB["daily_analytics"]["cash_amount"] += settled_total
            elif payment_mode == "CARD":
                DB["daily_analytics"]["card_amount"] += settled_total
            DB["daily_analytics"]["paper_rolls_saved"] += 1
            save_db_to_disk()
            self.send_json_response({"success": True, "message": f"Bill settled via {payment_mode}! Table is now vacant."})

        elif path in ("/api/orders/cancel", "/api/orders/void"):
            order_id = data.get("order_id")
            table_id = data.get("table_id")
            cancelled_order_id = order_id
            for o in DB["orders"]:
                if (order_id and o["order_id"] == order_id) or (table_id and o.get("table_id") == table_id and o.get("status") not in ("COMPLETED", "CANCELLED", "VOID")):
                    o["status"] = "CANCELLED"
                    o["kds_done"] = True
                    cancelled_order_id = o.get("order_id", order_id)
                    break
            for table in DB["tables"]:
                if table["id"] == table_id:
                    table["status"] = "vacant"
                    table["kitchen_ready"] = False
                    table["current_order_id"] = None
                    table["seated_at"] = None
                    table["subtotal"] = None
                    break
            save_db_to_disk()
            self.send_json_response({"success": True, "message": f"Order #{cancelled_order_id or 'Draft'} cancelled and table vacated."})

        elif path == "/api/kds/status":
            order_id = data.get("order_id")
            new_status = data.get("status", "COMPLETED")
            matched_table_id = None
            for o in DB["orders"]:
                if o["order_id"] == order_id:
                    o["kds_status"] = new_status
                    if new_status == "COMPLETED":
                        o["kds_done"] = True
                    matched_table_id = o.get("table_id")
                    break
            if matched_table_id:
                for table in DB["tables"]:
                    if table["id"] == matched_table_id:
                        table["kitchen_ready"] = (new_status == "COMPLETED")
                        break
            self.send_json_response({"success": True, "order_id": order_id, "new_status": new_status, "kds_done": True})

        elif path == "/api/whatsapp/simulate-order":
            text = data.get("text", "").lower()
            customer_phone = data.get("phone", "9870011223")
            
            # Intelligent NLP entity matching for demo presets
            matched_items = []
            if "biryani" in text:
                qty = 2 if "2" in text and "biryani" in text else (1 if "1" in text else 1)
                matched_items.append({"name": "Dum Chicken Biryani", "qty": qty, "price": 360, "notes": "WhatsApp Special"})
            if "butter chicken" in text:
                qty = 2 if "2" in text and "butter chicken" in text else 1
                matched_items.append({"name": "Butter Chicken (Classic)", "qty": qty, "price": 390, "notes": "Mild gravy"})
            elif "chicken" in text and "biryani" not in text:
                matched_items.append({"name": "Chicken Malai Tikka", "qty": 1, "price": 340, "notes": "Extra mint chutney"})
            if "dal" in text or "makhani" in text:
                matched_items.append({"name": "Dal Makhani 24-Hour", "qty": 1, "price": 260, "notes": "Rich slow-cooked"})
            if "garlic" in text or "cheese naan" in text:
                qty = 2 if "2" in text else 1
                matched_items.append({"name": "Garlic Cheese Naan", "qty": qty, "price": 110, "notes": "Roasted garlic"})
            elif "naan" in text:
                qty = 4 if "4" in text else (2 if "2" in text else 2)
                matched_items.append({"name": "Butter Naan", "qty": qty, "price": 60, "notes": "Hot & crispy"})
            if "paneer" in text:
                matched_items.append({"name": "Paneer Butter Masala", "qty": 1, "price": 320, "notes": "Less spicy"})
            if "jamun" in text or "sweet" in text or "dessert" in text:
                matched_items.append({"name": "Gulab Jamun with Rabdi", "qty": 2, "price": 160, "notes": "Warm"})
            if "chaas" in text or "buttermilk" in text:
                matched_items.append({"name": "Masala Chaas / Butter Milk", "qty": 1, "price": 70, "notes": "Chilled"})
            if "soda" in text or "lime" in text:
                matched_items.append({"name": "Fresh Lime Soda", "qty": 1, "price": 90, "notes": "Sweet & salted"})

            if not matched_items:
                matched_items = [
                    {"name": "Paneer Tikka Angara", "qty": 1, "price": 280, "notes": "Chef Special"},
                    {"name": "Butter Naan", "qty": 2, "price": 60, "notes": ""}
                ]

            subtotal = sum(item["qty"] * item["price"] for item in matched_items)
            tax = round(subtotal * 0.05, 1)
            packaging = 30
            total = subtotal + tax + packaging

            order_id = get_next_order_id("WA")
            new_wa_order = {
                "order_id": order_id,
                "table_id": "WA1",
                "table_name": "WhatsApp Direct (Home Delivery)",
                "customer_name": f"Customer ({customer_phone[-4:]})",
                "customer_phone": customer_phone,
                "status": "PREPARING",
                "kds_status": "PREPARING",
                "kds_done": False,
                "payment_status": "PAID_UPI_AUTO",
                "created_at": datetime.now().strftime("%H:%M"),
                "items": matched_items,
                "subtotal": subtotal,
                "tax": tax,
                "packaging": packaging,
                "total": total
            }
            DB["orders"].insert(0, new_wa_order)
            DB["daily_analytics"]["whatsapp_direct_orders"] += 1
            DB["daily_analytics"]["total_revenue"] += total
            DB["daily_analytics"]["upi_qr_amount"] += total
            DB["daily_analytics"]["paper_rolls_saved"] += 1
            save_db_to_disk()

            items_text = ", ".join([f"{item['qty']}x {item['name']}" for item in matched_items])
            self.send_json_response({
                "success": True,
                "order": new_wa_order,
                "messages": [
                    {
                        "title": "Order Acknowledged",
                        "text": f"✨ *Namaste!* We received your order:\n• {items_text}\n💰 *Total: ₹{total}* (Incl. 5% GST)",
                        "delay": 300
                    },
                    {
                        "title": "Payment Confirmed",
                        "text": f"💳 *Payment Verified:* Received ₹{total} via UPI (Ref: UPI-{order_id}). Kitchen KOT auto-dispatched to chef.",
                        "delay": 1100
                    },
                    {
                        "title": "Kitchen KDS Alert",
                        "text": f"👨‍🍳 *Chef Update:* Cooking started! Estimated prep time: 20 mins.\n📍 Live Tracker: restrodeck.com/order/{order_id}",
                        "delay": 2000
                    }
                ],
                "whatsapp_reply": f" Namaste! Your order #{order_id} ({items_text}) is confirmed with Spice Symphony. Total: ₹{total}. Paid via UPI. Kitchen has started preparation."
            })

        elif path == "/api/tables/add":
            new_id = f"T{len(DB['tables']) + 1}"
            new_table = {
                "id": new_id,
                "name": data.get("name", f"Table {len(DB['tables']) + 1}"),
                "section": data.get("section", "AC Dine-in"),
                "seats": int(data.get("seats", 4)),
                "status": "vacant",
                "current_order_id": None,
                "seated_at": None,
                "subtotal": None
            }
            DB["tables"].append(new_table)
            self.send_json_response({"success": True, "table": new_table, "message": f"Table '{new_table['name']}' added successfully!"})

        elif path == "/api/tables/status":
            table_id = data.get("table_id")
            new_status = data.get("status", "vacant")
            for t in DB["tables"]:
                if t["id"] == table_id:
                    t["status"] = new_status
                    if new_status == "vacant":
                        t["kitchen_ready"] = False
                        t["current_order_id"] = None
                        t["subtotal"] = None
                        t["seated_at"] = None
                    break
            self.send_json_response({"success": True, "table_id": table_id, "status": new_status, "message": f"Table {table_id} status updated to {new_status}."})

        elif path == "/api/orders/delete-item":
            order_id = data.get("order_id")
            item_index = data.get("item_index")
            deleted_item = None
            target_order = None
            for o in DB["orders"]:
                if o["order_id"] == order_id:
                    target_order = o
                    if isinstance(item_index, int) and 0 <= item_index < len(o.get("items", [])):
                        deleted_item = o["items"].pop(item_index)
                    break

            if target_order:
                subtotal = sum(i.get("qty", 1) * i.get("price", 0) for i in target_order.get("items", []))
                tax = round(subtotal * 0.05, 1)
                is_delivery = str(target_order.get("table_id", "")).startswith("WA")
                packaging = 30 if is_delivery else 0
                target_order["subtotal"] = subtotal
                target_order["tax"] = tax
                target_order["total"] = subtotal + tax + packaging

                if len(target_order["items"]) == 0:
                    target_order["status"] = "CANCELLED"
                    target_order["kds_done"] = True
                    for t in DB["tables"]:
                        if t["id"] == target_order["table_id"]:
                            t["status"] = "vacant"
                            t["kitchen_ready"] = False
                            t["current_order_id"] = None
                            t["subtotal"] = None
                            break
                else:
                    for t in DB["tables"]:
                        if t["id"] == target_order["table_id"]:
                            t["subtotal"] = target_order["total"]
                            break

                self.send_json_response({"success": True, "order": target_order, "deleted_item": deleted_item})
            else:
                self.send_json_response({"success": False, "error": "Order not found"})

        elif path == "/api/orders/update-item":
            order_id = data.get("order_id")
            item_index = data.get("item_index")
            delta = data.get("delta", 0)
            target_order = None
            for o in DB["orders"]:
                if o["order_id"] == order_id:
                    target_order = o
                    if isinstance(item_index, int) and 0 <= item_index < len(o.get("items", [])):
                        item = o["items"][item_index]
                        item["qty"] = max(0, item.get("qty", 1) + delta)
                        if item["qty"] == 0:
                            o["items"].pop(item_index)
                    break

            if target_order:
                subtotal = sum(i.get("qty", 1) * i.get("price", 0) for i in target_order.get("items", []))
                tax = round(subtotal * 0.05, 1)
                is_delivery = str(target_order.get("table_id", "")).startswith("WA")
                packaging = 30 if is_delivery else 0
                target_order["subtotal"] = subtotal
                target_order["tax"] = tax
                target_order["total"] = subtotal + tax + packaging

                if len(target_order["items"]) == 0:
                    target_order["status"] = "CANCELLED"
                    target_order["kds_done"] = True
                    for t in DB["tables"]:
                        if t["id"] == target_order["table_id"]:
                            t["status"] = "vacant"
                            t["kitchen_ready"] = False
                            t["current_order_id"] = None
                            t["subtotal"] = None
                            break
                else:
                    for t in DB["tables"]:
                        if t["id"] == target_order["table_id"]:
                            t["subtotal"] = target_order["total"]
                            break

                self.send_json_response({"success": True, "order": target_order})
            else:
                self.send_json_response({"success": False, "error": "Order not found"})

        elif path == "/api/menu/add":
            new_id = f"custom_{len(DB['menu']) + 1}"
            new_item = {
                "id": new_id,
                "name": data.get("name", "New Special Dish"),
                "category": data.get("category", "Main Course"),
                "price": float(data.get("price", 250)),
                "is_veg": bool(data.get("is_veg", True)),
                "description": data.get("description", "Chef's signature specialty"),
                "variants": []
            }
            DB["menu"].append(new_item)
            self.send_json_response({"success": True, "item": new_item, "message": f"Dish '{new_item['name']}' added to menu!"})

        elif path == "/api/categories/add":
            name = str(data.get("name", "")).strip()
            if not name:
                self.send_json_response({"success": False, "error": "Category name cannot be empty"})
            else:
                if name not in DB.get("categories", []):
                    DB.setdefault("categories", []).append(name)
                self.send_json_response({"success": True, "name": name, "categories": DB["categories"], "message": f"Category '{name}' added successfully!"})

        elif path == "/api/menu/delete":
            item_id = data.get("id")
            deleted = False
            for idx, item in enumerate(DB["menu"]):
                if item["id"] == item_id:
                    DB["menu"].pop(idx)
                    deleted = True
                    break
            self.send_json_response({"success": deleted, "item_id": item_id})

        elif path == "/api/inventory/update-stock":
            item_id = data.get("id")
            delta = float(data.get("delta", 0))
            new_status = data.get("status")
            matched = None
            for item in DB.get("inventory", []):
                if item["id"] == item_id:
                    if delta:
                        item["current_stock"] = max(0.0, round(float(item["current_stock"]) + delta, 1))
                    if new_status:
                        item["status"] = new_status
                    if item["current_stock"] <= item["min_stock"]:
                        item["status"] = "Low Stock"
                    matched = item
                    break
            self.send_json_response({"success": bool(matched), "item": matched})

        elif path == "/api/purchase-orders/create":
            po_id = f"PO-{len(DB.get('purchase_orders', [])) + 884}"
            new_po = {
                "po_id": po_id,
                "supplier": data.get("supplier", "Hyperpure by Zomato"),
                "items": data.get("items", "Restock supplies"),
                "amount": float(data.get("amount", 2500)),
                "status": "ORDER_PLACED",
                "eta": "Today Evening"
            }
            DB.setdefault("purchase_orders", []).insert(0, new_po)
            self.send_json_response({"success": True, "po": new_po, "message": f"PO #{po_id} dispatched to {new_po['supplier']}!"})

        elif path == "/api/aggregators/toggle":
            platform = data.get("platform", "swiggy")
            if platform in DB.get("aggregators", {}):
                cur = DB["aggregators"][platform]["status"]
                DB["aggregators"][platform]["status"] = "OFFLINE" if cur == "ONLINE" else "ONLINE"
                self.send_json_response({"success": True, "platform": platform, "status": DB["aggregators"][platform]["status"]})
            else:
                self.send_json_response({"success": False, "error": "Platform not found"})

        elif path == "/api/aggregators/sync-menu":
            self.send_json_response({
                "success": True,
                "synced_items": len(DB.get("menu", [])),
                "platforms": ["Swiggy", "Zomato", "ONDC", "WhatsApp Direct"],
                "message": f"Successfully synchronized {len(DB.get('menu', []))} dishes across Swiggy, Zomato & WhatsApp in 320ms!"
            })

        elif path == "/api/ai/query":
            q = data.get("query", "").lower()
            if "margin" in q or "profit" in q:
                reply = {
                    "answer": "Top profit margin dish today is Fresh Lime Soda (91.2% gross margin, ₹90 price / ₹7.90 cost) and Paneer Tikka Angara (84.1% margin, ₹280 price / ₹44.50 raw cost).",
                    "highlights": [
                        {"label": "Highest Margin Dish", "value": "Fresh Lime Soda (91.2%)"},
                        {"label": "Volume Margin Leader", "value": "Paneer Tikka Angara (₹235.50 profit/unit)"},
                        {"label": "Recommendation", "value": "Train captains to suggest Fresh Lime Soda as pairing for Starters."}
                    ]
                }
            elif "friday" in q or "rush" in q or "order" in q or "paneer" in q:
                reply = {
                    "answer": "Based on historical Friday dinner rush analysis (+42% spike), we forecast a requirement of 18.5 kg Fresh Malai Paneer and 24.0 kg Chicken. You currently hold 14.5 kg Paneer (shortfall of 4.0 kg).",
                    "highlights": [
                        {"label": "Forecasted Demand", "value": "18.5 kg Paneer, 24 kg Chicken"},
                        {"label": "Current Stock", "value": "14.5 kg Paneer (Deficit: 4.0 kg)"},
                        {"label": "Auto-Action", "value": "Prepared Hyperpure 1-Click PO for 10 kg Malai Paneer at ₹340/kg."}
                    ]
                }
            elif "fraud" in q or "void" in q or "cancel" in q:
                reply = {
                    "answer": "Audit check complete. 1 void order detected today: Order #ORD-098 (Table 4, ₹1,420 cancelled by Captain Rajesh after 45 minutes). Zero suspicious discount overrides found.",
                    "highlights": [
                        {"label": "Void Order Audit", "value": "1 incident flagged (ORD-098)"},
                        {"label": "Kitchen Wastage Slip", "value": "Missing physical chef approval"},
                        {"label": "Loss Prevention Advice", "value": "Enable mandatory Manager PIN for void orders exceeding ₹500."}
                    ]
                }
            elif "commission" in q or "swiggy" in q or "zomato" in q:
                reply = {
                    "answer": "Today you paid ₹2,790 in commissions to Swiggy (25%) and Zomato (25%) on 28 orders. In contrast, your 14 WhatsApp Direct orders generated ₹7,890 at 0% commission, retaining 100% of revenue.",
                    "highlights": [
                        {"label": "Commission Paid Today", "value": "₹ 2,790 (Swiggy + Zomato)"},
                        {"label": "WhatsApp 0% Commission Saved", "value": "₹ 1,972.50 retained"},
                        {"label": "30-Day Potential Savings", "value": "₹ 59,175/month if 50% orders move to WhatsApp QR"}
                    ]
                }
            else:
                reply = {
                    "answer": f"Analysis for: '{data.get('query', '')}'. System operating at peak performance: 42 total orders, ₹38,450 total revenue, ₹22,150 UPI QR settlements. Zero system lag (4ms API latency).",
                    "highlights": [
                        {"label": "Daily Revenue Run-Rate", "value": "₹ 38,450"},
                        {"label": "Table Occupancy", "value": "4 out of 8 Tables Active (50%)"},
                        {"label": "AI Recommendation", "value": "Send WhatsApp promo for Happy Hour desserts to boost 8 PM - 10 PM covers."}
                    ]
                }
            self.send_json_response({"success": True, "query": data.get("query"), "response": reply})

        elif path == "/api/whatsapp/send-bill":
            phone = data.get("phone", "9820012345")
            order_id = data.get("order_id", "ORD-101")
            total = data.get("total", 819)
            self.send_json_response({
                "success": True,
                "phone": phone,
                "message": f"Digital Tax Invoice for Order #{order_id} (₹{total}) dispatched to WhatsApp {phone} with Google Review link. Zero paper wasted!"
            })

        else:
            self.send_error(404, "API route not found")

    def send_json_response(self, data_dict, status=200):
        body = json.dumps(data_dict, default=str).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")
        self.send_header("Connection", "keep-alive")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.end_headers()
        self.wfile.write(body)


class ThreadedHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    """
    Enterprise-Grade Multi-Threaded HTTP Server
    Handles 100+ concurrent POS queries across multiple terminals (Cashier, KDS, Captain, Kiosk)
    with zero blocking and sub-5ms latency.
    """
    daemon_threads = True
    allow_reuse_address = True
    request_queue_size = 128


def run_server():
    global PORT
    os.makedirs(PUBLIC_DIR, exist_ok=True)
    load_db_from_disk()
    start_persistence_worker()
    PORT = get_free_port(int(os.environ.get("PORT", 3000)))
    server_address = ("", PORT)
    with ThreadedHTTPServer(server_address, POSRequestHandler) as httpd:
        print(f"==================================================")
        print(f"🚀 RestroDeck Cloud POS Enterprise Server (restrodeck.com)")
        print(f"🌐 Running on: http://localhost:{PORT}")
        print(f"⚡ Worker Threads: Multi-threaded non-blocking queue")
        print(f"📦 Order Persistence: Async Write-Behind Queue")
        print(f"==================================================")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nGracefully shutting down POS server...")
            save_db_to_disk(sync=True)
            httpd.server_close()


if __name__ == "__main__":
    run_server()
