import Express, { Request, Response, json } from "express";
import { connectionQueue, connections } from ".";
const app = Express();
const PORT = process.env.PORT ?? 3001;

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

export function initREST() {
    app.listen(PORT, () => {
        console.log(`[EXPRESS] Listening on ${PORT}`);
    });
}
