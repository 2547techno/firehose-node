import Express, { Request, Response, json } from "express";
import { firehoseChannels } from "./lib/streams";
import { config } from "./lib/config";
import { START_TIME, connections, messages } from ".";
const app = Express();
const PORT = config.rest.port ?? 3001;

const middleware = [json()];

type HealthData = {
    uptimeMs: number;
    channels: number;
    clients: number;
    messagesPerSecond: number;
    totalMessages: number;
};

app.put("/channels", middleware, (req: Request, res: Response) => {
    console.log("[REST] PUT /channels");
    const channelNames: string[] = req.body.channels;
    if (!channelNames) {
        return res.status(400).json({
            message: "missing `channels` field",
        });
    }

    for (const channelName of channelNames) {
        firehoseChannels.add(channelName);
    }

    res.send();
});

app.delete("/channels", middleware, (req: Request, res: Response) => {
    console.log("[REST] DELETE /channels");
    const channelNames: string[] = req.body.channels;
    if (!channelNames) {
        return res.status(400).json({
            message: "missing `channels` field",
        });
    }

    for (const channelName of channelNames) {
        firehoseChannels.delete(channelName);
    }

    res.send();
});

app.get("/health", middleware, (req: Request, res: Response) => {
    const now = new Date().getTime();
    let channels = 0;
    for (const conn of connections) {
        channels += conn.getChannelCount();
    }
    const window = messages.rollingAverage.window;
    let messagesPerSecond;
    if (window.length <= 1) {
        messagesPerSecond = 0;
    } else {
        messagesPerSecond =
            (window.slice(0, -1).reduce((prev, curr) => prev + curr) * 1000) /
            (window.length * messages.rollingAverage.binSizeMs);
    }

    const data: HealthData = {
        uptimeMs: now - START_TIME,
        channels,
        clients: connections.length,
        messagesPerSecond: Math.round(messagesPerSecond * 100) / 100,
        totalMessages: messages.total,
    };
    res.json(data);
});

export function initREST() {
    return new Promise<void>((res) => {
        app.listen(PORT, () => {
            console.log(`[EXPRESS] Listening on ${PORT}`);
            res();
        });
    });
}
