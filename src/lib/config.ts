import c from "../../config.json";
import { ZodError, z } from "zod";

const configSchema = z.object({
    nodeId: z.string(),
    twitch: z.object({
        username: z.string().optional(),
        token: z.string().optional(),
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

export let config: z.infer<typeof configSchema>;
try {
    config = configSchema.parse(c);
} catch (err) {
    const errors = (err as ZodError).issues.map(
        (i) => `\`${i.path.join(".")}\` ${i.message}`
    );
    console.log("[ Config Error ]");
    console.log(errors.map((error) => `→ ${error}`).join("\n"));
    process.exit(1);
}
