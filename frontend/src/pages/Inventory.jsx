import { useEffect, useState } from "react";
import api from "../api/api";

function Inventory() {

    const [inventory, setInventory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {

        const fetchInventory = async () => {

            try {

                const response =
                    await api.get("/inventory");

                setInventory(response.data);

            } catch (error) {

                console.error(error);

                setError("Failed to load inventory");

            } finally {

                setLoading(false);

            }
        };

        fetchInventory();

    }, []);

    if (loading) {
        return <h1>Loading inventory...</h1>;
    }

    if (error) {
        return <h1>{error}</h1>;
    }

    return (

        <div>

            <h1>Inventory</h1>

            <p>
                Current raw material stock
            </p>

            <div className="table-container">

                <table>

                    <thead>

                        <tr>
                            <th>SKU</th>
                            <th>Component</th>
                            <th>Total</th>
                            <th>Reserved</th>
                            <th>Available</th>
                            <th>Minimum</th>
                        </tr>

                    </thead>

                    <tbody>

                        {inventory.map(item => (

                            <tr key={item.id}>

                                <td>{item.sku}</td>

                                <td>{item.component_name}</td>

                                <td>{item.quantity_on_hand}</td>

                                <td>{item.quantity_reserved}</td>

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

            </div>

        </div>
    );
}

export default Inventory;