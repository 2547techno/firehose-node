import { Connection } from "./lib/connections";
import { IRCMessage } from "irc-message-ts";

const connections: Map<string, Connection> = new Map();

["drdisrespect", "2547techno", "tmiloadtesting2"].forEach((channel) => {
    const conn = new Connection(channel);

    conn.addListener("close", () => {
        console.log("CLOSE:", channel);
        connections.delete(channel);
    });

    conn.addListener("PRIVMSG", (message: IRCMessage) => {
        // console.log(new Date().toLocaleString(), message.raw, "\n");
    });

    connections.set(channel, conn);
});
