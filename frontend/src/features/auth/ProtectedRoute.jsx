import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { authService } from "@/features/auth/authService"
import { savedLoginPath } from "@/lib/permissions";

function ProtectedRoute({ children }) {

    const [loading, setLoading] =
        useState(true);

    const [authenticated, setAuthenticated] =
        useState(false);


    useEffect(() => {

        const checkAuthentication =
            async () => {

                try {

                    await authService.checkSession();

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
                to={savedLoginPath()}
                replace
            />
        );

    }


    return children;
}

export default ProtectedRoute;