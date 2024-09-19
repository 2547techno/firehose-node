import amqplib from "amqplib";
import { config } from "./lib/config";
import { EventEmitter } from "events";
import { firehoseChannels } from "./lib/streams";
const MESSAGE_QUEUE_NAME = config.amqp.queueName.message;
const DELEGATION_QUEUE_NAME = config.amqp.queueName.delegation;
export const messageEvent = new EventEmitter();

type Delegation = {
    id: string;
    channelNames: string[];
};

export async function initAMQP() {
    const conn = await amqplib.connect(
        `amqp://${config.amqp.user}:${config.amqp.password}@${config.amqp.url}`
    );

    console.log("[AMQP] Connected to server");

    const channel = await conn.createChannel();
    await channel.assertQueue(MESSAGE_QUEUE_NAME, {
        maxLength: 100,
    });
    console.log("[AMQP] Connected to queue", MESSAGE_QUEUE_NAME);

    messageEvent.on("message", (message: string) => {
        channel.sendToQueue(MESSAGE_QUEUE_NAME, Buffer.from(message));
    });

    await channel.assertQueue(DELEGATION_QUEUE_NAME, {
        maxLength: 100,
    });
    console.log("[AMQP] Connected to queue", DELEGATION_QUEUE_NAME);

    channel.consume(DELEGATION_QUEUE_NAME, (message) => {
        if (!message) return;

        try {
            const delegations: Delegation[] = JSON.parse(
                message.content.toString()
            );
            channel.ack(message);
            updateFromDelegation(delegations);
        } catch (err) {
            console.log("[DELEGATION] Cannot parse delegation message");
        }
    });
}

function updateFromDelegation(delegations: Delegation[]) {
    for (const delegation of delegations) {
        if (delegation.id === config.nodeId) {
            console.log("[DELEGATION] Updating channels from delegation");
            firehoseChannels.clear();
            for (const channelName of delegation.channelNames) {
                firehoseChannels.add(channelName);
            }
        }
    }
}
