import aiosmtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import List, Optional


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
    order_comment: Optional[str],
    discount: float,
    items: list,
    order_id: int,
):
    if not recipients:
        return False, "Нет получателей"

    subject = f"Новый заказ от агента {agent_name}"

    # Build items table rows
    rows_html = ""
    rows_text = ""
    for i, item in enumerate(items, 1):
        base_price = item["price"] / (1 + discount / 100) if discount != 0 else item["price"]
        discount_str = f"{discount:+.0f}%" if discount != 0 else "0%"
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
    discount_str = f"{discount:+.0f}%" if discount != 0 else "0%"

    html_body = f"""
<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;color:#212529">

  <div style="background:#1a56db;color:white;padding:20px 24px;border-radius:8px 8px 0 0">
    <h2 style="margin:0">🔑 Гардарика — Новый заказ #{order_id}</h2>
    <p style="margin:6px 0 0;opacity:.85">Агент: <b>{agent_name}</b></p>
  </div>

  <div style="background:#f8f9fa;padding:20px 24px;border:1px solid #dee2e6">

    <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
      <tr>
        <td style="padding:6px 0;color:#6c757d;width:140px">Клиент:</td>
        <td style="padding:6px 0"><b>{client_name}</b></td>
      </tr>
      {"<tr><td style='padding:6px 0;color:#6c757d'>ИНН:</td><td style='padding:6px 0'>" + client_inn + "</td></tr>" if client_inn else ""}
      {"<tr><td style='padding:6px 0;color:#6c757d'>Адрес:</td><td style='padding:6px 0'>" + client_address + "</td></tr>" if client_address else ""}
      {"<tr><td style='padding:6px 0;color:#6c757d'>Комментарий:</td><td style='padding:6px 0;font-style:italic'>" + order_comment + "</td></tr>" if order_comment else ""}
      <tr>
        <td style="padding:6px 0;color:#6c757d">Скидка/наценка:</td>
        <td style="padding:6px 0">{discount_str}</td>
      </tr>
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

  </div>

  <div style="padding:12px 24px;background:#f8f9fa;border:1px solid #dee2e6;border-top:none;border-radius:0 0 8px 8px;font-size:12px;color:#6c757d">
    Письмо отправлено автоматически системой заказов Гардарика
  </div>

</body>
</html>"""

    text_body = f"""Новый заказ #{order_id} от агента {agent_name}

Клиент: {client_name}
{"ИНН: " + client_inn if client_inn else ""}
{"Адрес: " + client_address if client_address else ""}
{"Комментарий: " + order_comment if order_comment else ""}
Скидка/наценка: {discount_str}

Позиции заказа:
{rows_text}
Итого: {total:,.2f} ₽
"""

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = smtp_user
    msg["To"] = ", ".join(recipients)
    msg.attach(MIMEText(text_body, "plain", "utf-8"))
    msg.attach(MIMEText(html_body, "html", "utf-8"))

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
