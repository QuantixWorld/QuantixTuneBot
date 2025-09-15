import type { Feature } from "../core/scheduler";
import { makeSpotifyClient } from "../core/spotify";
import { promises as fs } from "fs";
import path from "path";

const STATE_PATH = process.env.REVIEW_STATE_PATH || ".review-state.json";
const REVIEW_PLAYLIST_NAME = process.env.REVIEW_PLAYLIST_NAME || "review";

type State = { lastAfterMs?: number };

async function loadState(): Promise<State> {
  try { return JSON.parse(await fs.readFile(path.resolve(STATE_PATH), "utf8")); }
  catch { return {}; }
}
async function saveState(s: State) {
  await fs.writeFile(path.resolve(STATE_PATH), JSON.stringify(s, null, 2), "utf8");
}

async function findOrCreateReview(api: any): Promise<string> {
  const me = await api.get("/me").then((r: any) => r.data);
  
  let url = `/me/playlists?limit=50`;
  while (url) {
    const r = await api.get(url);
    const { items, next } = r.data;
    const found = items.find((p: any) => (p.name || "").toLowerCase() === REVIEW_PLAYLIST_NAME.toLowerCase());
    if (found) return found.id;
    url = next ? next.replace("https://api.spotify.com/v1", "") : "";
  }
  
  const created = await api.post(`/users/${me.id}/playlists`, {
    name: REVIEW_PLAYLIST_NAME,
    description: "Auto-collected recently played tracks to review later",
    public: false,
  });
  return created.data.id as string;
}

async function getAllPlaylistUris(api: any, playlistId: string): Promise<Set<string>> {
  const uris = new Set<string>();
  let url = `/playlists/${playlistId}/tracks?limit=100`;
  while (url) {
    const r = await api.get(url);
    for (const it of r.data.items) {
      const u = it.track?.uri;
      if (u) uris.add(u);
    }
    url = r.data.next ? r.data.next.replace("https://api.spotify.com/v1", "") : "";
  }
  return uris;
}

async function getLikedSet(api: any, trackIds: string[]): Promise<Set<string>> {
    const liked = new Set<string>();
    for (let i = 0; i < trackIds.length; i += 50) {
      const chunk = trackIds.slice(i, i + 50);
      const qs = new URLSearchParams({ ids: chunk.join(",") }).toString();
      const res = await api.get(`/me/tracks/contains?${qs}`);
      res.data.forEach((isLiked: boolean, idx: number) => {
        if (isLiked) liked.add(chunk[idx]);
      });
    }
    return liked;
  }

export function recentlyPlayedToReview(intervalMs = 180_000): Feature {
  return {
    name: "recentlyPlayedToReview",
    intervalMs,
    async run() {
      const api = await makeSpotifyClient();
      const state = await loadState();

      const params = new URLSearchParams({ limit: "50" });
      if (state.lastAfterMs) params.set("after", String(state.lastAfterMs));
      const recent = await api.get(`/me/player/recently-played?${params.toString()}`).then((r: any) => r.data);

      const items = recent.items ?? [];
      if (!items.length) {
        console.log(`[${new Date().toISOString()}] No new plays.`);
        return;
      }

      const candidates = items
        .map((i: any) => i.track)
        .filter((t: any) => t?.type == "track" && t?.id && t?.uri);

      const trackIds = candidates.map((t: any) => t.id);
      const likedSet = await getLikedSet(api, trackIds);

      const playlistId = await findOrCreateReview(api);
      const existing = await getAllPlaylistUris(api, playlistId);

      const toAdd: string[] = [];
      for (const t of candidates) {
        if (likedSet.has(t.id)) continue;
        if (existing.has(t.id)) continue;
        toAdd.push(t.uri);
      }

      for (let i = 0; i < toAdd.length; i += 100) {
        const batch = toAdd.slice(i, i + 100);
        if (batch.length) {
          await api.post(`/playlists/${playlistId}/tracks`, { uris: batch });
        }
      }

      const maxPlayedAt = Math.max(...items.map((i: any) => new Date(i.played_at).getTime()));
      if (Number.isFinite(maxPlayedAt)) {
        state.lastAfterMs = maxPlayedAt + 1;
        await saveState(state);
      }

      console.log(`[${new Date().toISOString()}] Added ${toAdd.length} track(s) to "${REVIEW_PLAYLIST_NAME}".`);
    },
  };
}
