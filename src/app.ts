import express from "express";
import "dotenv/config";
import authRouter from "./auth";
import { runScheduler } from "./core/scheduler";
import { recentlyPlayedToReview } from "./features/recentlyPlayedToReview";

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(authRouter);

app.get("/", (_req, res) => {
  res.send(
    'Hello! Go to <a href="/login">/login</a> to authorize Spotify once.'
  );
});

const features = [
  recentlyPlayedToReview(Number(process.env.POLL_MS ?? 180_000)),
];

runScheduler(features).catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});

app.listen(port, () => {
  console.log(`Listening at http://localhost:${port}`);
});
