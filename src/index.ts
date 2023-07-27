import { Connection } from "./lib/connections";
import { IRCMessage } from "irc-message-ts";
import Express, { Request, Response, json } from "express";

const app = Express();
const PORT = process.env.PORT ?? 3001;
const connections: Map<string, Connection> = new Map();

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

        const conn = new Connection(channel);

        conn.addListener("close", () => {
            console.log("CLOSE:", channel);
            connections.delete(channel);
        });

        conn.addListener("PRIVMSG", (message: IRCMessage) => {
            // console.log(new Date().toLocaleString(), message.raw, "\n");
        });

        connections.set(channel, conn);
    }

    res.send();
});

app.listen(PORT, () => {
    console.log(`[EXPRESS] Listening on ${PORT}`);
});
