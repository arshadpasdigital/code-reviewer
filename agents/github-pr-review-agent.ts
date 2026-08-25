import { createAgent, providerStrategy } from "langchain";
import { z } from "zod";
import { ChatOpenAI } from "@langchain/openai";


const githubResponseSchema = z.object({
    criticalFixes: z.array(z.string()).nullable().describe('critical fixes if any'),
    suggestions: z.array(z.string()).nullable().describe('suggestion if any'),
    content: z.array(z.string()).nullable().describe('actual content for reply'),
    event: z.enum(["APPROVE", 'COMMENT', 'REQUEST_CHANGES'])
});


export const githubPrReviewAgent = createAgent({ 
    model: "gpt-5.6-luna", 
    
    systemPrompt:`
        You are export AI code reviewer.
        you are given a pull request details with some basic information about the pull request and the changes in pull request.    
        Give me a detailed review about the code and suggest some fixes if any, your comments, etc.
        Use emojis in comments to make it natural.
    `,
    responseFormat:providerStrategy(githubResponseSchema)
 });


