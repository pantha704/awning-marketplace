/**
 * All server state lives in RTK Query: one cache, tag-based refetching and
 * request de-duplication. Components never call fetch directly.
 */
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { signedOut } from './authSlice.js';
import { API_ORIGIN } from '../lib/format.js';
import { cartId } from '../lib/cartId.js';

const rawBaseQuery = fetchBaseQuery({
  baseUrl: `${API_ORIGIN}/api`,
  prepareHeaders: (headers, { getState }) => {
    const token = getState().auth.token;
    if (token) headers.set('Authorization', `Bearer ${token}`);
    headers.set('X-Cart-Id', cartId()); // names the guest cart; ignored once signed in
    return headers;
  },
});

const baseQuery = async (args, store, extra) => {
  const result = await rawBaseQuery(args, store, extra);
  // An expired or revoked session: drop it so the UI returns to signed-out state.
  if (result.error?.status === 401 && store.getState().auth.token && !String(args?.url || args).startsWith('/auth/login')) store.dispatch(signedOut());
  return result;
};

const post = (url, body) => ({ url, method: 'POST', body });
const patch = (url, body) => ({ url, method: 'PATCH', body });
const put = (url, body) => ({ url, method: 'PUT', body });
const del = (url) => ({ url, method: 'DELETE' });

/** Every cart mutation answers with the freshly priced cart; write it straight into the cache. */
const cartWrite = (query) => ({
  query,
  async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
    try {
      const { data } = await queryFulfilled;
      dispatch(api.util.updateQueryData('getCart', undefined, (draft) => { Object.assign(draft, data); }));
    } catch { /* the component shows the error */ }
  },
});

export const api = createApi({
  reducerPath: 'api',
  baseQuery,
  tagTypes: ['Me', 'Addresses', 'Home', 'Search', 'Product', 'Reviews', 'Shop', 'Cart', 'Orders', 'Order', 'Payments',
    'MyShop', 'VendorDash', 'VendorProducts', 'VendorProduct', 'VendorOrders', 'Payouts', 'VendorCoupons', 'VendorReviews',
    'AdminAnalytics', 'AdminVendors', 'AdminUsers', 'AdminOrders', 'AdminCoupons', 'AdminProducts'],
  keepUnusedDataFor: 120,
  refetchOnReconnect: true,
  endpoints: (b) => ({
    /* Account */
    login: b.mutation({ query: (body) => post('/auth/login', body) }),
    register: b.mutation({ query: (body) => post('/auth/register', body) }),
    me: b.query({ query: () => '/auth/me', providesTags: ['Me'] }),
    updateProfile: b.mutation({ query: (body) => patch('/auth/me', body), invalidatesTags: ['Me'] }),
    changePassword: b.mutation({ query: (body) => post('/auth/password', body) }),
    getAddresses: b.query({ query: () => '/auth/addresses', providesTags: ['Addresses'] }),
    addAddress: b.mutation({ query: (body) => post('/auth/addresses', body), invalidatesTags: ['Addresses'] }),
    updateAddress: b.mutation({ query: ({ id, ...body }) => patch(`/auth/addresses/${id}`, body), invalidatesTags: ['Addresses'] }),
    deleteAddress: b.mutation({ query: (id) => del(`/auth/addresses/${id}`), invalidatesTags: ['Addresses'] }),

    /* Catalog */
    getHome: b.query({ query: () => '/catalog/home', providesTags: ['Home'] }),
    getMeta: b.query({ query: () => '/catalog/meta' }),
    search: b.query({ query: (params) => ({ url: '/catalog/search', params }), providesTags: ['Search'], keepUnusedDataFor: 60 }),
    suggest: b.query({ query: (q) => ({ url: '/catalog/suggest', params: { q } }), keepUnusedDataFor: 30 }),
    getProduct: b.query({ query: (slug) => `/catalog/products/${slug}`, providesTags: (_r, _e, slug) => [{ type: 'Product', id: slug }, 'Product'] }),
    getReviews: b.query({ query: ({ productId, page = 1 }) => ({ url: `/catalog/products/${productId}/reviews`, params: { page } }), providesTags: (_r, _e, { productId }) => [{ type: 'Reviews', id: productId }] }),
    postReview: b.mutation({ query: ({ productId, ...body }) => post(`/catalog/products/${productId}/reviews`, body), invalidatesTags: (_r, _e, { productId }) => [{ type: 'Reviews', id: productId }, 'Product', 'Search', 'Home'] }),
    getShops: b.query({ query: () => '/catalog/shops', providesTags: ['Shop'] }),
    getShop: b.query({ query: (slug) => `/catalog/shops/${slug}`, providesTags: ['Shop'] }),

    /* Cart and checkout */
    getPaymentConfig: b.query({ query: () => '/payments/config', keepUnusedDataFor: 3600 }),
    getCart: b.query({ query: () => '/cart', providesTags: ['Cart'] }),
    addToCart: b.mutation(cartWrite(({ productId, qty = 1 }) => post('/cart/items', { productId, qty }))),
    setCartQty: b.mutation({
      ...cartWrite(({ productId, qty }) => patch(`/cart/items/${productId}`, { qty })),
      // Move the number first; the server's priced cart replaces it a moment later.
      async onQueryStarted({ productId, qty }, { dispatch, queryFulfilled }) {
        const undo = dispatch(api.util.updateQueryData('getCart', undefined, (draft) => {
          const line = draft.cart?.lines.find((l) => l.productId === productId);
          if (line) { line.qty = qty; line.lineTotal = line.price * qty; }
        }));
        try {
          const { data } = await queryFulfilled;
          dispatch(api.util.updateQueryData('getCart', undefined, (draft) => { Object.assign(draft, data); }));
        } catch { undo.undo(); }
      },
    }),
    removeFromCart: b.mutation({
      query: (productId) => del(`/cart/items/${productId}`),
      async onQueryStarted(productId, { dispatch, queryFulfilled }) {
        const undo = dispatch(api.util.updateQueryData('getCart', undefined, (draft) => {
          if (draft.cart) draft.cart.lines = draft.cart.lines.filter((l) => l.productId !== productId);
        }));
        try {
          const { data } = await queryFulfilled;
          dispatch(api.util.updateQueryData('getCart', undefined, (draft) => { Object.assign(draft, data); }));
        } catch { undo.undo(); }
      },
    }),
    applyCoupon: b.mutation(cartWrite((code) => put('/cart/coupon', { code }))),
    removeCoupon: b.mutation(cartWrite(() => del('/cart/coupon'))),
    checkout: b.mutation({ query: (body) => post('/orders/checkout', body), invalidatesTags: ['Addresses'] }),
    payTest: b.mutation({ query: ({ orderId, ...card }) => post(`/payments/test/${orderId}/pay`, card), invalidatesTags: (r) => (r ? ['Cart', 'Orders', 'Search', 'Home', 'Product'] : []) }),
    cancelPayment: b.mutation({ query: (orderId) => post(`/payments/cancel/${orderId}`), invalidatesTags: ['Search', 'Product'] }),
    verifyStripe: b.query({ query: (sessionId) => ({ url: '/payments/stripe/verify', params: { session_id: sessionId } }) }),
    verifyRazorpay: b.mutation({ query: (body) => post('/payments/razorpay/verify', body), invalidatesTags: ['Cart', 'Orders'] }),
    resumePayment: b.mutation({ query: (orderId) => post(`/orders/${orderId}/pay`) }),

    /* Customer orders */
    getOrders: b.query({ query: (page = 1) => ({ url: '/orders', params: { page } }), providesTags: ['Orders'] }),
    getOrder: b.query({ query: (id) => `/orders/${id}`, providesTags: (_r, _e, id) => [{ type: 'Order', id }] }),
    cancelParcel: b.mutation({ query: ({ orderId, parcelId }) => post(`/orders/${orderId}/parcels/${parcelId}/cancel`), invalidatesTags: (_r, _e, { orderId }) => [{ type: 'Order', id: orderId }, 'Orders', 'Search', 'Product'] }),

    /* Shop owner */
    getMyShop: b.query({ query: () => '/vendor/me', providesTags: ['MyShop'] }),
    applyShop: b.mutation({ query: (body) => post('/vendor/apply', body), invalidatesTags: ['MyShop', 'Me'] }),
    updateShop: b.mutation({ query: (body) => patch('/vendor/me', body), invalidatesTags: ['MyShop', 'Me', 'Shop', 'Home'] }),
    uploadLogo: b.mutation({ query: (file) => { const body = new FormData(); body.append('image', file); return { url: '/vendor/logo', method: 'POST', body }; }, invalidatesTags: ['MyShop', 'Shop', 'Home'] }),
    getVendorDashboard: b.query({ query: (days) => ({ url: '/vendor/dashboard', params: { days } }), providesTags: ['VendorDash'] }),
    getVendorProducts: b.query({ query: (params) => ({ url: '/vendor/products', params }), providesTags: ['VendorProducts'] }),
    getVendorProduct: b.query({ query: (id) => `/vendor/products/${id}`, providesTags: (_r, _e, id) => [{ type: 'VendorProduct', id }] }),
    createProduct: b.mutation({ query: (body) => post('/vendor/products', body), invalidatesTags: ['VendorProducts', 'VendorDash'] }),
    updateProduct: b.mutation({ query: ({ id, ...body }) => patch(`/vendor/products/${id}`, body), invalidatesTags: (_r, _e, { id }) => [{ type: 'VendorProduct', id }, 'VendorProducts', 'VendorDash', 'Search', 'Home', 'Product'] }),
    deleteProduct: b.mutation({ query: (id) => del(`/vendor/products/${id}`), invalidatesTags: ['VendorProducts', 'VendorDash', 'Search', 'Home'] }),
    uploadProductImages: b.mutation({
      query: ({ id, files }) => { const body = new FormData(); files.forEach((f) => body.append('images', f)); return { url: `/vendor/products/${id}/images`, method: 'POST', body }; },
      invalidatesTags: (_r, _e, { id }) => [{ type: 'VendorProduct', id }, 'VendorProducts', 'Search', 'Home', 'Product'],
    }),
    setProductImages: b.mutation({ query: ({ id, keys }) => put(`/vendor/products/${id}/images`, { keys }), invalidatesTags: (_r, _e, { id }) => [{ type: 'VendorProduct', id }, 'VendorProducts', 'Search', 'Home', 'Product'] }),
    getVendorOrders: b.query({ query: (params) => ({ url: '/vendor/orders', params }), providesTags: ['VendorOrders'] }),
    advanceParcel: b.mutation({ query: ({ orderId, ...body }) => post(`/vendor/orders/${orderId}/advance`, body), invalidatesTags: ['VendorOrders', 'VendorDash', 'Payouts'] }),
    vendorCancelParcel: b.mutation({ query: ({ orderId, note }) => post(`/vendor/orders/${orderId}/cancel`, { note }), invalidatesTags: ['VendorOrders', 'VendorDash', 'Payouts', 'VendorProducts'] }),
    getPayouts: b.query({ query: () => '/vendor/payouts', providesTags: ['Payouts'] }),
    connectPayouts: b.mutation({ query: (body = {}) => post('/vendor/payouts/connect', body), invalidatesTags: ['Payouts', 'MyShop'] }),
    getVendorCoupons: b.query({ query: () => '/vendor/coupons', providesTags: ['VendorCoupons'] }),
    saveVendorCoupon: b.mutation({ query: ({ id, ...body }) => (id ? patch(`/vendor/coupons/${id}`, body) : post('/vendor/coupons', body)), invalidatesTags: ['VendorCoupons'] }),
    deleteVendorCoupon: b.mutation({ query: (id) => del(`/vendor/coupons/${id}`), invalidatesTags: ['VendorCoupons'] }),
    getVendorReviews: b.query({ query: () => '/vendor/reviews', providesTags: ['VendorReviews'] }),
    replyReview: b.mutation({ query: ({ id, body }) => put(`/vendor/reviews/${id}/reply`, { body }), invalidatesTags: ['VendorReviews', 'Reviews'] }),

    /* Admin */
    getAnalytics: b.query({ query: (days) => ({ url: '/admin/analytics', params: { days } }), providesTags: ['AdminAnalytics'] }),
    getAdminVendors: b.query({ query: (status) => ({ url: '/admin/vendors', params: status ? { status } : {} }), providesTags: ['AdminVendors'] }),
    updateAdminVendor: b.mutation({ query: ({ id, ...body }) => patch(`/admin/vendors/${id}`, body), invalidatesTags: ['AdminVendors', 'AdminAnalytics', 'Search', 'Home', 'Shop'] }),
    getAdminUsers: b.query({ query: (params) => ({ url: '/admin/users', params }), providesTags: ['AdminUsers'] }),
    updateAdminUser: b.mutation({ query: ({ id, ...body }) => patch(`/admin/users/${id}`, body), invalidatesTags: ['AdminUsers'] }),
    getAdminOrders: b.query({ query: (params) => ({ url: '/admin/orders', params }), providesTags: ['AdminOrders'] }),
    adminAdvance: b.mutation({ query: ({ orderId, parcelId, ...body }) => post(`/admin/orders/${orderId}/parcels/${parcelId}/advance`, body), invalidatesTags: ['AdminOrders', 'AdminAnalytics'] }),
    adminCancel: b.mutation({ query: ({ orderId, parcelId }) => post(`/admin/orders/${orderId}/parcels/${parcelId}/cancel`), invalidatesTags: ['AdminOrders', 'AdminAnalytics'] }),
    getAdminCoupons: b.query({ query: () => '/admin/coupons', providesTags: ['AdminCoupons'] }),
    saveAdminCoupon: b.mutation({ query: ({ id, ...body }) => (id ? patch(`/admin/coupons/${id}`, body) : post('/admin/coupons', body)), invalidatesTags: ['AdminCoupons'] }),
    deleteAdminCoupon: b.mutation({ query: (id) => del(`/admin/coupons/${id}`), invalidatesTags: ['AdminCoupons'] }),
    getAdminProducts: b.query({ query: (params) => ({ url: '/admin/products', params }), providesTags: ['AdminProducts'] }),
    updateAdminProduct: b.mutation({ query: ({ id, ...body }) => patch(`/admin/products/${id}`, body), invalidatesTags: ['AdminProducts', 'Search', 'Home'] }),
  }),
});

export const {
  useLoginMutation, useRegisterMutation, useMeQuery, useUpdateProfileMutation, useChangePasswordMutation,
  useGetAddressesQuery, useAddAddressMutation, useUpdateAddressMutation, useDeleteAddressMutation,
  useGetHomeQuery, useGetMetaQuery, useSearchQuery, useSuggestQuery, useGetProductQuery, useGetReviewsQuery, usePostReviewMutation, useGetShopsQuery, useGetShopQuery,
  useGetPaymentConfigQuery, useGetCartQuery, useAddToCartMutation, useSetCartQtyMutation, useRemoveFromCartMutation, useApplyCouponMutation, useRemoveCouponMutation,
  useCheckoutMutation, usePayTestMutation, useCancelPaymentMutation, useVerifyStripeQuery, useVerifyRazorpayMutation, useResumePaymentMutation,
  useGetOrdersQuery, useGetOrderQuery, useCancelParcelMutation,
  useGetMyShopQuery, useApplyShopMutation, useUpdateShopMutation, useUploadLogoMutation, useGetVendorDashboardQuery, useGetVendorProductsQuery, useGetVendorProductQuery,
  useCreateProductMutation, useUpdateProductMutation, useDeleteProductMutation, useUploadProductImagesMutation, useSetProductImagesMutation,
  useGetVendorOrdersQuery, useAdvanceParcelMutation, useVendorCancelParcelMutation, useGetPayoutsQuery, useConnectPayoutsMutation,
  useGetVendorCouponsQuery, useSaveVendorCouponMutation, useDeleteVendorCouponMutation, useGetVendorReviewsQuery, useReplyReviewMutation,
  useGetAnalyticsQuery, useGetAdminVendorsQuery, useUpdateAdminVendorMutation, useGetAdminUsersQuery, useUpdateAdminUserMutation,
  useGetAdminOrdersQuery, useAdminAdvanceMutation, useAdminCancelMutation, useGetAdminCouponsQuery, useSaveAdminCouponMutation, useDeleteAdminCouponMutation,
  useGetAdminProductsQuery, useUpdateAdminProductMutation,
} = api;
