import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { Provider } from 'react-redux'
import { store } from './app/store'
import App from './App.jsx'
import { LOGIN_PORTALS, setActiveRole } from './lib/permissions'

// A click on a phone / desktop notification opens ?as=ROLE (public/sw.js): this tab works as that role.
// The role's own login cookie is still required, so this only picks which of the logged-in roles to use.
{
  const url = new URL(window.location.href)
  const as = (url.searchParams.get('as') || '').toUpperCase()
  if (as) {
    if (LOGIN_PORTALS[as]) setActiveRole(as)
    url.searchParams.delete('as')
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
  }
}

// Push notifications already allowed here: register the service worker on every load, so the browser also picks up
// a new version of public/sw.js right away (see lib/push.js).
if ('serviceWorker' in navigator && 'Notification' in window && Notification.permission === 'granted') {
  navigator.serviceWorker.register('/sw.js').then((reg) => reg.update()).catch(() => {})
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </StrictMode>,
)
