import { generateToken } from "../config/generateToken.js";
import { publishToQueue } from "../config/rabbitmq.js";
import TryCatch from "../config/TryCatch.js"
import { redisClient } from "../index.js"
import { User } from "../model/user.js";
import type { AuthenticatedRequest } from "../middleware/isAuth.js";

export const loginUser = TryCatch(async (req, res) => {
    const { email } = req.body
    const rateLimitKey = `otp:ratelimit:${email}`
    const rateLimit = await redisClient.get(rateLimitKey)

    if (rateLimit) {
        res.status(429).json({
            message: "too many request",
        });
        return;
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpKey = `otp:${email}`
    await redisClient.set(otpKey, otp, {
        EX: 300,
    });
    await redisClient.set(rateLimitKey, "true", {
        EX: 60,
    });
    const message = {
        to: email,
        subject: "Your Otp Code",
        body: `Yout Otp is ${otp}.It is valid for 5 min`,
    };
    await publishToQueue("send-otp", message)
    res.status(200).json({
        message: "Otp sent successfully",
    });
});
export const verifyUser = TryCatch(async (req, res) => {
    const { email, otp: enteredOtp } = req.body;

    if (!email || !enteredOtp) {
        res.status(400).json({
            message: "email and otp are required",
        });
        return;
    }

    const otpKey = `otp:${email}`
    const storedOtp = await redisClient.get(otpKey);

    if (!storedOtp || storedOtp !== enteredOtp) {
        res.status(400).json({
            message: "Invalid or expired OTP",
        });
        return;
    }
    await redisClient.del(otpKey);

    let user = await User.findOne({ email });

    if (!user) {
        const name = email.slice(0, 8)
        user = await User.create({ name, email });
    }
    const token = generateToken(user);

    res.json({

        message: "user Verified",
        user,
        token
    })
});

export const myProfile = TryCatch(async (req: AuthenticatedRequest, res) => {
    const user = await User.findById(req.user?._id);

    res.status(200).json({
        user,
    });
});

export const updateName = TryCatch(async (req: AuthenticatedRequest, res) => {
    const user = await User.findById(req.user?._id);

    if (!user) {
        res.status(404).json({
            message: "please sign up",
        });
        return;
    }

    user.name = req.body.name;
    await user.save();
    const token = generateToken(user);
    res.json({
        message: "user updated",
        user,
        token,
    });
});

export const getAllUsers = TryCatch(async (req: AuthenticatedRequest, res) => {
    const users = await User.find();
    res.json(users);
});

export const getUser = TryCatch(async (req, res) => {
    const user = await User.findById(req.params.id);
    res.json({ user });
});