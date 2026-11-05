import { execFile, spawn } from "node:child_process";
import { access, open, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Where the bytes go, from the PRINTER setting:
 *
 *   usb:/dev/usb/lp0      USB printer plugged into this box (the STB, Linux)
 *   tcp://192.168.1.50    LAN printer (port 9100 unless given)
 *   cups:<queue>          a printer added in macOS (or Linux CUPS) — laptop stand-in
 *   windows:<share>       a shared printer on a Windows laptop
 *   dry-run               print to the log instead — for testing without paper
 *
 * cups: and windows: send the same raw ESC/POS bytes as usb:, bypassing any
 * driver, so the receipt (logo, big number, cut) is identical.
 */
export function createPrinter(spec) {
  if (!spec || spec === "dry-run") {
    return {
      label: "dry-run (log only)",
      ready: async () => true,
      send: async () => {},
      dryRun: true,
    };
  }

  if (spec.startsWith("usb:")) {
    const path = spec.slice(4);
    return {
      label: `USB ${path}`,
      // Checked before claiming jobs, so an unplugged printer leaves receipts
      // queued instead of burning their five attempts.
      ready: async () => {
        try {
          await access(path, constants.W_OK);
          return true;
        } catch {
          return false;
        }
      },
      send: async (bytes) => {
        const handle = await open(path, "w");
        try {
          await handle.write(bytes);
        } finally {
          await handle.close();
        }
      },
    };
  }

  if (spec.startsWith("tcp://")) {
    const url = new URL(spec);
    const host = url.hostname;
    const port = Number(url.port || 9100);
    return {
      label: `LAN ${host}:${port}`,
      ready: () => probe(host, port),
      send: (bytes) => sendTcp(host, port, bytes),
    };
  }

  if (spec.startsWith("cups:")) {
    const queue = spec.slice(5);
    return {
      label: `printer "${queue}" (CUPS)`,
      // `lpstat -p` fails for an unknown queue and says "disabled" when paused.
      ready: () =>
        run("lpstat", ["-p", queue])
          .then((out) => !/disabled/i.test(out))
          .catch(() => false),
      send: (bytes) => pipe("lp", ["-d", queue, "-o", "raw", "-t", "Pantrio receipt"], bytes),
    };
  }

  if (spec.startsWith("windows:")) {
    const share = spec.slice(8);
    const target = `\\\\localhost\\${share}`;
    return {
      label: `Windows printer share "${share}"`,
      // Windows has no cheap "is the printer on" check for a raw share; a
      // failed copy is retried like any other failed job.
      ready: async () => true,
      send: async (bytes) => {
        const file = join(tmpdir(), `pantrio-receipt-${process.pid}-${Date.now()}.bin`);
        await writeFile(file, bytes);
        try {
          await run("cmd.exe", ["/c", "copy", "/b", file, target]);
        } finally {
          await rm(file, { force: true });
        }
      },
    };
  }

  // A bare printer name on a Mac/Linux laptop (e.g. "USB_58Series2", as
  // `lpstat -p` shows it) means that CUPS printer — the "cups:" prefix is easy
  // to forget.
  if (/^[\w.@-]+$/.test(spec) && process.platform !== "win32") {
    return createPrinter(`cups:${spec}`);
  }

  throw new Error(
    `Unrecognised PRINTER "${spec}". Use usb:/dev/usb/lp0, tcp://<ip>, cups:<printer>, windows:<share>, or dry-run.`
  );
}

function probe(host, port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port, timeout: 3000 });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(false));
  });
}

function sendTcp(host, port, bytes) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port, timeout: 5000 });
    socket.once("connect", () => socket.end(bytes));
    socket.once("finish", resolve);
    socket.once("timeout", () => {
      socket.destroy();
      reject(new Error(`Printer ${host}:${port} timed out`));
    });
    socket.once("error", reject);
  });
}

function run(cmd, args) {
  return new Promise((resolve, reject) =>
    execFile(cmd, args, { timeout: 15_000 }, (err, stdout, stderr) =>
      err ? reject(new Error(`${cmd}: ${(stderr || err.message).trim()}`)) : resolve(String(stdout))
    )
  );
}

/** Run a command with `bytes` on stdin (lp reads the job from stdin). */
function pipe(cmd, args, bytes) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["pipe", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d));
    child.once("error", reject);
    child.once("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}: ${stderr.trim()}`))
    );
    child.stdin.end(Buffer.from(bytes));
  });
}
