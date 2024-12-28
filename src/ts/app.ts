// Modules
import express from "express";
import { engine } from "express-handlebars";
import http from "http";
import { join } from "path";
import { loadDatabase } from "./modules/db.js";
import routerMaster from "./routes/master.js";
import config from "./modules/config.js";
import cookieParser from "cookie-parser";
import { processAuthToken } from "./routes/middleware/auth.js";
import processError from "./routes/middleware/error.js";

// Load DB
await loadDatabase();

// Initiate server
console.info("Starting server...");

const app = express();
const server = http.createServer(app);

// Routing Setup
app.engine(
  "hbs",
  engine({
    extname: ".hbs",
    defaultLayout: "main",
    layoutsDir: join(process.cwd(), "./web/views/layouts"),
    partialsDir: join(process.cwd(), "./web/views/partials"),
  })
);
app.set("view engine", "hbs");
app.set("views", join(process.cwd(), "./web/views"));
app.use(express.static(join(process.cwd(), "./web/public")));

// Middleware
app.use(cookieParser());
app.use(processAuthToken);

// Routes
app.use(routerMaster);

// Errors
app.use(processError);

// Start server
server.listen(config.port, () => {
  console.info(`Server started at *:${config.port}`);
});
