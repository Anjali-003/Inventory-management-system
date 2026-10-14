{/*Ye background mein 3 important kaam karta hai:
  1. Live updates receive karta hai: Backend ke SSE connection se changes sunta hai.
  2. Data refresh karwata hai: RTK Query ke relevant cache tags invalidate karta hai, jisse active queries dobara fetch ho sakti hain.
  3. Toast notification dikhata hai: Agar kisi doosre user ne change kiya, to toastRef.current.success(...) ke through notification dikhata hai.*/}

import { BrowserRouter, Routes, Route } from "react-router-dom";

import Layout from "@/components/Layout";
import { ToastProvider } from "@/components/toast";
import LiveSync from "@/realtime/LiveSync";
import Login from "@/features/auth/Login";
import Landing from "@/features/landing/Landing";
import ProtectedRoute from "@/features/auth/ProtectedRoute";
import RequireAccess from "@/features/auth/RequireAccess";
import { LOGIN_PORTALS } from "@/lib/permissions"; // each portal object will have ROLE, PATH, API, and TITLE properties
import { PAGES } from "@/app/routes"; // each page object will have PATH, MODULE, and PAGE properties{ path: "/dashboard", module: "dashboard", Page: Dashboard },


function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          {/* public: landing page, the first thing anyone sees */}
          <Route path="/" element={<Landing />} />

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
            //These are the pages which are to be rendered after successful login only.
            {PAGES.map(({ path, module, Page }) => (
              <Route
                key={path}
                path={path}
                element={
                  <RequireAccess module={module}>
                    <Page />
                  </RequireAccess>
                }
              />
            ))}
          </Route>
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}

export default App;
