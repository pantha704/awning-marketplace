# Awning setup guide

This guide is written for an AI agent or a person who has never seen this project.
Follow it top to bottom. Do not skip steps. Do not improvise.

## Rules for whoever follows this guide

1. Run every command from the **project root** (the folder that contains this file) unless a step says otherwise.
2. After every step in Part B, run `npm run doctor`. It prints one line per service:
   - `PASS` = working.
   - `WARN` = running on a local fallback. Fine on a laptop. Fix it before going live if the step says so.
   - `FAIL` = broken. Stop and fix it before moving on.
3. Backend secrets go in **`server/.env`** (on your laptop) or in the **hosting platform's environment variables screen** (in production). Never commit `server/.env`; it is already in `.gitignore`.
4. A value that still starts with `REPLACE_ME` means "not configured". The app treats it as empty and uses a fallback. To configure something, replace the **whole value** after the `=` sign. Never leave quotes or spaces around values.
5. Do not edit source code to configure the app. Everything is configured with environment variables.
6. If a command fails, read the error, then check **Troubleshooting** at the end before trying anything else.

---

# Part A. Run it on your own machine (about 5 minutes)

You need **Node.js 20 or newer** and nothing else. Check with:

```bash
node -v
```

If the number is lower than 20, install Node 20+ from https://nodejs.org and open a new terminal.

### A1. Install

```bash
npm install
```

Expected: it finishes without `npm error`. One command installs the backend (`server/`) and the frontend (`client/`), because they are npm workspaces.

### A2. Start

```bash
npm run dev
```

What happens automatically the first time:

| What | Detail |
| --- | --- |
| `server/.env` and `client/.env` are created | Copied from the `.env.example` files. A random `JWT_SECRET` is generated. |
| A database starts | If no MongoDB answers on `localhost:27017`, an embedded MongoDB is downloaded once (about 100 MB) and started. Its data is kept in `server/.data`. |
| Carts and caches | If no Redis answers on `localhost:6379`, carts and caches are kept in memory instead (they reset when the API restarts). |
| Search | Without `ELASTICSEARCH_URL`, search runs on a MongoDB fallback (filters, sorting and facets work; typo tolerance does not). |
| Images | Stored on local disk in `server/storage`. |
| Payments | A built-in test card form (no account needed). |
| Demo content | 7 shops, 59 products with pictures, 49 accounts, 173 orders in every state, 135 reviews, 3 coupons. |

Wait until the terminal shows a line like:

```
Awning API on http://localhost:4000  [db: ... | cache: ... | search: ... | storage: local | payments: test]
```

### A3. Open the app

Open **http://localhost:5173**.

Demo accounts (the sign-in page has one-click buttons). Password for all: `awning123`

| Role | Email | What to look at |
| --- | --- | --- |
| Customer | `sam@awning.test` | A cart waiting, orders in every state, checkout, parcel tracking, invoices |
| Shop owner | `maya@awning.test` | Your shop: dashboard, products, orders to pack and ship, payouts, coupons, reviews |
| Admin | `admin@awning.test` | Analytics, shop approvals (one shop is waiting), orders, coupons, people |

Coupon codes: `WELCOME10` (10% off, max 15.00), `BIGBASKET` (10.00 off over 80.00), `KETTLE15` (15% off at Kettle & Crumb over 30.00).
Test card: `4242 4242 4242 4242`, any future expiry, any 3 digits. `4000 0000 0000 0002` is declined on purpose.

### A4. Optional: the real services on your laptop (Docker)

If Docker is installed, this starts MongoDB, Redis and Elasticsearch locally:

```bash
docker compose up -d
```

Then edit `server/.env` and set:

```
ELASTICSEARCH_URL=http://localhost:9200
```

Stop `npm run dev` (Ctrl+C) and start it again. `npm run doctor` should show `PASS` for mongodb, redis and elasticsearch. Elasticsearch needs about 1 GB of free memory and takes up to a minute to start.

### A5. Check it works

```bash
npm run doctor     # no FAIL lines
npm test           # 57 tests pass (6 more run when TEST_ELASTICSEARCH_URL is set)
```

Useful commands:

| Command | What it does |
| --- | --- |
| `npm run dev` | API on port 4000 and web app on port 5173, both reload on change |
| `npm run seed:reset` | Wipe the database and reload the demo content |
| `npm run seed:photos` | Same, but with real product photos from DummyJSON (needs internet) |
| `npm run reindex` | Rebuild the search index from MongoDB |
| `npm run doctor` | Check every external service |
| `npm test` | Run the API test suite |
| `npm run build` then `npm start` | Production mode on one machine: port 4000 serves API and web app together |
| `npm run create-admin -- email password "Name"` | Create or promote an admin account |

**Part A is complete when** the app opens, the three demo accounts sign in, and `npm run doctor` shows no `FAIL` line.

---

# Part B. Make it fully live

The brief requires the **frontend and backend to be deployed separately**. This guide uses:

- **Backend (API)** on **Render** (a Node web service). Any host that runs Node 20 works (Railway, Fly.io, a VPS with the included `Dockerfile`).
- **Frontend (web app)** on **Vercel** (a static site). Netlify or Cloudflare Pages also work; the needed redirect files are included.

Each local fallback is replaced by a real service:

| Local fallback | Real service | Step |
| --- | --- | --- |
| Embedded MongoDB | MongoDB Atlas | B2 |
| In-memory carts and caches | Redis | B3 |
| MongoDB search | Elasticsearch | B4 |
| Images on local disk | AWS S3 | B5 |
| Built-in test card form | Stripe Connect or Razorpay Route (test mode) | B6 |

Do the steps in order. Collect every value in a scratch file as you go; you paste them all into Render in step B8.

## B1. Put the code on GitHub

1. Create an empty GitHub repository (private is fine).
2. From the project root:

```bash
git init
git add .
git commit -m "Awning marketplace"
git branch -M main
git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
git push -u origin main
```

Check that `server/.env` was **not** pushed (it must not appear on GitHub).

## B2. MongoDB Atlas (database)

1. Go to https://www.mongodb.com/atlas, sign up, create a free **M0** cluster.
2. **Database Access** > Add New Database User. Choose a username and a password with only letters and digits (this avoids URL-encoding problems). Role: "Read and write to any database".
3. **Network Access** > Add IP Address > **Allow access from anywhere** (`0.0.0.0/0`). Render's outgoing addresses change, so this is required on the free plan.
4. **Database** > Connect > Drivers. Copy the connection string:
   `mongodb+srv://USER:PASSWORD@cluster0.abcde.mongodb.net/?retryWrites=true&w=majority`
5. Put the real password in, and insert the database name `awning` right before the `?`.

Value to keep:

```
MONGO_URI=mongodb+srv://USER:PASSWORD@cluster0.abcde.mongodb.net/awning?retryWrites=true&w=majority
```

To verify now, put that line in `server/.env` on your laptop and run `npm run doctor`: expect `PASS  mongodb`.

## B3. Redis (carts and session caching)

Any Redis 6+ works. Easiest free option: **Upstash** (https://upstash.com).

1. Create a Redis database. Pick the region closest to where you will host the API (step B8).
2. Copy the **Redis URL** that starts with `rediss://` (two s, meaning TLS). It looks like `rediss://default:PASSWORD@eu1-able-fox-12345.upstash.io:6379`.

Values to keep:

```
REDIS_URL=rediss://default:PASSWORD@your-host.upstash.io:6379
CACHE_DRIVER=redis
```

Verify: `npm run doctor` shows `PASS  redis`.

Render's own "Key Value" (Redis-compatible) service also works; use its internal URL.

## B4. Elasticsearch (product search)

Pick **one** option.

**Option 1: Elastic Cloud** (official, free 14-day trial, then paid)

1. Go to https://cloud.elastic.co and create a deployment (any region, the smallest size is fine).
2. Open the deployment > **Copy endpoint** for Elasticsearch. It looks like `https://my-deployment.es.us-east-1.aws.elastic.cloud:443`.
3. Open Kibana > Stack Management > **API keys** > Create API key. Give it any name. Copy the **Encoded** value (one long string).

```
SEARCH_DRIVER=elasticsearch
ELASTICSEARCH_URL=https://my-deployment.es.us-east-1.aws.elastic.cloud:443
ELASTICSEARCH_API_KEY=the-encoded-api-key
ELASTICSEARCH_INDEX=awning_products
```

Leave `ELASTICSEARCH_USERNAME` and `ELASTICSEARCH_PASSWORD` as placeholders.

**Option 2: Bonsai** (https://bonsai.io, has a free sandbox) or **AWS OpenSearch**. They give a URL with a username and password. The app speaks the same API to both.

```
SEARCH_DRIVER=elasticsearch
ELASTICSEARCH_URL=https://your-cluster.bonsaisearch.net:443
ELASTICSEARCH_USERNAME=the-username
ELASTICSEARCH_PASSWORD=the-password
```

Leave `ELASTICSEARCH_API_KEY` as a placeholder.

Verify: `npm run doctor` shows `PASS  elasticsearch ... index "awning_products" holds N products`. The API rebuilds the index each time it starts; you can also run `npm run reindex` at any time.

If you skip this step entirely, set `SEARCH_DRIVER=mongo`. Search still works, without typo tolerance.

## B5. AWS S3 (product images)

Product photos and shop logos are uploaded by the API into S3 and shown to shoppers straight from S3.

### B5.1 Create the bucket

1. AWS console > S3 > **Create bucket**.
2. Name: unique, lowercase, for example `awning-images-yourname`. This is **BUCKET**.
3. Region: for example `us-east-1`. This is **REGION**.
4. Under **Block Public Access settings**, untick **Block all public access**, and tick only the two boxes about **ACLs** (leave the two **bucket policy** boxes unticked). Acknowledge the warning. Create the bucket.

### B5.2 Let anyone view the images

Bucket > Permissions > **Bucket policy** > Edit. Paste this, replace `BUCKET` (one place), save:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadImages",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": ["arn:aws:s3:::BUCKET/products/*", "arn:aws:s3:::BUCKET/shops/*", "arn:aws:s3:::BUCKET/seed/*", "arn:aws:s3:::BUCKET/healthchecks/*"]
    }
  ]
}
```

Only these four folders are public. Nothing else in the bucket can be read.

### B5.3 Credentials for the API

1. IAM > Users > **Create user**, name `awning-api`, no console access.
2. Permissions > Attach policies directly > **Create policy** > JSON. Paste and replace `BUCKET`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"], "Resource": "arn:aws:s3:::BUCKET/*" },
    { "Effect": "Allow", "Action": ["s3:ListBucket"], "Resource": "arn:aws:s3:::BUCKET" }
  ]
}
```

3. Attach the policy to the user. Open the user > Security credentials > **Create access key** > "Application running outside AWS". Copy both keys (the secret is shown once).

Values to keep:

```
STORAGE_DRIVER=s3
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
S3_BUCKET=awning-images-yourname
```

Optional: put CloudFront in front of the bucket and set `S3_PUBLIC_URL=https://dxxxx.cloudfront.net`. Leave it as a placeholder otherwise; images are then read from `https://BUCKET.s3.REGION.amazonaws.com`.

Verify: `npm run doctor` shows `PASS  s3 write` and `PASS  s3 read`. If `s3 read` fails with 403, step B5.1 point 4 or B5.2 was not done.

## B6. Payments with split payouts (test mode)

Pick **one** option. Both stay in test mode: no real money moves.

How the split works in Awning, whichever option you pick: the customer pays once for the whole cart; each shop's parcel records its total, the platform commission (`PLATFORM_COMMISSION_PERCENT` of the goods after discount, or the shop's own rate set by an admin) and the shop's share (the rest, plus the shipping it charged). The shop's share is sent to the shop's connected account.

### Option A: Stripe Connect (recommended outside India)

1. Sign up at https://dashboard.stripe.com. Keep the **Test mode** switch ON for everything below.
2. **Turn on Connect**: Settings > Connect (or the "Connect" product page) > **Get started**. Choose "Platform or marketplace" and Express accounts when asked. Finish the platform profile form; in test mode it is not reviewed.
3. Developers > API keys: copy the **Secret key** (`sk_test_...`).
4. Webhook (do this after step B8, once you know **API_URL**): Developers > Webhooks > **Add endpoint**:
   - URL: `API_URL/api/payments/webhook/stripe`
   - Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`
   - Save, then reveal the **Signing secret** (`whsec_...`).

```
PAYMENT_PROVIDER=stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
CURRENCY=usd
```

Use the currency of your Stripe account's country (`usd`, `gbp`, `eur`...). Verify: `npm run doctor` shows `PASS  stripe` and `PASS  stripe connect`.

How shops get paid: in Awning, the shop owner opens **Your shop > Payouts > Connect with Stripe**. Stripe's hosted onboarding opens. In test mode, fill it with Stripe's test values (test phone number, `000-000` verification code, the test bank account Stripe suggests). Back in Awning, the payout account shows as connected, and payouts that were waiting are sent automatically. Every later sale is transferred when the customer pays.

### Option B: Razorpay Route (India)

1. Sign up at https://dashboard.razorpay.com and stay in **Test Mode**.
2. Account & Settings > API Keys > **Generate Test Key**. Copy the Key Id (`rzp_test_...`) and Key Secret.
3. **Route** must be enabled on your account: open Route in the dashboard. If it asks, request activation from Razorpay support. In test mode it is usually available straight away.
4. For each shop: Route > **Linked Accounts** > create one (test details are fine). Copy its id (`acc_...`) and give it to the shop owner, who pastes it in **Your shop > Payouts**.
5. Webhook (after step B8): Accounts & Settings > Webhooks > Add new:
   - URL: `API_URL/api/payments/webhook/razorpay`
   - Secret: invent a long random string and write it down.
   - Events: `payment.captured`, `order.paid`.

```
PAYMENT_PROVIDER=razorpay
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=the-string-you-invented
CURRENCY=inr
```

Verify: `npm run doctor` shows `PASS  razorpay` and `PASS  currency`.

Test payment in Razorpay Checkout: use card `4111 1111 1111 1111`, any future date, any CVV, and choose "Success" on the bank page.

## B7. Marketplace rules (optional)

```
PLATFORM_COMMISSION_PERCENT=10   # default platform cut; admins can set per-shop rates
SHIPPING_FLAT=499                # per shop, in minor units (499 = 4.99)
FREE_SHIPPING_OVER=5000          # per shop, in minor units (5000 = 50.00)
```

With `CURRENCY=inr` use rupee amounts in paise, for example `SHIPPING_FLAT=4900` and `FREE_SHIPPING_OVER=99900`.

## B8. Deploy the backend (Render)

1. Go to https://render.com and sign in with GitHub.
2. **New** > **Blueprint**, pick your repository. Render reads `render.yaml` from the project and proposes one web service called `awning-api`. Choose **Apply**. Render generates `JWT_SECRET` for you; leave it.
   (Without the blueprint: New > Web Service, root directory empty, build command `npm install`, start command `npm start`, health check path `/api/health`.)
3. Open the service > **Environment**. Add every value you collected in B2 to B7, plus these:

```
NODE_ENV=production
JWT_SECRET=<a long random string, see below>
AUTO_SEED=false
MONGO_MEMORY_FALLBACK=false
CLIENT_URL=https://placeholder.example     # replaced in step B9
PUBLIC_URL=https://awning-api.onrender.com  # your service's own address
```

   Generate `JWT_SECRET` with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

   Do **not** set `PORT`; Render sets it.
4. Save. Render deploys. Copy the service address shown at the top, for example `https://awning-api.onrender.com`. This is **API_URL**. Make sure `PUBLIC_URL` equals it.
5. Open `API_URL/api/health` in a browser. Expected:

```json
{ "ok": true, "env": "production", "database": "mongodb", "cache": "redis", "search": "elasticsearch", "storage": "s3", "payments": "stripe" }
```

   (`payments` is `razorpay` if you chose option B.)

6. Now create the payment webhook from step B6 using API_URL, put its secret in Render's environment, and save (Render redeploys).

The free Render plan sleeps after 15 minutes without traffic; the first request afterwards takes about a minute. Use a paid instance for a demo you present.

## B9. Deploy the frontend (Vercel)

1. Go to https://vercel.com, sign in with GitHub, **Add New** > **Project**, import the same repository.
2. Settings on the import screen:
   - **Root Directory**: `client`
   - Framework preset: **Vite**
   - Build command: `npm run build` (default). Output directory: `dist` (default).
   - **Environment Variables**: `VITE_API_URL` = API_URL (no trailing slash), for example `https://awning-api.onrender.com`
3. Deploy. Copy the site address, for example `https://awning.vercel.app`. This is **APP_URL**.
4. Back in Render, set `CLIENT_URL` = APP_URL and save. This is required: the API only accepts browser requests from `CLIENT_URL`, and payment providers send buyers back to it. Several addresses can be comma-separated, for example `https://awning.vercel.app,https://www.yourdomain.com`.

`VITE_API_URL` is read when the site is **built**. If API_URL ever changes, update it in Vercel and redeploy the frontend.

Netlify instead of Vercel: base directory `client`, build command `npm run build`, publish directory `client/dist`, same `VITE_API_URL`. The file `client/public/_redirects` already handles page routes.

## B10. First content

Production starts empty. Open Render > your service > **Shell** and run **one** of these:

```bash
# A: your own admin, empty marketplace
npm run create-admin -- you@example.com "a-strong-password" "Your Name"

# B: the full demo marketplace (images are uploaded to S3 and indexed in Elasticsearch)
npm run seed:reset
```

If you load the demo, change the demo passwords or disable the demo accounts afterwards (Admin > People), because the demo password is public.

## B11. Final check

1. In Render's Shell: `npm run doctor`. Every line is `PASS`.
2. In the browser, on APP_URL:
   - Search for `stonware` (typo on purpose). Stoneware products appear, and the result line says "Elasticsearch".
   - Add products from two shops to the cart as a guest, then sign in. The cart is still there.
   - Check out, pay with the provider's test card. The order page shows one parcel per shop.
   - Shop owner: Your shop > Payouts > connect the payout account. Orders > Mark as packed, then shipped (with a tracking number), then delivered.
   - Customer: the order page shows the progress. After delivery, write a review. Download the invoice PDF.
   - Shop owner: Products > Add product, upload a photo, Put on sale. In the browser's network tab the photo loads from `amazonaws.com` (or your CloudFront domain).
   - Admin: Analytics shows the sale and the commission. In the Stripe or Razorpay test dashboard, the payment and the transfer to the connected account are visible.

**The project is fully live when all of step B11 passes.**

---

# Environment variable reference

Backend variables (`server/.env` locally, Render's Environment screen in production). "Fallback" is what happens when the value is empty or still a `REPLACE_ME` placeholder.

| Variable | Needed live | Fallback | Meaning |
| --- | --- | --- | --- |
| `NODE_ENV` | `production` | `development` | Production turns off all local fallbacks and the demo auto-load |
| `PORT` | no (host sets it) | `4000` | Port the API listens on |
| `CLIENT_URL` | yes | `http://localhost:5173` | Frontend address(es), comma-separated. CORS and payment redirects |
| `PUBLIC_URL` | yes | `http://localhost:4000` | The API's own public address |
| `JWT_SECRET` | yes | dev-only secret (refused in production) | Signs sign-in tokens |
| `JWT_EXPIRES_IN` | no | `7d` | How long a sign-in lasts |
| `MONGO_URI` | yes | `mongodb://127.0.0.1:27017/awning` | MongoDB connection string |
| `MONGO_MEMORY_FALLBACK` | `false` | `true` in development | Embedded MongoDB when `MONGO_URI` is unreachable |
| `AUTO_SEED` | `false` | `true` in development | Load the demo marketplace into an empty database |
| `REDIS_URL` | yes | `redis://127.0.0.1:6379` | Redis for carts, sessions and page caches |
| `CACHE_DRIVER` | `redis` | `auto` | `auto`, `redis` or `memory` |
| `SEARCH_DRIVER` | `elasticsearch` | `auto` | `auto`, `elasticsearch` or `mongo` |
| `ELASTICSEARCH_URL` | yes | none (MongoDB search) | Cluster address with protocol and port |
| `ELASTICSEARCH_API_KEY` | one of these two | none | Encoded API key (Elastic Cloud) |
| `ELASTICSEARCH_USERNAME` / `_PASSWORD` | one of these two | none | Basic auth (Bonsai, OpenSearch, self-hosted) |
| `ELASTICSEARCH_INDEX` | no | `awning_products` | Index name |
| `STORAGE_DRIVER` | `s3` | `auto` (s3 when region and bucket are set, else local) | Where images are stored |
| `AWS_REGION` | yes | none | Bucket region |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | yes (or an instance role) | AWS default credential chain | IAM credentials |
| `S3_BUCKET` | yes | none | Bucket name |
| `S3_PUBLIC_URL` | no | `https://BUCKET.s3.REGION.amazonaws.com` | Base URL images are read from (for example CloudFront) |
| `MAX_IMAGE_MB` | no | `5` | Largest image upload |
| `PAYMENT_PROVIDER` | `stripe` or `razorpay` | `auto` (Stripe if its key is set, else Razorpay, else test) | Payment provider |
| `STRIPE_SECRET_KEY` | option A | none | `sk_test_...` |
| `STRIPE_WEBHOOK_SECRET` | option A, recommended | signatures not checked | `whsec_...` |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | option B | none | `rzp_test_...` and its secret |
| `RAZORPAY_WEBHOOK_SECRET` | option B, recommended | webhook refused | The string set on the webhook |
| `PLATFORM_COMMISSION_PERCENT` | no | `10` | Default platform cut |
| `CURRENCY` | yes | `usd` | Three-letter code; `inr` for Razorpay |
| `SHIPPING_FLAT` / `FREE_SHIPPING_OVER` | no | `499` / `5000` | Per-shop shipping, in minor units |

Frontend variables (`client/.env` locally, Vercel's Environment Variables in production):

| Variable | Meaning |
| --- | --- |
| `VITE_API_URL` | **Required in production.** Public address of the API, no trailing slash. Read at build time. Leave empty locally. |
| `VITE_DEV_API_TARGET` | Local only: where `npm run dev` forwards API calls. Default `http://localhost:4000`. |

---

# Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| First `npm run dev` hangs at "Starting the embedded dev database" | The one-time MongoDB download is slow or blocked | Wait, or run `docker compose up -d`, or set `MONGO_URI` to Atlas (B2) |
| `EADDRINUSE :::4000` | Something else uses port 4000 | Set `PORT=4100` in `server/.env` and `VITE_DEV_API_TARGET=http://localhost:4100` in `client/.env` |
| Demo sign-in buttons say "Email or password is incorrect" | Demo data not loaded | `npm run seed:reset` |
| The live site loads but every list is empty and the console shows CORS errors | `CLIENT_URL` on the API does not match the frontend address exactly | Set `CLIENT_URL` in Render to APP_URL (same `https://`, no trailing slash) and save |
| The live site calls `/api/...` on the Vercel address and gets 404 | `VITE_API_URL` was missing when the frontend was built | Set it in Vercel, then **Redeploy** |
| Refreshing a page on the live site gives 404 | The static host does not send page routes to `index.html` | Vercel: keep `client/vercel.json`. Netlify: keep `client/public/_redirects` |
| API fails to start: "Redis is not reachable" | Wrong `REDIS_URL`, or `redis://` used where `rediss://` is required | Copy the URL again from Upstash; it starts with `rediss://` |
| API fails to start: "Elasticsearch is not usable" | Wrong URL, key or password | Check B4. Run `npm run doctor` locally with the same values to see the exact error |
| Search says "MongoDB search" in production | `ELASTICSEARCH_URL` not set and `SEARCH_DRIVER=auto` | Set B4 values, or accept the fallback |
| Self-hosted Elasticsearch refuses to create the index ("blocked by: FORBIDDEN... create-index") | The disk is above Elasticsearch's high watermark | Free disk space, or (for development only) disable the disk threshold in the cluster settings |
| New products do not appear in search | The index missed an update | `npm run reindex` |
| Product images show broken icons | Bucket not public for those folders | B5.1 point 4 and B5.2. `npm run doctor` must show `PASS  s3 read` |
| `FAIL s3 write ... AccessDenied` | IAM policy missing or names another bucket | B5.3; check the bucket name in both places |
| `FAIL stripe connect` | Connect is not turned on for the account | B6 option A, step 2 |
| Stripe onboarding link fails with a country error | The platform account country cannot onboard that shop's country | In test mode, onboard shops in the same country as your Stripe account |
| Payouts stay "Waiting" | The shop has not connected a payout account, or Stripe onboarding is unfinished | Shop owner: Your shop > Payouts > finish onboarding. Waiting payouts are sent when the page is opened after onboarding completes |
| Razorpay order creation fails with a transfers error | Route not enabled, or a linked account id is wrong | B6 option B, steps 3 and 4 |
| Razorpay says the currency is not supported | `CURRENCY` is not `inr` | Set `CURRENCY=inr` |
| Orders stay "awaiting payment" after paying | The buyer closed the tab before returning and no webhook is configured | Add the webhook (B6). Unpaid orders release their stock after 30 minutes |
| Carts empty after every API restart | Running on the in-memory fallback | Configure Redis (B3) and set `CACHE_DRIVER=redis` |
| Everyone is signed out after a deploy | `JWT_SECRET` changed | Keep the same `JWT_SECRET` |
| The first request after a while takes a minute | Render's free plan sleeps | Use a paid instance for demos |
