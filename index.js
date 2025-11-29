const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");
const cheerio = require("cheerio");

const manifest = {
  id: "community.subtitrari-noi",
  version: "1.0.0",
  name": "Subtitrari-Noi.ro",
  description": "Subtitrări românești de pe subtitrari-noi.ro (2025)",
  resources: ["subtitles"],
  types: ["movie", "series"],
  idPrefixes: ["tt"],
  catalogs: [],
  behaviorHints: { adult: false, p2p: false }
};

const builder = new addonBuilder(manifest);

// Căutare pe subtitrari-noi.ro
async function getSubsNoi(imdb, season = null, episode = null) {
  const subs = [];
  let query = imdb;
  if (season && episode) query += ` sezonul ${season} episodul ${episode}`;

  try {
    const { data } = await axios.get(`https://www.subtitrari-noi.ro/index.php?s=${encodeURIComponent(query)}`, {
      timeout: 10000,
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    const $ = cheerio.load(data);

    $("div.post").each((i, el) => {
      const title = $(el).find("h2 a").text().trim();
      const link = $(el).find("h2 a").attr("href");
      if (!link || !title.toLowerCase().includes("română")) return;

      const srtMatch = $(el).find("a").attr("href");
      if (srtMatch && srtMatch.includes(".srt")) {
        const full = srtMatch.startsWith("http") ? srtMatch : `https://www.subtitrari-noi.ro${srtMatch}`;
        subs.push({ lang: "ron", id: full, url: full });
      }
    });
  } catch (e) {}

  return subs;
}

// Fallback OpenSubtitles
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

  let subs = await getSubsNoi(imdb, season, episode);
  if (subs.length === 0) subs = await getOpenSubtitles(imdb);

  return { subtitles: subs };
});

module.exports = (req, res) => serveHTTP(builder.getInterface(), { req, res });