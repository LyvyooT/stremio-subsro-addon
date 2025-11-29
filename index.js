const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");
const cheerio = require("cheerio");
const AdmZip = require("adm-zip");

// ======================== MANIFEST ========================
const manifest = {
  id: "community.subsro-kodi",
  version: "1.0.0",
  name: "SubsRO Team Adaptat",
  description: "Subtitrări RO de pe subs.ro (adaptat din Kodi SubsRO Team)",
  resources: ["subtitles"],
  types: ["movie", "series"],
  idPrefixes": ["tt"],
  catalogs: [],
  behaviorHints: { adult: false, p2p: false }
};

const builder = new addonBuilder(manifest);

// ======================== HELPER ========================
async function getSubsRO(query) {
  const subs = [];

  try {
    const { data } = await axios.get(`https://subs.ro/?s=${encodeURIComponent(query)}`, { timeout: 10000 });
    const $ = cheerio.load(data);

    for (const el of $(".search-item").toArray()) {
      const detailsUrl = $(el).find("h2 a").attr("href");
      if (!detailsUrl) continue;

      const page = await axios.get(detailsUrl, { timeout: 10000 });
      const $p = cheerio.load(page.data);

      // Butonul verde „Descarcă" (arhivă .zip/.rar)
      const archiveUrl = $p('a.button-download, a[href*="download"]').first().attr("href");
      if (archiveUrl) {
        const fullUrl = archiveUrl.startsWith("http") ? archiveUrl : new URL(archiveUrl, detailsUrl).href;
        subs.push({ lang: "ron", id: fullUrl, url: fullUrl }); // Stremio va descărca și extrage
      }
    }
  } catch (e) { }
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
    data.slice(0, 8).forEach(s => {
      if (s.SubFormat === "srt") {
        const url = s.SubDownloadLink.replace(".gz", ".srt");
        subs.push({ lang: "ron", id: url, url });
      }
    });
  } catch (e) { }
  return subs;
}

builder.defineSubtitlesHandler(async args => {
  const imdb = args.id.split(":")[0];
  const season = args.id.includes(":") ? args.id.split(":")[1] : null;
  const episode = args.id.includes(":") ? args.id.split(":")[2] : null;

  let query = imdb;
  if (season && episode) query += ` sezonul ${season} episodul ${episode}`;

  let subs = await getSubsRO(query);
  if (subs.length === 0) subs = await getOpenSubtitles(imdb);

  return { subtitles: subs };
});

module.exports = (req, res) => serveHTTP(builder.getInterface(), { req, res });
