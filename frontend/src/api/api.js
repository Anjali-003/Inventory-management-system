// Frontend jis URL se open hua hai, us URL ko dekhkar automatically backend ka URL banana.
// Isliye .env mein baar-baar VITE_API_URL change/comment nahi karna padega.

import axios from "axios";
const getApiUrl = () => {
  const { hostname, protocol } = window.location;

  // Production: VITE_API_URL provided
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  //for port forwarding
  if (hostname.endsWith(".devtunnels.ms")) {
    const backendHost = hostname.replace("-5173.", "-5000.");
    return `${protocol}//${backendHost}/api`;
  }

  //for local development
  return `${protocol}//${hostname}:5000/api`;
};

const api = axios.create({
  baseURL: getApiUrl(),
  withCredentials: true,
});

export default api;