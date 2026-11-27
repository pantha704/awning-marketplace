import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import Layout from './components/Layout.jsx';
import Toasts from './components/Toasts.jsx';
import CartDrawer from './components/CartDrawer.jsx';
import { PageLoader } from './components/ui.jsx';
import { selectToken, selectUser, userUpdated } from './store/authSlice.js';
import { useMeQuery, useGetPaymentConfigQuery } from './store/api.js';
import { setCurrency } from './lib/format.js';
import Home from './pages/Home.jsx';
import SearchPage from './pages/Search.jsx';
import ProductPage from './pages/Product.jsx';

// The storefront ships in the first bundle; everything behind sign-in is split out.
const lazyNamed = (loader, name) => lazy(() => loader().then((m) => ({ default: m[name] })));
const Login = lazyNamed(() => import('./pages/Auth.jsx'), 'Login');
const Register = lazyNamed(() => import('./pages/Auth.jsx'), 'Register');
const NotFound = lazyNamed(() => import('./pages/Auth.jsx'), 'NotFound');
const ShopsPage = lazyNamed(() => import('./pages/Shops.jsx'), 'ShopsPage');
const ShopPage = lazyNamed(() => import('./pages/Shops.jsx'), 'ShopPage');
const Cart = lazy(() => import('./pages/Cart.jsx'));
const Checkout = lazy(() => import('./pages/Checkout.jsx'));
const CheckoutReturn = lazy(() => import('./pages/CheckoutReturn.jsx'));
const Account = lazy(() => import('./pages/account/Account.jsx'));
const OrdersPage = lazyNamed(() => import('./pages/account/Orders.jsx'), 'OrdersPage');
const OrderPage = lazyNamed(() => import('./pages/account/Orders.jsx'), 'OrderPage');
const VendorShell = lazy(() => import('./pages/vendor/Shell.jsx'));
const VendorOverview = lazy(() => import('./pages/vendor/Overview.jsx'));
const ProductsList = lazyNamed(() => import('./pages/vendor/Products.jsx'), 'ProductsList');
const ProductEditor = lazyNamed(() => import('./pages/vendor/Products.jsx'), 'ProductEditor');
const VendorOrders = lazy(() => import('./pages/vendor/Orders.jsx'));
const VendorPayouts = lazy(() => import('./pages/vendor/Payouts.jsx'));
const VendorCoupons = lazyNamed(() => import('./pages/vendor/Misc.jsx'), 'VendorCoupons');
const VendorReviews = lazyNamed(() => import('./pages/vendor/Misc.jsx'), 'VendorReviews');
const VendorSettings = lazyNamed(() => import('./pages/vendor/Misc.jsx'), 'VendorSettings');
const AdminShell = lazyNamed(() => import('./pages/admin/Admin.jsx'), 'AdminShell');
const Analytics = lazyNamed(() => import('./pages/admin/Admin.jsx'), 'Analytics');
const AdminShops = lazyNamed(() => import('./pages/admin/Admin.jsx'), 'Shops');
const AdminOrders = lazyNamed(() => import('./pages/admin/Admin.jsx'), 'Orders');
const AdminProducts = lazyNamed(() => import('./pages/admin/Admin.jsx'), 'Products');
const AdminCoupons = lazyNamed(() => import('./pages/admin/Admin.jsx'), 'Coupons');
const AdminPeople = lazyNamed(() => import('./pages/admin/Admin.jsx'), 'People');

function RequireAuth({ roles, children }) {
  const user = useSelector(selectUser);
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location, reason: location.pathname === '/checkout' ? 'Sign in to check out. Your cart comes with you.' : undefined }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

/** Keeps the stored profile fresh (role changes, shop approval) and reads the shop's currency once. */
function Sync() {
  const token = useSelector(selectToken);
  const dispatch = useDispatch();
  const { data } = useMeQuery(undefined, { skip: !token, refetchOnFocus: true });
  const pay = useGetPaymentConfigQuery();
  useEffect(() => { if (data?.user) dispatch(userUpdated(data.user)); }, [data, dispatch]);
  useEffect(() => { if (pay.data?.currency) setCurrency(pay.data.currency); }, [pay.data]);
  return null;
}

export default function App() {
  const pay = useGetPaymentConfigQuery();
  if (pay.data?.currency) setCurrency(pay.data.currency); // before the first price renders
  return (
    <>
      <Sync />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="search" element={<SearchPage />} />
            <Route path="p/:slug" element={<ProductPage />} />
            <Route path="shops" element={<ShopsPage />} />
            <Route path="shops/:slug" element={<ShopPage />} />
            <Route path="cart" element={<Cart />} />
            <Route path="login" element={<Login />} />
            <Route path="register" element={<Register />} />
            <Route path="checkout" element={<RequireAuth><Checkout /></RequireAuth>} />
            <Route path="checkout/return" element={<RequireAuth><CheckoutReturn /></RequireAuth>} />
            <Route path="account" element={<RequireAuth><Account /></RequireAuth>} />
            <Route path="account/orders" element={<RequireAuth><OrdersPage /></RequireAuth>} />
            <Route path="account/orders/:id" element={<RequireAuth><OrderPage /></RequireAuth>} />
            <Route path="sell" element={<RequireAuth roles={['vendor']}><VendorShell /></RequireAuth>}>
              <Route index element={<VendorOverview />} />
              <Route path="products" element={<ProductsList />} />
              <Route path="products/:id" element={<ProductEditor />} />
              <Route path="orders" element={<VendorOrders />} />
              <Route path="payouts" element={<VendorPayouts />} />
              <Route path="coupons" element={<VendorCoupons />} />
              <Route path="reviews" element={<VendorReviews />} />
              <Route path="settings" element={<VendorSettings />} />
            </Route>
            <Route path="admin" element={<RequireAuth roles={['admin']}><AdminShell /></RequireAuth>}>
              <Route index element={<Analytics />} />
              <Route path="shops" element={<AdminShops />} />
              <Route path="orders" element={<AdminOrders />} />
              <Route path="products" element={<AdminProducts />} />
              <Route path="coupons" element={<AdminCoupons />} />
              <Route path="people" element={<AdminPeople />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </Suspense>
      <CartDrawer />
      <Toasts />
    </>
  );
}
