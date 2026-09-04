// Run on macOS: bun apps/desktop/resources/generate-icons.mjs
// Uses the project's Playwright Chromium to rasterize the shared vector artwork.
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const resources = path.dirname(fileURLToPath(import.meta.url));
const temporary = mkdtempSync(path.join(tmpdir(), "pine-icons-"));
const iconset = path.join(temporary, "Pine.iconset");
mkdirSync(iconset);

function resize(size, output) {
  execFileSync(
    "sips",
    [
      "-z",
      String(size),
      String(size),
      path.join(resources, "icon.png"),
      "--out",
      output,
    ],
    { stdio: "ignore" },
  );
}

try {
  const logo = readFileSync(
    path.join(resources, "../src/assets/pine-logo.svg"),
    "utf8",
  );
  // Legacy Electron PNG/ICNS icons need their own transparent margin and contour.
  // The 832 px tile sits inside a 1024 px canvas. The mark occupies ~76% of
  // the tile, optically centered using the artwork's bounds, not its old canvas.
  const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
    <path fill="#111111" d="M326 96H698C799 96 849 96 888.5 135.5C928 175 928 225 928 326V698C928 799 928 849 888.5 888.5C849 928 799 928 698 928H326C225 928 175 928 135.5 888.5C96 849 96 799 96 698V326C96 225 96 175 135.5 135.5C175 96 225 96 326 96Z"/>
    ${logo.replace("<svg ", '<svg x="184" y="184" ').replace('width="1000" height="1000"', 'width="656" height="656"')}
  </svg>`;
  writeFileSync(path.join(resources, "icon.svg"), icon);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 1024, height: 1024 },
      deviceScaleFactor: 1,
    });
    await page.setContent(
      `<style>html,body{margin:0;background:transparent}svg{display:block}</style>${icon}`,
    );
    await page.screenshot({
      path: path.join(resources, "icon.png"),
      omitBackground: true,
    });
  } finally {
    await browser.close();
  }
  for (const size of [16, 32, 128, 256, 512]) {
    resize(size, path.join(iconset, `icon_${size}x${size}.png`));
    resize(size * 2, path.join(iconset, `icon_${size}x${size}@2x.png`));
  }
  execFileSync("iconutil", [
    "-c",
    "icns",
    iconset,
    "-o",
    path.join(resources, "icon.icns"),
  ]);

  // ICO supports PNG payloads; include each common Windows display size.
  const sizes = [16, 32, 48, 64, 128, 256];
  const images = sizes.map((size) => {
    const output = path.join(temporary, `${size}.png`);
    resize(size, output);
    return readFileSync(output);
  });
  const directory = Buffer.alloc(6 + 16 * sizes.length);
  directory.writeUInt16LE(1, 2);
  directory.writeUInt16LE(sizes.length, 4);
  let offset = directory.length;
  images.forEach((image, index) => {
    const entry = 6 + index * 16;
    directory[entry] = sizes[index] % 256;
    directory[entry + 1] = sizes[index] % 256;
    directory.writeUInt16LE(1, entry + 4);
    directory.writeUInt16LE(32, entry + 6);
    directory.writeUInt32LE(image.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += image.length;
  });
  writeFileSync(
    path.join(resources, "icon.ico"),
    Buffer.concat([directory, ...images]),
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
