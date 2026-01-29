import { createRequestHandler } from "@react-router/express";
import express from "express";

const app = express();

// Serve static assets from build/client
app.use(express.static("build/client"));

// Handle all other requests with React Router
app.all(
  "*",
  createRequestHandler({
    build: () => import("./build/server/index.js"),
  })
);

export default app;
