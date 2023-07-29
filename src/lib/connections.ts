import EventEmitter from "events";
import WebSocket from "ws";
import { parse } from "irc-message-ts";
import { config } from "./config";

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
};

type Auth = {
    username: string;
    password: string;
};

export class Connection extends EventEmitter {
    events;
    ws;
    channels;
    maxChannels;
    auth;

    constructor(channelNames: string[], maxChannels: number, auth: Auth) {
        super();
        this.maxChannels = maxChannels;
        this.auth = auth;

        this.channels = new Map<string, Channel>();
        this.events = new EventEmitter();

        const ws = new WebSocket("wss://irc-ws.chat.twitch.tv", {
            port: 443,
        });

        this.events.on("join", (channelName) => {
            const channel = this.channels.get(channelName);
            if (!channel) return;

            channel.state = JoinState.JOINED;
            this.emit("join", channelName);
        });

        this.events.on("part", (channelName) => {
            this.channels.delete(channelName);
            this.emit("part", channelName);
        });

        this.events.on("channelSuspended", (channelName) => {
            this.channels.delete(channelName);
            this.emit("channelSuspended", channelName);
        });

        this.events.on("banned", (channelName) => {
            this.channels.delete(channelName);
            this.emit("banned", channelName);
        });

        this.events.on("channelTimeout", (channelName) => {
            this.channels.delete(channelName);
            this.emit("channelTimeout", channelName);
        });

        this.events.on("PRIVMSG", (message) => {
            this.emit("PRIVMSG", message);
        });

        ws.on("open", async () => {
            if (config.connections.anon) {
                this.auth = {
                    username: "justinfan123",
                    password: "",
                };
            } else {
                ws.send(`PASS ${this.auth.password}`);
            }

            ws.send(`NICK ${this.auth.username}`);
            ws.send("CAP REQ :twitch.tv/commands twitch.tv/tags");

            this.joinChannels(channelNames);
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
                    case "USERSTATE":
                    case "USERNOTICE":
                    case "CLEARCHAT":
                    case "CLEARMSG":
                    case "WHISPER":
                    case "PONG":
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
                        const channelName = message.param.slice(1);
                        const channel = this.channels.get(channelName);
                        if (channel) {
                            this.events.emit("join", channelName);
                        }

                        break;
                    }
                    case "PING": {
                        ws.send(`PONG :${message.params.join(" ")}`);
                        break;
                    }
                    case "NOTICE": {
                        if (
                            message.tags["msg-id"] === "msg_channel_suspended"
                        ) {
                            this.events.emit(
                                "channelSuspended",
                                message.param.slice(1)
                            );
                        } else if (message.tags["msg-id"] === "msg_banned") {
                            this.events.emit("banned", message.param.slice(1));
                        }
                        break;
                    }
                    case "PART": {
                        this.events.emit("part", message.param.slice(1));
                        break;
                    }
                    case "PRIVMSG": {
                        this.events.emit("PRIVMSG", message);
                        break;
                    }
                    default:
                        console.log(message);
                }
            }
        });

        this.ws = ws;
    }

    send(str: string) {
        if (this.ws.readyState === this.ws.OPEN) {
            this.ws.send(str);
        }
    }

    getChannelCount() {
        return this.channels.size;
    }

    partChannel(channelName: string) {
        if (this.channels.has(channelName)) {
            this.send(`PART #${channelName.toLowerCase()}`);
        }
    }

    partChannels(channelNames: string[]) {
        for (const channelName of channelNames) {
            this.partChannel(channelName);
        }
    }

    joinChannel(channelName: string) {
        if (this.channels.size >= this.maxChannels) {
            this.partChannel(Array.from(this.channels.keys())[0]);
        }

        channelName = channelName.toLowerCase();
        if (this.channels.has(channelName)) return;
        const channel = {
            name: channelName,
            state: JoinState.JOINING,
            messageCount: 0,
        };
        this.channels.set(channelName, channel);

        this.send(`JOIN #${channelName}`);

        setTimeout(() => {
            if (channel.state !== JoinState.JOINED) {
                this.events.emit("channelTimeout", channelName);
            }
        }, config.connections.joinTimeout);
    }

    joinChannels(channelNames: string[]) {
        for (const channelName of channelNames) {
            this.joinChannel(channelName);
        }
    }

    ping() {
        this.send("PING :firehose");
    }
}

export class Queue extends EventEmitter {
    batchSize;
    intervalMs;
    q: string[];
    lastBatch;
    qInterval;
    events;

    constructor(batchSize: number, intervalMs: number) {
        super();
        this.batchSize = batchSize;
        this.intervalMs = intervalMs;
        this.q = [];
        this.lastBatch = new Date().getTime();
        this.events = new EventEmitter();

        this.qInterval = setInterval(() => {
            const now = new Date().getTime();
            if (now - this.lastBatch >= this.intervalMs) {
                const batch = [];
                for (let i = 0; i < this.batchSize; i++) {
                    const channel = this.q.shift();
                    if (!channel) continue;

                    batch.push(channel);
                }

                this.lastBatch = now;
                if (batch.length > 0) {
                    this.emit("batch", batch);
                } else {
                    this.events.emit("empty");
                }
            }
        }, 250);
    }

    push(channel: string) {
        this.q.push(channel);
    }

    async waitUntilEmpty() {
        return new Promise<void>((res) => {
            this.events.on("empty", res);
        });
    }
}
