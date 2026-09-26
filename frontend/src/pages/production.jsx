import { useEffect, useState } from "react";
import api from "../api/api";


function Production() {

    const [productionOrders, setProductionOrders] =
        useState([]);

    const [loading, setLoading] =
        useState(true);

    const [error, setError] =
        useState("");


    const fetchProductionOrders =
        async () => {

            try {

                setLoading(true);

                const response =
                    await api.get("/production");

                setProductionOrders(
                    response.data
                );

            } catch (error) {

                console.error(error);

                setError(
                    "Failed to load production orders"
                );

            } finally {

                setLoading(false);

            }

        };


    useEffect(() => {

        fetchProductionOrders();

    }, []);


    const handleComplete =
        async (productionId) => {

            try {

                await api.post(
                    `/production/${productionId}/complete`
                );


                /*
                    Reload the production list
                    after completing production.
                */
                await fetchProductionOrders();

            } catch (error) {

                console.error(error);

                alert(
                    error.response?.data?.message ||
                    "Failed to complete production"
                );

            }

        };


    if (loading) {

        return (
            <h1>
                Loading production...
            </h1>
        );

    }


    if (error) {

        return (
            <h1>
                {error}
            </h1>
        );

    }


    return (

        <div>

            <h1>Production</h1>

            <p>
                Track orders currently in production
            </p>


            <div className="table-container">

                <table>

                    <thead>

                        <tr>

                            <th>
                                Production ID
                            </th>

                            <th>
                                Order
                            </th>

                            <th>
                                Status
                            </th>

                            <th>
                                Started
                            </th>

                            <th>
                                Completed
                            </th>

                            <th>
                                Action
                            </th>

                        </tr>

                    </thead>


                    <tbody>

                        {productionOrders.map(
                            production => (

                                <tr
                                    key={
                                        production.id
                                    }
                                >

                                    <td>
                                        {production.id}
                                    </td>

                                    <td>
                                        {
                                            production.order_number
                                        }
                                    </td>

                                    <td>
                                        {
                                            production.status
                                        }
                                    </td>

                                    <td>
                                        {
                                            production.started_at ||
                                            "-"
                                        }
                                    </td>

                                    <td>
                                        {
                                            production.completed_at ||
                                            "-"
                                        }
                                    </td>

                                    <td>

                                        {production.status ===
                                        "IN_PRODUCTION" ? (

                                            <button
                                                onClick={() =>
                                                    handleComplete(
                                                        production.id
                                                    )
                                                }
                                            >
                                                Complete
                                            </button>

                                        ) : (

                                            <span>
                                                Completed
                                            </span>

                                        )}

                                    </td>

                                </tr>

                            )
                        )}

                    </tbody>

                </table>

            </div>

        </div>

    );
}


export default Production;