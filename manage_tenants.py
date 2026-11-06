#!/usr/bin/env python3
"""
RestroDeck Cloud POS - Tenant & Customer Management Engine
Usage:
  python3 manage_tenants.py list
  python3 manage_tenants.py create <tenant_id> --name "..." --phone "..." --upi "..."
  python3 manage_tenants.py info <tenant_id>
  python3 manage_tenants.py backup <tenant_id>
  python3 manage_tenants.py backup-all
  python3 manage_tenants.py restore <tenant_id> <backup_path>
"""

import sys
import os
import json
import argparse
from datetime import datetime
import shutil

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
TENANTS_DIR = os.path.join(DATA_DIR, "tenants")
BACKUPS_DIR = os.path.join(BASE_DIR, "backups")
DEFAULT_STORE = os.path.join(DATA_DIR, "pos_store.json")

def ensure_directories():
    os.makedirs(DATA_DIR, exist_ok=True)
    os.makedirs(TENANTS_DIR, exist_ok=True)
    os.makedirs(BACKUPS_DIR, exist_ok=True)

def get_tenant_file(tenant_id):
    clean_id = "".join(c for c in tenant_id.lower() if c.isalnum() or c in "-_")
    return os.path.join(TENANTS_DIR, f"{clean_id}.json")

def load_template():
    if os.path.exists(DEFAULT_STORE):
        try:
            with open(DEFAULT_STORE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    # Fallback minimal schema
    return {
        "restaurant": {
            "name": "New Restaurant Outlet",
            "tagline": "Dine-in, Takeaway & Delivery",
            "phone": "+91 93138 38165",
            "address": "High Street, City",
            "gstin": "27AADCS1234F1Z5",
            "fssai": "11521012000456",
            "upi_vpa": "restrodeck@okaxis"
        },
        "categories": ["Starters", "Main Course", "Breads", "Beverages", "Desserts"],
        "tables": [
            {"id": "T1", "name": "Table 1", "section": "AC Dine-in", "seats": 2, "status": "vacant", "current_order_id": None, "seated_at": None},
            {"id": "T2", "name": "Table 2", "section": "AC Dine-in", "seats": 4, "status": "vacant", "current_order_id": None, "seated_at": None},
            {"id": "T3", "name": "Table 3", "section": "AC Dine-in", "seats": 4, "status": "vacant", "current_order_id": None, "seated_at": None},
            {"id": "T4", "name": "Table 4", "section": "AC Dine-in", "seats": 6, "status": "vacant", "current_order_id": None, "seated_at": None},
            {"id": "TA1", "name": "Takeaway 1", "section": "Takeaway", "seats": 0, "status": "vacant", "current_order_id": None, "seated_at": None}
        ],
        "menu": [],
        "orders": [],
        "daily_analytics": {
            "total_revenue": 0,
            "total_orders": 0,
            "upi_qr_amount": 0,
            "cash_amount": 0,
            "whatsapp_direct_orders": 0,
            "paper_rolls_saved": 0
        },
        "state_version": 1
    }

def cmd_create(args):
    ensure_directories()
    tenant_id = args.tenant_id.lower().strip()
    target_path = get_tenant_file(tenant_id)

    if os.path.exists(target_path) and not args.force:
        print(f"❌ Error: Tenant '{tenant_id}' already exists at {target_path}!")
        print("   Use --force to overwrite if you are certain.")
        sys.exit(1)

    template = load_template()
    # Personalize
    template["restaurant"]["name"] = args.name or template["restaurant"]["name"]
    template["restaurant"]["phone"] = args.phone or template["restaurant"]["phone"]
    template["restaurant"]["address"] = args.address or template["restaurant"]["address"]
    if args.tagline:
        template["restaurant"]["tagline"] = args.tagline
    if args.gstin:
        template["restaurant"]["gstin"] = args.gstin
    if args.fssai:
        template["restaurant"]["fssai"] = args.fssai
    if args.upi:
        template["restaurant"]["upi_vpa"] = args.upi
    template["restaurant"]["plan"] = (args.plan or "pro").lower()

    # Reset tables to vacant
    for t in template.get("tables", []):
        t["status"] = "vacant"
        t["current_order_id"] = None
        t["seated_at"] = None
        t["subtotal"] = None

    # Clear previous orders unless keeping
    if not args.keep_orders:
        template["orders"] = []
        template["daily_analytics"] = {
            "total_revenue": 0,
            "total_orders": 0,
            "upi_qr_amount": 0,
            "cash_amount": 0,
            "whatsapp_direct_orders": 0,
            "paper_rolls_saved": 0
        }

    template["tenant_id"] = tenant_id
    template["created_at"] = datetime.now().isoformat()
    template["state_version"] = 1

    tmp_file = f"{target_path}.tmp"
    with open(tmp_file, "w", encoding="utf-8") as f:
        json.dump(template, f, indent=2, ensure_ascii=False)
    os.replace(tmp_file, target_path)

    print(f"==================================================")
    print(f"✅ Tenant Created Successfully!")
    print(f"🏢 Restaurant: {template['restaurant']['name']}")
    print(f"🔑 Tenant ID:   {tenant_id}")
    print(f"💎 Plan Tier:   {template['restaurant']['plan'].upper()}")
    print(f"📁 Database:    {target_path}")
    print(f"🌐 Access URL:  https://{tenant_id}.restrodeck.com/pos")
    print(f"🌐 Path URL:    http://localhost:3001/pos?tenant={tenant_id}")
    print(f"📱 Phone:       {template['restaurant']['phone']}")
    print(f"💳 UPI QR VPA:  {template['restaurant'].get('upi_vpa', 'N/A')}")
    print(f"==================================================")

def cmd_list(args):
    ensure_directories()
    files = [f for f in os.listdir(TENANTS_DIR) if f.endswith(".json")]
    
    print(f"\n{'='*92}")
    print(f"🏢 RESTRODECK REGISTERED CLIENT TENANTS ({len(files)} Outlets)")
    print(f"{'='*92}")
    print(f"{'TENANT ID':<13} {'RESTAURANT NAME':<22} {'STATUS':<11} {'PLAN':<10} {'PHONE':<14} {'ORDERS':<7} {'REVENUE':<10}")
    print(f"{'-'*92}")

    # Also include default if pos_store.json exists
    if os.path.exists(DEFAULT_STORE):
        try:
            with open(DEFAULT_STORE, "r", encoding="utf-8") as f:
                d = json.load(f)
                r_name = d.get("restaurant", {}).get("name", "Default Store")
                phone = d.get("restaurant", {}).get("phone", "N/A")
                plan = d.get("restaurant", {}).get("plan", "pro").upper()
                is_act = d.get("is_active", True) is not False and d.get("restaurant", {}).get("is_active", True) is not False
                status_str = "ACTIVE" if is_act else "SUSPENDED"
                orders = len(d.get("orders", []))
                rev = d.get("daily_analytics", {}).get("total_revenue", 0)
                print(f"{'default':<13} {r_name[:21]:<22} {status_str:<11} {plan:<10} {phone:<14} {orders:<7} ₹{rev:<9}")
        except Exception:
            pass

    for filename in sorted(files):
        tid = filename[:-5]
        filepath = os.path.join(TENANTS_DIR, filename)
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                d = json.load(f)
                r_name = d.get("restaurant", {}).get("name", tid)
                phone = d.get("restaurant", {}).get("phone", "N/A")
                plan = d.get("restaurant", {}).get("plan", "pro").upper()
                is_act = d.get("is_active", True) is not False and d.get("restaurant", {}).get("is_active", True) is not False
                status_str = "ACTIVE" if is_act else "SUSPENDED"
                orders = len(d.get("orders", []))
                rev = d.get("daily_analytics", {}).get("total_revenue", 0)
                print(f"{tid:<13} {r_name[:21]:<22} {status_str:<11} {plan:<10} {phone:<14} {orders:<7} ₹{rev:<9}")
        except Exception as e:
            print(f"{tid:<13} [Error reading file: {e}]")

    print(f"{'='*92}\n")

def cmd_info(args):
    tenant_id = args.tenant_id.lower().strip()
    target_path = get_tenant_file(tenant_id)
    if tenant_id == "default" and os.path.exists(DEFAULT_STORE):
        target_path = DEFAULT_STORE

    if not os.path.exists(target_path):
        print(f"❌ Tenant '{tenant_id}' not found at {target_path}!")
        sys.exit(1)

    with open(target_path, "r", encoding="utf-8") as f:
        d = json.load(f)

    rest = d.get("restaurant", {})
    tables = d.get("tables", [])
    menu = d.get("menu", [])
    orders = d.get("orders", [])
    analytics = d.get("daily_analytics", {})
    is_act = d.get("is_active", True) is not False and rest.get("is_active", True) is not False

    print(f"\n==================================================")
    print(f"📊 RESTRODECK TENANT PROFILE: {tenant_id.upper()}")
    print(f"==================================================")
    print(f"🏢 Name:         {rest.get('name')}")
    print(f"🔒 Status:       {'🟢 ACTIVE (Full Access)' if is_act else '🔴 SUSPENDED (POS Locked)'}")
    if not is_act and d.get("deactivation_reason"):
        print(f"⚠️ Reason:       {d.get('deactivation_reason')}")
    if not is_act and d.get("deactivated_at"):
        print(f"📅 Suspended On: {d.get('deactivated_at')}")
    print(f"💎 Plan Tier:    {rest.get('plan', 'pro').upper()}")
    print(f"🏷️ Tagline:      {rest.get('tagline')}")
    print(f"📱 Phone:        {rest.get('phone')}")
    print(f"📍 Address:      {rest.get('address')}")
    print(f"💳 UPI QR VPA:   {rest.get('upi_vpa', 'Not configured')}")
    print(f"🧾 GSTIN:        {rest.get('gstin', 'N/A')}")
    print(f"🥗 FSSAI:        {rest.get('fssai', 'N/A')}")
    print(f"🪑 Total Tables: {len(tables)} ({sum(1 for t in tables if t.get('status') == 'occupied')} occupied)")
    print(f"📜 Menu Items:   {len(menu)} items across {len(d.get('categories', []))} categories")
    print(f"📦 Total Orders: {len(orders)}")
    print(f"💰 Total Revenue: ₹{analytics.get('total_revenue', 0):,}")
    print(f"📱 Direct UPI:   ₹{analytics.get('upi_qr_amount', 0):,}")
    print(f"💵 Cash Revenue: ₹{analytics.get('cash_amount', 0):,}")
    print(f"==================================================\n")

def cmd_backup(args):
    ensure_directories()
    tenant_id = args.tenant_id.lower().strip()
    source_path = get_tenant_file(tenant_id)
    if tenant_id == "default":
        source_path = DEFAULT_STORE

    if not os.path.exists(source_path):
        print(f"❌ Cannot backup: Tenant '{tenant_id}' does not exist!")
        sys.exit(1)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_filename = f"{tenant_id}_{timestamp}.json"
    backup_path = os.path.join(BACKUPS_DIR, backup_filename)

    shutil.copyfile(source_path, backup_path)
    print(f"📦 Backup created: {backup_path} ({os.path.getsize(backup_path)} bytes)")

def cmd_backup_all(args):
    ensure_directories()
    files = [f for f in os.listdir(TENANTS_DIR) if f.endswith(".json")]
    if os.path.exists(DEFAULT_STORE):
        files.append("default.json")

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backed_up = 0
    for f in files:
        tid = f[:-5]
        src = DEFAULT_STORE if tid == "default" else os.path.join(TENANTS_DIR, f)
        dest = os.path.join(BACKUPS_DIR, f"{tid}_{timestamp}.json")
        try:
            shutil.copyfile(src, dest)
            backed_up += 1
        except Exception as e:
            print(f"⚠️ Failed to backup {tid}: {e}")

    print(f"✅ Successfully backed up {backed_up} tenant databases to {BACKUPS_DIR}/")

def cmd_restore(args):
    tenant_id = args.tenant_id.lower().strip()
    target_path = get_tenant_file(tenant_id)
    if tenant_id == "default":
        target_path = DEFAULT_STORE

    backup_path = args.backup_path
    if not os.path.exists(backup_path):
        print(f"❌ Backup file not found: {backup_path}")
        sys.exit(1)

    # Validate JSON syntax
    try:
        with open(backup_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            assert "restaurant" in data, "Missing 'restaurant' key"
    except Exception as e:
        print(f"❌ Corrupt backup file: {e}")
        sys.exit(1)

    shutil.copyfile(backup_path, target_path)
    print(f"✅ Restored tenant '{tenant_id}' from {backup_path}!")

def cmd_set_plan(args):
    ensure_directories()
    tenant_id = args.tenant_id.lower().strip()
    target_path = get_tenant_file(tenant_id)
    if tenant_id == "default":
        target_path = DEFAULT_STORE

    if not os.path.exists(target_path):
        print(f"❌ Tenant '{tenant_id}' not found at {target_path}!")
        sys.exit(1)

    with open(target_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    old_plan = data.get("restaurant", {}).get("plan", "pro")
    new_plan = args.plan.lower().strip()
    data.setdefault("restaurant", {})["plan"] = new_plan
    data["state_version"] = data.get("state_version", 1) + 1

    tmp_file = f"{target_path}.tmp"
    with open(tmp_file, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    os.replace(tmp_file, target_path)

    print(f"✅ Plan updated for '{tenant_id}': {old_plan.upper()} ➔ {new_plan.upper()}")

def cmd_deactivate(args):
    tenant_id = args.tenant_id.lower().strip()
    target_path = get_tenant_file(tenant_id)
    if tenant_id == "default" and os.path.exists(DEFAULT_STORE):
        target_path = DEFAULT_STORE

    if not os.path.exists(target_path):
        print(f"❌ Tenant '{tenant_id}' not found at {target_path}!")
        sys.exit(1)

    with open(target_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    data["is_active"] = False
    data.setdefault("restaurant", {})["is_active"] = False
    data["deactivated_at"] = datetime.now().isoformat()
    if getattr(args, "reason", None):
        data["deactivation_reason"] = args.reason
    data["state_version"] = data.get("state_version", 1) + 1

    tmp_file = f"{target_path}.tmp"
    with open(tmp_file, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    os.replace(tmp_file, target_path)

    print(f"\n🔒 TENANT DEACTIVATED: '{tenant_id}'")
    print("   POS billing, staff login, and ordering have been immediately LOCKED.")
    if getattr(args, "reason", None):
        print(f"   Reason: {args.reason}\n")

def cmd_activate(args):
    tenant_id = args.tenant_id.lower().strip()
    target_path = get_tenant_file(tenant_id)
    if tenant_id == "default" and os.path.exists(DEFAULT_STORE):
        target_path = DEFAULT_STORE

    if not os.path.exists(target_path):
        print(f"❌ Tenant '{tenant_id}' not found at {target_path}!")
        sys.exit(1)

    with open(target_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    data["is_active"] = True
    data.setdefault("restaurant", {})["is_active"] = True
    data.pop("deactivated_at", None)
    data.pop("deactivation_reason", None)
    data["state_version"] = data.get("state_version", 1) + 1

    tmp_file = f"{target_path}.tmp"
    with open(tmp_file, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    os.replace(tmp_file, target_path)

    print(f"\n✅ TENANT ACTIVATED: '{tenant_id}'")
    print("   POS billing, staff login, and ordering access have been RESTORED.\n")

def main():
    parser = argparse.ArgumentParser(description="RestroDeck Multi-Tenant POS Manager")
    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # list
    subparsers.add_parser("list", help="List all registered restaurant tenants")

    # create
    p_create = subparsers.add_parser("create", help="Create a new restaurant tenant")
    p_create.add_argument("tenant_id", help="Unique tenant slug (e.g. urbantandoor)")
    p_create.add_argument("--name", help="Restaurant display name", required=True)
    p_create.add_argument("--phone", help="Restaurant phone number")
    p_create.add_argument("--address", help="Restaurant address")
    p_create.add_argument("--tagline", help="Tagline / description")
    p_create.add_argument("--upi", help="Owner UPI VPA for dynamic QR code")
    p_create.add_argument("--gstin", help="GSTIN Number")
    p_create.add_argument("--fssai", help="FSSAI License Number")
    p_create.add_argument("--plan", choices=["starter", "pro", "franchise"], default="pro", help="Subscription tier (starter, pro, franchise; default: pro)")
    p_create.add_argument("--force", action="store_true", help="Overwrite if exists")
    p_create.add_argument("--keep-orders", action="store_true", help="Keep template orders")

    # info
    p_info = subparsers.add_parser("info", help="View tenant details and analytics")
    p_info.add_argument("tenant_id", help="Tenant ID")

    # backup
    p_backup = subparsers.add_parser("backup", help="Create a timestamped backup of a tenant")
    p_backup.add_argument("tenant_id", help="Tenant ID")

    # backup-all
    subparsers.add_parser("backup-all", help="Backup all tenant databases")

    # restore
    p_restore = subparsers.add_parser("restore", help="Restore tenant from backup")
    p_restore.add_argument("tenant_id", help="Tenant ID")
    p_restore.add_argument("backup_path", help="Path to .json backup file")

    # set-plan
    p_set_plan = subparsers.add_parser("set-plan", help="Update tenant subscription plan tier")
    p_set_plan.add_argument("tenant_id", help="Tenant ID")
    p_set_plan.add_argument("plan", choices=["starter", "pro", "franchise"], help="New plan tier (starter, pro, franchise)")

    # deactivate
    p_deact = subparsers.add_parser("deactivate", help="Deactivate and lock tenant POS/login")
    p_deact.add_argument("tenant_id", help="Tenant ID to deactivate")
    p_deact.add_argument("--reason", help="Deactivation reason (e.g. Subscription overdue)")

    # activate
    p_act = subparsers.add_parser("activate", help="Reactivate tenant POS and restore access")
    p_act.add_argument("tenant_id", help="Tenant ID to reactivate")

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        sys.exit(0)

    if args.command == "list":
        cmd_list(args)
    elif args.command == "create":
        cmd_create(args)
    elif args.command == "info":
        cmd_info(args)
    elif args.command == "backup":
        cmd_backup(args)
    elif args.command == "backup-all":
        cmd_backup_all(args)
    elif args.command == "restore":
        cmd_restore(args)
    elif args.command == "set-plan":
        cmd_set_plan(args)
    elif args.command == "deactivate":
        cmd_deactivate(args)
    elif args.command == "activate":
        cmd_activate(args)

if __name__ == "__main__":
    main()
