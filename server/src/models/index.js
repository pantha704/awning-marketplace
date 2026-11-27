import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const { Schema, model } = mongoose;
const ref = (name, extra = {}) => ({ type: Schema.Types.ObjectId, ref: name, ...extra });

export const ROLES = ['customer', 'vendor', 'admin'];
export const CATEGORIES = ['Electronics', 'Home & Kitchen', 'Fashion', 'Sports & Outdoors', 'Books & Stationery', 'Beauty & Care', 'Toys & Games', 'Garden'];
export const ORDER_STEPS = ['placed', 'packed', 'shipped', 'delivered']; // the lifecycle, in order
export const ORDER_STATUSES = [...ORDER_STEPS, 'cancelled'];

/* ---------- User ---------- */
const addressSchema = new Schema({
  fullName: { type: String, required: true, trim: true, maxlength: 80 },
  line1: { type: String, required: true, trim: true, maxlength: 120 },
  line2: { type: String, default: '', trim: true, maxlength: 120 },
  city: { type: String, required: true, trim: true, maxlength: 80 },
  state: { type: String, default: '', trim: true, maxlength: 80 },
  postalCode: { type: String, required: true, trim: true, maxlength: 20 },
  country: { type: String, required: true, trim: true, maxlength: 60 },
  phone: { type: String, default: '', trim: true, maxlength: 30 },
  isDefault: { type: Boolean, default: false },
});

const userSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ROLES, default: 'customer', index: true },
  disabled: { type: Boolean, default: false },
  addresses: { type: [addressSchema], default: [] },
}, { timestamps: true });
userSchema.methods.setPassword = async function setPassword(password) { this.passwordHash = await bcrypt.hash(password, 10); };
userSchema.methods.checkPassword = function checkPassword(password) { return bcrypt.compare(password, this.passwordHash); };
export const User = model('User', userSchema);

/* ---------- Vendor (a shop) ---------- */
const vendorSchema = new Schema({
  owner: ref('User', { required: true, unique: true }),
  name: { type: String, required: true, trim: true, maxlength: 60 },
  slug: { type: String, required: true, unique: true },
  tagline: { type: String, default: '', maxlength: 120 },
  description: { type: String, default: '', maxlength: 2000 },
  logoKey: { type: String, default: '' },
  color: { type: String, default: '#D4402B' }, // awning colour
  contactEmail: { type: String, default: '' },
  location: { type: String, default: '', maxlength: 80 },
  status: { type: String, enum: ['pending', 'approved', 'suspended'], default: 'pending', index: true },
  reviewNote: { type: String, default: '' }, // admin's message when suspending or rejecting
  approvedAt: Date,
  commissionPercent: { type: Number, min: 0, max: 100, default: null }, // null = platform default
  payout: {
    stripeAccountId: String,
    stripeReady: { type: Boolean, default: false },
    razorpayAccountId: String,
    testConnected: { type: Boolean, default: false },
  },
  productCount: { type: Number, default: 0 },
  ratingAvg: { type: Number, default: 0 },
  ratingCount: { type: Number, default: 0 },
}, { timestamps: true });
export const Vendor = model('Vendor', vendorSchema);

/* ---------- Product ---------- */
const productSchema = new Schema({
  vendor: ref('Vendor', { required: true, index: true }),
  title: { type: String, required: true, trim: true, maxlength: 140 },
  slug: { type: String, required: true, unique: true },
  description: { type: String, default: '', maxlength: 6000 },
  category: { type: String, enum: CATEGORIES, required: true, index: true },
  brand: { type: String, default: '', trim: true, maxlength: 60 },
  tags: { type: [String], default: [] },
  attributes: { type: [{ _id: false, name: String, value: String }], default: [] },
  price: { type: Number, required: true, min: 0 }, // minor units
  compareAtPrice: { type: Number, default: 0, min: 0 }, // the "was" price; 0 = none
  stock: { type: Number, default: 0, min: 0 },
  images: { type: [String], default: [] }, // storage keys
  status: { type: String, enum: ['draft', 'active', 'archived'], default: 'draft', index: true },
  ratingAvg: { type: Number, default: 0 },
  ratingCount: { type: Number, default: 0 },
  soldCount: { type: Number, default: 0 },
}, { timestamps: true });
productSchema.index({ status: 1, category: 1, createdAt: -1 });
productSchema.index({ vendor: 1, status: 1 });
export const Product = model('Product', productSchema);

/* ---------- Coupon ---------- */
const couponSchema = new Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 24 },
  description: { type: String, default: '', maxlength: 140 },
  type: { type: String, enum: ['percent', 'fixed'], required: true },
  value: { type: Number, required: true, min: 1 }, // percent (1-100) or minor units
  minSubtotal: { type: Number, default: 0 },
  maxDiscount: { type: Number, default: 0 }, // cap for percent coupons; 0 = no cap
  vendor: ref('Vendor', { default: null }), // null = valid across the marketplace
  startsAt: Date,
  expiresAt: Date,
  usageLimit: { type: Number, default: 0 }, // 0 = unlimited
  perCustomerLimit: { type: Number, default: 1 },
  usedCount: { type: Number, default: 0 },
  active: { type: Boolean, default: true },
}, { timestamps: true });
export const Coupon = model('Coupon', couponSchema);

/* ---------- Order ---------- */
const lineSchema = new Schema({
  product: ref('Product', { required: true }),
  vendor: ref('Vendor', { required: true }),
  title: String,
  slug: String,
  image: String, // storage key snapshot
  price: Number,
  qty: Number,
  lineTotal: Number,
  discount: { type: Number, default: 0 },
}, { _id: false });

/** One parcel per shop. Each has its own lifecycle and its own payout. */
const vendorOrderSchema = new Schema({
  vendor: ref('Vendor', { required: true }),
  vendorName: String,
  subtotal: Number,
  discount: { type: Number, default: 0 },
  shipping: { type: Number, default: 0 },
  total: Number, // what the customer paid for this parcel
  commissionPercent: Number,
  commission: Number, // platform's cut
  vendorNet: Number, // what the shop receives
  status: { type: String, enum: ORDER_STATUSES, default: 'placed' },
  tracking: { carrier: { type: String, default: '' }, number: { type: String, default: '' } },
  history: { type: [{ _id: false, status: String, at: Date, note: String }], default: [] },
  payout: {
    status: { type: String, enum: ['pending', 'transferred', 'reversed', 'none'], default: 'pending' },
    ref: String,
    at: Date,
    note: String,
  },
  refund: { amount: { type: Number, default: 0 }, ref: String, at: Date },
});

const orderSchema = new Schema({
  number: { type: String, required: true, unique: true },
  customer: ref('User', { required: true, index: true }),
  items: [lineSchema],
  vendorOrders: [vendorOrderSchema],
  shippingAddress: { fullName: String, line1: String, line2: String, city: String, state: String, postalCode: String, country: String, phone: String },
  subtotal: Number,
  discount: { type: Number, default: 0 },
  shippingTotal: { type: Number, default: 0 },
  total: Number,
  currency: { type: String, default: 'usd' },
  coupon: { code: String, vendor: ref('Vendor') },
  payment: {
    provider: { type: String, enum: ['stripe', 'razorpay', 'test'] },
    status: { type: String, enum: ['pending', 'paid', 'failed', 'expired'], default: 'pending', index: true },
    ref: String, // Stripe checkout session id / Razorpay order id
    chargeRef: String, // Stripe charge id / Razorpay payment id
    paidAt: Date,
  },
  stockReserved: { type: Boolean, default: true },
}, { timestamps: true });
orderSchema.index({ 'vendorOrders.vendor': 1, createdAt: -1 });
orderSchema.index({ 'payment.status': 1, 'payment.paidAt': -1 });
export const Order = model('Order', orderSchema);

/* ---------- Review ---------- */
const reviewSchema = new Schema({
  product: ref('Product', { required: true, index: true }),
  vendor: ref('Vendor', { required: true, index: true }),
  user: ref('User', { required: true }),
  authorName: String,
  rating: { type: Number, required: true, min: 1, max: 5 },
  title: { type: String, default: '', maxlength: 120 },
  body: { type: String, default: '', maxlength: 3000 },
  reply: { body: { type: String, maxlength: 2000 }, at: Date },
}, { timestamps: true });
reviewSchema.index({ product: 1, user: 1 }, { unique: true });
export const Review = model('Review', reviewSchema);
