


import { useEffect, useState } from "react";
import api from "../api/api";

function Products() {

    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const [selectedProduct, setSelectedProduct] = useState(null);
    const [bom, setBom] = useState([]);

    useEffect(() => {

        const fetchProducts = async () => {

            try {

                const response = await api.get("/products");

                setProducts(response.data);

            } catch (error) {

                console.error(error);

                setError("Failed to load products");

            } finally {

                setLoading(false);

            }
        };

        fetchProducts();

    }, []);


    const handleViewBOM = async (productId) => {

        try {

            const response =
                await api.get(`/products/${productId}/bom`);

            setBom(response.data);

            setSelectedProduct(productId);

        } catch (error) {

            console.error(error);

        }
    };


    if (loading) {
        return <h1>Loading products...</h1>;
    }

    if (error) {
        return <h1>{error}</h1>;
    }


    return (

        <div>

            <h1>Products</h1>

            <p>
                Products manufactured by the company
            </p>


            {/* PRODUCTS TABLE */}

            <div className="table-container">

                <table>

                    <thead>
                        <tr>
                            <th>SKU</th>
                            <th>Product</th>
                            <th>Description</th>
                            <th>Action</th>
                        </tr>
                    </thead>


                    <tbody>

                        {products.map(product => (

                            <tr key={product.id}>

                                <td>
                                    {product.sku}
                                </td>

                                <td>
                                    {product.name}
                                </td>

                                <td>
                                    {product.description}
                                </td>

                                <td>

                                    <button
                                        onClick={() =>
                                            handleViewBOM(product.id)
                                        }
                                    >
                                        View BOM
                                    </button>

                                </td>

                            </tr>

                        ))}

                    </tbody>

                </table>

            </div>


            {/* BOM SECTION */}

            {selectedProduct && (

                <div className="bom-section">

                    <h2>Bill of Materials</h2>


                    <table>

                        <thead>

                            <tr>
                                <th>Component</th>
                                <th>SKU</th>
                                <th>Quantity Required</th>
                                <th>Unit</th>
                            </tr>

                        </thead>


                        <tbody>

                            {bom.map(item => (

                                <tr key={item.component_id}>

                                    <td>
                                        {item.component_name}
                                    </td>

                                    <td>
                                        {item.component_sku}
                                    </td>

                                    <td>
                                        {item.quantity_required}
                                    </td>

                                    <td>
                                        {item.unit}
                                    </td>

                                </tr>

                            ))}

                        </tbody>

                    </table>

                </div>

            )}

        </div>
    );
}

export default Products;