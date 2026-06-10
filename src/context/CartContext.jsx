import { createContext, useContext, useReducer, useCallback } from 'react'

const CartContext = createContext(null)

const initialState = {
  items: [],      // [{ id, name, price, image, quantity }]
  isOpen: false,  // drawer open/closed
}

function cartReducer(state, action) {
  switch (action.type) {
    case 'ADD_ITEM': {
      const existing = state.items.find(i => i.id === action.item.id)
      if (existing) {
        return {
          ...state,
          items: state.items.map(i =>
            i.id === action.item.id ? { ...i, quantity: i.quantity + 1 } : i
          ),
        }
      }
      return { ...state, items: [...state.items, { ...action.item, quantity: 1 }] }
    }
    case 'REMOVE_ITEM':
      return { ...state, items: state.items.filter(i => i.id !== action.id) }
    case 'DECREMENT_ITEM': {
      const item = state.items.find(i => i.id === action.id)
      if (!item) return state
      if (item.quantity === 1) {
        return { ...state, items: state.items.filter(i => i.id !== action.id) }
      }
      return {
        ...state,
        items: state.items.map(i =>
          i.id === action.id ? { ...i, quantity: i.quantity - 1 } : i
        ),
      }
    }
    case 'CLEAR_CART':
      return initialState
    case 'OPEN_DRAWER':
      return { ...state, isOpen: true }
    case 'CLOSE_DRAWER':
      return { ...state, isOpen: false }
    default:
      return state
  }
}

export function CartProvider({ children }) {
  const [state, dispatch] = useReducer(cartReducer, initialState)

  const addItem     = useCallback(item => dispatch({ type: 'ADD_ITEM', item }), [])
  const removeItem  = useCallback(id   => dispatch({ type: 'REMOVE_ITEM', id }), [])
  const decrement   = useCallback(id   => dispatch({ type: 'DECREMENT_ITEM', id }), [])
  const clearCart   = useCallback(()   => dispatch({ type: 'CLEAR_CART' }), [])
  const openDrawer  = useCallback(()   => dispatch({ type: 'OPEN_DRAWER' }), [])
  const closeDrawer = useCallback(()   => dispatch({ type: 'CLOSE_DRAWER' }), [])

  const totalItems  = state.items.reduce((sum, i) => sum + i.quantity, 0)
  const totalAmount = state.items.reduce((sum, i) => sum + i.price * i.quantity, 0)

  return (
    <CartContext.Provider value={{
      items: state.items,
      isOpen: state.isOpen,
      totalItems,
      totalAmount,
      addItem,
      removeItem,
      decrement,
      clearCart,
      openDrawer,
      closeDrawer,
    }}>
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used inside CartProvider')
  return ctx
}
