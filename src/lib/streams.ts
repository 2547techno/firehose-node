import { connections, connectionQueue } from "..";
export const firehoseChannels = new Set<string>();

export async function joinPartDiffStreams() {
    // eslint-disable-next-line no-constant-condition
    while (true) {
        console.log("[STREAMS] Firehose channels:", firehoseChannels.size);
        const connectedChannels = new Set<string>();
        for (const conn of connections) {
            for (const channel of conn.channels.keys()) {
                connectedChannels.add(channel);
            }
        }

        const channelsToPart: string[] = [];
        for (const connectedChannel of connectedChannels) {
            if (!firehoseChannels.has(connectedChannel)) {
                channelsToPart.push(connectedChannel);
            }
        }

        for (const conn of connections) {
            conn.partChannels(channelsToPart);
        }
        console.log("[STREAMS] Parting", channelsToPart.length, "channels");

        let count = 0;
        for (const channelName of firehoseChannels) {
            if (!connectedChannels.has(channelName)) {
                connectionQueue.push(channelName);
                count++;
            }
        }
        console.log("[STREAMS] Added", count, "channels to queue");
        await connectionQueue.waitUntilEmpty();
    }
}
