import '../styles/globals.css'
import { CartProvider }   from '../context/CartContext'
import { BranchProvider } from '../context/BranchContext'
import { AuthProvider }   from '../context/AuthContext'

export default function App({ Component, pageProps }) {
  return (
    <AuthProvider>
      <BranchProvider>
        <CartProvider>
          <Component {...pageProps} />
        </CartProvider>
      </BranchProvider>
    </AuthProvider>
  )
}
