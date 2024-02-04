const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const morgan = require("morgan");
const routes = require("./routes/routes.js");

const port = process.argv[2]; // network of decentralized nodes
const dotenv = require("dotenv");
dotenv.config({ path: "./config/config.env" });

// app.use(cookieParser());
// app.use(express.json());
app.use(express.static("client/index.html"));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

app.use("/", routes);

// middleware
app.use("*", (req, res, next) => {
  res.status(404).json({ msg: "Route not found" });
});

// register multiple servers at once
app.listen(port, () => {
  console.log(`blockchain Server started on port ${port}`);
});
