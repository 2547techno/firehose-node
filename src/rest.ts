import Express, { Request, Response, json } from "express";
import { firehoseChannels } from "./lib/streams";
const app = Express();
const PORT = process.env.PORT ?? 3001;

const middleware = [json()];

app.post("/channels", middleware, (req: Request, res: Response) => {
    console.log("[REST] POST /channels");
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

export function initREST() {
    return new Promise<void>((res) => {
        app.listen(PORT, () => {
            console.log(`[EXPRESS] Listening on ${PORT}`);
            res();
        });
    });
}
