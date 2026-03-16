import aiosmtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
from typing import List, Optional

CLIENT_STATUS_LABELS = {
    "new":       "🆕 Новый",
    "potential": "💡 Потенциальный",
    "revived":   "🔄 Оживший",
    "active":    "✅ Действующий",
}


async def send_order_email(
    smtp_host: str,
    smtp_port: int,
    smtp_user: str,
    smtp_password: str,
    recipients: List[str],
    agent_name: str,
    client_name: str,
    client_inn: Optional[str],
    client_address: Optional[str],
    client_phone: Optional[str],
    client_contact: Optional[str],
    client_status: Optional[str],
    order_comment: Optional[str],
    discount: float,
    items: list,
    order_id: int,
    grd_filepath: Optional[str] = None,
):
    if not recipients:
        return False, "Нет получателей"

    subject = f"Новый заказ от агента {agent_name} (#{order_id})"

    status_label = CLIENT_STATUS_LABELS.get(client_status or "new", client_status or "")
    discount_str = f"{discount:+.0f}%" if discount != 0 else "0%"

    # Build items table
    rows_html = ""
    rows_text = ""
    for i, item in enumerate(items, 1):
        base_price = round(item["price"] / (1 + discount / 100), 2) if discount != 0 else item["price"]
        rows_html += f"""
        <tr>
          <td style="padding:8px;border:1px solid #dee2e6;text-align:center">{i}</td>
          <td style="padding:8px;border:1px solid #dee2e6">{item['product_name'] or item['product_code']}</td>
          <td style="padding:8px;border:1px solid #dee2e6;text-align:center">{item['qty']}</td>
          <td style="padding:8px;border:1px solid #dee2e6;text-align:right">{base_price:,.2f} ₽</td>
          <td style="padding:8px;border:1px solid #dee2e6;text-align:center">{discount_str}</td>
          <td style="padding:8px;border:1px solid #dee2e6;text-align:right"><b>{item['total']:,.2f} ₽</b></td>
        </tr>"""
        rows_text += f"  {i}. {item['product_name'] or item['product_code']} — {item['qty']} шт. × {item['price']:,.2f} ₽\n"

    total = sum(i["total"] for i in items)

    def row(label, value):
        if not value:
            return ""
        return f"<tr><td style='padding:5px 0;color:#6c757d;width:160px'>{label}:</td><td style='padding:5px 0'>{value}</td></tr>"

    client_rows = "".join([
        row("Клиент", f"<b>{client_name}</b>"),
        row("Статус", f"<span style='background:#e9ecef;padding:2px 8px;border-radius:4px;font-size:13px'>{status_label}</span>"),
        row("ИНН", client_inn),
        row("Телефон", client_phone),
        row("Контактное лицо", client_contact),
        row("Адрес", client_address),
        row("Комментарий к заказу", f"<i>{order_comment}</i>" if order_comment else None),
        row("Скидка/наценка", discount_str),
    ])

    html_body = f"""<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;max-width:720px;margin:0 auto;color:#212529">
  <div style="background:#1a56db;color:white;padding:20px 24px;border-radius:8px 8px 0 0">
    <h2 style="margin:0">🔑 Гардарика — Заказ #{order_id}</h2>
    <p style="margin:6px 0 0;opacity:.85">Агент: <b>{agent_name}</b></p>
  </div>
  <div style="background:#f8f9fa;padding:20px 24px;border:1px solid #dee2e6">
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
      {client_rows}
    </table>
    <h3 style="margin:0 0 12px;font-size:15px">Позиции заказа:</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead>
        <tr style="background:#e9ecef">
          <th style="padding:8px;border:1px solid #dee2e6;text-align:center">№</th>
          <th style="padding:8px;border:1px solid #dee2e6;text-align:left">Наименование</th>
          <th style="padding:8px;border:1px solid #dee2e6;text-align:center">Кол-во</th>
          <th style="padding:8px;border:1px solid #dee2e6;text-align:right">Цена (баз.)</th>
          <th style="padding:8px;border:1px solid #dee2e6;text-align:center">Скидка</th>
          <th style="padding:8px;border:1px solid #dee2e6;text-align:right">Сумма</th>
        </tr>
      </thead>
      <tbody>{rows_html}</tbody>
      <tfoot>
        <tr style="background:#e9ecef">
          <td colspan="5" style="padding:8px;border:1px solid #dee2e6;text-align:right"><b>Итого:</b></td>
          <td style="padding:8px;border:1px solid #dee2e6;text-align:right"><b>{total:,.2f} ₽</b></td>
        </tr>
      </tfoot>
    </table>
    {"<p style='margin-top:12px;font-size:12px;color:#6c757d'><i class=\"bi bi-paperclip\"></i> Файл заказа для 1С прикреплён к письму.</p>" if grd_filepath else ""}
  </div>
  <div style="padding:12px 24px;background:#f8f9fa;border:1px solid #dee2e6;border-top:none;border-radius:0 0 8px 8px;font-size:12px;color:#6c757d">
    Письмо отправлено автоматически системой заказов Гардарика
  </div>
</body>
</html>"""

    text_body = f"""Заказ #{order_id} от агента {agent_name}

Клиент: {client_name} ({status_label})
{"ИНН: " + client_inn if client_inn else ""}
{"Телефон: " + client_phone if client_phone else ""}
{"Контакт: " + client_contact if client_contact else ""}
{"Адрес: " + client_address if client_address else ""}
{"Комментарий: " + order_comment if order_comment else ""}
Скидка/наценка: {discount_str}

Позиции:
{rows_text}
Итого: {total:,.2f} ₽
"""

    msg = MIMEMultipart("mixed")
    msg["Subject"] = subject
    msg["From"] = smtp_user
    msg["To"] = ", ".join(recipients)

    # Text + HTML альтернативы
    alt = MIMEMultipart("alternative")
    alt.attach(MIMEText(text_body, "plain", "utf-8"))
    alt.attach(MIMEText(html_body, "html", "utf-8"))
    msg.attach(alt)

    # Attach .grd file
    if grd_filepath:
        try:
            import os
            with open(grd_filepath, "rb") as f:
                grd_data = f.read()
            attachment = MIMEBase("application", "octet-stream")
            attachment.set_payload(grd_data)
            encoders.encode_base64(attachment)
            filename = os.path.basename(grd_filepath)
            attachment.add_header("Content-Disposition", "attachment", filename=filename)
            msg.attach(attachment)
        except Exception as e:
            print(f"[EMAIL] Failed to attach .grd: {e}")

    try:
        await aiosmtplib.send(
            msg,
            hostname=smtp_host,
            port=smtp_port,
            username=smtp_user,
            password=smtp_password,
            use_tls=True,
        )
        return True, "OK"
    except Exception as e:
        return False, str(e)
