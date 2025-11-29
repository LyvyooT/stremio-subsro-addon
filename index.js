const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");
const cheerio = require("cheerio");

// ======================== MANIFEST ========================
const manifest = {
  id: "community.subsro",
  version: "2.5.0",
  name: "SubsRO + OpenSubtitles RO",
  description: "Subtitrări românești de pe subs.ro + fallback OpenSubtitles (2025)",
  resources: ["subtitles"],
  types: ["movie", "series"],
  idPrefixes: ["tt"],
  catalogs: [],
  behaviorHints: { adult: false, p2p: false }
};

const builder = new addonBuilder(manifest);

// ======================== HELPER ========================
async function searchSubsRO(imdbId, season = null, episode = null) {
  const subs = [];
  let query = imdbId;
  if (season && episode) query = `${imdbId} sezonul ${season} episodul ${episode}`;

  try {
    const { data } = await axios.get(`https://subs.ro/?s=${encodeURIComponent(query)}`, {
      timeout: 9000,
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    const $ = cheerio.load(data);

    for (const el of $(".search-item").toArray()) {
      const title = $(el).find("h2 a").text().trim();
      const pageUrl = $(el).find("h2 a").attr("href");
      if (!pageUrl || !title.toLowerCase().includes("română")) continue;

      const page = await axios.get(pageUrl, { timeout: 8000 });
      const $p = cheerio.load(page.data);
      let srt = $p('a.download-button, a[href$=".srt"]').first().attr("href");

      if (srt && !srt.startsWith("http")) srt = new URL(srt, pageUrl).href;
      if (srt && srt.includes(".srt")) {
        subs.push({ lang: "ron", id: srt, url: srt });
      }
    }
  } catch (e) {
    console.log("subs.ro error:", e.message);
  }
  return subs;
}

// Fallback OpenSubtitles (fără API key – folosește endpoint public)
async function fallbackOpenSubtitles(imdbId, season = null, episode = null) {
  const subs = [];
  try {
    const query = season ? `${imdbId} S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}` : imdbId;
    const url = `https://rest.opensubtitles.org/search/imdbid-${imdbId}/sublanguageid-ron`;
    const { data } = await axios.get(url, {
      headers: { "User-Agent": "TemporaryUserAgent", "X-User-Agent": "TemporaryUserAgent" },
      timeout: 8000
    });
    data.slice(0, 10).forEach(s => {
      if (s.SubFormat === "srt") {
        subs.push({ lang: "ron", id: s.SubDownloadLink.replace(".gz", ".srt"), url: s.SubDownloadLink.replace(".gz", ".srt") });
      }
    });
  } catch (e) { }
  return subs;
}

// ======================== HANDLER ========================
builder.defineSubtitlesHandler(async (args) => {
  const imdbId = args.id.split(":")[0];
  const season = args.type === "series" && args.id.includes(":") ? args.id.split(":")[1] : null;
  const episode = args.type === "series" && args.id.includes(":") ? args.id.split(":")[2] : null;

  let subtitles = await searchSubsRO(imdbId, season, episode);
  if (subtitles.length === 0) {
    subtitles = await fallbackOpenSubtitles(imdbId, season, episode);
  }

  return { subtitles };
});

// ======================== SERVER ========================
module.exports = (req, res) => serveHTTP(builder.getInterface(), { req, res });
