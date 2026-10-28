/*
  renderApp(<Page />, { role: "MARKETING_MANAGER", route: "/marketing-orders" })

  Renders a screen the way the app does (the store, the router, toasts), as the given role, against the fake API.
  A screen that crashes does not throw here: the error is caught and kept, so a test can say
  `expect(view.crash()).toBeNull()` and print what broke.
*/
import { Component, Suspense } from "react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { render } from "@testing-library/react";
import { store } from "@/app/store";
import { ToastProvider } from "@/components/toast";
import { setActiveRole } from "@/lib/permissions";
import { setRole } from "./fakeApi";

class CatchCrash extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error) {
    this.props.onCrash(error);
  }
  render() {
    return this.state.error ? <p>crashed</p> : this.props.children;
  }
}

export function renderApp(ui, { role = "SUPER_ADMIN", route = "/" } = {}) {
  setRole(role); // the answers a test set with respond() stay
  setActiveRole(role);
  let crash = null;
  const view = render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[route]}>
        <ToastProvider>
          <CatchCrash onCrash={(e) => { crash = e; }}>
            <Suspense fallback={<p>loading page</p>}>{ui}</Suspense>
          </CatchCrash>
        </ToastProvider>
      </MemoryRouter>
    </Provider>
  );
  return { ...view, crash: () => crash };
}
