import axios from "axios";

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || `http://${window.location.hostname}:5000/api`,
    withCredentials: true
});

export default api;