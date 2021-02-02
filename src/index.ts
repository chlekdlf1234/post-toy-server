import "reflect-metadata"
import 'dotenv-safe/config'

import express from 'express'
import { ApolloServer } from 'apollo-server-express'

import { buildSchema } from 'type-graphql'

import { PostResolver } from "./resolvers/post";
import { UserResolver } from "./resolvers/user"

import Redis from 'ioredis'
import connectRedis from 'connect-redis'

import session from 'express-session'

import cors from 'cors'

import { createConnection } from "typeorm"

import { Post } from "./entities/Post"
import { User } from "./entities/User"
import { UpVote } from "./entities/UpVote";

import path from 'path'

import { MyContext } from "./types"
import { createUserLoader } from "./utils/createUserLoader";
import { createUpVoteLoader } from "./utils/createUpVoteLoader";

import { COOKIE_NAME, __prod__ } from "./constants"

const main = async () => {
    const connection = await createConnection({
        type: 'postgres',
        url: process.env.DATABASE_URL,
        logging: true,
        synchronize: __prod__? false : true,
        migrations: [path.join(__dirname, "./migrations/*")],
        entities: [Post, User, UpVote]
    });

    await connection.runMigrations();

    const app = express();

    const RedisStore = connectRedis(session)
    const redis = new Redis(process.env.REDIS_URL);

    app.set('trust proxy', 1);

    app.use(
        cors({
            origin: process.env.CORS_ORIGIN,
            credentials: true
        })
    )

    app.use(
        session({
            name: COOKIE_NAME,
            store: new RedisStore({
                client: redis,
                disableTouch: true,
            }),
            cookie: {
                maxAge: 1000 * 60 * 60 * 24 * 365 * 10,
                httpOnly: true,
                secure: __prod__,
                sameSite: 'lax',
                domain: __prod__ ? ".daildev.com": undefined
            },
            saveUninitialized: false,
            secret: process.env.SESSION_SECRET,
            resave: false,
        })
    )

    const apolloServer = new ApolloServer({
        schema: await buildSchema({
            resolvers: [PostResolver, UserResolver],
            validate: false
        }),
        context: ({ req, res }): MyContext => ({ req, res, redis, userLoader: createUserLoader(), upVoteLoader: createUpVoteLoader() })
    })

    apolloServer.applyMiddleware({
        app,
        cors: false
    });

    app.listen(parseInt(process.env.PORT), () => {
        console.log('server started on localhost:5000')
    });
}


main().catch((err) => {
    console.error(err);
});