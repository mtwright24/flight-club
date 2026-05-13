/**
 * Removes Metro file-map disk cache files that trigger:
 *   Error: Unable to deserialize cloned data (DiskCacheManager.read)
 * Cache lives in os.tmpdir() as metro-file-map-<hashes> (see metro-file-map).
 */
const fs = require("fs");
const path = require("path");
const os = require("os");

const tmp = os.tmpdir();
let removed = 0;
try {
  for (const name of fs.readdirSync(tmp)) {
    if (!name.startsWith("metro-file-map-")) continue;
    const fp = path.join(tmp, name);
    try {
      fs.unlinkSync(fp);
      removed++;
      console.log("removed", fp);
    } catch (e) {
      console.warn("skip", fp, e?.message ?? e);
    }
  }
} catch (e) {
  console.warn("tmpdir read:", e?.message ?? e);
}

const dirs = [
  path.join(process.cwd(), "node_modules", ".cache", "metro"),
  path.join(process.cwd(), "node_modules", ".cache", "metro-file-map"),
];
for (const d of dirs) {
  try {
    if (fs.existsSync(d)) {
      fs.rmSync(d, { recursive: true, force: true });
      removed++;
      console.log("removed dir", d);
    }
  } catch (e) {
    console.warn("skip dir", d, e?.message ?? e);
  }
}

console.log(`Metro cache cleanup finished (${removed} item(s)).`);
