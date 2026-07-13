import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import compression from "compression";
import responseTime from "response-time";
import helmet from "helmet";
import path from "path";
import { fileURLToPath } from "url";
import { validateEnv } from "./config/env.js";
import { connectDB } from "./config/Database.js";
import routes from "./routes/index.js";

const envConfig = validateEnv();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
global.__basedir = __dirname;

const app = express();
const allowedOrigin = envConfig.allowedOrigin;

if (envConfig.isProduction) {
  app.set("trust proxy", 1);
}

connectDB();

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
app.use(
  cors({
    credentials: true,
    origin: allowedOrigin,
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    allowedHeaders: "Origin, X-Requested-With, Content-Type, Accept, Authorization",
  })
);

app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(
  compression({
    filter: (req, res) => {
      if (res.getHeader("Content-Type") === "application/pdf") return false;
      return compression.filter(req, res);
    },
  })
);
app.use(responseTime());
app.use(cookieParser());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

app.get("/", (req, res) => {
  res.json({
    status: true,
    message: `Chettinad Thari API running on port ${process.env.PORT || 8080}`,
  });
});

app.use("/api", routes);

app.use((req, res) => {
  res.status(404).json({ status: false, message: `Not found - ${req.originalUrl}` });
});

app.use((err, req, res, next) => {
  console.error(err);
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    status: false,
    message: envConfig.isProduction ? "Internal Server Error" : err.message || "Internal Server Error",
    code: "INTERNAL_ERROR",
  });
});

// Express 4 does not catch async route errors — log them instead of crashing the process.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Frontend URL (reset links): ${envConfig.frontendUrl}`);
});
