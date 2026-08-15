const DEFAULT_RAILWAY_API = "https://backboard.railway.com/graphql/v2";

function required(env, names) {
  const missing = names.filter((name) => !env[name]);
  if (missing.length) throw new Error(`Missing Railway configuration: ${missing.join(", ")}`);
}

function railwayHeaders(env) {
  if (!env.RAILWAY_TOKEN) throw new Error("RAILWAY_TOKEN is not configured");
  return env.RAILWAY_TOKEN_TYPE === "project"
    ? { "Project-Access-Token": env.RAILWAY_TOKEN }
    : { Authorization: `Bearer ${env.RAILWAY_TOKEN}` };
}

async function graphql(env, query, variables) {
  const response = await fetch(env.RAILWAY_API_URL || DEFAULT_RAILWAY_API, {
    method: "POST",
    headers: { ...railwayHeaders(env), "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(12_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.errors?.length) {
    const message = payload.errors?.map((error) => error.message).join("; ") || `Railway API returned ${response.status}`;
    throw new Error(message);
  }
  return payload.data;
}

export async function deployLatest(env) {
  required(env, ["RAILWAY_TOKEN", "RAILWAY_SERVICE_ID", "RAILWAY_ENVIRONMENT_ID"]);
  const data = await graphql(
    env,
    `mutation serviceInstanceDeploy($serviceId: String!, $environmentId: String!) {
      serviceInstanceDeploy(serviceId: $serviceId, environmentId: $environmentId)
    }`,
    { serviceId: env.RAILWAY_SERVICE_ID, environmentId: env.RAILWAY_ENVIRONMENT_ID },
  );
  return data.serviceInstanceDeploy;
}

export async function restartCurrentDeployment(env) {
  required(env, ["RAILWAY_TOKEN", "RAILWAY_DEPLOYMENT_ID"]);
  const data = await graphql(
    env,
    `mutation deploymentRestart($id: String!) {
      deploymentRestart(id: $id)
    }`,
    { id: env.RAILWAY_DEPLOYMENT_ID },
  );
  return data.deploymentRestart;
}

export async function dispatchGitHubUpdate(env) {
  required(env, ["GITHUB_TOKEN", "GITHUB_REPO", "GITHUB_WORKFLOW_ID"]);
  const response = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/${encodeURIComponent(env.GITHUB_WORKFLOW_ID)}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "ZEUS-Panel-Railway",
    },
    body: JSON.stringify({ ref: env.GITHUB_BRANCH || "main" }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`GitHub workflow dispatch failed (${response.status}): ${detail.slice(0, 180)}`);
  }
  return true;
}

export async function updatePanel(env) {
  if (env.GITHUB_TOKEN && env.GITHUB_REPO && env.GITHUB_WORKFLOW_ID) {
    await dispatchGitHubUpdate(env);
    return { provider: "github-workflow" };
  }
  await deployLatest(env);
  return { provider: "railway" };
}
