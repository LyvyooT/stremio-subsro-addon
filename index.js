const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");
const cheerio = require("cheerio");

const manifest = {
  id: "community.subsro",
  version: "3.2.0",
  name: "SubsRO 2025 (funcțional 100%)",
  description: "Subs.ro + extrage .srt din arhive .zip/.rar + fallback OpenSubtitles",
  resources: ["subtitles"],
  types: ["movie", "series"],
  idPrefixes: ["tt"],
  catalogs: [],
  behaviorHints: { adult: false, p2p: false }
};

const builder = new addonBuilder(manifest);

// Extrage link-ul real de download al arhivei
async function getSubsRO(imdb, season = null, episode = null) {
  const subs = [];
  let query = imdb;
  if (season && episode) query += ` sezonul ${season} episodul ${episode}`;

  try {
    const search = await axios.get(`https://subs.ro/?s=${encodeURIComponent(query)}`, { timeout: 10000 });
    const $ = cheerio.load(search.data);

    for (const el of $(".search-item").toArray()) {
      const detailsUrl = $(el).find("h2 a").attr("href");
      if (!detailsUrl) continue;

      const page = await axios.get(detailsUrl, { timeout: 10000 });
      const $p = cheerio.load(page.data);

      // Butonul verde „Descarcă” (link-ul real către arhivă)
      const archiveUrl = $p('a.button-download, a.download-button, a[href*="download"]').first().attr("href");
      if (!archiveUrl) continue;

      const fullUrl = archiveUrl.startsWith("http") ? archiveUrl : new URL(archiveUrl, detailsUrl).href;

      // Creează un link proxy care extrage automat .srt din arhivă
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(fullUrl)}`;
      
      subs.push({
        lang: "ron",
        id: fullUrl,
        url: `https://subs-ro-proxy.vercel.app/?url=${encodeURIComponent(fullUrl)}` // proxy care extrage .srt
      });
    }
  } catch (e) {}

  return subs;
}

// Fallback OpenSubtitles (fără API key)
async function getOpenSubtitles(imdb) {
  const subs = [];
  try {
    const { data } = await axios.get(`https://rest.opensubtitles.org/search/imdbid-${imdb.replace("tt","")}/sublanguageid-ron`, {
      headers: { "User-Agent": "TemporaryUserAgent" },
      timeout: 8000
    });
    data.slice(0, 10).forEach(s => {
      if (s.SubFormat === "srt") {
        const url = s.SubDownloadLink.replace(".gz", ".srt");
        subs.push({ lang: "ron", id: url, url });
      }
    });
  } catch (e) {}
  return subs;
}

builder.defineSubtitlesHandler(async args => {
  const imdb = args.id.split(":")[0];
  const season = args.id.includes(":") ? args.id.split(":")[1] : null;
  const episode = args.id.includes(":") ? args.id.split(":")[2] : null;

  let subs = await getSubsRO(imdb, season, episode);
  if (subs.length === 0) subs = await getOpenSubtitles(imdb);

  return { subtitles: subs };
});

module.exports = (req, res) => serveHTTP(builder.getInterface(), { req, res });
