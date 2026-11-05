import { test } from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPrinter } from "./printer.mjs";

// Stand-in lp / lpstat on PATH, so the CUPS mode is tested without a printer.
async function fakeCups(lpstatOutput) {
  const dir = await mkdtemp(join(tmpdir(), "fake-cups-"));
  await writeFile(join(dir, "lp"), `#!/bin/sh\necho "$@" > "${dir}/args"\ncat > "${dir}/job"\n`);
  await writeFile(join(dir, "lpstat"), `#!/bin/sh\n${lpstatOutput}\n`);
  await chmod(join(dir, "lp"), 0o755);
  await chmod(join(dir, "lpstat"), 0o755);
  process.env.PATH = `${dir}:${process.env.PATH}`;
  return dir;
}

test("cups: sends the raw receipt bytes unchanged to the named printer", async () => {
  const dir = await fakeCups('echo "printer Receipt is idle."');
  const printer = createPrinter("cups:Receipt");
  assert.equal(await printer.ready(), true);
  const bytes = Uint8Array.from([0x1b, 0x40, 0x48, 0x69, 0x0a, 0x1d, 0x56, 0x00]); // init, "Hi", cut
  await printer.send(bytes);
  assert.deepEqual(new Uint8Array(await readFile(join(dir, "job"))), bytes);
  assert.match(await readFile(join(dir, "args"), "utf8"), /-d Receipt -o raw/);
});

test("cups: a paused or unknown printer is not ready (receipts wait instead of failing)", async () => {
  await fakeCups('echo "printer Receipt disabled since Tue"');
  assert.equal(await createPrinter("cups:Receipt").ready(), false);
  await fakeCups("exit 1");
  assert.equal(await createPrinter("cups:Nope").ready(), false);
});

test("unknown printer setting explains the options", () => {
  assert.throws(() => createPrinter("bluetooth:x"), /cups:<printer>, windows:<share>/);
});
