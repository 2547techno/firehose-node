import { Connection, Queue } from "./lib/connections";
import { IRCMessage } from "irc-message-ts";
import Express, { Request, Response, json } from "express";
import { readFileSync } from "fs";
import { getAllStreams } from "./lib/streams";
import { EventEmitter } from "events";
import { config } from "./lib/config";
import amqplib from "amqplib/callback_api";

const app = Express();
const PORT = process.env.PORT ?? 3001;
const MAX_CHANNELS_PER_CONNECTIONS = config.connections.maxChannels;
const QUEUE_NAME = config.amqp.queueName;
const connections: Connection[] = [];
const connectionQueue = new Queue(
    MAX_CHANNELS_PER_CONNECTIONS,
    config.connections.queueInterval
);
const suspendedChannels = new Set<string>();
const messageEvent = new EventEmitter();

const middleware = [json()];

app.post("/channels", middleware, (req: Request, res: Response) => {
    const channelNames: string[] = req.body.channels;
    if (!channelNames) {
        return res.status(400).json({
            message: "missing `channels` field",
        });
    }

    for (const channelName of channelNames) {
        connectionQueue.push(channelName);
    }

    res.send();
});

app.delete("/channels", middleware, (req: Request, res: Response) => {
    const channelNames: string[] = req.body.channels;
    if (!channelNames) {
        return res.status(400).json({
            message: "missing `channels` field",
        });
    }

    for (const conn of connections) {
        conn.partChannels(channelNames);
    }

    res.send();
});

app.listen(PORT, () => {
    console.log(`[EXPRESS] Listening on ${PORT}`);
});

amqplib.connect(
    `amqp://${config.amqp.user}:${config.amqp.password}@${config.amqp.url}`,
    (err, conn: amqplib.Connection) => {
        if (err) throw err;
        console.log("[AMQP] Connected to server");

        conn.createChannel((err, channel: amqplib.Channel) => {
            if (err) throw err;
            console.log("[AMQP] Connected to queue", QUEUE_NAME);

            channel.assertQueue(QUEUE_NAME);

            messageEvent.on("message", (message: string) => {
                channel.sendToQueue(QUEUE_NAME, Buffer.from(message));
            });
        });
    }
);

connectionQueue.addListener("batch", (batch: string[]) => {
    for (const connection of connections) {
        const space = connection.maxChannels - connection.channels.size;

        connection.joinChannels(batch.splice(0, space));
    }

    if (batch.length === 0) return;

    const conn = new Connection(batch, MAX_CHANNELS_PER_CONNECTIONS);

    conn.addListener("close", ({ code }) => {
        const i = connections.indexOf(conn);
        console.log(`\n[CONNECTION] Close connections[${i}] | code: ${code}`);
        connections.splice(i, 1);
    });

    conn.addListener("join", (channelName) => {
        // console.log(`\nJOINED #${channelName}`);
    });

    conn.addListener("part", (channelName) => {
        // console.log(`\nPART #${channelName}`);
        if (conn.getChannelCount() === 0) {
            connections.splice(connections.indexOf(conn), 1);
        }
    });

    conn.addListener("channelSuspended", (channelName) => {
        // console.log(`\nSUSPENDED #${channelName}`);
        suspendedChannels.add(channelName);

        if (conn.getChannelCount() === 0) {
            connections.splice(connections.indexOf(conn), 1);
        }

        setTimeout(() => {
            suspendedChannels.delete(channelName);
        }, 60_000);
    });

    conn.addListener("channelTimeout", (channelName) => {
        if (suspendedChannels.has(channelName)) return;
        console.log(`\nTIMEOUT #${channelName}`);

        if (conn.getChannelCount() === 0) {
            connections.splice(connections.indexOf(conn), 1);
        }
    });

    conn.addListener("PRIVMSG", (message: IRCMessage) => {
        // console.log("\n", new Date().toLocaleString(), message.raw, "\n");
        messageEvent.emit("message", message.raw);
    });

    connections.push(conn);
});

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

if (process.env.FILE) {
    console.log("[FILE] Load channels file:", process.env.FILE);
    const file = readFileSync(process.env.FILE);
    const channelNames = file.toString().split("\n");
    for (const channelName of channelNames) {
        connectionQueue.push(channelName);
    }
}

async function updateStreams() {
    // eslint-disable-next-line no-constant-condition
    while (true) {
        console.log("[STREAMS] Generating list of live streams");
        const channelNames = await getAllStreams();
        console.log(
            "[STREAMS] Generated list of live streams | Count:",
            channelNames.size
        );

        const connectedChannels = new Set<string>();
        for (const conn of connections) {
            for (const channel of conn.channels.keys()) {
                connectedChannels.add(channel);
            }
        }

        const channelsToPart: string[] = [];
        for (const connectedChannel of connectedChannels) {
            if (!channelNames.has(connectedChannel)) {
                channelsToPart.push(connectedChannel);
            }
        }

        for (const conn of connections) {
            conn.partChannels(channelsToPart);
        }
        console.log("[STREAMS] Parting", channelsToPart.length, "channels");

        let count = 0;
        for (const channelName of channelNames) {
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

if (process.env.STANDALONE_LIST) {
    updateStreams();
}
