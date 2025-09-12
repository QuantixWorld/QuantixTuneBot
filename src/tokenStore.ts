import { promises as fs } from "fs";
import path from "path";

export type TokenData = {
  accessToken: string;
  refreshToken: string;
  expiry: number;
  userId: string;
};

const tokenPath = process.env.TOKEN_PATH || ".spotify-token.json";

export async function loadToken(): Promise<TokenData | null> {
  try {
    const raw = await fs.readFile(path.resolve(tokenPath), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function saveToken(t: TokenData): Promise<void> {
  await fs.writeFile(path.resolve(tokenPath), JSON.stringify(t, null, 2), "utf8");
}