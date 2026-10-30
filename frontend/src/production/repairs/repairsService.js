import api from "@/api/api";

export const repairsService = {
  /**
   * Fetch a repair attachment through the shared authenticated API client.
   * A direct browser link omits the app's X-Login-Role header, which the API
   * uses to select the active role session cookie.
   */
  getImage: async (repairId) => {
    try {
      const response = await api.get(`/repairs/${repairId}/image`, { responseType: "blob" });
      const contentType = response.headers?.["content-type"] || response.data?.type || "";
      if (!String(contentType).toLowerCase().startsWith("image/")) {
        throw new Error("The server did not return a valid picture. Please refresh and try again.");
      }
      return response.data;
    } catch (error) {
      // Axios returns the JSON error body as a Blob when responseType is "blob".
      if (typeof Blob !== "undefined" && error.response?.data instanceof Blob) {
        try {
          const payload = JSON.parse(await error.response.data.text());
          if (payload?.message) error.message = payload.message;
        } catch {
          // Keep Axios's original error when the response is not JSON.
        }
      }
      throw error;
    }
  },
};
