#!/usr/bin/env python3
"""
Browser smoke test for Awning (optional).

Drives real Chromium through the customer, shop owner and admin journeys.

    pip install playwright && playwright install chromium
    npm run seed:reset && npm run build && npm start      # app on http://localhost:4000
    python3 scripts/e2e_smoke.py [BASE_URL] [path/to/any-photo.png]

Prints PASS/FAIL per journey. Needs the demo data, so reset it before each run.
"""
import asyncio, sys, time
from playwright.async_api import async_playwright, expect

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4000'
PHOTO = sys.argv[2] if len(sys.argv) > 2 else None
PASSWORD = 'awning123'
results = []

async def step(name, coro):
    t = time.time()
    try:
        await coro
        results.append((name, True))
        print(f'PASS  {name}  ({time.time() - t:.1f}s)', flush=True)
    except Exception as e:  # noqa: BLE001
        results.append((name, False))
        print(f'FAIL  {name}: {str(e)[:500]}', flush=True)

async def login(page, email):
    await page.goto(f'{BASE}/login')
    await page.get_by_label('Email').fill(email)
    await page.get_by_label('Password').fill(PASSWORD)
    await page.locator('main').get_by_role('button', name='Sign in').click()
    await page.wait_for_url(lambda u: '/login' not in u)

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        errors = []
        async def new_page(w=1360, h=900):
            ctx = await browser.new_context(viewport={'width': w, 'height': h})
            page = await ctx.new_page()
            page.on('pageerror', lambda e: errors.append(str(e)))
            return page
        shopper = await new_page()
        maya = await new_page()
        admin = await new_page()

        async def search():
            await shopper.goto(BASE)
            box = shopper.get_by_role('combobox').first
            await box.fill('headphnes')                       # typo on purpose
            await expect(shopper.get_by_role('option').first).to_contain_text('Headphones')
            await box.press('Enter')
            await shopper.wait_for_url('**/search?q=headphnes')
            await expect(shopper.get_by_role('heading', level=3, name='Wireless Over-Ear Headphones')).to_be_visible()
            await shopper.goto(f'{BASE}/search?category=Garden')
            await shopper.get_by_label('Olaria').click()
            await shopper.wait_for_url('**brand=Olaria**')
            await expect(shopper.get_by_label('Olaria')).to_be_checked()
            await shopper.get_by_label('Sort by').select_option('price-asc')
            await shopper.wait_for_url('**sort=price-asc**')
            await shopper.wait_for_load_state('networkidle')   # the previous results stay on screen, dimmed, until the new ones arrive
            await expect(shopper.get_by_role('button', name='Olaria')).to_be_visible()      # filter chip
            names = await shopper.locator('main article h3').all_inner_texts()
            assert names == ['Terracotta Planter, 18 cm', 'Glazed Planter, 24 cm', 'Planter Set, Three Sizes'], names
        await step('search: typo-tolerant suggestions, brand filter and price sort', search())

        async def guest_cart():
            await shopper.goto(f'{BASE}/p/stoneware-mug-350-ml')
            await shopper.get_by_role('button', name='One more').click()
            await shopper.get_by_role('button', name='Add to cart').click()
            drawer = shopper.get_by_role('dialog', name='Your cart')
            await expect(drawer).to_contain_text('Stoneware Mug, 350 ml')
            await expect(drawer).to_contain_text('Add $14.00 more for free shipping')
            await drawer.get_by_role('button', name='Close cart').click()
            await shopper.goto(f'{BASE}/p/field-watch-38-mm')
            await shopper.get_by_role('button', name='Add to cart').click()
            await expect(shopper.get_by_role('dialog', name='Your cart')).to_contain_text('2 shops, one checkout')
        await step('guest cart: add from two shops, drawer shows per-shop shipping', guest_cart())

        async def merge_and_coupon():
            await shopper.goto(f'{BASE}/checkout')
            await shopper.wait_for_url('**/login')
            await shopper.get_by_label('Email').fill('sam@awning.test')
            await shopper.get_by_label('Password').fill(PASSWORD)
            await shopper.locator('main').get_by_role('button', name='Sign in').click()
            await shopper.wait_for_url('**/checkout')
            await shopper.goto(f'{BASE}/cart')
            await expect(shopper.get_by_role('heading', name='Your cart')).to_be_visible()
            for title in ['Stoneware Mug, 350 ml', 'Field Watch, 38 mm', 'Gooseneck Pour-Over Kettle']:   # guest items + Sam's saved cart
                await expect(shopper.get_by_role('link', name=title).first).to_be_visible()
            await shopper.get_by_label('Discount code').fill('nope')
            await shopper.get_by_role('button', name='Apply').click()
            await expect(shopper.get_by_role('alert')).to_contain_text('not valid')
            await shopper.get_by_label('Discount code').fill('kettle15')
            await shopper.get_by_role('button', name='Apply').click()
            await expect(shopper.get_by_text('KETTLE15', exact=True)).to_be_visible()
            await expect(shopper.get_by_text('Code KETTLE15')).to_be_visible()
        await step('sign-in merges the guest cart; invalid and shop-specific coupons', merge_and_coupon())

        async def checkout():
            await shopper.get_by_role('link', name='Go to checkout').click()
            await shopper.wait_for_url('**/checkout')
            await expect(shopper.get_by_text('14 Mill Lane')).to_be_visible()              # saved address preselected
            await shopper.get_by_role('button', name='Continue to payment').click()
            await expect(shopper.get_by_role('heading', name='Payment')).to_be_visible()
            await shopper.get_by_label('Name on card').fill('Sam Carter')
            await shopper.get_by_label('Card number').fill('4000000000000002')
            await shopper.get_by_label('Expiry').fill('1234')
            await shopper.get_by_label('Security code').fill('123')
            await shopper.get_by_role('button', name='Pay').click()
            await expect(shopper.get_by_role('alert')).to_contain_text('declined')
            await shopper.get_by_role('button', name='Fill in the test card').click()
            await shopper.get_by_role('button', name='Pay').click()
            await shopper.wait_for_url('**/account/orders/**')
            await expect(shopper.get_by_text('Thank you, your order is placed.')).to_be_visible()
            await expect(shopper.locator('section').filter(has_text='Kettle & Crumb').first).to_be_visible()
            await expect(shopper.locator('section').filter(has_text='Circuit Lane').first).to_be_visible()
            await expect(shopper.get_by_role('button', name='Cart, 0 items')).to_be_visible()
        await step('checkout: declined card, then test card; order splits into one parcel per shop', checkout())

        async def cancel_parcel():
            await shopper.get_by_role('button', name='Cancel parcel').nth(1).click()
            await shopper.get_by_role('dialog').get_by_role('button', name='Cancel parcel').click()
            await expect(shopper.get_by_text('refunded in full')).to_be_visible()
            # The invoice opens in a new tab as a PDF; check the same request the button makes.
            order_id = shopper.url.split('/account/orders/')[1].split('?')[0]
            token = await shopper.evaluate("JSON.parse(localStorage.getItem('awning.session')).token")
            res = await shopper.request.get(f'{BASE}/api/orders/{order_id}/invoice', headers={'Authorization': f'Bearer {token}'})
            body = await res.body()
            assert res.ok and body[:5] == b'%PDF-', 'invoice is not a PDF'
            await expect(shopper.get_by_role('button', name='Invoice (PDF)')).to_be_visible()
        await step('customer cancels one parcel before packing and opens the PDF invoice', cancel_parcel())

        async def vendor_ship():
            await login(maya, 'maya@awning.test')
            await maya.wait_for_url('**/sell')
            await expect(maya.get_by_text('parcels to send')).to_be_visible()
            await maya.goto(f'{BASE}/sell/orders?status=placed')
            card = maya.locator('article').first
            await card.get_by_role('button', name='Mark as packed').click()
            await expect(maya.get_by_text('is now packed')).to_be_visible()
            await maya.goto(f'{BASE}/sell/orders?status=packed')
            card = maya.locator('article').first
            await card.get_by_role('button', name='Mark as shipped').click()
            dialog = maya.get_by_role('dialog')
            await dialog.get_by_label('Carrier').fill('DHL')
            await dialog.get_by_label('Tracking number').fill('JD014600006')
            await dialog.get_by_role('button', name='Mark as shipped').click()
            await expect(maya.get_by_text('is now shipped')).to_be_visible()
        await step('shop owner packs and ships with tracking (lifecycle)', vendor_ship())

        async def vendor_product():
            await maya.goto(f'{BASE}/sell/products/new')
            await maya.get_by_label('Title').fill('Smoke Test Teapot')
            await maya.locator('main').get_by_label('Department').select_option('Home & Kitchen')
            await maya.get_by_label('Brand').fill('Halden')
            await maya.get_by_label('Price', exact=True).fill('42.50')
            await maya.get_by_label('In stock').fill('7')
            await maya.get_by_role('button', name='Save draft').click()
            await maya.wait_for_url(lambda u: '/sell/products/new' not in u)
            await maya.get_by_role('button', name='Put on sale').click()
            await expect(maya.get_by_role('alert').filter(has_text='Add at least one photo')).to_be_visible()
            if PHOTO:
                await maya.locator('input[type=file]').set_input_files(PHOTO)
                await expect(maya.get_by_text('Cover')).to_be_visible()
                await maya.get_by_role('button', name='Put on sale').click()
                await expect(maya.get_by_role('status').filter(has_text='On sale. Shoppers can find it now.')).to_be_visible()
                await shopper.goto(f'{BASE}/search?q=teapot')
                await expect(shopper.get_by_role('heading', level=3, name='Smoke Test Teapot')).to_be_visible()
        await step('shop owner creates a product, uploads a photo, puts it on sale; it is searchable', vendor_product())

        async def admin_flow():
            await login(admin, 'admin@awning.test')
            await admin.wait_for_url('**/admin')
            await expect(admin.get_by_text('Gross sales (GMV)')).to_be_visible()
            await admin.get_by_role('navigation', name='Admin sections').get_by_role('link', name='Shops').click()
            card = admin.locator('article').filter(has_text='Saltwater Supply Co.')
            await card.get_by_role('button', name='Approve').click()
            await expect(admin.get_by_text('Saltwater Supply Co. is open')).to_be_visible()
            await shopper.goto(f'{BASE}/shops')
            await expect(shopper.get_by_role('heading', name='Saltwater Supply Co.')).to_be_visible()
            await admin.get_by_role('navigation', name='Admin sections').get_by_role('link', name='Coupons').click()
            await admin.get_by_role('button', name='New coupon').click()
            dialog = admin.get_by_role('dialog')
            await dialog.get_by_label('Code', exact=True).fill('SMOKE20')
            await dialog.get_by_label('Percent off').fill('20')
            await dialog.get_by_role('button', name='Save coupon').click()
            await expect(admin.get_by_text('SMOKE20')).to_be_visible()
        await step('admin sees analytics, approves a shop (it opens), creates a coupon', admin_flow())

        async def mobile():
            page = await new_page(390, 844)
            await page.goto(f'{BASE}/search?q=mug')
            await page.get_by_role('button', name='Filters').click()
            await expect(page.get_by_role('dialog', name='Filters')).to_be_visible()
            await page.get_by_role('dialog', name='Filters').get_by_role('button', name='Show').click()
            width = await page.evaluate('document.documentElement.scrollWidth')
            assert width <= 390, f'page scrolls sideways ({width}px)'
        await step('phone width: filters drawer works and nothing overflows', mobile())

        await browser.close()
        failed = [r for r in results if not r[1]]
        print(f'\n{len(results) - len(failed)}/{len(results)} journeys passed' + (f'; page errors: {errors[:3]}' if errors else '; no uncaught page errors'))
        sys.exit(1 if failed else 0)

asyncio.run(main())
