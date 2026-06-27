import { v2 as cloudinary } from "cloudinary";

import dotenv from "dotenv";

dotenv.config();

cloudinary.config({
    cloud_name: process.env.Cloud_Name!,
    api_key: process.env.Api_KEY!,
    api_secret: process.env.Api_Secret!,

});
export default cloudinary;



