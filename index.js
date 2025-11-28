const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");
const cheerio = require("cheerio");

// ================================
// MANIFEST
// ================================
const manifest = {
  id: "community.subsro",
  version: "2.0.0",
  name: "SubsRO – Subtitrări Română",
  description: "Subtitrări românești direct de pe subs.ro (2025)",
  logo: "https://i.imgur.com/3t8iZ3k.png",
  background: "https://i.imgur.com/3t8iZ3k.png",
  types: ["movie", "series"],
  resources: ["subtitles"],
  idPrefixes: ["tt"],
  catalogs: [],
  behaviorHints: { adult: false, p2p: false }
};

const builder = new addonBuilder(manifest);

// ================================
// SCRAPING REAL subs.ro
// ================================
async function searchSubsRO(imdbId, season = null, episode = null) {
  const subtitles = [];

  try {
    let query = imdbId;
    if (season && episode) {
      query = `${imdbId} sezonul ${season} episodul ${episode}`;
    }

    const searchUrl = `https://subs.ro/?s=${encodeURIComponent(query)}`;
    const { data } = await axios.get(searchUrl, { timeout: 10000 });
    const $ = cheerio.load(data);

    for (const el of $('.search-item').toArray()) {
      const title = $(el).find('h2 a').text().trim();
      const pageUrl = $(el).find('h2 a').attr('href');

      if (!pageUrl || !title.toLowerCase().includes('română')) continue;

      // Intrăm pe pagina subtitrării să luăm link-ul direct .srt
      try {
        const pageRes = await axios.get(pageUrl, { timeout: 8000 });
        const $page = cheerio.load(pageRes.data);
        const downloadBtn = $page('a.download-button, a[href$=".srt"], a:contains("Descarcă")');

        let srtUrl = downloadBtn.attr('href');
        if (srtUrl && !srtUrl.startsWith('http')) {
          srtUrl = new URL(srtUrl, pageUrl).href;
        }

        if (srtUrl && srtUrl.includes('.srt')) {
          subtitles.push({
            lang: "ron",
            id: srtUrl,
            url: srtUrl
          });
        }
      } catch (e) {
        console.log("Eroare pagină individuală:", e.message);
      }
    }
  } catch (err) {
    console.error("Eroare căutare subs.ro:", err.message);
  }

  return subtitles;
}

// ================================
// STREMIO HANDLER
// ================================
builder.defineSubtitlesHandler(async (args) => {
  const { type, id } = args;
  const imdbId = id.split(":")[0];

  let season, episode;
  if (type === "series" && id.includes(":")) {
    const parts = id.split(":");
    season = parts[1];
    episode = parts[2];
  }

  const subtitles = await searchSubsRO(imdbId, season, episode);

  return { subtitles };
});

// ================================
// SERVER RENDER
// ================================
const interfaceHandler = builder.getInterface();
module.exports = (req, res) => {
  serveHTTP(interfaceHandler, { req, res });
};