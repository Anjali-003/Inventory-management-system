import { NavLink, Outlet } from "react-router-dom";

function Layout() {
    return (
      <div className="app-layout">
        <aside className="sidebar">
          <div className="logo">Inventory System</div>

          <nav>
            <NavLink to="/">Dashboard</NavLink>

            <NavLink to="/products">Products</NavLink>

            <NavLink to="/inventory">Inventory</NavLink>

            <NavLink to="/orders">Orders</NavLink>

            <NavLink to="/existing-orders">Existing Orders</NavLink>

            <NavLink to="/production">Production</NavLink>
          </nav>
        </aside>

        <main className="main-content">
          <Outlet />
        </main>
      </div>
    );
}

export default Layout;