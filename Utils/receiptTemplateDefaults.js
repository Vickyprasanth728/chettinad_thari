/** Default receipt HTML template key stored in print_receipt_template.name */
export const RECEIPT_TEMPLATE_NAME = "receipt_html";

/** Placeholders supported when rendering receipt HTML on the client or server */
export const RECEIPT_TEMPLATE_PLACEHOLDERS = [
  { key: "{{shop_name}}", description: "Store / business name" },
  { key: "{{bill_no}}", description: "Bill number" },
  { key: "{{created_date}}", description: "Bill date (formatted)" },
  { key: "{{created_time}}", description: "Bill time (formatted)" },
  { key: "{{customer_name}}", description: "Customer name or Walk-in" },
  { key: "{{customer_mobile}}", description: "Customer mobile number" },
  { key: "{{customer_gst}}", description: "Customer GSTIN" },
  { key: "{{staff_name}}", description: "Billing staff name" },
  { key: "{{manual_order_number}}", description: "Manual order number" },
  { key: "{{subtotal}}", description: "Subtotal amount" },
  { key: "{{discount}}", description: "Discount amount" },
  { key: "{{gst_total}}", description: "Total GST amount" },
  { key: "{{cgst}}", description: "CGST amount" },
  { key: "{{sgst}}", description: "SGST amount" },
  { key: "{{total_amount}}", description: "Grand total" },
  { key: "{{credit_applied}}", description: "Credit applied amount" },
  { key: "{{items_rows}}", description: "Replace with rendered line-item rows (HTML)" },
  { key: "{{payments_rows}}", description: "Replace with rendered payment rows (HTML)" },
  { key: "{{gst_summary_rows}}", description: "Replace with GST rate-wise summary rows (HTML)" },
];

export const DEFAULT_RECEIPT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Receipt {{bill_no}}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: "Courier New", Courier, monospace;
      font-size: 12px;
      line-height: 1.4;
      color: #000;
      width: 80mm;
      max-width: 80mm;
      margin: 0 auto;
      padding: 8px 6px;
    }
    .center { text-align: center; }
    .bold { font-weight: 700; }
    .divider {
      border: none;
      border-top: 1px dashed #000;
      margin: 6px 0;
    }
    .meta { margin: 4px 0; }
    .meta span { display: inline-block; min-width: 72px; }
    table { width: 100%; border-collapse: collapse; margin: 4px 0; }
    th, td { padding: 2px 0; vertical-align: top; }
    th { text-align: left; font-size: 11px; border-bottom: 1px solid #000; }
    td.qty, td.amt { text-align: right; white-space: nowrap; }
    .totals { margin-top: 4px; }
    .totals div { display: flex; justify-content: space-between; padding: 1px 0; }
    .grand { font-size: 14px; font-weight: 700; margin-top: 4px; }
    .footer { margin-top: 10px; font-size: 11px; }
  </style>
</head>
<body>
  <div class="center bold" style="font-size:15px;margin-bottom:4px;">{{shop_name}}</div>
  <div class="center" style="font-size:11px;margin-bottom:6px;">Tax Invoice / Receipt</div>
  <hr class="divider">

  <div class="meta"><span>Bill No:</span> {{bill_no}}</div>
  <div class="meta"><span>Date:</span> {{created_date}} {{created_time}}</div>
  <div class="meta"><span>Staff:</span> {{staff_name}}</div>
  <div class="meta"><span>Order No:</span> {{manual_order_number}}</div>
  <div class="meta"><span>Customer:</span> {{customer_name}}</div>
  <div class="meta"><span>Mobile:</span> {{customer_mobile}}</div>
  <div class="meta"><span>GSTIN:</span> {{customer_gst}}</div>

  <hr class="divider">

  <table>
    <thead>
      <tr>
        <th>Item</th>
        <th class="qty">Qty</th>
        <th class="amt">Amt</th>
      </tr>
    </thead>
    <tbody>
      {{items_rows}}
    </tbody>
  </table>

  <hr class="divider">

  <div class="totals">
    <div><span>Subtotal</span><span>{{subtotal}}</span></div>
    <div><span>Discount</span><span>{{discount}}</span></div>
    <div><span>GST</span><span>{{gst_total}}</span></div>
    <div><span>CGST</span><span>{{cgst}}</span></div>
    <div><span>SGST</span><span>{{sgst}}</span></div>
    <div><span>Credit Applied</span><span>{{credit_applied}}</span></div>
  </div>
  <div class="grand totals"><span>Grand Total</span><span>{{total_amount}}</span></div>

  <hr class="divider">

  <div class="bold" style="margin-bottom:2px;">Payments</div>
  <table>
    <tbody>
      {{payments_rows}}
    </tbody>
  </table>

  <div class="bold" style="margin:6px 0 2px;">GST Summary</div>
  <table>
    <thead>
      <tr><th>Rate %</th><th class="amt">Tax</th></tr>
    </thead>
    <tbody>
      {{gst_summary_rows}}
    </tbody>
  </table>

  <hr class="divider">
  <div class="center footer">Thank you. Visit again!</div>
</body>
</html>`;

/** Example row snippets for documentation / frontend rendering helpers */
export const RECEIPT_ROW_EXAMPLES = {
  item: `<tr><td>{{product_name}}<br><small>{{stock_no}}</small></td><td class="qty">{{quantity}}</td><td class="amt">{{line_total}}</td></tr>`,
  payment: `<tr><td>{{payment_method}}</td><td class="amt">{{amount}}</td></tr>`,
  gst: `<tr><td>{{gst_rate}}%</td><td class="amt">{{gst_amount}}</td></tr>`,
};
