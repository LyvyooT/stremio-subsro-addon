// ================================
// FULL RENDER-READY STREMIO ADDON
// ================================
// Structură completă pentru hosting pe Render
// Include server Express, extragere SRT, manifest și endpoints
// ================================

import { addonBuilder } from "stremio-addon-sdk";
import fetch from "node-fetch";
import AdmZip from "adm-zip";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import express from "express";

// ================================
// MANIFEST
// ================================
const manifest = {
  id: "subsro.addon",
  version: "1.0.0",
  name: "Subs.ro Addon",
  description: "Subtitrări de pe subs.ro pentru Stremio (hostabil pe Render)",
  types: ["movie", "series"],
  resources: ["subtitles"],
  idPrefixes: ["tt"],
  catalogs: []
};

const builder = new addonBuilder(manifest);

// ================================
// SRT extraction logic
// ================================
const TMP_DIR = path.join(process.cwd(), "tmp_subs");
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR);

async function fetchAndExtractSrt(downloadUrl) {
  const id = crypto.randomBytes(8).toString("hex");
  const zipPath = path.join(TMP_DIR, `${id}.zip`);
  const srtPath = path.join(TMP_DIR, `${id}.srt`);

  const res = await fetch(downloadUrl);
  if (!res.ok) return null;
  const buf = await res.arrayBuffer();
  fs.writeFileSync(zipPath, Buffer.from(buf));

  const zip = new AdmZip(zipPath);
  const entry = zip.getEntries().find(e => e.entryName.toLowerCase().endsWith(".srt"));
  if (!entry) return null;

  fs.writeFileSync(srtPath, zip.readFile(entry));
  return `/local/${id}.srt`;
}

// ================================
// subs.ro API lookup (scraping/endpoint – to be replaced with real API)
// ================================
async function getSubs(imdbId) {
  const apiUrl = `https://subs.ro/api/subs?imdb=${imdbId}`; // placeholder

  try {
    const res = await fetch(apiUrl);
    if (!res.ok) return [];

    const data = await res.json();
    const out = [];

    for (const sub of data.subtitles) {
      const localSrt = await fetchAndExtractSrt(sub.download);
      if (localSrt) {
        out.push({ id: sub.id, url: localSrt, lang: "ro", type: "srt" });
      }
    }

    return out;
  } catch (e) {
    console.error("Eroare subs.ro:", e);
    return [];
  }
}

// ================================
// Stremio handler
// ================================
builder.defineSubtitlesHandler(async ({ id }) => {
  const imdb = id.split(":")[0];
  const subs = await getSubs(imdb);
  return { subtitles: subs };
});

// ================================
// EXPRESS SERVER FOR RENDER
// ================================
const app = express();

// Static files (.srt)
app.use("/local", express.static(TMP_DIR));

// Manifest
app.get("/manifest.json", (req, res) => {
  res.json(builder.getManifest());
});

// Subtitles endpoint
app.get("/subtitles/:type/:id.json", async (req, res) => {
  const { id } = req.params;
  const { subtitles } = await builder.getInterface().subtitles({ id });
  res.json({ subtitles });
});

// Start server
const PORT = process.env.PORT || 7000;
app.listen(PORT, () => console.log(`Addon subs.ro rulează pe portul ${PORT}`));
