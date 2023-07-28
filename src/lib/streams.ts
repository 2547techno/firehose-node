import { URLSearchParams } from "url";
import { writeFileSync } from "fs";
import { config } from "./config";

const TOKEN = config.twitch.token;
const CID = config.twitch.cid;
const CHANNEL_LIMIT = config.twitch.list.max;

async function getStreams(cursor: string) {
    const url = new URL("https://api.twitch.tv/helix/streams");

    const params = new URLSearchParams();
    params.append("first", "100");
    params.append("type", "live");
    if (cursor) {
        params.append("after", cursor);
    }

    url.search = params.toString();

    const res = await fetch(url, {
        headers: {
            authorization: `Bearer ${TOKEN}`,
            "client-id": CID,
        },
    });

    return res;
}

export async function getAllStreams() {
    let cursor;
    const channels = [];
    while (channels.length < CHANNEL_LIMIT) {
        const streamsRes = await getStreams(cursor);

        const json = await streamsRes.json();
        cursor = json.pagination.cursor;
        for (const ch of json.data) {
            channels.push(ch.user_login);
        }

        if (!cursor) {
            console.log(json);
            break;
        }
    }

    const out = [];
    const set = new Set<string>();

    // make unique
    for (const channel of channels) {
        if (!set.has(channel)) {
            set.add(channel);
            out.push(channel);
        }
    }

    writeFileSync("channels-current.txt", out.join("\n"));
    cursor = null;
    return set;
}
