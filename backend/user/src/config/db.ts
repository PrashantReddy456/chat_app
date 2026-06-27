import mongoose from "mongoose";

const connectDb  = async()=>{
    const url = process.env.MONGO_URI;

    if(!url){
        throw new Error("mongo uri is not defined");
    }

    try {
        await mongoose.connect(url,{
            dbName:"Chatappmicroserviceapp",
        });
        console.log("connected to mongodb");
    } catch (error) {
        console.error("failed to connect ",error);
        process.exit(1);
    }
}

export default connectDb;