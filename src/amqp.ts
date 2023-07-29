import amqplib from "amqplib";
import { config } from "./lib/config";
import { EventEmitter } from "events";
const QUEUE_NAME = config.amqp.queueName;
export const messageEvent = new EventEmitter();

export async function initAMQP() {
    const conn = await amqplib.connect(
        `amqp://${config.amqp.user}:${config.amqp.password}@${config.amqp.url}`
    );

    const channel = await conn.createChannel();
    await channel.assertQueue(QUEUE_NAME);

    messageEvent.on("message", (message: string) => {
        channel.sendToQueue(QUEUE_NAME, Buffer.from(message));
    });
}
