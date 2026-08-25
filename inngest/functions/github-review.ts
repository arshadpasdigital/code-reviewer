import { inngest } from "../index";
import { octokit } from "../../src/lib/github";
import { githubPrReviewAgent } from "../../agents/github-pr-review-agent";

// // here, in event.data is send by the user and it have for now, owner, repo and pull request
export interface IEventData {
    owner:string,
    repo:string,
    pull_number:number
}


export const githubRepoReview = inngest.createFunction({id:"github-repo-review",triggers:[{
    event:"github/pullrequest.review"
}]},
    async({event,step})=>{
        const {owner, repo, pull_number} = event.data as IEventData;
        console.log("==== get the event data =====")
        console.log(event.data)
        const pullRequestInfo = await step.run("fetch-pull-request-information",async()=>{
            try {
                const pullRequestObject = await octokit.pulls.get({
                    owner,repo,pull_number
                })
                
                const pullRequestData = pullRequestObject.data;
                console.log("==== get the pullRequest Information ====");
                
                return {
                    id:pullRequestData.id,
                    title:pullRequestData.title,
                    state:pullRequestData.state,
                    number:pullRequestData.number,
                    url: pullRequestData.url,
                    diffUrl:pullRequestData.diff_url,
                    changes:pullRequestData.changed_files,
                    commits:pullRequestData.commits,
                    comments:pullRequestData.comments,
                    head:{ref: pullRequestData.head.ref, sha:pullRequestData.head.sha}
                }
            } catch (error) {
                return null;
            }
        })

        if(!pullRequestInfo){
            return {
                message:"pull request not found",
                skipped:true
            }
        }

        if(pullRequestInfo.state !="open") {
            return {
                message:"Pull request is not open, Skipping the review",
                skipped:true,
                completed:false
            }
        }

        const changes = await step.run("fetch-changes",async () => {
           const changeResult = await octokit.paginate(octokit.pulls.listFiles,{
                owner,
                repo,
                pull_number,
                per_page:100
            })
            return changeResult.map((result)=>({
                fileName:result.filename,
                status: result.status,
                changes:result.changes,
                additional:result.additions,
                deletion:result.deletions,
                privous_filename :result.previous_filename
            }))
        })
        if(changes.length ==0){
            return {
                message:"There is no changes in PR",
                skipped:true
            }
        }

        const aiResponse = await step.run("ai-analysis",async () => {
           const llmResponse =  await githubPrReviewAgent.invoke({
                messages:[{role:"user",content:`
                    Pull Request Information:
                    ${JSON.stringify(pullRequestInfo,null,2)}
                    \n\n
                    changes:
                    ${JSON.stringify(changes,null,2)}
                    `}]
            })
            return {
                llmResponse:llmResponse.structuredResponse
            }
        })

        await step.run("post-commit",async()=>{
            try {
                const commitList = await octokit.rest.pulls.listReviewComments({ owner, repo, pull_number });
                console.info('==== get the commit list ====')
                console.log(commitList)
                await octokit.issues.createComment({
                    owner,
                    repo,
                    issue_number:pull_number,
                  body: `
      ${aiResponse.llmResponse.content?.join("\n")}
    
      Critical Changes:
      ${aiResponse.llmResponse.criticalFixes?.join("\n")}
    
      Suggestion:
      ${aiResponse.llmResponse.suggestions?.join("\n")}
    `
                })
            } catch (error) {
                console.error('get error in post commit')
                console.log(error)
            }
        })
    }
)