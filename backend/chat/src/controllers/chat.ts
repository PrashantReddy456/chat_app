import type { Response } from "express";
import TryCatch from "../config/TryCatch.js"
import type { AuthenticatedRequest } from "../middleware/isAuth.js"
import { Chat } from "../models/chat.js";
import { Messages } from "../models/messages.js";
import axios from "axios";
import { getReceiverSocketId, io } from "../config/socket.js";
import { isObjectIdOrHexString } from "mongoose";

export const createNewChat = TryCatch(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?._id;
    const { otherUserId } = req.body;

    if (!otherUserId) {
        res.status(400).json({
            message: "otehr user id is required",
        });
        return;
    }
    const existingChat = await Chat.findOne({
        users: { $all: [userId, otherUserId], $size: 2 },

    });
    if (existingChat) {
        res.json({
            message: "chat already exist",
            chatId: existingChat._id,
        });
        return;
    }

    const newChat = await Chat.create({
        users: [userId, otherUserId],
    });
    res.status(201).json({
        message: "new chat created",
        chatId: newChat._id,
    });

});

export const getAllChats = TryCatch(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?._id;

    if (!userId) {
        res.status(400).json({
            message: "userId missing",
        })
        return;
    }

    const chats = await Chat.find({ users: userId }).sort({ updatedAt: -1 });
    const chatWithUserData = await Promise.all(
        chats.map(async (chat) => {
            const otherUserId = chat.users.find((id) => id.toString() !== userId.toString());

            const unseenCount = await Messages.countDocuments({
                chatId: chat._id,
                sender: { $ne: userId },
                seen: false,
            });

            if (!otherUserId) {
                return {
                    user: { _id: "", name: "Unknown User" },
                    chat: {
                        ...chat.toObject(),
                        latestMessage: chat.latestMessage || null,
                        unseenCount,
                    }
                };
            }

            try {
                const { data } = await axios.get(`${process.env.USER_SERVICE}/api/v1/user/${otherUserId}`);
                return {
                    user: data.user || { _id: otherUserId, name: "Unknown User" },
                    chat: {
                        ...chat.toObject(),
                        latestMessage: chat.latestMessage || null,
                        unseenCount,
                    }
                }
            } catch (error: any) {
                console.log("Error fetching user data from User Service:", error?.message || error);
                return {
                    user: { _id: otherUserId, name: "Unknown User" },
                    chat: {
                        ...chat.toObject(),
                        latestMessage: chat.latestMessage || null,
                        unseenCount,
                    }
                }
            }
        })
    );
    res.json({
        chats: chatWithUserData,
    })
});

export const sendMessage = TryCatch(async (req: AuthenticatedRequest, res) => {
    const senderId = req.user?._id;
    const { chatId, text } = req.body;
    const imageFile = req.file;

    if (!senderId) {
        res.status(401).json({
            message: "Unauthorized",
        });
        return;
    }
    if (!chatId) {
        res.status(400).json({
            message: "chat id required",
        });
        return;
    }

    if (!text && !imageFile) {
        res.status(400).json({
            message: "Either text or image is required",
        });
        return;
    }

    const chat = await Chat.findById(chatId)
    if (!chat) {
        res.status(404).json({
            message: "chat not found",
        });
        return;
    }

    const isUserInChat = chat.users.some(
        (userId) => userId.toString() === senderId.toString()
    );

    if (!isUserInChat) {
        res.status(403).json({
            message: "you are not part of this chat",
        });
        return;
    }

    console.log("DEBUG SEND_MESSAGE:", {
        senderId: senderId,
        senderIdType: typeof senderId,
        chatUsers: chat.users,
    });

    const otherUserId = chat.users.find(
        (userId) => userId.toString() !== senderId.toString()
    );
    if (!otherUserId) {
        res.status(401).json({
            message: "No other User",
        });
        return;
    }

    //socket

    const receiverSocketId = getReceiverSocketId(otherUserId);
    let isReceiverInChatRoom = false
    if (receiverSocketId) {
        const receiverSocket = io.sockets.sockets.get(receiverSocketId)
        if (receiverSocket && receiverSocket.rooms.has(chatId)) {
            isReceiverInChatRoom = true;

        }

    }

    let messageData: any = {
        chatId: chatId,
        sender: senderId,
        seen: isReceiverInChatRoom,
        seenAt: isReceiverInChatRoom ? new Date() : undefined,
    };

    if (imageFile) {
        messageData.image = {
            url: imageFile.path,
            publicId: imageFile.filename,
        };
        messageData.messageType = "image";
        messageData.text = text || "";
    } else {
        messageData.messageType = "text";
        messageData.text = text;
    }

    const message = new Messages(messageData);
    const savedMessages = await message.save();
    const latestMessageText = imageFile ? "📷 Image" : text;

    await Chat.findByIdAndUpdate(chatId, {
        latestMessage: {
            text: latestMessageText,
            sender: senderId,
        },
        updatedAt: new Date(),
    }, {
        new: true,
    });

    //emit to socket

    io.to(chatId).emit("newMessage", savedMessages)

    if (receiverSocketId) {
        io.to(receiverSocketId).emit("newMessage", savedMessages)
    }

    const senderSocketId = getReceiverSocketId(senderId.toString())

    if (senderSocketId) {
        io.to(senderSocketId).emit("newMessage", savedMessages)
    }

    if (isReceiverInChatRoom && senderSocketId) {
        io.to(senderSocketId).emit("messagesSeen", {
            chatId: chatId,
            seenBy: otherUserId,
            messagesIds: [savedMessages._id]
        })

    }


    res.status(201).json({
        message: savedMessages,
        sender: senderId
    });
});

export const getMessagesByChat = TryCatch(async (req: AuthenticatedRequest, res) => {
    const userId = req.user?._id;
    const { chatId } = req.params;

    if (!userId) {
        res.status(401).json({
            message: "unauthorised",
        });
        return;
    }

    if (!chatId) {
        res.status(400).json({
            message: "chat id required",
        });
        return;
    }

    const chat = await Chat.findById(chatId);
    if (!chat) {
        res.status(404).json({
            message: "chat not found",
        });
        return;
    }

    const isUserInChat = chat.users.some(
        (id) => id.toString() === userId.toString()
    );
    if (!isUserInChat) {
        res.status(403).json({
            message: "you are not in chat",
        });
        return;
    }

    const messagesToMarkSeen = await Messages.find({
        chatId: chatId,
        sender: { $ne: userId },
        seen: false,
    });

    await Messages.updateMany({
        chatId: chatId,
        sender: { $ne: userId },
        seen: false,
    }, {
        seen: true,
        seenAt: new Date(),
    });

    const messages = await Messages.find({ chatId }).sort({
        createdAt: 1
    });

    const otherUserId = chat.users.find((id) => id.toString() !== userId.toString());

    if (!otherUserId) {
        res.status(400).json({
            message: "no other user",
        });
        return;
    }

    try {
        const { data } = await axios.get(`${process.env.USER_SERVICE}/api/v1/user/${otherUserId}`);

        //socket

        if (messagesToMarkSeen.length > 0) {
            const otherUserSocketId = getReceiverSocketId(otherUserId.toString())
            if (otherUserSocketId) {
                io.to(otherUserSocketId).emit("messagesSeen", {
                    chatId: chatId,
                    seenBy: userId,
                    messagesIds: messagesToMarkSeen.map((msg) => msg._id)

                })
            }
        }

        res.json({
            messages,
            user: data.user || { _id: otherUserId, name: "Unknown User" },
        })
    } catch (error) {
        console.log(error);
        res.json({
            messages,
            user: {
                _id: otherUserId,
                name: "Unknown User",
            }
        });
    }
})