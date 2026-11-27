import mongoose from 'mongoose';
import { Order } from '../models/index.js';

const DAY = 24 * 3600 * 1000;
const dayKey = (d) => new Date(d).toISOString().slice(0, 10);
export const rangeStart = (days) => new Date(new Date().setUTCHours(0, 0, 0, 0) - (days - 1) * DAY);
export const cleanDays = (value) => ([7, 30, 90, 365].includes(Number(value)) ? Number(value) : 30);

/** A zero-filled series, one point per day. */
export function fillSeries(rows, days, fields) {
  const since = rangeStart(days).getTime();
  const byDay = new Map(rows.map((r) => [r._id, r]));
  return Array.from({ length: days }, (_, i) => {
    const date = dayKey(since + i * DAY);
    const row = byDay.get(date) || {};
    return { date, ...Object.fromEntries(fields.map((f) => [f, row[f] || 0])) };
  });
}

/**
 * Sales figures per parcel. Cancelled parcels are excluded, so numbers match
 * what was actually sold. Pass a vendorId to scope everything to one shop.
 */
export function parcelPipeline({ vendorId, since, until } = {}) {
  const paidAt = {};
  if (since) paidAt.$gte = since;
  if (until) paidAt.$lt = until;
  return [
    { $match: { 'payment.status': 'paid', ...(since || until ? { 'payment.paidAt': paidAt } : {}), ...(vendorId ? { 'vendorOrders.vendor': new mongoose.Types.ObjectId(String(vendorId)) } : {}) } },
    { $unwind: '$vendorOrders' },
    { $match: { 'vendorOrders.status': { $ne: 'cancelled' }, ...(vendorId ? { 'vendorOrders.vendor': new mongoose.Types.ObjectId(String(vendorId)) } : {}) } },
  ];
}

const SUM = {
  gross: { $sum: '$vendorOrders.total' },
  commission: { $sum: '$vendorOrders.commission' },
  net: { $sum: '$vendorOrders.vendorNet' },
  parcels: { $sum: 1 },
};

export async function totals(scope) {
  const [row] = await Order.aggregate([...parcelPipeline(scope), { $group: { _id: null, ...SUM, orders: { $addToSet: '$_id' } } }]);
  return { gross: row?.gross || 0, commission: row?.commission || 0, net: row?.net || 0, parcels: row?.parcels || 0, orders: row?.orders?.length || 0 };
}

export async function dailySeries(scope, days) {
  const rows = await Order.aggregate([
    ...parcelPipeline({ ...scope, since: rangeStart(days) }),
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$payment.paidAt' } }, ...SUM } },
  ]);
  return fillSeries(rows, days, ['gross', 'commission', 'net', 'parcels']);
}

/** Best sellers by revenue within the scope. */
export async function topProducts({ vendorId, since } = {}, limit = 6) {
  const vid = vendorId ? new mongoose.Types.ObjectId(String(vendorId)) : null;
  return Order.aggregate([
    { $match: { 'payment.status': 'paid', ...(since ? { 'payment.paidAt': { $gte: since } } : {}), ...(vid ? { 'items.vendor': vid } : {}) } },
    { $unwind: '$items' },
    ...(vid ? [{ $match: { 'items.vendor': vid } }] : []),
    { $group: { _id: '$items.product', title: { $first: '$items.title' }, units: { $sum: '$items.qty' }, revenue: { $sum: { $subtract: ['$items.lineTotal', '$items.discount'] } } } },
    { $sort: { revenue: -1 } },
    { $limit: limit },
    { $project: { _id: 0, productId: { $toString: '$_id' }, title: 1, units: 1, revenue: 1 } },
  ]);
}
