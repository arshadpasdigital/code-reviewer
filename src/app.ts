import 'dotenv/config'
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { serve } from "inngest/express";
import { inngest } from '../inngest';
import {functions} from '../inngest/functions/index'
import { createNodeMiddleware } from "@octokit/webhooks";
import { githubApp } from './lib/github';
import "./config/webhook";

const app = express();
const webhookMiddleware = createNodeMiddleware(githubApp.webhooks, { path: "/webhooks/github" });


app.use(cors());
app.use(helmet());
app.use(webhookMiddleware);
app.use(express.json());
app.use(express.urlencoded({extended:true}))
app.use(morgan("combined"));

app.use("/api/inngest", serve({ client: inngest, functions }));
app.get("/health", (_request, response) => {
  response.status(200).json({
    status: "ok",
  });
});

export default app;
