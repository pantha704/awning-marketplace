# API reference

Base URL: `API_URL/api`. JSON in and out. Signed-in requests send `Authorization: Bearer <token>`.
Guest cart requests send `X-Cart-Id: <random id>` (the web app does this automatically).

Errors always look like this, with the matching status (400 invalid, 401 not signed in, 403 not allowed,
404 not found, 409 conflict such as stock that just ran out):

```json
{ "error": "A sentence a person can act on.", "details": [{ "field": "price", "message": "Set a price above zero." }] }
```

Money is in minor units (cents or paise). Roles: `customer`, `vendor`, `admin`.

## Health

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Active drivers: database, cache, search, storage, payments, currency |

## Auth and account

| Method | Path | Auth | Body / notes |
| --- | --- | --- | --- |
| POST | `/auth/register` | none | `name, email, password (8+), role: customer or vendor`. Merges the guest cart |
| POST | `/auth/login` | none | `email, password`. Merges the guest cart |
| GET | `/auth/me` | any | Profile with `vendorId`, `vendorStatus` |
| PATCH | `/auth/me` | any | `name` |
| POST | `/auth/password` | any | `currentPassword, newPassword` |
| GET / POST | `/auth/addresses` | any | Address book; first address becomes the default |
| PATCH / DELETE | `/auth/addresses/:id` | any | Edit, make default, remove |

## Catalog

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/catalog/home` | Departments, deals, bestsellers, new products, shops (cached in Redis) |
| GET | `/catalog/search` | `q, category, brand (comma list), minPrice, maxPrice, minRating, inStock=1, vendor, sort (relevance, bestselling, price-asc, price-desc, rating, newest), page, limit`. Returns `items, total, pages, facets { categories, brands, price { min, max } }, engine, tookMs` |
| GET | `/catalog/suggest?q=` | Up to 6 title suggestions, typo tolerant |
| GET | `/catalog/meta` | Departments and the active search engine |
| GET | `/catalog/shops`, `/catalog/shops/:slug` | Open shops |
| GET | `/catalog/products/:slug` | Product, shop, more from the shop, `canReview`, `myReview` |
| GET | `/catalog/products/:id/reviews?page=` | Reviews and the star spread |
| POST | `/catalog/products/:id/reviews` | `rating 1-5, title?, body?`. Only after the customer's parcel was delivered; posting again edits |

## Cart (Redis)

| Method | Path | Body |
| --- | --- | --- |
| GET | `/cart` | Priced cart: `lines, groups (one per shop with subtotal, discount, shipping, freeShippingGap, total), subtotal, discount, shippingTotal, total, coupon, hasIssues` |
| POST | `/cart/items` | `productId, qty` (capped at stock and 20) |
| PATCH | `/cart/items/:productId` | `qty` (0 removes) |
| DELETE | `/cart/items/:productId` | |
| PUT | `/cart/coupon` | `code`. 400 with the reason if it does not apply |
| DELETE | `/cart/coupon` | |

## Orders (customer)

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/orders/checkout` | `addressId` or `address` (+ `saveAddress`). Reprices, reserves stock, creates the order, starts payment. Returns `order` and `payment` (`{ provider: 'stripe', url }`, `{ provider: 'razorpay', keyId, razorpayOrderId, ... }` or `{ provider: 'test', orderId }`) |
| GET | `/orders?page=` | My orders |
| GET | `/orders/:id` | Order with parcels, tracking and history |
| POST | `/orders/:id/pay` | Resume payment of an unpaid order |
| POST | `/orders/:id/parcels/:parcelId/cancel` | Cancel one parcel before the shop packs it (refund, restock) |
| GET | `/orders/:id/invoice` | PDF invoice |

## Payments

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/payments/config` | Provider, currency, commission, shipping rules |
| POST | `/payments/test/:orderId/pay` | Test gateway: `name, cardNumber, expiry, cvc` |
| POST | `/payments/cancel/:orderId` | Buyer backed out: release the reserved stock |
| GET | `/payments/stripe/verify?session_id=` | Confirm a Stripe Checkout session after the redirect |
| POST | `/payments/razorpay/verify` | `orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature` |
| POST | `/payments/webhook/stripe` | Stripe webhook (raw body, signature checked) |
| POST | `/payments/webhook/razorpay` | Razorpay webhook (HMAC checked) |

## Shop owner (`role: vendor`)

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/vendor/apply` | `name, tagline?, description, location?, contactEmail?, color?`. Creates a pending shop |
| GET / PATCH | `/vendor/me` | My shop profile |
| POST | `/vendor/logo` | Multipart `image` |
| GET | `/vendor/dashboard?days=` | Earnings, sales, commission (range, previous, lifetime), daily series, best sellers, parcels by status, low stock |
| GET / POST | `/vendor/products` | List (`status, q`) / create a draft |
| GET / PATCH / DELETE | `/vendor/products/:id` | Edit; `status: active` needs an approved shop and a photo; delete archives products that were sold |
| POST | `/vendor/products/:id/images` | Multipart `images` (up to 6 in total), uploaded to S3 |
| PUT | `/vendor/products/:id/images` | `keys`: new order; missing keys are deleted from storage |
| GET | `/vendor/orders?status=&page=` | My parcels with shipping address, commission and my share |
| POST | `/vendor/orders/:orderId/advance` | `to: packed, shipped (needs tracking { carrier, number }), delivered`. One step at a time |
| POST | `/vendor/orders/:orderId/cancel` | Cancel my parcel before it ships (refund, payout reversal, restock) |
| GET | `/vendor/orders/:orderId/invoice` | PDF invoice for my parcel only |
| GET | `/vendor/payouts` | Connection state, paid and waiting totals, ledger |
| POST | `/vendor/payouts/connect` | Stripe: returns an onboarding `url`. Razorpay: `razorpayAccountId`. Test: toggles a test account |
| GET / POST / PATCH / DELETE | `/vendor/coupons[/:id]` | Coupons valid on my products only |
| GET | `/vendor/reviews` | Reviews of my products |
| PUT | `/vendor/reviews/:id/reply` | `body` (empty removes the reply) |

## Admin

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/admin/analytics?days=` | GMV, commission, orders, average order, customers, series, top shops, products and departments, fulfilment, system drivers |
| GET | `/admin/vendors?status=` | Shops with owner, sales and commission earned |
| PATCH | `/admin/vendors/:id` | `status (pending, approved, suspended), reviewNote, commissionPercent (null = default)` |
| GET / PATCH | `/admin/users`, `/admin/users/:id` | Search people; change role or disable |
| GET | `/admin/orders?status=&q=&page=` | All paid orders with per-parcel economics |
| POST | `/admin/orders/:id/parcels/:parcelId/advance` / `cancel` | Intervene on a parcel |
| GET / POST / PATCH / DELETE | `/admin/coupons[/:id]` | Marketplace-wide coupons |
| GET / PATCH | `/admin/products`, `/admin/products/:id` | Moderate: `status: active or archived` |
