import { useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { useAddToCartMutation } from '../store/api.js';
import { toast, cartOpened, cartBumped } from '../store/uiSlice.js';
import { errorMessage } from '../lib/format.js';

/** Add to cart, then open the cart drawer so the shopper sees it landed. Guests can add without signing in. */
export function useAddToCart() {
  const dispatch = useDispatch();
  const [add, state] = useAddToCartMutation();
  const addToCart = useCallback(async (productId, qty = 1, { open = true } = {}) => {
    try {
      await add({ productId, qty }).unwrap();
      dispatch(cartBumped());
      if (open) dispatch(cartOpened());
      return true;
    } catch (err) {
      dispatch(toast.error(errorMessage(err)));
      return false;
    }
  }, [add, dispatch]);
  return { addToCart, adding: state.isLoading, addingId: state.originalArgs?.productId };
}
