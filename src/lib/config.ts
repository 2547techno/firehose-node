import c from "../../config.json";
import { z } from "zod";

const configSchema = z.object({
    nodeId: z.string(),
    twitch: z.object({
        username: z.string(),
        token: z.string(),
        cid: z.string(),
    }),
    amqp: z.object({
        url: z.string(),
        user: z.string(),
        password: z.string(),
        queueName: z.object({
            message: z.string(),
            delegation: z.string(),
        }),
    }),
    rest: z.object({
        port: z.number().int(),
    }),
    connection: z.object({
        anon: z.boolean(),
        maxChannels: z.number().int(),
        queueInterval: z.number().int(),
        joinTimeout: z.number().int(),
    }),
    print: z
        .object({
            part: z.boolean().optional(),
            join: z.boolean().optional(),
            banned: z.boolean().optional(),
        })
        .optional(),
});

export const config = configSchema.parse(c);
