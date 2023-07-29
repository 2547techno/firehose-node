import amqplib from "amqplib/callback_api";
import { config } from "./lib/config";
import { EventEmitter } from "events";
const QUEUE_NAME = config.amqp.queueName;
export const messageEvent = new EventEmitter();

export function initAMQP() {
    return new Promise<void>(res => {
        amqplib.connect(
            `amqp://${config.amqp.user}:${config.amqp.password}@${config.amqp.url}`,
            (err, conn: amqplib.Connection) => {
                if (err) throw err;
            console.log("[AMQP] Connected to server");

            conn.createChannel((err, channel: amqplib.Channel) => {
                if (err) throw err;
                console.log("[AMQP] Connected to queue", QUEUE_NAME);
                
                channel.assertQueue(QUEUE_NAME);
                
                messageEvent.on("message", (message: string) => {
                    channel.sendToQueue(QUEUE_NAME, Buffer.from(message));
                });

                res();
            });
        }
        );
    })
}
