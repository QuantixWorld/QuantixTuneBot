import axios, { AxiosInstance } from "axios";
import { getValidAccessToken } from "../utils";

export async function makeSpotifyClient(): Promise<AxiosInstance> {
  const { accessToken } = await getValidAccessToken();
  const api = axios.create({
    baseURL: "https://api.spotify.com/v1",
    headers: { Authorization: `Bearer ${accessToken}` },
    timeout: 30_000,
  });

  api.interceptors.response.use(undefined, async (error) => {
    if (error.response?.status === 401 && !error.config.__isRetry) {
      const fresh = await getValidAccessToken();
      error.config.headers.Authorization = `Bearer ${fresh.accessToken}`;
      error.config.__isRetry = true;
      return api.request(error.config);
    }
    
    if (error.response?.status === 429) {
      const ra = Number(error.response.headers["retry-after"] ?? 1);
      await new Promise(r => setTimeout(r, (ra || 1) * 1000));
      return api.request(error.config);
    }
    throw error;
  });

  return api;
}
