import { useEffect, useState } from "react";
import api from "../api/api";

function Dashboard() {

    const [products, setProducts] = useState([]);
    const [inventory, setInventory] = useState([]);
    const [orders, setOrders] = useState([]);

    useEffect(() => {

        const loadDashboard = async () => {

            try {

                const [
                    productsResponse,
                    inventoryResponse,
                    ordersResponse
                ] = await Promise.all([
                    api.get("/products"),
                    api.get("/inventory"),
                    api.get("/orders")
                ]);

                setProducts(
                    productsResponse.data
                );

                setInventory(
                    inventoryResponse.data
                );

                setOrders(
                    ordersResponse.data
                );

            } catch (error) {

                console.error(error);

            }
        };

        loadDashboard();

    }, []);

    const lowStockItems =
        inventory.filter(
            item =>
                Number(item.available) <=
                Number(item.minimum_stock_level)
        );

    return (

        <div>

            <h1>Dashboard</h1>

            <p>Production and inventory overview</p>


            <div className="stats-grid">

                <div className="stat-card">
                    <h3>Products</h3>
                    <p>{products.length}</p>
                </div>

                <div className="stat-card">
                    <h3>Orders</h3>
                    <p>{orders.length}</p>
                </div>

                <div className="stat-card">
                    <h3>Low Stock</h3>
                    <p>{lowStockItems.length}</p>
                </div>

            </div>


            <div className="table-container">

                <h2>Low Stock Components</h2>

                {lowStockItems.length === 0 ? (

                    <p>No low-stock components.</p>

                ) : (

                    <table>

                        <thead>

                            <tr>
                                <th>Component</th>
                                <th>Available</th>
                                <th>Minimum</th>
                            </tr>

                        </thead>

                        <tbody>

                            {lowStockItems.map(item => (

                                <tr key={item.id}>

                                    <td>
                                        {item.component_name}
                                    </td>

                                    <td>
                                        {item.available}
                                    </td>

                                    <td>
                                        {item.minimum_stock_level}
                                    </td>

                                </tr>

                            ))}

                        </tbody>

                    </table>

                )}

            </div>

        </div>
    );
}

export default Dashboard;