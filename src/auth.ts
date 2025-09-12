import express from "express";
import axios from "axios";
import queryString from "querystring";
import { saveToken } from "./tokenStore";

const router = express.Router();

router.get("/auth-status", async (_req, res) => {
  try {
    const { loadToken } = await import("./tokenStore");
    const t = await loadToken();
    res.status(200).json({ loggedIn: !!t?.accessToken, userId: t?.userId ?? null });
  } catch {
    res.status(200).json({ loggedIn: false, userId: null });
  }
});

router.delete("/logout", async (_req, res) => {
  const { saveToken } = await import("./tokenStore");
  await saveToken({ accessToken: "", refreshToken: "", expiry: 0, userId: "" });
  res.status(200).json();
});

router.get("/login", (_req, res) => {
  const scope = [
    "user-read-private",
    "user-read-email",
    "user-read-recently-played",
    "playlist-read-private",
    "playlist-modify-private",
    "playlist-modify-public",
    "user-library-read",
  ].join(" ");

  const client_id = process.env.SPOTIFY_CLIENT_ID!;
  const redirect_uri = process.env.SPOTIFY_REDIRECT_URI || "http://localhost:3000/callback";

  const url =
    "https://accounts.spotify.com/authorize?" +
    queryString.stringify({
      response_type: "code",
      client_id,
      scope,
      redirect_uri,
    });

  res.redirect(url);
});

router.get("/callback", async (req, res) => {
  try {
    const code = (req.query.code as string) ?? null;
    if (!code) return res.status(400).send("Missing code");

    const client_id = process.env.SPOTIFY_CLIENT_ID!;
    const client_secret = process.env.SPOTIFY_CLIENT_SECRET!;
    const redirect_uri = process.env.SPOTIFY_REDIRECT_URI || "http://localhost:3000/callback";

    const tokenRes = await axios.post(
      "https://accounts.spotify.com/api/token",
      queryString.stringify({
        code,
        redirect_uri,
        grant_type: "authorization_code",
      }),
      {
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          Authorization:
            "Basic " + Buffer.from(`${client_id}:${client_secret}`).toString("base64"),
        },
      }
    );

    const accessToken = tokenRes.data.access_token as string;
    const refreshToken = tokenRes.data.refresh_token as string;
    const expiresIn = Number(tokenRes.data.expires_in) * 1000;
    const expiry = Date.now() + expiresIn;

    const me = await axios.get("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const userId = me.data.id as string;

    await saveToken({ accessToken, refreshToken, expiry, userId });

    res.redirect("/auth-ok");
  } catch (err: any) {
    console.error("Auth callback error:", err?.response?.data || err);
    res.status(500).send("Auth failed");
  }
});

router.get("/auth-ok", (_req, res) => {
  res.send("Spotify authorized. You can close this tab and start your bot.");
});

export default router;