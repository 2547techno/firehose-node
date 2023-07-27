import EventEmitter from "events";
import WebSocket from "ws";
import { parse } from "irc-message-ts";

export enum JoinState {
    JOINED,
    JOINING,
    NOT_JOINED,
}

export enum WebSocketCloseCode {
    PART = 4000,
    TIMEOUT = 4001,
    CHANNEL_SUSPENDED = 4002,
}

type Channel = {
    name: string;
    state: JoinState;
    messageCount: number;
}

export class Connection extends EventEmitter {
    emitter;
    ws;
    channels;

    constructor(channels: string[]) {
        super();
        this.channels = new Map<string, Channel>();

        this.emitter = new EventEmitter();

        const ws = new WebSocket("wss://irc-ws.chat.twitch.tv", {
            port: 443,
        });

        this.emitter.on("join", channelName => {
            const channel = this.channels.get(channelName)
            if (!channel) return;

            channel.state = JoinState.JOINED;
            this.emit("join", channelName);
        })

        this.emitter.on("channelSuspended", channelName => {
            this.channels.delete(channelName)
            this.emit("channelSuspended", channelName);
        })

        this.emitter.on("channelTimeout", channelName => {
            this.emit("channelTimeout", channelName);
        })

        this.emitter.on("PRIVMSG", message => {
            this.emit("PRIVMSG", message);
        })

        ws.on("open", async () => {
            const auth = {
                nick: "justinfan123",
                pass: "",
            };

            ws.send(`NICK ${auth.nick}`);
            ws.send("CAP REQ :twitch.tv/commands twitch.tv/tags");

            for (const c of channels) {
                const channelName = c.toLowerCase();
                if (this.channels.has(channelName)) continue;
                let channel = {
                    name: channelName,
                    state: JoinState.JOINING,
                    messageCount: 0,
                }
                this.channels.set(channelName, channel)

                ws.send(`JOIN #${channelName}`);

                setTimeout(() => {
                    if (channel.state !== JoinState.JOINED) {
                        this.channels.delete(channelName);
                        this.emitter.emit("channelTimeout", channelName);
                    }
                }, 10_000)
            }
        });

        ws.on("error", console.error);

        ws.on("close", (code, reason) => {
            this.emit("close", {
                code,
                reason,
            });
        });

        ws.on("message", (data) => {
            const d = data.toString();
            const msgs = d.split("\r\n");
            // console.log(msgs);
            for (const msg of msgs) {
                const message = parse(msg);
                if (!message) continue;

                switch (message.command) {
                    case "CAP":
                    case "ROOMSTATE":
                    case "USERNOTICE":
                    case "CLEARCHAT":
                    case "CLEARMSG":
                    case "001":
                    case "002":
                    case "003":
                    case "004":
                    case "353":
                    case "366":
                    case "372":
                    case "375":
                    case "376":
                        break;
                    case "JOIN": {
                        const channelName = message.param.slice(1)
                        const channel = this.channels.get(channelName);
                        if (channel) {
                            this.emitter.emit("join", channelName);
                        }
                        
                        break;
                    }
                    case "PING": {
                        ws.send(`PONG :${message.params.join(" ")}`);
                        break;
                    }
                    case "NOTICE": {
                        if (message.tags["msg-id"] === "msg_channel_suspended") {
                            this.emitter.emit("channelSuspended", message.param.slice(1))
                        }
                        break;
                    }
                    case "PART": {
                        console.log(message);
                        console.log("PART");
                        break;
                    }
                    case "PRIVMSG": {
                        this.emitter.emit("PRIVMSG", message);
                        break;
                    }
                    default:
                        console.log(message);
                }
            }
        });

        this.ws = ws;
    }

    getChannelCount() {
        return this.channels.size;
    }
}

export class Queue extends EventEmitter {
    batchSize;
    intervalMs;
    q: string[];
    lastBatch;
    qInterval;

    constructor(batchSize: number, intervalMs: number) {
        super();
        this.batchSize = batchSize;
        this.intervalMs = intervalMs;
        this.q = [];
        this.lastBatch = new Date().getTime();
        
        this.qInterval = setInterval(() => {
            const now = new Date().getTime();
            if (now - this.lastBatch >= this.intervalMs) {
                const batch = []
                for(let i = 0; i < this.batchSize; i++) {
                    let channel = this.q.shift()
                    if (!channel) continue

                    batch.push(channel);
                }
                
                this.lastBatch = now;
                if (batch.length > 0) {
                    this.emit("batch", batch);
                }
            }
        }, 250)
    }

    push(channel: string) {
        this.q.push(channel);
    }
}