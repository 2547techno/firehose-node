import { URLSearchParams } from "url";
import { writeFileSync } from "fs";
import { config } from "./config";
import { connections, connectionQueue } from "..";
export let liveChannels = new Set<string>();

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
        if (!streamsRes.ok) {
            console.log("[STREAMS] Get list status:", streamsRes.status);
            break;
        }

        const json = await streamsRes.json();
        cursor = json.pagination?.cursor;
        for (const ch of json.data) {
            channels.push(ch.user_login);
        }

        if (!cursor) {
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

export async function updateStreams() {
    // eslint-disable-next-line no-constant-condition
    while (true) {
        liveChannels = await getAllStreams();
    }
}

export async function joinPartDiffStreams() {
    // eslint-disable-next-line no-constant-condition
    while (true) {
        console.log("[STREAMS] Live channels:", liveChannels.size);
        const connectedChannels = new Set<string>();
        for (const conn of connections) {
            for (const channel of conn.channels.keys()) {
                connectedChannels.add(channel);
            }
        }

        const channelsToPart: string[] = [];
        for (const connectedChannel of connectedChannels) {
            if (!liveChannels.has(connectedChannel)) {
                channelsToPart.push(connectedChannel);
            }
        }

        for (const conn of connections) {
            conn.partChannels(channelsToPart);
        }
        console.log("[STREAMS] Parting", channelsToPart.length, "channels");

        let count = 0;
        for (const channelName of liveChannels) {
            if (!connectedChannels.has(channelName)) {
                connectionQueue.push(channelName);
                count++;
            }
        }
        console.log("[STREAMS] Added", count, "channels to queue");
        await connectionQueue.waitUntilEmpty();
        console.log("[STREAMS] Queue empty");
    }
}
