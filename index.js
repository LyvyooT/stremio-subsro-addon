// ================================
// STREMIO SUBS.RO ADDON – VERSION FIXED FOR RENDER
// ================================
// ✔ Serves manifest.json corect pe Render
// ✔ Compatibil cu Stremio (HTTPS, CORS ok)
// ✔ Server Express robust
// ✔ SRT extraction + caching
// ================================

import { addonBuilder } from "stremio-addon-sdk";
import fetch from "node-fetch";
import AdmZip from "adm-zip";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import express from "express";
import cheerio from "cheerio";
import cors from "cors";

// ================================
// MANIFEST
// ================================
const manifest = {
  id: "subsro.addon",
  version: "1.2.0",
  name: "Subs.ro Addon",
  description: "Subtitrări subs.ro pentru Stremio (suport Render fix)",
  types: ["movie", "series"],
  resources: ["subtitles"],
  idPrefixes: ["tt"],
  catalogs: []
};

const builder = new addonBuilder(manifest);

// ================================
// TEMP DIR
// ================================
const TMP_DIR = path.join(process.cwd(), "tmp_subs");
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR);

// ================================
// DOWNLOAD + EXTRACT
// ================================
async function fetchAndExtractSrt(downloadUrl) {
  try {
    const id = crypto.randomBytes(8).toString("hex");
    const zipPath = path.join(TMP_DIR, `${id}.zip`);
    const srtPath = path.join(TMP_DIR, `${id}.srt`);

    const res = await fetch(downloadUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 Stremio-Addon' }
    });
    if (!res.ok) return null;

    const buf = await res.arrayBuffer();
    fs.writeFileSync(zipPath, Buffer.from(buf));

    const zip = new AdmZip(zipPath);
    const entry = zip.getEntries().find(e => e.entryName.toLowerCase().endsWith(".srt"));
    if (!entry) return null;

    fs.writeFileSync(srtPath, zip.readFile(entry));
    return `/local/${id}.srt`;
  } catch (err) {
    console.error("SRT extract error:", err);
    return null;
  }
}

// ================================
// SCRAPING SUBS.RO
// ================================
async function getSubs(imdbId) {
  try {
    const numericId = imdbId.replace(/^tt/, "");
    const searchUrl = `https://subs.ro/subtitrari/imdbid/${numericId}`;

    const res = await fetch(searchUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 Stremio-Addon' }
    });
    if (!res.ok) return [];

    const html = await res.text();
    const $ = cheerio.load(html);

    const links = [];
    $('a').each((i, el) => {
      const href = $(el).attr('href');
      if (href && href.includes('/subtitrare/descarca/')) {
        const url = href.startsWith('http') ? href : `https://subs.ro${href}`;
        links.push(url);
      }
    });

    const results = [];

    for (const link of links) {
      const localUrl = await fetchAndExtractSrt(link);
      if (localUrl) {
        results.push({
          id: crypto.randomBytes(5).toString("hex"),
          url: localUrl,
          lang: "ro",
          type: "srt"
        });
      }
    }

    return results;
  } catch (err) {
    console.error("Subs.ro scraping error:", err);
    return [];
  }
}

// ================================
// STREMIO HANDLER
// ================================
builder.defineSubtitlesHandler(async ({ id }) => {
  const imdb = id.split(":")[0];
  const subs = await getSubs(imdb);
  return { subtitles: subs };
});

// ================================
// EXPRESS SERVER (FIX FOR RENDER)
// ================================
const app = express();

// FIX CORS — NECESAR pentru Stremio
app.use(cors());
app.use('/local', express.static(TMP_DIR));

// MANIFEST JSON
app.get('/manifest.json', (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.send(JSON.stringify(builder.getManifest()));
});

// SUBTITLES ROUTE (for old Stremio clients)
app.get('/subtitles/:type/:id.json', async (req, res) => {
  const { id } = req.params;
  const out = await builder.getInterface().subtitles({ id });
  res.json(out);
});

// ROOT — optional info
app.get('/', (req, res) => {
  res.send("Stremio Subs.ro Addon — Running ✔");
});

const PORT = process.env.PORT || 3000;  // Render folosește ALT port automat
app.listen(PORT, () => console.log(`✔ Subs.ro Addon live pe port ${PORT}`));
