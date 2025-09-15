import type { Feature } from "../core/scheduler";
import { makeSpotifyClient } from "../core/spotify";

const STATE_PATH = process.env.SYNC_STATE_PATH || ".sync-state.json";
const REF_PLAYLIST_NAME = process.env.SYNC_REF_PLAYLIST_NAME || "_saved";
const TARGET_PLAYLIST_NAME =
  process.env.SYNC_TARGET_PLAYLIST_NAME || "Liked Songs";
const SYNC_BOTH_WAY =
  (process.env.SYNC_BOTH_WAY ?? "false").toString().toLowerCase() === "true";

async function findPlaylist(api: any, playlistName: string): Promise<string> {
  let url = `/me/playlists?limit=50`;
  while (url) {
    const r = await api.get(url);
    const { items, next } = r.data;
    const found = items.find(
      (p: any) => (p.name || "").toLowerCase() === playlistName.toLowerCase()
    );
    if (found) return found.id;
    url = next ? next.replace("https://api.spotify.com/v1", "") : "";
  }

  console.log(`Playlist ${playlistName} not found`);
  return undefined;
}

async function getAllPlaylistUris(
  api: any,
  playlistId: string
): Promise<Set<string>> {
  const uris = new Set<string>();
  let url = `/playlists/${playlistId}/tracks?limit=100`;
  while (url) {
    const r = await api.get(url);
    for (const it of r.data.items) {
      const u = it.track?.uri;
      if (u && !it.track?.is_local) uris.add(u);
    }
    url = r.data.next
      ? r.data.next.replace("https://api.spotify.com/v1", "")
      : "";
  }
  return uris;
}

async function getAllSavedUris(api: any): Promise<Set<string>> {
  const uris = new Set<string>();
  let url = `/me/tracks?limit=50`;
  while (url) {
    const r = await api.get(url);
    for (const it of r.data.items) {
      const u = it.track?.uri;
      if (u && !it.track?.is_local) uris.add(u);
    }
    url = r.data.next
      ? r.data.next.replace("https://api.spotify.com/v1", "")
      : "";
  }
  return uris;
}

async function addToPlaylist(
  api: any,
  toAdd: string[],
  targetPlaylistId: string,
  targetPlaylistName: string
) {
  for (let i = 0; i < toAdd.length; i += 100) {
    const batch = toAdd.slice(i, i + 100);
    if (batch.length) {
      await api.post(`/playlists/${targetPlaylistId}/tracks`, { uris: batch });
    }
  }

  console.log(
    `[${new Date().toISOString()}] Added ${
      toAdd.length
    } track(s) to "${targetPlaylistName}".`
  );
}

export function syncPlaylists(intervalMs = 300_000): Feature {
  return {
    name: "syncPlaylists",
    intervalMs,
    async run() {
      const api = await makeSpotifyClient();

      let refSet;
      let refId;
      if (REF_PLAYLIST_NAME != "_saved") {
        refId = await findPlaylist(api, REF_PLAYLIST_NAME);
        if (refId != undefined) {
          refSet = await getAllPlaylistUris(api, refId);
        }
      } else {
        refSet = await getAllSavedUris(api);
      }

      let targetSet;
      let targetId;
      if (TARGET_PLAYLIST_NAME != "_saved") {
        targetId = await findPlaylist(api, TARGET_PLAYLIST_NAME);
        if (targetId != undefined) {
          targetSet = await getAllPlaylistUris(api, targetId);
        }
      } else {
        targetSet = await getAllSavedUris(api);
      }

      const toAdd: string[] = [];
      for (const t of refSet) {
        if (targetSet && targetSet.has(t)) continue;
        toAdd.push(t);
      }

      await addToPlaylist(api, toAdd, targetId, TARGET_PLAYLIST_NAME);

      if (SYNC_BOTH_WAY) {
        const refAdd: string[] = [];
        for (const t of targetSet) {
          if (refSet && refSet.has(t)) continue;
          refAdd.push(t);
        }

        await addToPlaylist(api, refAdd, refId, REF_PLAYLIST_NAME);
      }
    },
  };
}
