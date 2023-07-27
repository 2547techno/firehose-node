import { Connection, Queue } from "./lib/connections";
import { IRCMessage } from "irc-message-ts";
import Express, { Request, Response, json } from "express";

const app = Express();
const PORT = process.env.PORT ?? 3001;
const connections: Connection[] = [];
const connectionQueue = new Queue(1000, 10_000);
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

app.listen(PORT, () => {
    console.log(`[EXPRESS] Listening on ${PORT}`);
});

connectionQueue.addListener("batch", (batch: string[]) => {
    const conn = new Connection(batch);

    conn.addListener("close", ({ code }) => {
        const i = connections.indexOf(conn);
        console.log(`\n[CONNECTION] Close connections[${i}] | code: ${code}`);
        connections.slice(i, 1);
    });

    conn.addListener("join", (channelName) => {
        // console.log(`\nJOINED #${channel}`);
    });

    conn.addListener("channelSuspended", (channelName) => {
        console.log(`\nSUSPENDED #${channelName}`);
        suspendedChannels.add(channelName);
        setTimeout(() => {
            suspendedChannels.delete(channelName);
        }, 60_000);
    });

    conn.addListener("channelTimeout", (channelName) => {
        if (suspendedChannels.has(channelName)) return;
        console.log(`\nTIMEOUT #${channelName}`);
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
        `[CONNECTIONS] Size: ${connections.length} | Channels: ${channelCount}`
    );
}, 5_000);
