import { Connection, Queue } from "./lib/connections";
import { IRCMessage } from "irc-message-ts";
import Express, { Request, Response, json } from "express";
import { readFileSync } from "fs";

const app = Express();
const PORT = process.env.PORT ?? 3001;
const connections: Connection[] = [];
const connectionQueue = new Queue(500, 6_000);
const suspendedChannels = new Set<string>();

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

connectionQueue.addListener("batch", (batch: string[]) => {
    const conn = new Connection(batch);

    conn.addListener("close", ({ code }) => {
        const i = connections.indexOf(conn);
        console.log(`\n[CONNECTION] Close connections[${i}] | code: ${code}`);
        connections.splice(i, 1);
    });

    conn.addListener("join", (channelName) => {
        // console.log(`\nJOINED #${channelName}`);
    });

    conn.addListener("part", (channelName) => {
        console.log(`\nPART #${channelName}`);
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

    conn.addListener("channelTimeout", (channelName) => {
        if (suspendedChannels.has(channelName)) return;
        console.log(`\nTIMEOUT #${channelName}`);

        if (conn.getChannelCount() === 0) {
            connections.splice(connections.indexOf(conn), 1);
        }
    });

    conn.addListener("PRIVMSG", (message: IRCMessage) => {
        // console.log("\n", new Date().toLocaleString(), message.raw, "\n");
    });

    connections.push(conn);
});

setInterval(() => {
    let channelCount = 0;
    for (const conn of connections) {
        channelCount += conn.getChannelCount();
    }

    process.stdout.cursorTo(0);
    process.stdout.clearLine(0);
    process.stdout.write(
        `[CONNECTIONS] Size: ${connections.length} | Channels: ${channelCount} | Queue Size: ${connectionQueue.q.length}`
    );
}, 5_000);

if (process.env.FILE) {
    console.log("[FILE] Load channels file:", process.env.FILE);
    const file = readFileSync(process.env.FILE);
    const channelNames = file.toString().split("\n");
    for (const channelName of channelNames) {
        connectionQueue.push(channelName);
    }
}
