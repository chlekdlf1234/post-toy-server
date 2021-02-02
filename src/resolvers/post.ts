import { isAuth } from "../middleware/isAuth";
import { MyContext } from "../types";
import { Arg, Ctx, Field, FieldResolver, InputType, Int, Mutation, ObjectType, Query, Resolver, Root, UseMiddleware } from "type-graphql";
import { Post } from "../entities/Post";
import { getConnection } from "typeorm";
import { UpVote } from "../entities/UpVote";
import { User } from "../entities/User";

@InputType()
class PostInput {
    @Field()
    title!: string
    @Field()
    text!: string
}
@ObjectType()
class PaginatedPosts {
    @Field(() => [Post])
    posts: Post[];
    @Field()
    hasMore: boolean;
}

@Resolver(Post)
export class PostResolver {
    @FieldResolver(() => String)
    textSnippet(
        @Root() root: Post
    ) {
        return root.text.slice(0, 50)
    }

    @FieldResolver(() => User)
    creator(
        @Root() root: Post,
        @Ctx() {userLoader} : MyContext
    ) { 
        return userLoader.load(root.creatorId);
    }

    @FieldResolver(() => Int, {nullable: true})
    async voteStatus(
        @Root() root: Post,
        @Ctx() {upVoteLoader, req} : MyContext
    ) {
        if (!req.session?.userId) {
            return null
        }
        const upVote = await upVoteLoader.load({postId: root.id, userId: req.session?.userId})
        return upVote ? upVote.value: null
    }
    
    @Mutation(() => Boolean)
    @UseMiddleware(isAuth)
    async vote(
        @Arg('postId', () => Int)
        postId: number,
        @Arg('value', () => Int)
        value: number,
        @Ctx() { req }: MyContext
    ) {
        const isUpvote = value !== -1;

        const realValue = isUpvote ? 1 : -1;

        const { userId } = req.session!;

        const upVote = await UpVote.findOne({ where: { postId, userId } })

        //이미 투표를 완료했을 경우
        if (upVote && upVote.value !== realValue) {
            await getConnection().transaction(async tm => {
                await tm.query(`
                    update up_vote
                    set value = $1
                    where "postId" = $2 and "userId" = $3
                `, [realValue, postId, userId]);

                await tm.query(`
                    update post
                    set points = points +  $1
                    where id =$2;
                `, [2 * realValue, postId])

            })
        } else if (!upVote) {
            await getConnection().transaction(async tm => {
                await tm.query(`
                    insert into up_vote ("userId", "postId", value)
                    values($1, $2, $3);
                `, [userId, postId, realValue]);

                await tm.query(`
                    update post
                    set points = points +  $1
                    where id =$2;
                `, [realValue, postId])
            })
        }

        return true
    }

    @Query(() => PaginatedPosts)
    async posts(
        @Arg('limit', () => Int)
        limit: number,
        @Arg('cursor', () => String, { nullable: true })
        cursor: string | null,
    ): Promise<PaginatedPosts> {
        const realLimit = Math.min(50, limit);

        const realLimitPlusOne = realLimit + 1;

        const replacements: any[] = [realLimitPlusOne];

        if (cursor) {
            replacements.push(new Date(parseInt(cursor)))
        }

        const posts = await getConnection().query(`
            select p.*
            from post p
            ${cursor ? `where p."createdAt" < $2` : ''}
            order by p."createdAt" DESC
            limit $1
        `, replacements)


        return { posts: posts.slice(0, realLimit), hasMore: posts.length == realLimitPlusOne };
    }

    @Query(() => Post, { nullable: true })
    post(
        @Arg('id', () => Int)
        id: number
    ): Promise<Post | undefined> {
        return Post.findOne(id);
    }

    @Mutation(() => Post)
    @UseMiddleware(isAuth)
    async createPost(
        @Arg('input')
        input: PostInput,
        @Ctx()
        { req }: MyContext
    ): Promise<Post> {
        return Post.create({
            ...input,
            creatorId: req.session!.userId
        }).save();
    }

    @Mutation(() => Post, { nullable: true })
    @UseMiddleware(isAuth)
    async updatePost(
        @Arg('id', ()=> Int)
        id: number,
        @Arg('title')
        title: string,
        @Arg('text')
        text: string,
        @Ctx()
        {req}: MyContext
    ): Promise<Post | null> {
        const result =  await getConnection()
            .createQueryBuilder()
            .update(Post)
            .set({ title, text })
            .where('id = :id and "creatorId" = :creatorId', { id, creatorId: req.session?.userId })
            .returning('*')
            .execute();
        
        return result.raw[0];
    }

    @Mutation(() => Boolean)
    @UseMiddleware(isAuth)
    async deletePost(
        @Arg('id', () => Int)
        id: number,
        @Ctx()
        { req }: MyContext
    ): Promise<boolean> {

        await Post.delete({ id, creatorId: req.session?.userId });
        return true;
    }
}