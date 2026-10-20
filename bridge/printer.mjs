import { access, open } from "node:fs/promises";
import { constants } from "node:fs";
import net from "node:net";

/**
 * Where the bytes go, from the PRINTER setting:
 *
 *   usb:/dev/usb/lp0      USB printer plugged into this box
 *   tcp://192.168.1.50    LAN printer (port 9100 unless given)
 *   dry-run               print to the log instead — for testing without paper
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

  throw new Error(`Unrecognised PRINTER "${spec}". Use usb:/dev/usb/lp0, tcp://<ip>, or dry-run.`);
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
