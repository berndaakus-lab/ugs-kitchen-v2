import '../styles/globals.css'
import { CartProvider } from '../context/CartContext'
import { BranchProvider } from '../context/BranchContext'

export default function App({ Component, pageProps }) {
  return (
    <BranchProvider>
      <CartProvider>
        <Component {...pageProps} />
      </CartProvider>
    </BranchProvider>
  )
}
