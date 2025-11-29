const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");
const cheerio = require("cheerio");

const manifest = {
  id: "community.subsro",
  version: "3.0.0",
  name: "SubsRO + Fallback RO",
  description: "Subtitrări românești de pe subs.ro + OpenSubtitles (funcțional 2025)",
  resources: ["subtitles"],
  types: ["movie", "series"],
  idPrefixes: ["tt"],
  catalogs: [],
  behaviorHints: { adult: false, p2p: false }
};

const builder = new addonBuilder(manifest);

// Subs.ro scraper
async function getSubsRO(imdb, season = null, episode = null) {
  const subs = [];
  let q = imdb;
  if (season && episode) q = `${imdb} sezonul ${season} episodul ${episode}`;

  try {
    const { data } = await axios.get(`https://subs.ro/?s=${encodeURIComponent(q)}`, { timeout: 10000 });
    const $ = cheerio.load(data);
    for (const el of $(".search-item").toArray()) {
      const link = $(el).find("h2 a").attr("href");
      if (!link) continue;
      try {
        const p = await axios.get(link, { timeout: 8000 });
        const $p = cheerio.load(p.data);
        const srt = $p('a[href$=".srt"]').first().attr("href");
        if (srt) {
          const url = srt.startsWith("http") ? srt : new URL(srt, link).href;
          subs.push({ lang: "ron", id: url, url });
        }
      } catch {}
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
    data.slice(0, 8).forEach(s => {
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