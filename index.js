const { addonBuilder } = require("stremio-addon-sdk");
const fetch = require("node-fetch");
const AdmZip = require("adm-zip");
const express = require("express");

const manifest = require("./manifest.json");
const addon = new addonBuilder(manifest);

function subsRoUrl(titleId) {
    return `https://subs.ro/subtitrare/descarca/${titleId}`;
}

async function downloadAndExtractSrt(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("Failed to download ZIP");

        const buffer = await response.buffer();
        const zip = new AdmZip(buffer);
        const entries = zip.getEntries();

        for (let e of entries) {
            if (e.entryName.toLowerCase().endsWith(".srt")) {
                return zip.readAsText(e);
            }
        }

        throw new Error("No .srt file found inside ZIP");
    } catch (err) {
        console.error("Error extracting SRT:", err);
        return null;
    }
}

addon.defineSubtitlesHandler(async ({ type, id }) => {
    console.log("Request subtitles for:", type, id);

    // ID trebuie să fie de forma:  subsro:xxxxxx
    if (!id.startsWith("subsro:")) {
        return { subtitles: [] };
    }

    const titleId = id.replace("subsro:", "");

    const url = subsRoUrl(titleId);
    const srtText = await downloadAndExtractSrt(url);

    if (!srtText) {
        return { subtitles: [] };
    }

    return {
        subtitles: [
            {
                id: "subsro-" + titleId,
                url: `https://stremio-subsro-addon.onrender.com/srt/${titleId}`,
                lang: "ro",
                title: "Subs.RO"
            }
        ]
    };
});

// Server Express pentru a servi fișierul SRT real
const app = express();

app.get("/srt/:id", async (req, res) => {
    const titleId = req.params.id;
    const url = subsRoUrl(titleId);
    const srtText = await downloadAndExtractSrt(url);

    if (!srtText) {
        return res.status(404).send("SRT not found");
    }

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.send(srtText);
});

app.get("/manifest.json", (req, res) => {
    res.send(manifest);
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("Subs.RO Addon running on port " + PORT);
});
