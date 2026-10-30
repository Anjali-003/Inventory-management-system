{/*Ye background mein 3 important kaam karta hai:
  1. Live updates receive karta hai: Backend ke SSE connection se changes sunta hai.
  2. Data refresh karwata hai: RTK Query ke relevant cache tags invalidate karta hai, jisse active queries dobara fetch ho sakti hain.
  3. Toast notification dikhata hai: Agar kisi doosre user ne change kiya, to toastRef.current.success(...) ke through notification dikhata hai.*/}

import { Suspense, lazy, useEffect } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { MotionConfig } from "motion/react";

import Layout from "@/components/Layout";
import ErrorBoundary from "@/components/ErrorBoundary";
import { ToastProvider } from "@/components/toast";
import LiveSync from "@/realtime/LiveSync";
import Login from "@/core/auth/Login";
import ProtectedRoute from "@/core/auth/ProtectedRoute";
import RequireAccess from "@/core/auth/RequireAccess";
import { LOGIN_PORTALS } from "@/lib/permissions"; // each portal object will have ROLE, PATH, API, and TITLE properties
import { useResponsiveTables } from "@/lib/responsiveTables";
import { setPageTitle } from "@/lib/pageTitle";
import { PAGES } from "@/app/routes"; // { path, module, Page, title } per page

// loaded on demand like the pages: someone opening a login page never downloads the home page's animations
const Landing = lazy(() => import("@/core/landing/Landing"));
const NotFound = lazy(() => import("@/core/not-found/NotFound"));
const About = lazy(() => import("@/core/site/About"));
const Contact = lazy(() => import("@/core/site/Contact"));

/* Shown for the moment a page's code is being downloaded. */
function PageLoading() {
  return (
    <div role="status" className="flex min-h-[50vh] items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" aria-hidden /> Loading...
    </div>
  );
}

/* Every page: its own crash guard (cleared when the URL changes) around the on-demand code download. */
function PageFrame({ children }) {
  const { pathname } = useLocation();
  return (
    <ErrorBoundary resetKey={pathname}>
      <Suspense fallback={<PageLoading />}>{children}</Suspense>
    </ErrorBoundary>
  );
}

/* Names the browser tab after the page on screen: "Incoming orders · Sensation Systems" (see lib/pageTitle.js). */
const TITLES = {
  "/": "Electronics production and inventory",
  "/about": "About us",
  "/contact": "Contact us",
  ...Object.fromEntries(Object.values(LOGIN_PORTALS).map((p) => [p.path, p.title])),
  ...Object.fromEntries(PAGES.map((p) => [p.path, p.title])),
};
function TitleSync() {
  const { pathname } = useLocation();
  useEffect(() => {
    const path = pathname.replace(/\/+$/, "") || "/";
    setPageTitle(TITLES[path] ?? "Page not found");
  }, [pathname]);
  return null;
}

function App() {
  useResponsiveTables(); // phones: every table row becomes a card
  return (
    // every animation in the app follows the OS "reduce motion" setting
    <ErrorBoundary>
    <MotionConfig reducedMotion="user">
    <ToastProvider>
      <BrowserRouter>
        <TitleSync />
        <Routes>
          {/* public: landing page, the first thing anyone sees */}
          <Route path="/" element={<PageFrame><Landing /></PageFrame>} />
          <Route path="/about" element={<PageFrame><About /></PageFrame>} />
          <Route path="/contact" element={<PageFrame><Contact /></PageFrame>} />

          {/* public: one login page per role (/login = super admin, /store-manager/login ...) */}
          {/*.map() 4 routes banata hai;*/}
          {Object.values(LOGIN_PORTALS).map((portal) => (
            <Route key={portal.path} path={portal.path} element={<Login portal={portal} />} />
          ))}

          {/* protected: every page is wrapped in a permission check (see app/routes.jsx) */}      
          <Route
            element={
              <ProtectedRoute>
                <LiveSync /> 
                <Layout />
              </ProtectedRoute>
            }
          >
            {/* These are the pages which are to be rendered after successful login only. */}
            {PAGES.map(({ path, module, Page }) => (
              <Route
                key={path}
                path={path}
                element={
                  <RequireAccess module={module}>
                    <PageFrame>
                      <Page />
                    </PageFrame>
                  </RequireAccess>
                }
              />
            ))}
          </Route>

          {/* any other address: a real "page not found", not a blank screen */}
          <Route path="*" element={<PageFrame><NotFound /></PageFrame>} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
    </MotionConfig>
    </ErrorBoundary>
  );
}

export default App;
