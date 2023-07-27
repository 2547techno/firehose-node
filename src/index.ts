import { Connection, Queue, WebSocketCloseCode } from "./lib/connections";
import { IRCMessage } from "irc-message-ts";
import Express, { Request, Response, json } from "express";

const app = Express();
const PORT = process.env.PORT ?? 3001;
const connections: Map<string, Connection> = new Map();
const connectionQueue = new Queue(800, 10_000);

const middleware = [json()];

app.post("/channels", middleware, (req: Request, res: Response) => {
    const channels: string[] = req.body.channels;
    if (!channels) {
        return res.status(400).json({
            message: "missing `channels` field",
        });
    }

    for (const channel of channels) {
        if (connections.has(channel)) continue;
        connectionQueue.push(channel);
    }

    res.send();
});

app.listen(PORT, () => {
    console.log(`[EXPRESS] Listening on ${PORT}`);
});

connectionQueue.addListener("batch", (batch: string[]) => {
    for (const channel of batch) {
        const conn = new Connection(channel);
        
        conn.addListener("close", ({code, reason}) => {
            switch(code as WebSocketCloseCode) {
                case WebSocketCloseCode.PART:
                    console.log("PART:", channel);
                    break;
                case WebSocketCloseCode.TIMEOUT:
                    console.log("TIMEOUT:", channel);
                    break;
                case WebSocketCloseCode.CHANNEL_SUSPENDED:
                    console.log("SUSPENDED:", channel);
                    break;
                default:
                    console.log("CLOSE:", channel, code);
                    break;
            }

            connections.delete(channel);
        });
        
        conn.addListener("join", () => {
            // console.log(`JOINED #${channel}`);
        });
        
        conn.addListener("PRIVMSG", (message: IRCMessage) => {
            // console.log(new Date().toLocaleString(), message.raw, "\n");
        });
        
        connections.set(channel, conn);
    }
})

setInterval(() => {
    process.stdout.clearLine(0);
    process.stdout.write(`[CONNECTIONS] Size: ${connections.size}`);
    process.stdout.cursorTo(0);
}, 5_000)
