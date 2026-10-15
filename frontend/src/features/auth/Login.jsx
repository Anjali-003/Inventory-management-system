import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { authService } from "@/features/auth/authService"
import { Eye, EyeOff } from "lucide-react";
import { useDispatch } from "react-redux";
import { baseApi } from "@/api/baseApi";
import { LOGIN_PORTALS, rememberPortal, homePathFor } from "@/lib/permissions";

// portal = which role this page logs in (see LOGIN_PORTALS); /login is the super admin page
function Login({ portal = LOGIN_PORTALS.SUPER_ADMIN }) {
  const [showPassword, setShowPassword] = useState(false);

  const navigate = useNavigate();

  const dispatch = useDispatch();

  const [email, setEmail] = useState("");

  const [password, setPassword] = useState("");

  const [error, setError] = useState("");

  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();

    setError("");

    if (!email || !password) {
      setError("Please enter email and password");

      return;
    }

    try {
      setLoading(true);

      await authService.login(portal.api, { email, password });

      rememberPortal(portal); // this tab now works as this role

      dispatch(baseApi.util.resetApiState()); // drop anything cached for a previous role in this tab

      navigate(homePathFor(portal.role) || "/dashboard"); // open this role's configured home page
    } catch (error) {
      console.error(error);

      setError(error.response?.data?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <h1>{portal.title}</h1>

          <p>Inventory Management System</p>
        </div>

        <form onSubmit={handleLogin}>
          <label>Email</label>

          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email"
          />

          <label>Password</label>

          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="pr-10"
            />

            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="password-eye"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>

          {error && <div className="login-error">{error}</div>}

          <button type="submit" disabled={loading}>
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default Login;
