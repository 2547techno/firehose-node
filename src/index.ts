import { Auth, Connection, Queue } from "./lib/connections";
import { IRCMessage } from "irc-message-ts";
import { readFileSync } from "fs";
import { firehoseChannels, joinPartDiffStreams } from "./lib/streams";
import { config } from "./lib/config";
import { initAMQP, messageEvent } from "./amqp";
import { initREST } from "./rest";

const suspendedChannels = new Set<string>();
const channelsBannedIn = new Set<string>();
const MAX_CHANNELS_PER_CONNECTIONS = config.connection.maxChannels;
export const connections: Connection[] = [];
export const connectionQueue = new Queue(
    MAX_CHANNELS_PER_CONNECTIONS,
    config.connection.queueInterval
);
let auth: Auth;
if (!config.twitch?.username || !config.twitch?.token) {
    auth = {
        username: "justinfan123",
    };
    console.log("[AUTH] Anon Connection");
} else {
    auth = {
        username: config.twitch.username,
        password: `oauth:${config.twitch.token}`,
    };
    console.log("[AUTH] Using", config.twitch.username);
}

connectionQueue.addListener("batch", (batch: string[]) => {
    for (const connection of connections) {
        const space = connection.maxChannels - connection.channels.size;

        connection.joinChannels(batch.splice(0, space));
    }

    if (batch.length === 0) return;

    const conn = new Connection(batch, MAX_CHANNELS_PER_CONNECTIONS, auth);

    conn.addListener("close", ({ code }) => {
        const i = connections.indexOf(conn);
        console.log(`[CONNECTION] Close connections[${i}] | code: ${code}`);
        connections.splice(i, 1);
    });

    conn.addListener("join", (channelName) => {
        if (config.print?.join) {
            console.log(`JOINED #${channelName}`);
        }
    });

    conn.addListener("part", (channelName) => {
        if (config.print?.part) {
            console.log(`PART #${channelName}`);
        }
        if (conn.getChannelCount() === 0) {
            connections.splice(connections.indexOf(conn), 1);
        }
    });

    conn.addListener("channelSuspended", (channelName) => {
        console.log(`SUSPENDED #${channelName}`);
        suspendedChannels.add(channelName);

        if (conn.getChannelCount() === 0) {
            connections.splice(connections.indexOf(conn), 1);
        }

        setTimeout(() => {
            suspendedChannels.delete(channelName);
        }, 60_000);
    });

    conn.addListener("banned", (channelName) => {
        if (config.print?.banned) {
            console.log(`BANNED #${channelName}`);
        }
        channelsBannedIn.add(channelName);
    });

    conn.addListener("channelTimeout", (channelName) => {
        if (
            suspendedChannels.has(channelName) ||
            channelsBannedIn.has(channelName)
        )
            return;
        console.log(`TIMEOUT #${channelName}`);

        if (conn.getChannelCount() === 0) {
            connections.splice(connections.indexOf(conn), 1);
        }
    });

    conn.addListener("PRIVMSG", (message: IRCMessage) => {
        messageEvent.emit("message", message.raw);
    });

    connections.push(conn);
});

function initIntervals() {
    setInterval(() => {
        let channelCount = 0;
        for (const conn of connections) {
            channelCount += conn.getChannelCount();
        }

        console.log(
            `[CONNECTIONS] Size: ${connections.length} | Channels: ${channelCount} | Queue Size: ${connectionQueue.q.length}`
        );
    }, 5_000);

    setInterval(() => {
        console.log(
            `[CONNECTIONS] Sending pings for ${connections.length} clients`
        );
        for (const conn of connections) {
            conn.ping();
        }
    }, 60_000 * 5);
}

function loadEnv() {
    if (process.env.FILE) {
        console.log("[FILE] Load channels file:", process.env.FILE);
        const file = readFileSync(process.env.FILE);
        const channelNames = file.toString().split("\n");
        for (const channelName of channelNames) {
            firehoseChannels.add(channelName);
        }
    }
}

async function main() {
    await initREST();
    await initAMQP();
    loadEnv();
    initIntervals();
    joinPartDiffStreams();
}

main();
