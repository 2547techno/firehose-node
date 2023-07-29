import { Connection, Queue } from "./lib/connections";
import { IRCMessage } from "irc-message-ts";
import { readFileSync } from "fs";
import { joinPartDiffStreams, updateStreams } from "./lib/streams";
import { config } from "./lib/config";
import { initAMQP, messageEvent } from "./amqp";
import { initREST } from "./rest";

const suspendedChannels = new Set<string>();
const channelsBannedIn = new Set<string>();
const MAX_CHANNELS_PER_CONNECTIONS = config.connections.maxChannels;
export const connections: Connection[] = [];
export const connectionQueue = new Queue(
    MAX_CHANNELS_PER_CONNECTIONS,
    config.connections.queueInterval
);
connectionQueue.addListener("batch", (batch: string[]) => {
    for (const connection of connections) {
        const space = connection.maxChannels - connection.channels.size;

        connection.joinChannels(batch.splice(0, space));
    }

    if (batch.length === 0) return;

    const conn = new Connection(batch, MAX_CHANNELS_PER_CONNECTIONS, {
        username: config.twitch.username,
        password: `oauth:${config.twitch.token}`,
    });

    conn.addListener("close", ({ code }) => {
        const i = connections.indexOf(conn);
        console.log(`\n[CONNECTION] Close connections[${i}] | code: ${code}`);
        connections.splice(i, 1);
    });

    conn.addListener("join", (channelName) => {
        if (config.connections.print.join) {
            console.log(`\nJOINED #${channelName}`);
        }
    });

    conn.addListener("part", (channelName) => {
        if (config.connections.print.part) {
            console.log(`\nPART #${channelName}`);
        }
        if (conn.getChannelCount() === 0) {
            connections.splice(connections.indexOf(conn), 1);
        }
    });

    conn.addListener("channelSuspended", (channelName) => {
        console.log(`\nSUSPENDED #${channelName}`);
        suspendedChannels.add(channelName);

        if (conn.getChannelCount() === 0) {
            connections.splice(connections.indexOf(conn), 1);
        }

        setTimeout(() => {
            suspendedChannels.delete(channelName);
        }, 60_000);
    });

    conn.addListener("banned", (channelName) => {
        if (config.connections.print.banned) {
            console.log(`\nBANNED #${channelName}`);
        }
        channelsBannedIn.add(channelName);
    });

    conn.addListener("channelTimeout", (channelName) => {
        if (
            suspendedChannels.has(channelName) ||
            channelsBannedIn.has(channelName)
        )
            return;
        console.log(`\nTIMEOUT #${channelName}`);

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
            `\n[CONNECTIONS] Sending pings for ${connections.length} clients`
        );
        for (const conn of connections) {
            conn.ping();
        }
    }, 60_000 * 5);
}

function loadEnvFunctions() {
    if (process.env.FILE) {
        console.log("[FILE] Load channels file:", process.env.FILE);
        const file = readFileSync(process.env.FILE);
        const channelNames = file.toString().split("\n");
        for (const channelName of channelNames) {
            connectionQueue.push(channelName);
        }
    }

    if (process.env.STANDALONE_LIST) {
        updateStreams();
        joinPartDiffStreams();
    }
}

function main() {
    initREST();
    initAMQP();
    initIntervals();
    loadEnvFunctions();
}

main();
