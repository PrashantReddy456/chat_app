import amqp from "amqplib";
import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

export const startSendOtpConsumer = async () => {
    try {
        const connection = await amqp.connect({
            protocol: "amqp",
            hostname: process.env.Rabbitmq_Host || "localhost",
            port: 5672,
            username: process.env.Rabbitmq_Username || "admin",
            password: process.env.Rabbitmq_Password || "admin123",
        });
        const channel = await connection.createChannel();
        const queueName = "send-otp";
        await channel.assertQueue(queueName, { durable: true });
        console.log("✅ mail service consumer started");
        channel.consume(queueName, async (msg) => {
            if (msg) {
                try {
                    const { to, subject, body } = JSON.parse(msg.content.toString())

                    const transporter = nodemailer.createTransport({
                        host: "smtp.gmail.com",
                        port: 465,
                        secure: true,
                        auth: {
                            user: process.env.USER,
                            pass: process.env.PASSWORD
                        },
                    })

                    await transporter.sendMail({
                        from: "chatapp",
                        to,
                        subject,
                        text: body
                    });
                    console.log(`✅ mail sent successfully to ${to}`);
                    channel.ack(msg);

                } catch (error) {
                    console.log("failed to send otp", error);
                }
            }
        })
    } catch (error) {
        console.log("failed to start rabbitmq consumer", error);
    }
}