import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import api from "../api/api";

function ProtectedRoute({ children }) {

    const [loading, setLoading] =
        useState(true);

    const [authenticated, setAuthenticated] =
        useState(false);


    useEffect(() => {

        const checkAuthentication =
            async () => {

                try {

                    await api.get(
                        "/auth/me"
                    );

                    setAuthenticated(true);

                } catch (error) {

                    setAuthenticated(false);

                } finally {

                    setLoading(false);

                }

            };


        checkAuthentication();

    }, []);


    if (loading) {

        return (
            <div>
                Checking authentication...
            </div>
        );

    }


    if (!authenticated) {

        return (
            <Navigate
                to="/login"
                replace
            />
        );

    }


    return children;
}

export default ProtectedRoute;