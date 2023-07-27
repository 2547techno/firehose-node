import { Connection, Queue, WebSocketCloseCode } from "./lib/connections";
import { IRCMessage } from "irc-message-ts";
import Express, { Request, Response, json } from "express";

const app = Express();
const PORT = process.env.PORT ?? 3001;
const connections: Connection[] = [];
const connectionQueue = new Queue(200, 10_000);

const middleware = [json()];

app.post("/channels", middleware, (req: Request, res: Response) => {
    const channels: string[] = req.body.channels;
    if (!channels) {
        return res.status(400).json({
            message: "missing `channels` field",
        });
    }

    for (const channel of channels) {
        connectionQueue.push(channel);
    }

    res.send();
});

app.listen(PORT, () => {
    console.log(`[EXPRESS] Listening on ${PORT}`);
});

connectionQueue.addListener("batch", (batch: string[]) => {
    const conn = new Connection(batch);
    
    conn.addListener("close", ({code, reason}) => {
        const i = connections.indexOf(conn);
        console.log(`[CONNECTION] Close connections[${i}]`);
        connections.slice(i, 1);
    });
    
    conn.addListener("join", channel => {
        // console.log(`JOINED #${channel}`);
    });
    
    conn.addListener("channelSuspended", channel => {
        console.log(`SUSPENDED #${channel}`);
    });
    
    conn.addListener("PRIVMSG", (message: IRCMessage) => {
        // console.log(new Date().toLocaleString(), message.raw, "\n");
    });
    
    connections.push(conn);
})

setInterval(() => {
    let channelCount = 0;
    for(const conn of connections) {
        channelCount += conn.getChannelCount();
    }

    process.stdout.clearLine(0);
    process.stdout.write(`[CONNECTIONS] Size: ${connections.length} | Channels: ${channelCount}`);
    process.stdout.cursorTo(0);
}, 5_000)
