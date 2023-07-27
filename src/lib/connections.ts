import EventEmitter from "events";
import WebSocket from "ws";
import { parse } from "irc-message-ts";

export enum JoinState {
    JOINED,
    JOINING,
    NOT_JOINED,
}

export class Connection extends EventEmitter {
    emitter;
    ws;
    channel;
    msgCount;
    joinState;

    constructor(channel: string) {
        super();
        this.channel = channel.toLowerCase();

        this.emitter = new EventEmitter();
        this.msgCount = 0;
        this.joinState = JoinState.NOT_JOINED;

        const ws = new WebSocket("wss://irc-ws.chat.twitch.tv", {
            port: 443,
        });

        ws.on("open", async () => {
            const auth = {
                nick: "justinfan123",
                pass: "",
            };

            ws.send(`NICK ${auth.nick}`);
            ws.send("CAP REQ :twitch.tv/commands twitch.tv/tags");

            const joinStr = `JOIN #${this.channel}`;
            ws.send(joinStr);
            this.joinState = JoinState.JOINING;

            const timeout = setTimeout(() => {
                this.emitter.removeListener(joinStr, listener);
                if (this.joinState !== JoinState.JOINED) {
                    this.joinState = JoinState.NOT_JOINED;
                    this.close();
                }
            }, 10_000);

            const listener = (channel: string) => {
                if (this.channel === channel.toLowerCase()) {
                    this.joinState = JoinState.JOINED;
                    clearTimeout(timeout);
                }
            };
            this.emitter.addListener("join", listener);
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
                    case "JOIN":
                        this.emitter.emit(
                            "join",
                            message.param.slice(1)
                        );
                        this.emit("join");
                        break;
                    case "PING":
                        ws.send(`PONG :${message.params.join(" ")}`);
                        break;
                    case "NOTICE":
                        if (
                            message.tags["msg-id"] !== "msg_channel_suspended"
                        ) {
                            break;
                        }
                    // eslint-disable-next-line no-fallthrough
                    case "PART":
                        this.joinState = JoinState.NOT_JOINED;
                        this.close();
                        break;
                    case "PRIVMSG": {
                        this.emit("PRIVMSG", message);
                        break;
                    }
                    default:
                        console.log(message);
                }
            }
        });

        this.ws = ws;
    }

    close() {
        this.ws.close();
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