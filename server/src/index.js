import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// .env lives at the repo root, not inside server/, regardless of cwd.
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn(
    '[LoopSentinel] WARNING: ANTHROPIC_API_KEY is not set. Copy .env.example to .env at the repo root and add your key -- the dashboard will still load, but agent investigations will fail.'
  );
}

const express = (await import('express')).default;
const cors = (await import('cors')).default;
const { startAllBackgroundProcesses } = await import('./sources/index.js');
const { router: apiRouter } = await import('./routes/api.js');
const { startAutoInvestigation } = await import('./autoInvestigate.js');
const { maybeInjectCrashLoopScenario } = await import('./scenario/crashLoopScenario.js');
const { seedHistoryIfNeeded } = await import('./seedHistory.js');

seedHistoryIfNeeded();

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api', apiRouter);

// In production, serve the built React app and let it handle client-side routes.
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

startAllBackgroundProcesses();
startAutoInvestigation();

// Scripted demo scenario runs entirely on its own -- no manual trigger.
// Fires once shortly after startup (so a fresh demo doesn't need to wait),
// then on a recurring interval.
const SCENARIO_INTERVAL_MS = Number(process.env.SCENARIO_INTERVAL_MS || 180000);
setTimeout(() => maybeInjectCrashLoopScenario(), 12000);
setInterval(() => maybeInjectCrashLoopScenario(), SCENARIO_INTERVAL_MS);

const PORT = Number(process.env.PORT || 3001);
app.listen(PORT, () => {
  console.log(`[LoopSentinel] server listening on http://localhost:${PORT}`);
});
