/** Start the tool server: node dist/main.js (or npm run dev). */
import http from "node:http";
import { handle, startupProblems } from "./server.js";

const problems = startupProblems();
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
const port = Number(process.env.PORT ?? 8787);
http.createServer((req, res) => void handle(req, res)).listen(port, () => console.log(`School fees tools listening on :${port}`));
