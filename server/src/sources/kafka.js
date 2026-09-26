// Simulated Kafka source: ~20 topics with fluctuating lag/throughput.
// In-memory only, background-mutated. No real Kafka cluster involved.

import { SERVICE_NAMES } from './topology.js';
import { randInt, chance, nowIso } from '../util.js';

const TOPIC_SUFFIXES = ['.events', '.dlq'];
const topics = new Map();

function seed() {
  const chosen = SERVICE_NAMES.slice(0, 10);
  for (const service of chosen) {
    for (const suffix of TOPIC_SUFFIXES) {
      const name = `${service}${suffix}`;
      topics.set(name, {
        topic: name,
        partitions: randInt(3, 12),
        consumer_group: `${service}-consumer`,
        consumer_lag: suffix === '.dlq' ? randInt(0, 20) : randInt(0, 500),
        producer_throughput_msg_s: randInt(5, 400),
        last_updated: nowIso(),
      });
    }
  }
}
seed();

function tick() {
  for (const rec of topics.values()) {
    const lagDelta = randInt(-40, 60);
    rec.consumer_lag = Math.max(0, rec.consumer_lag + lagDelta);
    rec.producer_throughput_msg_s = Math.max(0, rec.producer_throughput_msg_s + randInt(-30, 30));
    if (chance(0.03)) rec.consumer_lag += randInt(500, 3000); // occasional lag spike
    rec.last_updated = nowIso();
  }
}

export function startBackgroundProcess(intervalMs = 3500) {
  return setInterval(tick, intervalMs);
}

// --- Tool-callable functions -------------------------------------------------

export function list_topics() {
  return [...topics.values()];
}

export function get_topic_lag({ topic_name }) {
  const rec = topics.get(topic_name);
  if (!rec) return { error: `unknown topic: ${topic_name}` };
  return rec;
}
