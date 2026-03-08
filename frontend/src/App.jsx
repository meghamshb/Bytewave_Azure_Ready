import { Suspense, lazy } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { ThemeProvider } from './hooks/ThemeContext'
import { AuthProvider, useAuth } from './hooks/useAuth'
import LearnLayout from './components/LearnLayout'
import PhysicsLoader from './components/PhysicsLoader'

// Code-split every screen — only the current route's chunk is loaded
const Landing    = lazy(() => import('./screens/Landing'))
const Auth       = lazy(() => import('./screens/Auth'))
const Home       = lazy(() => import('./screens/Home'))
const SkillMap   = lazy(() => import('./screens/SkillMap'))
const ChooseCase = lazy(() => import('./screens/ChooseCase'))
const Assess     = lazy(() => import('./screens/Assess'))
const Feedback   = lazy(() => import('./screens/Feedback'))
const Chat       = lazy(() => import('./screens/Chat'))
const Forum      = lazy(() => import('./screens/Forum'))
const ForumPost  = lazy(() => import('./screens/ForumPost'))
const NotFound   = lazy(() => import('./screens/NotFound'))

function PageFallback() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'var(--primary-bg)', gap: 0,
      animation: 'pageFallbackIn 0.3s ease 400ms both',
    }}>
      <div style={{
        fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700,
        color: 'var(--primary-text)', letterSpacing: '-0.03em',
        marginBottom: 4, opacity: 0.5,
      }}>Byte Wave</div>
      <PhysicsLoader label="Loading…" />
      <style>{`
        @keyframes pageFallbackIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>
    </div>
  )
}

/**
 * ProtectedRoute — redirects to /auth if not signed in.
 * Guests (continueAsGuest) are also allowed — the gate only blocks
 * completely unauthenticated visitors.
 */
function ProtectedRoute({ children }) {
  const { user } = useAuth()
  const location = useLocation()
  // Preserve any existing state (e.g. fromAuth) when redirecting back after login
  if (!user) return <Navigate to="/auth" state={{ from: location }} replace />
  return children
}

/** Redirect /auth → /learn if user is already signed in */
function AuthRedirect({ children }) {
  const { user } = useAuth()
  if (user) return <Navigate to="/learn" replace />
  return children
}

function AppRoutes() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        {/* Public */}
        <Route path="/"    element={<Landing />} />
        <Route path="/auth" element={<AuthRedirect><Auth /></AuthRedirect>} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/forum" element={<Forum />} />
        <Route path="/forum/:postId" element={<ForumPost />} />

        {/* Protected — requires sign-in or guest session */}
        <Route path="/learn" element={<ProtectedRoute><LearnLayout /></ProtectedRoute>}>
          <Route index element={<Home />} />
          <Route path="skill-map" element={<SkillMap />} />
          <Route path="choose-case" element={<ChooseCase />} />
          <Route path="assess/:caseId" element={<Assess />} />
          <Route path="feedback" element={<Feedback />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </ThemeProvider>
  )
}
