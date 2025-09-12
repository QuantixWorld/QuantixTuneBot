import axios from "axios";
import queryString from "querystring";
import { loadToken, saveToken, TokenData } from "./tokenStore";

const MARGIN = 5 * 60 * 1000;

export async function getValidAccessToken(): Promise<TokenData> {
  const client_id = process.env.SPOTIFY_CLIENT_ID!;
  const client_secret = process.env.SPOTIFY_CLIENT_SECRET!;

  let t = await loadToken();
  if (!t || !t.refreshToken) {
    throw new Error("Not authorized yet. Visit /login to authorize with Spotify.");
  }

  const needRefresh = !t.accessToken || Date.now() > (t.expiry - MARGIN);

  if (!needRefresh) return t;

  const refreshRes = await axios.post(
    "https://accounts.spotify.com/api/token",
    queryString.stringify({
      grant_type: "refresh_token",
      refresh_token: t.refreshToken,
    }),
    {
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        Authorization:
          "Basic " + Buffer.from(`${client_id}:${client_secret}`).toString("base64"),
      },
    }
  );

  const newAccessToken = refreshRes.data.access_token as string;
  const newExpiresIn = Number(refreshRes.data.expires_in) * 1000;
  const maybeRotatedRefresh = (refreshRes.data.refresh_token as string) || t.refreshToken;

  t = {
    ...t,
    accessToken: newAccessToken,
    refreshToken: maybeRotatedRefresh,
    expiry: Date.now() + newExpiresIn,
  };

  await saveToken(t);
  return t;
}