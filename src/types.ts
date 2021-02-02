import { Request, Response } from "express"
import { Redis } from "ioredis";
import { createUpVoteLoader } from "./utils/createUpVoteLoader";
import { createUserLoader } from "./utils/createUserLoader";

export type MyContext = {
    req: Request;
    res: Response;
    redis: Redis;
    userLoader: ReturnType<typeof createUserLoader>;
    upVoteLoader: ReturnType<typeof createUpVoteLoader>;
}