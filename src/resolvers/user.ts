import argon2 from 'argon2';
import { Arg, Ctx, Field, FieldResolver, Mutation, ObjectType, Query, Resolver, Root } from "type-graphql";
import { getConnection } from "typeorm";
import { v4 } from 'uuid';
import { COOKIE_NAME, FORGET_PASSWORD_PREFIX } from "../constants";
import { User } from "../entities/User";
import { MyContext } from "../types";
import { sendEmail } from "../utils/sendEmail";
import { validateRegister } from "../utils/validateRegister";
import { UserInput } from "./UserInput";

@ObjectType()
class Error {
    @Field()
    field: String;
    @Field()
    message: String;
}

@ObjectType()
class UserResponse {
    @Field(() => [Error], { nullable: true })
    errors?: Error[];
    @Field(() => User, { nullable: true })
    user?: User;
}

@Resolver(User)
export class UserResolver {
    @FieldResolver(() => String)
    email(
        @Root() user: User,
        @Ctx() { req }: MyContext
    ) {
        if (req.session!.userId == user.id) {
            return user.email;
        }

        return "";
    }

    @Query(() => User, { nullable: true })
    async verifyLogin(
        @Ctx() { req }: MyContext
    ) {
        if (!req.session!.userId) {
            return null
        }

        const user = await User.findOne(req.session!.userId);

        return user;
    };

    @Mutation(() => UserResponse)
    async register(
        @Arg('userInput')
        userInput: UserInput,
        @Ctx()
        { req }: MyContext
    ): Promise<UserResponse> {
        const errors = validateRegister(userInput);

        if (errors) {
            return {
                errors
            };
        }

        const hashedPassword = await argon2.hash(userInput.password);

        let user;
        try {
            const result = await getConnection().createQueryBuilder().insert().into(User).values(
                {
                    username: userInput.username,
                    password: hashedPassword,
                    email: userInput.email,
                }
            ).returning('*').execute();

            user = result.raw[0];
        } catch (err) {
            return {
                errors: [{
                    field: 'username',
                    message: 'User already exist'
                }]
            }
        }

        req.session!.userId = user.id;

        return { user }
    }

    @Mutation(() => UserResponse)
    async login(
        @Arg('usernameOrEmail')
        usernameOrEmail: string,
        @Arg('password')
        password: string,
        @Ctx()
        { req }: MyContext
    ): Promise<UserResponse> {
        const user = await User.findOne(
            usernameOrEmail.includes('@') ? {
                where: {
                    email: usernameOrEmail
                }
            }
                : {
                    where: { username: usernameOrEmail }
                });

        if (!user) {
            return {
                errors: [{
                    field: 'usernameOrEmail',
                    message: 'User does not exist'
                }]
            }
        }

        const valid = await argon2.verify(user.password, password);

        if (!valid) {
            return {
                errors: [{
                    field: 'password',
                    message: 'Password is not correct'
                }]
            }
        }

        req.session!.userId = user.id;


        return { user }
    }

    @Mutation(() => Boolean)
    async logout(
        @Ctx() { req, res }: MyContext
    ) {
        const clearSession = () => {
            return new Promise((resolve) => {
                req.session?.destroy((err) => {
                    if (err) {
                        resolve(false);
                    }
                })

                res.clearCookie(COOKIE_NAME);

                resolve(true);
            })
        }

        const result = await clearSession();

        return result
    }

    @Mutation(() => Boolean)
    async forgotPassword(
        @Arg('email')
        email: string,
        @Ctx()
        { redis }: MyContext
    ) {
        const user = await User.findOne({ where: { email } });

        if (!user) {
            return true;
        }

        const token = v4();

        await redis.set(FORGET_PASSWORD_PREFIX + token, user.id, 'ex', 10000 * 60 * 60 * 3)

        await sendEmail(email,
            `<a href="http://localhost:3000/change-password/${token}">reset password </a>`
        );

        return true;
    }

    @Mutation(() => UserResponse)
    async changePassword(
        @Arg('token')
        token: string,
        @Arg('newPassword')
        newPassword: string,
        @Ctx() { redis, req }: MyContext
    ): Promise<UserResponse> {
        if (newPassword.length <= 2) {
            return {
                errors: [
                    {
                        field: 'newPassword',
                        message: 'password must be greater than 2'
                    }
                ]
            }
        }

        const key = FORGET_PASSWORD_PREFIX + token;
        const userId = await redis.get(key);

        if (!userId) {
            return {
                errors: [
                    {
                        field: 'token',
                        message: 'token expired'
                    }
                ]
            }
        }

        const userIdNum = parseInt(userId)
        const user = await User.findOne(userIdNum);

        if (!user) {
            return {
                errors: [
                    {
                        field: 'token',
                        message: 'user no longer exists'
                    }
                ]
            }
        }

        await User.update({ id: userIdNum }, {
            password: await argon2.hash(newPassword)
        })
        redis.del(key);

        req.session!.userId = user.id;

        return { user };
    }

}