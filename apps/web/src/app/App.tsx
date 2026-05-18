import { AuthGate } from '../features/auth/components/auth-gate'
import { AppRouter } from './router'

export function App() {
  return (
    <AuthGate>
      <AppRouter />
    </AuthGate>
  )
}
