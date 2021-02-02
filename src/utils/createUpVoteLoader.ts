import DataLoader from "dataloader";
import { UpVote } from "../entities/UpVote";

export const createUpVoteLoader = () =>
    new DataLoader<{ postId: number, userId: number }, UpVote | null>(async (keys) => {
        const upVotes = await UpVote.findByIds(keys as any);

        const upVoteIdToUpVote: Record<string, UpVote> = {};

        upVotes.forEach(u => {
            upVoteIdToUpVote[`${u.userId} | ${u.postId}`] = u;
        })

        return keys.map((key) => upVoteIdToUpVote[`${key.userId} | ${key.postId}`]);
    });
