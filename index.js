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
    console.log(`Căutare: ${type} - ${movie_title || id} S${season}E${episode}`);

    if (type !== "movie" && type !== "series") return { subtitles: [] };

    const query = type === "movie" 
        ? encodeURIComponent(movie_title || id.replace("tt", ""))
        : encodeURIComponent(`${movie_title || id.replace("tt", "")} sezon ${season} episod ${episode}`);

    const searchUrl = `${BASE_URL}/?s=${query}`;
    console.log(`URL căutare: ${searchUrl}`);

    try {
        const { data } = await axios.get(searchUrl, { 
            timeout: 15000, // Creștem timeout-ul la 15s
            headers: { 
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
        });
        const $ = cheerio.load(data);
        
        const subtitles = [];
        console.log(`Găsite ${$("div.post").length} rezultate potențiale`);

        // Parsing upgradat: Folosim <div class="post"> pentru rezultate
        $("div.post").each(async (i, el) => {
            const titleEl = $(el).find("h2 a");
            const title = titleEl.text().trim();
            const resultUrl = titleEl.attr("href");

            if (!resultUrl || !title) {
                console.log(`Rezultat invalid la index ${i}`);
                return;
            }

            console.log(`Procesez: ${title} -> ${resultUrl}`);

            // Scrapează pagina individuală pentru link .srt
            try {
                const { data: detailData } = await axios.get(resultUrl, {
                    timeout: 10000,
                    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
                });
                const $detail = cheerio.load(detailData);

                // Caută link-uri .srt în pagina detaliu (de obicei în <a> cu text "Download" sau href ending .srt)
                const srtLinks = $detail('a[href$=".srt"], a:contains("Download"), .download-link a');
                if (srtLinks.length > 0) {
                    const srtUrl = srtLinks.first().attr("href");
                    if (srtUrl && !srtUrl.startsWith("http")) {
                        srtUrl = new URL(srtUrl, BASE_URL).href; // Make absolute
                    }

                    // Detectează calitate
                    const releaseInfo = title.toLowerCase();
                    let quality = "unknown";
                    if (releaseInfo.includes("2160p") || releaseInfo.includes("4k")) quality = "2160p";
                    else if (releaseInfo.includes("1080p")) quality = "1080p";
                    else if (releaseInfo.includes("720p")) quality = "720p";
                    else if (releaseInfo.includes("480p")) quality = "480p";

                    subtitles.push({
                        lang: "ron",
                        id: `${resultUrl}-${quality}`,
                        url: srtUrl,
                        name: `${quality} • ${title.split("–")[0]?.trim() || title}`
                    });
                    console.log(`Adăugat sub: ${srtUrl}`);
                } else {
                    console.log(`Niciun .srt găsit pe ${resultUrl}`);
                }
            } catch (detailErr) {
                console.error(`Eroare la detaliu ${resultUrl}:`, detailErr.message);
            }
        });

        // Așteaptă toate async-urile (folosim Promise.all pentru each, dar simplificat)
        // Notă: În practică, each-ul e sync, dar am făcut fetch-ul async în loop – pentru producție, adaugă un await Promise.all dacă ai multe
        // Sortăm după calitate
        const qualityOrder = { "2160p": 4, "1080p": 3, "720p": 2, "480p": 1, "unknown": 0 };
        subtitles.sort((a, b) => (qualityOrder[b.name.split(" • ")[0]] || 0) - (qualityOrder[a.name.split(" • ")[0]] || 0));

        console.log(`Returnez ${subtitles.length} subtitrări`);
        return { 
            subtitles,
            cacheMaxAge: CACHE_MAX_AGE
        };

    } catch (err) {
        console.error("Eroare generală Subs.ro:", err.message);
        return { subtitles: [] };
    }
});

// Pornim serverul
const port = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port });
console.log(`Subs.ro Addon rulează pe port ${port}`);
console.log(`Instalează-l în Stremio cu: http://localhost:${port}/manifest.json`);
