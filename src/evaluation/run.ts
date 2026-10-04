import { REPLAY_SCENARIOS } from "./scenarios";
import { runReplaySuite } from "./runner";

async function main() {
  const suite = await runReplaySuite(REPLAY_SCENARIOS);

  console.log("\nGuardian v2 replay evaluation\n");

  for (const result of suite.results) {
    const status = result.passed ? "PASS" : "FAIL";
    console.log(
      `${status.padEnd(4)}  ${result.id.padEnd(30)}  ${result.durationMs.toFixed(2)}ms`,
    );

    for (const failure of result.failures) {
      console.log(`      - ${failure}`);
    }
  }

  console.log(
    `\n${suite.passed}/${suite.total} scenarios passed (${(
      suite.passRate * 100
    ).toFixed(1)}%)\n`,
  );

  if (suite.failed > 0) {
    process.exitCode = 1;
  }
}

void main();
