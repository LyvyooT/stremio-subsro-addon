const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");
const cheerio = require("cheerio");

// Config
const BASE_URL = "https://subs.ro";
const CACHE_MAX_AGE = 60 * 60 * 24; // 24 ore

const builder = new addonBuilder({
    id: "org.subsro.stremio",
    version: "2.0.0",
    name: "Subs.ro Subtitrări RO",
    description: "Cele mai bune subtitrări românești direct de pe subs.ro",
    catalogs: [],
    resources: ["subtitles"],
    types: ["movie", "series"],
    idPrefixes: ["tt", "kitsu", "mal"],
    icon: "https://i.imgur.com/5n1p7Qm.png",
    background: "https://i.imgur.com/5n1p7Qm.png",
    behaviorHints: {
        adult: false,
        configurable: false
    }
});

builder.defineSubtitlesHandler(async (args) => {
    const { type, id, movie_title, season, episode } = args;

    if (type !== "movie" && type !== "series") return { subtitles: [] };

    const query = type === "movie" 
        ? encodeURIComponent(movie_title || id.replace("tt", ""))
        : encodeURIComponent(`${movie_title || id.replace("tt", "")} S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}`);

    const searchUrl = `${BASE_URL}/?s=${query}`;

    try {
        const { data } = await axios.get(searchUrl, { 
            timeout: 8000,
            headers: { "User-Agent": "Mozilla/5.0" }
        });
        const $ = cheerio.load(data);
        
        const subtitles = [];

        $("article").each((i, el) => {
            const link = $(el).find("a").first();
            const title = link.text().trim();
            const url = link.attr("href");

            if (!url || !title) return;

            // Detectăm calitate și tip release
            const releaseInfo = title.toLowerCase();
            let quality = "unknown";
            if (releaseInfo.includes("2160p") || releaseInfo.includes("4k")) quality = "2160p";
            else if (releaseInfo.includes("1080p")) quality = "1080p";
            else if (releaseInfo.includes("720p")) quality = "720p";
            else if (releaseInfo.includes("480p")) quality = "480p";

            // Extragem linkul direct către .srt
            const srtMatch = $(el).html().match(/href="(https:\/\/[^"]+\.srt)"/);
            if (srtMatch) {
                subtitles.push({
                    lang: "ron",
                    id: srtMatch[1],
                    url: srtMatch[1],
                    name: `Subs.ro • ${title.split("–")[0].trim()}`
                });
            }
        });

        // Sortăm după calitate (mai bună întâi)
        const qualityOrder = { "2160p": 4, "1080p": 3, "720p": 2, "480p": 1, "unknown": 0 };
        subtitles.sort((a, b) => {
            const qa = qualityOrder[a.name.match(/(2160p|1080p|720p|480p)/i)?.[0]?.toLowerCase() || "unknown"] || 0;
            const qb = qualityOrder[b.name.match(/(2160p|1080p|720p|480p)/i)?.[0]?.toLowerCase() || "unknown"] || 0;
            return qb - qa;
        });

        return { 
            subtitles,
            cacheMaxAge: CACHE_MAX_AGE
        };

    } catch (err) {
        console.error("Subs.ro error:", err.message);
        return { subtitles: [] };
    }
});

// Pornim serverul
const port = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port });
console.log(`Subs.ro Addon rulează pe port ${port}`);
console.log(`Instalează-l în Stremio cu: http://127.0.0.1:${port}/manifest.json (sau domeniul tău)`);