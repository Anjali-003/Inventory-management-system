import { useEffect, useState } from "react";
import api from "../api/api";
import SearchBar from "../components/SearchBar";

function Inventory() {
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const fetchInventory = async () => {
      try {
        const response = await api.get("/inventory");

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

  const filteredInventory = inventory.filter((item) => {
    const searchText = search.toLowerCase();

    return (
      item.sku.toLowerCase().includes(searchText) ||
      item.component_name.toLowerCase().includes(searchText)
    );
  });

  if (loading) {
    return <h1>Loading inventory...</h1>;
  }

  if (error) {
    return <h1>{error}</h1>;
  }

  return (
    <div>
      <h1>Inventory</h1>

      <p>Current raw material stock</p>

      <SearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search by component name or SKU..."
      />

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
            {filteredInventory.map((item) => (
              <tr key={item.id}>
                <td>{item.sku}</td>

                <td>{item.component_name}</td>

                <td>{item.quantity_on_hand}</td>

                <td>{item.quantity_reserved}</td>

                <td>{item.available}</td>

                <td>{item.minimum_stock_level}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Inventory;
