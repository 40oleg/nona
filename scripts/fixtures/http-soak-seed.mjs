// Deterministic route coverage while still exercising the driver's real picker.
if (
    process.env.GITHUB_ACTIONS !== "true" ||
    process.env.RUNNER_ENVIRONMENT !== "github-hosted"
)
    throw new Error("route seed fixture requires a GitHub-hosted runner");
// Echo consumes the second 0.1 for its request-body size.
const draws = [0.1, 0.4, 0.65, 0.7, 0.1, 0.85, 0.92, 0.95, 0.98];
let index = 0;
Math.random = () => draws[index++ % draws.length];
