import resend
import logging
from datetime import date
from models.order import Order
from models.sync_log import SyncResult
from config import get_settings

logger = logging.getLogger(__name__)

URGENCY_COLORS = {
    "overdue": "#dc2626",    # red
    "due_today": "#d97706",  # amber
    "on_time": "#16a34a",    # green
}


def _format_date(dt) -> str:
    if not dt:
        return "—"
    if hasattr(dt, "strftime"):
        return dt.strftime("%d/%m/%Y %H:%M")
    return str(dt)


def _delivery_mode_from_raw(order: Order) -> str:
    """Extract delivery mode stored in raw_data (populated by ML mapper)."""
    if order.raw_data and isinstance(order.raw_data, dict):
        return order.raw_data.get("delivery_mode", "")
    return ""


def _order_rows_html(orders: list[Order]) -> str:
    if not orders:
        return "<tr><td colspan='5' style='text-align:center;color:#6b7280;padding:12px'>Sin pedidos</td></tr>"
    rows = []
    for o in orders:
        color = URGENCY_COLORS.get(o.urgency, "#6b7280")
        mode = _delivery_mode_from_raw(o)
        mode_cell = f"<td style='padding:8px 12px'>{mode}</td>" if mode else ""
        rows.append(
            f"""<tr style='border-bottom:1px solid #e5e7eb'>
              <td style='padding:8px 12px;font-family:monospace'>{o.external_id}</td>
              <td style='padding:8px 12px'>{o.source.capitalize()}</td>
              <td style='padding:8px 12px'>
                <span style='background:{color}20;color:{color};padding:2px 8px;border-radius:9999px;font-size:12px'>
                  {o.status}
                </span>
              </td>
              <td style='padding:8px 12px;color:{color};font-weight:600'>{_format_date(o.limit_delivery_date)}</td>
              {mode_cell}
            </tr>"""
        )
    return "\n".join(rows)


def build_daily_report_html(
    overdue_orders: list[Order],
    due_today_orders: list[Order],
    report_date: date,
) -> str:
    has_mode = any(
        _delivery_mode_from_raw(o) for o in overdue_orders + due_today_orders
    )
    mode_header = "<th style='padding:8px 12px;text-align:left'>Modalidad</th>" if has_mode else ""

    return f"""
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><title>Reporte de Pedidos Verken</title></head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f9fafb">
  <div style="max-width:700px;margin:32px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">

    <!-- Header -->
    <div style="background:#1e40af;color:#fff;padding:24px 32px">
      <h1 style="margin:0;font-size:20px">Verken — Reporte de Pedidos</h1>
      <p style="margin:4px 0 0;opacity:.8;font-size:14px">{report_date.strftime("%A %d de %B, %Y")}</p>
    </div>

    <!-- Summary Chips -->
    <div style="display:flex;gap:16px;padding:20px 32px;background:#f1f5f9">
      <div style="flex:1;background:#fff;border-radius:8px;padding:16px;border-left:4px solid #dc2626">
        <div style="font-size:28px;font-weight:700;color:#dc2626">{len(overdue_orders)}</div>
        <div style="color:#6b7280;font-size:13px">Atrasados</div>
      </div>
      <div style="flex:1;background:#fff;border-radius:8px;padding:16px;border-left:4px solid #d97706">
        <div style="font-size:28px;font-weight:700;color:#d97706">{len(due_today_orders)}</div>
        <div style="color:#6b7280;font-size:13px">Entregar hoy</div>
      </div>
    </div>

    <div style="padding:24px 32px">

      <!-- Overdue Section -->
      <h2 style="color:#dc2626;font-size:16px;margin:0 0 12px">
        🔴 Pedidos Atrasados ({len(overdue_orders)})
      </h2>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:32px">
        <thead style="background:#fef2f2">
          <tr>
            <th style="padding:8px 12px;text-align:left">Order ID</th>
            <th style="padding:8px 12px;text-align:left">Fuente</th>
            <th style="padding:8px 12px;text-align:left">Estado</th>
            <th style="padding:8px 12px;text-align:left">Fecha límite</th>
            {mode_header}
          </tr>
        </thead>
        <tbody>{_order_rows_html(overdue_orders)}</tbody>
      </table>

      <!-- Due Today Section -->
      <h2 style="color:#d97706;font-size:16px;margin:0 0 12px">
        🟡 Entregar Hoy ({len(due_today_orders)})
      </h2>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:32px">
        <thead style="background:#fffbeb">
          <tr>
            <th style="padding:8px 12px;text-align:left">Order ID</th>
            <th style="padding:8px 12px;text-align:left">Fuente</th>
            <th style="padding:8px 12px;text-align:left">Estado</th>
            <th style="padding:8px 12px;text-align:left">Fecha límite</th>
            {mode_header}
          </tr>
        </thead>
        <tbody>{_order_rows_html(due_today_orders)}</tbody>
      </table>

    </div>

    <!-- Footer -->
    <div style="background:#f1f5f9;padding:16px 32px;text-align:center;font-size:12px;color:#6b7280">
      Verken Orders Dashboard — Reporte automático generado el {report_date.strftime("%d/%m/%Y")}
    </div>
  </div>
</body>
</html>"""


def send_daily_report(
    overdue_orders: list[Order],
    due_today_orders: list[Order],
    report_date: date,
) -> dict:
    settings = get_settings()
    resend.api_key = settings.resend_api_key

    total = len(overdue_orders) + len(due_today_orders)
    subject = (
        f"[Verken] {report_date.strftime('%d/%m/%Y')} — "
        f"{len(overdue_orders)} atrasados, {len(due_today_orders)} para hoy"
    )
    html = build_daily_report_html(overdue_orders, due_today_orders, report_date)

    try:
        response = resend.Emails.send(
            {
                "from": settings.email_from,
                "to": settings.email_recipients_list,
                "subject": subject,
                "html": html,
            }
        )
        logger.info(f"Email sent: id={response.get('id')}")
        return {"success": True, "id": response.get("id"), "subject": subject}
    except Exception as e:
        logger.error(f"Failed to send email: {e}")
        return {"success": False, "error": str(e), "subject": subject}
