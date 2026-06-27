declare module "multer-storage-cloudinary" {
  import { StorageEngine } from "multer";
  import { v2 as cloudinary } from "cloudinary";

  export interface Options {
    cloudinary: typeof cloudinary;
    params?: {
      folder?: string | ((req: any, file: any) => string | Promise<string>);
      format?: string | ((req: any, file: any) => string | Promise<string>);
      public_id?: (req: any, file: any) => string | Promise<string>;
      [key: string]: any;
    };
  }

  export class CloudinaryStorage implements StorageEngine {
    constructor(options: Options);
    _handleFile(req: any, file: any, cb: any): void;
    _removeFile(req: any, file: any, cb: any): void;
  }
}
