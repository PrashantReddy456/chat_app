import amqp from "amqplib"

let channel: amqp.Channel;

export const connectRabbitMQ = async () => {
    try {
        const connection = await amqp.connect({
            protocol: "amqp",
            hostname: process.env.Rabbitmq_Host || "localhost",
            port: 5672,
            username: process.env.Rabbitmq_Username || "admin",
            password: process.env.Rabbitmq_Password || "admin123",
        });
        channel = await connection.createChannel()
        console.log("✅ connecetede to rabbit mq");
    } catch (error) {
        console.log("failed to connect rabbit mq", error);
    }
};

export const publishToQueue = async (queueName: string, message: any) => {
    if (!channel) {
        console.log("RAbbitmq channel is not initialized");
        return;
    }

    await channel.assertQueue(queueName, { durable: true });
    channel.sendToQueue(queueName, Buffer.from(JSON.stringify(message)), {
        persistent: true,
    });
}
