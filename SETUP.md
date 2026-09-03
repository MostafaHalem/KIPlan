# Kandil Planning Dashboard — live Odoo

Install this folder as an Odoo **16** module.

1. Copy `kandil_planning_dashboard` into the Odoo addons path.
2. Restart Odoo.
3. Apps → Update Apps List → install **Kandil Planning Dashboard**.
4. Open **Planning Dashboard** in the menu, or go to:

   `https://YOUR-ODOO-URL/kandil/planning/app`

The page uses the logged-in Odoo user. Data is read from:

| Dashboard | Odoo model |
|---|---|
| Sales orders | `sale.order` + `sale.order.line` |
| Manufacturing orders | `mrp.production` |
| Work orders | `mrp.workorder` |
| Machines | `mrp.workcenter` |
| SO ↔ MO link | `mrp.production.origin` or procurement group → sale order |

The browser refreshes from `/kandil/planning/data` every 5 minutes.

This cannot run on the public Catbox link. The dashboard and Odoo must be on the same server so the session cookie is sent.
