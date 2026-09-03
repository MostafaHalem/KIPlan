# -*- coding: utf-8 -*-
import json
from collections import defaultdict

from odoo import http
from odoo.http import request


COMPANY_EN = {
    "صناعات قنديل": "KI",
    "ميكانو للصناعات الهندسية": "Mekano",
    "فرتيكا للصناعه و التجاره": "Vertica",
    "ماكينات للصناعة و التجاره": "Makinat",
}

MO_STATE = {
    "draft": "Draft",
    "confirmed": "Confirmed",
    "progress": "In Progress",
    "to_close": "To Close",
    "done": "Done",
    "cancel": "Cancelled",
}

WO_STATE = {
    "pending": "Waiting for another WO",
    "waiting": "Waiting for components",
    "ready": "Ready",
    "progress": "In Progress",
    "done": "Finished",
    "cancel": "Cancelled",
}


def _en_company(company):
    if not company:
        return None
    return COMPANY_EN.get(company.name, company.name)


def _so_name(order):
    return order.name or ""


class KandilPlanningController(http.Controller):
    @http.route(["/kandil/planning", "/kandil/planning/app"], type="http", auth="user", website=False)
    def dashboard(self, **kwargs):
        from odoo.modules.module import get_module_path
        path = get_module_path("kandil_planning_dashboard")
        html_path = path + "/static/src/index.html"
        with open(html_path, "r", encoding="utf-8") as fh:
            return request.make_response(fh.read(), headers=[("Content-Type", "text/html; charset=utf-8")])

    @http.route("/kandil/planning/data", type="http", auth="user", methods=["GET"], csrf=False)
    def planning_data(self, **kwargs):
        payload = self._build_payload()
        return request.make_response(
            json.dumps(payload, default=str),
            headers=[
                ("Content-Type", "application/json; charset=utf-8"),
                ("Cache-Control", "no-store"),
            ],
        )

    def _build_payload(self):
        env = request.env
        orders = env["sale.order"].sudo().search([
            ("state", "not in", ["cancel"]),
        ], order="date_order desc", limit=3000)
        productions = env["mrp.production"].sudo().search([
            ("state", "not in", ["cancel"]),
        ], limit=8000)
        workorders = env["mrp.workorder"].sudo().search([
            ("state", "not in", ["done", "cancel"]),
        ], limit=8000)
        workcenters = env["mrp.workcenter"].sudo().search([])

        so_by_name = {o.name: o for o in orders}

        mos_by_so = defaultdict(list)
        for mo in productions:
            so_name = self._mo_so_name(mo)
            if so_name:
                mos_by_so[so_name].append(mo)

        so_rows = []
        eligible = []
        category = {}
        for order in orders:
            lines = order.order_line.filtered(lambda l: not l.display_type)
            ordered = sum(lines.mapped("product_uom_qty"))
            delivered = sum(lines.mapped("qty_delivered"))
            open_qty = max(ordered - delivered, 0.0)
            if ordered and delivered >= ordered:
                delivery = "Fully Delivered"
            elif delivered > 0:
                delivery = "Partially Delivered"
            else:
                delivery = "Not Delivered"

            related = mos_by_so.get(order.name, [])
            mo_states = [m.state for m in related]
            mo_total = len(related)
            mo_done = sum(1 for s in mo_states if s == "done")
            mo_active = sum(1 for s in mo_states if s in ("confirmed", "progress", "to_close", "draft"))
            mo_late = sum(1 for m in related if m.date_deadline and m.state not in ("done", "cancel") and m.date_deadline < fields_today())
            mo_draft = sum(1 for s in mo_states if s == "draft")
            mo_conf = sum(1 for s in mo_states if s == "confirmed")
            mo_ip = sum(1 for s in mo_states if s == "progress")
            mo_tc = sum(1 for s in mo_states if s == "to_close")
            mo_progress = (mo_done / mo_total) if mo_total else 0.0

            # Planning set: has at least one MO and is not fully delivered
            is_eligible = bool(related) and delivery != "Fully Delivered"
            if is_eligible:
                eligible.append(order.name)

            so_rows.append({
                "so": order.name,
                "cust": order.partner_id.display_name,
                "co": _en_company(order.company_id),
                "od": str(order.date_order or ""),
                "rd": str(order.commitment_date or ""),
                "ds": delivery,
                "val": order.amount_total or 0,
                "oq": ordered,
                "dq": delivered,
                "open": open_qty,
                "dp": (delivered / ordered) if ordered else 0,
                "moT": mo_total,
                "moD": mo_done,
                "moA": mo_active,
                "moL": mo_late,
                "moP": mo_progress,
                "msL": 0,
                "msQ": 0,
                "moDr": mo_draft,
                "moC": mo_conf,
                "moIP": mo_ip,
                "moTC": mo_tc,
                "el": 1 if is_eligible else 0,
            })
            categ = "Other"
            if order.order_line:
                tmpl = order.order_line[0].product_id.categ_id
                if tmpl:
                    categ = tmpl.name
            category[order.name] = categ

        mos = []
        for mo in productions.filtered(lambda m: m.state != "done"):
            mos.append({
                "ref": mo.name,
                "co": _en_company(mo.company_id),
                "st": MO_STATE.get(mo.state, mo.state),
                "pri": False,
                "prod": mo.product_id.display_name,
                "qty": mo.product_qty or 0,
                "uom": mo.product_uom_id.display_name if mo.product_uom_id else "",
                "expH": (mo.duration_expected or 0) / 60.0 if hasattr(mo, "duration_expected") else 0,
                "realH": 0,
                "created": str(mo.create_date or ""),
                "sched": str(mo.date_planned_start or ""),
                "start": str(mo.date_start or ""),
                "schedEnd": str(mo.date_planned_finished or ""),
                "end": str(mo.date_finished or ""),
                "so": self._mo_so_name(mo),
                "soKey": self._mo_so_name(mo),
                "consol": mo.name,
                "el": 1,
            })

        wos = []
        load = defaultdict(lambda: {"count": 0, "remainingHrs": 0, "expectedHrs": 0})
        for wo in workorders:
            factory = _en_company(wo.company_id)
            group = wo.workcenter_id.name if wo.workcenter_id else "Unmapped"
            rem = max(((wo.duration_expected or 0) - (wo.duration or 0)) / 60.0, 0)
            exp = (wo.duration_expected or 0) / 60.0
            st = WO_STATE.get(wo.state, wo.state)
            so_name = self._mo_so_name(wo.production_id) if wo.production_id else None
            wos.append({
                "mo": wo.production_id.name if wo.production_id else "",
                "co": factory,
                "wo": wo.name,
                "wc": wo.workcenter_id.display_name if wo.workcenter_id else "",
                "st": st,
                "op": wo.name,
                "prod": wo.product_id.display_name if wo.product_id else "",
                "qty": wo.qty_production or 0,
                "qtyTo": wo.qty_remaining or 0,
                "uom": "",
                "ss": str(wo.date_planned_start or ""),
                "start": str(wo.date_start or ""),
                "end": str(wo.date_finished or ""),
                "se": str(wo.date_planned_finished or ""),
                "expH": exp,
                "realH": (wo.duration or 0) / 60.0,
                "grp": group,
                "fy": factory,
                "so": so_name,
                "moSt": MO_STATE.get(wo.production_id.state, "") if wo.production_id else "",
                "remH": rem,
                "consol": wo.production_id.name if wo.production_id else "",
                "out": "Outsourcing" if wo.workcenter_id and "outsource" in (wo.workcenter_id.name or "").lower() else None,
            })
            key = (factory, group, st)
            load[key]["count"] += 1
            load[key]["remainingHrs"] += rem
            load[key]["expectedHrs"] += exp

        machine_status = []
        for wc in workcenters:
            current = workorders.filtered(lambda w: w.workcenter_id == wc and w.state == "progress")[:1]
            if not current:
                current = workorders.filtered(lambda w: w.workcenter_id == wc and w.state == "ready")[:1]
            if not current:
                current = workorders.filtered(lambda w: w.workcenter_id == wc)[:1]
            wo = current[:1]
            st = "No matching active WO"
            so = mo = op = prod = qty = None
            hrs = 0
            if wo:
                wo = wo[0]
                st = WO_STATE.get(wo.state, wo.state)
                so = self._mo_so_name(wo.production_id)
                mo = wo.production_id.name if wo.production_id else None
                op = wo.name
                prod = wo.product_id.display_name if wo.product_id else None
                qty = "%s / %s" % (wo.qty_produced or 0, wo.qty_production or 0)
                hrs = max(((wo.duration_expected or 0) - (wo.duration or 0)) / 60.0, 0)
            machine_status.append({
                "fy": _en_company(wc.company_id),
                "grp": wc.name,
                "mc": wc.display_name,
                "st": st,
                "so": so,
                "mo": mo,
                "op": op,
                "prod": prod,
                "qty": qty,
                "hrs": hrs,
            })

        from datetime import datetime
        return {
            "meta": {
                "source": "Odoo live",
                "title": "Production & Sales Order Planning",
                "organization": "Kandil Group",
                "factories": ["KI", "Mekano", "Vertica", "Makinat"],
                "generatedAt": datetime.utcnow().isoformat(timespec="seconds") + "Z",
                "planningWeekCurrent": "",
                "planningWeekPrevious": "",
                "notes": "Live from sale.order, mrp.production, mrp.workorder.",
            },
            "eligibleSOs": eligible,
            "soCategory": category,
            "so": so_rows,
            "mos": mos,
            "wos": wos,
            "woLoad": [
                {
                    "Factory": k[0],
                    "Machine Group": k[1],
                    "Status": k[2],
                    "count": v["count"],
                    "remainingHrs": v["remainingHrs"],
                    "expectedHrs": v["expectedHrs"],
                }
                for k, v in load.items()
            ],
            "moKpi": [],
            "machineStatus": machine_status,
            "machines": [
                {"fy": _en_company(wc.company_id), "grp": wc.name, "desc": wc.display_name}
                for wc in workcenters
            ],
            "factoryViews": {},
            "suez": [],
            "glass": [],
        }

    def _mo_so_name(self, mo):
        if not mo:
            return None
        origin = (mo.origin or "").strip()
        if origin.startswith("S") or origin.startswith("SO"):
            return origin.split()[0].split(",")[0]
        if getattr(mo, "procurement_group_id", False) and mo.procurement_group_id.sale_id:
            return mo.procurement_group_id.sale_id.name
        return origin or None


def fields_today():
    from datetime import datetime
    return datetime.utcnow()
