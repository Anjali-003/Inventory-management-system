// import { NavLink, Outlet } from "react-router-dom";
// import { useNavigate } from "react-router-dom";
// import api from "../api/api";

// function Layout() {
//     return (
      
//       <div className="app-layout">
//         <aside className="sidebar">
//           <div className="logo">Inventory System</div>

//           <nav>
//             <NavLink to="/">Dashboard</NavLink>

//             <NavLink to="/products">Products</NavLink>

//             <NavLink to="/inventory">Inventory</NavLink>

//             <NavLink to="/orders">Orders</NavLink>

//             <NavLink to="/existing-orders">Existing Orders</NavLink>

//             <NavLink to="/production">Production</NavLink>
//           </nav>
//         </aside>

//         <main className="main-content">
//           <Outlet />
//         </main>
//       </div>
//     );
// }

// export default Layout;


import { NavLink, Outlet, useNavigate } from "react-router-dom";
import api from "../api/api";

function Layout() {

    const navigate = useNavigate();

    const handleLogout = async () => {

        try {

            await api.post(
                "/auth/logout"
            );

            navigate("/login");

        } catch (error) {

            console.error(error);

        }

    };

    return (
        <div className="app-layout">

            <aside className="sidebar">

                <div className="logo">
                    Inventory System
                </div>

                <nav>

                    <NavLink to="/">
                        Dashboard
                    </NavLink>

                    <NavLink to="/products">
                        Products
                    </NavLink>

                    <NavLink to="/inventory">
                        Inventory
                    </NavLink>

                    <NavLink to="/orders">
                        Orders
                    </NavLink>

                    <NavLink to="/existing-orders">
                        Existing Orders
                    </NavLink>

                    <NavLink to="/production">
                        Production
                    </NavLink>

                    <button
                        onClick={handleLogout}
                    >
                        Logout
                    </button>

                </nav>

            </aside>

            <main className="main-content">

                <Outlet />

            </main>

        </div>
    );
}

export default Layout;


// The only structural change is that `useNavigate()` and `handleLogout()` are now **inside `Layout()`**, and the Logout button is inside the sidebar navigation.
