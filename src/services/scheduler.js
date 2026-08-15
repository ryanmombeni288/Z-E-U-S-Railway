const RESET_LOCK = 9_711_401;
const ROTATE_LOCK = 9_711_402;

async function withAdvisoryLock(pool, key, task) {
  const client = await pool.connect();
  try {
    const result = await client.query("SELECT pg_try_advisory_lock($1) AS acquired", [key]);
    if (!result.rows[0]?.acquired) return false;
    try {
      await task();
      return true;
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [key]);
    }
  } finally {
    client.release();
  }
}

export function startSchedulers({ pool, env, ctx, legacy }) {
  let stopped = false;
  let resetsRunning = false;
  let rotatesRunning = false;
  let trafficRunning = false;
  const timers = [];

  const runResets = async () => {
    if (stopped || resetsRunning) return;
    resetsRunning = true;
    try {
      await withAdvisoryLock(pool, RESET_LOCK, () => legacy.checkAutoResets(env, ctx));
    } catch (error) {
      console.error("[scheduler reset]", error);
    } finally {
      resetsRunning = false;
    }
  };

  const runRotates = async () => {
    if (stopped || rotatesRunning) return;
    rotatesRunning = true;
    try {
      await withAdvisoryLock(pool, ROTATE_LOCK, () => legacy.checkAutoRotates(env, ctx));
    } catch (error) {
      console.error("[scheduler rotate]", error);
    } finally {
      rotatesRunning = false;
    }
  };

  const flushTraffic = async () => {
    if (stopped || trafficRunning) return;
    trafficRunning = true;
    try {
      await legacy.flushExpiredTraffic(env);
    } catch (error) {
      console.error("[scheduler traffic]", error);
    } finally {
      trafficRunning = false;
    }
  };

  timers.push(setInterval(runResets, 5 * 60_000));
  timers.push(setInterval(runRotates, 30_000));
  timers.push(setInterval(flushTraffic, 15_000));
  timers.forEach((timer) => timer.unref?.());
  ctx.waitUntil(runResets());
  ctx.waitUntil(runRotates());

  return {
    async stop() {
      timers.forEach(clearInterval);
      await Promise.allSettled([flushTraffic()]);
      stopped = true;
    },
  };
}
