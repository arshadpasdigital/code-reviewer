import type { Octokit } from "octokit";

const getRepoId = async (octokit:Octokit,repoOwner: string, repoName: string) => {
    const { data } = await octokit.rest.repos.get({
        owner: repoOwner,
        repo: repoName
    });
    const repoId = data.id;
    return repoId;
}

export async function createCodespace(octokit:Octokit,repoOwner: string, repoName: string, branch: string = "main") {
    try {
        const { data } = await octokit.rest.codespaces.createForAuthenticatedUser({
            repository_id: await getRepoId(octokit,repoOwner, repoName), // Helper to get ID
            ref: branch,
        });
        return data;
    } catch (error) {
        console.error("Error creating codespace:", error);
        return null;
    }
}

export async function deleteCodespace(octokit:Octokit,codeSapceName: string) {
    try {
        await octokit.rest.codespaces.deleteForAuthenticatedUser({
            codespace_name: codeSapceName
        })
        return true
    } catch (error) {
        console.error("Error in closing codespace:", error);
        throw error;
    }
}

export async function runTestsInCodespace(octokit:Octokit,name:string){

}