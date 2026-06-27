"use client"
import ChatSidebar from '@/src/components/ChatSidebar';
import Loading from '@/src/components/Loading';
import { chat_service, useAppData, User } from '@/src/context/AppContext'
import { useRouter } from 'next/navigation';
import React, { useEffect, useState, useCallback } from 'react';
import Cookies from "js-cookie";
import axios from 'axios';
import toast from 'react-hot-toast';

import ChatHeader from '@/src/components/ChatHeader';
import ChatMessages from '@/src/components/ChatMessages';
import MessageInput from '@/src/components/MessageInput';
import { SocketData } from '@/src/context/SocketContext';

export interface Message {
    _id: string;
    chatId: string;
    sender: string;
    text?: string;
    image?: {
        url: string;
        publicId: string;

    };
    messageType: "text" | "image";
    seen: boolean;
    seenAt?: string;
    createdAt: string;
}

const ChatApp = () => {

    const { loading, isAuth, logOutUser, chats, user: loggedInUser, users, fetchChats, setChats } = useAppData();

    const { onlineUsers, socket } = SocketData();


    const [selectedUser, setSelectedUser] = useState<string | null>(null)
    const [message, setMessage] = useState("");
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [messages, setMessages] = useState<Message[] | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [showAllUsers, setShowAllUsers] = useState(false);
    const [isTyping, setIsTyping] = useState(false);
    const [typingTimeOut, setTypingTimeOut] = useState<NodeJS.Timeout | null>(null);


    const router = useRouter();
    useEffect(() => {
        if (!isAuth && !loading) {
            router.push("/login")
        }
    }, [isAuth, router, loading]);

    const handleLogout = () => logOutUser();

    async function fetchChat() {
        const token = Cookies.get("token");
        try {
            const { data } = await axios.get(`${chat_service}/api/v1/message/${selectedUser}`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            );

            setMessages(data.messages);
            setUser(data.user);
            await fetchChats();
        } catch (error) {
            console.log(error);
            toast.error("failed to load messages");
        }
    }

    const moveChatToTop = useCallback((chatId: string, newMessages: any, updatedUnseenCount = true) => {
        setChats((prev) => {
            if (!prev) return null;

            const updatedChats = [...prev]
            const chatIndex = updatedChats.findIndex(
                (chat) => chat.chat._id === chatId
            );
            if (chatIndex !== -1) {
                const [moveChat] = updatedChats.splice(chatIndex, 1);

                const updatedChat = {
                    ...moveChat,
                    chat: {
                        ...moveChat.chat,
                        latestMessage: {
                            text: newMessages.text,
                            sender: newMessages.sender
                        },
                        updatedAt: new Date().toString(),

                        unseenCount: updatedUnseenCount && newMessages.sender !== loggedInUser?._id ? (moveChat.chat.unseenCount || 0) + 1 : moveChat.chat.unseenCount,

                    },
                };

                updatedChats.unshift(updatedChat);


            }
            return updatedChats;
        })
    }, [setChats, loggedInUser?._id]);

    const resetUnseenCount = useCallback((chatId: string) => {
        setChats((prev) => {
            if (!prev) return null;

            return prev.map((chat) => {
                if (chat.chat._id === chatId) {
                    return {
                        ...chat,
                        chat: {
                            ...chat.chat,
                            unseenCount: 0,

                        }
                    }
                }
                return chat;
            })
        })
    }, [setChats]);
    async function createChat(u: User) {
        try {
            const token = Cookies.get("token");
            const { data } = await axios.post(`${chat_service}/api/v1/chat/new`, {
                userId: loggedInUser?._id,
                otherUserId: u._id,
            }, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });
            setSelectedUser(data.chatId);
            setShowAllUsers(false);
            await fetchChats();
        } catch (error) {
            toast.error("faild to start chat");
        }
    }

    async function handleMessageSend(e: React.FormEvent<HTMLFormElement>, imageFile?: File | null) {

        if (typingTimeOut) {
            clearTimeout(typingTimeOut)
            setTypingTimeOut(null);
        }

        socket?.emit("stopTyping", {
            chatId: selectedUser,
            userId: loggedInUser?._id
        });
        const token = Cookies.get("token");
        try {
            const formData = new FormData();
            formData.append("chatId", selectedUser || "");
            if (message.trim()) {
                formData.append("text", message);
            }
            if (imageFile) {
                formData.append("image", imageFile);
            }


            const { data } = await axios.post(`${chat_service}/api/v1/message`, formData, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "multipart/form-data",
                },
            });

            setMessages((prev) => {
                const currentMessages = prev || [];
                const messageExists = currentMessages.some(
                    (msg) => msg._id === data.message._id
                );
                if (!messageExists) {
                    return [...currentMessages, data.message];
                }
                return currentMessages;
            });

            setMessage("");
            await fetchChats();

            moveChatToTop(
                selectedUser!,
                {
                    text: data.message.messageType === "image" && !data.message.text ? "📷 Image" : data.message.text,
                    sender: loggedInUser?._id,
                }
            )
        } catch (error) {
            console.log(error);
            toast.error("Failed to send message");
        }
    }

    const handleTyping = (value: string) => {
        setMessage(value)
        if (!selectedUser || !socket) return;
        // socket setup later

        if (value.trim()) {
            socket.emit("typing", {
                chatId: selectedUser,
                userId: loggedInUser?._id
            });
        }

        if (typingTimeOut) {
            clearTimeout(typingTimeOut)
        }

        const timeout = setTimeout(() => {

            socket.emit("stopTyping", {
                chatId: selectedUser,
                userId: loggedInUser?._id
            });
        }, 2000);
        setTypingTimeOut(timeout);
    };

    useEffect(() => {
        socket?.on("newMessage", (message) => {
            console.log("Received new message:", message);

            if (selectedUser === message.chatId) {
                setMessages((prev) => {
                    const currentMessages = prev || [];
                    const messageExists = currentMessages.some(
                        (msg) => msg._id === message._id
                    )
                    if (!messageExists) {
                        return [...currentMessages, message];
                    }
                    return currentMessages;
                });
                moveChatToTop(message.chatId, message, false);

            } else {
                moveChatToTop(message.chatId, message, true);
            }
        });
        socket?.on("messagesSeen", (data) => {
            console.log("message seen by:", data);

            if (selectedUser === data.chatId)
                setMessages((prev) => {
                    if (!prev) return null;
                    return prev.map((msg) => {
                        if (msg.sender === loggedInUser?._id && data.messageIds && data.
                            messageIds.includes(msg._id)) {
                            return {
                                ...msg,
                                seen: true,
                                seenAt: new Date().toString()
                            }

                        } else if (msg.sender === loggedInUser?._id && !data.messageIds) {
                            return {
                                ...msg,
                                seen: true,
                                seenAt: new Date().toString()
                            }
                        }
                        return msg;
                    })
                })
        })





        socket?.on("userTyping", (data) => {
            console.log("received user typing", data, "expected selectedUser:", selectedUser);
            if (data.chatId === selectedUser && data.userId !== loggedInUser?._id) {
                console.log("Setting isTyping to true");
                setIsTyping(true);
            }
        });

        socket?.on("userStoppedTyping", (data) => {
            console.log("received user stopped typing", data);
            if (data.chatId === selectedUser && data.userId !== loggedInUser?._id) {
                setIsTyping(false);
            }
        });

        return () => {
            socket?.off("newMessage");
            socket?.off("messagesSeen");
            socket?.off("userStoppedTyping");
            socket?.off("userTyping");
        }
    }, [socket, selectedUser, setChats, loggedInUser?._id, moveChatToTop])

    useEffect(() => {
        if (selectedUser) {
            fetchChat();
            setIsTyping(false);

            resetUnseenCount(selectedUser);

            socket?.emit("joinChat", selectedUser);

            return () => {
                socket?.emit("leaveChat", selectedUser);
                setMessages(null);
            }
        }
    }, [selectedUser, socket]);

    useEffect(() => {
        return () => {
            if (typingTimeOut) {
                clearTimeout(typingTimeOut);
            }
        }
    }, [typingTimeOut])

    if (loading) return <Loading />;
    return (
        <div className="min-h-screen flex bg-gray-900 text-white relative overflow-hidden">
            <ChatSidebar
                sidebarOpen={sidebarOpen}
                setSidebarOpen={setSidebarOpen}
                showAllUsers={showAllUsers}
                setShowAllUsers={setShowAllUsers}
                users={users}
                chats={chats}
                loggedInUser={loggedInUser}
                selectedUser={selectedUser}
                setSelectedUser={setSelectedUser}
                handleLogout={handleLogout}
                createChat={createChat}
                onlineUsers={onlineUsers}

            />
            <div className="flex-1 flex flex-col justify-between p-4 backdrop-blur-x1 bg-white/5 
             border-white/10">
                <ChatHeader
                    user={user}
                    setSidebarOpen={setSidebarOpen}
                    isTyping={isTyping}
                    onlineUsers={onlineUsers} />

                <ChatMessages selectedUser={selectedUser}
                    messages={messages}
                    loggedInUser={loggedInUser} />

                <MessageInput selectedUser={selectedUser}
                    message={message}
                    setMessage={handleTyping}
                    handleMessageSend={handleMessageSend} />
            </div>
        </div>
    )
}

export default ChatApp