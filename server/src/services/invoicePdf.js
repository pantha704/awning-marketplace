import PDFDocument from 'pdfkit';
import { config } from '../config.js';

const INK = '#17181C';
const MUTED = '#6B6E76';
const RULE = '#D9DADF';
const RED = '#D4402B';

const money = (minor, currency) => new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(minor / 100);
const day = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * Stream an A4 invoice into `out`. With `vendorId` the invoice covers only
 * that shop's parcel (the copy a shop downloads); without it, the whole order.
 */
export function writeInvoicePdf(order, out, { vendorId } = {}) {
  const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `Invoice ${order.number}`, Author: 'Awning' } });
  doc.pipe(out);
  const W = doc.page.width - 96;
  const left = 48;
  const right = left + W;
  const parcels = order.vendorOrders.filter((vo) => !vendorId || String(vo.vendor._id || vo.vendor) === String(vendorId));
  const m = (v) => money(v, order.currency);

  // Awning stripe across the top
  for (let x = 0, i = 0; x < doc.page.width; x += 28, i++) doc.rect(x, 0, 28, 14).fill(i % 2 ? '#FFFFFF' : RED);
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(22).text('Awning', left, 44);
  doc.font('Helvetica').fontSize(9).fillColor(MUTED).text('A marketplace of independent shops', left, 70);
  doc.font('Helvetica-Bold').fontSize(18).fillColor(INK).text('Invoice', left, 44, { width: W, align: 'right' });
  doc.font('Helvetica').fontSize(9.5).fillColor(MUTED)
    .text(`Order ${order.number}`, left, 68, { width: W, align: 'right' })
    .text(`Placed ${day(order.createdAt)}`, { width: W, align: 'right' })
    .text(order.payment.status === 'paid' ? `Paid ${day(order.payment.paidAt)}` : 'Payment pending', { width: W, align: 'right' });

  // Addresses
  const a = order.shippingAddress || {};
  let y = 122;
  doc.moveTo(left, y - 12).lineTo(right, y - 12).lineWidth(0.6).strokeColor(RULE).stroke();
  doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED).text('Billed and shipped to', left, y);
  doc.font('Helvetica').fontSize(10.5).fillColor(INK).text([a.fullName, a.line1, a.line2, [a.city, a.state, a.postalCode].filter(Boolean).join(', '), a.country, a.phone].filter(Boolean).join('\n'), left, y + 14, { width: W / 2 - 10 });
  doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED).text(vendorId ? 'Sold by' : 'Sold through', left + W / 2, y);
  doc.font('Helvetica').fontSize(10.5).fillColor(INK).text(vendorId ? `${parcels[0]?.vendorName}\nvia Awning marketplace` : `Awning marketplace\n${config.clientUrl}`, left + W / 2, y + 14, { width: W / 2 });
  y = Math.max(doc.y, y + 90) + 18;

  const cols = { item: left, qty: left + W * 0.58, price: left + W * 0.68, total: left + W * 0.84 };
  const head = () => {
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(MUTED);
    doc.text('Item', cols.item, y);
    doc.text('Qty', cols.qty, y, { width: W * 0.08, align: 'right' });
    doc.text('Price', cols.price, y, { width: W * 0.14, align: 'right' });
    doc.text('Amount', cols.total, y, { width: W * 0.16, align: 'right' });
    y += 14;
    doc.moveTo(left, y).lineTo(right, y).lineWidth(0.6).strokeColor(RULE).stroke();
    y += 8;
  };
  const room = (need) => { if (y + need > doc.page.height - 70) { doc.addPage(); y = 56; head(); } };
  head();

  const totals = { subtotal: 0, discount: 0, shipping: 0, total: 0 };
  for (const vo of parcels) {
    room(60);
    if (!vendorId) {
      doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text(vo.vendorName, cols.item, y);
      doc.font('Helvetica').fontSize(8.5).fillColor(vo.status === 'cancelled' ? RED : MUTED).text(vo.status === 'cancelled' ? 'Cancelled and refunded' : `Status: ${vo.status}`, cols.item, y + 1, { width: W, align: 'right' });
      y += 18;
    }
    for (const line of order.items.filter((l) => String(l.vendor) === String(vo.vendor._id || vo.vendor))) {
      doc.font('Helvetica').fontSize(10).fillColor(INK);
      const h = doc.heightOfString(line.title, { width: W * 0.54 });
      room(h + 10);
      doc.text(line.title, cols.item, y, { width: W * 0.54 });
      doc.text(String(line.qty), cols.qty, y, { width: W * 0.08, align: 'right' });
      doc.text(m(line.price), cols.price, y, { width: W * 0.14, align: 'right' });
      doc.text(m(line.lineTotal), cols.total, y, { width: W * 0.16, align: 'right' });
      y += h + 8;
    }
    doc.font('Helvetica').fontSize(9).fillColor(MUTED);
    doc.text(vo.shipping ? 'Shipping' : 'Shipping (free)', cols.item, y);
    doc.text(m(vo.shipping), cols.total, y, { width: W * 0.16, align: 'right' });
    y += 16;
    doc.moveTo(left, y).lineTo(right, y).lineWidth(0.4).strokeColor(RULE).stroke();
    y += 10;
    if (vo.status !== 'cancelled') { totals.subtotal += vo.subtotal; totals.discount += vo.discount; totals.shipping += vo.shipping; totals.total += vo.total; }
  }

  room(110);
  const row = (label, value, bold) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 12 : 10).fillColor(bold ? INK : MUTED);
    doc.text(label, cols.qty - 40, y, { width: W * 0.3 });
    doc.fillColor(INK).text(value, cols.total - 20, y, { width: W * 0.16 + 20, align: 'right' });
    y += bold ? 20 : 16;
  };
  y += 4;
  row('Subtotal', m(totals.subtotal));
  if (totals.discount) row(`Discount${order.coupon?.code ? ` (${order.coupon.code})` : ''}`, `-${m(totals.discount)}`);
  row('Shipping', m(totals.shipping));
  doc.moveTo(cols.qty - 40, y + 2).lineTo(right, y + 2).lineWidth(0.8).strokeColor(INK).stroke();
  y += 10;
  row('Total', m(totals.total), true);

  doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(
    `Prices include all applicable taxes. Paid by ${order.payment.provider === 'test' ? 'test payment' : order.payment.provider === 'stripe' ? 'card (Stripe)' : 'Razorpay'}. Each shop ships its own parcel. Questions about an item go to the shop that sold it.`,
    left, doc.page.height - 86, { width: W }
  );
  doc.end();
}
