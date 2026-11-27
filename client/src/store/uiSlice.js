import { createSlice, nanoid } from '@reduxjs/toolkit';

const uiSlice = createSlice({
  name: 'ui',
  initialState: { toasts: [], cartOpen: false, cartBump: 0 },
  reducers: {
    toastAdded: {
      reducer(state, { payload }) { state.toasts = [...state.toasts.slice(-3), payload]; },
      prepare: (toast) => ({ payload: { id: nanoid(6), type: 'info', ...toast } }),
    },
    toastDismissed(state, { payload }) { state.toasts = state.toasts.filter((t) => t.id !== payload); },
    cartOpened(state) { state.cartOpen = true; },
    cartClosed(state) { state.cartOpen = false; },
    cartBumped(state) { state.cartBump += 1; },
  },
});

export const { toastAdded, toastDismissed, cartOpened, cartClosed, cartBumped } = uiSlice.actions;
export default uiSlice.reducer;

export const toast = {
  success: (message) => toastAdded({ type: 'success', message }),
  error: (message) => toastAdded({ type: 'error', message }),
  info: (message) => toastAdded({ type: 'info', message }),
};
