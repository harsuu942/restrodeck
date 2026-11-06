#!/usr/bin/env python3
"""
Comprehensive End-to-End QA Test Suite for WhatsLead Cloud POS
Tests API contracts, data mutations, business rules, edge cases, and state integrity.
"""

import unittest
import json
import io
import copy
import os
import server
from server import DB, POSRequestHandler, get_tenant_db, TENANTS_DIR, TENANT_DBS

class MockSocket:
    def __init__(self):
        self.output = io.BytesIO()

    def makefile(self, *args, **kwargs):
        if 'r' in args[0] or 'rb' in args[0]:
            return io.BytesIO(b"")
        return self.output

class MockPOSHandler(POSRequestHandler):
    def __init__(self):
        self.response_code = None
        self.response_headers = {}
        self.response_body = None
        self.wfile = io.BytesIO()

    def send_response(self, code, message=None):
        self.response_code = code

    def send_header(self, keyword, value):
        self.response_headers[keyword] = value

    def end_headers(self):
        pass

    def send_error(self, code, message=None, explain=None):
        self.response_code = code
        self.response_body = {"error": message or str(code)}

    def send_json_response(self, data_dict, status=200):
        self.response_code = status
        self.response_body = data_dict
        super().send_json_response(data_dict, status=status)

class TestWhatsLeadPOSBackend(unittest.TestCase):
    def setUp(self):
        # Save snapshot of DB
        self.original_db = copy.deepcopy(DB)
        self.handler = MockPOSHandler()

    def tearDown(self):
        # Restore DB snapshot to ensure test isolation
        DB.clear()
        DB.update(self.original_db)

    def test_01_api_init(self):
        """Verify GET /api/init returns full restaurant config, tables, menu, orders, analytics"""
        self.handler.handle_api_get("/api/init")
        self.assertEqual(self.handler.response_code, 200)
        data = self.handler.response_body
        self.assertIn("restaurant", data)
        self.assertIn("tables", data)
        self.assertIn("menu", data)
        self.assertIn("orders", data)
        self.assertIn("analytics", data)
        self.assertTrue(len(data["tables"]) >= 8)
        self.assertTrue(len(data["menu"]) >= 18)
        self.assertEqual(data["restaurant"]["gstin"], "27AADCS1234F1Z5")

    def test_02_api_menu_and_tables_get(self):
        """Verify GET /api/menu and GET /api/tables return arrays"""
        self.handler.handle_api_get("/api/menu")
        self.assertEqual(self.handler.response_code, 200)
        self.assertIsInstance(self.handler.response_body, list)

        self.handler.handle_api_get("/api/tables")
        self.assertEqual(self.handler.response_code, 200)
        self.assertIsInstance(self.handler.response_body, list)

    def test_03_create_order_full_flow(self):
        """Verify POST /api/orders/create creates order, updates table status, and increments analytics"""
        initial_order_count = len(DB["orders"])
        initial_revenue = DB["daily_analytics"]["total_revenue"]
        
        payload = {
            "table_id": "T1",
            "table_name": "Table 1",
            "items": [
                {"name": "Paneer Tikka Angara", "qty": 1, "price": 280, "notes": "Medium spicy"},
                {"name": "Butter Naan", "qty": 2, "price": 60, "notes": "Hot"}
            ],
            "subtotal": 400,
            "tax": 20,
            "total": 420
        }
        self.handler.handle_api_post("/api/orders/create", payload)
        self.assertEqual(self.handler.response_code, 200)
        res = self.handler.response_body
        self.assertTrue(res["success"])
        self.assertIn("order", res)
        created_order = res["order"]
        self.assertEqual(created_order["table_id"], "T1")
        self.assertEqual(created_order["total"], 420)
        self.assertEqual(created_order["status"], "PREPARING")
        self.assertFalse(created_order["kds_done"])
        
        # Verify DB mutation
        self.assertEqual(len(DB["orders"]), initial_order_count + 1)
        self.assertEqual(DB["daily_analytics"]["total_revenue"], initial_revenue + 420)
        
        # Verify table status changed to occupied
        t1 = next(t for t in DB["tables"] if t["id"] == "T1")
        self.assertEqual(t1["status"], "occupied")
        self.assertEqual(t1["subtotal"], 400)
        self.assertEqual(t1["current_order_id"], created_order["order_id"])

    def test_04_settle_order_flow(self):
        """Verify POST /api/orders/settle marks order COMPLETED, updates payment, and vacates table"""
        # Pick Table 2 which is occupied with ORD-101
        t2 = next(t for t in DB["tables"] if t["id"] == "T2")
        self.assertEqual(t2["status"], "occupied")
        
        payload = {
            "order_id": "ORD-101",
            "table_id": "T2",
            "payment_mode": "UPI_QR"
        }
        self.handler.handle_api_post("/api/orders/settle", payload)
        self.assertEqual(self.handler.response_code, 200)
        self.assertTrue(self.handler.response_body["success"])

        # Verify order status
        ord101 = next(o for o in DB["orders"] if o["order_id"] == "ORD-101")
        self.assertEqual(ord101["status"], "COMPLETED")
        self.assertTrue(ord101["kds_done"])
        self.assertEqual(ord101["payment_status"], "PAID_UPI_QR")

        # Verify table vacated
        self.assertEqual(t2["status"], "vacant")
        self.assertIsNone(t2["current_order_id"])
        self.assertIsNone(t2["subtotal"])

    def test_05_kds_status_advance_and_bump(self):
        """Verify POST /api/kds/status updates kds_status and sets kds_done=True on COMPLETED"""
        ord102 = next(o for o in DB["orders"] if o["order_id"] == "ORD-102")
        self.assertFalse(ord102["kds_done"])

        payload = {
            "order_id": "ORD-102",
            "status": "COMPLETED"
        }
        self.handler.handle_api_post("/api/kds/status", payload)
        self.assertEqual(self.handler.response_code, 200)
        self.assertTrue(ord102["kds_done"])
        self.assertEqual(ord102["kds_status"], "COMPLETED")
        t6 = next(t for t in DB["tables"] if t["id"] == "T6")
        self.assertTrue(t6.get("kitchen_ready", False))

    def test_06_add_table_endpoint(self):
        """Verify POST /api/tables/add adds table to in-memory list"""
        initial_tables_len = len(DB["tables"])
        payload = {
            "name": "Rooftop 1",
            "section": "Rooftop Terrace",
            "seats": 6
        }
        self.handler.handle_api_post("/api/tables/add", payload)
        self.assertEqual(self.handler.response_code, 200)
        res = self.handler.response_body
        self.assertTrue(res["success"])
        self.assertEqual(len(DB["tables"]), initial_tables_len + 1)
        new_table = DB["tables"][-1]
        self.assertEqual(new_table["name"], "Rooftop 1")
        self.assertEqual(new_table["seats"], 6)
        self.assertEqual(new_table["status"], "vacant")

    def test_07_add_menu_item_endpoint(self):
        """Verify POST /api/menu/add adds dish to menu list"""
        initial_menu_len = len(DB["menu"])
        payload = {
            "name": "Kadhai Paneer Special",
            "category": "Main Course",
            "price": 310,
            "is_veg": True,
            "description": "Bell peppers, whole coriander and fresh cottage cheese"
        }
        self.handler.handle_api_post("/api/menu/add", payload)
        self.assertEqual(self.handler.response_code, 200)
        res = self.handler.response_body
        self.assertTrue(res["success"])
        self.assertEqual(len(DB["menu"]), initial_menu_len + 1)
        new_item = DB["menu"][-1]
        self.assertEqual(new_item["name"], "Kadhai Paneer Special")
        self.assertEqual(new_item["price"], 310.0)
        self.assertTrue(new_item["is_veg"])

    def test_08_whatsapp_simulate_order_3_messages(self):
        """Verify POST /api/whatsapp/simulate-order parses customer NLP and returns 3-message sequence"""
        payload = {
            "text": "Bhaiya 2 Dum Chicken Biryani and 4 Butter Naan jaldi bhejo",
            "phone": "9820011223"
        }
        self.handler.handle_api_post("/api/whatsapp/simulate-order", payload)
        self.assertEqual(self.handler.response_code, 200)
        res = self.handler.response_body
        self.assertTrue(res["success"])
        self.assertIn("messages", res)
        # MUST have 3 messages in sequence
        self.assertEqual(len(res["messages"]), 3)
        self.assertEqual(res["messages"][0]["title"], "Order Acknowledged")
        self.assertEqual(res["messages"][1]["title"], "Payment Confirmed")
        self.assertEqual(res["messages"][2]["title"], "Kitchen KDS Alert")
        # Order must be created and added to DB
        order = res["order"]
        self.assertEqual(order["table_id"], "WA1")
        self.assertTrue(order["order_id"].startswith("WA-"))

    def test_09_whatsapp_send_bill(self):
        """Verify POST /api/whatsapp/send-bill returns success confirmation"""
        payload = {
            "phone": "9819012345",
            "order_id": "ORD-101",
            "total": 819
        }
        self.handler.handle_api_post("/api/whatsapp/send-bill", payload)
        self.assertEqual(self.handler.response_code, 200)
        self.assertTrue(self.handler.response_body["success"])
        self.assertIn("WhatsApp 9819012345", self.handler.response_body["message"])

    def test_10_invalid_route_404(self):
        """Verify GET and POST to non-existent API routes return 404"""
        self.handler.handle_api_get("/api/invalid_path")
        self.assertEqual(self.handler.response_code, 404)

        self.handler.handle_api_post("/api/invalid_post", {})
        self.assertEqual(self.handler.response_code, 404)

    def test_11_settle_analytics_breakdown(self):
        """Verify settling with UPI_QR updates upi_qr_amount and paper_rolls_saved"""
        initial_upi = DB["daily_analytics"]["upi_qr_amount"]
        initial_rolls = DB["daily_analytics"]["paper_rolls_saved"]
        ord101 = next(o for o in DB["orders"] if o["order_id"] == "ORD-101")
        total = ord101["total"]

        payload = {"order_id": "ORD-101", "table_id": "T2", "payment_mode": "UPI_QR"}
        self.handler.handle_api_post("/api/orders/settle", payload)
        self.assertEqual(self.handler.response_code, 200)

        self.assertEqual(DB["daily_analytics"]["upi_qr_amount"], initial_upi + total)
        self.assertEqual(DB["daily_analytics"]["paper_rolls_saved"], initial_rolls + 1)

    def test_12_settle_cash_analytics(self):
        """Verify settling with CASH updates cash_amount and paper_rolls_saved"""
        initial_cash = DB["daily_analytics"]["cash_amount"]
        ord102 = next(o for o in DB["orders"] if o["order_id"] == "ORD-102")
        total = ord102["total"]

        payload = {"order_id": "ORD-102", "table_id": "T6", "payment_mode": "CASH"}
        self.handler.handle_api_post("/api/orders/settle", payload)
        self.assertEqual(self.handler.response_code, 200)

        self.assertEqual(DB["daily_analytics"]["cash_amount"], initial_cash + total)

    def test_13_whatsapp_nlp_presets(self):
        """Verify NLP correctly parses preset: '2 Butter Chicken, 4 Butter Naan, and 1 Dal Makhani'"""
        payload = {
            "text": "2 Butter Chicken, 4 Butter Naan, and 1 Dal Makhani",
            "phone": "9811223344"
        }
        self.handler.handle_api_post("/api/whatsapp/simulate-order", payload)
        self.assertEqual(self.handler.response_code, 200)
        items = self.handler.response_body["order"]["items"]
        
        # Must match Butter Chicken with qty 2
        bc = next((i for i in items if i["name"] == "Butter Chicken (Classic)"), None)
        self.assertIsNotNone(bc)
        self.assertEqual(bc["qty"], 2)

        # Must match Butter Naan with qty 4
        bn = next((i for i in items if i["name"] == "Butter Naan"), None)
        self.assertIsNotNone(bn)
        self.assertEqual(bn["qty"], 4)

        # Must match Dal Makhani 24-Hour with qty 1
        dm = next((i for i in items if "Dal Makhani" in i["name"]), None)
        self.assertIsNotNone(dm)
        self.assertEqual(dm["qty"], 1)

    def test_14_whatsapp_kds_state(self):
        """Verify simulated WhatsApp orders are dispatched to KDS with kds_done=False"""
        payload = {
            "text": "1 Subz Dum Biryani and 1 Masala Chaas",
            "phone": "9988776655"
        }
        self.handler.handle_api_post("/api/whatsapp/simulate-order", payload)
        self.assertEqual(self.handler.response_code, 200)
        order = self.handler.response_body["order"]
        self.assertEqual(order["status"], "PREPARING")
        self.assertEqual(order["kds_status"], "PREPARING")
        self.assertFalse(order["kds_done"])

    def test_15_kds_ready_and_table_status_sync(self):
        """Verify marking order COMPLETED in KDS sets table kitchen_ready=True"""
        ord101 = next(o for o in DB["orders"] if o["order_id"] == "ORD-101")
        self.handler.handle_api_post("/api/kds/status", {"order_id": "ORD-101", "status": "COMPLETED"})
        self.assertEqual(self.handler.response_code, 200)
        self.assertTrue(ord101["kds_done"])
        t2 = next(t for t in DB["tables"] if t["id"] == "T2")
        self.assertTrue(t2.get("kitchen_ready", False))

    def test_16_settle_vacates_ready_table(self):
        """Verify settling an order vacates table and clears kitchen_ready"""
        # First mark ready
        self.handler.handle_api_post("/api/kds/status", {"order_id": "ORD-101", "status": "COMPLETED"})
        # Now settle
        self.handler.handle_api_post("/api/orders/settle", {
            "order_id": "ORD-101",
            "table_id": "T2",
            "payment_mode": "UPI_QR"
        })
        self.assertEqual(self.handler.response_code, 200)
        t2 = next(t for t in DB["tables"] if t["id"] == "T2")
        self.assertEqual(t2["status"], "vacant")
        self.assertFalse(t2.get("kitchen_ready", False))
        self.assertIsNone(t2["current_order_id"])

    def test_17_cancel_order_and_vacate_table(self):
        """Verify POST /api/orders/cancel cancels order and vacates table"""
        ord102 = next(o for o in DB["orders"] if o["order_id"] == "ORD-102")
        self.assertEqual(ord102["status"], "NEW")
        t6 = next(t for t in DB["tables"] if t["id"] == "T6")
        self.assertEqual(t6["status"], "occupied")

        self.handler.handle_api_post("/api/orders/cancel", {
            "order_id": "ORD-102",
            "table_id": "T6"
        })
        self.assertEqual(self.handler.response_code, 200)
        self.assertTrue(self.handler.response_body["success"])

        # Order must be CANCELLED and KDS done
        self.assertEqual(ord102["status"], "CANCELLED")
        self.assertTrue(ord102["kds_done"])

        # Table T6 must be vacant
        self.assertEqual(t6["status"], "vacant")
        self.assertIsNone(t6["current_order_id"])
        self.assertIsNone(t6["subtotal"])

    def test_18_manual_table_status_assignment(self):
        """Verify POST /api/tables/status sets status to billed, reserved, vacant, occupied"""
        t1 = next(t for t in DB["tables"] if t["id"] == "T1")
        self.assertEqual(t1["status"], "vacant")

        # Assign reserved
        self.handler.handle_api_post("/api/tables/status", {"table_id": "T1", "status": "reserved"})
        self.assertEqual(self.handler.response_code, 200)
        self.assertEqual(t1["status"], "reserved")

        # Assign billed
        self.handler.handle_api_post("/api/tables/status", {"table_id": "T1", "status": "billed"})
        self.assertEqual(self.handler.response_code, 200)
        self.assertEqual(t1["status"], "billed")

        # Vacate
        self.handler.handle_api_post("/api/tables/status", {"table_id": "T1", "status": "vacant"})
        self.assertEqual(self.handler.response_code, 200)
        self.assertEqual(t1["status"], "vacant")
        self.assertFalse(t1.get("kitchen_ready", False))
        self.assertIsNone(t1.get("current_order_id"))

    def test_19_delete_order_item(self):
        """Verify POST /api/orders/delete-item removes item and recalculates totals"""
        ord101 = next(o for o in DB["orders"] if o["order_id"] == "ORD-101")
        initial_count = len(ord101["items"])
        self.assertEqual(initial_count, 3)

        # Delete first item (Paneer Tikka Angara, price 280)
        self.handler.handle_api_post("/api/orders/delete-item", {"order_id": "ORD-101", "item_index": 0})
        self.assertEqual(self.handler.response_code, 200)
        self.assertEqual(len(ord101["items"]), 2)
        # New subtotal: 4x60 (240) + 1x260 (260) = 500
        self.assertEqual(ord101["subtotal"], 500)
        self.assertEqual(ord101["tax"], 25.0)
        self.assertEqual(ord101["total"], 525.0)

    def test_20_update_order_item_qty(self):
        """Verify POST /api/orders/update-item changes quantity and recalculates totals"""
        ord101 = next(o for o in DB["orders"] if o["order_id"] == "ORD-101")
        # Item 1 is Butter Naan with qty 4
        self.assertEqual(ord101["items"][1]["qty"], 4)

        # Decrease Butter Naan by 2 (delta = -2)
        self.handler.handle_api_post("/api/orders/update-item", {"order_id": "ORD-101", "item_index": 1, "delta": -2})
        self.assertEqual(self.handler.response_code, 200)
        self.assertEqual(ord101["items"][1]["qty"], 2)
        # New subtotal: 280 + 2x60 (120) + 260 = 660
        self.assertEqual(ord101["subtotal"], 660)

    def test_21_add_category(self):
        """Verify POST /api/categories/add adds new category to DB"""
        self.handler.handle_api_post("/api/categories/add", {"name": "Mocktails & Shakes"})
        self.assertEqual(self.handler.response_code, 200)
        self.assertIn("Mocktails & Shakes", DB["categories"])

    def test_22_inventory_update_stock(self):
        """Verify POST /api/inventory/update-stock modifies stock level"""
        inv1 = next(i for i in DB["inventory"] if i["id"] == "inv1")
        initial_stock = inv1["current_stock"]
        self.handler.handle_api_post("/api/inventory/update-stock", {"id": "inv1", "delta": -2.5})
        self.assertEqual(self.handler.response_code, 200)
        self.assertEqual(inv1["current_stock"], round(initial_stock - 2.5, 1))

    def test_23_purchase_order_create(self):
        """Verify POST /api/purchase-orders/create generates new PO"""
        initial_count = len(DB["purchase_orders"])
        self.handler.handle_api_post("/api/purchase-orders/create", {
            "supplier": "Hyperpure by Zomato",
            "items": "20kg Paneer",
            "amount": 6800
        })
        self.assertEqual(self.handler.response_code, 200)
        self.assertEqual(len(DB["purchase_orders"]), initial_count + 1)
        self.assertEqual(DB["purchase_orders"][0]["supplier"], "Hyperpure by Zomato")

    def test_24_aggregators_toggle(self):
        """Verify POST /api/aggregators/toggle switches platform online status"""
        cur_status = DB["aggregators"]["swiggy"]["status"]
        self.handler.handle_api_post("/api/aggregators/toggle", {"platform": "swiggy"})
        self.assertEqual(self.handler.response_code, 200)
        expected = "OFFLINE" if cur_status == "ONLINE" else "ONLINE"
        self.assertEqual(DB["aggregators"]["swiggy"]["status"], expected)

    def test_25_aggregators_sync_menu(self):
        """Verify POST /api/aggregators/sync-menu returns instant sync status"""
        self.handler.handle_api_post("/api/aggregators/sync-menu", {})
        self.assertEqual(self.handler.response_code, 200)
        self.assertTrue(self.handler.response_body["success"])
        self.assertIn("Swiggy", self.handler.response_body["platforms"])

    def test_26_ai_query(self):
        """Verify POST /api/ai/query returns rich analytical insights"""
        self.handler.handle_api_post("/api/ai/query", {"query": "What are my highest margin dishes?"})
        self.assertEqual(self.handler.response_code, 200)
        self.assertTrue(self.handler.response_body["success"])
        self.assertIn("margin", self.handler.response_body["response"]["answer"].lower())

    def test_27_kiosk_order_creation_and_kds_fields(self):
        """Verify POST /api/orders/create with KIOSK channel generates token and all KDS fields"""
        payload = {
            "order_type": "KIOSK",
            "token": "TOKEN #K-999",
            "server_name": "Self Kiosk Terminal #1",
            "table_id": "KIOSK",
            "table_name": "Self Kiosk (Takeaway)",
            "customer_name": "Rahul Verma",
            "customer_phone": "9819001122",
            "notes": "Pack cutlery and extra napkins",
            "payment_status": "PAID_UPI",
            "items": [
                {"name": "Paneer Tikka Angara", "qty": 1, "price": 280, "notes": "Mild", "is_veg": True},
                {"name": "Butter Naan", "qty": 2, "price": 60, "notes": "Crispy", "is_veg": True}
            ],
            "subtotal": 400,
            "tax": 20,
            "packaging": 15,
            "total": 435
        }
        self.handler.handle_api_post("/api/orders/create", payload)
        self.assertEqual(self.handler.response_code, 200)
        created = self.handler.response_body["order"]
        self.assertEqual(created["order_type"], "KIOSK")
        self.assertEqual(created["token"], "TOKEN #K-999")
        self.assertEqual(created["customer_phone"], "9819001122")
        self.assertEqual(created["payment_status"], "PAID_UPI")
        self.assertEqual(created["notes"], "Pack cutlery and extra napkins")
        self.assertIn("created_timestamp", created)
        self.assertTrue(created["created_timestamp"] > 0)

    def test_28_tenant_registration_and_subscription_plan(self):
        """Verify POST /api/tenants/register creates isolated tenant with plan tier"""
        payload = {
            "name": "Amber Tandoor Bistro",
            "tenant_id": "ambertandoor",
            "phone": "+91 98765 43210",
            "upi_vpa": "amber@okhdfcbank",
            "address": "Connaught Place, New Delhi",
            "plan": "starter"
        }
        self.handler.handle_api_post("/api/tenants/register", payload)
        self.assertEqual(self.handler.response_code, 200)
        self.assertTrue(self.handler.response_body["success"])
        self.assertEqual(self.handler.response_body["tenant_id"], "ambertandoor")

        # Verify tenant DB was created with starter plan
        t_db = server.get_tenant_db("ambertandoor")
        self.assertEqual(t_db["restaurant"]["plan"], "starter")
        self.assertEqual(t_db["restaurant"]["name"], "Amber Tandoor Bistro")

        # Cleanup created test tenant file
        t_path = os.path.join(server.TENANTS_DIR, "ambertandoor.json")
        if os.path.exists(t_path):
            os.remove(t_path)
        if "ambertandoor" in server.TENANT_DBS:
            del server.TENANT_DBS["ambertandoor"]

    def test_29_update_tenant_plan(self):
        """Verify POST /api/tenants/update-plan updates plan dynamically"""
        # Register test tenant
        payload = {
            "name": "Test Bistro Plan",
            "tenant_id": "testbistroplan",
            "plan": "starter"
        }
        self.handler.handle_api_post("/api/tenants/register", payload)
        self.assertEqual(self.handler.response_code, 200)

        # Update plan to pro
        self.handler.handle_api_post("/api/tenants/update-plan", {
            "tenant_id": "testbistroplan",
            "plan": "pro"
        })
        self.assertEqual(self.handler.response_code, 200)
        self.assertTrue(self.handler.response_body["success"])
        self.assertEqual(self.handler.response_body["plan"], "pro")

        # Verify in memory
        t_db = server.get_tenant_db("testbistroplan")
        self.assertEqual(t_db["restaurant"]["plan"], "pro")

        # Cleanup
        t_path = os.path.join(server.TENANTS_DIR, "testbistroplan.json")
        if os.path.exists(t_path):
            os.remove(t_path)
        if "testbistroplan" in server.TENANT_DBS:
            del server.TENANT_DBS["testbistroplan"]

    def test_30_tenant_deactivation_and_lockout(self):
        """Verify SuperAdmin can deactivate a tenant, locking POS & API access with 403"""
        # Register a test tenant
        self.handler.handle_api_post("/api/tenants/register", {
            "name": "Lockout Test Cafe",
            "tenant_id": "lockoutcafe",
            "plan": "pro"
        })
        self.assertEqual(self.handler.response_code, 200)

        # Deactivate tenant via /api/tenants/toggle-status
        self.handler.handle_api_post("/api/tenants/toggle-status", {
            "tenant_id": "lockoutcafe",
            "is_active": False,
            "reason": "Payment overdue"
        })
        self.assertEqual(self.handler.response_code, 200)
        self.assertTrue(self.handler.response_body["success"])
        self.assertFalse(self.handler.response_body["is_active"])
        self.assertEqual(self.handler.response_body["status"], "deactivated")

        # Now simulate a request under this tenant's thread context
        server._thread_context.tenant_id = "lockoutcafe"
        server._thread_context.db = server.get_tenant_db("lockoutcafe")
        server._thread_context.lock = server.get_tenant_lock("lockoutcafe")

        # Verify /api/sync returns 403 Forbidden with ACCOUNT_DEACTIVATED
        self.handler.handle_api_get("/api/sync", {"since": ["0"]})
        self.assertEqual(self.handler.response_code, 403)
        self.assertEqual(self.handler.response_body["error"], "ACCOUNT_DEACTIVATED")

        # Verify /api/orders/create is blocked with 403 Forbidden
        self.handler.handle_api_post("/api/orders/create", {
            "table_id": "T1",
            "items": [{"name": "Tea", "price": 50, "qty": 1}],
            "subtotal": 50, "tax": 2.5, "total": 52.5
        })
        self.assertEqual(self.handler.response_code, 403)
        self.assertEqual(self.handler.response_body["error"], "ACCOUNT_DEACTIVATED")

        # Reactivate tenant
        self.handler.handle_api_post("/api/tenants/toggle-status", {
            "tenant_id": "lockoutcafe",
            "is_active": True
        })
        self.assertEqual(self.handler.response_code, 200)
        self.assertTrue(self.handler.response_body["is_active"])

        # Verify /api/sync now succeeds with 200 OK
        self.handler.handle_api_get("/api/sync", {"since": ["0"]})
        self.assertEqual(self.handler.response_code, 200)

        # Reset thread context to default
        server._thread_context.tenant_id = "default"
        server._thread_context.db = server._DEFAULT_DB
        server._thread_context.lock = server._DEFAULT_LOCK

        # Cleanup
        t_path = os.path.join(server.TENANTS_DIR, "lockoutcafe.json")
        if os.path.exists(t_path):
            os.remove(t_path)
        if "lockoutcafe" in server.TENANT_DBS:
            del server.TENANT_DBS["lockoutcafe"]

    def test_31_default_tenant_suspend_and_reactivate(self):
        """Verify suspending and reactivating the default (Spice Symphony Bistro) tenant writes to DATA_FILE without error"""
        orig_active = server._DEFAULT_DB.get("is_active", True)
        orig_rest_active = server._DEFAULT_DB.get("restaurant", {}).get("is_active", True)
        try:
            # Suspend default tenant
            self.handler.handle_api_post("/api/tenants/toggle-status", {
                "tenant_id": "default",
                "is_active": False,
                "reason": "Suspended for billing review"
            })
            self.assertEqual(self.handler.response_code, 200)
            self.assertEqual(self.handler.response_body["tenant_id"], "default")
            self.assertFalse(self.handler.response_body["is_active"])
            self.assertEqual(self.handler.response_body["status"], "deactivated")

            # Verify /api/sync returns 403 Forbidden with ACCOUNT_DEACTIVATED for default
            self.handler.handle_api_get("/api/sync", {"since": ["0"]})
            self.assertEqual(self.handler.response_code, 403)
            self.assertEqual(self.handler.response_body["error"], "ACCOUNT_DEACTIVATED")

            # Verify /api/status returns is_active=False without 403 error
            self.handler.handle_api_get("/api/status")
            self.assertEqual(self.handler.response_code, 200)
            self.assertFalse(self.handler.response_body["is_active"])
            self.assertEqual(self.handler.response_body["restaurant_name"], "Spice Symphony Bistro & Cafe")

            # Reactivate default tenant
            self.handler.handle_api_post("/api/tenants/toggle-status", {
                "tenant_id": "default",
                "is_active": True
            })
            self.assertEqual(self.handler.response_code, 200)
            self.assertTrue(self.handler.response_body["is_active"])
            self.assertEqual(self.handler.response_body["status"], "activated")

            # Verify /api/status now reports is_active=True
            self.handler.handle_api_get("/api/status")
            self.assertEqual(self.handler.response_code, 200)
            self.assertTrue(self.handler.response_body["is_active"])

            # Verify /api/sync now succeeds
            self.handler.handle_api_get("/api/sync", {"since": ["0"]})
            self.assertEqual(self.handler.response_code, 200)
        finally:
            # Restore tenant state
            self.handler.handle_api_post("/api/tenants/toggle-status", {
                "tenant_id": "default",
                "is_active": orig_active
            })

    def test_32_franchise_group_and_branch_association(self):
        """Verify franchise_group and brand_name isolation, registration, and update-group API"""
        # 1. Verify default status returns franchise metadata
        self.handler.handle_api_get("/api/status")
        self.assertEqual(self.handler.response_code, 200)
        self.assertEqual(self.handler.response_body.get("franchise_group"), "spicesymphony")
        self.assertEqual(self.handler.response_body.get("brand_name"), "Spice Symphony")

        # 2. Register a new sister branch under spicesymphony group
        test_tid = "spicepowai"
        t_path = os.path.join(server.TENANTS_DIR, f"{test_tid}.json")
        try:
            self.handler.handle_api_post("/api/tenants/register", {
                "tenant_id": test_tid,
                "name": "Spice Symphony - Powai",
                "phone": "+91 98200 99999",
                "franchise_group": "spicesymphony",
                "brand_name": "Spice Symphony"
            })
            self.assertEqual(self.handler.response_code, 200)
            self.assertEqual(self.handler.response_body.get("franchise_group"), "spicesymphony")
            self.assertEqual(self.handler.response_body.get("brand_name"), "Spice Symphony")

            # 3. Check /api/tenants/list returns the group metadata
            self.handler.handle_api_get("/api/tenants/list")
            self.assertEqual(self.handler.response_code, 200)
            tenants = self.handler.response_body.get("tenants", [])
            powai_tenant = next((t for t in tenants if t["tenant_id"] == test_tid), None)
            self.assertIsNotNone(powai_tenant)
            self.assertEqual(powai_tenant.get("franchise_group"), "spicesymphony")
            self.assertEqual(powai_tenant.get("plan"), "franchise")

            # 4. Update franchise group via /api/tenants/update-group
            self.handler.handle_api_post("/api/tenants/update-group", {
                "tenant_id": test_tid,
                "franchise_group": "otherbrand",
                "brand_name": "Other Brand"
            })
            self.assertEqual(self.handler.response_code, 200)
            self.assertEqual(self.handler.response_body.get("franchise_group"), "otherbrand")

            # Verify persisted
            t_db = get_tenant_db(test_tid)
            self.assertEqual(t_db.get("restaurant", {}).get("franchise_group"), "otherbrand")
        finally:
            if os.path.exists(t_path):
                os.remove(t_path)
            if test_tid in server.TENANT_DBS:
                del server.TENANT_DBS[test_tid]

    def test_33_tenant_profile_update(self):
        """Verify updating restaurant name, phone, UPI, address, GSTIN, and FSSAI via /api/tenants/update"""
        orig_name = server._DEFAULT_DB.get("restaurant", {}).get("name", "Spice Symphony Bistro & Cafe")
        orig_phone = server._DEFAULT_DB.get("restaurant", {}).get("phone", "+91 93138 38165")
        try:
            # 1. Update default restaurant profile
            self.handler.handle_api_post("/api/tenants/update", {
                "tenant_id": "default",
                "name": "Spice Symphony Grand Lounge",
                "tagline": "Fine Dining & Craft Cocktails",
                "phone": "+91 99999 88888",
                "upi_vpa": "spicelounge@okhdfcbank",
                "address": "Level 2, Phoenix Palladium, Mumbai",
                "gstin": "27AABCS9999F1Z1",
                "fssai": "11521012999999",
                "plan": "franchise",
                "franchise_group": "spicesymphony",
                "brand_name": "Spice Symphony"
            })
            self.assertEqual(self.handler.response_code, 200)
            self.assertEqual(self.handler.response_body["restaurant"]["name"], "Spice Symphony Grand Lounge")
            self.assertEqual(self.handler.response_body["restaurant"]["gstin"], "27AABCS9999F1Z1")

            # 2. Check /api/tenants/list returns the updated fields
            self.handler.handle_api_get("/api/tenants/list")
            self.assertEqual(self.handler.response_code, 200)
            tenants = self.handler.response_body.get("tenants", [])
            def_t = next((t for t in tenants if t["tenant_id"] == "default"), None)
            self.assertIsNotNone(def_t)
            self.assertEqual(def_t["name"], "Spice Symphony Grand Lounge")
            self.assertEqual(def_t["phone"], "+91 99999 88888")
            self.assertEqual(def_t["gstin"], "27AABCS9999F1Z1")
            self.assertEqual(def_t["tagline"], "Fine Dining & Craft Cocktails")

            # 3. Test validation error when name is empty
            self.handler.handle_api_post("/api/tenants/update", {
                "tenant_id": "default",
                "name": "   "
            })
            self.assertEqual(self.handler.response_code, 400)
            self.assertFalse(self.handler.response_body["success"])
        finally:
            # Restore original
            self.handler.handle_api_post("/api/tenants/update", {
                "tenant_id": "default",
                "name": orig_name,
                "phone": orig_phone,
                "upi_vpa": "spicesymphony@okhdfcbank",
                "address": "Shop 14, High Street Avenue, Mumbai",
                "plan": "franchise",
                "franchise_group": "spicesymphony",
                "brand_name": "Spice Symphony"
            })

if __name__ == "__main__":
    unittest.main()

