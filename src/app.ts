import 'dotenv/config'
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { serve } from "inngest/express";
import { inngest } from '../inngest';
import {functions} from '../inngest/functions/index'
import { App, createNodeMiddleware } from 'octokit';

// const githubApp = new App({
//   appId: process.env.APP_ID,
//   privateKey: process.env.PRIVATE_KEY,
//   webhooks: {
//     secret: process.env.WEBHOOK_SECRET,
//   },
// });


const app = express();

// const middleware = createNodeMiddleware(githubApp.webhooks, { 
//   path: '/api/webhook' 
// });
// app.use(middleware);

app.use(cors());
app.use(helmet());
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
