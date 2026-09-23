import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ToastProvider } from './contexts/ToastContext.jsx';
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx';
import { EventProvider } from './contexts/EventContext.jsx';
import { SessionProvider } from './contexts/SessionContext.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import { SystemLoader } from './components/ui/States.jsx';
import PublicLayout from './layouts/PublicLayout.jsx';
import PlayLayout from './layouts/PlayLayout.jsx';
import CommandLayout from './layouts/CommandLayout.jsx';

/* Public */
const Landing = lazy(() => import('./pages/Landing.jsx'));
const Login = lazy(() => import('./pages/Login.jsx'));
const NotFound = lazy(() => import('./pages/NotFound.jsx'));
/* Development only: the story intro on its own, for working on its pages */
const IntroPreview = import.meta.env.DEV ? lazy(() => import('./pages/IntroPreview.jsx')) : null;

/* Participant — one screen */
const Investigate = lazy(() => import('./pages/play/Investigate.jsx'));

/* Coordinator — three screens */
const CommandCenter = lazy(() => import('./pages/command/CommandCenter.jsx'));
const Participants = lazy(() => import('./pages/command/Participants.jsx'));
const EventSettings = lazy(() => import('./pages/command/EventSettings.jsx'));
const Answers = lazy(() => import('./pages/command/Answers.jsx'));

function RequireRole({ role, children }) {
  const { status, user } = useAuth();
  const location = useLocation();
  if (status === 'booting') return <SystemLoader label="Checking your credentials" className="min-h-screen" />;
  if (status !== 'authenticated') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (user.role !== role) return <Navigate to={user.role === 'coordinator' ? '/command' : '/play'} replace />;
  return children;
}

function Fallback() {
  return <SystemLoader label="Turning the page" className="min-h-[50vh]" />;
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <EventProvider>
          <ErrorBoundary>
            <Suspense fallback={<Fallback />}>
              <Routes>
                <Route element={<PublicLayout />}>
                  <Route index element={<Landing />} />
                  <Route path="login" element={<Login />} />
                </Route>

                <Route
                  path="play"
                  element={
                    <RequireRole role="participant">
                      <SessionProvider>
                        <PlayLayout />
                      </SessionProvider>
                    </RequireRole>
                  }
                >
                  <Route index element={<Investigate />} />
                  <Route path=":code" element={<Investigate />} />
                </Route>
                {/* old participant links */}
                <Route path="investigation/*" element={<Navigate to="/play" replace />} />

                <Route
                  path="command"
                  element={
                    <RequireRole role="coordinator">
                      <CommandLayout />
                    </RequireRole>
                  }
                >
                  <Route index element={<CommandCenter />} />
                  <Route path="participants" element={<Participants />} />
                  <Route path="settings" element={<EventSettings />} />
                  <Route path="answers" element={<Answers />} />
                  <Route path="*" element={<Navigate to="/command" replace />} />
                </Route>

                {IntroPreview ? <Route path="intro-preview" element={<IntroPreview />} /> : null}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </EventProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
